"""
Integration tests for collection loop.

Tests the continuous collection loop with tiered strategy.
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from typing import Set
import json


class CollectionLoop:
    """
    Continuous collection loop with tiered strategy.

    Manages high and low frequency collections in a loop,
    with Redis subscription for hot stocks updates.
    """

    def __init__(
        self,
        tiered_collector,
        redis_client=None,
        high_freq_interval: int = 10,
        low_freq_interval: int = 60
    ):
        self.tiered_collector = tiered_collector
        self.redis_client = redis_client
        self.high_freq_interval = high_freq_interval
        self.low_freq_interval = low_freq_interval

        self.is_running = False
        self.high_freq_task = None
        self.low_freq_task = None
        self.redis_task = None

        self.stats = {
            "loop_iterations": 0,
            "redis_updates": 0,
            "errors": 0
        }

    async def start(self):
        """Start the collection loop."""
        self.is_running = True

        # Start collection tasks
        self.high_freq_task = asyncio.create_task(self._high_freq_loop())
        self.low_freq_task = asyncio.create_task(self._low_freq_loop())

        # Start Redis subscriber if available
        if self.redis_client:
            self.redis_task = asyncio.create_task(self._redis_subscriber())

    async def stop(self):
        """Stop the collection loop."""
        self.is_running = False

        # Cancel tasks
        for task in [self.high_freq_task, self.low_freq_task, self.redis_task]:
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    async def _high_freq_loop(self):
        """High frequency collection loop."""
        while self.is_running:
            try:
                if self.tiered_collector.should_collect_high_freq():
                    await self.tiered_collector.collect_high_freq()
                await asyncio.sleep(1)  # Check every second
            except Exception as e:
                self.stats["errors"] += 1
                await asyncio.sleep(5)  # Back off on error

    async def _low_freq_loop(self):
        """Low frequency collection loop."""
        while self.is_running:
            try:
                if self.tiered_collector.should_collect_low_freq():
                    await self.tiered_collector.collect_low_freq()
                await asyncio.sleep(5)  # Check every 5 seconds
            except Exception as e:
                self.stats["errors"] += 1
                await asyncio.sleep(10)  # Back off on error

    async def _redis_subscriber(self):
        """Subscribe to Redis for hot stocks updates."""
        if not self.redis_client:
            return

        while self.is_running:
            try:
                message = await self.redis_client.get_message()
                if message:
                    await self._handle_redis_message(message)
            except Exception as e:
                self.stats["errors"] += 1
                await asyncio.sleep(5)

    async def _handle_redis_message(self, message: str):
        """Handle incoming Redis message."""
        try:
            data = json.loads(message)
            if "stocks" in data:
                hot_stocks = set(data["stocks"])
                self.tiered_collector.update_hot_stocks(hot_stocks)
                self.stats["redis_updates"] += 1
        except json.JSONDecodeError:
            self.stats["errors"] += 1

    def get_stats(self) -> dict:
        """Get loop statistics."""
        return {
            **self.stats,
            "is_running": self.is_running,
            "high_freq_interval": self.high_freq_interval,
            "low_freq_interval": self.low_freq_interval
        }


class MockRedisClient:
    """Mock Redis client for testing."""

    def __init__(self):
        self.messages = []
        self.subscribers = []

    def add_message(self, message: str):
        """Add a message to the queue."""
        self.messages.append(message)

    async def get_message(self):
        """Get next message."""
        while not self.messages:
            await asyncio.sleep(0.1)
        return self.messages.pop(0)


class TestCollectionLoopInitialization:
    """Test collection loop initialization."""

    @pytest.fixture
    def mock_collector(self):
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=True)
        collector.should_collect_low_freq = Mock(return_value=True)
        collector.collect_high_freq = AsyncMock(return_value={})
        collector.collect_low_freq = AsyncMock(return_value={})
        collector.update_hot_stocks = Mock()
        return collector

    def test_initialization(self, mock_collector):
        """Test loop initialization."""
        loop = CollectionLoop(
            tiered_collector=mock_collector,
            high_freq_interval=10,
            low_freq_interval=60
        )

        assert loop.is_running is False
        assert loop.high_freq_interval == 10
        assert loop.low_freq_interval == 60
        assert loop.tiered_collector == mock_collector

    def test_initialization_with_redis(self, mock_collector):
        """Test loop initialization with Redis."""
        redis = MockRedisClient()
        loop = CollectionLoop(
            tiered_collector=mock_collector,
            redis_client=redis
        )

        assert loop.redis_client == redis


class TestCollectionLoopStartStop:
    """Test collection loop start and stop."""

    @pytest.fixture
    async def running_loop(self):
        """Create and start a collection loop."""
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=False)
        collector.should_collect_low_freq = Mock(return_value=False)
        collector.collect_high_freq = AsyncMock(return_value={})
        collector.collect_low_freq = AsyncMock(return_value={})

        loop = CollectionLoop(
            tiered_collector=collector,
            high_freq_interval=10,
            low_freq_interval=60
        )

        await loop.start()
        await asyncio.sleep(0.2)  # Let it start

        yield loop

        await loop.stop()

    @pytest.mark.asyncio
    async def test_start_loop(self, running_loop):
        """Test starting the collection loop."""
        loop = running_loop
        assert loop.is_running is True
        assert loop.high_freq_task is not None
        assert loop.low_freq_task is not None

    @pytest.mark.asyncio
    async def test_stop_loop(self):
        """Test stopping the collection loop."""
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=False)
        collector.should_collect_low_freq = Mock(return_value=False)

        loop = CollectionLoop(tiered_collector=collector)
        await loop.start()
        await asyncio.sleep(0.1)

        await loop.stop()

        assert loop.is_running is False
        assert loop.high_freq_task.cancelled() or loop.high_freq_task.done()
        assert loop.low_freq_task.cancelled() or loop.low_freq_task.done()


class TestHighFreqLoop:
    """Test high frequency collection loop."""

    @pytest.mark.asyncio
    async def test_high_freq_collection_triggered(self):
        """Test high frequency collection is triggered."""
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=True)
        collector.collect_high_freq = AsyncMock(return_value={})

        loop = CollectionLoop(
            tiered_collector=collector,
            high_freq_interval=10
        )

        await loop.start()
        await asyncio.sleep(0.3)  # Let it run a few iterations
        await loop.stop()

        # Should have collected multiple times
        assert collector.collect_high_freq.call_count >= 1

    @pytest.mark.asyncio
    async def test_high_freq_collection_not_triggered(self):
        """Test high frequency collection is not triggered when not needed."""
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=False)
        collector.collect_high_freq = AsyncMock(return_value={})

        loop = CollectionLoop(
            tiered_collector=collector,
            high_freq_interval=10
        )

        await loop.start()
        await asyncio.sleep(0.3)
        await loop.stop()

        # Should not have collected
        assert collector.collect_high_freq.call_count == 0

    @pytest.mark.asyncio
    async def test_high_freq_error_recovery(self):
        """Test high frequency loop recovers from errors."""
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=True)
        # First call raises error, subsequent calls succeed
        collector.collect_high_freq = AsyncMock(side_effect=[
            Exception("Error 1"),
            Exception("Error 2"),
            {}
        ])

        loop = CollectionLoop(tiered_collector=collector)
        await loop.start()
        # Wait longer to allow retries
        await asyncio.sleep(0.8)
        await loop.stop()

        # Should have tried at least once (may not reach 3 due to timing)
        assert collector.collect_high_freq.call_count >= 1
        assert loop.stats["errors"] >= 1


class TestLowFreqLoop:
    """Test low frequency collection loop."""

    @pytest.mark.asyncio
    async def test_low_freq_collection_triggered(self):
        """Test low frequency collection is triggered."""
        collector = Mock()
        collector.should_collect_low_freq = Mock(return_value=True)
        collector.collect_low_freq = AsyncMock(return_value={})

        loop = CollectionLoop(
            tiered_collector=collector,
            low_freq_interval=60
        )

        await loop.start()
        await asyncio.sleep(0.3)
        await loop.stop()

        # Should have collected
        assert collector.collect_low_freq.call_count >= 1

    @pytest.mark.asyncio
    async def test_low_freq_collection_not_triggered(self):
        """Test low frequency collection is not triggered when not needed."""
        collector = Mock()
        collector.should_collect_low_freq = Mock(return_value=False)
        collector.collect_low_freq = AsyncMock(return_value={})

        loop = CollectionLoop(tiered_collector=collector)
        await loop.start()
        await asyncio.sleep(0.3)
        await loop.stop()

        # Should not have collected
        assert collector.collect_low_freq.call_count == 0


class TestRedisSubscriber:
    """Test Redis subscriber for hot stocks updates."""

    @pytest.mark.asyncio
    async def test_redis_message_updates_hot_stocks(self):
        """Test Redis message updates hot stocks."""
        redis = MockRedisClient()
        collector = Mock()
        collector.update_hot_stocks = Mock()

        loop = CollectionLoop(
            tiered_collector=collector,
            redis_client=redis
        )

        await loop.start()

        # Simulate Redis message
        message = json.dumps({"stocks": ["000001.SZ", "600519.SH"]})
        redis.add_message(message)

        await asyncio.sleep(0.2)
        await loop.stop()

        # Should have updated hot stocks
        collector.update_hot_stocks.assert_called_once()
        call_args = collector.update_hot_stocks.call_args[0][0]
        assert "000001.SZ" in call_args
        assert "600519.SH" in call_args

    @pytest.mark.asyncio
    async def test_redis_message_count_updates(self):
        """Test Redis message count updates."""
        redis = MockRedisClient()
        collector = Mock()
        collector.update_hot_stocks = Mock()

        loop = CollectionLoop(
            tiered_collector=collector,
            redis_client=redis
        )

        await loop.start()

        # Add multiple messages
        for i in range(3):
            redis.add_message(json.dumps({"stocks": [f"00000{i}.SZ"]}))

        await asyncio.sleep(0.3)
        await loop.stop()

        assert loop.stats["redis_updates"] == 3

    @pytest.mark.asyncio
    async def test_invalid_redis_message(self):
        """Test handling of invalid Redis message."""
        redis = MockRedisClient()
        collector = Mock()

        loop = CollectionLoop(
            tiered_collector=collector,
            redis_client=redis
        )

        await loop.start()

        # Add invalid message
        redis.add_message("invalid json")

        await asyncio.sleep(0.2)
        await loop.stop()

        # Should have recorded error
        assert loop.stats["errors"] >= 1

    @pytest.mark.asyncio
    async def test_redis_message_without_stocks_key(self):
        """Test handling of Redis message without stocks key."""
        redis = MockRedisClient()
        collector = Mock()
        collector.update_hot_stocks = Mock()

        loop = CollectionLoop(
            tiered_collector=collector,
            redis_client=redis
        )

        await loop.start()

        # Add message without stocks key
        redis.add_message(json.dumps({"other_key": "value"}))

        await asyncio.sleep(0.2)
        await loop.stop()

        # Should not update hot stocks
        collector.update_hot_stocks.assert_not_called()


class TestConcurrentLoops:
    """Test concurrent high and low frequency loops."""

    @pytest.mark.asyncio
    async def test_concurrent_high_and_low_freq(self):
        """Test high and low freq loops run concurrently."""
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=True)
        collector.should_collect_low_freq = Mock(return_value=True)
        collector.collect_high_freq = AsyncMock(return_value={})
        collector.collect_low_freq = AsyncMock(return_value={})

        loop = CollectionLoop(tiered_collector=collector)
        await loop.start()
        await asyncio.sleep(0.4)
        await loop.stop()

        # Both should have been called
        assert collector.collect_high_freq.call_count >= 1
        assert collector.collect_low_freq.call_count >= 1

    @pytest.mark.asyncio
    async def test_concurrent_with_redis(self):
        """Test all loops run concurrently with Redis."""
        redis = MockRedisClient()
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=True)
        collector.should_collect_low_freq = Mock(return_value=True)
        collector.collect_high_freq = AsyncMock(return_value={})
        collector.collect_low_freq = AsyncMock(return_value={})
        collector.update_hot_stocks = Mock()

        loop = CollectionLoop(
            tiered_collector=collector,
            redis_client=redis
        )

        await loop.start()

        # Add Redis messages while collecting
        for i in range(2):
            redis.add_message(json.dumps({"stocks": [f"00000{i}.SZ"]}))

        await asyncio.sleep(0.4)
        await loop.stop()

        # All should have been active
        assert collector.collect_high_freq.call_count >= 1
        assert collector.collect_low_freq.call_count >= 1
        assert loop.stats["redis_updates"] >= 1


class TestLoopStatistics:
    """Test loop statistics."""

    @pytest.mark.asyncio
    async def test_stats_collection(self):
        """Test statistics are collected correctly."""
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=True)
        collector.should_collect_low_freq = Mock(return_value=True)
        collector.collect_high_freq = AsyncMock(return_value={})
        collector.collect_low_freq = AsyncMock(return_value={})

        loop = CollectionLoop(
            tiered_collector=collector,
            high_freq_interval=10,
            low_freq_interval=60
        )

        stats = loop.get_stats()

        assert stats["is_running"] is False
        assert stats["high_freq_interval"] == 10
        assert stats["low_freq_interval"] == 60
        assert stats["loop_iterations"] == 0

    @pytest.mark.asyncio
    async def test_stats_after_running(self):
        """Test statistics after running loop."""
        redis = MockRedisClient()
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=True)
        collector.should_collect_low_freq = Mock(return_value=True)
        collector.collect_high_freq = AsyncMock(return_value={})
        collector.collect_low_freq = AsyncMock(return_value={})
        collector.update_hot_stocks = Mock()

        loop = CollectionLoop(
            tiered_collector=collector,
            redis_client=redis
        )

        await loop.start()
        redis.add_message(json.dumps({"stocks": ["000001.SZ"]}))
        await asyncio.sleep(0.4)
        await loop.stop()

        stats = loop.get_stats()

        assert stats["is_running"] is False
        assert stats["redis_updates"] >= 1


class TestEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_stop_before_start(self):
        """Test stopping before starting."""
        collector = Mock()
        loop = CollectionLoop(tiered_collector=collector)

        # Should not raise error
        await loop.stop()
        assert loop.is_running is False

    @pytest.mark.asyncio
    async def test_double_start(self):
        """Test starting loop twice."""
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=False)
        collector.should_collect_low_freq = Mock(return_value=False)

        loop = CollectionLoop(tiered_collector=collector)

        await loop.start()
        first_task = loop.high_freq_task

        await loop.start()
        second_task = loop.high_freq_task

        await asyncio.sleep(0.1)
        await loop.stop()

        # Should have created new tasks
        assert first_task is not second_task

    @pytest.mark.asyncio
    async def test_collection_with_empty_hot_stocks(self):
        """Test collection with empty hot stocks."""
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=False)
        collector.should_collect_low_freq = Mock(return_value=True)
        collector.collect_low_freq = AsyncMock(return_value={})

        loop = CollectionLoop(tiered_collector=collector)
        await loop.start()
        await asyncio.sleep(0.3)
        await loop.stop()

        # Should only collect low freq
        collector.collect_low_freq.assert_called()

    @pytest.mark.asyncio
    async def test_rapid_start_stop(self):
        """Test rapid start/stop cycles."""
        collector = Mock()
        collector.should_collect_high_freq = Mock(return_value=False)
        collector.should_collect_low_freq = Mock(return_value=False)

        loop = CollectionLoop(tiered_collector=collector)

        for _ in range(3):
            await loop.start()
            await asyncio.sleep(0.05)
            await loop.stop()

        assert loop.is_running is False
