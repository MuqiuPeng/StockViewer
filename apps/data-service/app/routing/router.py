"""
Capability-aware provider routing.

DATA_PROVIDER used to pick one provider for everything, which forced a choice
nobody should have to make: Tiingo carries nineteen years of A-share history
but no Hong Kong, indices, ETFs or futures, so selecting it silently broke
nine of the thirteen data sources. Routing per source lets each provider do
what it is good at.

How a request is resolved
-------------------------
1. Take the candidate chain for the data source, falling back to the default
   chain when none is configured.
2. Drop providers that do not carry that source. This is a hard filter, not a
   preference: asking anyway returns UNSUPPORTED_SOURCE and, on a metered API,
   may still be billed.
3. Try what is left in order. A provider that is out of budget or failing is
   passed over rather than retried, and the next one is tried.
4. Report which provider answered and, when it was not the first choice, why.

Chains, licence posture and budgets come from config/providers.toml, so
changing which provider leads a market is a config edit rather than a code
change. A provider whose allowed_usage excludes the gateway's active
usage_context is filtered out here — Tiingo's Starter data is internal-use
only, so flipping the deployment to commercial_display must lose it rather
than quietly keep serving it.

A provider whose circuit is open is skipped without being called. That is
where most of the wall-clock saving is: a provider refusing connections costs
a full socket timeout per request otherwise, and routing has to wait it out
before moving on.

What this does not do yet
-------------------------
No scoring. The chain order encodes the preference, which for a handful of
providers is honest and readable.

Fallback is only allowed between providers serving the same request. Nothing
here degrades an adjusted series into a raw one, or a real-time quote into a
delayed one, to make a fallback succeed.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from ..gateway_config import load_config
from ..limits import QuotaExhausted
from ..providers.registry import get_provider, list_providers
from ..resilience import BreakerConfig, CircuitOpen, get_breaker

logger = logging.getLogger(__name__)


# Fallback chains, used only when config/providers.toml is absent. The real
# table lives there; these exist so a fresh checkout still starts.
#
# Tiingo leads for the two markets it carries: it returns history back to 2007
# where Alpha Vantage's free tier stops at 100 bars, and it does not share an
# upstream with EastMoney, so an EastMoney block does not take it down too.
# EastMoney is the only provider for everything else.
DEFAULT_ROUTES: Dict[str, List[str]] = {
    "cn.stock": ["tiingo", "eastmoney", "alphavantage"],
    "us.stock": ["tiingo", "eastmoney", "alphavantage"],
    "cn.stock.b": ["eastmoney"],
    "cn.stock.cdr": ["eastmoney"],
    "hk.stock": ["eastmoney"],
    "cn.index": ["eastmoney"],
    "hk.index": ["eastmoney"],
    "us.index": ["eastmoney"],
    "global.index": ["eastmoney"],
    "cn.etf": ["eastmoney"],
    "cn.lof": ["eastmoney"],
    "cn.futures": ["eastmoney"],
    "global.futures": ["eastmoney"],
}

# Used for sources with no explicit chain, and for the listing endpoints.
DEFAULT_CHAIN = ["eastmoney", "tiingo", "alphavantage"]

# Errors that mean "this provider cannot answer, try the next one" rather than
# "the request is wrong". A bad symbol is the caller's problem and must not be
# re-asked of every provider in turn.
_FALLBACK_CODES = {"UNSUPPORTED_SOURCE", "FETCH_ERROR", "NO_DATA"}


@dataclass
class Attempt:
    provider: str
    ok: bool
    reason: Optional[str] = None


@dataclass
class RouteResult:
    """A provider's answer plus how routing arrived at it."""

    result: Dict[str, Any]
    provider: Optional[str]
    attempts: List[Attempt] = field(default_factory=list)

    @property
    def fallback_used(self) -> bool:
        return len([a for a in self.attempts if not a.ok]) > 0 and self.provider is not None

    @property
    def fallback_reason(self) -> Optional[str]:
        failed = [a for a in self.attempts if not a.ok]
        if not failed or self.provider is None:
            return None
        first = failed[0]
        return f"{first.provider}: {first.reason}"

    def provenance(self) -> Dict[str, Any]:
        return {
            "provider": self.provider,
            "fallback_used": self.fallback_used,
            "fallback_reason": self.fallback_reason,
            "attempted": [a.provider for a in self.attempts],
        }


class ProviderRouter:
    """Resolves a request to a provider, trying a chain in order."""

    def __init__(
        self,
        routes: Optional[Dict[str, List[str]]] = None,
        default_chain: Optional[List[str]] = None,
    ) -> None:
        self._routes = routes if routes is not None else DEFAULT_ROUTES
        self._default_chain = (
            default_chain if default_chain is not None else DEFAULT_CHAIN
        )

    def chain_for(self, data_source: Optional[str]) -> List[str]:
        """
        The configured chain, filtered to providers that are registered,
        enabled, and licensed for the active usage context.

        The licence filter is a hard one: Tiingo's Starter data is
        internal-use only, so a deployment that flips usage_context to
        commercial_display must lose it rather than quietly keep serving it.
        """
        registered = set(list_providers())
        usable = set(load_config().usable_providers())
        raw = self._routes.get(data_source or "", self._default_chain)
        return [n for n in raw if n in registered and n in usable]

    def candidates(self, data_source: Optional[str]) -> List[str]:
        """The chain, with providers that do not carry the source removed."""
        out: List[str] = []
        for name in self.chain_for(data_source):
            if data_source is None:
                out.append(name)
                continue
            try:
                if get_provider(name).supports(data_source):
                    out.append(name)
            except Exception as exc:
                logger.warning("Skipping provider %s: %s", name, exc)
        return out

    @staticmethod
    def _breaker_for(provider: str, capability: str):
        cfg = load_config().providers.get(provider)
        breaker_cfg = None
        if cfg is not None:
            breaker_cfg = BreakerConfig(
                window=cfg.circuit_breaker.window,
                failure_ratio=cfg.circuit_breaker.failure_ratio,
                open_seconds=cfg.circuit_breaker.open_seconds,
            )
        return get_breaker(provider, capability, breaker_cfg)

    def execute(
        self,
        call: Callable[[Any], Dict[str, Any]],
        *,
        data_source: Optional[str] = None,
        capability: str = "ohlcv",
    ) -> RouteResult:
        """
        Run `call` against each candidate until one succeeds.

        `call` receives a provider instance and returns the usual provider
        dict. Errors that indicate a wrong request, rather than an unavailable
        provider, stop the chain immediately.
        """
        attempts: List[Attempt] = []
        names = self.candidates(data_source)

        if not names:
            return RouteResult(
                result={
                    "success": False,
                    "error": (
                        f"No configured provider carries '{data_source}'. "
                        f"Registered: {', '.join(sorted(list_providers()))}."
                    ),
                    "error_code": "CAPABILITY_UNAVAILABLE",
                },
                provider=None,
                attempts=attempts,
            )

        last: Dict[str, Any] = {}
        for name in names:
            breaker = self._breaker_for(name, capability)
            if not breaker.allow():
                attempts.append(
                    Attempt(name, False, f"circuit open, retry in {breaker.retry_in()}s")
                )
                continue

            try:
                provider = get_provider(name)
                result = call(provider)
            except CircuitOpen as exc:
                attempts.append(Attempt(name, False, str(exc)))
                continue
            except QuotaExhausted as exc:
                # Being out of budget is not the provider failing, so this
                # deliberately does not touch the breaker.
                attempts.append(Attempt(name, False, f"quota: {exc}"))
                logger.info("Routing past %s for %s: %s", name, data_source, exc)
                continue
            except Exception as exc:
                breaker.record_failure()
                attempts.append(Attempt(name, False, f"error: {exc}"))
                logger.warning("Provider %s raised for %s: %s", name, data_source, exc)
                last = {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}
                continue

            if result.get("success"):
                breaker.record_success()
                attempts.append(Attempt(name, True))
                return RouteResult(result=result, provider=name, attempts=attempts)

            code = result.get("error_code", "")
            # Only upstream trouble counts against the provider. A market it
            # does not carry, or a symbol that does not exist, says nothing
            # about its health and must not trip the breaker.
            if code == "FETCH_ERROR":
                breaker.record_failure()
            attempts.append(Attempt(name, False, f"{code}: {result.get('error')}"))
            last = result

            if code not in _FALLBACK_CODES:
                # A malformed request will fail identically everywhere; asking
                # the rest of the chain only burns budget.
                break

        return RouteResult(result=last, provider=None, attempts=attempts)


_router: Optional[ProviderRouter] = None


def get_router() -> ProviderRouter:
    """The process-wide router, built from config/providers.toml."""
    global _router
    if _router is None:
        config = load_config()
        _router = ProviderRouter(
            routes=config.routes() or None,
            default_chain=config.default_chain() or None,
        )
    return _router
