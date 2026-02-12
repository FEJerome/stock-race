"""
Configuration settings for Data Service.
"""

import os
import json
from typing import List, Optional
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    """
    Application settings.
    """
    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", 8001))
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001"]

    # TimescaleDB (for all data)
    TSDB_HOST: str = os.getenv("TSDB_HOST", "localhost")
    TSDB_PORT: int = int(os.getenv("TSDB_PORT", 5433))
    TSDB_NAME: str = os.getenv("TSDB_NAME", "stock_race_tsdb")
    TSDB_USER: str = os.getenv("TSDB_USER", "timescale")
    TSDB_PASSWORD: str = os.getenv("TSDB_PASSWORD", "password")

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    # Data Sources
    ALPHA_VANTAGE_API_KEY: Optional[str] = os.getenv("ALPHA_VANTAGE_API_KEY")
    TIINGO_API_KEY: Optional[str] = os.getenv("TIINGO_API_KEY")
    YAHOO_FINANCE_ENABLED: bool = os.getenv("YAHOO_FINANCE_ENABLED", "True").lower() == "true"

    # Chinese Stock Data APIs
    TUSHARE_TOKEN: Optional[str] = os.getenv("TUSHARE_TOKEN")
    AKSHARE_ENABLED: bool = os.getenv("AKSHARE_ENABLED", "True").lower() == "true"
    BAOSTOCK_ENABLED: bool = os.getenv("BAOSTOCK_ENABLED", "True").lower() == "true"

    # Data Collection
    COLLECTION_INTERVAL: int = int(os.getenv("COLLECTION_INTERVAL", 60))  # seconds
    BATCH_SIZE: int = int(os.getenv("BATCH_SIZE", 100))
    MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", 3))

    # Market Hours (China A-share market)
    MARKET_OPEN_HOUR: int = int(os.getenv("MARKET_OPEN_HOUR", 9))
    MARKET_OPEN_MINUTE: int = int(os.getenv("MARKET_OPEN_MINUTE", 30))
    MARKET_CLOSE_HOUR: int = int(os.getenv("MARKET_CLOSE_HOUR", 15))
    MARKET_CLOSE_MINUTE: int = int(os.getenv("MARKET_CLOSE_MINUTE", 0))

    # Data Retention
    RAW_DATA_RETENTION_DAYS: int = int(os.getenv("RAW_DATA_RETENTION_DAYS", 365))
    AGGREGATED_DATA_RETENTION_DAYS: int = int(os.getenv("AGGREGATED_DATA_RETENTION_DAYS", 730))

    # Rate limiting
    RATE_LIMIT_REQUESTS: int = int(os.getenv("RATE_LIMIT_REQUESTS", 50))
    RATE_LIMIT_PERIOD: int = int(os.getenv("RATE_LIMIT_PERIOD", 60))  # seconds

    # Service URLs
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:3001")
    AI_SERVICE_URL: str = os.getenv("AI_SERVICE_URL", "http://localhost:8000")

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: str = os.getenv("LOG_FILE", "logs/data_service.log")

    # Stock Symbols (default Chinese A-share stocks)
    DEFAULT_STOCK_SYMBOLS: List[str] = ["000001.SZ", "000002.SZ", "000858.SZ", "600036.SH", "600519.SH"]

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


settings = Settings()