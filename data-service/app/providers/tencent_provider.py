"""
Tencent finance data provider.

Exists to give the markets that had a single source a second, independent one.
Hong Kong was reachable only through EastMoney, and when a burst of requests
got this machine refused by EastMoney, every Hong Kong, index, ETF and futures
request went with it. Tencent is unofficial in the same way EastMoney is — no
published quota, no terms we can point at — but it fails separately, which is
the property that matters for a fallback.

Verified coverage: A-shares, Hong Kong, US equities and mainland indices, all
with daily history and no key.

Depth is capped at roughly 3.2 years — see _MAX_BARS. Tiingo reaches back to
2007 for the two markets it carries, so it still leads those chains; Tencent
is the deeper option only for Hong Kong and indices, where the alternative is
EastMoney alone.

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
    "cn.index": "fqkline",
    "cn.etf": "fqkline",
    "cn.lof": "fqkline",
    "hk.stock": "hkfqkline",
    "us.stock": "usfqkline",
}

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://gu.qq.com/",
}

# How many bars to ask for. Probed rather than assumed, because the failure is
# silent: 800 returns 800, but 1000 through 2000 quietly cap at 640, and 2500
# and above return a malformed response with no data at all. 800 is the
# largest value that returns what it was asked for — roughly 3.2 years of
# daily bars, which is the real depth limit of this provider.
_MAX_BARS = 800


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
        "cn.index": {
            "name": "中国指数历史数据",
            "category": "指数",
            "symbol_format": "6位数字",
            "example": "000001",
            "params": ["symbol", "start_date", "end_date"],
        },
    }

    UNSUPPORTED: Dict[str, str] = {
        "cn.stock.b": "B股",
        "cn.stock.cdr": "CDR",
        "hk.index": "港股指数",
        "us.index": "美股指数",
        "global.index": "全球指数",
        "cn.etf": "场内ETF",
        "cn.lof": "LOF基金",
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
        # Always ask for the adjusted series. An empty adjustment slot is not a
        # usable "raw" mode here: A-shares fall back to a `day` key, Hong Kong
        # returns no data node at all, and US returns a node with no series.
        # Serving adjusted data and saying so beats serving nothing.
        fq = "qfq"
        # The date slots must be left empty. Filling them makes Tencent return
        # an empty series rather than the requested window — verified: the same
        # call with dates yields no qfqday key at all, without them it yields
        # the full run. So the count is the only usable selector, and the
        # window is applied locally by the cache.
        params = {
            "_var": "kline",
            "param": f"{tsym},day,,,{_MAX_BARS},{fq}",
        }

        with self._limiter.acquire():
            payload = self._get(_KLINE_URL.format(endpoint=endpoint), params)

        rows = self._extract_rows(payload, tsym)
        bars = self._to_records(rows)

        # Record coverage over what actually arrived rather than what was
        # asked for. Tencent returns its own run of bars, and claiming the
        # requested span as covered would hide the part it never sent.
        if bars:
            covered = (min(bars[0]["date"], gap[0]), max(bars[-1]["date"], gap[1]))
        else:
            covered = gap
        return self._cache.store(key, covered, bars, start_date, end_date)

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
