"""
Data provider abstraction layer.

Built-in providers
------------------
- akshare       — AKShare library (default)
- eastmoney     — EastMoney direct HTTP API (no extra library needed)
- alphavantage  — Alpha Vantage HTTP API (US equities/ETFs only, needs an API key)

To add a new data provider:
1. Create a new file in this directory, e.g. `tushare_provider.py`
2. Subclass BaseDataProvider and implement all abstract methods
3. Register it in registry.py:  register_provider("tushare", TushareProvider)
4. Set DATA_PROVIDER=tushare in your .env to activate it
"""
from .base import BaseDataProvider
from .registry import register_provider, get_provider

__all__ = ["BaseDataProvider", "register_provider", "get_provider"]
