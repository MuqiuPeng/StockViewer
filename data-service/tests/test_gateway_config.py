"""
Tests for the provider configuration schema.

The point of validating on load is that a bad edit fails at startup with a
field path, rather than at the moment a provider is first called — by which
time the caller sees a fetch error and nobody suspects the config.

    python -m unittest discover -s tests -v
"""
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.gateway_config import (  # noqa: E402
    GatewayConfig,
    Limits,
    ProviderConfig,
    load_config,
)


def write_config(body: str) -> str:
    fh = tempfile.NamedTemporaryFile("w", suffix=".toml", delete=False)
    fh.write(textwrap.dedent(body))
    fh.close()
    return fh.name


class TestLimits(unittest.TestCase):
    def test_windows_are_shaped_for_the_limiter(self):
        limits = Limits(requests_per_hour=50, requests_per_day=1000)
        self.assertEqual(
            limits.windows(), {"hour": (50, 3600), "day": (1000, 86400)}
        )

    def test_absent_budgets_produce_no_window(self):
        self.assertEqual(Limits().windows(), {})

    def test_concurrency_must_be_positive(self):
        with self.assertRaises(Exception):
            Limits(concurrency=0)

    def test_limits_are_unverified_by_default(self):
        # Defaulting to "verified" would let a documentation figure pass for a
        # confirmed one, which is how you get blocked.
        self.assertFalse(Limits().verified)


class TestUsageContext(unittest.TestCase):
    def test_unknown_usage_context_is_rejected(self):
        with self.assertRaises(Exception):
            ProviderConfig(allowed_usage=["public_broadcast"])

    def test_permits_matches_only_declared_contexts(self):
        cfg = ProviderConfig(allowed_usage=["internal_research"])
        self.assertTrue(cfg.permits("internal_research"))
        self.assertFalse(cfg.permits("commercial_display"))

    def test_usable_providers_excludes_disabled_and_unlicensed(self):
        config = GatewayConfig.model_validate({
            "gateway": {"usage_context": "commercial_display"},
            "providers": {
                "ok":        {"enabled": True,  "allowed_usage": ["commercial_display"]},
                "off":       {"enabled": False, "allowed_usage": ["commercial_display"]},
                "internal":  {"enabled": True,  "allowed_usage": ["internal_research"]},
            },
        })
        self.assertEqual(config.usable_providers(), ["ok"])


class TestRouting(unittest.TestCase):
    def test_default_key_is_not_treated_as_a_data_source(self):
        config = GatewayConfig.model_validate({
            "routing": {"cn.stock": ["a"], "default": ["b"]},
        })
        self.assertEqual(config.routes(), {"cn.stock": ["a"]})
        self.assertEqual(config.default_chain(), ["b"])


class TestLoading(unittest.TestCase):
    def test_a_valid_file_loads(self):
        path = write_config("""
            [gateway]
            usage_context = "internal_research"

            [providers.demo]
            enabled = true
            allowed_usage = ["internal_research"]

            [providers.demo.limits]
            requests_per_hour = 10
            concurrency = 2

            [routing]
            "cn.stock" = ["demo"]
        """)
        config = load_config(path)
        self.assertEqual(config.usable_providers(), ["demo"])
        self.assertEqual(config.providers["demo"].limits.windows(), {"hour": (10, 3600)})

    def test_a_malformed_file_raises_rather_than_falling_back(self):
        path = write_config("""
            [gateway]
            usage_context = "not_a_real_context"
        """)
        with self.assertRaises(RuntimeError) as ctx:
            load_config(path)
        self.assertIn("usage_context", str(ctx.exception))

    def test_a_missing_file_falls_back_to_defaults(self):
        config = load_config("/nonexistent/providers.toml")
        self.assertEqual(config.providers, {})
        self.assertEqual(config.gateway.usage_context, "internal_research")

    def test_unverified_limits_are_reported(self):
        path = write_config("""
            [providers.a]
            [providers.a.limits]
            requests_per_day = 25

            [providers.b]
            [providers.b.limits]
            requests_per_day = 100
            verified = true
        """)
        self.assertEqual(load_config(path).unverified_limits(), ["a"])


class TestShippedConfig(unittest.TestCase):
    """The real file has to be valid, or the service will not start."""

    def test_the_shipped_config_is_valid(self):
        config = load_config()
        self.assertIn("eastmoney", config.providers)
        self.assertIn("tiingo", config.providers)
        self.assertEqual(config.gateway.usage_context, "internal_research")

    def test_every_routed_provider_is_declared(self):
        config = load_config()
        declared = set(config.providers)
        for source, chain in config.routes().items():
            for name in chain:
                self.assertIn(name, declared,
                              f"{source} routes to undeclared provider '{name}'")
        for name in config.default_chain():
            self.assertIn(name, declared)

    def test_no_secret_is_stored_in_the_config(self):
        # api_key_setting names a Settings field; the value must never be here.
        raw = (Path(__file__).resolve().parent.parent / "config" / "providers.toml").read_text()
        for marker in ("api_key =", "token =", "secret ="):
            self.assertNotIn(marker, raw)


if __name__ == "__main__":
    unittest.main(verbosity=2)
