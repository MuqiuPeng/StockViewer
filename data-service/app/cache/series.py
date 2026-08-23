"""
Range-aware cache for daily bar series.

The problem this solves is not covered by keying a cache on the request. A
provider that caches ``(symbol, start, end)`` treats ``start=20240101`` and
``start=20240102`` as unrelated entries, so it fetches an almost identical
series twice and stores it twice. Chart panning and backtest windows generate
exactly that pattern, and on a 50-requests-per-hour budget it is the
difference between working and being throttled.

Here a symbol has one series. A request asks for a window of it, and gets back
either the slice — with no upstream call at all — or the gap that still has to
be fetched. Fetched bars are merged into the same series, so overlapping
windows keep converging on one copy instead of multiplying.

What "covered" means
--------------------
Markets have holidays, so a range holding no bars is indistinguishable from
one never fetched if you only look at the data. The cache therefore records
which ranges were *fetched*, separately from the bars themselves, and answers
coverage questions from those. Without that, a quiet week would be re-fetched
forever.

Open-ended requests (no end date) are treated as reaching today, and today's
coverage is deliberately short-lived: a series fetched before the close must
not keep serving a partial final bar once the session ends.
"""
from __future__ import annotations

import bisect
import threading
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

# A range whose end is today stops counting as covered this soon, so that the
# still-forming final bar gets refreshed rather than cached for the full TTL.
_TODAY_COVERAGE_TTL = 300.0


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _norm(d: Optional[str]) -> Optional[str]:
    """Accept YYYYMMDD or YYYY-MM-DD; return YYYY-MM-DD."""
    if not d:
        return None
    digits = d.replace("-", "")
    if len(digits) == 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:]}"
    return d


def _next_day(d: str) -> str:
    return (date.fromisoformat(d) + timedelta(days=1)).isoformat()


def _prev_day(d: str) -> str:
    return (date.fromisoformat(d) - timedelta(days=1)).isoformat()


@dataclass
class _Series:
    """One symbol's bars, plus which date ranges have actually been fetched."""

    bars: List[Dict[str, Any]] = field(default_factory=list)  # sorted by date
    # (start, end, fetched_at_monotonic), sorted and non-overlapping
    covered: List[Tuple[str, str, float]] = field(default_factory=list)

    def dates(self) -> List[str]:
        return [b["date"] for b in self.bars]

    def slice(self, start: Optional[str], end: Optional[str]) -> List[Dict[str, Any]]:
        ds = self.dates()
        lo = bisect.bisect_left(ds, start) if start else 0
        hi = bisect.bisect_right(ds, end) if end else len(ds)
        return self.bars[lo:hi]

    def merge_bars(self, incoming: List[Dict[str, Any]]) -> None:
        """Union by date; incoming wins, since it is the fresher fetch."""
        if not incoming:
            return
        by_date = {b["date"]: b for b in self.bars}
        for b in incoming:
            by_date[b["date"]] = b
        self.bars = [by_date[d] for d in sorted(by_date)]

    def merge_coverage(self, start: str, end: str, now: float) -> None:
        """Insert a fetched range, coalescing anything it touches."""
        merged: List[Tuple[str, str, float]] = []
        new_start, new_end, new_at = start, end, now
        for c_start, c_end, c_at in self.covered:
            # Adjacent counts as overlapping: [a..b] and [b+1..c] is one range.
            if c_end < _prev_day(new_start) or c_start > _next_day(new_end):
                merged.append((c_start, c_end, c_at))
            else:
                new_start = min(new_start, c_start)
                new_end = max(new_end, c_end)
                new_at = min(new_at, c_at)  # the range is only as fresh as its oldest part
        merged.append((new_start, new_end, new_at))
        merged.sort()
        self.covered = merged

    def missing(
        self, start: Optional[str], end: str, now: float, ttl: float
    ) -> Optional[Tuple[str, str]]:
        """
        The sub-range that still needs fetching, or None when fully covered.

        Returns a single span rather than a list of holes: providers charge per
        call, so one slightly-too-wide request beats three exact ones.
        """
        wanted_start = start or "0001-01-01"
        gaps_lo: Optional[str] = None
        gaps_hi: Optional[str] = None

        cursor = wanted_start
        for c_start, c_end, c_at in self.covered:
            if self._expired(c_end, c_at, now, ttl):
                continue
            if c_end < cursor:
                continue
            if c_start > end:
                break
            if c_start > cursor:
                gaps_lo = cursor if gaps_lo is None else gaps_lo
                gaps_hi = _prev_day(c_start)
            if c_end >= cursor:
                cursor = _next_day(c_end)
            if cursor > end:
                break

        if cursor <= end:
            gaps_lo = cursor if gaps_lo is None else gaps_lo
            gaps_hi = end

        if gaps_lo is None:
            return None
        return gaps_lo, (gaps_hi or end)

    @staticmethod
    def _expired(c_end: str, fetched_at: float, now: float, ttl: float) -> bool:
        if now - fetched_at > ttl:
            return True
        # A range that runs to today was fetched mid-session; its last bar is
        # still moving, so stop trusting it quickly.
        if c_end >= _today() and now - fetched_at > _TODAY_COVERAGE_TTL:
            return True
        return False


class SeriesCache:
    """
    Range-aware store of daily bars, keyed by whatever identifies a series.

    Typical use inside a provider::

        key = cache.key(provider, data_source, symbol, adjusted)
        hit, gap = cache.plan(key, start, end)
        if gap is None:
            return hit                      # no upstream call
        fetched = upstream(gap[0], gap[1])  # only the missing span
        return cache.store(key, gap, fetched, start, end)
    """

    def __init__(self, ttl: float = 3600.0, max_series: int = 512) -> None:
        self._ttl = ttl
        self._max_series = max_series
        self._lock = threading.Lock()
        self._series: Dict[str, _Series] = {}
        self._touched: Dict[str, float] = {}
        self._served_without_fetch = 0
        self._partial_fetches = 0

    # -- stats ---------------------------------------------------------

    @property
    def stats(self) -> Dict[str, int]:
        return {
            "series": len(self._series),
            "served_without_fetch": self._served_without_fetch,
            "partial_fetches": self._partial_fetches,
        }

    @staticmethod
    def key(provider: str, data_source: str, symbol: str, adjusted: bool) -> str:
        # Adjusted and raw are different series, not different views of one.
        return f"{provider}|{data_source}|{symbol.upper()}|{'adj' if adjusted else 'raw'}"

    # -- the two halves of a lookup ------------------------------------

    def plan(
        self, key: str, start: Optional[str], end: Optional[str]
    ) -> Tuple[List[Dict[str, Any]], Optional[Tuple[str, str]]]:
        """
        Return (bars_on_hand, range_to_fetch).

        range_to_fetch is None when the window is already covered, in which
        case bars_on_hand is the complete answer.
        """
        start_n, end_n = _norm(start), _norm(end) or _today()
        now = time.time()

        with self._lock:
            series = self._series.get(key)
            if series is None:
                return [], (start_n or "1900-01-01", end_n)

            self._touched[key] = now
            gap = series.missing(start_n, end_n, now, self._ttl)
            if gap is None:
                self._served_without_fetch += 1
                return series.slice(start_n, end_n), None
            if series.bars:
                self._partial_fetches += 1
            return series.slice(start_n, end_n), gap

    def store(
        self,
        key: str,
        fetched_range: Tuple[str, str],
        bars: List[Dict[str, Any]],
        start: Optional[str],
        end: Optional[str],
    ) -> List[Dict[str, Any]]:
        """Merge a fetch in and return the full answer for the original window."""
        start_n, end_n = _norm(start), _norm(end) or _today()
        now = time.time()

        with self._lock:
            series = self._series.get(key)
            if series is None:
                series = _Series()
                self._series[key] = series
            series.merge_bars(bars)
            series.merge_coverage(fetched_range[0], fetched_range[1], now)
            self._touched[key] = now
            self._evict_locked()
            return series.slice(start_n, end_n)

    def _evict_locked(self) -> None:
        if len(self._series) <= self._max_series:
            return
        # Least recently touched first; series are large, so keep this simple
        # rather than clever.
        for k, _ in sorted(self._touched.items(), key=lambda kv: kv[1]):
            if len(self._series) <= self._max_series:
                break
            self._series.pop(k, None)
            self._touched.pop(k, None)

    def invalidate(self, key: Optional[str] = None) -> None:
        with self._lock:
            if key is None:
                self._series.clear()
                self._touched.clear()
            else:
                self._series.pop(key, None)
                self._touched.pop(key, None)
