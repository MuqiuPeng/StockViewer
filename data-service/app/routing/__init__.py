"""Capability-aware routing across providers."""
from .router import ProviderRouter, RouteResult, get_router, DEFAULT_ROUTES

__all__ = ["ProviderRouter", "RouteResult", "get_router", "DEFAULT_ROUTES"]
