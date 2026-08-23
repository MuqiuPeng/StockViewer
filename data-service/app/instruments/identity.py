"""
Canonical instrument identity.

A ticker on its own does not identify anything: 000002 is Vanke in Shenzhen,
and six-digit codes are reused across exchanges and over time. What identifies
an instrument is the pair (venue, local symbol), so that is what this module
produces, in the form the design document specifies::

    equity:XSHG:600519
    equity:XSHE:000002

The venue is a MIC (ISO 10383), which is the one exchange identifier every
data vendor can be mapped onto, rather than each provider's private notion of
"market 1" or ".SHH".

Deliberately not here
---------------------
No ISIN, FIGI, CIK, issuer grouping or validity periods yet. Those exist to
record facts that cannot be derived — a ticker that changed hands, an ADR and
its ordinary share, a dual listing — and this codebase has none of them to
record. Adding the columns before there is anything to put in them would be
storing what a rule already computes. The canonical id here is stable enough
that adding a persistent registry later does not invalidate it.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# ISO 10383 Market Identifier Codes for the venues this service reaches.
MIC_SHANGHAI = "XSHG"
MIC_SHENZHEN = "XSHE"
MIC_BEIJING = "XBEI"
MIC_HONGKONG = "XHKG"
MIC_US = "XNAS"  # US equities are not split by listing venue here; see below.
MIC_ASX = "XASX"

# Canonical data sources that carry mainland A-share style six-digit codes.
_CN_SIX_DIGIT_SOURCES = {"cn.stock", "cn.stock.b", "cn.stock.cdr", "cn.etf", "cn.lof"}


@dataclass(frozen=True)
class Instrument:
    """What a request is actually about, independent of any provider."""

    asset_class: str        # "equity", "index", "fund", "future"
    mic: str                # ISO 10383 venue code
    local_symbol: str       # the symbol as the exchange writes it
    data_source: str        # the canonical source it was resolved under

    @property
    def canonical_id(self) -> str:
        return f"{self.asset_class}:{self.mic}:{self.local_symbol}"

    def __str__(self) -> str:  # pragma: no cover - debugging aid
        return self.canonical_id


def classify_cn_exchange(symbol: str) -> str:
    """
    Which mainland venue a six-digit code belongs to.

    The prefix ranges are the exchanges' own allocations:
      Shanghai  600/601/603/605 main board, 688 STAR, 689 CDR, 900 B-shares
      Shenzhen  000/001/002/003 main board, 300/301 ChiNext, 200 B-shares
      Beijing   43/83/87/88 (four-digit prefixes), 920

    This exists because the three providers disagreed. EastMoney treated every
    9xxxxx as Shanghai while Alpha Vantage accepted only 900xxx; both happen to
    work because Shanghai B-shares are all 900xxx, but only by accident. One
    rule, stated once, removes that class of latent difference.
    """
    s = symbol.strip()

    if s.startswith(("600", "601", "603", "605", "688", "689", "900")):
        return MIC_SHANGHAI
    if s.startswith(("000", "001", "002", "003", "300", "301", "200")):
        return MIC_SHENZHEN
    if s.startswith(("43", "83", "87", "88", "920")):
        return MIC_BEIJING

    # Shanghai funds start with 5, Shenzhen funds with 1.
    if s.startswith("5"):
        return MIC_SHANGHAI
    if s.startswith("1"):
        return MIC_SHENZHEN

    # Fall back on the coarse split the providers used, rather than refusing:
    # an unrecognised prefix is more likely a new allocation than a bad code.
    return MIC_SHANGHAI if s.startswith(("6", "9")) else MIC_SHENZHEN


def classify_cn_index_exchange(symbol: str) -> str:
    """
    Which mainland venue an index code belongs to.

    Indices have their own numbering, unrelated to the stock ranges: Shanghai
    publishes 000xxx (000001 is the SSE Composite, 000300 the CSI 300) while
    Shenzhen publishes 399xxx. Applying the stock rules here would send 000001
    to Shenzhen, where as a *stock* code it is Ping An Bank — the same six
    digits meaning different venues depending on what is being asked for.
    """
    s = symbol.strip()
    if s.startswith("399") or s.startswith("3"):
        return MIC_SHENZHEN
    return MIC_SHANGHAI


def _asset_class_for(data_source: str) -> str:
    if data_source.endswith(".index"):
        return "index"
    if data_source.endswith((".etf", ".lof")):
        return "fund"
    if data_source.endswith(".futures"):
        return "future"
    return "equity"


def resolve(data_source: str, symbol: str) -> Instrument:
    """
    Turn a request's (data_source, symbol) into a canonical instrument.

    The symbol is accepted in whatever form the caller has — bare, or carrying
    a provider suffix — because the app's own database still stores whichever
    form was current when a row was written.
    """
    local = strip_known_suffix(symbol).strip().upper()
    asset_class = _asset_class_for(data_source)

    if data_source == "cn.index":
        mic = classify_cn_index_exchange(local)
    elif data_source in _CN_SIX_DIGIT_SOURCES:
        mic = classify_cn_exchange(local)
    elif data_source.startswith("hk."):
        mic = MIC_HONGKONG
    elif data_source.startswith("us."):
        mic = MIC_US
    elif data_source.startswith("au."):
        mic = MIC_ASX
    elif data_source.endswith(".futures"):
        # Futures do not trade on the stock exchanges at all — they are on
        # CFFEX, SHFE, DCE and ZCE, and the contract code alone does not say
        # which. Leaving the venue unresolved is honest; claiming Shenzhen
        # would not be. EastMoney reaches them under market 113 regardless.
        mic = "XXXX"
    elif data_source.startswith("cn."):
        mic = classify_cn_exchange(local)
    else:
        mic = "XXXX"  # global/unknown venue; still identifies the pair

    return Instrument(
        asset_class=asset_class,
        mic=mic,
        local_symbol=local,
        data_source=data_source,
    )


# Suffixes providers append, stripped so an instrument resolves the same way
# whichever provider's form arrives.
_KNOWN_SUFFIXES = (".SHH", ".SHZ", ".SS", ".SZ", ".SH", ".HK", ".HKG")


def strip_known_suffix(symbol: str) -> str:
    s = symbol.strip().upper()
    for suffix in _KNOWN_SUFFIXES:
        if s.endswith(suffix):
            return s[: -len(suffix)]
    return s
