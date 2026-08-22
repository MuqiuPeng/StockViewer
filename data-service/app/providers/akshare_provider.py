"""
AKShare data provider implementation.

Wraps the akshare library and implements the BaseDataProvider interface.
"""
import akshare as ak
import pandas as pd
import requests
import time
from typing import Callable, Optional, Dict, Any
from cachetools import TTLCache
import logging

from .base import BaseDataProvider
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_cache: TTLCache = TTLCache(maxsize=settings.cache_max_size, ttl=settings.cache_ttl)

# Transient network failures raised by akshare's bare ``requests`` calls to the
# Chinese exchange endpoints.  These servers (notably www.szse.cn, which serves
# the A-share list as an xlsx report) intermittently drop the TLS connection
# mid-handshake — surfacing as e.g. ``SSLError(SSLEOFError(... UNEXPECTED_EOF_
# WHILE_READING ...))`` or ``ConnectionError('Connection aborted', RemoteDisconnected)``.
# akshare performs no retries of its own, so a single dropped connection fails
# the whole request.  ``requests.exceptions.ConnectionError`` is the parent of
# ``SSLError`` and also wraps ``RemoteDisconnected``, so it covers both cases.
_TRANSIENT_NETWORK_ERRORS = (
    requests.exceptions.ConnectionError,
    requests.exceptions.Timeout,
    requests.exceptions.ChunkedEncodingError,
)


def _call_with_retry(
    fn: Callable[..., Any],
    *args: Any,
    retries: int = 3,
    backoff: float = 1.0,
    **kwargs: Any,
) -> Any:
    """Call *fn* retrying transient network failures with linear backoff.

    akshare's data functions wrap bare ``requests.get`` calls with no retry
    logic.  The successful sub-fetches inside a composite akshare function are
    ``@lru_cache``d, so a retry only re-attempts the part that actually failed.
    Non-transient errors propagate immediately.
    """
    last_exc: Exception = RuntimeError("No attempts made")
    for attempt in range(1, retries + 1):
        try:
            return fn(*args, **kwargs)
        except _TRANSIENT_NETWORK_ERRORS as exc:
            last_exc = exc
            if attempt < retries:
                logger.warning(
                    "AKShare transient network error (attempt %d/%d): %s — retrying in %.1fs",
                    attempt, retries, exc, backoff * attempt,
                )
                time.sleep(backoff * attempt)
    raise last_exc


class AKShareProvider(BaseDataProvider):
    """Data provider backed by the AKShare library."""

    # Column name mapping: Chinese → English
    COLUMN_MAP = {
        "日期": "date",
        "开盘": "open",
        "收盘": "close",
        "最高": "high",
        "最低": "low",
        "成交量": "volume",
        "成交额": "turnover",
        "振幅": "amplitude",
        "涨跌幅": "change_pct",
        "涨跌额": "change_amount",
        "换手率": "turnover_rate",
        "最新价": "close",
        "今开": "open",
        "昨收": "prev_close",
        "股票代码": "code",
        "代码": "code",
        "股票名称": "name",
        "名称": "name",
    }

    # Canonical data source IDs → AKShare function details.
    # Keys must match the canonical IDs defined in lib/data-sources.ts.
    DATA_SOURCES: Dict[str, Dict] = {
        "cn.stock": {
            "name": "A股历史数据",
            "category": "A股",
            "function": "stock_zh_a_hist",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "6位数字",
            "example": "000001",
        },
        "cn.stock.b": {
            "name": "B股历史数据",
            "category": "B股",
            "function": "stock_zh_b_daily",
            "params": ["symbol", "start_date", "end_date", "adjust"],
            "defaults": {"adjust": "qfq"},
            "symbol_format": "sh/sz + 6位数字",
            "example": "sh900901",
        },
        "cn.stock.cdr": {
            "name": "CDR历史数据",
            "category": "CDR",
            "function": "stock_zh_a_cdr_daily",
            "params": ["symbol", "start_date", "end_date"],
            "defaults": {},
            "symbol_format": "6位数字",
            "example": "688126",
        },
        "hk.stock": {
            "name": "港股历史数据",
            "category": "港股",
            "function": "stock_hk_hist",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "5位数字",
            "example": "00700",
        },
        "us.stock": {
            "name": "美股历史数据",
            "category": "美股",
            "function": "stock_us_hist",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "股票代码",
            "example": "AAPL",
        },
        "cn.index": {
            "name": "中国指数历史数据",
            "category": "指数",
            "function": "index_zh_a_hist",
            "params": ["symbol", "period", "start_date", "end_date"],
            "defaults": {"period": "daily"},
            "symbol_format": "6位数字",
            "example": "000001",
        },
        "hk.index": {
            "name": "港股指数历史数据",
            "category": "指数",
            "function": "stock_hk_index_daily_em",
            "params": ["symbol"],
            "defaults": {},
            "symbol_format": "指数代码",
            "example": "HSI",
        },
        "us.index": {
            "name": "美股指数历史数据",
            "category": "指数",
            "function": "index_us_stock_sina",
            "params": ["symbol"],
            "defaults": {},
            "symbol_format": "指数代码",
            "example": ".INX",
        },
        "global.index": {
            "name": "全球指数历史数据",
            "category": "指数",
            "function": "index_global_hist_em",
            "params": ["symbol"],
            "defaults": {},
            "symbol_format": "指数名称",
            "example": "标普500",
        },
        "cn.etf": {
            "name": "ETF基金历史数据",
            "category": "基金",
            "function": "fund_etf_hist_em",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "6位数字",
            "example": "510300",
        },
        "cn.lof": {
            "name": "LOF基金历史数据",
            "category": "基金",
            "function": "fund_lof_hist_em",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "基金代码",
            "example": "163402",
        },
        "cn.futures": {
            "name": "国内期货历史数据",
            "category": "期货",
            "function": "futures_zh_daily_sina",
            "params": ["symbol"],
            "defaults": {},
            "symbol_format": "合约代码",
            "example": "RB0",
        },
        "global.futures": {
            "name": "外盘期货历史数据",
            "category": "期货",
            "function": "futures_foreign_hist",
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
        return "AKShare"

    @property
    def provider_version(self) -> str:
        return ak.__version__

    def health_check(self) -> Dict[str, Any]:
        try:
            version = ak.__version__
            return {"status": "healthy", "version": version, "message": None}
        except Exception as exc:
            return {"status": "unhealthy", "version": None, "message": str(exc)}

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

        config = self.DATA_SOURCES[data_source]
        func_name = config["function"]
        defaults = config.get("defaults", {})

        params: Dict[str, Any] = {"symbol": symbol}
        if "period" in config["params"]:
            params["period"] = period or defaults.get("period", "daily")
        if "start_date" in config["params"] and start_date:
            params["start_date"] = start_date
        if "end_date" in config["params"] and end_date:
            params["end_date"] = end_date
        if "adjust" in config["params"]:
            params["adjust"] = adjust or defaults.get("adjust", "qfq")

        cache_key = f"{data_source}:{symbol}:{start_date}:{end_date}:{adjust}:{period}"
        if cache_key in _cache:
            logger.debug(f"Cache hit for {cache_key}")
            return _cache[cache_key]

        try:
            func = getattr(ak, func_name)
            df = _call_with_retry(func, **params)

            if df is None or df.empty:
                return {
                    "success": False,
                    "error": f"No data found for symbol: {symbol}",
                    "error_code": "NO_DATA",
                }

            result = self._transform_dataframe(df, data_source, symbol)
            _cache[cache_key] = result
            return result

        except Exception as exc:
            logger.error(f"Error fetching data for {symbol}: {exc}")
            return {
                "success": False,
                "error": str(exc),
                "error_code": "FETCH_ERROR",
            }

    def _transform_dataframe(
        self, df: pd.DataFrame, data_source: str, symbol: str
    ) -> Dict[str, Any]:
        df = df.rename(columns=self.COLUMN_MAP)

        required = ["date", "open", "high", "low", "close", "volume"]
        for col in required:
            if col not in df.columns:
                if col == "date" and "日期" in df.columns:
                    df["date"] = df["日期"]
                elif col == "volume" and "成交量" in df.columns:
                    df["volume"] = df["成交量"]

        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")

        records = []
        for _, row in df.iterrows():
            record: Dict[str, Any] = {
                "date": str(row.get("date", "")),
                "open": float(row.get("open", 0)),
                "high": float(row.get("high", 0)),
                "low": float(row.get("low", 0)),
                "close": float(row.get("close", 0)),
                "volume": int(row.get("volume", 0)),
            }
            for opt in ("turnover", "amplitude", "change_pct", "change_amount", "turnover_rate"):
                if opt in row and pd.notna(row[opt]):
                    record[opt] = float(row[opt])
            records.append(record)

        records.sort(key=lambda x: x["date"])
        first_date = records[0]["date"] if records else None
        last_date = records[-1]["date"] if records else None

        return {
            "success": True,
            "data": {
                "symbol": symbol,
                "data_source": data_source,
                "first_date": first_date,
                "last_date": last_date,
                "row_count": len(records),
                "records": records,
            },
        }

    # ------------------------------------------------------------------
    # Listing endpoints
    # ------------------------------------------------------------------

    def get_stock_list(
        self, market: str = "a_share", include_delisted: bool = False
    ) -> Dict[str, Any]:
        try:
            items = []

            if market == "a_share":
                try:
                    df = _call_with_retry(ak.stock_info_a_code_name)
                except _TRANSIENT_NETWORK_ERRORS as exc:
                    # ak.stock_info_a_code_name() depends on www.szse.cn, which
                    # frequently drops the TLS connection from server/Docker
                    # environments.  Fall back to EastMoney's hardened, szse-free
                    # list endpoint so the A-share list still resolves.
                    logger.warning(
                        "AKShare A-share list failed after retries (%s); "
                        "falling back to EastMoney provider.", exc,
                    )
                    return self._a_share_list_via_eastmoney(include_delisted)

                for _, row in df.iterrows():
                    code = str(row.get("code", row.get("代码", "")))
                    items.append({
                        "code": code,
                        "name": str(row.get("name", row.get("名称", ""))),
                        "exchange": "SZSE" if code.startswith(("0", "3")) else "SSE",
                        "status": "active",
                    })

                if include_delisted:
                    for fetch_fn, exchange, code_col, name_col in [
                        (ak.stock_info_sh_delist, "SSE", "公司代码", "公司简称"),
                        (ak.stock_info_sz_delist, "SZSE", "证券代码", "证券简称"),
                    ]:
                        try:
                            for _, row in _call_with_retry(fetch_fn).iterrows():
                                items.append({
                                    "code": str(row.get(code_col, "")),
                                    "name": str(row.get(name_col, "")),
                                    "exchange": exchange,
                                    "status": "delisted",
                                })
                        except Exception:
                            pass

            elif market == "hk":
                df = _call_with_retry(ak.stock_hk_spot_em)
                for _, row in df.iterrows():
                    items.append({
                        "code": str(row.get("代码", "")),
                        "name": str(row.get("名称", "")),
                        "exchange": "HKEX",
                        "status": "active",
                    })

            elif market == "us":
                df = _call_with_retry(ak.stock_us_spot_em)
                for _, row in df.iterrows():
                    items.append({
                        "code": str(row.get("代码", "")),
                        "name": str(row.get("名称", "")),
                        "exchange": "US",
                        "status": "active",
                    })

            else:
                return {
                    "success": False,
                    "error": f"Unknown market: {market}",
                    "error_code": "INVALID_MARKET",
                }

            return {
                "success": True,
                "data": {"market": market, "count": len(items), "items": items},
            }

        except Exception as exc:
            logger.error(f"Error fetching stock list for {market}: {exc}")
            return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

    def _a_share_list_via_eastmoney(self, include_delisted: bool) -> Dict[str, Any]:
        """Fallback A-share list via the EastMoney provider.

        EastMoney's clist endpoint does not touch www.szse.cn and uses a
        hardened HTTP client (browser UA, redirect following, retry-on-disconnect,
        IPv6-first DNS), so it survives the szse.cn TLS outages that break
        ``ak.stock_info_a_code_name()``.  Imported lazily to avoid a module-load
        cycle with the provider registry.
        """
        from .eastmoney_provider import EastMoneyProvider

        return EastMoneyProvider().get_stock_list(
            market="a_share", include_delisted=include_delisted
        )

    def get_index_list(self, market: str = "zh") -> Dict[str, Any]:
        try:
            items = []
            fetch_map = {
                "zh": (ak.stock_zh_index_spot_em, "zh"),
                "hk": (ak.stock_hk_index_spot_em, "hk"),
                "us": (ak.index_us_stock_sina, "us"),
                "global": (ak.index_global_spot_em, "global"),
            }

            if market not in fetch_map:
                return {
                    "success": False,
                    "error": f"Unknown market: {market}",
                    "error_code": "INVALID_MARKET",
                }

            fetch_fn, mkt_label = fetch_map[market]
            df = _call_with_retry(fetch_fn)
            for _, row in df.iterrows():
                items.append({
                    "code": str(row.get("代码", row.get("symbol", ""))),
                    "name": str(row.get("名称", row.get("name", ""))),
                    "market": mkt_label,
                })

            return {
                "success": True,
                "data": {"market": market, "count": len(items), "items": items},
            }

        except Exception as exc:
            logger.error(f"Error fetching index list for {market}: {exc}")
            return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

    def get_fund_list(self, fund_type: str = "etf") -> Dict[str, Any]:
        try:
            items = []
            fetch_map = {
                "etf": ak.fund_etf_spot_em,
                "lof": ak.fund_lof_spot_em,
            }

            if fund_type not in fetch_map:
                return {
                    "success": False,
                    "error": f"Unknown fund type: {fund_type}",
                    "error_code": "INVALID_TYPE",
                }

            df = _call_with_retry(fetch_map[fund_type])
            for _, row in df.iterrows():
                items.append({
                    "code": str(row.get("代码", "")),
                    "name": str(row.get("名称", "")),
                    "type": fund_type,
                })

            return {
                "success": True,
                "data": {"type": fund_type, "count": len(items), "items": items},
            }

        except Exception as exc:
            logger.error(f"Error fetching fund list for {fund_type}: {exc}")
            return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

    def get_futures_list(self) -> Dict[str, Any]:
        try:
            df = _call_with_retry(ak.futures_zh_spot)
            items = []
            for _, row in df.iterrows():
                items.append({
                    "code": str(row.get("symbol", row.get("代码", ""))),
                    "name": str(row.get("name", row.get("名称", ""))),
                    "exchange": str(row.get("exchange", "")),
                })
            return {"success": True, "data": {"count": len(items), "items": items}}

        except Exception as exc:
            logger.error(f"Error fetching futures list: {exc}")
            return {"success": False, "error": str(exc), "error_code": "FETCH_ERROR"}

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    def get_data_sources(self) -> Dict[str, Any]:
        sources = []
        for source_id, config in self.DATA_SOURCES.items():
            sources.append({
                "id": source_id,
                "name": config["name"],
                "category": config["category"],
                "symbol_format": config.get("symbol_format"),
                "example_symbol": config.get("example"),
                "parameters": config.get("params", []),
            })
        return {"success": True, "data": {"sources": sources}}
