"""
Service entry point: ``python -m app``.

The bind address used to live in whatever uvicorn command someone typed, and
uvicorn's own default — loopback — was the only thing keeping this service off
the network. Defaults in someone else's tool are not a decision this service
had made; they are one it had not made, and `--host 0.0.0.0` would have
reversed it without touching anything reviewable.

Owning the entry point moves that choice into configuration, where widening it
is a diff.
"""
from __future__ import annotations

import ipaddress
import logging
import sys

import uvicorn

from .config import get_settings

logger = logging.getLogger(__name__)


def _is_loopback(host: str) -> bool:
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return host == "localhost"


def main() -> int:
    settings = get_settings()
    host, port = settings.bind_host, settings.bind_port

    if not _is_loopback(host):
        if not settings.data_service_token:
            # auth.py already refuses each request, but failing here says so
            # once at boot instead of once per request, and before anything on
            # the network has had the chance to ask.
            logger.error(
                "Refusing to bind %s without DATA_SERVICE_TOKEN: that would put "
                "every provider credential behind an open port.", host,
            )
            return 1
        logger.warning(
            "Binding %s — this service is reachable from the network and "
            "protected only by DATA_SERVICE_TOKEN.", host,
        )

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
