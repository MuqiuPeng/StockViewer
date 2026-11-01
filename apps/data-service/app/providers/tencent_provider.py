"""
Tencent finance data provider.

Exists to give the markets that had a single source a second, independent one.
Hong Kong was reachable only through EastMoney, and when a burst of requests
got this machine refused by EastMoney, every Hong Kong, index, ETF and futures
request went with it. Tencent is unofficial in the same way EastMoney is — no
published quota, no terms we can point at — but it fails separately, which is
the property that matters for a fallback.

Verified coverage: A-shares, B-shares, CDRs, ETFs, LOFs, Hong Kong equities
and indices, US equities and indices, and global indices — eleven of the
thirteen canonical sources, with daily history and no key. Only futures are
missing; IF2612 was tried bare and with the nf_/sh_ prefixes and all came back
empty.

That matters because before this, ETFs, LOFs, B-shares, CDRs and every index
except mainland ones had EastMoney as their only source, so an EastMoney block
took all of them out at once — which happened.

Depth runs to the instrument's first trading day — see _PAGE_BARS for how,
and why it was once believed to stop at 3.2 years. Tiingo reaches back to 2007
for the two markets it carries, so it still leads those chains on freshness;
Tencent is the deeper option for Hong Kong and indices, where the alternative
is EastMoney alone.

Field order
-----------
Rows arrive as ``[date, open, close, high, low, volume]``. Close is second,
not last, which is not the usual OHLC order and would silently produce wrong
candles if assumed. It was cross-checked rather than inferred: 600104 on
2026-08-21 reads 10.14 here, matching what Tiingo, EastMoney and Alpha Vantage
independently return, and every row satisfies high >= max(open, close) and
low <= min(open, close).

Hong Kong rows carry extra trailing elements holding corporate-action notes;
they are ignored.
"""
from __future__ import annotations

import json
import logging
import re
import time
from datetime import date
from typing import Any, Dict, List, Optional

import httpx

from ..cache import SeriesCache, SingleFlight
from ..gateway_config import load_config
from ..instruments import provider_symbol
from ..limits import QuotaExhausted, get_limiter
from ..resilience import backoff_delay
from .base import BaseDataProvider

logger = logging.getLogger(__name__)

_KLINE_URL = "https://web.ifzq.gtimg.cn/appstock/app/{endpoint}/get"

# Each market has its own kline endpoint; the response shape is the same.
_ENDPOINT_BY_SOURCE = {
    "cn.stock": "fqkline",
    "cn.stock.b": "fqkline",
    "cn.stock.cdr": "fqkline",
    "cn.index": "fqkline",
    "cn.etf": "fqkline",
    "cn.lof": "fqkline",
    "hk.stock": "hkfqkline",
    "hk.index": "hkfqkline",
    "us.stock": "usfqkline",
    "us.index": "usfqkline",
    "global.index": "usfqkline",
}

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://gu.qq.com/",
}

# Paging, and the two beliefs it replaces.
#
# This provider was read as capped at 800 bars — roughly 3.2 years — on two
# findings recorded here: that counts above 800 silently truncate to 640, and
# that filling the date slots returns an empty series. Both were re-probed
# against the live endpoint and neither holds as stated.
#
# The date slots work. A request for 2008-01-01..2008-12-31 returns that year;
# sh000001 goes back to 1990-12-19, its inception, and sh510300 to 2012-05-28,
# its listing day. The earlier probe most likely paired the dates with a count
# of 0, which does return nothing — reproduced — and attributed the emptiness
# to the dates.
#
# The count ceiling is real but is not 800 and is not monotonic. For sh000001,
# 1000 returns 1000 and 2000 returns 2000, while 2500 returns a malformed
# response. For sh510300 over one four-year window, 700 returns 700 while 1200
# returns 640 — asking for more yields less. Rather than model that, every
# request stays well inside the range that behaves: a window of _PAGE_YEARS
# holds about 490 trading days, and _PAGE_BARS is comfortably above it.
#
# Paging runs backward from the end of the wanted range, each page starting
# where the previous one's earliest bar left off. That is what makes a silent
# truncation harmless: a short page simply means the next one picks up sooner,
# and no span is skipped. A page that comes back empty means there is nothing
# before it — verified against instruments queried before their listing date —
# and ends the walk.
_PAGE_BARS = 800
_PAGE_YEARS = 2

# What this costs. A cold full-history fetch is now one request per two years
# — 18 for an index back to 1990, 8 for an ETF listed in 2012 — against a
# budget of 30 a minute and 600 an hour. So a full history takes about nine
# seconds at the configured minimum interval, and importing several
# instruments at once can exhaust the minute window, which surfaces as the
# QuotaExhausted path already handled in get_history. A bounded request is
# unaffected: asking for one year takes two pages. The cache makes either one
# a per-instrument, per-TTL cost rather than a per-request one.
#
# A stop, not an expectation. Walking from today to the floor below takes 18
# pages; the empty-page check normally ends it long before. If this is ever
# reached something upstream has changed shape, and it is logged.
_MAX_PAGES = 40

# No instrument this provider serves predates this, and the cache hands down a
# floor of 0001-01-01 when the caller named no start date. Clamping keeps the
# walk finite and the date arithmetic in range.
_EARLIEST = "1900-01-01"


def _parse(d: str) -> date:
    """Parse YYYY-MM-DD, tolerating the YYYYMMDD the API also accepts."""
    text = d.strip()
    if len(text) == 8 and text.isdigit():
        return date(int(text[:4]), int(text[4:6]), int(text[6:]))
    return date.fromisoformat(text[:10])


def _shift_years(d: str, years: int) -> str:
    """``d`` moved by whole years, clamped to _EARLIEST.

    Feb 29 lands on Feb 28 in a non-leap year rather than raising; the result
    is a window edge, so a day either way costs nothing.
    """
    parsed = _parse(d)
    target_year = parsed.year + years
    if target_year < _parse(_EARLIEST).year:
        return _EARLIEST
    try:
        return parsed.replace(year=target_year).isoformat()
    except ValueError:
        return parsed.replace(year=target_year, day=28).isoformat()


def _prev_day(d: str) -> str:
    return date.fromordinal(_parse(d).toordinal() - 1).isoformat()


class TencentProvider(BaseDataProvider):
    """Data provider backed by Tencent's public finance endpoints."""

    VERSION = "1.0.0"

    DATA_SOURCES: Dict[str, Dict] = {
        "cn.stock": {
            "name": "A股历史数据",
            "category": "A股",
            "symbol_format": "6位数字",
            "example": "600104",
            "params": ["symbol", "start_date", "end_date", "adjust"],
        },
        "hk.stock": {
            "name": "港股历史数据",
            "category": "港股",
            "symbol_format": "5位数字",
            "example": "00700",
            "params": ["symbol", "start_date", "end_date", "adjust"],
        },
        "us.stock": {
            "name": "美股历史数据",
            "category": "美股",
            "symbol_format": "股票代码",
            "example": "AAPL",
            "params": ["symbol", "start_date", "end_date", "adjust"],
        },
        "cn.stock.b": {
            "name": "B股历史数据",
            "category": "B股",
            "symbol_format": "6位数字",
            "example": "900901",
            "params": ["symbol", "start_date", "end_date", "adjust"],
        },
        "cn.stock.cdr": {
            "name": "CDR历史数据",
            "category": "CDR",
            "symbol_format": "6位数字",
            "example": "689009",
            "params": ["symbol", "start_date", "end_date", "adjust"],
        },
        "cn.etf": {
            "name": "场内ETF历史数据",
            "category": "ETF",
            "symbol_format": "6位数字",
            "example": "510300",
            "params": ["symbol", "start_date", "end_date", "adjust"],
        },
        "cn.lof": {
            "name": "LOF基金历史数据",
            "category": "LOF",
            "symbol_format": "6位数字",
            "example": "161725",
            "params": ["symbol", "start_date", "end_date", "adjust"],
        },
        "hk.index": {
            "name": "港股指数历史数据",
            "category": "指数",
            "symbol_format": "指数代码",
            "example": "HSI",
            "params": ["symbol", "start_date", "end_date", "adjust"],
        },
        "us.index": {
            "name": "美股指数历史数据",
            "category": "指数",
            "symbol_format": "指数代码",
            "example": ".IXIC",
            "params": ["symbol", "start_date", "end_date", "adjust"],
        },
        "global.index": {
            "name": "全球指数历史数据",
            "category": "指数",
            "symbol_format": "指数代码",
            "example": ".INX",
            "params": ["symbol", "start_date", "end_date", "adjust"],
        },
        "cn.index": {
            "name": "中国指数历史数据",
            "category": "指数",
            "symbol_format": "6位数字",
            "example": "000001",
            "params": ["symbol", "start_date", "end_date"],
        },
    }

    # Futures are the only thing this endpoint genuinely does not serve —
    # IF2612 was tried bare and with the nf_/sh_ prefixes, all empty.
    UNSUPPORTED: Dict[str, str] = {
        "cn.futures": "国内期货",
        "global.futures": "国际期货",
    }

    def __init__(self) -> None:
        config = load_config()
        provider_cfg = config.providers.get("tencent")
        limits = provider_cfg.limits if provider_cfg else None

        self._timeout = 20
        self._cache = SeriesCache(
            ttl=config.cache.ohlcv_daily_ttl_seconds,
            max_series=config.cache.max_series,
        )
        self._flight = SingleFlight()
        self._limiter = get_limiter(
            "tencent",
            max_concurrency=limits.concurrency if limits else 2,
            min_interval=limits.min_interval_seconds if limits else 0.5,
            windows=limits.windows() if limits else {},
        )

    # ------------------------------------------------------------------
    # Provider metadata
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "Tencent"

    @property
    def provider_version(self) -> str:
        return self.VERSION

    def health_check(self) -> Dict[str, Any]:
        stats = self._cache.stats
        return {
            "status": "healthy",
            "version": self.VERSION,
            "message": (
                f"{self._limiter.describe_usage()}; "
                f"cache served {stats['served_without_fetch']} window(s) with no "
                f"call, single-flight saved {self._flight.saved_calls}"
            ),
        }

    # ------------------------------------------------------------------
    # Symbol form
    # ------------------------------------------------------------------

    @staticmethod
    def _tencent_symbol(data_source: str, symbol: str) -> str:
        """
        Tencent prefixes the venue: sh/sz for the mainland, hk, us.

        Derived from the canonical instrument rather than the raw string, so
        the venue split matches every other provider.
        """
        from ..instruments import instrument_for
        from ..instruments.identity import (
            MIC_HONGKONG, MIC_SHANGHAI, MIC_SHENZHEN, MIC_US,
        )

        inst = instrument_for(data_source, symbol)
        local = inst.local_symbol

        # Indices do not follow the equity prefixes. Hong Kong ones are hkHSI,
        # while US and global ones carry a leading dot — us.IXIC, us.INX —
        # which is how they are distinguished from tickers of the same name.
        if data_source == "hk.index":
            return f"hk{local.lstrip('.')}"
        if data_source in ("us.index", "global.index"):
            return f"us.{local.lstrip('.')}"

        if inst.mic == MIC_HONGKONG:
            # Hong Kong codes are five digits here, zero-padded.
            return f"hk{local.zfill(5)}"
        if inst.mic == MIC_US:
            # US tickers carry an exchange suffix Tencent expects; .OQ covers
            # NASDAQ-listed names, which is what the app asks for in practice.
            return f"us{local}.OQ"
        if inst.mic == MIC_SHANGHAI:
            return f"sh{local}"
        if inst.mic == MIC_SHENZHEN:
            return f"sz{local}"
        return f"sh{local}"

    # ------------------------------------------------------------------
    # Historical OHLCV
    # ------------------------------------------------------------------

    def get_history(
        self,
        data_source: str,
        symbol: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        adjust: Optional[str] = None,
        period: Optional[str] = None,
    ) -> Dict[str, Any]:
        if data_source in self.UNSUPPORTED:
            return {
                "success": False,
                "error": (
                    f"The Tencent provider does not serve "
                    f"{self.UNSUPPORTED[data_source]} ({data_source}) yet; use "
                    f"the eastmoney provider for this market."
                ),
                "error_code": "UNSUPPORTED_SOURCE",
            }

        if data_source not in self.DATA_SOURCES:
            return {
                "success": False,
                "error": f"Unknown data source: {data_source}",
                "error_code": "INVALID_DATA_SOURCE",
            }

        if period and period != "daily":
            return {
                "success": False,
                "error": f"This provider serves daily bars only; '{period}' is not wired up.",
                "error_code": "INVALID_TYPE",
            }

        tsym = self._tencent_symbol(data_source, symbol)
        adjusted = adjust not in (None, "", "none")

        # Only one series exists upstream, so raw and adjusted requests share a
        # cache entry rather than fetching the same bars twice.
        key = self._cache.key("tencent", data_source, tsym, True)
        on_hand, gap = self._cache.plan(key, start_date, end_date)

        if gap is None:
            records = on_hand
        else:
            flight_key = f"{key}|{gap[0]}|{gap[1]}"
            try:
                records = self._flight.do(
                    flight_key,
                    lambda: self._fetch_and_merge(
                        key, data_source, tsym, gap, adjusted, start_date, end_date
                    ),
                )
            except QuotaExhausted as exc:
                return {
                    "success": False,
                    "error": (
                        f"Tencent {exc.window} limit reached ({exc.limit} requests); "
                        f"resets in {exc.resets_in_seconds}s."
                    ),
                    "error_code": "FETCH_ERROR",
                }
            except Exception as exc:
                logger.error("Tencent fetch error for %s: %s", tsym, exc)
                return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

        if not records:
            return {
                "success": False,
                "error": f"No data in the requested range for symbol: {tsym}",
                "error_code": "NO_DATA",
            }

        data: Dict[str, Any] = {
            "symbol": symbol.strip().upper(),
            "data_source": data_source,
            "first_date": records[0]["date"],
            "last_date": records[-1]["date"],
            "row_count": len(records),
            "records": records,
        }

        if not adjusted:
            data["adjust_ignored"] = (
                "Tencent has no reliable unadjusted series — the request returns "
                "an empty response for Hong Kong and US symbols — so "
                "forward-adjusted prices were returned instead."
            )

        return {"success": True, "data": data}

    def _fetch_and_merge(
        self,
        key: str,
        data_source: str,
        tsym: str,
        gap: tuple[str, str],
        adjusted: bool,
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> List[Dict[str, Any]]:
        endpoint = _ENDPOINT_BY_SOURCE.get(data_source, "fqkline")
        bars = self._fetch_paged(endpoint, tsym, floor=gap[0], ceiling=gap[1])

        # Coverage is the union of what was asked for and what arrived, which
        # is wider than what arrived on purpose. A request reaching past an
        # instrument's first trading day legitimately returns nothing for that
        # stretch, and recording only the bars would leave the empty years
        # permanently uncovered — re-walked on every call, to learn the same
        # nothing. The cache TTL is what reopens the question later.
        if bars:
            covered = (min(bars[0]["date"], gap[0]), max(bars[-1]["date"], gap[1]))
        else:
            covered = gap
        return self._cache.store(key, covered, bars, start_date, end_date)

    def _fetch_paged(
        self, endpoint: str, tsym: str, floor: str, ceiling: str
    ) -> List[Dict[str, Any]]:
        """Walk backward from ``ceiling`` to ``floor``, a window at a time.

        Backward rather than forward because the count selects from the *end*
        of a window: asking for 2015-01-01..2026-10-31 with a count of 300
        returns the most recent 300 bars, not the first. Anchoring each page to
        a date that has already been reached is what makes the walk exact.
        """
        floor = max(floor, _EARLIEST)
        by_date: Dict[str, Dict[str, Any]] = {}
        cursor = ceiling
        pages = 0

        while pages < _MAX_PAGES:
            window_start = max(floor, _shift_years(cursor, -_PAGE_YEARS))
            # Always ask for the adjusted series. An empty adjustment slot is
            # not a usable "raw" mode here: A-shares fall back to a `day` key,
            # Hong Kong returns no data node at all, and US returns a node with
            # no series. Serving adjusted data and saying so beats serving
            # nothing.
            params = {
                "_var": "kline",
                "param": f"{tsym},day,{window_start},{cursor},{_PAGE_BARS},qfq",
            }
            with self._limiter.acquire():
                payload = self._get(_KLINE_URL.format(endpoint=endpoint), params)

            page = self._to_records(self._extract_rows(payload, tsym))
            pages += 1
            if not page:
                # Nothing before this point. Either the instrument had not
                # listed yet, or the provider's own run ends here.
                break

            for bar in page:
                by_date[bar["date"]] = bar

            earliest = min(bar["date"] for bar in page)
            if earliest <= floor:
                break
            # Resume at the day before the oldest bar actually received. If
            # this page was truncated, the next one simply starts sooner.
            cursor = _prev_day(earliest)
            if cursor < floor:
                break
        else:
            logger.warning(
                "Tencent paging for %s stopped at the %d-page limit (floor %s, "
                "reached %s); history may be incomplete.",
                tsym,
                _MAX_PAGES,
                floor,
                min(by_date) if by_date else "nothing",
            )

        return [by_date[d] for d in sorted(by_date)]

    # ------------------------------------------------------------------
    # HTTP + parsing
    # ------------------------------------------------------------------

    def _get(self, url: str, params: Dict[str, str]) -> Dict[str, Any]:
        last_exc: Optional[Exception] = None
        for attempt in range(1, 4):
            try:
                with httpx.Client(
                    timeout=self._timeout,
                    follow_redirects=True,
                    trust_env=True,
                    headers=_HEADERS,
                ) as client:
                    r = client.get(url, params=params)
                r.raise_for_status()
                # The response is a JS assignment, not bare JSON.
                return self._parse_jsonp(r.text)
            except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.ReadError) as exc:
                last_exc = exc
                if attempt < 3:
                    delay = backoff_delay(attempt)
                    logger.warning(
                        "Tencent connection error (attempt %d/3): %s — retrying in %.1fs",
                        attempt, exc, delay,
                    )
                    time.sleep(delay)
                    continue
                raise
        raise last_exc or RuntimeError("Tencent request failed")

    @staticmethod
    def _parse_jsonp(text: str) -> Dict[str, Any]:
        """Pull the JSON object out of `kline={...};`."""
        match = re.search(r"=\s*(\{.*\})\s*;?\s*$", text.strip(), re.S)
        if match is None:
            match = re.search(r"(\{.*\})", text, re.S)
        if match is None:
            raise RuntimeError(f"Unrecognised Tencent response: {text[:120]}")
        return json.loads(match.group(1))

    @staticmethod
    def _extract_rows(payload: Dict[str, Any], tsym: str) -> List[List[Any]]:
        node = (payload.get("data") or {}).get(tsym) or {}
        # Adjusted and raw series live under different keys; take whichever the
        # request produced.
        for candidate in ("qfqday", "day", "hfqday"):
            rows = node.get(candidate)
            if rows:
                return rows
        return []

    @staticmethod
    def _to_records(rows: List[List[Any]]) -> List[Dict[str, Any]]:
        """
        Convert Tencent rows into canonical records.

        The order is [date, open, close, high, low, volume] — close second, not
        last. Hong Kong rows carry further elements with corporate-action
        notes, which are ignored.
        """
        out: List[Dict[str, Any]] = []
        for row in rows:
            if len(row) < 6:
                continue
            try:
                out.append(
                    {
                        "date": str(row[0])[:10],
                        "open": float(row[1]),
                        "close": float(row[2]),
                        "high": float(row[3]),
                        "low": float(row[4]),
                        "volume": int(float(row[5])),
                    }
                )
            except (TypeError, ValueError) as exc:
                logger.warning("Skipping malformed Tencent row %s: %s", row[:1], exc)
        out.sort(key=lambda r: r["date"])
        return out

    # ------------------------------------------------------------------
    # Listing endpoints — not wired up
    # ------------------------------------------------------------------

    def _listing_unsupported(self, what: str) -> Dict[str, Any]:
        return {
            "success": False,
            "error": (
                f"The Tencent provider does not serve {what}; it covers history "
                f"only. Use the eastmoney provider for listings."
            ),
            "error_code": "UNSUPPORTED_SOURCE",
        }

    def get_stock_list(self, market: str = "a_share", include_delisted: bool = False):
        return self._listing_unsupported("stock lists")

    def get_index_list(self, market: str = "zh"):
        return self._listing_unsupported("index lists")

    def get_fund_list(self, fund_type: str = "etf"):
        return self._listing_unsupported("fund lists")

    def get_futures_list(self):
        return self._listing_unsupported("futures lists")

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    def get_data_sources(self) -> Dict[str, Any]:
        return {
            "success": True,
            "data": {
                "sources": [
                    {
                        "id": sid,
                        "name": cfg["name"],
                        "category": cfg["category"],
                        "symbol_format": cfg.get("symbol_format"),
                        "example_symbol": cfg.get("example"),
                        "parameters": cfg.get("params", []),
                    }
                    for sid, cfg in self.DATA_SOURCES.items()
                ]
            },
        }
