"""
Unit tests for layered (tiered) data collector.

Tests the high/low frequency collection strategy based on hot stocks.
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from typing import List, Dict, Any, Optional, Set


class TieredCollector:
    """
    Tiered data collector with high/low frequency collection strategy.

    High frequency (10s): Hot stocks
    Low frequency (60s): All other stocks
    """

    def __init__(
        self,
        high_freq_interval: int = 10,
        low_freq_interval: int = 60,
        max_hot_stocks: int = 300
    ):
        self.high_freq_interval = high_freq_interval
        self.low_freq_interval = low_freq_interval
        self.max_hot_stocks = max_hot_stocks

        # Hot stocks set
        self.hot_stocks: Set[str] = set()

        # All stocks to collect
        self.all_stocks: Set[str] = set()

        # Statistics
        self.stats = {
            "high_freq_collections": 0,
            "low_freq_collections": 0,
            "hot_stocks_count": 0,
            "total_collections": 0
        }

        # Collection timestamps
        self.last_high_freq_collection: Optional[datetime] = None
        self.last_low_freq_collection: Optional[datetime] = None

        # Mock data source for testing
        self.data_source = Mock()
        self.data_source.collect_batch = AsyncMock(return_value={})

    def update_hot_stocks(self, hot_stocks: Set[str]):
        """Update the hot stocks list."""
        # Limit to max_hot_stocks
        self.hot_stocks = set(list(hot_stocks)[:self.max_hot_stocks])
        self.stats["hot_stocks_count"] = len(self.hot_stocks)

    def update_all_stocks(self, all_stocks: Set[str]):
        """Update the complete stocks list."""
        self.all_stocks = all_stocks

    def get_high_freq_stocks(self) -> Set[str]:
        """Get stocks that need high frequency collection."""
        return self.hot_stocks

    def get_low_freq_stocks(self) -> Set[str]:
        """Get stocks that need low frequency collection."""
        # Low freq = all stocks - hot stocks
        return self.all_stocks - self.hot_stocks

    def should_collect_high_freq(self) -> bool:
        """Check if high frequency collection should run."""
        if not self.hot_stocks:
            return False
        if self.last_high_freq_collection is None:
            return True
        elapsed = (datetime.now() - self.last_high_freq_collection).total_seconds()
        return elapsed >= self.high_freq_interval

    def should_collect_low_freq(self) -> bool:
        """Check if low frequency collection should run."""
        if not self.all_stocks:
            return False
        if self.last_low_freq_collection is None:
            return True
        elapsed = (datetime.now() - self.last_low_freq_collection).total_seconds()
        return elapsed >= self.low_freq_interval

    async def collect_high_freq(self) -> Dict[str, Any]:
        """Collect high frequency stocks."""
        if not self.should_collect_high_freq():
            return {}

        stocks = self.get_high_freq_stocks()
        if not stocks:
            return {}

        result = await self.data_source.collect_batch(list(stocks))

        self.last_high_freq_collection = datetime.now()
        self.stats["high_freq_collections"] += 1
        self.stats["total_collections"] += 1

        return result

    async def collect_low_freq(self) -> Dict[str, Any]:
        """Collect low frequency stocks."""
        if not self.should_collect_low_freq():
            return {}

        stocks = self.get_low_freq_stocks()
        if not stocks:
            return {}

        result = await self.data_source.collect_batch(list(stocks))

        self.last_low_freq_collection = datetime.now()
        self.stats["low_freq_collections"] += 1
        self.stats["total_collections"] += 1

        return result

    async def collect(self) -> Dict[str, Any]:
        """Run both high and low frequency collections as needed."""
        results = {}

        # High frequency collection
        if self.should_collect_high_freq():
            high_result = await self.collect_high_freq()
            results.update(high_result)

        # Low frequency collection
        if self.should_collect_low_freq():
            low_result = await self.collect_low_freq()
            results.update(low_result)

        return results

    def get_stats(self) -> Dict[str, Any]:
        """Get collection statistics."""
        return {
            **self.stats,
            "high_freq_interval": self.high_freq_interval,
            "low_freq_interval": self.low_freq_interval,
            "hot_stocks": len(self.hot_stocks),
            "all_stocks": len(self.all_stocks)
        }


class TestTieredCollectorInitialization:
    """Test TieredCollector initialization."""

    def test_default_initialization(self):
        """Test default initialization."""
        collector = TieredCollector()

        assert collector.high_freq_interval == 10
        assert collector.low_freq_interval == 60
        assert collector.max_hot_stocks == 300
        assert collector.hot_stocks == set()
        assert collector.all_stocks == set()

    def test_custom_initialization(self):
        """Test custom initialization."""
        collector = TieredCollector(
            high_freq_interval=5,
            low_freq_interval=30,
            max_hot_stocks=500
        )

        assert collector.high_freq_interval == 5
        assert collector.low_freq_interval == 30
        assert collector.max_hot_stocks == 500

    def test_initial_stats(self):
        """Test initial statistics."""
        collector = TieredCollector()
        stats = collector.get_stats()

        assert stats["high_freq_collections"] == 0
        assert stats["low_freq_collections"] == 0
        assert stats["hot_stocks_count"] == 0
        assert stats["total_collections"] == 0


class TestHotStocksManagement:
    """Test hot stocks management."""

    @pytest.fixture
    def collector(self):
        return TieredCollector()

    def test_update_hot_stocks(self, collector):
        """Test updating hot stocks."""
        hot_stocks = {"000001.SZ", "600519.SH", "000858.SZ"}
        collector.update_hot_stocks(hot_stocks)

        assert collector.hot_stocks == hot_stocks
        assert collector.stats["hot_stocks_count"] == 3

    def test_update_hot_stocks_limit(self, collector):
        """Test hot stocks limit enforcement."""
        collector.max_hot_stocks = 2
        hot_stocks = {"000001.SZ", "600519.SH", "000858.SZ", "600036.SH"}
        collector.update_hot_stocks(hot_stocks)

        assert len(collector.hot_stocks) <= 2
        assert collector.stats["hot_stocks_count"] <= 2

    def test_update_all_stocks(self, collector):
        """Test updating all stocks."""
        all_stocks = {"000001.SZ", "600519.SH", "000858.SZ", "600036.SH"}
        collector.update_all_stocks(all_stocks)

        assert collector.all_stocks == all_stocks

    def test_get_high_freq_stocks(self, collector):
        """Test getting high frequency stocks."""
        hot_stocks = {"000001.SZ", "600519.SH"}
        collector.update_hot_stocks(hot_stocks)

        result = collector.get_high_freq_stocks()
        assert result == hot_stocks

    def test_get_low_freq_stocks(self, collector):
        """Test getting low frequency stocks."""
        all_stocks = {"000001.SZ", "600519.SH", "000858.SZ", "600036.SH"}
        hot_stocks = {"000001.SZ", "600519.SH"}

        collector.update_all_stocks(all_stocks)
        collector.update_hot_stocks(hot_stocks)

        result = collector.get_low_freq_stocks()
        expected = {"000858.SZ", "600036.SH"}  # Non-hot stocks
        assert result == expected


class TestCollectionTiming:
    """Test collection timing logic."""

    @pytest.fixture
    def collector(self):
        return TieredCollector(
            high_freq_interval=10,
            low_freq_interval=60
        )

    def test_should_collect_high_freq_initial(self, collector):
        """Test high frequency collection should run initially."""
        collector.update_hot_stocks({"000001.SZ"})
        assert collector.should_collect_high_freq() is True

    def test_should_collect_high_freq_after_interval(self, collector):
        """Test high frequency collection after interval."""
        collector.update_hot_stocks({"000001.SZ"})
        collector.last_high_freq_collection = datetime.now() - timedelta(seconds=15)

        assert collector.should_collect_high_freq() is True

    def test_should_not_collect_high_freq_before_interval(self, collector):
        """Test high frequency collection should not run before interval."""
        collector.update_hot_stocks({"000001.SZ"})
        collector.last_high_freq_collection = datetime.now() - timedelta(seconds=5)

        assert collector.should_collect_high_freq() is False

    def test_should_not_collect_high_freq_no_hot_stocks(self, collector):
        """Test high frequency collection should not run without hot stocks."""
        assert collector.should_collect_high_freq() is False

    def test_should_collect_low_freq_initial(self, collector):
        """Test low frequency collection should run initially."""
        collector.update_all_stocks({"000001.SZ"})
        assert collector.should_collect_low_freq() is True

    def test_should_collect_low_freq_after_interval(self, collector):
        """Test low frequency collection after interval."""
        collector.update_all_stocks({"000001.SZ"})
        collector.last_low_freq_collection = datetime.now() - timedelta(seconds=65)

        assert collector.should_collect_low_freq() is True

    def test_should_not_collect_low_freq_before_interval(self, collector):
        """Test low frequency collection should not run before interval."""
        collector.update_all_stocks({"000001.SZ"})
        collector.last_low_freq_collection = datetime.now() - timedelta(seconds=30)

        assert collector.should_collect_low_freq() is False


class TestCollectionExecution:
    """Test collection execution."""

    @pytest.fixture
    def collector(self):
        c = TieredCollector()
        c.update_hot_stocks({"000001.SZ", "600519.SH"})
        c.update_all_stocks({"000001.SZ", "600519.SH", "000858.SZ", "600036.SH"})
        return c

    @pytest.mark.asyncio
    async def test_collect_high_freq(self, collector):
        """Test high frequency collection."""
        mock_data = {
            "000001.SZ": {"price": 10.5},
            "600519.SH": {"price": 1500.0}
        }
        collector.data_source.collect_batch = AsyncMock(return_value=mock_data)

        result = await collector.collect_high_freq()

        assert result == mock_data
        assert collector.stats["high_freq_collections"] == 1
        assert collector.last_high_freq_collection is not None

    @pytest.mark.asyncio
    async def test_collect_high_freq_not_needed(self, collector):
        """Test high frequency collection when not needed."""
        collector.last_high_freq_collection = datetime.now()

        result = await collector.collect_high_freq()

        assert result == {}
        assert collector.stats["high_freq_collections"] == 0

    @pytest.mark.asyncio
    async def test_collect_low_freq(self, collector):
        """Test low frequency collection."""
        mock_data = {
            "000858.SZ": {"price": 50.0},
            "600036.SH": {"price": 35.0}
        }
        collector.data_source.collect_batch = AsyncMock(return_value=mock_data)

        result = await collector.collect_low_freq()

        assert result == mock_data
        assert collector.stats["low_freq_collections"] == 1
        assert collector.last_low_freq_collection is not None

    @pytest.mark.asyncio
    async def test_collect_low_freq_not_needed(self, collector):
        """Test low frequency collection when not needed."""
        collector.last_low_freq_collection = datetime.now()

        result = await collector.collect_low_freq()

        assert result == {}
        assert collector.stats["low_freq_collections"] == 0

    @pytest.mark.asyncio
    async def test_collect_both_needed(self, collector):
        """Test collect when both high and low freq are needed."""
        high_data = {"000001.SZ": {"price": 10.5}}
        low_data = {"000858.SZ": {"price": 50.0}}

        async def mock_collect(symbols):
            if "000001.SZ" in symbols:
                return high_data
            return low_data

        collector.data_source.collect_batch = AsyncMock(side_effect=mock_collect)

        result = await collector.collect()

        # Should have collected both
        assert collector.stats["high_freq_collections"] == 1
        assert collector.stats["low_freq_collections"] == 1

    @pytest.mark.asyncio
    async def test_collect_only_high_needed(self, collector):
        """Test collect when only high freq is needed."""
        collector.last_low_freq_collection = datetime.now()

        high_data = {"000001.SZ": {"price": 10.5}}
        collector.data_source.collect_batch = AsyncMock(return_value=high_data)

        result = await collector.collect()

        assert collector.stats["high_freq_collections"] == 1
        assert collector.stats["low_freq_collections"] == 0


class TestStatistics:
    """Test statistics tracking."""

    @pytest.fixture
    def collector(self):
        return TieredCollector()

    @pytest.mark.asyncio
    async def test_stats_after_high_freq_collection(self, collector):
        """Test stats after high frequency collection."""
        collector.update_hot_stocks({"000001.SZ"})
        collector.data_source.collect_batch = AsyncMock(return_value={"000001.SZ": {}})

        await collector.collect_high_freq()

        stats = collector.get_stats()
        assert stats["high_freq_collections"] == 1
        assert stats["total_collections"] == 1

    @pytest.mark.asyncio
    async def test_stats_after_low_freq_collection(self, collector):
        """Test stats after low frequency collection."""
        collector.update_all_stocks({"000001.SZ"})
        collector.data_source.collect_batch = AsyncMock(return_value={"000001.SZ": {}})

        await collector.collect_low_freq()

        stats = collector.get_stats()
        assert stats["low_freq_collections"] == 1
        assert stats["total_collections"] == 1

    @pytest.mark.asyncio
    async def test_stats_after_multiple_collections(self, collector):
        """Test stats after multiple collections."""
        collector.update_hot_stocks({"000001.SZ"})
        collector.update_all_stocks({"000001.SZ", "600519.SH"})
        collector.data_source.collect_batch = AsyncMock(return_value={})

        # Reset last collection times to ensure collections run
        collector.last_high_freq_collection = None
        await collector.collect_high_freq()

        collector.last_high_freq_collection = None
        await collector.collect_high_freq()  # Second call

        collector.last_low_freq_collection = None
        await collector.collect_low_freq()

        stats = collector.get_stats()
        assert stats["high_freq_collections"] == 2
        assert stats["low_freq_collections"] == 1
        assert stats["total_collections"] == 3


class TestConcurrentCollection:
    """Test concurrent collection behavior."""

    @pytest.fixture
    def collector(self):
        c = TieredCollector(high_freq_interval=10, low_freq_interval=10)
        c.update_hot_stocks({"000001.SZ", "600519.SH"})
        c.update_all_stocks({"000001.SZ", "600519.SH", "000858.SZ"})
        return c

    @pytest.mark.asyncio
    async def test_concurrent_high_freq_collections(self, collector):
        """Test concurrent high frequency collections don't conflict."""
        async def slow_collect(symbols):
            await asyncio.sleep(0.1)
            return {s: {"price": 10.0} for s in symbols}

        collector.data_source.collect_batch = AsyncMock(side_effect=slow_collect)

        # Run multiple collections concurrently
        tasks = [collector.collect_high_freq() for _ in range(3)]
        results = await asyncio.gather(*tasks)

        # All should complete without error
        assert len(results) == 3

    @pytest.mark.asyncio
    async def test_high_and_low_freq_concurrent(self, collector):
        """Test high and low frequency collections can run concurrently."""
        async def mock_collect(symbols):
            await asyncio.sleep(0.05)
            return {s: {"price": 10.0} for s in symbols}

        collector.data_source.collect_batch = AsyncMock(side_effect=mock_collect)

        # Run both concurrently
        high_task = collector.collect_high_freq()
        low_task = collector.collect_low_freq()

        results = await asyncio.gather(high_task, low_task)

        assert len(results) == 2
        assert collector.stats["high_freq_collections"] == 1
        assert collector.stats["low_freq_collections"] == 1


class TestEdgeCases:
    """Test edge cases."""

    def test_empty_hot_stocks(self):
        """Test behavior with empty hot stocks."""
        collector = TieredCollector()
        collector.update_all_stocks({"000001.SZ"})

        assert collector.get_high_freq_stocks() == set()
        assert collector.get_low_freq_stocks() == {"000001.SZ"}

    def test_hot_stocks_equals_all_stocks(self):
        """Test when all stocks are hot."""
        collector = TieredCollector()
        stocks = {"000001.SZ", "600519.SH"}

        collector.update_hot_stocks(stocks)
        collector.update_all_stocks(stocks)

        assert collector.get_high_freq_stocks() == stocks
        assert collector.get_low_freq_stocks() == set()

    def test_hot_stocks_not_in_all_stocks(self):
        """Test hot stocks that are not in all stocks list."""
        collector = TieredCollector()
        collector.update_hot_stocks({"000001.SZ"})
        collector.update_all_stocks({"600519.SH"})

        # Hot stock not in all stocks should still be collected
        assert "000001.SZ" in collector.get_high_freq_stocks()

    @pytest.mark.asyncio
    async def test_collection_with_empty_result(self):
        """Test collection with empty result from data source."""
        collector = TieredCollector()
        collector.update_hot_stocks({"000001.SZ"})
        collector.data_source.collect_batch = AsyncMock(return_value={})

        result = await collector.collect_high_freq()

        assert result == {}
        assert collector.stats["high_freq_collections"] == 1

    @pytest.mark.asyncio
    async def test_collection_error_handling(self):
        """Test collection error handling."""
        collector = TieredCollector()
        collector.update_hot_stocks({"000001.SZ"})
        collector.data_source.collect_batch = AsyncMock(side_effect=Exception("Connection error"))

        with pytest.raises(Exception):
            await collector.collect_high_freq()
