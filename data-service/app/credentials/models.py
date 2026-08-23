"""
What a credential is and what limits it carries.

A key is not just a string. Each one comes with its own budgets, and those
budgets are not all the same shape:

- **requests** — the familiar "25 per day"
- **credits** — where endpoints cost different amounts, so a request is not a
  unit of anything (Twelve Data charges per symbol and per endpoint)
- **bytes** — Tiingo's free tier meters 1 GB a month, which nothing here was
  tracking
- **symbols** — Tiingo also caps *distinct* symbols per month at 500, a limit
  you cannot see coming by counting requests

They also expire. A trial key that lapsed presents as a run of authentication
failures, and without a recorded validity period nobody connects the two.

Validity is evaluated in UTC, the same clock the budget windows roll on. That
is worth stating because it is visible: set valid_until to "today" from a
UTC+10 machine and the key stops at 10am local, not at midnight.

And there can be more than one per provider. Two Alpha Vantage keys are two
budgets of 25, not one of 50 shared — which only works if usage is tracked per
credential rather than per provider. That is also the cheapest way to raise an
effective ceiling: rotate onto the key that still has headroom.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from enum import Enum
from typing import Dict, List, Optional, Set


class BudgetKind(str, Enum):
    REQUESTS = "requests"
    CREDITS = "credits"
    BYTES = "bytes"
    SYMBOLS = "symbols"     # distinct instruments touched, not calls made


class Window(str, Enum):
    MINUTE = "minute"
    HOUR = "hour"
    DAY = "day"
    MONTH = "month"
    LIFETIME = "lifetime"   # trial totals that never reset


_WINDOW_SECONDS = {
    Window.MINUTE: 60,
    Window.HOUR: 3600,
    Window.DAY: 86400,
    Window.MONTH: 2_592_000,   # 30 days; calendar months are handled below
}


class CredentialState(str, Enum):
    ACTIVE = "active"
    EXHAUSTED = "exhausted"   # a budget is spent, will recover
    EXPIRED = "expired"       # past valid_until, will not recover
    NOT_YET_VALID = "not_yet_valid"
    DISABLED = "disabled"     # switched off by configuration
    MISSING_SECRET = "missing_secret"


@dataclass
class Budget:
    """One metered limit on one credential."""

    kind: BudgetKind
    limit: int
    window: Window

    def __post_init__(self) -> None:
        if self.limit < 0:
            raise ValueError("budget limit cannot be negative")

    @property
    def key(self) -> str:
        return f"{self.kind.value}/{self.window.value}"


@dataclass
class _Counter:
    """Usage of one budget, reset on its own window boundary."""

    budget: Budget
    used: int = 0
    distinct: Set[str] = field(default_factory=set)
    period: str = ""

    def _period_key(self, now: float) -> str:
        if self.budget.window is Window.LIFETIME:
            return "lifetime"
        if self.budget.window is Window.MONTH:
            # Calendar month, not a rolling 30 days: providers bill on the
            # calendar and a rolling window would drift out of step with them.
            return datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m")
        seconds = _WINDOW_SECONDS[self.budget.window]
        return str(int(now // seconds))

    def _roll(self, now: float) -> None:
        period = self._period_key(now)
        if period != self.period:
            self.period = period
            self.used = 0
            self.distinct.clear()

    def remaining(self, now: float) -> int:
        self._roll(now)
        return max(0, self.budget.limit - self.used)

    def would_exceed(self, now: float, amount: int, subject: Optional[str]) -> bool:
        self._roll(now)
        if self.budget.kind is BudgetKind.SYMBOLS:
            # Re-touching a symbol already counted this period is free.
            if subject is not None and subject in self.distinct:
                return False
            return len(self.distinct) + 1 > self.budget.limit
        return self.used + amount > self.budget.limit

    def charge(self, now: float, amount: int, subject: Optional[str]) -> None:
        self._roll(now)
        if self.budget.kind is BudgetKind.SYMBOLS:
            if subject is not None:
                self.distinct.add(subject)
                self.used = len(self.distinct)
            return
        self.used += amount

    def refund(self, amount: int) -> None:
        if self.budget.kind is BudgetKind.SYMBOLS:
            return          # a symbol once seen stays seen
        self.used = max(0, self.used - amount)

    def resets_in(self, now: float) -> Optional[int]:
        if self.budget.window is Window.LIFETIME:
            return None
        if self.budget.window is Window.MONTH:
            dt = datetime.fromtimestamp(now, timezone.utc)
            year, month = (dt.year + 1, 1) if dt.month == 12 else (dt.year, dt.month + 1)
            nxt = datetime(year, month, 1, tzinfo=timezone.utc).timestamp()
            return int(nxt - now)
        seconds = _WINDOW_SECONDS[self.budget.window]
        return int(seconds - (now % seconds))


@dataclass
class Credential:
    """One key, its budgets and its validity period."""

    id: str                       # "alphavantage/primary"
    provider: str
    secret_ref: str               # the Settings field holding the value
    budgets: List[Budget] = field(default_factory=list)
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None
    enabled: bool = True
    priority: int = 0             # lower is preferred, ties broken by headroom
    notes: str = ""

    _counters: Dict[str, _Counter] = field(default_factory=dict, init=False, repr=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False, repr=False)
    _secret: str = field(default="", init=False, repr=False)

    def __post_init__(self) -> None:
        self._counters = {b.key: _Counter(b) for b in self.budgets}

    # -- secret --------------------------------------------------------

    def bind_secret(self, value: str) -> None:
        """Attach the resolved secret. Never logged, never serialised."""
        self._secret = value or ""

    @property
    def has_secret(self) -> bool:
        # A credential with no secret_ref is a keyless provider, which is fine.
        return bool(self._secret) or not self.secret_ref

    @property
    def secret(self) -> str:
        return self._secret

    # -- validity ------------------------------------------------------

    def expires_in_days(self, today: Optional[date] = None) -> Optional[int]:
        if self.valid_until is None:
            return None
        return (self.valid_until - (today or _utc_today())).days

    def state(self, now: Optional[float] = None) -> CredentialState:
        if not self.enabled:
            return CredentialState.DISABLED
        if not self.has_secret:
            return CredentialState.MISSING_SECRET

        today = _utc_today()
        if self.valid_from and today < self.valid_from:
            return CredentialState.NOT_YET_VALID
        if self.valid_until and today > self.valid_until:
            return CredentialState.EXPIRED

        now = now if now is not None else time.time()
        with self._lock:
            for counter in self._counters.values():
                if counter.remaining(now) <= 0:
                    return CredentialState.EXHAUSTED
        return CredentialState.ACTIVE

    @property
    def is_usable(self) -> bool:
        return self.state() is CredentialState.ACTIVE

    # -- budget --------------------------------------------------------

    def can_afford(
        self,
        cost: Optional[Dict[BudgetKind, int]] = None,
        subject: Optional[str] = None,
    ) -> bool:
        now = time.time()
        cost = cost or {BudgetKind.REQUESTS: 1}
        with self._lock:
            for counter in self._counters.values():
                amount = cost.get(counter.budget.kind, 0)
                if counter.budget.kind is BudgetKind.SYMBOLS:
                    if counter.would_exceed(now, 0, subject):
                        return False
                elif amount and counter.would_exceed(now, amount, subject):
                    return False
        return True

    def charge(
        self,
        cost: Optional[Dict[BudgetKind, int]] = None,
        subject: Optional[str] = None,
    ) -> None:
        now = time.time()
        cost = cost or {BudgetKind.REQUESTS: 1}
        with self._lock:
            for counter in self._counters.values():
                if counter.budget.kind is BudgetKind.SYMBOLS:
                    counter.charge(now, 0, subject)
                    continue
                amount = cost.get(counter.budget.kind, 0)
                if amount:
                    counter.charge(now, amount, subject)

    def refund(self, cost: Optional[Dict[BudgetKind, int]] = None) -> None:
        cost = cost or {BudgetKind.REQUESTS: 1}
        with self._lock:
            for counter in self._counters.values():
                amount = cost.get(counter.budget.kind, 0)
                if amount:
                    counter.refund(amount)

    def headroom(self) -> float:
        """
        Smallest fraction of any budget still unspent, 0.0 to 1.0.

        The minimum rather than an average: a credential with a spent daily
        budget is unusable however much of its monthly allowance is left.
        """
        now = time.time()
        with self._lock:
            if not self._counters:
                return 1.0
            fractions = []
            for counter in self._counters.values():
                if counter.budget.limit <= 0:
                    continue
                fractions.append(counter.remaining(now) / counter.budget.limit)
            return min(fractions) if fractions else 1.0

    # -- reporting -----------------------------------------------------

    def snapshot(self) -> Dict[str, object]:
        """Safe to log and to serve: carries no secret."""
        now = time.time()
        with self._lock:
            budgets = {
                key: {
                    "used": counter.used,
                    "limit": counter.budget.limit,
                    "remaining": counter.remaining(now),
                    "resets_in": counter.resets_in(now),
                }
                for key, counter in self._counters.items()
            }
        return {
            "id": self.id,
            "provider": self.provider,
            "state": self.state().value,
            "priority": self.priority,
            "headroom": round(self.headroom(), 3),
            "expires_in_days": self.expires_in_days(),
            "budgets": budgets,
        }


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()
