"""
Twelve Data provider.

The deepest US history configured here: AAPL returns 5000 daily bars back to
2006-10-05, against Alpha Vantage's free-tier 100 and Tencent's 800. With 800
credits a day it can carry real traffic, and it shares no upstream with Tencent
or EastMoney, so it leads the US chain.

Scope on this plan
------------------
US only, verified rather than assumed: both `BHP` on ASX and `0700` on HKEX
were refused with "available starting with the Pro or Venture plan". US ETFs do
work — SPY and QQQ both resolve — so us.stock covers those too.

Two things that would corrupt data if guessed
---------------------------------------------
Rows arrive newest-first, the opposite of every other provider here, so they
are reversed on the way in.

Metering is in credits, not requests. A time_series call costs one credit per
symbol, which happens to equal one request today, but the two are different
quantities and the budget is declared in credits so that a future batch or
fundamentals call cannot silently cost eight times what a counter assumed.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

import httpx

from ..cache import SeriesCache, SingleFlight
from ..credentials import BudgetKind, NoCredentialAvailable, get_pool
from ..gateway_config import load_config, resolve_api_key
from ..instruments import UnmappableInstrument, provider_symbol
from ..limits import QuotaExhausted, get_limiter
from ..resilience import (
    RetryDecision, backoff_delay, classify_status, parse_retry_after, should_retry,
)
from .base import BaseDataProvider

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.twelvedata.com/time_series"

# The largest outputsize the plan accepts. Verified: AAPL returns exactly 5000.
_MAX_BARS = 5000


class TwelveDataProvider(BaseDataProvider):
    """Data provider backed by the Twelve Data time_series API."""

    VERSION = "1.0.0"

    DATA_SOURCES: Dict[str, Dict] = {
        "us.stock": {
            "name": "美股历史数据",
            "category": "美股",
            "symbol_format": "股票代码",
            "example": "AAPL",
            "params": ["symbol", "start_date", "end_date"],
        },
    }

    UNSUPPORTED: Dict[str, str] = {
        "cn.stock": "A股",
        "cn.stock.b": "B股",
        "cn.stock.cdr": "CDR",
        "hk.stock": "港股",
        "au.stock": "澳股",
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
        config = load_config()
        provider_cfg = config.providers.get("twelvedata")
        limits = provider_cfg.limits if provider_cfg else None

        self._api_key = resolve_api_key("twelvedata")
        self._timeout = 30

        self._cache = SeriesCache(
            ttl=config.cache.ohlcv_daily_ttl_seconds,
            max_series=config.cache.max_series,
        )
        self._flight = SingleFlight()
        self._limiter = get_limiter(
            "twelvedata",
            max_concurrency=limits.concurrency if limits else 2,
            min_interval=limits.min_interval_seconds if limits else 0.0,
            windows=limits.windows() if limits else {},
        )

        if not self._api_key:
            logger.warning("No Twelve Data credential configured; requests will fail")

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "Twelve Data"

    @property
    def provider_version(self) -> str:
        return self.VERSION

    def health_check(self) -> Dict[str, Any]:
        if not self._api_key:
            return {
                "status": "unhealthy",
                "version": self.VERSION,
                "message": "no credential configured",
            }
        stats = self._cache.stats
        return {
            "status": "healthy",
            "version": self.VERSION,
            "message": (
                f"{self._limiter.describe_usage()}; US only on this plan; "
                f"cache served {stats['served_without_fetch']} window(s) with no call"
            ),
        }

    # ------------------------------------------------------------------
    # History
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
                    f"Twelve Data's plan here covers US equities and ETFs only; "
                    f"{self.UNSUPPORTED[data_source]} ({data_source}) needs the "
                    f"Pro or Venture plan."
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

        if not self._api_key:
            return {
                "success": False,
                "error": "no Twelve Data credential configured",
                "error_code": "FETCH_ERROR",
            }

        try:
            ticker = provider_symbol("twelvedata", data_source, symbol)
        except UnmappableInstrument as exc:
            return {"success": False, "error": str(exc), "error_code": "UNSUPPORTED_SOURCE"}

        key = self._cache.key("twelvedata", data_source, ticker, True)
        on_hand, gap = self._cache.plan(key, start_date, end_date)

        if gap is None:
            records = on_hand
        else:
            flight_key = f"{key}|{gap[0]}|{gap[1]}"
            try:
                records = self._flight.do(
                    flight_key,
                    lambda: self._fetch_and_merge(key, ticker, gap, start_date, end_date),
                )
            except QuotaExhausted as exc:
                return {
                    "success": False,
                    "error": (
                        f"Twelve Data {exc.window} limit reached ({exc.limit}); "
                        f"resets in {exc.resets_in_seconds}s."
                    ),
                    "error_code": "FETCH_ERROR",
                }
            except Exception as exc:
                logger.error("Twelve Data fetch error for %s: %s", ticker, exc)
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
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> List[Dict[str, Any]]:
        params = {
            "symbol": ticker,
            "interval": "1day",
            "outputsize": str(_MAX_BARS),
            "start_date": gap[0],
            "end_date": gap[1],
            "apikey": self._api_key,
        }

        pool = get_pool("twelvedata")
        credential = None
        if pool.usable():
            try:
                # One credit per symbol for time_series. Charged as credits
                # rather than requests because that is the quantity billed.
                credential = pool.acquire({BudgetKind.CREDITS: 1}, subject=ticker)
            except NoCredentialAvailable as exc:
                raise QuotaExhausted("credential", 0, 0) from exc

        with self._limiter.acquire():
            values = self._get(params)

        bars = self._to_records(values)
        if bars:
            covered = (min(bars[0]["date"], gap[0]), max(bars[-1]["date"], gap[1]))
        else:
            covered = gap
        return self._cache.store(key, covered, bars, start_date, end_date)

    # ------------------------------------------------------------------
    # HTTP
    # ------------------------------------------------------------------

    def _get(self, params: Dict[str, str]) -> List[Dict[str, Any]]:
        max_attempts = 3
        last_exc: Optional[Exception] = None

        for attempt in range(1, max_attempts + 1):
            try:
                with httpx.Client(
                    timeout=self._timeout, follow_redirects=True, trust_env=True
                ) as client:
                    r = client.get(_BASE_URL, params=params)
            except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.ReadError) as exc:
                last_exc = exc
                if attempt < max_attempts:
                    time.sleep(backoff_delay(attempt))
                    continue
                raise

            if r.status_code < 400:
                payload = r.json()
                # Twelve Data reports refusals in the body with HTTP 200, so
                # the status code alone does not tell you the call worked.
                if isinstance(payload, dict) and payload.get("status") == "error":
                    raise RuntimeError(str(payload.get("message"))[:200])
                values = payload.get("values") if isinstance(payload, dict) else None
                if values is None:
                    raise RuntimeError(str(payload)[:200])
                return values

            decision = classify_status(r.status_code)
            if not should_retry(decision, attempt, max_attempts):
                raise RuntimeError(f"HTTP {r.status_code}: {r.text[:160]}")

            delay = (
                parse_retry_after(r.headers.get("Retry-After"))
                if decision is RetryDecision.RETRY_AFTER
                else None
            )
            time.sleep(delay if delay is not None else backoff_delay(attempt))

        raise last_exc or RuntimeError("Twelve Data request failed")

    @staticmethod
    def _to_records(values: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Rows arrive newest-first here; everything downstream expects ascending."""
        out: List[Dict[str, Any]] = []
        for row in values:
            try:
                out.append(
                    {
                        "date": str(row["datetime"])[:10],
                        "open": float(row["open"]),
                        "high": float(row["high"]),
                        "low": float(row["low"]),
                        "close": float(row["close"]),
                        "volume": int(float(row.get("volume") or 0)),
                    }
                )
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning(
                    "Skipping malformed Twelve Data row %s: %s", row.get("datetime"), exc
                )
        out.sort(key=lambda r: r["date"])
        return out

    # ------------------------------------------------------------------
    # Listings — not wired up
    # ------------------------------------------------------------------

    def _unsupported(self, what: str) -> Dict[str, Any]:
        return {
            "success": False,
            "error": f"The Twelve Data provider does not serve {what}; it covers history only.",
            "error_code": "UNSUPPORTED_SOURCE",
        }

    def get_stock_list(self, market: str = "a_share", include_delisted: bool = False):
        return self._unsupported("stock lists")

    def get_index_list(self, market: str = "zh"):
        return self._unsupported("index lists")

    def get_fund_list(self, fund_type: str = "etf"):
        return self._unsupported("fund lists")

    def get_futures_list(self):
        return self._unsupported("futures lists")

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
