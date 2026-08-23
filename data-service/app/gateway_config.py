"""
Provider registry, routing and cache configuration.

Loaded from config/providers.toml and validated on import, so a malformed
edit fails at startup with a field path rather than at the moment a provider
is first called.

Two things live here that used to be scattered through the adapters: the
per-provider budget, which each of them had hard-coded differently, and the
routing chains, which were a dict at the top of router.py. Both change on the
provider's schedule rather than ours, which is the argument for them being
data.

Secrets are not in the file. Each provider names the Settings field carrying
its key (`api_key_setting`), and `resolve_api_key` reads it, so the config is
safe to commit and rotating a key stays a .env edit.
"""
from __future__ import annotations

import logging
import tomllib
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, ValidationError, field_validator

from .config import get_settings
from .credentials import (
    Budget, BudgetKind, Credential, CredentialPool, Window, register_pool,
)

logger = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "providers.toml"

# Usage contexts, most restrictive first. A provider may be used only when the
# gateway's active context appears in its allowed_usage.
USAGE_CONTEXTS = ("internal_research", "commercial_display", "redistribution")


class Limits(BaseModel):
    """A provider's self-imposed budget."""

    requests_per_minute: Optional[int] = None
    requests_per_hour: Optional[int] = None
    requests_per_day: Optional[int] = None
    concurrency: int = 4
    min_interval_seconds: float = 0.0

    # Whether these numbers were confirmed against the live API or the
    # provider's account, as opposed to copied from documentation. False is
    # not a defect to hide — an unverified limit that is really lower is how
    # you get blocked.
    verified: bool = False
    reviewed_at: str = ""
    source: str = ""

    @field_validator("concurrency")
    @classmethod
    def _positive_concurrency(cls, v: int) -> int:
        if v < 1:
            raise ValueError("concurrency must be at least 1")
        return v

    def windows(self) -> Dict[str, tuple[int, int]]:
        """Shape the budget for ProviderLimiter."""
        out: Dict[str, tuple[int, int]] = {}
        if self.requests_per_minute:
            out["minute"] = (self.requests_per_minute, 60)
        if self.requests_per_hour:
            out["hour"] = (self.requests_per_hour, 3600)
        if self.requests_per_day:
            out["day"] = (self.requests_per_day, 86400)
        return out


class BudgetConfig(BaseModel):
    """One metered limit on one credential."""

    kind: str = "requests"
    limit: int
    window: str = "day"

    @field_validator("kind")
    @classmethod
    def _known_kind(cls, v: str) -> str:
        if v not in {k.value for k in BudgetKind}:
            raise ValueError(
                f"unknown budget kind '{v}'; expected one of "
                f"{sorted(k.value for k in BudgetKind)}"
            )
        return v

    @field_validator("window")
    @classmethod
    def _known_window(cls, v: str) -> str:
        if v not in {w.value for w in Window}:
            raise ValueError(
                f"unknown window '{v}'; expected one of "
                f"{sorted(w.value for w in Window)}"
            )
        return v

    def to_budget(self) -> Budget:
        return Budget(kind=BudgetKind(self.kind), limit=self.limit, window=Window(self.window))


class CredentialConfig(BaseModel):
    """A single key, its budgets and how long it is good for."""

    id: str
    secret_ref: str = ""
    enabled: bool = True
    priority: int = 0
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    notes: str = ""
    budgets: List[BudgetConfig] = Field(default_factory=list)

    @field_validator("valid_from", "valid_until")
    @classmethod
    def _iso_date(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ""):
            return None
        try:
            date.fromisoformat(v)
        except ValueError as exc:
            raise ValueError(f"expected an ISO date (YYYY-MM-DD), got {v!r}") from exc
        return v

    def to_credential(self, provider: str) -> Credential:
        return Credential(
            id=f"{provider}/{self.id}",
            provider=provider,
            secret_ref=self.secret_ref,
            budgets=[b.to_budget() for b in self.budgets],
            valid_from=date.fromisoformat(self.valid_from) if self.valid_from else None,
            valid_until=date.fromisoformat(self.valid_until) if self.valid_until else None,
            enabled=self.enabled,
            priority=self.priority,
            notes=self.notes,
        )


class CircuitBreakerConfig(BaseModel):
    window: int = 20
    failure_ratio: float = 0.5
    open_seconds: int = 60


class ProviderConfig(BaseModel):
    enabled: bool = True
    allowed_usage: List[str] = Field(default_factory=lambda: ["internal_research"])
    capabilities: List[str] = Field(default_factory=list)
    markets: List[str] = Field(default_factory=list)
    api_key_setting: str = ""
    notes: str = ""
    limits: Limits = Field(default_factory=Limits)
    circuit_breaker: CircuitBreakerConfig = Field(default_factory=CircuitBreakerConfig)
    # Declared keys. A provider with none and an api_key_setting gets an
    # implicit single credential built from that setting, so existing
    # configuration keeps working.
    credentials: List[CredentialConfig] = Field(default_factory=list)

    @field_validator("allowed_usage")
    @classmethod
    def _known_usage(cls, v: List[str]) -> List[str]:
        unknown = [u for u in v if u not in USAGE_CONTEXTS]
        if unknown:
            raise ValueError(
                f"unknown usage context(s) {unknown}; expected any of {list(USAGE_CONTEXTS)}"
            )
        return v

    def permits(self, usage_context: str) -> bool:
        return usage_context in self.allowed_usage


class GatewaySettings(BaseModel):
    deny_direct_provider_access: bool = True
    default_deadline_ms: int = 5000
    usage_context: str = "internal_research"

    @field_validator("usage_context")
    @classmethod
    def _known_context(cls, v: str) -> str:
        if v not in USAGE_CONTEXTS:
            raise ValueError(f"unknown usage_context '{v}'; expected {list(USAGE_CONTEXTS)}")
        return v


class CacheConfig(BaseModel):
    ohlcv_daily_ttl_seconds: int = 3600
    today_coverage_ttl_seconds: int = 300
    max_series: int = 512


class GatewayConfig(BaseModel):
    gateway: GatewaySettings = Field(default_factory=GatewaySettings)
    providers: Dict[str, ProviderConfig] = Field(default_factory=dict)
    routing: Dict[str, object] = Field(default_factory=dict)
    cache: CacheConfig = Field(default_factory=CacheConfig)

    # -- routing helpers ----------------------------------------------

    def routes(self) -> Dict[str, List[str]]:
        """Per-source chains, excluding the `default` key."""
        return {
            source: list(chain)
            for source, chain in self.routing.items()
            if source != "default" and isinstance(chain, list)
        }

    def default_chain(self) -> List[str]:
        chain = self.routing.get("default")
        return list(chain) if isinstance(chain, list) else []

    # -- provider helpers ---------------------------------------------

    def usable_providers(self) -> List[str]:
        """Enabled providers whose licence posture permits the active context."""
        context = self.gateway.usage_context
        return [
            name
            for name, cfg in self.providers.items()
            if cfg.enabled and cfg.permits(context)
        ]

    def unverified_limits(self) -> List[str]:
        """Providers whose budget has not been confirmed against the source."""
        return [n for n, c in self.providers.items() if not c.limits.verified]


def build_credential_pools(config: "GatewayConfig") -> None:
    """
    Turn declared credentials into pools with their secrets bound.

    A provider that declares none but names an api_key_setting gets one
    implicit credential carrying the provider-level budget, so configuration
    written before credentials existed keeps working unchanged.
    """
    settings = get_settings()

    for name, cfg in config.providers.items():
        declared = list(cfg.credentials)

        if not declared:
            budgets = []
            if cfg.limits.requests_per_minute:
                budgets.append(BudgetConfig(kind="requests", limit=cfg.limits.requests_per_minute, window="minute"))
            if cfg.limits.requests_per_hour:
                budgets.append(BudgetConfig(kind="requests", limit=cfg.limits.requests_per_hour, window="hour"))
            if cfg.limits.requests_per_day:
                budgets.append(BudgetConfig(kind="requests", limit=cfg.limits.requests_per_day, window="day"))
            declared = [CredentialConfig(
                id="default",
                secret_ref=cfg.api_key_setting,
                budgets=budgets,
                notes="Implicit credential derived from the provider-level limits.",
            )]

        pool = CredentialPool(name)
        for cred_cfg in declared:
            credential = cred_cfg.to_credential(name)
            if credential.secret_ref:
                credential.bind_secret(getattr(settings, credential.secret_ref.lower(), "") or "")
            pool.add(credential)
        register_pool(pool)

        expiring = pool.expiring_within(30)
        for cred in expiring:
            logger.warning(
                "Credential %s expires in %d day(s) — a lapsed key presents as "
                "authentication failures, not as an expiry",
                cred.id, cred.expires_in_days(),
            )

        unusable = [c for c in pool.credentials if not c.is_usable]
        if unusable and len(unusable) == len(pool.credentials):
            logger.warning(
                "No usable credential for %s: %s",
                name, {c.id: c.state().value for c in unusable},
            )


def resolve_api_key(name: str) -> str:
    """Read a provider's key from Settings, via the field its config names."""
    cfg = load_config().providers.get(name)
    if cfg is None or not cfg.api_key_setting:
        return ""
    return getattr(get_settings(), cfg.api_key_setting, "") or ""


@lru_cache
def load_config(path: Optional[str] = None) -> GatewayConfig:
    """
    Parse and validate the config, once per process.

    A missing file is tolerated so the service still starts on a fresh
    checkout, but a malformed one is not: silently falling back to defaults
    would mean running with limits nobody chose.
    """
    config_path = Path(path) if path else _CONFIG_PATH

    if not config_path.exists():
        logger.warning(
            "No provider config at %s — falling back to built-in defaults", config_path
        )
        return GatewayConfig()

    with config_path.open("rb") as fh:
        raw = tomllib.load(fh)

    try:
        config = GatewayConfig.model_validate(raw)
    except ValidationError as exc:
        raise RuntimeError(f"Invalid provider config at {config_path}:\n{exc}") from exc

    unverified = config.unverified_limits()
    if unverified:
        logger.warning(
            "Rate limits not verified against the provider for: %s — these are "
            "documentation figures, and being wrong about them means being blocked",
            ", ".join(sorted(unverified)),
        )
    build_credential_pools(config)

    logger.info(
        "Loaded provider config: %d provider(s), usage_context=%s",
        len(config.providers), config.gateway.usage_context,
    )
    return config
