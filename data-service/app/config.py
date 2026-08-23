"""
Configuration for the Stock Data Service.
"""
from pathlib import Path

from pydantic_settings import BaseSettings
from functools import lru_cache

# The service runs with its own directory as the working directory, so a bare
# ".env" only ever finds data-service/.env. Secrets shared with the web app
# live in the repository root, so load that too - the local file wins.
_SERVICE_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _SERVICE_DIR.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Service info
    app_name: str = "Stock Data Service"
    app_version: str = "1.0.0"
    debug: bool = False

    # Logging
    log_level: str = "INFO"

    # Rate limiting
    rate_limit_requests: int = 100
    rate_limit_period: int = 60  # seconds

    # Cache settings
    cache_ttl: int = 300  # 5 minutes
    cache_max_size: int = 1000

    # Active data provider (must match a registered provider name)
    # Built-in: "akshare"
    # Add more by registering them in app/providers/registry.py
    data_provider: str = "akshare"

    # AKShare settings
    akshare_timeout: int = 60  # seconds

    # Alpha Vantage settings
    alphavantage_api_key: str = ""
    alphavantage_timeout: int = 30  # seconds
    # Free tier allows 25 requests/day. The provider stops before exceeding
    # this and says so, rather than letting Alpha Vantage return an opaque
    # rate-limit note that looks like empty data.
    alphavantage_daily_limit: int = 25

    class Config:
        # Later files win, so the service-local .env can override the root one.
        env_file = (_REPO_ROOT / ".env", _SERVICE_DIR / ".env")
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
