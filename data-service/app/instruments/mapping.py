"""
Provider symbol mapping.

One instrument, three spellings — 600104 reaches EastMoney as ``1.600104``,
Tiingo as ``600104`` and Alpha Vantage as ``600104.SHH``. Each adapter used to
carry its own conversion, which is how the venue rules drifted apart: EastMoney
treated every 9xxxxx as Shanghai, Alpha Vantage only 900xxx. Both worked, but
only because Shanghai B-shares happen to all start 900.

Mapping is derived from the canonical instrument rather than from the raw
string, so a symbol arriving in any provider's form resolves the same way.

Overrides
---------
Rules cover everything this codebase currently needs, because mainland and US
symbols are systematic. Exceptions are not: a ticker that changed, a listing a
provider files under a different code. Those go in `SYMBOL_OVERRIDES`, checked
before the rules, so an exception is a data edit rather than a special case
buried in a conversion function.
"""
from __future__ import annotations

import logging
from typing import Callable, Dict, Optional, Tuple

from .identity import (
    MIC_BEIJING,
    MIC_HONGKONG,
    MIC_SHANGHAI,
    MIC_SHENZHEN,
    Instrument,
    resolve,
)

logger = logging.getLogger(__name__)


class UnmappableInstrument(RuntimeError):
    """The provider has no symbol form for this instrument."""


# (provider, canonical_id) -> provider symbol. Exceptions only; the rules below
# handle everything systematic.
SYMBOL_OVERRIDES: Dict[Tuple[str, str], str] = {}


# ── EastMoney ─────────────────────────────────────────────────────────────
#
# secid is "market.code". Market 1 is Shanghai, 0 is Shenzhen — and also
# Beijing, which EastMoney files with Shenzhen rather than giving it a code of
# its own. 116 is Hong Kong, 105 US.

_EM_MARKET_BY_MIC = {
    MIC_SHANGHAI: "1",
    MIC_SHENZHEN: "0",
    MIC_BEIJING: "0",
    MIC_HONGKONG: "116",
}


def _to_eastmoney(inst: Instrument) -> str:
    if inst.data_source.startswith("us."):
        return f"105.{inst.local_symbol}"
    if inst.data_source in ("cn.futures", "global.futures"):
        return f"113.{inst.local_symbol}"
    if inst.data_source == "global.index":
        return f"1.{inst.local_symbol}"
    market = _EM_MARKET_BY_MIC.get(inst.mic)
    if market is None:
        # Unknown venue: let EastMoney decide rather than refusing, matching
        # what the adapter did before.
        return f"1.{inst.local_symbol}"
    return f"{market}.{inst.local_symbol}"


# ── Tiingo ────────────────────────────────────────────────────────────────
#
# Bare ticker for both markets it carries. Verified: suffixed forms return
# "Ticker not found".

def _to_tiingo(inst: Instrument) -> str:
    return inst.local_symbol


# ── Alpha Vantage ─────────────────────────────────────────────────────────
#
# Non-US venues are reached with a suffix. Only Shanghai and Shenzhen are
# supported for mainland China; Beijing has no suffix and Hong Kong is not
# reachable at all (neither .HK nor .HKG resolves — checked).

_AV_SUFFIX_BY_MIC = {
    MIC_SHANGHAI: ".SHH",
    MIC_SHENZHEN: ".SHZ",
}


def _to_alphavantage(inst: Instrument) -> str:
    if inst.data_source.startswith("us."):
        return inst.local_symbol
    suffix = _AV_SUFFIX_BY_MIC.get(inst.mic)
    if suffix is None:
        raise UnmappableInstrument(
            f"Alpha Vantage has no symbol form for {inst.canonical_id}; it "
            f"reaches Shanghai and Shenzhen via .SHH/.SHZ and US tickers bare."
        )
    return f"{inst.local_symbol}{suffix}"


_MAPPERS: Dict[str, Callable[[Instrument], str]] = {
    "eastmoney": _to_eastmoney,
    "tiingo": _to_tiingo,
    "alphavantage": _to_alphavantage,
}


def provider_symbol(provider: str, data_source: str, symbol: str) -> str:
    """
    The symbol `provider` expects for this instrument.

    Raises UnmappableInstrument when the provider has no form for it, which is
    a different thing from the provider not carrying the market — routing
    filters that case out earlier.
    """
    inst = resolve(data_source, symbol)

    override = SYMBOL_OVERRIDES.get((provider, inst.canonical_id))
    if override is not None:
        logger.debug("Symbol override for %s on %s: %s",
                     inst.canonical_id, provider, override)
        return override

    mapper = _MAPPERS.get(provider)
    if mapper is None:
        # An adapter with no registered mapping gets the bare symbol, which is
        # the most common convention and what a new provider most likely wants.
        return inst.local_symbol
    return mapper(inst)


def instrument_for(data_source: str, symbol: str) -> Instrument:
    """Canonical instrument for a request, for logging and cache keys."""
    return resolve(data_source, symbol)
