"""
Provider registry — maps provider names to their implementation classes
and returns singleton instances on demand.

Usage
-----
Register a new provider (typically done once at module level)::

    from app.providers.registry import register_provider
    from app.providers.my_provider import MyProvider
    register_provider("myprovider", MyProvider)

Retrieve the currently active provider (selected by DATA_PROVIDER env var)::

    from app.providers.registry import get_provider
    provider = get_provider()          # uses settings.data_provider
    provider = get_provider("eastmoney") # explicit name
"""
from typing import Dict, Type, Optional
import logging

from .base import BaseDataProvider

logger = logging.getLogger(__name__)

# Registry: name → class
_registry: Dict[str, Type[BaseDataProvider]] = {}

# Singleton instances (created lazily)
_instances: Dict[str, BaseDataProvider] = {}


def register_provider(name: str, cls: Type[BaseDataProvider]) -> None:
    """
    Register a provider class under the given name.

    Parameters
    ----------
    name:
        Unique identifier (used in the DATA_PROVIDER env var).
    cls:
        A concrete subclass of BaseDataProvider.
    """
    if not issubclass(cls, BaseDataProvider):
        raise TypeError(f"{cls} must subclass BaseDataProvider")
    _registry[name] = cls
    logger.info(f"Registered data provider: {name} → {cls.__name__}")


def get_provider(name: Optional[str] = None) -> BaseDataProvider:
    """
    Return the singleton instance for the requested provider.

    If *name* is None the value of ``settings.data_provider`` is used.
    Instances are created lazily on first access.

    Raises
    ------
    ValueError
        If the requested provider name is not registered.
    """
    if name is None:
        from ..config import get_settings
        name = get_settings().data_provider

    if name not in _registry:
        available = list(_registry.keys())
        raise ValueError(
            f"Unknown data provider '{name}'. "
            f"Available providers: {available}. "
            f"Set DATA_PROVIDER env var to one of these values."
        )

    if name not in _instances:
        cls = _registry[name]
        _instances[name] = cls()
        logger.info(f"Instantiated data provider: {name}")

    return _instances[name]


def list_providers() -> Dict[str, str]:
    """Return a mapping of registered provider names to their class names."""
    return {name: cls.__name__ for name, cls in _registry.items()}


# ------------------------------------------------------------------
# Register built-in providers
# ------------------------------------------------------------------
from .alpaca_provider import AlpacaProvider                # noqa: E402
from .eastmoney_provider import EastMoneyProvider          # noqa: E402
from .eodhd_provider import EODHDProvider                  # noqa: E402
from .tencent_provider import TencentProvider              # noqa: E402
from .tiingo_provider import TiingoProvider                # noqa: E402
from .twelvedata_provider import TwelveDataProvider        # noqa: E402
from .alphavantage_provider import AlphaVantageProvider    # noqa: E402

register_provider("alpaca", AlpacaProvider)
register_provider("eastmoney", EastMoneyProvider)
register_provider("eodhd", EODHDProvider)
register_provider("tencent", TencentProvider)
register_provider("tiingo", TiingoProvider)
register_provider("twelvedata", TwelveDataProvider)
register_provider("alphavantage", AlphaVantageProvider)
