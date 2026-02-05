"""
Enhanced configuration settings for Data Service with multi-source routing.
"""

import os
from typing import List, Optional, Dict, Any
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

from .config import Settings as BaseSettings

load_dotenv()


class EnhancedSettings(BaseSettings):
    """
    Enhanced application settings for multi-source routing.
    """
    # Enhanced Server
    ENHANCED_HOST: str = os.getenv("ENHANCED_HOST", "0.0.0.0")
    ENHANCED_PORT: int = int(os.getenv("ENHANCED_PORT", 8002))

    # Data Source Configuration
    DATA_SOURCE_STRATEGY: str = os.getenv("DATA_SOURCE_STRATEGY", "adaptive")
    DEFAULT_SEGMENTATION_STRATEGY: str = os.getenv("DEFAULT_SEGMENTATION_STRATEGY", "by_exchange")

    # Rate Limiting per Source
    SINA_MIN_INTERVAL_MS: int = int(os.getenv("SINA_MIN_INTERVAL_MS", 100))
    SINA_MAX_REQUESTS_PER_MINUTE: int = int(os.getenv("SINA_MAX_REQUESTS_PER_MINUTE", 600))
    SINA_BATCH_SIZE: int = int(os.getenv("SINA_BATCH_SIZE", 100))
    SINA_WEIGHT: float = float(os.getenv("SINA_WEIGHT", 1.0))

    TENCENT_MIN_INTERVAL_MS: int = int(os.getenv("TENCENT_MIN_INTERVAL_MS", 50))
    TENCENT_MAX_REQUESTS_PER_MINUTE: int = int(os.getenv("TENCENT_MAX_REQUESTS_PER_MINUTE", 1200))
    TENCENT_BATCH_SIZE: int = int(os.getenv("TENCENT_BATCH_SIZE", 150))
    TENCENT_WEIGHT: float = float(os.getenv("TENCENT_WEIGHT", 0.8))

    EASTMONEY_MIN_INTERVAL_MS: int = int(os.getenv("EASTMONEY_MIN_INTERVAL_MS", 200))
    EASTMONEY_MAX_REQUESTS_PER_MINUTE: int = int(os.getenv("EASTMONEY_MAX_REQUESTS_PER_MINUTE", 300))
    EASTMONEY_BATCH_SIZE: int = int(os.getenv("EASTMONEY_BATCH_SIZE", 50))
    EASTMONEY_WEIGHT: float = float(os.getenv("EASTMONEY_WEIGHT", 0.6))

    # Collection Parameters
    ENHANCED_BATCH_SIZE: int = int(os.getenv("ENHANCED_BATCH_SIZE", 50))
    MAX_CONCURRENT_REQUESTS: int = int(os.getenv("MAX_CONCURRENT_REQUESTS", 5))
    MAX_SEGMENTS: int = int(os.getenv("MAX_SEGMENTS", 3))

    # Cache TTL (seconds)
    CACHE_TTL_QUOTE: int = int(os.getenv("CACHE_TTL_QUOTE", 5))
    CACHE_TTL_HISTORY: int = int(os.getenv("CACHE_TTL_HISTORY", 3600))
    CACHE_TTL_INFO: int = int(os.getenv("CACHE_TTL_INFO", 86400))
    CACHE_TTL_INDICES: int = int(os.getenv("CACHE_TTL_INDICES", 300))
    CACHE_TTL_INDICATORS: int = int(os.getenv("CACHE_TTL_INDICATORS", 3600))

    # Collection Intervals (seconds)
    COLLECTION_INTERVAL_MARKET_HOURS: int = int(os.getenv("COLLECTION_INTERVAL_MARKET_HOURS", 10))
    COLLECTION_INTERVAL_OFF_HOURS: int = int(os.getenv("COLLECTION_INTERVAL_OFF_HOURS", 300))

    # Health Monitoring
    HEALTH_CHECK_INTERVAL: int = int(os.getenv("HEALTH_CHECK_INTERVAL", 60))
    SOURCE_DEACTIVATION_THRESHOLD: int = int(os.getenv("SOURCE_DEACTIVATION_THRESHOLD", 10))
    SOURCE_REACTIVATION_DELAY_MINUTES: int = int(os.getenv("SOURCE_REACTIVATION_DELAY_MINUTES", 5))

    # Performance Thresholds
    LATENCY_WARNING_THRESHOLD_MS: int = int(os.getenv("LATENCY_WARNING_THRESHOLD_MS", 1000))
    LATENCY_CRITICAL_THRESHOLD_MS: int = int(os.getenv("LATENCY_CRITICAL_THRESHOLD_MS", 3000))
    SUCCESS_RATE_WARNING_THRESHOLD: float = float(os.getenv("SUCCESS_RATE_WARNING_THRESHOLD", 0.8))
    SUCCESS_RATE_CRITICAL_THRESHOLD: float = float(os.getenv("SUCCESS_RATE_CRITICAL_THRESHOLD", 0.5))

    # Data Quality
    MIN_DATA_COMPLETENESS: float = float(os.getenv("MIN_DATA_COMPLETENESS", 0.8))
    MAX_DATA_STALENESS_MINUTES: int = int(os.getenv("MAX_DATA_STALENESS_MINUTES", 5))

    # Segmentation Strategies
    ENABLED_SEGMENTATION_STRATEGIES: List[str] = os.getenv(
        "ENABLED_SEGMENTATION_STRATEGIES",
        "by_exchange,by_first_letter,round_robin"
    ).split(",")

    # Fallback Configuration
    ENABLE_MOCK_DATA_FALLBACK: bool = os.getenv("ENABLE_MOCK_DATA_FALLBACK", "True").lower() == "true"
    MOCK_DATA_EXPIRY_MINUTES: int = int(os.getenv("MOCK_DATA_EXPIRY_MINUTES", 60))

    # Monitoring and Alerting
    ENABLE_PERFORMANCE_MONITORING: bool = os.getenv("ENABLE_PERFORMANCE_MONITORING", "True").lower() == "true"
    MONITORING_RETENTION_DAYS: int = int(os.getenv("MONITORING_RETENTION_DAYS", 30))
    ALERT_WEBHOOK_URL: Optional[str] = os.getenv("ALERT_WEBHOOK_URL")

    # Advanced Features
    ENABLE_PREDICTIVE_LOAD_BALANCING: bool = os.getenv("ENABLE_PREDICTIVE_LOAD_BALANCING", "False").lower() == "true"
    ENABLE_AUTO_STRATEGY_ROTATION: bool = os.getenv("ENABLE_AUTO_STRATEGY_ROTATION", "False").lower() == "true"
    STRATEGY_ROTATION_INTERVAL_MINUTES: int = int(os.getenv("STRATEGY_ROTATION_INTERVAL_MINUTES", 60))

    # Data Source Priority (comma-separated list)
    DATA_SOURCE_PRIORITY: List[str] = os.getenv(
        "DATA_SOURCE_PRIORITY",
        "sina,tencent,eastmoney"
    ).split(",")

    # Stock Lists for Different Segments
    POPULAR_STOCKS: List[str] = os.getenv(
        "POPULAR_STOCKS",
        "000001.SZ,600036.SH,000858.SZ,600519.SH,000333.SZ"
    ).split(",")

    INDEX_STOCKS: List[str] = os.getenv(
        "INDEX_STOCKS",
        "000001.SH,399001.SZ,399006.SZ,000300.SH,000905.SH"
    ).split(",")

    # API Timeouts (seconds)
    HTTP_TIMEOUT: int = int(os.getenv("HTTP_TIMEOUT", 30))
    HTTP_CONNECT_TIMEOUT: int = int(os.getenv("HTTP_CONNECT_TIMEOUT", 10))
    HTTP_READ_TIMEOUT: int = int(os.getenv("HTTP_READ_TIMEOUT", 30))

    # Retry Configuration
    MAX_RETRIES_PER_SOURCE: int = int(os.getenv("MAX_RETRIES_PER_SOURCE", 3))
    RETRY_BACKOFF_FACTOR: float = float(os.getenv("RETRY_BACKOFF_FACTOR", 2.0))
    RETRY_MAX_DELAY_SECONDS: int = int(os.getenv("RETRY_MAX_DELAY_SECONDS", 60))

    # User-Agent Rotation
    ENABLE_USER_AGENT_ROTATION: bool = os.getenv("ENABLE_USER_AGENT_ROTATION", "True").lower() == "true"
    USER_AGENTS: List[str] = os.getenv(
        "USER_AGENTS",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36,"
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36,"
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
    ).split(",")

    # Proxy Configuration (optional)
    ENABLE_PROXY: bool = os.getenv("ENABLE_PROXY", "False").lower() == "true"
    PROXY_URL: Optional[str] = os.getenv("PROXY_URL")

    # Data Validation
    ENABLE_DATA_VALIDATION: bool = os.getenv("ENABLE_DATA_VALIDATION", "True").lower() == "true"
    PRICE_VALIDATION_THRESHOLD: float = float(os.getenv("PRICE_VALIDATION_THRESHOLD", 0.5))  # 50% change threshold
    VOLUME_VALIDATION_THRESHOLD: float = float(os.getenv("VOLUME_VALIDATION_THRESHOLD", 10.0))  # 10x volume change

    # Logging
    ENHANCED_LOG_LEVEL: str = os.getenv("ENHANCED_LOG_LEVEL", "INFO")
    ENHANCED_LOG_FILE: str = os.getenv("ENHANCED_LOG_FILE", "logs/enhanced_data_service.log")
    ENABLE_PERFORMANCE_LOGGING: bool = os.getenv("ENABLE_PERFORMANCE_LOGGING", "True").lower() == "true"

    def get_source_config(self, source_name: str) -> Dict[str, Any]:
        """Get configuration for a specific data source."""
        config_map = {
            "sina": {
                "min_interval": self.SINA_MIN_INTERVAL_MS / 1000.0,  # Convert to seconds
                "max_requests_per_minute": self.SINA_MAX_REQUESTS_PER_MINUTE,
                "batch_size": self.SINA_BATCH_SIZE,
                "weight": self.SINA_WEIGHT
            },
            "tencent": {
                "min_interval": self.TENCENT_MIN_INTERVAL_MS / 1000.0,
                "max_requests_per_minute": self.TENCENT_MAX_REQUESTS_PER_MINUTE,
                "batch_size": self.TENCENT_BATCH_SIZE,
                "weight": self.TENCENT_WEIGHT
            },
            "eastmoney": {
                "min_interval": self.EASTMONEY_MIN_INTERVAL_MS / 1000.0,
                "max_requests_per_minute": self.EASTMONEY_MAX_REQUESTS_PER_MINUTE,
                "batch_size": self.EASTMONEY_BATCH_SIZE,
                "weight": self.EASTMONEY_WEIGHT
            }
        }

        return config_map.get(source_name, {})

    def get_cache_ttl(self) -> Dict[str, int]:
        """Get cache TTL configuration."""
        return {
            "quote": self.CACHE_TTL_QUOTE,
            "history": self.CACHE_TTL_HISTORY,
            "info": self.CACHE_TTL_INFO,
            "indices": self.CACHE_TTL_INDICES,
            "indicators": self.CACHE_TTL_INDICATORS
        }

    def get_http_timeout(self) -> Dict[str, int]:
        """Get HTTP timeout configuration."""
        return {
            "total": self.HTTP_TIMEOUT,
            "connect": self.HTTP_CONNECT_TIMEOUT,
            "read": self.HTTP_READ_TIMEOUT
        }

    def get_retry_config(self) -> Dict[str, Any]:
        """Get retry configuration."""
        return {
            "max_retries": self.MAX_RETRIES_PER_SOURCE,
            "backoff_factor": self.RETRY_BACKOFF_FACTOR,
            "max_delay": self.RETRY_MAX_DELAY_SECONDS
        }

    class Config:
        env_file = ".env"
        case_sensitive = True


# Create settings instance
enhanced_settings = EnhancedSettings()