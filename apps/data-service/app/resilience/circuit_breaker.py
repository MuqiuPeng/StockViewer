"""
Circuit breakers, one per provider and capability.

A provider that is refusing connections costs a full timeout on every request
before it can fail — EastMoney is doing exactly that right now, so each Hong
Kong or index request waits out the socket timeout before routing moves on. A
breaker turns the second and subsequent failures into an instant skip.

Keyed by (provider, capability) rather than by provider alone, because they
fail independently: a listing endpoint being broken says nothing about whether
history still works, and tripping both on one signal loses data we could still
serve.

States
------
CLOSED     Normal. Outcomes go into a sliding window; enough failures open it.
OPEN       Short-circuited. Calls are refused immediately until the cooldown
           expires, at which point the next caller is allowed through.
HALF_OPEN  One probe at a time. A success closes it, a failure re-opens it
           with the cooldown restarted.

Authentication and licence failures get a longer cooldown than a network
blip: retrying a rejected key every minute neither fixes it nor goes unnoticed
at the other end.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import deque
from dataclasses import dataclass
from enum import Enum
from typing import Deque, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitOpen(RuntimeError):
    """The breaker refused the call. Carries when it will next let one by."""

    def __init__(self, name: str, retry_in_seconds: int) -> None:
        self.name = name
        self.retry_in_seconds = retry_in_seconds
        super().__init__(
            f"{name} circuit is open; not retrying for another "
            f"{retry_in_seconds}s"
        )


@dataclass
class BreakerConfig:
    window: int = 20
    failure_ratio: float = 0.5
    open_seconds: int = 60
    # Consecutive failures that trip it regardless of ratio, so a cold start
    # against a dead provider does not need a full window first.
    consecutive_failures: int = 5
    # Applied instead of open_seconds when the failure was authentication or
    # licensing, which a retry cannot fix.
    auth_open_seconds: int = 900


class CircuitBreaker:
    """Sliding-window breaker for one provider capability."""

    def __init__(self, name: str, config: Optional[BreakerConfig] = None) -> None:
        self.name = name
        self.config = config or BreakerConfig()
        self._lock = threading.Lock()
        self._outcomes: Deque[bool] = deque(maxlen=self.config.window)
        self._consecutive = 0
        self._state = CircuitState.CLOSED
        self._open_until = 0.0
        self._probing = False

    # -- state ---------------------------------------------------------

    @property
    def state(self) -> CircuitState:
        with self._lock:
            self._maybe_half_open_locked(time.monotonic())
            return self._state

    def _maybe_half_open_locked(self, now: float) -> None:
        if self._state is CircuitState.OPEN and now >= self._open_until:
            self._state = CircuitState.HALF_OPEN
            self._probing = False
            logger.info("Circuit %s half-open; allowing a probe", self.name)

    def retry_in(self) -> int:
        with self._lock:
            return max(0, int(self._open_until - time.monotonic()))

    # -- gate ----------------------------------------------------------

    def allow(self) -> bool:
        """Whether a call may proceed. Reserves the probe slot when half-open."""
        with self._lock:
            now = time.monotonic()
            self._maybe_half_open_locked(now)

            if self._state is CircuitState.CLOSED:
                return True
            if self._state is CircuitState.OPEN:
                return False
            # HALF_OPEN: exactly one caller gets to find out.
            if self._probing:
                return False
            self._probing = True
            return True

    def check(self) -> None:
        """allow(), but raising, for use at the top of a call path."""
        if not self.allow():
            raise CircuitOpen(self.name, self.retry_in())

    # -- outcomes ------------------------------------------------------

    def record_success(self) -> None:
        with self._lock:
            self._outcomes.append(True)
            self._consecutive = 0
            if self._state is not CircuitState.CLOSED:
                logger.info("Circuit %s closed after a successful probe", self.name)
            self._state = CircuitState.CLOSED
            self._probing = False

    def record_failure(self, *, auth_failure: bool = False) -> None:
        with self._lock:
            self._outcomes.append(False)
            self._consecutive += 1

            if self._state is CircuitState.HALF_OPEN:
                self._open_locked(auth_failure, "probe failed")
                return

            if self._consecutive >= self.config.consecutive_failures:
                self._open_locked(
                    auth_failure,
                    f"{self._consecutive} consecutive failures",
                )
                return

            # Ratio only counts once the window has enough evidence, so two
            # failures out of two do not trip a twenty-wide window.
            if len(self._outcomes) >= self.config.window:
                failures = sum(1 for ok in self._outcomes if not ok)
                if failures / len(self._outcomes) >= self.config.failure_ratio:
                    self._open_locked(
                        auth_failure,
                        f"{failures}/{len(self._outcomes)} failed",
                    )

    def _open_locked(self, auth_failure: bool, why: str) -> None:
        cooldown = (
            self.config.auth_open_seconds if auth_failure
            else self.config.open_seconds
        )
        self._state = CircuitState.OPEN
        self._open_until = time.monotonic() + cooldown
        self._probing = False
        self._outcomes.clear()
        self._consecutive = 0
        logger.warning(
            "Circuit %s opened for %ds (%s%s)",
            self.name, cooldown, why, ", auth failure" if auth_failure else "",
        )

    def reset(self) -> None:
        with self._lock:
            self._outcomes.clear()
            self._consecutive = 0
            self._state = CircuitState.CLOSED
            self._open_until = 0.0
            self._probing = False

    def snapshot(self) -> Dict[str, object]:
        with self._lock:
            self._maybe_half_open_locked(time.monotonic())
            total = len(self._outcomes)
            failures = sum(1 for ok in self._outcomes if not ok)
            return {
                "state": self._state.value,
                "recent": total,
                "recent_failures": failures,
                "consecutive_failures": self._consecutive,
                "retry_in": max(0, int(self._open_until - time.monotonic())),
            }


# ----------------------------------------------------------------------
# Registry
# ----------------------------------------------------------------------

_breakers: Dict[Tuple[str, str], CircuitBreaker] = {}
_lock = threading.Lock()


def get_breaker(
    provider: str, capability: str = "default", config: Optional[BreakerConfig] = None
) -> CircuitBreaker:
    key = (provider, capability)
    with _lock:
        breaker = _breakers.get(key)
        if breaker is None:
            breaker = CircuitBreaker(f"{provider}/{capability}", config)
            _breakers[key] = breaker
        return breaker


def all_breakers() -> Dict[str, Dict[str, object]]:
    with _lock:
        return {b.name: b.snapshot() for b in _breakers.values()}


def reset_all() -> None:
    with _lock:
        for b in _breakers.values():
            b.reset()
