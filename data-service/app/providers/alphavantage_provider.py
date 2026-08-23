"""
Alpha Vantage data provider.

Scope
-----
Alpha Vantage serves US-listed equities and ETFs, and also several non-US
exchanges through a symbol suffix. Two of those matter here: ``.SHH`` for the
Shanghai Stock Exchange and ``.SHZ`` for Shenzhen, which together cover
mainland A-shares. So of the thirteen canonical data sources it serves
``us.stock`` and ``cn.stock``.

Hong Kong is not among the supported suffixes (neither ``.HK`` nor ``.HKG``
resolves), and there are no index, ETF-listing, LOF or futures endpoints, so
the remaining sources return UNSUPPORTED_SOURCE naming what is missing rather
than failing in a way that looks like a network problem.

Free-tier limits
----------------
The free tier allows 25 requests per day and roughly one request per second;
this provider tracks the daily budget locally (``alphavantage_daily_limit``)
and spaces calls out to respect the per-second limit. Two consequences of the
daily counter are worth knowing:

- The counter lives in memory, so restarting the service forgets it. Alpha
  Vantage still enforces its own limit; ours only exists to fail early with a
  clear message instead of parsing a rate-limit note as empty data.
- The counter resets on UTC midnight, while Alpha Vantage resets on US Eastern
  midnight. They disagree for part of each day; ours is the more conservative
  of the two for most of it.

Adjusted prices (``TIME_SERIES_DAILY_ADJUSTED``) are a premium endpoint, so the
``adjust`` parameter cannot be honoured here and is reported back as ignored.
"""
from __future__ import annotations

import csv
import io
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from cachetools import TTLCache

from ..config import get_settings
from ..gateway_config import resolve_api_key
from ..instruments import UnmappableInstrument, provider_symbol
from .base import BaseDataProvider

logger = logging.getLogger(__name__)

_BASE_URL = "https://www.alphavantage.co/query"

# Daily bars change once per session, so caching for an hour costs nothing in
# freshness and is the difference between a usable app and one that burns its
# 25 daily requests on repeated chart renders.
_HISTORY_TTL = 3600
_LISTING_TTL = 86400

# Free tier accepts roughly one request per second; leave a little headroom.
_MIN_CALL_GAP = 1.2


class AlphaVantageProvider(BaseDataProvider):
    """Data provider backed by the Alpha Vantage HTTP API."""

    VERSION = "1.0.0"  # provider implementation version

    # Canonical data source IDs this provider can actually serve.
    DATA_SOURCES: Dict[str, Dict] = {
        "us.stock": {
            "name": "美股历史数据",
            "category": "美股",
            "symbol_format": "股票代码",
            "example": "AAPL",
            "params": ["symbol", "period", "start_date", "end_date"],
        },
        "cn.stock": {
            "name": "A股历史数据",
            "category": "A股",
            "symbol_format": "6位数字",
            "example": "600104",
            "params": ["symbol", "period", "start_date", "end_date"],
        },
    }

    # Canonical IDs the rest of the app knows about but Alpha Vantage cannot
    # serve. Kept explicit so the error can say what is missing and why.
    UNSUPPORTED: Dict[str, str] = {
        "cn.stock.b": "B股",
        "cn.stock.cdr": "CDR",
        "hk.stock": "港股",
        "cn.index": "中国指数",
        "hk.index": "港股指数",
        "us.index": "美股指数",
        "global.index": "全球指数",
        "cn.etf": "场内ETF",
        "cn.lof": "LOF基金",
        "cn.futures": "国内期货",
        "global.futures": "国际期货",
    }

    _PERIOD_TO_FUNCTION = {
        "daily": ("TIME_SERIES_DAILY", "Time Series (Daily)"),
        "weekly": ("TIME_SERIES_WEEKLY", "Weekly Time Series"),
        "monthly": ("TIME_SERIES_MONTHLY", "Monthly Time Series"),
    }

    def __init__(self) -> None:
        settings = get_settings()
        self._api_key = resolve_api_key("alphavantage")
        self._timeout = settings.alphavantage_timeout
        self._daily_limit = settings.alphavantage_daily_limit

        self._history_cache: TTLCache = TTLCache(maxsize=256, ttl=_HISTORY_TTL)
        self._listing_cache: TTLCache = TTLCache(maxsize=8, ttl=_LISTING_TTL)

        self._lock = threading.Lock()
        self._request_count = 0
        self._count_date = self._utc_today()

        # The free tier also rejects bursts with "please spread out your free
        # API requests more sparingly (1 request per second)". Serialising
        # calls behind a minimum gap turns that from an error into a wait.
        self._pace_lock = threading.Lock()
        self._last_call = 0.0

        if not self._api_key:
            logger.warning(
                "alphavantage_api_key is not set — every request will fail until "
                "it is configured in .env"
            )

    # ------------------------------------------------------------------
    # Provider metadata
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "Alpha Vantage"

    @property
    def provider_version(self) -> str:
        return self.VERSION

    def health_check(self) -> Dict[str, Any]:
        if not self._api_key:
            return {
                "status": "unhealthy",
                "version": self.VERSION,
                "message": "alphavantage_api_key is not configured",
            }
        used, remaining = self.quota()
        return {
            "status": "healthy",
            "version": self.VERSION,
            "message": f"{used}/{self._daily_limit} requests used today, {remaining} remaining",
        }

    # ------------------------------------------------------------------
    # Request budget
    # ------------------------------------------------------------------

    @staticmethod
    def _utc_today() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def quota(self) -> tuple[int, int]:
        """Return (used_today, remaining_today)."""
        with self._lock:
            self._roll_over_locked()
            return self._request_count, max(0, self._daily_limit - self._request_count)

    def _roll_over_locked(self) -> None:
        today = self._utc_today()
        if today != self._count_date:
            self._count_date = today
            self._request_count = 0

    def _claim_request_slot(self) -> bool:
        """Reserve one request against today's budget. False when exhausted."""
        with self._lock:
            self._roll_over_locked()
            if self._request_count >= self._daily_limit:
                return False
            self._request_count += 1
            return True

    def _quota_error(self) -> Dict[str, Any]:
        return {
            "success": False,
            "error": (
                f"Alpha Vantage daily request limit reached "
                f"({self._daily_limit} requests). It resets at UTC midnight. "
                f"Cached results are still served."
            ),
            "error_code": "FETCH_ERROR",
        }

    # ------------------------------------------------------------------
    # HTTP
    # ------------------------------------------------------------------

    def _pace(self) -> None:
        """Block until at least _MIN_CALL_GAP has passed since the last call."""
        with self._pace_lock:
            wait = self._last_call + _MIN_CALL_GAP - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last_call = time.monotonic()

    def _get(self, params: Dict[str, str], *, as_csv: bool = False) -> Any:
        """
        Call Alpha Vantage and return parsed JSON, or raw text for CSV endpoints.

        Raises RuntimeError carrying Alpha Vantage's own message for the three
        ways it signals refusal: "Error Message" (bad symbol/function), "Note"
        (rate limited) and "Information" (endpoint needs a premium plan).
        """
        params = {**params, "apikey": self._api_key}
        self._pace()

        last_exc: Optional[Exception] = None
        for attempt in range(1, 4):
            try:
                with httpx.Client(
                    timeout=self._timeout,
                    follow_redirects=True,
                    trust_env=True,
                ) as client:
                    r = client.get(_BASE_URL, params=params)
                r.raise_for_status()
                break
            except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.ReadError) as exc:
                last_exc = exc
                if attempt < 3:
                    logger.warning(
                        "Alpha Vantage connection error (attempt %d/3): %s — retrying",
                        attempt, exc,
                    )
                    time.sleep(0.5 * attempt)
            except Exception:
                raise
        else:
            raise last_exc  # type: ignore[misc]

        if as_csv:
            return r.text

        payload = r.json()
        if isinstance(payload, dict):
            for key in ("Error Message", "Note", "Information"):
                if key in payload:
                    raise RuntimeError(f"{key}: {payload[key]}")
        return payload

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
                    f"Alpha Vantage does not carry {self.UNSUPPORTED[data_source]} "
                    f"({data_source}). It serves US equities/ETFs and mainland "
                    f"A-shares (.SHH/.SHZ) only; use the akshare or eastmoney "
                    f"provider for this market."
                ),
                "error_code": "UNSUPPORTED_SOURCE",
            }

        if data_source not in self.DATA_SOURCES:
            return {
                "success": False,
                "error": f"Unknown data source: {data_source}",
                "error_code": "INVALID_DATA_SOURCE",
            }

        period = (period or "daily").lower()
        if period not in self._PERIOD_TO_FUNCTION:
            return {
                "success": False,
                "error": f"Unsupported period: {period}",
                "error_code": "INVALID_TYPE",
            }

        symbol = symbol.strip().upper()
        try:
            api_symbol = provider_symbol("alphavantage", data_source, symbol)
        except UnmappableInstrument as exc:
            return {"success": False, "error": str(exc),
                    "error_code": "UNSUPPORTED_SOURCE"}
        function, series_key = self._PERIOD_TO_FUNCTION[period]
        cache_key = (function, api_symbol)

        records = self._history_cache.get(cache_key)
        if records is None:
            if not self._api_key:
                return {
                    "success": False,
                    "error": "alphavantage_api_key is not configured",
                    "error_code": "FETCH_ERROR",
                }
            if not self._claim_request_slot():
                return self._quota_error()

            params = {"function": function, "symbol": api_symbol}
            if function == "TIME_SERIES_DAILY":
                # outputsize=full (20+ years) became a premium feature, so the
                # free tier caps daily history at the most recent 100 bars.
                params["outputsize"] = "compact"

            try:
                payload = self._get(params)
            except Exception as exc:
                logger.error("Alpha Vantage fetch error for %s: %s", api_symbol, exc)
                return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

            series = payload.get(series_key)
            if not series:
                return {
                    "success": False,
                    "error": f"No data returned for symbol: {api_symbol}",
                    "error_code": "NO_DATA",
                }

            records = self._parse_series(series)
            self._history_cache[cache_key] = records

        filtered = self._filter_by_date(records, start_date, end_date)
        if not filtered:
            return {
                "success": False,
                "error": f"No data in the requested range for symbol: {symbol}",
                "error_code": "NO_DATA",
            }

        data: Dict[str, Any] = {
            "symbol": symbol,
            "data_source": data_source,
            "first_date": filtered[0]["date"],
            "last_date": filtered[-1]["date"],
            "row_count": len(filtered),
            "records": filtered,
        }
        if adjust:
            # Say so rather than silently returning unadjusted prices as if the
            # request had been honoured.
            data["adjust_ignored"] = (
                "Adjusted prices require Alpha Vantage's premium "
                "TIME_SERIES_DAILY_ADJUSTED endpoint; raw prices returned."
            )

        # A caller asking for history older than the free tier carries would
        # otherwise get a short series that looks like the symbol simply has no
        # earlier data. Say which it is.
        earliest = records[0]["date"].replace("-", "") if records else None
        if start_date and earliest and start_date.replace("-", "") < earliest:
            data["range_truncated"] = (
                f"Alpha Vantage's free tier returns only the most recent "
                f"{len(records)} bars, so history before {records[0]['date']} is "
                f"unavailable. outputsize=full requires a premium plan."
            )

        return {"success": True, "data": data}

    @staticmethod
    def _parse_series(series: Dict[str, Dict[str, str]]) -> List[Dict[str, Any]]:
        """Convert Alpha Vantage's date→fields mapping into ascending records."""
        out: List[Dict[str, Any]] = []
        for date_str, fields in series.items():
            try:
                out.append(
                    {
                        "date": date_str,
                        "open": float(fields["1. open"]),
                        "high": float(fields["2. high"]),
                        "low": float(fields["3. low"]),
                        "close": float(fields["4. close"]),
                        "volume": int(float(fields["5. volume"])),
                    }
                )
            except (KeyError, ValueError) as exc:
                logger.warning("Skipping malformed bar %s: %s", date_str, exc)
        out.sort(key=lambda r: r["date"])
        return out

    @staticmethod
    def _filter_by_date(
        records: List[Dict[str, Any]],
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> List[Dict[str, Any]]:
        """Filter YYYY-MM-DD records by YYYYMMDD bounds, both inclusive."""

        def to_compact(d: str) -> str:
            return d.replace("-", "")

        lo = start_date.replace("-", "") if start_date else None
        hi = end_date.replace("-", "") if end_date else None

        return [
            r
            for r in records
            if (lo is None or to_compact(r["date"]) >= lo)
            and (hi is None or to_compact(r["date"]) <= hi)
        ]

    # ------------------------------------------------------------------
    # Listing endpoints
    # ------------------------------------------------------------------

    def _listing_status(self) -> List[Dict[str, str]]:
        """Fetch and cache the full US listing table (CSV endpoint)."""
        rows = self._listing_cache.get("listing")
        if rows is not None:
            return rows

        if not self._claim_request_slot():
            raise RuntimeError("daily request limit reached")

        text = self._get({"function": "LISTING_STATUS"}, as_csv=True)
        rows = list(csv.DictReader(io.StringIO(text)))
        self._listing_cache["listing"] = rows
        return rows

    def get_stock_list(
        self, market: str = "a_share", include_delisted: bool = False
    ) -> Dict[str, Any]:
        if market != "us":
            return {
                "success": False,
                "error": (
                    f"Alpha Vantage's listing endpoint covers US securities only, "
                    f"so '{market}' is not available. A-share history works, but "
                    f"the symbol list has to come from akshare or eastmoney."
                ),
                "error_code": "INVALID_MARKET",
            }

        if not self._api_key:
            return {
                "success": False,
                "error": "alphavantage_api_key is not configured",
                "error_code": "FETCH_ERROR",
            }

        try:
            rows = self._listing_status()
        except Exception as exc:
            logger.error("Alpha Vantage listing fetch error: %s", exc)
            return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

        items = [
            {
                "code": r.get("symbol", ""),
                "name": r.get("name", ""),
                "exchange": r.get("exchange", ""),
                "status": r.get("status", ""),
            }
            for r in rows
            if r.get("assetType") == "Stock"
            and (include_delisted or r.get("status") == "Active")
        ]

        return {
            "success": True,
            "data": {"market": market, "count": len(items), "items": items},
        }

    def get_index_list(self, market: str = "zh") -> Dict[str, Any]:
        return {
            "success": False,
            "error": (
                "Alpha Vantage's free tier has no index listing endpoint, and its "
                "time series do not accept index symbols. Use the akshare or "
                "eastmoney provider for indices."
            ),
            "error_code": "UNSUPPORTED_SOURCE",
        }

    def get_fund_list(self, fund_type: str = "etf") -> Dict[str, Any]:
        if fund_type != "etf":
            return {
                "success": False,
                "error": (
                    f"Alpha Vantage has no '{fund_type}' funds; only US-listed "
                    f"ETFs are available."
                ),
                "error_code": "INVALID_TYPE",
            }

        if not self._api_key:
            return {
                "success": False,
                "error": "alphavantage_api_key is not configured",
                "error_code": "FETCH_ERROR",
            }

        try:
            rows = self._listing_status()
        except Exception as exc:
            logger.error("Alpha Vantage listing fetch error: %s", exc)
            return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

        items = [
            {
                "code": r.get("symbol", ""),
                "name": r.get("name", ""),
                "exchange": r.get("exchange", ""),
                "status": r.get("status", ""),
            }
            for r in rows
            if r.get("assetType") == "ETF" and r.get("status") == "Active"
        ]

        return {
            "success": True,
            "data": {"fund_type": fund_type, "count": len(items), "items": items},
        }

    def get_futures_list(self) -> Dict[str, Any]:
        return {
            "success": False,
            "error": (
                "Alpha Vantage does not carry futures. Use the akshare or "
                "eastmoney provider."
            ),
            "error_code": "UNSUPPORTED_SOURCE",
        }

    # ------------------------------------------------------------------
    # Metadata / discovery
    # ------------------------------------------------------------------

    def get_data_sources(self) -> Dict[str, Any]:
        sources = [
            {
                "id": source_id,
                "name": cfg["name"],
                "category": cfg["category"],
                "symbol_format": cfg.get("symbol_format"),
                "example_symbol": cfg.get("example"),
                "parameters": cfg.get("params", []),
            }
            for source_id, cfg in self.DATA_SOURCES.items()
        ]
        return {"success": True, "data": {"sources": sources}}
