"""
Configuration for the Stock Data Service.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
