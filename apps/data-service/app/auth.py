"""
Caller authentication for the data service.

This service holds every provider credential and every unspent quota the
account has. Nothing here is a secret in the sense of being confidential —
it returns share prices — but an unauthenticated copy on a reachable
interface is an open proxy for a set of paid, rate-limited API keys, and the
first sign of that would be a provider cutting the account off.

It used to be protected by where it listened rather than by anything in the
code: uvicorn defaults to loopback and nobody had passed --host. That is a
property of a command line, not of the service, and it is one flag away from
being untrue at a moment when nobody is thinking about it.

A shared bearer token, checked here, is the property that travels with the
service instead. It mirrors the X-Log-Secret the service already sends the web
app for log ingest, so the two directions are secured the same way.

Missing configuration fails closed. An empty token could not be allowed to
mean "no checking" — that is the exact state this exists to make impossible,
and it would arrive silently.
"""
from __future__ import annotations

import hmac
import logging

from fastapi import HTTPException, Request, status

from .config import get_settings

logger = logging.getLogger(__name__)

_SCHEME = "Bearer"


async def require_caller_token(request: Request) -> None:
    """
    Reject any caller that does not present the shared token.

    Wired as a router-level dependency rather than per endpoint, so a new
    route is protected by existing and cannot be forgotten into being public.
    """
    expected = get_settings().data_service_token

    if not expected:
        # Loud, and refusing to serve: a service that answered anyway would be
        # indistinguishable from a configured one until someone reached it
        # from another machine.
        logger.error(
            "DATA_SERVICE_TOKEN is not set; refusing to serve API requests. "
            "Generate one with `openssl rand -hex 32` and put it in .env, "
            "where both this service and the web app read it."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "This service is not configured with DATA_SERVICE_TOKEN and "
                "will not serve requests until it is."
            ),
        )

    header = request.headers.get("Authorization", "")
    scheme, _, presented = header.partition(" ")

    # compare_digest rather than ==: the token is short and an attacker on the
    # LAN can time as many attempts as they like.
    if scheme != _SCHEME or not presented or not hmac.compare_digest(presented, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid caller token.",
            headers={"WWW-Authenticate": _SCHEME},
        )
