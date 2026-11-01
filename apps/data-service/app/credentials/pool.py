"""
Credential selection and rotation.

A provider may hold several keys. Picking between them is what turns two free
tiers into twice the ceiling, and it is only correct if each key's usage is
tracked separately — which is why budgets live on the credential rather than
on the provider.

Selection order: usable credentials first, then by configured priority, then
by remaining headroom. Priority lets a paid key be preferred while free ones
stay as overflow; headroom breaks ties so load spreads instead of draining one
key and then discovering the next is also nearly spent.

Reservation is two-phase. `acquire` checks affordability and charges the
budget up front, because a request that has been sent has been counted by the
provider whether or not we liked the answer. `refund` exists for the narrow
case where the call was abandoned before being made — not for calls that
failed upstream.
"""
from __future__ import annotations

import logging
import threading
from typing import Dict, Iterable, List, Optional

from .models import BudgetKind, Credential, CredentialState

logger = logging.getLogger(__name__)


class NoCredentialAvailable(RuntimeError):
    """Every credential for this provider is spent, expired or missing."""

    def __init__(self, provider: str, reasons: Dict[str, str]) -> None:
        self.provider = provider
        self.reasons = reasons
        detail = ", ".join(f"{k}: {v}" for k, v in reasons.items()) or "none configured"
        super().__init__(f"no usable credential for {provider} ({detail})")


class CredentialLease:
    """A charged credential. Refund only if the call never happened."""

    def __init__(
        self,
        credential: Credential,
        cost: Optional[Dict[BudgetKind, int]],
        subject: Optional[str],
    ) -> None:
        self.credential = credential
        self._cost = cost
        self._subject = subject
        self._refunded = False

    @property
    def secret(self) -> str:
        return self.credential.secret

    @property
    def id(self) -> str:
        return self.credential.id

    def refund(self) -> None:
        if not self._refunded:
            self._refunded = True
            self.credential.refund(self._cost)

    def __enter__(self) -> "CredentialLease":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


class CredentialPool:
    """The credentials for one provider."""

    def __init__(self, provider: str, credentials: Optional[Iterable[Credential]] = None):
        self.provider = provider
        self._lock = threading.Lock()
        self._credentials: List[Credential] = list(credentials or [])

    def add(self, credential: Credential) -> None:
        with self._lock:
            self._credentials.append(credential)

    @property
    def credentials(self) -> List[Credential]:
        with self._lock:
            return list(self._credentials)

    def usable(self) -> List[Credential]:
        return [c for c in self.credentials if c.is_usable]

    def acquire(
        self,
        cost: Optional[Dict[BudgetKind, int]] = None,
        subject: Optional[str] = None,
    ) -> CredentialLease:
        """
        Reserve the best credential that can afford this call.

        `subject` is the instrument the call is about, needed for budgets that
        meter distinct symbols rather than requests.
        """
        candidates = [
            c for c in self.credentials
            if c.is_usable and c.can_afford(cost, subject)
        ]

        if not candidates:
            raise NoCredentialAvailable(self.provider, self._reasons())

        # Lower priority number wins; more headroom breaks the tie.
        candidates.sort(key=lambda c: (c.priority, -c.headroom()))
        chosen = candidates[0]
        chosen.charge(cost, subject)

        if len(self.credentials) > 1:
            logger.debug(
                "Credential %s selected for %s (headroom %.2f of %d configured)",
                chosen.id, self.provider, chosen.headroom(), len(self.credentials),
            )
        return CredentialLease(chosen, cost, subject)

    def _reasons(self) -> Dict[str, str]:
        """Why each credential was unavailable, for the error message."""
        out: Dict[str, str] = {}
        for c in self.credentials:
            state = c.state()
            if state is CredentialState.ACTIVE:
                out[c.id] = "budget insufficient for this call"
            elif state is CredentialState.EXPIRED:
                days = c.expires_in_days()
                out[c.id] = f"expired {abs(days) if days is not None else '?'} days ago"
            else:
                out[c.id] = state.value
        return out

    def snapshot(self) -> List[Dict[str, object]]:
        return [c.snapshot() for c in self.credentials]

    def expiring_within(self, days: int) -> List[Credential]:
        """Credentials that lapse soon — a trial key going quiet is avoidable."""
        out = []
        for c in self.credentials:
            remaining = c.expires_in_days()
            if remaining is not None and 0 <= remaining <= days:
                out.append(c)
        return out


# ----------------------------------------------------------------------
# Registry
# ----------------------------------------------------------------------

_pools: Dict[str, CredentialPool] = {}
_lock = threading.Lock()


def register_pool(pool: CredentialPool) -> None:
    with _lock:
        _pools[pool.provider] = pool


def get_pool(provider: str) -> CredentialPool:
    with _lock:
        pool = _pools.get(provider)
        if pool is None:
            pool = CredentialPool(provider)
            _pools[provider] = pool
        return pool


def all_pools() -> Dict[str, CredentialPool]:
    with _lock:
        return dict(_pools)


def reset_all() -> None:
    with _lock:
        _pools.clear()
