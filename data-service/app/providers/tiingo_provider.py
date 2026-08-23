"""
Tiingo data provider.

First pass: end-to-end history for the two markets that matter here, US
equities and mainland A-shares. Listing endpoints are not wired up yet and
report UNSUPPORTED_SOURCE rather than pretending to be empty.

Symbols
-------
Tiingo takes the bare ticker for both markets — ``AAPL`` and ``600104``, with
no exchange suffix. Verified against the live API: suffixed forms such as
``600104.SHH``, ``600519.SS`` and ``000002.SZ`` all return "Ticker not found",
so any suffix arriving from elsewhere in the app is stripped.

Coverage and depth were checked rather than assumed: 600104 returns 5038
daily bars back to 2007-01-04 (metadata: SAIC Motor Corporation Ltd, exchange
SHG), and 000002 resolves on Shenzhen. That is a different order of magnitude
from Alpha Vantage's free tier, which caps daily history at 100 bars.

Free-tier limits
----------------
The Starter plan allows 50 requests/hour and 1000/day. Budget, pacing and
concurrency are enforced by the shared limiter in app.limits rather than by
this adapter, and identical concurrent requests are collapsed by single-flight
so a fan-out costs one call. Ranges are cached by app.cache.SeriesCache, which
means a window already covered by an earlier fetch costs nothing and a window
that merely extends one fetches only the delta.

Tiingo's Starter terms mark the data internal-use only, which the routing
layer will need to respect once usage_context exists.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

import httpx

from ..cache import SeriesCache, SingleFlight
from ..config import get_settings
from ..limits import QuotaExhausted, get_limiter
from .base import BaseDataProvider

logger = logging.getLogger(__name__)


_BASE_URL = "https://api.tiingo.com/tiingo/daily"
_HISTORY_TTL = 3600

# Suffixes other providers use that Tiingo rejects.
_STRIPPED_SUFFIXES = (".SHH", ".SHZ", ".SS", ".SZ", ".SH")


class TiingoProvider(BaseDataProvider):
    """Data provider backed by the Tiingo HTTP API."""

    VERSION = "1.0.0"

    DATA_SOURCES: Dict[str, Dict] = {
        "cn.stock": {
            "name": "A股历史数据",
            "category": "A股",
            "symbol_format": "6位数字",
            "example": "600104",
            "params": ["symbol", "start_date", "end_date", "adjust"],
        },
        "us.stock": {
            "name": "美股历史数据",
            "category": "美股",
            "symbol_format": "股票代码",
            "example": "AAPL",
            "params": ["symbol", "start_date", "end_date", "adjust"],
        },
    }

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

    def __init__(self) -> None:
        settings = get_settings()
        self._api_key = settings.tiingo_api_key
        self._timeout = settings.tiingo_timeout
        self._hourly_limit = settings.tiingo_hourly_limit
        self._daily_limit = settings.tiingo_daily_limit

        self._cache = SeriesCache(ttl=_HISTORY_TTL)
        self._flight = SingleFlight()
        self._limiter = get_limiter(
            "tiingo",
            max_concurrency=4,
            windows={
                "hour": (self._hourly_limit, 3600),
                "day": (self._daily_limit, 86400),
            },
        )

        if not self._api_key:
            logger.warning(
                "tiingo_api_key is not set — every request will fail until it "
                "is configured in .env"
            )

    # ------------------------------------------------------------------
    # Provider metadata
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "Tiingo"

    @property
    def provider_version(self) -> str:
        return self.VERSION

    def health_check(self) -> Dict[str, Any]:
        if not self._api_key:
            return {
                "status": "unhealthy",
                "version": self.VERSION,
                "message": "tiingo_api_key is not configured",
            }
        stats = self._cache.stats
        return {
            "status": "healthy",
            "version": self.VERSION,
            "message": (
                f"{self._limiter.describe_usage()}; "
                f"cache served {stats['served_without_fetch']} window(s) with no "
                f"call, {stats['partial_fetches']} fetched only a delta, "
                f"single-flight saved {self._flight.saved_calls}"
            ),
        }

    # ------------------------------------------------------------------
    # Symbol mapping
    # ------------------------------------------------------------------

    @staticmethod
    def _api_symbol(symbol: str) -> str:
        """Tiingo wants the bare ticker; drop any exchange suffix."""
        symbol = symbol.strip().upper()
        for suffix in _STRIPPED_SUFFIXES:
            if symbol.endswith(suffix):
                return symbol[: -len(suffix)]
        return symbol

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
                    f"Tiingo does not carry {self.UNSUPPORTED[data_source]} "
                    f"({data_source}). It serves US equities and mainland "
                    f"A-shares here; use the eastmoney provider for this market."
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
                "error": (
                    f"This provider currently serves daily bars only; "
                    f"'{period}' is not wired up yet."
                ),
                "error_code": "INVALID_TYPE",
            }

        if not self._api_key:
            return {
                "success": False,
                "error": "tiingo_api_key is not configured",
                "error_code": "FETCH_ERROR",
            }

        ticker = self._api_symbol(symbol)
        # 'qfq'/'hfq' both mean "adjusted" as far as this API goes; only the
        # absence of adjustment picks the raw series.
        adjusted = adjust not in (None, "", "none")

        key = self._cache.key("tiingo", data_source, ticker, adjusted)
        on_hand, gap = self._cache.plan(key, start_date, end_date)

        if gap is None:
            records = on_hand
        else:
            # Collapse identical concurrent fetches of the same gap, so a page
            # rendering several charts of one symbol costs a single call.
            flight_key = f"{key}|{gap[0]}|{gap[1]}"
            try:
                records = self._flight.do(
                    flight_key,
                    lambda: self._fetch_and_merge(
                        key, ticker, gap, adjusted, start_date, end_date
                    ),
                )
            except QuotaExhausted as exc:
                return {
                    "success": False,
                    "error": (
                        f"Tiingo {exc.window} limit reached ({exc.limit} requests); "
                        f"resets in {exc.resets_in_seconds}s. Cached ranges are "
                        f"still served."
                    ),
                    "error_code": "FETCH_ERROR",
                }
            except Exception as exc:
                logger.error("Tiingo fetch error for %s: %s", ticker, exc)
                return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

        if not records:
            return {
                "success": False,
                "error": f"No data in the requested range for symbol: {ticker}",
                "error_code": "NO_DATA",
            }

        return {
            "success": True,
            "data": {
                "symbol": symbol.strip().upper(),
                "data_source": data_source,
                "first_date": records[0]["date"],
                "last_date": records[-1]["date"],
                "row_count": len(records),
                "records": records,
            },
        }

    def _fetch_and_merge(
        self,
        key: str,
        ticker: str,
        gap: tuple[str, str],
        adjusted: bool,
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> List[Dict[str, Any]]:
        """Fetch only the missing span, merge it in, return the whole window."""
        params: Dict[str, str] = {
            "token": self._api_key,
            "startDate": gap[0],
            "endDate": gap[1],
        }

        lease = self._limiter.acquire()
        with lease:
            rows = self._get(f"{_BASE_URL}/{ticker}/prices", params)

        bars = self._to_records(rows, adjusted)
        # An empty result still records coverage: a range with no trading days
        # is a real answer, and without storing it the gap would be re-fetched
        # on every request forever.
        return self._cache.store(key, gap, bars, start_date, end_date)

    # ------------------------------------------------------------------
    # HTTP + parsing
    # ------------------------------------------------------------------

    def _get(self, url: str, params: Dict[str, str]) -> List[Dict[str, Any]]:
        """
        GET and return the JSON array.

        Tiingo signals refusal with a JSON object carrying `detail` rather than
        the expected array, so an object response is turned into an exception
        that keeps its message.
        """
        last_exc: Optional[Exception] = None
        for attempt in range(1, 4):
            try:
                with httpx.Client(
                    timeout=self._timeout,
                    follow_redirects=True,
                    trust_env=True,
                    headers={"Content-Type": "application/json"},
                ) as client:
                    r = client.get(url, params=params)
                r.raise_for_status()
                break
            except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.ReadError) as exc:
                last_exc = exc
                if attempt < 3:
                    logger.warning(
                        "Tiingo connection error (attempt %d/3): %s — retrying",
                        attempt, exc,
                    )
                    time.sleep(0.5 * attempt)
            except httpx.HTTPStatusError as exc:
                detail = ""
                try:
                    body = exc.response.json()
                    detail = body.get("detail") or body.get("message") or ""
                except Exception:
                    detail = exc.response.text[:200]
                raise RuntimeError(detail or str(exc)) from exc
        else:
            raise last_exc  # type: ignore[misc]

        payload = r.json()
        if isinstance(payload, dict):
            raise RuntimeError(str(payload.get("detail") or payload)[:200])
        return payload

    @staticmethod
    def _to_records(rows: List[Dict[str, Any]], adjusted: bool) -> List[Dict[str, Any]]:
        prefix = "adj" if adjusted else ""

        def field(row: Dict[str, Any], name: str) -> Any:
            if not prefix:
                return row.get(name)
            return row.get(f"{prefix}{name.capitalize()}", row.get(name))

        out: List[Dict[str, Any]] = []
        for row in rows:
            try:
                out.append(
                    {
                        "date": row["date"][:10],
                        "open": float(field(row, "open")),
                        "high": float(field(row, "high")),
                        "low": float(field(row, "low")),
                        "close": float(field(row, "close")),
                        "volume": int(float(field(row, "volume") or 0)),
                    }
                )
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning("Skipping malformed Tiingo row %s: %s", row.get("date"), exc)
        out.sort(key=lambda r: r["date"])
        return out

    # ------------------------------------------------------------------
    # Listing endpoints — not wired up in this first pass
    # ------------------------------------------------------------------

    def _listing_unsupported(self, what: str) -> Dict[str, Any]:
        return {
            "success": False,
            "error": (
                f"The Tiingo provider does not serve {what} yet; it currently "
                f"covers history only. Use the eastmoney provider for listings."
            ),
            "error_code": "UNSUPPORTED_SOURCE",
        }

    def get_stock_list(
        self, market: str = "a_share", include_delisted: bool = False
    ) -> Dict[str, Any]:
        return self._listing_unsupported("stock lists")

    def get_index_list(self, market: str = "zh") -> Dict[str, Any]:
        return self._listing_unsupported("index lists")

    def get_fund_list(self, fund_type: str = "etf") -> Dict[str, Any]:
        return self._listing_unsupported("fund lists")

    def get_futures_list(self) -> Dict[str, Any]:
        return self._listing_unsupported("futures lists")

    # ------------------------------------------------------------------
    # Metadata / discovery
    # ------------------------------------------------------------------

    def get_data_sources(self) -> Dict[str, Any]:
        return {
            "success": True,
            "data": {
                "sources": [
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
            },
        }
