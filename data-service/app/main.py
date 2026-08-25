"""
Stock Data Service - FastAPI Application Entry Point.

A REST API service for fetching stock market data from various sources.
"""
from fastapi import Depends, FastAPI, Request
import logging
import time

from .auth import require_caller_token
from .config import get_settings
from .api.v1.router import router as api_router
from .services.log_forwarder import start_log_flusher, stop_log_flusher, forward_log

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
# httpx logs every request at INFO with the full URL, query string included.
# Five of the seven providers authenticate by query parameter — Tiingo's
# ?token=, EODHD's ?api_token=, Alpha Vantage's and Twelve Data's ?apikey=,
# Fiscal's ?apiKey= — so leaving this on writes a live API key into the log on
# every single call. Logs are the one place a secret is most likely to be
# copied, pasted into an issue, or shipped to a log service, which is a poor
# reward for storing them encrypted at rest.
#
# The line it emits is redundant anyway: the request is already logged by the
# middleware below, without the secret.
logging.getLogger("httpx").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

settings = get_settings()

# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="""
Stock Data Service API

A REST API for fetching stock market data. Supports multiple data sources and markets.

## Features
- Historical OHLCV data for stocks, indices, ETFs
- Stock/index/fund/futures lists for multiple markets
- Multiple data sources with consistent API
- Caching for improved performance

## Supported Markets
- **A-shares**: Chinese stocks (stock_zh_a_hist)
- **Hong Kong**: HK stocks (stock_hk_hist)
- **US**: American stocks (stock_us_hist)
- **ETFs**: Exchange-traded funds (fund_etf_hist_em)
- **Indices**: Market indices (index_zh_a_hist)
    """,
    # Only in debug. The schema is not confidential, but an unauthenticated
    # description of every endpoint on a reachable port is a courtesy this
    # service does not need to extend.
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)

# No CORS middleware, deliberately. Only the Next.js server calls this, from
# its own process — DATA_SERVICE_URL carries no NEXT_PUBLIC_ prefix, so it is
# never bundled into the browser and no page has an origin to allow. The
# wildcard that used to be here granted every origin on the network the right
# to make credentialed requests, in exchange for nothing this service uses.

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    path = request.url.path
    # Skip health checks to reduce noise
    if path == "/api/v1/health":
        return await call_next(request)

    start = time.time()
    response = await call_next(request)
    duration_ms = int((time.time() - start) * 1000)

    method = request.method
    status = response.status_code
    msg = f"{method} {path} {status} ({duration_ms}ms)"

    level = "ERROR" if status >= 500 else ("WARN" if status >= 400 else "INFO")
    forward_log(level, "http_request", msg, {
        "method": method,
        "path": path,
        "status": status,
        "duration_ms": duration_ms,
    })

    return response


# Include API router
# The dependency sits on the router rather than on each endpoint, so a route
# added later is protected by existing rather than by being remembered.
app.include_router(
    api_router, prefix="/api/v1", dependencies=[Depends(require_caller_token)]
)


@app.on_event("startup")
async def startup_event():
    """Initialize service on startup."""
    # Load and validate the gateway configuration here rather than lazily on
    # the first request. A malformed file should stop the service at boot with
    # a field path, not surface later as a fetch error; and the credential
    # pools it builds must exist before anything asks about them.
    from .gateway_config import load_config

    config = load_config()
    logger.info(
        "Gateway config loaded: %d provider(s), usage_context=%s",
        len(config.providers), config.gateway.usage_context,
    )

    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Debug mode: {settings.debug}")
    await start_log_flusher()
    forward_log("INFO", "service_start", f"Data service started v{settings.app_version}")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("Shutting down Stock Data Service")
    forward_log("INFO", "service_stop", "Data service shutting down")
    await stop_log_flusher()


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with service info."""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/api/v1/health",
    }
