"""
Configuration for the Stock Data Service.
"""
from pathlib import Path

from pydantic_settings import BaseSettings
from functools import lru_cache

# The service runs with its own directory as the working directory, so a bare
# ".env" only ever finds data-service/.env. What it needs is spread across
# three files: the repository root .env holds shared settings, .env.local holds
# DATABASE_URL because the web app owns it, and data-service/.env is for
# service-only overrides. All three are declared rather than relying on a
# supervisor to inject them — the service was reaching the database only
# because the launcher happened to export DATABASE_URL, and would have fallen
# back silently under any other way of starting it.
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
    # Built-in: "eastmoney", "alphavantage"
    # Add more by registering them in app/providers/registry.py
    data_provider: str = "eastmoney"

    # Upstream HTTP timeout for the EastMoney provider. Still named
    # akshare_timeout in the environment so existing .env files keep working;
    # AKShare itself is gone, it was only ever a wrapper over the same host.
    akshare_timeout: int = 60  # seconds

    # Tiingo settings. Starter plan: 50 requests/hour, 1000/day.
    tiingo_api_key: str = ""
    tiingo_timeout: int = 30  # seconds
    tiingo_hourly_limit: int = 50
    tiingo_daily_limit: int = 1000

    # Decrypts stored credentials. Read through Settings rather than straight
    # from os.environ so it loads from .env like everything else: relying on
    # the environment meant it worked under a supervisor that injects .env and
    # silently fell back to .env credentials anywhere else.
    # Where to listen. Loopback by default because the only caller is the
    # Next.js server on the same host; widening it is a decision that should
    # be written down in configuration, not passed on a command line once.
    bind_host: str = "127.0.0.1"
    bind_port: int = 8000

    # Shared secret every caller must present. Empty means the service
    # refuses to serve rather than serves unprotected — see app/auth.py.
    data_service_token: str = ""

    credential_encryption_key: str = ""

    # Where stored credentials live. Shared with the web app, which owns the
    # ProviderCredential table.
    database_url: str = ""

    # Fiscal.ai
    fiscal_api_key: str = ""

    # Alpaca settings. Free tier: US equities and ETFs, historical from 2016;
    # real-time quotes are the IEX feed only, which is not consolidated tape.
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_endpoint: str = "https://paper-api.alpaca.markets/v2"
    alpaca_data_endpoint: str = "https://data.alpaca.markets/v2"
    alpaca_timeout: int = 30

    # Alpha Vantage settings
    alphavantage_api_key: str = ""
    alphavantage_timeout: int = 30  # seconds
    # Free tier allows 25 requests/day. The provider stops before exceeding
    # this and says so, rather than letting Alpha Vantage return an opaque
    # rate-limit note that looks like empty data.
    alphavantage_daily_limit: int = 25

    class Config:
        # Later files win, so the service-local .env can override the root one.
        env_file = (
            _REPO_ROOT / ".env",
            _REPO_ROOT / ".env.local",
            _SERVICE_DIR / ".env",
        )
        env_file_encoding = "utf-8"
        # .env is shared with the web app and holds keys for tools this service
        # knows nothing about. Refusing to start because an unrecognised
        # variable appeared makes adding a provider key a service outage, which
        # it should not be.
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
