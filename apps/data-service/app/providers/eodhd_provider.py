"""
EODHD data provider.

The reason this exists is Australia: it is the only source verified to carry
ASX at all, so `au.stock` goes from having no path to having one. BHP.AU and
CBA.AU both return real prices.

It is also the third Hong Kong path and the first with a contract behind it —
Tencent and EastMoney are undocumented public endpoints that could change or
refuse without notice, and both did refuse this machine earlier. 0700.HK agrees
with Tencent to the cent, which is the cross-check that made it trustworthy.

Free-tier depth
---------------
One year, and that is a hard cap rather than a default: a request from
2015-01-01 returns exactly the same 253 bars as one from 2025. So this is a
coverage source, not a backtesting one — it answers "what is this instrument
doing" rather than "how would this strategy have done".

The 20-requests-per-day budget was read from the provider's own /api/user
endpoint rather than taken from documentation, which is why it is the one
provider currently marked verified.
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

_BASE_URL = "https://eodhd.com/api/eod"


class EODHDProvider(BaseDataProvider):
    """Data provider backed by the EODHD end-of-day API."""

    VERSION = "1.0.0"

    DATA_SOURCES: Dict[str, Dict] = {
        "au.stock": {
            "name": "澳股历史数据",
            "category": "澳股",
            "symbol_format": "股票代码",
            "example": "BHP",
            "params": ["symbol", "start_date", "end_date"],
        },
        "hk.stock": {
            "name": "港股历史数据",
            "category": "港股",
            "symbol_format": "4-5位数字",
            "example": "00700",
            "params": ["symbol", "start_date", "end_date"],
        },
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
        provider_cfg = config.providers.get("eodhd")
        limits = provider_cfg.limits if provider_cfg else None

        self._api_key = resolve_api_key("eodhd")
        self._timeout = 30

        self._cache = SeriesCache(
            ttl=config.cache.ohlcv_daily_ttl_seconds,
            max_series=config.cache.max_series,
        )
        self._flight = SingleFlight()
        self._limiter = get_limiter(
            "eodhd",
            max_concurrency=limits.concurrency if limits else 2,
            min_interval=limits.min_interval_seconds if limits else 0.5,
            windows=limits.windows() if limits else {},
        )

        if not self._api_key:
            logger.warning("No EODHD credential configured; requests will fail")

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "EODHD"

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
                f"{self._limiter.describe_usage()}; free tier serves one year "
                f"of history; cache served {stats['served_without_fetch']} "
                f"window(s) with no call"
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
                    f"EODHD is configured here for Australia, Hong Kong and US "
                    f"equities; {self.UNSUPPORTED[data_source]} ({data_source}) "
                    f"is not among them."
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
                "error": "no EODHD credential configured",
                "error_code": "FETCH_ERROR",
            }

        try:
            ticker = provider_symbol("eodhd", data_source, symbol)
        except UnmappableInstrument as exc:
            return {"success": False, "error": str(exc), "error_code": "UNSUPPORTED_SOURCE"}

        # The API returns one adjusted series; there is no raw variant to pick.
        key = self._cache.key("eodhd", data_source, ticker, True)
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
                        f"EODHD {exc.window} limit reached ({exc.limit} requests); "
                        f"resets in {exc.resets_in_seconds}s."
                    ),
                    "error_code": "FETCH_ERROR",
                }
            except Exception as exc:
                logger.error("EODHD fetch error for %s: %s", ticker, exc)
                return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

        if not records:
            return {
                "success": False,
                "error": f"No data in the requested range for symbol: {ticker}",
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

        # Say when the free tier, not the instrument, is what ended the series.
        if start_date and records and start_date.replace("-", "") < records[0]["date"].replace("-", ""):
            data["range_truncated"] = (
                f"EODHD's free tier serves about one year of history, so bars "
                f"before {records[0]['date']} are unavailable regardless of the "
                f"requested start date."
            )

        return {"success": True, "data": data}

    def _fetch_and_merge(
        self,
        key: str,
        ticker: str,
        gap: tuple[str, str],
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> List[Dict[str, Any]]:
        params = {
            "api_token": self._api_key,
            "fmt": "json",
            "from": gap[0],
            "to": gap[1],
            "period": "d",
        }

        pool = get_pool("eodhd")
        credential = None
        if pool.usable():
            try:
                credential = pool.acquire({BudgetKind.REQUESTS: 1}, subject=ticker)
            except NoCredentialAvailable as exc:
                raise QuotaExhausted("credential", 0, 0) from exc

        with self._limiter.acquire():
            rows = self._get(f"{_BASE_URL}/{ticker}", params)

        bars = self._to_records(rows)

        # Coverage is what arrived, not what was asked for: the free tier
        # silently truncates, and claiming the requested span would hide the
        # part it never sent and stop us ever re-asking for it.
        if bars:
            covered = (min(bars[0]["date"], gap[0]), max(bars[-1]["date"], gap[1]))
        else:
            covered = gap
        return self._cache.store(key, covered, bars, start_date, end_date)

    # ------------------------------------------------------------------
    # HTTP
    # ------------------------------------------------------------------

    def _get(self, url: str, params: Dict[str, str]) -> List[Dict[str, Any]]:
        max_attempts = 3
        last_exc: Optional[Exception] = None

        for attempt in range(1, max_attempts + 1):
            try:
                with httpx.Client(
                    timeout=self._timeout, follow_redirects=True, trust_env=True
                ) as client:
                    r = client.get(url, params=params)
            except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.ReadError) as exc:
                last_exc = exc
                if attempt < max_attempts:
                    time.sleep(backoff_delay(attempt))
                    continue
                raise

            if r.status_code < 400:
                payload = r.json()
                if isinstance(payload, dict):
                    raise RuntimeError(str(payload)[:200])
                return payload

            decision = classify_status(r.status_code)
            if not should_retry(decision, attempt, max_attempts):
                raise RuntimeError(f"HTTP {r.status_code}: {r.text[:160]}")

            delay = (
                parse_retry_after(r.headers.get("Retry-After"))
                if decision is RetryDecision.RETRY_AFTER
                else None
            )
            time.sleep(delay if delay is not None else backoff_delay(attempt))

        raise last_exc or RuntimeError("EODHD request failed")

    @staticmethod
    def _to_records(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for row in rows:
            try:
                # adjusted_close is present but the OHLC are already adjusted,
                # so mixing them would produce inconsistent candles.
                out.append(
                    {
                        "date": str(row["date"])[:10],
                        "open": float(row["open"]),
                        "high": float(row["high"]),
                        "low": float(row["low"]),
                        "close": float(row["close"]),
                        "volume": int(float(row.get("volume") or 0)),
                    }
                )
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning("Skipping malformed EODHD row %s: %s", row.get("date"), exc)
        out.sort(key=lambda r: r["date"])
        return out

    # ------------------------------------------------------------------
    # Listings — not wired up
    # ------------------------------------------------------------------

    def _unsupported(self, what: str) -> Dict[str, Any]:
        return {
            "success": False,
            "error": f"The EODHD provider does not serve {what}; it covers history only.",
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
