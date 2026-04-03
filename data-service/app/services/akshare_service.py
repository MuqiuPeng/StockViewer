"""
Backward-compatibility shim.

Code that previously imported `akshare_service` directly can continue to
work unchanged. New code should import from `app.providers.registry` instead.
"""
from ..providers.registry import get_provider as _get_provider

# Singleton alias — behaves identically to the old module-level instance
akshare_service = _get_provider("akshare")
