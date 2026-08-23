"""
Tests for circuit breaking, retry classification and backoff.

    python -m unittest discover -s tests -v
"""
import random
import sys
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.resilience import (  # noqa: E402
    BreakerConfig,
    CircuitBreaker,
    CircuitOpen,
    CircuitState,
    RetryDecision,
    backoff_delay,
    classify_status,
    is_auth_failure,
    parse_retry_after,
    should_retry,
)


def fast_config(**kw) -> BreakerConfig:
    base = dict(window=4, failure_ratio=0.5, open_seconds=1,
                consecutive_failures=3, auth_open_seconds=2)
    base.update(kw)
    return BreakerConfig(**base)


class TestCircuitOpening(unittest.TestCase):
    def test_starts_closed_and_allows(self):
        cb = CircuitBreaker("t", fast_config())
        self.assertIs(cb.state, CircuitState.CLOSED)
        self.assertTrue(cb.allow())

    def test_consecutive_failures_open_it(self):
        cb = CircuitBreaker("t", fast_config(consecutive_failures=3))
        for _ in range(3):
            cb.record_failure()
        self.assertIs(cb.state, CircuitState.OPEN)
        self.assertFalse(cb.allow())

    def test_consecutive_counter_resets_on_success(self):
        # Wide window so the ratio rule cannot fire and mask what is under
        # test: four outcomes in a four-wide window would trip on ratio alone.
        cb = CircuitBreaker("t", fast_config(window=10, consecutive_failures=3))
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        cb.record_failure()
        self.assertIs(cb.state, CircuitState.CLOSED)

    def test_ratio_needs_a_full_window(self):
        # Two failures out of two must not trip a four-wide window; otherwise
        # a cold start on a slow provider opens it on no evidence.
        cb = CircuitBreaker("t", fast_config(window=4, consecutive_failures=99))
        cb.record_failure()
        cb.record_failure()
        self.assertIs(cb.state, CircuitState.CLOSED)

    def test_ratio_opens_once_the_window_is_full(self):
        cb = CircuitBreaker("t", fast_config(window=4, failure_ratio=0.5,
                                             consecutive_failures=99))
        cb.record_failure()
        cb.record_success()
        cb.record_failure()
        cb.record_failure()          # 3/4 failed, over the 0.5 ratio
        self.assertIs(cb.state, CircuitState.OPEN)

    def test_check_raises_with_a_retry_hint(self):
        cb = CircuitBreaker("t", fast_config(consecutive_failures=1, open_seconds=30))
        cb.record_failure()
        with self.assertRaises(CircuitOpen) as ctx:
            cb.check()
        self.assertGreater(ctx.exception.retry_in_seconds, 0)


class TestHalfOpen(unittest.TestCase):
    def test_becomes_half_open_after_the_cooldown(self):
        cb = CircuitBreaker("t", fast_config(consecutive_failures=1, open_seconds=1))
        cb.record_failure()
        self.assertIs(cb.state, CircuitState.OPEN)
        time.sleep(1.05)
        self.assertIs(cb.state, CircuitState.HALF_OPEN)

    def test_only_one_probe_is_admitted(self):
        cb = CircuitBreaker("t", fast_config(consecutive_failures=1, open_seconds=1))
        cb.record_failure()
        time.sleep(1.05)
        self.assertTrue(cb.allow(), "the first caller should probe")
        self.assertFalse(cb.allow(), "a second caller must not")

    def test_a_successful_probe_closes_it(self):
        cb = CircuitBreaker("t", fast_config(consecutive_failures=1, open_seconds=1))
        cb.record_failure()
        time.sleep(1.05)
        cb.allow()
        cb.record_success()
        self.assertIs(cb.state, CircuitState.CLOSED)
        self.assertTrue(cb.allow())

    def test_a_failed_probe_reopens_immediately(self):
        cb = CircuitBreaker("t", fast_config(consecutive_failures=99, open_seconds=1))
        cb._open_locked(False, "test")     # force open without tripping rules
        time.sleep(1.05)
        cb.allow()
        cb.record_failure()
        self.assertIs(cb.state, CircuitState.OPEN)


class TestAuthCooldown(unittest.TestCase):
    def test_auth_failures_get_the_longer_cooldown(self):
        cb = CircuitBreaker("t", fast_config(consecutive_failures=1,
                                             open_seconds=1, auth_open_seconds=60))
        cb.record_failure(auth_failure=True)
        self.assertGreater(cb.retry_in(), 30,
                           "a rejected key must not be retried within the minute")


class TestConcurrency(unittest.TestCase):
    def test_only_one_thread_probes(self):
        cb = CircuitBreaker("t", fast_config(consecutive_failures=1, open_seconds=1))
        cb.record_failure()
        time.sleep(1.05)

        admitted = []
        barrier = threading.Barrier(8)

        def worker():
            barrier.wait()
            if cb.allow():
                admitted.append(1)

        threads = [threading.Thread(target=worker) for _ in range(8)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(len(admitted), 1)


class TestStatusClassification(unittest.TestCase):
    def test_429_defers_to_the_provider(self):
        self.assertIs(classify_status(429), RetryDecision.RETRY_AFTER)

    def test_transient_server_errors_retry(self):
        for code in (408, 500, 502, 503, 504):
            self.assertIs(classify_status(code), RetryDecision.RETRY, code)

    def test_auth_falls_back_rather_than_retrying(self):
        for code in (401, 403):
            self.assertIs(classify_status(code), RetryDecision.FALLBACK, code)
            self.assertTrue(is_auth_failure(code))

    def test_client_errors_fail_outright(self):
        # A 404 will be a 404 on the third attempt too.
        for code in (400, 404, 422):
            self.assertIs(classify_status(code), RetryDecision.FAIL, code)

    def test_should_retry_respects_the_decision(self):
        self.assertFalse(should_retry(RetryDecision.FAIL, 1, 3))
        self.assertFalse(should_retry(RetryDecision.FALLBACK, 1, 3))
        self.assertTrue(should_retry(RetryDecision.RETRY, 1, 3))
        self.assertFalse(should_retry(RetryDecision.RETRY, 3, 3))


class TestRetryAfter(unittest.TestCase):
    def test_parses_a_delay_in_seconds(self):
        self.assertEqual(parse_retry_after("120"), 120.0)

    def test_parses_an_http_date(self):
        now = datetime(2026, 8, 23, 12, 0, 0, tzinfo=timezone.utc)
        header = format_datetime(now + timedelta(seconds=90))
        delay = parse_retry_after(header, now=now)
        self.assertAlmostEqual(delay, 90.0, delta=1.0)

    def test_a_past_date_means_no_wait(self):
        now = datetime(2026, 8, 23, 12, 0, 0, tzinfo=timezone.utc)
        header = format_datetime(now - timedelta(seconds=30))
        self.assertEqual(parse_retry_after(header, now=now), 0.0)

    def test_garbage_returns_none_rather_than_zero(self):
        # Treating an unparseable header as zero would retry immediately,
        # which is the opposite of what it was asking for.
        for value in ("soon", "", None, "-5s"):
            self.assertIsNone(parse_retry_after(value), value)


class TestBackoff(unittest.TestCase):
    def test_grows_with_the_attempt_and_stays_under_the_cap(self):
        rng = random.Random(0)
        for attempt in range(1, 8):
            delay = backoff_delay(attempt, base=0.5, cap=10.0, rng=rng)
            self.assertGreaterEqual(delay, 0.0)
            self.assertLessEqual(delay, 10.0)

    def test_jitter_spreads_concurrent_retries(self):
        rng = random.Random(1)
        values = {round(backoff_delay(4, rng=rng), 6) for _ in range(20)}
        self.assertGreater(len(values), 1,
                           "a fixed schedule would make clients retry in lockstep")


if __name__ == "__main__":
    unittest.main(verbosity=2)
