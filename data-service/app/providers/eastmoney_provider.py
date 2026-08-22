"""
EastMoney (东方财富) direct HTTP API data provider.

Calls EastMoney's public push2/push2his endpoints directly — no third-party
library dependency required.  Works as a drop-in replacement for AKShare.

Supported data sources
----------------------
eastmoney_a_share   A-share stocks (auto-detects SSE / SZSE)
eastmoney_hk        Hong Kong stocks
eastmoney_index     Chinese indices (SSE / SZSE)
eastmoney_etf       ETF / LOF funds

Usage
-----
Set  DATA_PROVIDER=eastmoney  in the service's .env file.
"""
from __future__ import annotations

import logging
import socket as _socket
import time
from typing import Any, Dict, List, Optional

import httpx
from cachetools import TTLCache

from ..config import get_settings
from .base import BaseDataProvider

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# IPv6-first DNS resolution
#
# In Docker on macOS the default DNS resolver returns EastMoney's IPv4
# addresses, which refuse connections.  The host machine (and the container
# if IPv6 routing is available) can reach EastMoney via IPv6.
#
# We patch socket.getaddrinfo once at import time so that httpcore (used
# by httpx) picks up IPv6 addresses first.  Falls back to IPv4 silently
# if no IPv6 addresses are returned.
# ---------------------------------------------------------------------------
_real_getaddrinfo = _socket.getaddrinfo


def _getaddrinfo_prefer_ipv6(host, port, family=0, *args, **kwargs):
    results = _real_getaddrinfo(host, port, family, *args, **kwargs)
    if family == 0 and results:
        ipv6 = [r for r in results if r[0] == _socket.AF_INET6]
        ipv4 = [r for r in results if r[0] != _socket.AF_INET6]
        return (ipv6 + ipv4) if ipv6 else results
    return results


_socket.getaddrinfo = _getaddrinfo_prefer_ipv6

_cache: TTLCache = TTLCache(maxsize=settings.cache_max_size, ttl=settings.cache_ttl)

# ---------------------------------------------------------------------------
# EastMoney endpoint constants
# ---------------------------------------------------------------------------
_KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
_CLIST_URL = "https://push2.eastmoney.com/api/qt/clist/get"

_HEADERS = {
    # Mobile UA is required — desktop UA causes rc=102 on the kline endpoint
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 10; K) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Mobile Safari/537.36"
    ),
    "Referer": "https://quote.eastmoney.com/",
}

# Public user-token required by kline + clist endpoints
_UT = "bd1d9195e7"

# fields1 is required for kline endpoint to return data (rc=102 without it)
_KLINE_FIELDS1 = "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13"

# klt mapping
_PERIOD_KLT: Dict[str, int] = {"daily": 101, "weekly": 102, "monthly": 103}

# fqt mapping  (default to forward-adjust so behaviour matches AKShare default)
_ADJUST_FQT: Dict[str | None, int] = {
    None: 1, "": 1,
    "qfq": 1,    # 前复权
    "hfq": 2,    # 后复权
    "none": 0,   # 不复权
}

# kline fields2 — order must match _parse_kline()
_KLINE_FIELDS = "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"


def _http_get(
    url: str,
    params: Dict[str, Any],
    *,
    retries: int = 3,
    backoff: float = 1.0,
) -> httpx.Response:
    """
    GET with redirect following and simple retry-on-disconnect logic.

    EastMoney's push2.eastmoney.com issues 302 → push2delay.eastmoney.com,
    so follow_redirects=True is mandatory.  The endpoints occasionally drop the
    connection or return a transient 5xx (seen while paging through long lists);
    a short backoff + retry resolves these.  Client 4xx errors are not retried.
    """
    timeout = settings.akshare_timeout
    last_exc: Exception = RuntimeError("No attempts made")
    for attempt in range(1, retries + 1):
        try:
            with httpx.Client(
                timeout=timeout,
                headers=_HEADERS,
                follow_redirects=True,
            ) as client:
                r = client.get(url, params=params)
            r.raise_for_status()
            return r
        except httpx.HTTPStatusError as exc:
            # Only transient server-side 5xx are worth retrying; 4xx won't heal.
            if exc.response.status_code < 500:
                raise
            last_exc = exc
            if attempt < retries:
                logger.warning(
                    "EastMoney HTTP %d (attempt %d/%d) — retrying in %.1fs",
                    exc.response.status_code, attempt, retries, backoff * attempt,
                )
                time.sleep(backoff * attempt)
        except httpx.TransportError as exc:
            # Covers connect/read/write/timeout/protocol errors (e.g. the server
            # dropping the connection mid-response).
            last_exc = exc
            if attempt < retries:
                logger.warning(
                    "EastMoney connection error (attempt %d/%d): %s — retrying in %.1fs",
                    attempt, retries, exc, backoff * attempt,
                )
                time.sleep(backoff * attempt)
        except Exception as exc:
            raise exc  # non-transient errors propagate immediately
    raise last_exc


class EastMoneyProvider(BaseDataProvider):
    """Data provider backed by EastMoney public HTTP APIs."""

    VERSION = "1.0.0"  # provider implementation version

    # Keys match the canonical IDs defined in lib/data-sources.ts.
    DATA_SOURCES: Dict[str, Dict] = {
        "cn.stock": {
            "name": "A股历史数据",
            "category": "A股",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "6位数字 (自动识别沪/深)",
            "example": "600519",
        },
        "hk.stock": {
            "name": "港股历史数据",
            "category": "港股",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "5位数字",
            "example": "00700",
        },
        "us.stock": {
            "name": "美股历史数据",
            "category": "美股",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "股票代码",
            "example": "AAPL",
        },
        "cn.index": {
            "name": "中国指数历史数据",
            "category": "指数",
            "params": ["symbol", "period", "start_date", "end_date"],
            "defaults": {"period": "daily"},
            "symbol_format": "6位数字",
            "example": "000001",
        },
        "hk.index": {
            "name": "港股指数历史数据",
            "category": "指数",
            "params": ["symbol"],
            "defaults": {},
            "symbol_format": "指数代码",
            "example": "HSI",
        },
        "us.index": {
            "name": "美股指数历史数据",
            "category": "指数",
            "params": ["symbol"],
            "defaults": {},
            "symbol_format": "指数代码",
            "example": ".INX",
        },
        "global.index": {
            "name": "全球指数历史数据",
            "category": "指数",
            "params": ["symbol"],
            "defaults": {},
            "symbol_format": "指数名称",
            "example": "标普500",
        },
        "cn.etf": {
            "name": "ETF基金历史数据",
            "category": "基金",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "6位数字",
            "example": "510300",
        },
        "cn.lof": {
            "name": "LOF基金历史数据",
            "category": "基金",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "基金代码",
            "example": "163402",
        },
        "cn.futures": {
            "name": "国内期货历史数据",
            "category": "期货",
            "params": ["symbol"],
            "defaults": {},
            "symbol_format": "合约代码",
            "example": "RB0",
        },
        "global.futures": {
            "name": "外盘期货历史数据",
            "category": "期货",
            "params": ["symbol", "start_date", "end_date"],
            "defaults": {},
            "symbol_format": "合约代码",
            "example": "CL",
        },
    }

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "EastMoney"

    @property
    def provider_version(self) -> str:
        return self.VERSION

    def health_check(self) -> Dict[str, Any]:
        """Ping EastMoney to verify connectivity."""
        try:
            _http_get(
                _KLINE_URL,
                {
                    "secid": "1.600519",
                    "ut": _UT,
                    "fields1": _KLINE_FIELDS1,
                    "fields2": _KLINE_FIELDS,
                    "klt": 101,
                    "fqt": 1,
                    "end": "20500000",
                    "lmt": 1,
                },
                retries=1,
            )
            return {"status": "healthy", "version": self.VERSION, "message": None}
        except Exception as exc:
            return {"status": "unhealthy", "version": self.VERSION, "message": str(exc)}

    # ------------------------------------------------------------------
    # Historical data
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
        if data_source not in self.DATA_SOURCES:
            return {
                "success": False,
                "error": f"Unknown data source: {data_source}",
                "error_code": "INVALID_DATA_SOURCE",
            }

        cfg = self.DATA_SOURCES[data_source]
        defaults = cfg.get("defaults", {})
        period = period or defaults.get("period", "daily")
        adjust = adjust if adjust is not None else defaults.get("adjust")

        cache_key = f"em:{data_source}:{symbol}:{start_date}:{end_date}:{adjust}:{period}"
        if cache_key in _cache:
            logger.debug("Cache hit: %s", cache_key)
            return _cache[cache_key]

        secid = self._secid(data_source, symbol)
        klt = _PERIOD_KLT.get(period, 101)
        fqt = _ADJUST_FQT.get(adjust, 1)

        params: Dict[str, Any] = {
            "secid": secid,
            "ut": _UT,
            "fields1": _KLINE_FIELDS1,  # required — omitting causes rc=102
            "fields2": _KLINE_FIELDS,
            "klt": klt,
            "fqt": fqt,
            "beg": start_date or "19900101",
            "end": end_date or "20991231",
        }

        try:
            r = _http_get(_KLINE_URL, params)
            payload = r.json()
        except Exception as exc:
            logger.error("EastMoney kline fetch error for %s: %s", symbol, exc)
            return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

        data_node = payload.get("data") or {}
        klines: List[str] = data_node.get("klines") or []
        name: str = data_node.get("name", "")

        if not klines:
            return {
                "success": False,
                "error": f"No data returned for symbol: {symbol}",
                "error_code": "NO_DATA",
            }

        records = [self._parse_kline(k) for k in klines]
        records.sort(key=lambda x: x["date"])

        result: Dict[str, Any] = {
            "success": True,
            "data": {
                "symbol": symbol,
                "name": name,
                "data_source": data_source,
                "first_date": records[0]["date"],
                "last_date": records[-1]["date"],
                "row_count": len(records),
                "records": records,
            },
        }
        _cache[cache_key] = result
        return result

    @staticmethod
    def _parse_kline(line: str) -> Dict[str, Any]:
        """
        Parse one kline CSV string returned by EastMoney.

        Field order (fields2 = f51…f61):
          [0]date  [1]open  [2]close  [3]high  [4]low
          [5]volume  [6]turnover  [7]amplitude  [8]change_pct
          [9]change_amount  [10]turnover_rate
        """
        parts = line.split(",")

        def _f(idx: int) -> float:
            try:
                v = parts[idx].strip()
                return float(v) if v not in ("-", "") else 0.0
            except (IndexError, ValueError):
                return 0.0

        def _i(idx: int) -> int:
            try:
                v = parts[idx].strip()
                return int(float(v)) if v not in ("-", "") else 0
            except (IndexError, ValueError):
                return 0

        record: Dict[str, Any] = {
            "date": parts[0].strip() if parts else "",
            "open": _f(1),
            "close": _f(2),
            "high": _f(3),
            "low": _f(4),
            "volume": _i(5),
        }
        optional = {
            "turnover": 6,
            "amplitude": 7,
            "change_pct": 8,
            "change_amount": 9,
            "turnover_rate": 10,
        }
        for col, idx in optional.items():
            v = _f(idx)
            if v != 0.0:
                record[col] = v

        return record

    # ------------------------------------------------------------------
    # secid resolution
    # ------------------------------------------------------------------

    def _secid(self, data_source: str, symbol: str) -> str:
        """
        Derive the EastMoney `secid` (market.code) from canonical data_source + symbol.

        Market codes used by EastMoney:
          0   SZSE (深交所)  — A-shares 0xxxxx / 3xxxxx; SZSE indices 399xxx
          1   SSE  (上交所)  — A-shares 6xxxxx; SSE indices 000xxx; ETF 5xxxxx
          116 HKEX (港交所)
          105 NASDAQ / 106 NYSE / 107 AMEX  (US stocks — best-effort)
        """
        if data_source in ("cn.stock", "cn.stock.b", "cn.stock.cdr"):
            # SSE: 6xxxxx / 9xxxxx (科创板);  SZSE: everything else
            mkt = "1" if symbol.startswith(("6", "9")) else "0"
            return f"{mkt}.{symbol}"

        if data_source == "hk.stock":
            return f"116.{symbol}"

        if data_source == "us.stock":
            # EastMoney treats US stocks under market 105 (NASDAQ-listed names)
            # as a best-effort fallback; not all US tickers are available.
            return f"105.{symbol}"

        if data_source in ("cn.index",):
            # SZSE indices start with 3 (e.g. 399001); SSE indices start with 0/1
            mkt = "0" if symbol.startswith("3") else "1"
            return f"{mkt}.{symbol}"

        if data_source == "hk.index":
            return f"116.{symbol}"

        if data_source == "us.index":
            return f"105.{symbol}"

        if data_source == "global.index":
            return f"1.{symbol}"

        if data_source in ("cn.etf", "cn.lof"):
            # SSE ETFs/LOFs start with 5; SZSE start with 1
            mkt = "1" if symbol.startswith("5") else "0"
            return f"{mkt}.{symbol}"

        if data_source in ("cn.futures", "global.futures"):
            return f"113.{symbol}"

        # fallback — let EastMoney decide
        return f"1.{symbol}"

    # ------------------------------------------------------------------
    # Listing endpoints
    # ------------------------------------------------------------------

    def get_stock_list(
        self, market: str = "a_share", include_delisted: bool = False
    ) -> Dict[str, Any]:
        market_fs: Dict[str, str] = {
            "a_share": "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048",
            "hk": "m:116+t:3,m:116+t:4",
            "us": "m:105+t:2,m:106+t:1,m:107+t:3",
        }
        if market not in market_fs:
            return {
                "success": False,
                "error": f"Unknown market: {market}",
                "error_code": "INVALID_MARKET",
            }

        cache_key = f"em:list:stock:{market}"
        if cache_key in _cache:
            return _cache[cache_key]

        try:
            items = self._fetch_clist(
                fs=market_fs[market],
                fields="f12,f13,f14",
            )
        except Exception as exc:
            logger.error("EastMoney stock list fetch failed (market=%s): %s", market, exc)
            return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

        exchange_map = {"0": "SZSE", "1": "SSE", "116": "HKEX"}

        def _item(row: Dict) -> Dict:
            mkt_code = str(row.get("f13", ""))
            return {
                "code": str(row.get("f12", "")),
                "name": str(row.get("f14", "")),
                "exchange": exchange_map.get(mkt_code, mkt_code),
                "status": "active",
            }

        result = {
            "success": True,
            "data": {
                "market": market,
                "count": len(items),
                "items": [_item(r) for r in items],
            },
        }
        _cache[cache_key] = result
        return result

    def get_index_list(self, market: str = "zh") -> Dict[str, Any]:
        market_fs: Dict[str, str] = {
            "zh": "m:1+s:2,m:0+t:5",
            "hk": "m:116+s:2",
            "us": "m:105+t:3,m:106+t:3,m:107+t:3",
            "global": "m:1+s:2,m:0+t:5,m:116+s:2",
        }
        if market not in market_fs:
            return {
                "success": False,
                "error": f"Unknown market: {market}",
                "error_code": "INVALID_MARKET",
            }

        cache_key = f"em:list:index:{market}"
        if cache_key in _cache:
            return _cache[cache_key]

        try:
            items = self._fetch_clist(fs=market_fs[market], fields="f12,f13,f14")
        except Exception as exc:
            logger.error("EastMoney index list fetch failed (market=%s): %s", market, exc)
            return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

        result = {
            "success": True,
            "data": {
                "market": market,
                "count": len(items),
                "items": [
                    {"code": str(r.get("f12", "")), "name": str(r.get("f14", "")), "market": market}
                    for r in items
                ],
            },
        }
        _cache[cache_key] = result
        return result

    def get_fund_list(self, fund_type: str = "etf") -> Dict[str, Any]:
        fund_fs: Dict[str, str] = {
            "etf": "b:MK0021,b:MK0022,b:MK0023,b:MK0024",
            "lof": "b:MK0404,b:MK0405",
        }
        if fund_type not in fund_fs:
            return {
                "success": False,
                "error": f"Unknown fund type: {fund_type}",
                "error_code": "INVALID_TYPE",
            }

        cache_key = f"em:list:fund:{fund_type}"
        if cache_key in _cache:
            return _cache[cache_key]

        try:
            items = self._fetch_clist(fs=fund_fs[fund_type], fields="f12,f14")
        except Exception as exc:
            logger.error("EastMoney fund list fetch failed (type=%s): %s", fund_type, exc)
            return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

        result = {
            "success": True,
            "data": {
                "type": fund_type,
                "count": len(items),
                "items": [
                    {"code": str(r.get("f12", "")), "name": str(r.get("f14", "")), "type": fund_type}
                    for r in items
                ],
            },
        }
        _cache[cache_key] = result
        return result

    def get_futures_list(self) -> Dict[str, Any]:
        # EastMoney futures: m:110,m:114,m:115,m:113,m:112
        cache_key = "em:list:futures"
        if cache_key in _cache:
            return _cache[cache_key]

        try:
            items = self._fetch_clist(
                fs="m:110,m:114,m:115,m:113,m:112",
                fields="f12,f14,f107",
            )
        except Exception as exc:
            logger.error("EastMoney futures list fetch failed: %s", exc)
            return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

        result = {
            "success": True,
            "data": {
                "count": len(items),
                "items": [
                    {
                        "code": str(r.get("f12", "")),
                        "name": str(r.get("f14", "")),
                        "exchange": str(r.get("f107", "")),
                    }
                    for r in items
                ],
            },
        }
        _cache[cache_key] = result
        return result

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    def get_data_sources(self) -> Dict[str, Any]:
        sources = [
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
        return {"success": True, "data": {"sources": sources}}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _fetch_clist(
        self,
        fs: str,
        fields: str,
        page_size: int = 100,
    ) -> List[Dict]:
        """
        Fetch a complete security list from EastMoney's clist endpoint.

        The endpoint caps every response at 100 rows regardless of the requested
        ``pz``, so we page through with ``pn`` until ``data.total`` rows have been
        collected (or a short/empty page signals the end).  A single large-``pz``
        request would silently return only the first 100 instruments.
        """
        rows: List[Dict] = []
        total: Optional[int] = None
        page = 1
        while True:
            params: Dict[str, Any] = {
                "pn": page,
                "pz": page_size,
                "po": 1,
                "np": 1,
                "ut": _UT,
                "fltt": 2,
                "invt": 2,
                "fid": "f3",
                "fs": fs,
                "fields": fields,
            }
            try:
                payload = _http_get(_CLIST_URL, params).json()
            except Exception as exc:
                # If any page fails (even after _http_get's own retries) we can't
                # guarantee a complete list, so surface it as an error rather than
                # returning a silently-truncated one that looks successful.
                logger.error(
                    "EastMoney clist fetch error (fs=%s, pn=%d of total): %s",
                    fs, page, exc,
                )
                raise

            data = payload.get("data") or {}
            diff = data.get("diff") or []
            if not diff:
                break
            rows.extend(diff)

            if total is None:
                total = data.get("total") or 0
            # Stop once we've collected everything or the server returned a short page.
            if len(rows) >= total or len(diff) < page_size:
                break
            page += 1

        if total and len(rows) < total:
            logger.warning(
                "EastMoney clist incomplete (fs=%s): collected %d of %d rows",
                fs, len(rows), total,
            )
        return rows
