"""
Per-provider rate limiting.

Providers used to each carry their own ad-hoc counter, which meant every new
adapter reinvented the same logic and none of them enforced concurrency. This
gathers the four controls a free-tier API actually needs behind one lease:

- a minimum gap between calls, for APIs that reject bursts outright
  (Alpha Vantage answers "1 request per second" with an error, not a wait)
- fixed windows, for the hour/day/month budgets free tiers are sold in
- a concurrency cap, so a fan-out cannot open twenty sockets at once
- a request counter per window, readable for health output

Everything here is synchronous and thread-safe. Providers are synchronous, and
callers reach them through a threadpool, so blocking while waiting for a token
parks one worker rather than the event loop.

Scope. The counters live in this process and reset on the wall clock, so a
restart forgets them. That is deliberate for now: they exist to keep us from
being throttled or blocked upstream, not to account for spend. Sharing them
across instances needs Redis and is a separate piece of work.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class QuotaExhausted(RuntimeError):
    """Raised when a budget window is spent. Carries which one, for the caller."""

    def __init__(self, window: str, limit: int, resets_in_seconds: int) -> None:
        self.window = window
        self.limit = limit
        self.resets_in_seconds = resets_in_seconds
        super().__init__(
            f"{window} limit reached ({limit} requests); "
            f"resets in {resets_in_seconds}s"
        )


@dataclass
class WindowLimit:
    """A fixed-window budget, e.g. 50 per hour."""

    name: str
    limit: int
    seconds: int
    _count: int = field(default=0, init=False)
    _window_start: float = field(default=0.0, init=False)

    def _roll(self, now: float) -> None:
        # Fixed windows aligned to the epoch, so "the hour" means the same
        # thing across restarts rather than sliding with process start.
        start = now - (now % self.seconds)
        if start != self._window_start:
            self._window_start = start
            self._count = 0

    def try_reserve(self, now: float) -> bool:
        self._roll(now)
        if self._count >= self.limit:
            return False
        self._count += 1
        return True

    def release(self) -> None:
        """Give back a reservation for a call that never happened."""
        if self._count > 0:
            self._count -= 1

    def used(self, now: float) -> int:
        self._roll(now)
        return self._count

    def resets_in(self, now: float) -> int:
        self._roll(now)
        return max(0, int(self._window_start + self.seconds - now))


class ProviderLimiter:
    """
    Rate control for one provider.

    Use it as a context manager around the upstream call::

        with limiter.acquire():
            response = http_get(...)

    Reservations are taken before the concurrency slot, so a request that
    cannot afford the budget fails immediately instead of queueing for a slot
    it will not be allowed to use.
    """

    def __init__(
        self,
        name: str,
        *,
        min_interval: float = 0.0,
        max_concurrency: int = 4,
        windows: Optional[Dict[str, tuple[int, int]]] = None,
    ) -> None:
        """
        windows maps a label to (limit, period_seconds), e.g.
        {"hour": (50, 3600), "day": (1000, 86400)}.
        """
        self.name = name
        self._min_interval = min_interval
        self._semaphore = threading.BoundedSemaphore(max_concurrency)
        self._lock = threading.Lock()
        self._last_call = 0.0
        self._windows = [
            WindowLimit(label, limit, seconds)
            for label, (limit, seconds) in (windows or {}).items()
        ]

    # -- introspection -------------------------------------------------

    def usage(self) -> Dict[str, Dict[str, int]]:
        now = time.time()
        with self._lock:
            return {
                w.name: {
                    "used": w.used(now),
                    "limit": w.limit,
                    "resets_in": w.resets_in(now),
                }
                for w in self._windows
            }

    def describe_usage(self) -> str:
        parts = [
            f"{v['used']}/{v['limit']} per {k}" for k, v in self.usage().items()
        ]
        return ", ".join(parts) if parts else "no budget configured"

    # -- reservation ---------------------------------------------------

    def _reserve_windows(self) -> None:
        now = time.time()
        with self._lock:
            taken: list[WindowLimit] = []
            for w in self._windows:
                if w.try_reserve(now):
                    taken.append(w)
                    continue
                # Undo the partial reservation so a blocked request does not
                # silently consume the budgets that did have room.
                for t in taken:
                    t.release()
                raise QuotaExhausted(w.name, w.limit, w.resets_in(now))

    def _release_windows(self) -> None:
        with self._lock:
            for w in self._windows:
                w.release()

    def _wait_for_gap(self) -> None:
        if self._min_interval <= 0:
            return
        with self._lock:
            wait = self._last_call + self._min_interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last_call = time.monotonic()

    def acquire(self) -> "_Lease":
        self._reserve_windows()
        try:
            self._semaphore.acquire()
        except BaseException:
            self._release_windows()
            raise
        return _Lease(self)


class _Lease:
    """Holds a concurrency slot; returns the budget if the call never ran."""

    def __init__(self, limiter: ProviderLimiter) -> None:
        self._limiter = limiter
        self._refunded = False

    def __enter__(self) -> "_Lease":
        self._limiter._wait_for_gap()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self._limiter._semaphore.release()

    def refund(self) -> None:
        """
        Give the budget back — for a call the provider decided not to make
        after reserving, not for one that failed upstream. A failed call has
        usually still been counted by the provider.
        """
        if not self._refunded:
            self._refunded = True
            self._limiter._release_windows()


# ----------------------------------------------------------------------
# Registry
# ----------------------------------------------------------------------

_registry: Dict[str, ProviderLimiter] = {}
_registry_lock = threading.Lock()


def get_limiter(
    name: str,
    *,
    min_interval: float = 0.0,
    max_concurrency: int = 4,
    windows: Optional[Dict[str, tuple[int, int]]] = None,
) -> ProviderLimiter:
    """
    Return the process-wide limiter for a provider, creating it on first use.

    Configuration is only read on creation, so callers all share whatever the
    first one asked for; providers are singletons, so this is the same thing
    as configuring it once.
    """
    with _registry_lock:
        limiter = _registry.get(name)
        if limiter is None:
            limiter = ProviderLimiter(
                name,
                min_interval=min_interval,
                max_concurrency=max_concurrency,
                windows=windows,
            )
            _registry[name] = limiter
            logger.info(
                "Rate limiter for %s: %s, min gap %.2fs, concurrency %d",
                name, limiter.describe_usage(), min_interval, max_concurrency,
            )
        return limiter


def all_limiters() -> Dict[str, ProviderLimiter]:
    with _registry_lock:
        return dict(_registry)
