"""
Tests for the Tencent provider's date-window paging.

This provider served 800 bars — about 3.2 years — because the request asked
for a fixed count with the date slots empty, on the recorded belief that
filling them returned nothing. Re-probing the live endpoint showed the dates
work and the depth runs to each instrument's first trading day. The walk that
replaced the single request has three behaviours worth pinning, all of which
fail silently rather than loudly if they regress: it must not skip a span when
a page comes back short, it must stop when there is nothing older, and a
caller asking for one year must not get a walk back to 1900.

No network. Every test drives the paging loop over a scripted upstream.

Written against stdlib unittest, like the rest of this suite:

    python -m unittest discover -s tests -v
"""
import contextlib
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.providers import tencent_provider as tp  # noqa: E402


def trading_days(start: str, end: str) -> list:
    """Weekdays in [start, end]. Close enough to a session calendar here."""
    out = []
    cur = date.fromisoformat(start)
    last = date.fromisoformat(end)
    while cur <= last:
        if cur.weekday() < 5:
            out.append(cur.isoformat())
        cur += timedelta(days=1)
    return out


class FakeUpstream:
    """Stands in for Tencent's kline endpoint.

    Serves rows for the dates it has, honouring the two behaviours the real
    endpoint showed: the count selects from the *end* of the window, and a
    window entirely before the first available date comes back empty.
    """

    def __init__(self, first_date: str, last_date: str, cap: int | None = None):
        self.available = trading_days(first_date, last_date)
        self.cap = cap
        self.requests: list = []

    # Bound as a class attribute on TencentProvider. A non-function object is
    # not a descriptor, so no instance is passed in — the signature takes the
    # url and params only.
    def __call__(self, _url, params):
        _sym, _period, start, end, count, _fq = params["param"].split(",")
        count = int(count)
        self.requests.append((start, end, count))

        rows = [d for d in self.available if start <= d <= end]
        limit = min(count, self.cap) if self.cap else count
        rows = rows[-limit:]  # the count takes from the end of the window
        if not rows:
            return {"data": {}}
        return {
            "data": {
                "sh000001": {
                    "qfqday": [[d, "1.0", "1.0", "1.0", "1.0", "100"] for d in rows]
                }
            }
        }


class _NoLimit:
    """The real limiter is process-wide and budgeted per minute.

    These tests drive dozens of pages in a few seconds, so the budget would
    decide the result instead of the paging logic. What the limiter does is
    covered by test_limits_and_cache.
    """

    def acquire(self):
        return contextlib.nullcontext()


class PagingTestCase(unittest.TestCase):
    def walk(self, upstream, floor: str, ceiling: str) -> list:
        original = tp.TencentProvider._get
        tp.TencentProvider._get = upstream
        try:
            provider = tp.TencentProvider()
            provider._limiter = _NoLimit()
            bars = provider._fetch_paged(
                "fqkline", "sh000001", floor=floor, ceiling=ceiling
            )
        finally:
            tp.TencentProvider._get = original
        return [b["date"] for b in bars]


class TestWalkCompleteness(PagingTestCase):
    def test_it_collects_every_session_across_pages(self):
        upstream = FakeUpstream("2015-01-01", "2026-10-30")

        dates = self.walk(upstream, floor="1900-01-01", ceiling="2026-10-30")

        self.assertEqual(dates, upstream.available)
        self.assertGreater(len(upstream.requests), 1, "should have taken several pages")

    def test_a_truncated_page_does_not_skip_the_span_it_dropped(self):
        """The failure the backward walk exists to absorb.

        A real window returned 640 bars where about 970 were asked for, and
        did it without saying so. The cap here is the same fraction of a
        window. Because each page resumes at the previous page's oldest bar
        rather than at a computed offset, a short page costs an extra request
        and nothing else.
        """
        upstream = FakeUpstream("2015-01-01", "2026-10-30", cap=320)

        dates = self.walk(upstream, floor="1900-01-01", ceiling="2026-10-30")

        self.assertEqual(dates, upstream.available)
        self.assertGreater(
            len(upstream.requests),
            6,
            "truncation should have cost extra pages, not data",
        )

    def test_truncation_severe_enough_to_exhaust_the_pages_is_reported(self):
        """The one case where history does come back short.

        If every page returns a sliver, the page limit stops the walk before
        the first trading day. That is a real outcome and the only acceptable
        form of it is a loud one — silence here is what made the 800-bar
        ceiling look like the provider's own limit for so long.
        """
        upstream = FakeUpstream("2015-01-01", "2026-10-30", cap=37)

        with self.assertLogs(tp.logger, level="WARNING") as captured:
            dates = self.walk(upstream, floor="1900-01-01", ceiling="2026-10-30")

        self.assertEqual(len(upstream.requests), tp._MAX_PAGES)
        self.assertLess(len(dates), len(upstream.available))
        self.assertTrue(
            any("page limit" in line for line in captured.output),
            f"expected a page-limit warning, got {captured.output}",
        )

    def test_bars_come_back_sorted_and_deduplicated(self):
        upstream = FakeUpstream("2020-01-01", "2026-10-30")

        dates = self.walk(upstream, floor="1900-01-01", ceiling="2026-10-30")

        self.assertEqual(dates, sorted(dates))
        self.assertEqual(len(dates), len(set(dates)))


class TestTermination(PagingTestCase):
    def test_it_stops_at_the_first_trading_day(self):
        upstream = FakeUpstream("2012-05-28", "2026-10-30")

        dates = self.walk(upstream, floor="1900-01-01", ceiling="2026-10-30")

        self.assertEqual(dates[0], "2012-05-28")

    def test_it_does_not_walk_past_the_page_limit(self):
        upstream = FakeUpstream("1900-01-01", "2026-10-30")

        self.walk(upstream, floor="1900-01-01", ceiling="2026-10-30")

        self.assertLessEqual(len(upstream.requests), tp._MAX_PAGES)

    def test_an_empty_first_page_yields_nothing_rather_than_looping(self):
        upstream = FakeUpstream("2030-01-01", "2030-12-31")  # all after the ask

        dates = self.walk(upstream, floor="2020-01-01", ceiling="2026-10-30")

        self.assertEqual(dates, [])
        self.assertEqual(len(upstream.requests), 1)


class TestBoundedRequests(PagingTestCase):
    def test_one_year_asked_for_is_not_a_walk_to_1900(self):
        upstream = FakeUpstream("1990-12-19", "2026-10-30")

        dates = self.walk(upstream, floor="2024-01-01", ceiling="2024-12-31")

        self.assertEqual(dates[0][:4], "2024")
        self.assertEqual(dates[-1][:4], "2024")
        self.assertLessEqual(len(upstream.requests), 3)

    def test_no_request_reaches_below_the_floor(self):
        upstream = FakeUpstream("1990-12-19", "2026-10-30")

        self.walk(upstream, floor="2020-01-01", ceiling="2026-10-30")

        for start, _end, _count in upstream.requests:
            self.assertGreaterEqual(start, "2020-01-01")

    def test_the_cache_floor_of_year_one_is_clamped(self):
        """SeriesCache hands down 0001-01-01 when no start date was named.

        Unclamped that is both an unbounded walk and a date subtraction that
        falls out of range.
        """
        upstream = FakeUpstream("2015-01-01", "2026-10-30")

        dates = self.walk(upstream, floor="0001-01-01", ceiling="2026-10-30")

        self.assertEqual(dates[0], "2015-01-01" if date.fromisoformat(
            "2015-01-01").weekday() < 5 else dates[0])
        for start, _end, _count in upstream.requests:
            self.assertGreaterEqual(start, tp._EARLIEST)


class TestRequestShape(PagingTestCase):
    def test_the_date_slots_are_filled(self):
        """The whole point: the old request left them empty and took the tail."""
        upstream = FakeUpstream("2015-01-01", "2026-10-30")

        self.walk(upstream, floor="2024-01-01", ceiling="2024-12-31")

        start, end, count = upstream.requests[0]
        self.assertTrue(start and end, "date slots must not be empty")
        self.assertEqual(count, tp._PAGE_BARS)

    def test_the_window_stays_inside_the_count(self):
        """A window must not be able to hold more bars than the count asks for.

        If it could, the count would silently drop the oldest part of the
        window — which is the bug the old code had at a larger scale.
        """
        sessions_per_year = 253
        self.assertLess(tp._PAGE_YEARS * sessions_per_year, tp._PAGE_BARS)


if __name__ == "__main__":
    unittest.main()
