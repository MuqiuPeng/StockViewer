"""
AKShare service wrapper for fetching stock data.
"""
import akshare as ak
import pandas as pd
from typing import Optional, Dict, Any, List
from datetime import datetime, date
from cachetools import TTLCache
import logging

from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Cache for stock data
_cache = TTLCache(maxsize=settings.cache_max_size, ttl=settings.cache_ttl)


class AKShareService:
    """Service for fetching stock data from AKShare."""

    # Column name mapping: Chinese -> English
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
        # Index specific columns
        "最新价": "close",
        "今开": "open",
        "昨收": "prev_close",
        # Alternative names
        "股票代码": "code",
        "代码": "code",
        "股票名称": "name",
        "名称": "name",
    }

    # Supported data sources and their configurations
    DATA_SOURCES = {
        "stock_zh_a_hist": {
            "name": "A股历史数据",
            "category": "A股",
            "function": "stock_zh_a_hist",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "6位数字",
            "example": "000001",
        },
        "stock_hk_hist": {
            "name": "港股历史数据",
            "category": "港股",
            "function": "stock_hk_hist",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "5位数字",
            "example": "00700",
        },
        "stock_us_hist": {
            "name": "美股历史数据",
            "category": "美股",
            "function": "stock_us_hist",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "股票代码",
            "example": "AAPL",
        },
        "fund_etf_hist_em": {
            "name": "ETF历史数据",
            "category": "基金",
            "function": "fund_etf_hist_em",
            "params": ["symbol", "period", "start_date", "end_date", "adjust"],
            "defaults": {"period": "daily", "adjust": "qfq"},
            "symbol_format": "6位数字",
            "example": "510300",
        },
        "index_zh_a_hist": {
            "name": "指数历史数据",
            "category": "指数",
            "function": "index_zh_a_hist",
            "params": ["symbol", "period", "start_date", "end_date"],
            "defaults": {"period": "daily"},
            "symbol_format": "6位数字",
            "example": "000001",
        },
    }

    def __init__(self):
        self.version = ak.__version__

    def get_history(
        self,
        data_source: str,
        symbol: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        adjust: Optional[str] = None,
        period: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Fetch historical OHLCV data for a symbol.

        Args:
            data_source: Data source identifier (e.g., 'stock_zh_a_hist')
            symbol: Stock/index symbol
            start_date: Start date in YYYYMMDD format
            end_date: End date in YYYYMMDD format
            adjust: Price adjustment type ('qfq', 'hfq', or None)
            period: Data period ('daily', 'weekly', 'monthly')

        Returns:
            Dictionary with success status and data
        """
        if data_source not in self.DATA_SOURCES:
            return {
                "success": False,
                "error": f"Unknown data source: {data_source}",
                "error_code": "INVALID_DATA_SOURCE",
            }

        config = self.DATA_SOURCES[data_source]
        func_name = config["function"]
        defaults = config.get("defaults", {})

        # Build parameters
        params = {"symbol": symbol}

        if "period" in config["params"]:
            params["period"] = period or defaults.get("period", "daily")

        if "start_date" in config["params"] and start_date:
            params["start_date"] = start_date

        if "end_date" in config["params"] and end_date:
            params["end_date"] = end_date

        if "adjust" in config["params"]:
            params["adjust"] = adjust or defaults.get("adjust", "qfq")

        # Check cache
        cache_key = f"{data_source}:{symbol}:{start_date}:{end_date}:{adjust}:{period}"
        if cache_key in _cache:
            logger.debug(f"Cache hit for {cache_key}")
            return _cache[cache_key]

        try:
            func = getattr(ak, func_name)
            df = func(**params)

            if df is None or df.empty:
                return {
                    "success": False,
                    "error": f"No data found for symbol: {symbol}",
                    "error_code": "NO_DATA",
                }

            # Transform data
            result = self._transform_dataframe(df, data_source, symbol)

            # Cache result
            _cache[cache_key] = result

            return result

        except Exception as e:
            logger.error(f"Error fetching data for {symbol}: {e}")
            return {
                "success": False,
                "error": str(e),
                "error_code": "FETCH_ERROR",
            }

    def _transform_dataframe(
        self, df: pd.DataFrame, data_source: str, symbol: str
    ) -> Dict[str, Any]:
        """Transform pandas DataFrame to API response format."""
        # Rename columns
        df = df.rename(columns=self.COLUMN_MAP)

        # Ensure required columns exist
        required_columns = ["date", "open", "high", "low", "close", "volume"]
        for col in required_columns:
            if col not in df.columns:
                # Try to find alternative names
                if col == "date" and "日期" in df.columns:
                    df["date"] = df["日期"]
                elif col == "volume" and "成交量" in df.columns:
                    df["volume"] = df["成交量"]

        # Convert date to string format
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")

        # Convert to records
        records = []
        for _, row in df.iterrows():
            record = {
                "date": str(row.get("date", "")),
                "open": float(row.get("open", 0)),
                "high": float(row.get("high", 0)),
                "low": float(row.get("low", 0)),
                "close": float(row.get("close", 0)),
                "volume": int(row.get("volume", 0)),
            }

            # Add optional fields if present
            if "turnover" in row and pd.notna(row["turnover"]):
                record["turnover"] = float(row["turnover"])
            if "amplitude" in row and pd.notna(row["amplitude"]):
                record["amplitude"] = float(row["amplitude"])
            if "change_pct" in row and pd.notna(row["change_pct"]):
                record["change_pct"] = float(row["change_pct"])
            if "change_amount" in row and pd.notna(row["change_amount"]):
                record["change_amount"] = float(row["change_amount"])
            if "turnover_rate" in row and pd.notna(row["turnover_rate"]):
                record["turnover_rate"] = float(row["turnover_rate"])

            records.append(record)

        # Sort by date
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

    def get_stock_list(
        self, market: str = "a_share", include_delisted: bool = False
    ) -> Dict[str, Any]:
        """
        Get list of stocks for a market.

        Args:
            market: Market identifier ('a_share', 'hk', 'us')
            include_delisted: Whether to include delisted stocks

        Returns:
            Dictionary with success status and stock list
        """
        try:
            items = []

            if market == "a_share":
                # Active stocks
                df = ak.stock_info_a_code_name()
                for _, row in df.iterrows():
                    items.append({
                        "code": str(row.get("code", row.get("代码", ""))),
                        "name": str(row.get("name", row.get("名称", ""))),
                        "exchange": "SZSE" if str(row.get("code", "")).startswith(("0", "3")) else "SSE",
                        "status": "active",
                    })

                # Delisted stocks (if requested)
                if include_delisted:
                    try:
                        df_sh = ak.stock_info_sh_delist()
                        for _, row in df_sh.iterrows():
                            items.append({
                                "code": str(row.get("公司代码", "")),
                                "name": str(row.get("公司简称", "")),
                                "exchange": "SSE",
                                "status": "delisted",
                            })
                    except Exception:
                        pass

                    try:
                        df_sz = ak.stock_info_sz_delist()
                        for _, row in df_sz.iterrows():
                            items.append({
                                "code": str(row.get("证券代码", "")),
                                "name": str(row.get("证券简称", "")),
                                "exchange": "SZSE",
                                "status": "delisted",
                            })
                    except Exception:
                        pass

            elif market == "hk":
                df = ak.stock_hk_spot_em()
                for _, row in df.iterrows():
                    items.append({
                        "code": str(row.get("代码", "")),
                        "name": str(row.get("名称", "")),
                        "exchange": "HKEX",
                        "status": "active",
                    })

            elif market == "us":
                df = ak.stock_us_spot_em()
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
                "data": {
                    "market": market,
                    "count": len(items),
                    "items": items,
                },
            }

        except Exception as e:
            logger.error(f"Error fetching stock list for {market}: {e}")
            return {
                "success": False,
                "error": str(e),
                "error_code": "FETCH_ERROR",
            }

    def get_index_list(self, market: str = "zh") -> Dict[str, Any]:
        """
        Get list of indices for a market.

        Args:
            market: Market identifier ('zh', 'hk', 'us', 'global')

        Returns:
            Dictionary with success status and index list
        """
        try:
            items = []

            if market == "zh":
                df = ak.stock_zh_index_spot_em()
                for _, row in df.iterrows():
                    items.append({
                        "code": str(row.get("代码", "")),
                        "name": str(row.get("名称", "")),
                        "market": "zh",
                    })

            elif market == "hk":
                df = ak.stock_hk_index_spot_em()
                for _, row in df.iterrows():
                    items.append({
                        "code": str(row.get("代码", "")),
                        "name": str(row.get("名称", "")),
                        "market": "hk",
                    })

            elif market == "us":
                df = ak.index_us_stock_sina()
                for _, row in df.iterrows():
                    items.append({
                        "code": str(row.get("代码", row.get("symbol", ""))),
                        "name": str(row.get("名称", row.get("name", ""))),
                        "market": "us",
                    })

            elif market == "global":
                df = ak.index_global_spot_em()
                for _, row in df.iterrows():
                    items.append({
                        "code": str(row.get("代码", "")),
                        "name": str(row.get("名称", "")),
                        "market": "global",
                    })

            else:
                return {
                    "success": False,
                    "error": f"Unknown market: {market}",
                    "error_code": "INVALID_MARKET",
                }

            return {
                "success": True,
                "data": {
                    "market": market,
                    "count": len(items),
                    "items": items,
                },
            }

        except Exception as e:
            logger.error(f"Error fetching index list for {market}: {e}")
            return {
                "success": False,
                "error": str(e),
                "error_code": "FETCH_ERROR",
            }

    def get_fund_list(self, fund_type: str = "etf") -> Dict[str, Any]:
        """
        Get list of funds.

        Args:
            fund_type: Fund type ('etf', 'lof')

        Returns:
            Dictionary with success status and fund list
        """
        try:
            items = []

            if fund_type == "etf":
                df = ak.fund_etf_spot_em()
                for _, row in df.iterrows():
                    items.append({
                        "code": str(row.get("代码", "")),
                        "name": str(row.get("名称", "")),
                        "type": "etf",
                    })

            elif fund_type == "lof":
                df = ak.fund_lof_spot_em()
                for _, row in df.iterrows():
                    items.append({
                        "code": str(row.get("代码", "")),
                        "name": str(row.get("名称", "")),
                        "type": "lof",
                    })

            else:
                return {
                    "success": False,
                    "error": f"Unknown fund type: {fund_type}",
                    "error_code": "INVALID_TYPE",
                }

            return {
                "success": True,
                "data": {
                    "type": fund_type,
                    "count": len(items),
                    "items": items,
                },
            }

        except Exception as e:
            logger.error(f"Error fetching fund list for {fund_type}: {e}")
            return {
                "success": False,
                "error": str(e),
                "error_code": "FETCH_ERROR",
            }

    def get_futures_list(self) -> Dict[str, Any]:
        """
        Get list of futures contracts.

        Returns:
            Dictionary with success status and futures list
        """
        try:
            items = []

            df = ak.futures_zh_spot()
            for _, row in df.iterrows():
                items.append({
                    "code": str(row.get("symbol", row.get("代码", ""))),
                    "name": str(row.get("name", row.get("名称", ""))),
                    "exchange": str(row.get("exchange", "")),
                })

            return {
                "success": True,
                "data": {
                    "count": len(items),
                    "items": items,
                },
            }

        except Exception as e:
            logger.error(f"Error fetching futures list: {e}")
            return {
                "success": False,
                "error": str(e),
                "error_code": "FETCH_ERROR",
            }

    def get_stock_info(self, symbol: str) -> Dict[str, Any]:
        """
        Get detailed information about a stock.

        Args:
            symbol: Stock symbol

        Returns:
            Dictionary with success status and stock info
        """
        try:
            df = ak.stock_individual_info_em(symbol=symbol)

            if df is None or df.empty:
                return {
                    "success": False,
                    "error": f"No info found for symbol: {symbol}",
                    "error_code": "NO_DATA",
                }

            # Convert to dictionary
            info = {}
            for _, row in df.iterrows():
                key = str(row.get("item", ""))
                value = row.get("value", "")
                info[key] = value

            return {
                "success": True,
                "data": {
                    "symbol": symbol,
                    "info": info,
                },
            }

        except Exception as e:
            logger.error(f"Error fetching stock info for {symbol}: {e}")
            return {
                "success": False,
                "error": str(e),
                "error_code": "FETCH_ERROR",
            }

    def get_data_sources(self) -> Dict[str, Any]:
        """Get list of available data sources."""
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

        return {
            "success": True,
            "data": {
                "sources": sources,
            },
        }


# Singleton instance
akshare_service = AKShareService()
