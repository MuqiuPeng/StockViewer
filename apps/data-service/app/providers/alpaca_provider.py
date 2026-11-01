"""
Alpaca provider.

The only US source here with an account and terms behind it — Tencent and
EastMoney are undocumented public endpoints, and the rest are free tiers of
data vendors. Verified: AAPL agrees with the other four providers to the cent,
and MSFT returns 2674 daily bars back to 2016-01-04, which matches Alpaca's
stated history start.

Credentials
-----------
Two values, not one. They are stored as a single encrypted JSON object
``{"key": ..., "secret": ...}`` because the credential model holds one secret
per record, and splitting them across two records would let one be rotated
without the other.

This is a brokerage credential, which is why the config marks it as carrying
more risk than a market-data key: the endpoint currently points at paper
trading, but the same shape of key can reach a live account. Only the market
data API is used here — nothing in this service places orders or reads
positions.

Free-tier scope
---------------
US equities and ETFs. Real-time quotes on this plan are the IEX feed rather
than the consolidated tape, so they are not comparable with a SIP quote; only
daily bars are wired up.

Even for daily bars the plan refuses recent SIP data, and a range running to
today fails the whole request with a 403 rather than returning the settled
part. The end date is therefore clamped to yesterday — the cost is that this
provider is always a day behind, which is why it sits behind Twelve Data in
the chain rather than leading it.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from ..cache import SeriesCache, SingleFlight
from ..config import get_settings
from ..credentials import BudgetKind, NoCredentialAvailable, get_pool
from ..gateway_config import load_config
from ..instruments import UnmappableInstrument, provider_symbol
from ..limits import QuotaExhausted, get_limiter
from ..resilience import (
    RetryDecision, backoff_delay, classify_status, parse_retry_after, should_retry,
)
from .base import BaseDataProvider

logger = logging.getLogger(__name__)

# Bars come from the market data host, not the trading endpoint in .env.
_DATA_URL = "https://data.alpaca.markets/v2/stocks/{symbol}/bars"
_MAX_BARS = 10000


class AlpacaProvider(BaseDataProvider):
    """Data provider backed by Alpaca's market data API."""

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
        provider_cfg = config.providers.get("alpaca")
        limits = provider_cfg.limits if provider_cfg else None

        self._key, self._secret = self._load_credentials()
        self._timeout = get_settings().alpaca_timeout

        self._cache = SeriesCache(
            ttl=config.cache.ohlcv_daily_ttl_seconds,
            max_series=config.cache.max_series,
        )
        self._flight = SingleFlight()
        self._limiter = get_limiter(
            "alpaca",
            max_concurrency=limits.concurrency if limits else 4,
            min_interval=limits.min_interval_seconds if limits else 0.0,
            windows=limits.windows() if limits else {},
        )

        if not self._key:
            logger.warning("No Alpaca credential configured; requests will fail")

    @staticmethod
    def _latest_permitted_end() -> str:
        """
        The most recent end date the free plan will serve.

        Yesterday in UTC: today's session is inside the delayed window, and
        asking for it fails the entire request rather than returning what it
        can.
        """
        return (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    @staticmethod
    def _load_credentials() -> Tuple[str, str]:
        """
        Pull the key/secret pair out of the stored credential.

        Falls back to the settings fields so the provider still works before
        the credential has been migrated.
        """
        pool = get_pool("alpaca")
        usable = pool.usable()
        if usable:
            try:
                parsed = json.loads(usable[0].secret)
                return parsed.get("key", ""), parsed.get("secret", "")
            except (json.JSONDecodeError, AttributeError):
                logger.error(
                    "Alpaca credential is not the expected {key, secret} JSON object"
                )
                return "", ""

        settings = get_settings()
        return settings.alpaca_api_key, settings.alpaca_secret_key

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "Alpaca"

    @property
    def provider_version(self) -> str:
        return self.VERSION

    def health_check(self) -> Dict[str, Any]:
        if not self._key or not self._secret:
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
                f"{self._limiter.describe_usage()}; US equities from 2016; "
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
                    f"Alpaca covers US equities and ETFs; "
                    f"{self.UNSUPPORTED[data_source]} ({data_source}) is not among them."
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

        if not self._key or not self._secret:
            return {
                "success": False,
                "error": "no Alpaca credential configured",
                "error_code": "FETCH_ERROR",
            }

        try:
            ticker = provider_symbol("alpaca", data_source, symbol)
        except UnmappableInstrument as exc:
            return {"success": False, "error": str(exc), "error_code": "UNSUPPORTED_SOURCE"}

        # Bars are split- and dividend-adjusted by request; one series either way.
        key = self._cache.key("alpaca", data_source, ticker, True)
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
                        f"Alpaca {exc.window} limit reached ({exc.limit}); "
                        f"resets in {exc.resets_in_seconds}s."
                    ),
                    "error_code": "FETCH_ERROR",
                }
            except Exception as exc:
                logger.error("Alpaca fetch error for %s: %s", ticker, exc)
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
        gap: Tuple[str, str],
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> List[Dict[str, Any]]:
        # The free plan refuses "recent SIP data" — anything inside roughly the
        # last fifteen minutes — with a 403, and a request running to today
        # trips it even for daily bars. Clamping the end date keeps the whole
        # request from failing over the one bar that is still forming.
        end = min(gap[1], self._latest_permitted_end())

        params = {
            "timeframe": "1Day",
            "start": gap[0],
            "end": end,
            "limit": str(_MAX_BARS),
            "adjustment": "all",
        }

        pool = get_pool("alpaca")
        credential = None
        if pool.usable():
            try:
                credential = pool.acquire({BudgetKind.REQUESTS: 1}, subject=ticker)
            except NoCredentialAvailable as exc:
                raise QuotaExhausted("credential", 0, 0) from exc

        with self._limiter.acquire():
            bars = self._get(_DATA_URL.format(symbol=ticker), params)

        records = self._to_records(bars)
        # Coverage stops where the clamp did. Claiming the requested end would
        # mark the delayed tail as fetched and stop it ever being retried.
        if records:
            covered = (min(records[0]["date"], gap[0]), max(records[-1]["date"], end))
        else:
            covered = (gap[0], end)
        return self._cache.store(key, covered, records, start_date, end_date)

    # ------------------------------------------------------------------
    # HTTP
    # ------------------------------------------------------------------

    def _get(self, url: str, params: Dict[str, str]) -> List[Dict[str, Any]]:
        headers = {
            "APCA-API-KEY-ID": self._key,
            "APCA-API-SECRET-KEY": self._secret,
        }
        max_attempts = 3
        last_exc: Optional[Exception] = None
        collected: List[Dict[str, Any]] = []
        page_token: Optional[str] = None

        for attempt in range(1, max_attempts + 1):
            try:
                with httpx.Client(
                    timeout=self._timeout, follow_redirects=True, trust_env=True,
                    headers=headers,
                ) as client:
                    while True:
                        query = dict(params)
                        if page_token:
                            query["page_token"] = page_token
                        r = client.get(url, params=query)

                        if r.status_code >= 400:
                            break

                        payload = r.json()
                        collected.extend(payload.get("bars") or [])
                        page_token = payload.get("next_page_token")
                        # Long ranges are paginated; stopping at the first page
                        # would silently truncate the series.
                        if not page_token:
                            return collected
            except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.ReadError) as exc:
                last_exc = exc
                if attempt < max_attempts:
                    time.sleep(backoff_delay(attempt))
                    continue
                raise

            decision = classify_status(r.status_code)
            if not should_retry(decision, attempt, max_attempts):
                raise RuntimeError(f"HTTP {r.status_code}: {r.text[:160]}")

            delay = (
                parse_retry_after(r.headers.get("Retry-After"))
                if decision is RetryDecision.RETRY_AFTER
                else None
            )
            time.sleep(delay if delay is not None else backoff_delay(attempt))

        raise last_exc or RuntimeError("Alpaca request failed")

    @staticmethod
    def _to_records(bars: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Alpaca uses single-letter keys: t/o/h/l/c/v."""
        out: List[Dict[str, Any]] = []
        for bar in bars:
            try:
                out.append(
                    {
                        "date": str(bar["t"])[:10],
                        "open": float(bar["o"]),
                        "high": float(bar["h"]),
                        "low": float(bar["l"]),
                        "close": float(bar["c"]),
                        "volume": int(float(bar.get("v") or 0)),
                    }
                )
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning("Skipping malformed Alpaca bar %s: %s", bar.get("t"), exc)
        out.sort(key=lambda r: r["date"])
        return out

    # ------------------------------------------------------------------
    # Listings — not wired up
    # ------------------------------------------------------------------

    def _unsupported(self, what: str) -> Dict[str, Any]:
        return {
            "success": False,
            "error": f"The Alpaca provider does not serve {what}; it covers history only.",
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
