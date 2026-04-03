"""
Abstract base class for data providers.

All data providers must implement this interface so the rest of the
application can remain provider-agnostic.
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any


class BaseDataProvider(ABC):
    """
    Abstract interface every data provider must implement.

    A provider encapsulates a third-party data library (AKShare, Tushare,
    Yahoo Finance, etc.) and exposes a uniform API to the rest of the service.

    Return convention
    -----------------
    All methods return a dict with at minimum:
        {"success": True,  "data": {...}}   on success
        {"success": False, "error": "...",  "error_code": "..."} on failure

    Valid error_code values: INVALID_DATA_SOURCE, INVALID_MARKET,
    INVALID_TYPE, NO_DATA, FETCH_ERROR.
    """

    # ------------------------------------------------------------------
    # Provider metadata (implement as properties or class attributes)
    # ------------------------------------------------------------------

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable provider name, e.g. 'AKShare'."""

    @property
    @abstractmethod
    def provider_version(self) -> str:
        """Installed library version string."""

    # ------------------------------------------------------------------
    # Historical OHLCV data
    # ------------------------------------------------------------------

    @abstractmethod
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
        Fetch historical OHLCV data.

        Parameters
        ----------
        data_source:
            Provider-specific source identifier (e.g. 'stock_zh_a_hist').
        symbol:
            Security symbol in the format expected by this provider.
        start_date:
            Start date as YYYYMMDD string (inclusive). None = earliest available.
        end_date:
            End date as YYYYMMDD string (inclusive). None = latest available.
        adjust:
            Dividend/split adjustment: 'qfq' (forward), 'hfq' (backward), or None.
        period:
            Bar size: 'daily', 'weekly', 'monthly'.

        Returns
        -------
        On success::

            {
                "success": True,
                "data": {
                    "symbol": str,
                    "data_source": str,
                    "first_date": str | None,
                    "last_date":  str | None,
                    "row_count":  int,
                    "records": [
                        {
                            "date": "YYYY-MM-DD",
                            "open": float,
                            "high": float,
                            "low":  float,
                            "close": float,
                            "volume": int,
                            # optional:
                            "turnover": float,
                            "amplitude": float,
                            "change_pct": float,
                            "change_amount": float,
                            "turnover_rate": float,
                        }, ...
                    ],
                },
            }
        """

    # ------------------------------------------------------------------
    # Listing endpoints
    # ------------------------------------------------------------------

    @abstractmethod
    def get_stock_list(
        self, market: str = "a_share", include_delisted: bool = False
    ) -> Dict[str, Any]:
        """
        Return a list of stocks for the given market.

        Parameters
        ----------
        market:
            'a_share' | 'hk' | 'us'  (providers may support a subset)
        include_delisted:
            Whether to append delisted stocks.

        Returns
        -------
        On success::

            {
                "success": True,
                "data": {
                    "market": str,
                    "count": int,
                    "items": [{"code": str, "name": str, "exchange": str, "status": str}, ...]
                },
            }
        """

    @abstractmethod
    def get_index_list(self, market: str = "zh") -> Dict[str, Any]:
        """
        Return a list of indices for the given market.

        Parameters
        ----------
        market:
            'zh' | 'hk' | 'us' | 'global'
        """

    @abstractmethod
    def get_fund_list(self, fund_type: str = "etf") -> Dict[str, Any]:
        """
        Return a list of funds.

        Parameters
        ----------
        fund_type:
            'etf' | 'lof'
        """

    @abstractmethod
    def get_futures_list(self) -> Dict[str, Any]:
        """Return a list of active futures contracts."""

    # ------------------------------------------------------------------
    # Metadata / discovery
    # ------------------------------------------------------------------

    @abstractmethod
    def get_data_sources(self) -> Dict[str, Any]:
        """
        Enumerate the data sources this provider supports.

        Returns
        -------
        On success::

            {
                "success": True,
                "data": {
                    "sources": [
                        {
                            "id": str,
                            "name": str,
                            "category": str,
                            "symbol_format": str | None,
                            "example_symbol": str | None,
                            "parameters": list[str],
                        }, ...
                    ]
                },
            }
        """

    # ------------------------------------------------------------------
    # Health check (optional override)
    # ------------------------------------------------------------------

    def health_check(self) -> Dict[str, Any]:
        """
        Verify that the underlying data library is functional.

        The default implementation simply confirms the version is readable.
        Override for a more thorough check (e.g. a real network request).

        Returns
        -------
        ::

            {"status": "healthy" | "unhealthy", "version": str, "message": str | None}
        """
        try:
            version = self.provider_version
            return {"status": "healthy", "version": version, "message": None}
        except Exception as exc:
            return {"status": "unhealthy", "version": None, "message": str(exc)}
