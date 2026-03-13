"""
Integration tests for collectors module

Tests integration with real news/sentiment sources and scheduler functionality.
"""
import pytest
import asyncio
from datetime import datetime, timedelta

from services.collectors import (
    CollectorScheduler,
    NewsCollector,
    SentimentCollector,
    CollectionLogger,
    RetryPolicy,
    get_scheduler,
    get_logger,
)
from services.news.sina_news import SinaNewsSource
from services.news.eastmoney_news import EastmoneyNewsSource


@pytest.mark.asyncio
async def test_scheduler_lifecycle():
    """Test scheduler start/stop lifecycle"""
    scheduler = CollectorScheduler()

    # Create a mock collector
    from services.collectors.base import BaseCollector, CollectionResult, CollectorStatus

    class TestCollector(BaseCollector):
        def __init__(self):
            super().__init__(name="test_scheduler", priority=100)
            self.call_count = 0

        def get_source_name(self) -> str:
            return "test_scheduler"

        async def collect(self, symbol, since=None, limit=100):
            self.call_count += 1
            self._set_running()
            return CollectionResult(
                source_name=self.name,
                symbol=symbol,
                items=[],
                count=0,
                start_time=datetime.utcnow(),
                end_time=datetime.utcnow(),
                success=True
            )

    collector = TestCollector()

    # Register collector
    scheduler.register_collector(
        collector,
        interval_minutes=1,
        symbols=["000001.SZ"]
    )

    # Start scheduler
    await scheduler.start()
    assert scheduler._running is True

    # Let it run briefly
    await asyncio.sleep(0.5)

    # Stop scheduler
    await scheduler.stop()
    assert scheduler._running is False


@pytest.mark.asyncio
async def test_multi_source_news_collector():
    """Test multi-source news collector with real sources"""
    from services.collectors.news_collector import MultiSourceNewsCollector

    # Create sources
    sources = [
        SinaNewsSource(priority=50),
        EastmoneyNewsSource(priority=60)
    ]

    collector = MultiSourceNewsCollector(sources, name="test_multi_news")

    # Collect (this will hit real APIs)
    result = await collector.collect("000001.SZ", limit=5)

    # Verify structure (may fail if APIs are down, but tests structure)
    assert result.symbol == "000001.SZ"
    assert result.source_name == "test_multi_news"

    if result.success:
        # Items should be deduplicated
        ids = [item.id for item in result.items]
        assert len(ids) == len(set(ids)), "Items should be deduplicated"

        # Should be sorted by publish_time (newest first)
        if len(result.items) >= 2:
            times = [item.publish_time for item in result.items if item.publish_time]
            if len(times) >= 2:
                assert times[0] >= times[1]

    await collector.close()


@pytest.mark.asyncio
async def test_collector_incremental_collection():
    """Test incremental collection with since parameter"""
    from services.collectors.base import BaseCollector, CollectionResult

    class IncrementalTestCollector(BaseCollector):
        def __init__(self):
            super().__init__(name="test_incremental")
            self.items = [
                {"id": "1", "publish_time": datetime(2024, 1, 1, 10, 0, 0)},
                {"id": "2", "publish_time": datetime(2024, 1, 1, 11, 0, 0)},
                {"id": "3", "publish_time": datetime(2024, 1, 1, 12, 0, 0)},
            ]

        def get_source_name(self) -> str:
            return "test_incremental"

        async def collect(self, symbol, since=None, limit=100):
            start_time = datetime.utcnow()

            # Filter items by since
            if since:
                filtered = [
                    item for item in self.items
                    if item["publish_time"] > since
                ]
            else:
                filtered = self.items

            # Determine next_since
            next_since = max(
                (item["publish_time"] for item in filtered),
                default=None
            )

            return CollectionResult(
                source_name=self.name,
                symbol=symbol,
                items=filtered,
                count=len(filtered),
                start_time=start_time,
                end_time=datetime.utcnow(),
                success=True,
                next_since=next_since
            )

    collector = IncrementalTestCollector()

    # Full collection
    result = await collector.collect("TEST")
    assert result.count == 3
    assert result.next_since == datetime(2024, 1, 1, 12, 0, 0)

    # Incremental collection
    since = datetime(2024, 1, 1, 10, 30, 0)
    result = await collector.collect("TEST", since=since)
    assert result.count == 2  # Only items 2 and 3
    assert all(item["publish_time"] > since for item in result.items)


@pytest.mark.asyncio
async def test_collector_with_retry_policy():
    """Test collector with retry policy integration"""
    from services.collectors.base import BaseCollector, CollectionResult

    class FlakyCollector(BaseCollector):
        def __init__(self):
            super().__init__(name="test_flaky")
            self.attempts = 0

        def get_source_name(self) -> str:
            return "test_flaky"

        async def collect(self, symbol, since=None, limit=100):
            self.attempts += 1
            if self.attempts < 3:
                raise ConnectionError(f"Attempt {self.attempts} failed")

            return CollectionResult(
                source_name=self.name,
                symbol=symbol,
                items=[{"id": "success"}],
                count=1,
                start_time=datetime.utcnow(),
                end_time=datetime.utcnow(),
                success=True
            )

    collector = FlakyCollector()

    # Use with_retry
    from services.collectors import with_retry, RetryPolicy

    policy = RetryPolicy(max_retries=3, base_delay=0.01)
    result = await with_retry(
        collector.collect,
        "TEST",
        policy=policy
    )

    assert result.success is True
    assert collector.attempts == 3


@pytest.mark.asyncio
async def test_logger_integration():
    """Test logger with scheduler integration"""
    from services.collectors.base import BaseCollector, CollectionResult

    class LoggingTestCollector(BaseCollector):
        def __init__(self):
            super().__init__(name="test_logging")

        def get_source_name(self) -> str:
            return "test_logging"

        async def collect(self, symbol, since=None, limit=100):
            return CollectionResult(
                source_name=self.name,
                symbol=symbol,
                items=[{"test": "data"}],
                count=1,
                start_time=datetime.utcnow(),
                end_time=datetime.utcnow(),
                success=True,
                next_since=datetime.utcnow()
            )

    logger = CollectionLogger()
    scheduler = CollectorScheduler(logger=logger)
    collector = LoggingTestCollector()

    scheduler.register_collector(
        collector,
        interval_minutes=1,
        symbols=["000001.SZ", "600000.SH"]
    )

    # Manual collect should log
    result = await scheduler.manual_collect("test_logging", "000001.SZ")
    assert result.success is True

    # Check logs
    logs = logger.get_recent_logs(collector_name="test_logging")
    assert len(logs) >= 1

    stats = logger.get_stats(collector_name="test_logging")
    assert stats["success"] >= 1


@pytest.mark.skip(reason="Requires network access to real APIs")
@pytest.mark.asyncio
async def test_real_news_source_collection():
    """Test collection from real news source (requires network)"""
    source = SinaNewsSource()
    collector = NewsCollector(source)

    result = await collector.collect("000001.SZ", limit=5)

    assert result.source_name == "sina_news"
    assert result.symbol == "000001.SZ"

    if result.success:
        assert len(result.items) <= 5
        # Verify items are NewsItem instances
        from services.news.base import NewsItem
        for item in result.items:
            assert isinstance(item, NewsItem)
            assert item.id is not None
            assert item.title is not None

    await collector.close()
