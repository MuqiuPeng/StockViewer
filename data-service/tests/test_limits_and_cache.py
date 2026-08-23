"""
Tests for the rate limiter, single-flight and range-aware series cache.

Written against stdlib unittest so they run without adding a test dependency:

    python -m unittest discover -s tests -v
"""
import sys
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.cache.series import SeriesCache  # noqa: E402
from app.cache.singleflight import SingleFlight  # noqa: E402
from app.limits.rate_limiter import (  # noqa: E402
    ProviderLimiter,
    QuotaExhausted,
)


def bar(d: str, close: float = 1.0) -> dict:
    return {"date": d, "open": close, "high": close, "low": close,
            "close": close, "volume": 100}


class TestWindowBudget(unittest.TestCase):
    def test_reserves_up_to_the_limit_then_refuses(self):
        limiter = ProviderLimiter("t", windows={"hour": (3, 3600)})
        for _ in range(3):
            with limiter.acquire():
                pass
        with self.assertRaises(QuotaExhausted) as ctx:
            limiter.acquire()
        self.assertEqual(ctx.exception.window, "hour")
        self.assertEqual(ctx.exception.limit, 3)

    def test_a_blocked_window_does_not_consume_the_others(self):
        # day has room, hour does not; the day budget must not be spent.
        limiter = ProviderLimiter("t", windows={"hour": (1, 3600), "day": (100, 86400)})
        with limiter.acquire():
            pass
        with self.assertRaises(QuotaExhausted):
            limiter.acquire()
        self.assertEqual(limiter.usage()["day"]["used"], 1)

    def test_refund_returns_the_reservation(self):
        limiter = ProviderLimiter("t", windows={"hour": (1, 3600)})
        lease = limiter.acquire()
        lease.refund()
        lease.__exit__(None, None, None)
        with limiter.acquire():
            pass  # the refunded slot was reusable

    def test_usage_is_reported_per_window(self):
        limiter = ProviderLimiter("t", windows={"hour": (5, 3600)})
        with limiter.acquire():
            pass
        usage = limiter.usage()["hour"]
        self.assertEqual(usage["used"], 1)
        self.assertEqual(usage["limit"], 5)
        self.assertGreater(usage["resets_in"], 0)


class TestPacingAndConcurrency(unittest.TestCase):
    def test_minimum_gap_is_enforced_between_calls(self):
        limiter = ProviderLimiter("t", min_interval=0.15)
        started = time.monotonic()
        for _ in range(3):
            with limiter.acquire():
                pass
        # Two gaps between three calls.
        self.assertGreaterEqual(time.monotonic() - started, 0.30)

    def test_concurrency_cap_is_respected(self):
        limiter = ProviderLimiter("t", max_concurrency=2)
        peak = 0
        live = 0
        lock = threading.Lock()

        def worker():
            nonlocal peak, live
            with limiter.acquire():
                with lock:
                    live += 1
                    peak = max(peak, live)
                time.sleep(0.05)
                with lock:
                    live -= 1

        threads = [threading.Thread(target=worker) for _ in range(8)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertLessEqual(peak, 2)


class TestSingleFlight(unittest.TestCase):
    def test_concurrent_callers_produce_one_execution(self):
        flight = SingleFlight()
        calls = []
        barrier = threading.Barrier(6)
        results = []

        def fn():
            calls.append(1)
            time.sleep(0.1)
            return "value"

        def worker():
            barrier.wait()
            results.append(flight.do("k", fn))

        threads = [threading.Thread(target=worker) for _ in range(6)]
        [t.start() for t in threads]
        [t.join() for t in threads]

        self.assertEqual(len(calls), 1, "upstream should be called once")
        self.assertEqual(results, ["value"] * 6)
        self.assertEqual(flight.saved_calls, 5)

    def test_failure_is_shared_not_retried_per_waiter(self):
        flight = SingleFlight()
        calls = []
        barrier = threading.Barrier(4)
        errors = []

        def fn():
            calls.append(1)
            time.sleep(0.1)
            raise RuntimeError("upstream down")

        def worker():
            barrier.wait()
            try:
                flight.do("k", fn)
            except RuntimeError as exc:
                errors.append(str(exc))

        threads = [threading.Thread(target=worker) for _ in range(4)]
        [t.start() for t in threads]
        [t.join() for t in threads]

        self.assertEqual(len(calls), 1)
        self.assertEqual(errors, ["upstream down"] * 4)

    def test_different_keys_do_not_collapse(self):
        flight = SingleFlight()
        calls = []
        flight.do("a", lambda: calls.append("a"))
        flight.do("b", lambda: calls.append("b"))
        self.assertEqual(calls, ["a", "b"])


class TestSeriesCacheRanges(unittest.TestCase):
    def test_first_request_reports_the_whole_range_missing(self):
        cache = SeriesCache()
        key = cache.key("p", "cn.stock", "600104", True)
        hit, gap = cache.plan(key, "20240101", "20240131")
        self.assertEqual(hit, [])
        self.assertEqual(gap, ("2024-01-01", "2024-01-31"))

    def test_a_covered_window_needs_no_fetch(self):
        cache = SeriesCache()
        key = cache.key("p", "cn.stock", "600104", True)
        _, gap = cache.plan(key, "20240101", "20240131")
        cache.store(key, gap, [bar("2024-01-10"), bar("2024-01-20")],
                    "20240101", "20240131")

        hit, gap2 = cache.plan(key, "20240105", "20240125")
        self.assertIsNone(gap2, "a sub-range of a fetched window must not refetch")
        self.assertEqual([b["date"] for b in hit], ["2024-01-10", "2024-01-20"])

    def test_extending_forward_fetches_only_the_delta(self):
        cache = SeriesCache()
        key = cache.key("p", "cn.stock", "600104", True)
        _, gap = cache.plan(key, "20240101", "20240131")
        cache.store(key, gap, [bar("2024-01-31")], "20240101", "20240131")

        _, gap2 = cache.plan(key, "20240101", "20240229")
        self.assertEqual(gap2, ("2024-02-01", "2024-02-29"),
                         "only the new tail should be requested")

    def test_extending_backward_fetches_only_the_delta(self):
        cache = SeriesCache()
        key = cache.key("p", "cn.stock", "600104", True)
        _, gap = cache.plan(key, "20240201", "20240229")
        cache.store(key, gap, [bar("2024-02-05")], "20240201", "20240229")

        _, gap2 = cache.plan(key, "20240101", "20240229")
        self.assertEqual(gap2, ("2024-01-01", "2024-01-31"))

    def test_a_holiday_gap_is_not_refetched_forever(self):
        # No bars in the range at all — coverage, not data, must decide.
        cache = SeriesCache()
        key = cache.key("p", "cn.stock", "600104", True)
        _, gap = cache.plan(key, "20240201", "20240210")
        cache.store(key, gap, [], "20240201", "20240210")

        _, gap2 = cache.plan(key, "20240201", "20240210")
        self.assertIsNone(gap2, "an empty but fetched range must count as covered")

    def test_adjacent_ranges_coalesce(self):
        cache = SeriesCache()
        key = cache.key("p", "cn.stock", "600104", True)
        _, g1 = cache.plan(key, "20240101", "20240131")
        cache.store(key, g1, [bar("2024-01-15")], "20240101", "20240131")
        _, g2 = cache.plan(key, "20240201", "20240229")
        cache.store(key, g2, [bar("2024-02-15")], "20240201", "20240229")

        _, gap3 = cache.plan(key, "20240101", "20240229")
        self.assertIsNone(gap3, "touching ranges should merge into one")

    def test_merged_series_returns_bars_from_both_fetches(self):
        cache = SeriesCache()
        key = cache.key("p", "cn.stock", "600104", True)
        _, g1 = cache.plan(key, "20240101", "20240131")
        cache.store(key, g1, [bar("2024-01-15")], "20240101", "20240131")
        _, g2 = cache.plan(key, "20240201", "20240229")
        out = cache.store(key, g2, [bar("2024-02-15")], "20240101", "20240229")
        self.assertEqual([b["date"] for b in out], ["2024-01-15", "2024-02-15"])

    def test_adjusted_and_raw_are_separate_series(self):
        cache = SeriesCache()
        adj = cache.key("p", "cn.stock", "600104", True)
        raw = cache.key("p", "cn.stock", "600104", False)
        _, gap = cache.plan(adj, "20240101", "20240131")
        cache.store(adj, gap, [bar("2024-01-15", 10.0)], "20240101", "20240131")

        _, gap_raw = cache.plan(raw, "20240101", "20240131")
        self.assertIsNotNone(gap_raw, "raw prices must not be served from the adjusted series")

    def test_expired_coverage_is_refetched(self):
        cache = SeriesCache(ttl=0.05)
        key = cache.key("p", "cn.stock", "600104", True)
        _, gap = cache.plan(key, "20240101", "20240131")
        cache.store(key, gap, [bar("2024-01-15")], "20240101", "20240131")
        time.sleep(0.1)
        _, gap2 = cache.plan(key, "20240101", "20240131")
        self.assertIsNotNone(gap2)

    def test_counts_report_saved_work(self):
        cache = SeriesCache()
        key = cache.key("p", "cn.stock", "600104", True)
        _, gap = cache.plan(key, "20240101", "20240131")
        cache.store(key, gap, [bar("2024-01-15")], "20240101", "20240131")
        cache.plan(key, "20240105", "20240125")
        self.assertEqual(cache.stats["served_without_fetch"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
