"""
Reading credentials out of the database.

The table is owned by Prisma — the web app defines it and will eventually
offer a UI for it — so this side only reads. One schema owner avoids two
migration systems disagreeing about one table, which is the failure mode worth
designing against here.

Falling back is deliberate. A credential in the database wins, but a provider
with no row still works from its .env setting, so this can be adopted one
provider at a time and a database being briefly unreachable degrades to the
previous behaviour instead of taking market data down with it.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from .crypto import CredentialCryptoError, decrypt, is_configured
from .models import Budget, BudgetKind, Credential, Window

logger = logging.getLogger(__name__)

_SELECT = """
    SELECT provider, label, "secretCiphertext", enabled, priority,
           "validFrom", "validUntil", budgets, notes
    FROM "ProviderCredential"
    WHERE enabled = true
    ORDER BY provider, priority, label
"""


def _as_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _parse_budgets(raw: Any) -> List[Budget]:
    """
    Turn the stored JSON into budgets, skipping anything malformed.

    A bad budget entry must not take the whole credential out of service: the
    key still works, and dropping one limit is safer than dropping the key that
    is currently serving traffic. It is logged loudly instead.
    """
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Credential budgets are not valid JSON; ignoring them")
            return []

    if not isinstance(raw, list):
        return []

    out: List[Budget] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        try:
            out.append(
                Budget(
                    kind=BudgetKind(entry.get("kind", "requests")),
                    limit=int(entry["limit"]),
                    window=Window(entry.get("window", "day")),
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Skipping malformed budget %r: %s", entry, exc)
    return out


def load_credentials(database_url: str) -> Dict[str, List[Credential]]:
    """
    Read every enabled credential, grouped by provider.

    Returns an empty mapping rather than raising when the database or the
    encryption key is unavailable — the caller falls back to .env, and market
    data staying up matters more than credentials coming from the newer place.
    """
    if not database_url:
        return {}

    if not is_configured():
        logger.warning(
            "Credentials are stored encrypted but CREDENTIAL_ENCRYPTION_KEY is "
            "not set; falling back to .env credentials"
        )
        return {}

    try:
        import psycopg
    except ImportError:  # pragma: no cover - dependency is declared
        logger.warning("psycopg is not installed; cannot read stored credentials")
        return {}

    rows: List[tuple] = []
    try:
        with psycopg.connect(database_url, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                cur.execute(_SELECT)
                rows = cur.fetchall()
    except Exception as exc:
        logger.warning(
            "Could not read stored credentials (%s); falling back to .env", exc
        )
        return {}

    grouped: Dict[str, List[Credential]] = {}
    for (provider, label, ciphertext, enabled, priority,
         valid_from, valid_until, budgets, notes) in rows:
        try:
            secret = decrypt(ciphertext)
        except CredentialCryptoError as exc:
            # Named but not skipped silently: an undecryptable row is a real
            # problem, and it is better seen than quietly missing.
            logger.error(
                "Credential %s/%s could not be decrypted (%s); skipping it",
                provider, label, exc,
            )
            continue

        credential = Credential(
            id=f"{provider}/{label}",
            provider=provider,
            secret_ref="",              # the value came from storage, not settings
            budgets=_parse_budgets(budgets),
            valid_from=_as_date(valid_from),
            valid_until=_as_date(valid_until),
            enabled=bool(enabled),
            priority=int(priority or 0),
            notes=notes or "",
        )
        credential.bind_secret(secret)
        grouped.setdefault(provider, []).append(credential)

    if grouped:
        logger.info(
            "Loaded %d stored credential(s) across %d provider(s)",
            sum(len(v) for v in grouped.values()), len(grouped),
        )
    return grouped
