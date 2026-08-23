"""
Tests for capability-aware routing.

Uses fake providers rather than the real ones, so fallback behaviour is
deterministic and costs no upstream requests.

    python -m unittest discover -s tests -v
"""
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.limits.rate_limiter import QuotaExhausted  # noqa: E402
from app.routing import router as router_mod  # noqa: E402
from app.routing.router import ProviderRouter  # noqa: E402


class FakeProvider:
    """Minimal stand-in exposing just what routing touches."""

    def __init__(self, name: str, sources: List[str], behaviour: Any = "ok") -> None:
        self.name = name
        self._sources = sources
        self._behaviour = behaviour
        self.calls = 0

    def supports(self, data_source: str) -> bool:
        return data_source in self._sources

    def fetch(self) -> Dict[str, Any]:
        self.calls += 1
        if self._behaviour == "ok":
            return {"success": True, "data": {"from": self.name}}
        if isinstance(self._behaviour, QuotaExhausted):
            raise self._behaviour
        if self._behaviour == "raise":
            raise RuntimeError(f"{self.name} exploded")
        # otherwise a provider-level error dict
        return {"success": False, "error": f"{self.name} says no",
                "error_code": self._behaviour}


class RouterTestCase(unittest.TestCase):
    """Patches the registry the router reads from."""

    def install(self, providers: Dict[str, FakeProvider]) -> None:
        self._providers = providers
        router_mod.get_provider = lambda name: providers[name]      # type: ignore[assignment]
        router_mod.list_providers = lambda: {k: "Fake" for k in providers}  # type: ignore[assignment]
        self.addCleanup(self._restore)

    def _restore(self) -> None:
        import importlib
        importlib.reload(router_mod)


class TestCandidateFiltering(RouterTestCase):
    def test_providers_without_the_source_are_dropped(self):
        self.install({
            "a": FakeProvider("a", ["us.stock"]),
            "b": FakeProvider("b", ["cn.stock", "us.stock"]),
        })
        r = ProviderRouter({"cn.stock": ["a", "b"]})
        self.assertEqual(r.candidates("cn.stock"), ["b"])

    def test_unregistered_providers_are_dropped(self):
        self.install({"b": FakeProvider("b", ["cn.stock"])})
        r = ProviderRouter({"cn.stock": ["ghost", "b"]})
        self.assertEqual(r.candidates("cn.stock"), ["b"])

    def test_no_candidate_reports_capability_unavailable(self):
        self.install({"a": FakeProvider("a", ["us.stock"])})
        r = ProviderRouter({"cn.futures": ["a"]})
        out = r.execute(lambda p: p.fetch(), data_source="cn.futures")
        self.assertFalse(out.result["success"])
        self.assertEqual(out.result["error_code"], "CAPABILITY_UNAVAILABLE")
        self.assertIsNone(out.provider)


class TestOrderAndFallback(RouterTestCase):
    def test_first_capable_provider_wins_and_others_are_untouched(self):
        a = FakeProvider("a", ["cn.stock"])
        b = FakeProvider("b", ["cn.stock"])
        self.install({"a": a, "b": b})
        out = ProviderRouter({"cn.stock": ["a", "b"]}).execute(
            lambda p: p.fetch(), data_source="cn.stock")
        self.assertEqual(out.provider, "a")
        self.assertEqual(b.calls, 0)
        self.assertFalse(out.fallback_used)

    def test_falls_through_a_failing_provider(self):
        a = FakeProvider("a", ["cn.stock"], "FETCH_ERROR")
        b = FakeProvider("b", ["cn.stock"])
        self.install({"a": a, "b": b})
        out = ProviderRouter({"cn.stock": ["a", "b"]}).execute(
            lambda p: p.fetch(), data_source="cn.stock")
        self.assertEqual(out.provider, "b")
        self.assertTrue(out.fallback_used)
        self.assertIn("a", out.fallback_reason)
        self.assertEqual(out.provenance()["attempted"], ["a", "b"])

    def test_falls_through_an_exhausted_quota(self):
        a = FakeProvider("a", ["cn.stock"], QuotaExhausted("hour", 50, 900))
        b = FakeProvider("b", ["cn.stock"])
        self.install({"a": a, "b": b})
        out = ProviderRouter({"cn.stock": ["a", "b"]}).execute(
            lambda p: p.fetch(), data_source="cn.stock")
        self.assertEqual(out.provider, "b")
        self.assertIn("quota", out.fallback_reason)

    def test_falls_through_a_provider_that_raises(self):
        a = FakeProvider("a", ["cn.stock"], "raise")
        b = FakeProvider("b", ["cn.stock"])
        self.install({"a": a, "b": b})
        out = ProviderRouter({"cn.stock": ["a", "b"]}).execute(
            lambda p: p.fetch(), data_source="cn.stock")
        self.assertEqual(out.provider, "b")

    def test_a_bad_request_stops_the_chain(self):
        # INVALID_DATA_SOURCE will fail identically everywhere; trying the rest
        # of the chain would only spend budget.
        a = FakeProvider("a", ["cn.stock"], "INVALID_DATA_SOURCE")
        b = FakeProvider("b", ["cn.stock"])
        self.install({"a": a, "b": b})
        out = ProviderRouter({"cn.stock": ["a", "b"]}).execute(
            lambda p: p.fetch(), data_source="cn.stock")
        self.assertIsNone(out.provider)
        self.assertEqual(b.calls, 0, "the chain must stop on a caller error")

    def test_all_failing_returns_the_last_error_with_full_provenance(self):
        a = FakeProvider("a", ["cn.stock"], "FETCH_ERROR")
        b = FakeProvider("b", ["cn.stock"], "NO_DATA")
        self.install({"a": a, "b": b})
        out = ProviderRouter({"cn.stock": ["a", "b"]}).execute(
            lambda p: p.fetch(), data_source="cn.stock")
        self.assertIsNone(out.provider)
        self.assertEqual(out.result["error_code"], "NO_DATA")
        self.assertEqual(out.provenance()["attempted"], ["a", "b"])
        self.assertFalse(out.provenance()["fallback_used"],
                         "nothing answered, so nothing fell back to")


class TestProvenance(RouterTestCase):
    def test_direct_hit_reports_no_fallback(self):
        self.install({"a": FakeProvider("a", ["cn.stock"])})
        out = ProviderRouter({"cn.stock": ["a"]}).execute(
            lambda p: p.fetch(), data_source="cn.stock")
        prov = out.provenance()
        self.assertEqual(prov["provider"], "a")
        self.assertFalse(prov["fallback_used"])
        self.assertIsNone(prov["fallback_reason"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
