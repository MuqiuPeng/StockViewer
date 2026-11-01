"""
Request de-duplication.

Concurrent callers asking for the same thing should cost one upstream request,
not one each. The first caller in becomes the leader and does the work; the
rest wait on its result. This matters most exactly when it hurts most — a page
that renders eight charts of the same symbol, or a backfill racing a user.

The leader's outcome is shared verbatim, exceptions included, so a failure is
not retried once per waiter against an upstream that is already unhappy.

Thread-based rather than async, to match the synchronous providers. Sharing
flights across processes needs a lock in Redis and is separate work.
"""
from __future__ import annotations

import logging
import threading
from typing import Any, Callable, Dict, Generic, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class _Flight(Generic[T]):
    __slots__ = ("event", "value", "error", "waiters")

    def __init__(self) -> None:
        self.event = threading.Event()
        self.value: Optional[T] = None
        self.error: Optional[BaseException] = None
        self.waiters = 0


class SingleFlight:
    """Collapses concurrent calls that share a key into one execution."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._flights: Dict[str, _Flight] = {}
        self._saved = 0

    @property
    def saved_calls(self) -> int:
        """How many calls were served by someone else's work."""
        return self._saved

    def do(self, key: str, fn: Callable[[], T]) -> T:
        with self._lock:
            flight = self._flights.get(key)
            if flight is not None:
                flight.waiters += 1
                self._saved += 1
                leader = False
            else:
                flight = _Flight()
                self._flights[key] = flight
                leader = True

        if not leader:
            flight.event.wait()
            if flight.error is not None:
                raise flight.error
            return flight.value  # type: ignore[return-value]

        try:
            flight.value = fn()
        except BaseException as exc:  # shared with the waiters, then re-raised
            flight.error = exc
            raise
        finally:
            with self._lock:
                self._flights.pop(key, None)
            flight.event.set()
            if flight.waiters:
                logger.debug(
                    "single-flight: %d waiter(s) shared the result for %s",
                    flight.waiters, key,
                )

        return flight.value  # type: ignore[return-value]
