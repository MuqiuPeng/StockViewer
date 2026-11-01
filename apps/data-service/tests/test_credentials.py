"""
Tests for credential budgets, validity periods and rotation.

    python -m unittest discover -s tests -v
"""
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.credentials import (  # noqa: E402
    Budget,
    BudgetKind,
    Credential,
    CredentialPool,
    CredentialState,
    NoCredentialAvailable,
    Window,
)


def utc_today() -> date:
    """Validity is evaluated in UTC, so the tests must use the same clock —
    a local date can be a day ahead and silently invert these assertions."""
    return datetime.now(timezone.utc).date()


def cred(cid: str, *budgets: Budget, secret: str = "s", **kw) -> Credential:
    c = Credential(id=cid, provider="p", secret_ref="ref", budgets=list(budgets), **kw)
    c.bind_secret(secret)
    return c


def requests_per(limit: int, window: Window = Window.DAY) -> Budget:
    return Budget(kind=BudgetKind.REQUESTS, limit=limit, window=window)


class TestBudgetKinds(unittest.TestCase):
    def test_requests_are_counted_per_call(self):
        c = cred("a", requests_per(2))
        self.assertTrue(c.can_afford())
        c.charge()
        c.charge()
        self.assertFalse(c.can_afford())
        self.assertIs(c.state(), CredentialState.EXHAUSTED)

    def test_credits_can_cost_more_than_one_per_call(self):
        # Twelve Data bills per symbol and per endpoint, so a request is not a
        # unit of anything.
        c = cred("a", Budget(kind=BudgetKind.CREDITS, limit=10, window=Window.DAY))
        self.assertTrue(c.can_afford({BudgetKind.CREDITS: 8}))
        c.charge({BudgetKind.CREDITS: 8})
        self.assertFalse(c.can_afford({BudgetKind.CREDITS: 8}))
        self.assertTrue(c.can_afford({BudgetKind.CREDITS: 2}))

    def test_bytes_budget_is_metered_separately(self):
        c = cred("a", Budget(kind=BudgetKind.BYTES, limit=1000, window=Window.MONTH))
        c.charge({BudgetKind.BYTES: 900})
        self.assertTrue(c.can_afford({BudgetKind.BYTES: 100}))
        self.assertFalse(c.can_afford({BudgetKind.BYTES: 101}))

    def test_symbols_budget_counts_distinct_not_calls(self):
        # Tiingo caps distinct symbols per month; asking for the same one
        # repeatedly must not consume more of it.
        c = cred("a", Budget(kind=BudgetKind.SYMBOLS, limit=2, window=Window.MONTH))
        c.charge(subject="600104")
        c.charge(subject="600104")
        c.charge(subject="600104")
        self.assertTrue(c.can_afford(subject="000002"), "a second symbol still fits")
        c.charge(subject="000002")
        self.assertFalse(c.can_afford(subject="AAPL"), "a third does not")
        self.assertTrue(c.can_afford(subject="600104"), "an already-counted one is free")

    def test_a_request_budget_does_not_consume_a_credit_budget(self):
        c = cred("a", requests_per(1),
                 Budget(kind=BudgetKind.CREDITS, limit=100, window=Window.DAY))
        c.charge({BudgetKind.REQUESTS: 1})
        snap = c.snapshot()["budgets"]
        self.assertEqual(snap["credits/day"]["used"], 0)


class TestValidity(unittest.TestCase):
    def test_an_expired_key_is_not_usable(self):
        c = cred("a", requests_per(10), valid_until=utc_today() - timedelta(days=1))
        self.assertIs(c.state(), CredentialState.EXPIRED)
        self.assertFalse(c.is_usable)

    def test_a_future_key_is_not_yet_usable(self):
        c = cred("a", requests_per(10), valid_from=utc_today() + timedelta(days=3))
        self.assertIs(c.state(), CredentialState.NOT_YET_VALID)

    def test_expiry_countdown_is_reported(self):
        c = cred("a", requests_per(10), valid_until=utc_today() + timedelta(days=7))
        self.assertEqual(c.expires_in_days(), 7)
        self.assertIs(c.state(), CredentialState.ACTIVE)

    def test_a_missing_secret_is_distinguished_from_an_exhausted_one(self):
        # These need different fixes, so they must not report the same state.
        c = Credential(id="a", provider="p", secret_ref="ref", budgets=[requests_per(10)])
        c.bind_secret("")
        self.assertIs(c.state(), CredentialState.MISSING_SECRET)

    def test_a_keyless_provider_is_still_usable(self):
        c = Credential(id="a", provider="p", secret_ref="", budgets=[requests_per(10)])
        self.assertIs(c.state(), CredentialState.ACTIVE)

    def test_disabled_beats_everything(self):
        c = cred("a", requests_per(10), enabled=False)
        self.assertIs(c.state(), CredentialState.DISABLED)


class TestHeadroom(unittest.TestCase):
    def test_headroom_is_the_tightest_budget(self):
        # A spent daily budget makes the key unusable however much of the
        # monthly one is left, so the minimum is what matters.
        c = cred("a", requests_per(10, Window.DAY),
                 Budget(kind=BudgetKind.REQUESTS, limit=1000, window=Window.MONTH))
        c.charge({BudgetKind.REQUESTS: 9})
        self.assertAlmostEqual(c.headroom(), 0.1, places=3)


class TestRotation(unittest.TestCase):
    def test_two_keys_are_two_budgets_not_one_shared(self):
        pool = CredentialPool("p", [cred("a", requests_per(1)), cred("b", requests_per(1))])
        first = pool.acquire()
        second = pool.acquire()
        self.assertNotEqual(first.id, second.id, "the second call must rotate")
        with self.assertRaises(NoCredentialAvailable):
            pool.acquire()

    def test_priority_is_preferred_over_headroom(self):
        cheap = cred("cheap", requests_per(100), priority=1)
        preferred = cred("preferred", requests_per(10), priority=0)
        pool = CredentialPool("p", [cheap, preferred])
        self.assertEqual(pool.acquire().id, "preferred")

    def test_headroom_breaks_ties_within_a_priority(self):
        a = cred("a", requests_per(10))
        b = cred("b", requests_per(10))
        a.charge({BudgetKind.REQUESTS: 5})
        pool = CredentialPool("p", [a, b])
        self.assertEqual(pool.acquire().id, "b", "load should spread, not drain one key")

    def test_expired_keys_are_skipped_not_selected(self):
        dead = cred("dead", requests_per(100), valid_until=utc_today() - timedelta(days=1))
        live = cred("live", requests_per(1))
        pool = CredentialPool("p", [dead, live])
        self.assertEqual(pool.acquire().id, "live")

    def test_the_error_says_why_each_key_was_unavailable(self):
        pool = CredentialPool("p", [
            cred("spent", requests_per(0)),
            cred("dead", requests_per(10), valid_until=utc_today() - timedelta(days=2)),
        ])
        with self.assertRaises(NoCredentialAvailable) as ctx:
            pool.acquire()
        reasons = ctx.exception.reasons
        self.assertIn("spent", reasons)
        self.assertIn("expired", reasons["dead"])

    def test_refund_returns_the_charge(self):
        pool = CredentialPool("p", [cred("a", requests_per(1))])
        lease = pool.acquire()
        lease.refund()
        pool.acquire()  # reusable because the call never happened

    def test_symbols_are_not_refunded(self):
        # A symbol once seen has been seen; the provider counted it.
        c = cred("a", Budget(kind=BudgetKind.SYMBOLS, limit=1, window=Window.MONTH))
        pool = CredentialPool("p", [c])
        lease = pool.acquire(subject="600104")
        lease.refund()
        self.assertTrue(c.can_afford(subject="600104"), "the same symbol is still free")
        self.assertFalse(c.can_afford(subject="000002"), "but the slot is spent")


class TestExpiryWarning(unittest.TestCase):
    def test_pool_reports_keys_expiring_soon(self):
        soon = cred("soon", requests_per(10), valid_until=utc_today() + timedelta(days=5))
        later = cred("later", requests_per(10), valid_until=utc_today() + timedelta(days=90))
        never = cred("never", requests_per(10))
        pool = CredentialPool("p", [soon, later, never])
        self.assertEqual([c.id for c in pool.expiring_within(30)], ["soon"])


class TestSnapshotSafety(unittest.TestCase):
    def test_a_snapshot_carries_no_secret(self):
        c = cred("a", requests_per(10), secret="SUPER-SECRET-VALUE")
        blob = repr(c.snapshot())
        self.assertNotIn("SUPER-SECRET-VALUE", blob)
        self.assertIn("headroom", blob)


if __name__ == "__main__":
    unittest.main(verbosity=2)
