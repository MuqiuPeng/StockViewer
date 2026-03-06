"""
Stock Data Service - FastAPI Application Entry Point.

A REST API service for fetching stock market data from various sources.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from .config import get_settings
from .api.v1.router import router as api_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
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
    docs_url="/docs",
    redoc_url="/redoc",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
async def startup_event():
    """Initialize service on startup."""
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Debug mode: {settings.debug}")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("Shutting down Stock Data Service")


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
