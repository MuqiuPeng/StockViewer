"""
Tests for canonical instrument identity and provider symbol mapping.

These encode the venue rules, which are the part most likely to be got wrong
quietly: a code sent to the wrong exchange returns somebody else's prices
rather than an error.

    python -m unittest discover -s tests -v
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.instruments import (  # noqa: E402
    UnmappableInstrument,
    instrument_for,
    provider_symbol,
    resolve,
    strip_known_suffix,
)
from app.instruments.identity import (  # noqa: E402
    MIC_BEIJING,
    MIC_HONGKONG,
    MIC_SHANGHAI,
    MIC_SHENZHEN,
    MIC_US,
)


class TestExchangeClassification(unittest.TestCase):
    def test_shanghai_stock_prefixes(self):
        for sym in ("600104", "601398", "603288", "605358", "688981", "689009", "900901"):
            self.assertEqual(resolve("cn.stock", sym).mic, MIC_SHANGHAI, sym)

    def test_shenzhen_stock_prefixes(self):
        for sym in ("000002", "001979", "002594", "300750", "301236", "200002"):
            self.assertEqual(resolve("cn.stock", sym).mic, MIC_SHENZHEN, sym)

    def test_beijing_stock_prefixes(self):
        for sym in ("430047", "830799", "870204", "920002"):
            self.assertEqual(resolve("cn.stock", sym).mic, MIC_BEIJING, sym)

    def test_hong_kong_and_us(self):
        self.assertEqual(resolve("hk.stock", "00700").mic, MIC_HONGKONG)
        self.assertEqual(resolve("us.stock", "AAPL").mic, MIC_US)


class TestIndexVenuesDifferFromStocks(unittest.TestCase):
    """The bug this module was written to remove."""

    def test_000001_is_shanghai_as_an_index_and_shenzhen_as_a_stock(self):
        # SSE Composite vs Ping An Bank — same six digits, different venues.
        self.assertEqual(resolve("cn.index", "000001").mic, MIC_SHANGHAI)
        self.assertEqual(resolve("cn.stock", "000001").mic, MIC_SHENZHEN)

    def test_csi_300_is_shanghai(self):
        self.assertEqual(resolve("cn.index", "000300").mic, MIC_SHANGHAI)

    def test_shenzhen_component_index_is_shenzhen(self):
        self.assertEqual(resolve("cn.index", "399001").mic, MIC_SHENZHEN)


class TestCanonicalId(unittest.TestCase):
    def test_asset_class_comes_from_the_source(self):
        self.assertEqual(instrument_for("cn.stock", "600104").canonical_id,
                         "equity:XSHG:600104")
        self.assertEqual(instrument_for("cn.index", "000001").canonical_id,
                         "index:XSHG:000001")
        self.assertEqual(instrument_for("cn.etf", "510300").canonical_id,
                         "fund:XSHG:510300")
        self.assertEqual(instrument_for("cn.futures", "IF2409").canonical_id,
                         "future:XXXX:IF2409")

    def test_a_suffixed_symbol_resolves_the_same_as_a_bare_one(self):
        # The app's own rows may hold whichever form was current when written.
        for form in ("600104", "600104.SHH", "600104.SS"):
            self.assertEqual(instrument_for("cn.stock", form).canonical_id,
                             "equity:XSHG:600104")

    def test_strip_known_suffix_leaves_unknown_ones_alone(self):
        self.assertEqual(strip_known_suffix("600104.SHH"), "600104")
        self.assertEqual(strip_known_suffix("BRK.A"), "BRK.A")


class TestProviderMapping(unittest.TestCase):
    def test_eastmoney_uses_market_dot_code(self):
        self.assertEqual(provider_symbol("eastmoney", "cn.stock", "600104"), "1.600104")
        self.assertEqual(provider_symbol("eastmoney", "cn.stock", "000002"), "0.000002")
        self.assertEqual(provider_symbol("eastmoney", "hk.stock", "00700"), "116.00700")
        self.assertEqual(provider_symbol("eastmoney", "us.stock", "AAPL"), "105.AAPL")

    def test_eastmoney_files_beijing_with_shenzhen(self):
        # EastMoney gives Beijing no market code of its own.
        self.assertEqual(provider_symbol("eastmoney", "cn.stock", "830799"), "0.830799")

    def test_eastmoney_index_venue_matches_the_index_rules(self):
        self.assertEqual(provider_symbol("eastmoney", "cn.index", "000001"), "1.000001")
        self.assertEqual(provider_symbol("eastmoney", "cn.index", "399001"), "0.399001")

    def test_tiingo_wants_the_bare_ticker(self):
        self.assertEqual(provider_symbol("tiingo", "cn.stock", "600104"), "600104")
        self.assertEqual(provider_symbol("tiingo", "cn.stock", "600104.SHH"), "600104")
        self.assertEqual(provider_symbol("tiingo", "us.stock", "AAPL"), "AAPL")

    def test_alphavantage_suffixes_mainland_and_leaves_us_bare(self):
        self.assertEqual(provider_symbol("alphavantage", "cn.stock", "600104"), "600104.SHH")
        self.assertEqual(provider_symbol("alphavantage", "cn.stock", "000002"), "000002.SHZ")
        self.assertEqual(provider_symbol("alphavantage", "us.stock", "AAPL"), "AAPL")

    def test_alphavantage_refuses_venues_it_cannot_reach(self):
        # Neither .HK nor .HKG resolves there — verified against the live API.
        with self.assertRaises(UnmappableInstrument):
            provider_symbol("alphavantage", "hk.stock", "00700")

    def test_an_unknown_provider_gets_the_bare_symbol(self):
        self.assertEqual(provider_symbol("brand_new", "cn.stock", "600104"), "600104")


class TestOverrides(unittest.TestCase):
    def test_an_override_beats_the_rules(self):
        from app.instruments import mapping
        key = ("tiingo", "equity:XSHG:600104")
        mapping.SYMBOL_OVERRIDES[key] = "SAIC-SPECIAL"
        self.addCleanup(mapping.SYMBOL_OVERRIDES.pop, key, None)
        self.assertEqual(provider_symbol("tiingo", "cn.stock", "600104"), "SAIC-SPECIAL")


if __name__ == "__main__":
    unittest.main(verbosity=2)
