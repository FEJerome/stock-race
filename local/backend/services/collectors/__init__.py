"""
Collectors Package - Real-time Data Collection Framework

This package provides a unified data collection framework for the event sentiment system.
It supports multiple data sources with incremental collection, retry mechanisms, and scheduling.

Key Components:
- BaseCollector: Abstract base class for all collectors
- CollectorScheduler: APScheduler-based task scheduling
- RetryPolicy: Exponential backoff retry mechanism
- CollectionLogger: Collection activity logging
- NewsCollector: Adapter for NewsSource implementations
- SentimentCollector: Adapter for SentimentSource implementations

Usage Example:
    from services.collectors import (
        CollectorScheduler,
        NewsCollector,
        SentimentCollector,
        RetryPolicy
    )
    from services.news.sina_news import SinaNewsSource
    from services.sentiment.xueqiu_source import XueqiuSource

    # Create scheduler
    scheduler = CollectorScheduler()

    # Register news collector
    news_collector = NewsCollector(SinaNewsSource())
    scheduler.register_collector(
        news_collector,
        interval_minutes=5,
        symbols=["000001.SZ", "600000.SH"],
        retry_policy=RetryPolicy(max_retries=3, base_delay=2.0)
    )

    # Register sentiment collector
    sentiment_collector = SentimentCollector(XueqiuSource())
    scheduler.register_collector(
        sentiment_collector,
        interval_minutes=10,
        symbols=["000001.SZ"]
    )

    # Start scheduling
    await scheduler.start()

    # Manual collection (for EventExtractor)
    result = await news_collector.collect(
        symbol="000001.SZ",
        since=datetime(2024, 1, 1)  # Incremental collection
    )
    # result.items -> List[NewsItem]
    # result.next_since -> datetime for next incremental collection
"""

# Base classes and types
from .base import (
    BaseCollector,
    CollectionResult,
    CollectorHealth,
    CollectorStatus,
)

# Retry and circuit breaker
from .retry import (
    RetryPolicy,
    RetryExhaustedError,
    with_retry,
    retryable,
    CircuitBreaker,
    CircuitState,
)

# Logging
from .logger import (
    CollectionLog,
    CollectionLogger,
    LogStatus,
    get_logger,
    set_logger,
)

# Scheduler
from .scheduler import (
    CollectorScheduler,
    ScheduledTask,
    get_scheduler,
    set_scheduler,
)

# Concrete collectors
from .news_collector import (
    NewsCollector,
    MultiSourceNewsCollector,
)
from .sentiment_collector import (
    SentimentCollector,
    MultiSourceSentimentCollector,
)

__all__ = [
    # Base
    "BaseCollector",
    "CollectionResult",
    "CollectorHealth",
    "CollectorStatus",

    # Retry
    "RetryPolicy",
    "RetryExhaustedError",
    "with_retry",
    "retryable",
    "CircuitBreaker",
    "CircuitState",

    # Logger
    "CollectionLog",
    "CollectionLogger",
    "LogStatus",
    "get_logger",
    "set_logger",

    # Scheduler
    "CollectorScheduler",
    "ScheduledTask",
    "get_scheduler",
    "set_scheduler",

    # Collectors
    "NewsCollector",
    "MultiSourceNewsCollector",
    "SentimentCollector",
    "MultiSourceSentimentCollector",
]

__version__ = "1.0.0"
