"""
Tests for DataSourceRouter.
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch

from src.data_service.collectors.router import DataSourceRouter, DataSourceConfig, DataSourceStatus
from src.data_service.collectors.base import DataSourceError, RateLimitError


class TestDataSourceConfig:
    """Tests for DataSourceConfig class."""

    def test_initialization(self):
        """Test DataSourceConfig initialization."""
        collector_class = Mock()
        config = DataSourceConfig(
            name="test_source",
            collector_class=collector_class,
            weight=1.0,
            min_interval_ms=100,
            max_requests_per_minute=600,
            batch_size=100,
            timeout_seconds=30,
            retry_count=3
        )

        assert config.name == "test_source"
        assert config.collector_class == collector_class
        assert config.weight == 1.0
        assert config.min_interval_ms == 100
        assert config.max_requests_per_minute == 600
        assert config.batch_size == 100
        assert config.timeout_seconds == 30
        assert config.retry_count == 3
        assert config.status == DataSourceStatus.HEALTHY
        assert config.request_count == 0
        assert config.error_count == 0
        assert config.success_count == 0
        assert config.response_times == []
        assert config.consecutive_errors == 0
        assert config.consecutive_successes == 0

    def test_success_rate(self):
        """Test success rate calculation."""
        config = DataSourceConfig("test", Mock())

        # No requests yet
        assert config.success_rate == 1.0

        # With successful requests
        config.request_count = 10
        config.success_count = 8
        assert config.success_rate == 0.8

        # With errors
        config.error_count = 2
        assert config.success_rate == 0.8  # Should still be 8/10

    def test_error_rate(self):
        """Test error rate calculation."""
        config = DataSourceConfig("test", Mock())

        # No requests yet
        assert config.error_rate == 0.0

        # With errors
        config.request_count = 10
        config.error_count = 2
        assert config.error_rate == 0.2

    def test_avg_response_time(self):
        """Test average response time calculation."""
        config = DataSourceConfig("test", Mock())

        # No response times
        assert config.avg_response_time == 0.0

        # With response times
        config.response_times = [1.0, 2.0, 3.0]
        assert config.avg_response_time == 2.0

    def test_is_available(self):
        """Test availability check."""
        config = DataSourceConfig("test", Mock())

        # Should be available initially
        assert config.is_available

        # Mark as offline
        config.status = DataSourceStatus.OFFLINE
        assert not config.is_available

        # Reset status and test rate limiting
        config.status = DataSourceStatus.HEALTHY
        config.last_request_time = datetime.now()
        # Mock time to test rate limiting
        with patch('src.data_service.collectors.router.datetime') as mock_datetime:
            mock_now = datetime.now()
            mock_datetime.now.return_value = mock_now
            config.last_request_time = mock_now - timedelta(seconds=0.05)  # 50ms ago
            assert not config.is_available  # Should be rate limited

            config.last_request_time = mock_now - timedelta(seconds=0.2)  # 200ms ago
            assert config.is_available  # Should be available

    def test_health_score(self):
        """Test health score calculation."""
        config = DataSourceConfig("test", Mock())

        # Perfect score initially
        assert config.health_score == 0.0  # No activity yet

        # Add some successful requests
        config.success_count = 10
        config.request_count = 10
        config.consecutive_successes = 10
        config.last_success = datetime.now()
        config.response_times = [0.5, 0.6, 0.7]

        score = config.health_score
        assert 0.0 <= score <= 1.0

        # With errors
        config.error_count = 5
        config.request_count = 15
        config.consecutive_errors = 3
        config.consecutive_successes = 0

        score = config.health_score
        assert score < 0.5  # Should be lower with errors

    def test_update_request_stats(self):
        """Test request statistics update."""
        config = DataSourceConfig("test", Mock())

        # Update with success
        config.update_request_stats(success=True, response_time=1.0)

        assert config.request_count == 1
        assert config.success_count == 1
        assert config.error_count == 0
        assert config.consecutive_successes == 1
        assert config.consecutive_errors == 0
        assert config.response_times == [1.0]
        assert config.last_success is not None

        # Update with error
        config.update_request_stats(success=False, response_time=2.0)

        assert config.request_count == 2
        assert config.success_count == 1
        assert config.error_count == 1
        assert config.consecutive_successes == 0
        assert config.consecutive_errors == 1
        assert config.response_times == [1.0]  # Should not add response time for errors


class TestDataSourceRouter:
    """Tests for DataSourceRouter class."""

    @pytest.fixture
    def router(self):
        """Create a DataSourceRouter instance."""
        return DataSourceRouter()

    @pytest.fixture
    def mock_collectors(self):
        """Create mock collector classes."""
        sina_mock = Mock()
        tencent_mock = Mock()
        eastmoney_mock = Mock()

        return {
            "sina": sina_mock,
            "tencent": tencent_mock,
            "eastmoney": eastmoney_mock
        }

    @pytest.mark.asyncio
    async def test_initialization(self, router, mock_collectors):
        """Test router initialization."""
        with patch('src.data_service.collectors.router.SinaCollector', mock_collectors["sina"]), \
             patch('src.data_service.collectors.router.TencentCollector', mock_collectors["tencent"]), \
             patch('src.data_service.collectors.router.EastMoneyCollector', mock_collectors["eastmoney"]):

            # Mock collector instances
            sina_instance = AsyncMock()
            tencent_instance = AsyncMock()
            eastmoney_instance = AsyncMock()

            mock_collectors["sina"].return_value = sina_instance
            mock_collectors["tencent"].return_value = tencent_instance
            mock_collectors["eastmoney"].return_value = eastmoney_instance

            await router.initialize()

            assert router.initialized
            assert len(router.data_sources) == 3
            assert "sina" in router.data_sources
            assert "tencent" in router.data_sources
            assert "eastmoney" in router.data_sources

            # Verify collectors were initialized
            sina_instance.__aenter__.assert_called_once()
            tencent_instance.__aenter__.assert_called_once()
            eastmoney_instance.__aenter__.assert_called_once()

    @pytest.mark.asyncio
    async def test_close(self, router):
        """Test router close."""
        # Mock data sources
        config1 = Mock()
        config1.instance = AsyncMock()
        config1.name = "source1"

        config2 = Mock()
        config2.instance = AsyncMock()
        config2.name = "source2"

        router.data_sources = {
            "source1": config1,
            "source2": config2
        }
        router.initialized = True

        await router.close()

        config1.instance.close.assert_called_once()
        config2.instance.close.assert_called_once()
        assert not router.initialized

    def test_select_data_source(self, router):
        """Test data source selection."""
        # Create mock configurations
        config1 = Mock()
        config1.name = "source1"
        config1.weight = 1.0
        config1.health_score = 0.9
        config1.is_available = True

        config2 = Mock()
        config2.name = "source2"
        config2.weight = 0.8
        config2.health_score = 0.7
        config2.is_available = True

        config3 = Mock()
        config3.name = "source3"
        config3.weight = 0.6
        config3.health_score = 0.5
        config3.is_available = False  # Unavailable

        router.data_sources = {
            "source1": config1,
            "source2": config2,
            "source3": config3
        }
        router.initialized = True

        # Test selection (should only consider available sources)
        selected = router.select_data_source()
        assert selected is not None
        assert selected.name in ["source1", "source2"]

        # Test with no available sources
        config1.is_available = False
        config2.is_available = False

        selected = router.select_data_source()
        assert selected is None

    @pytest.mark.asyncio
    async def test_get_stock_quote_success(self, router):
        """Test successful stock quote retrieval."""
        # Mock data source
        config = Mock()
        config.name = "test_source"
        config.is_available = True
        config.instance = AsyncMock()
        config.instance.get_stock_quote.return_value = {
            "symbol": "000001.SZ",
            "price": 16.85,
            "timestamp": datetime.now()
        }

        router.data_sources = {"test_source": config}
        router.initialized = True

        # Mock select_data_source to return our config
        router.select_data_source = Mock(return_value=config)

        quote = await router.get_stock_quote("000001.SZ")

        assert quote is not None
        assert quote["symbol"] == "000001.SZ"
        assert quote["price"] == 16.85
        config.instance.get_stock_quote.assert_called_once_with("000001.SZ")
        config.update_request_stats.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_stock_quote_failure(self, router):
        """Test stock quote retrieval with failures."""
        # Mock data source that fails
        config = Mock()
        config.name = "test_source"
        config.is_available = True
        config.instance = AsyncMock()
        config.instance.get_stock_quote.side_effect = DataSourceError("Test error")

        router.data_sources = {"test_source": config}
        router.initialized = True

        # Mock select_data_source to return our config
        router.select_data_source = Mock(return_value=config)

        quote = await router.get_stock_quote("000001.SZ", max_retries=2)

        assert quote is None
        assert config.instance.get_stock_quote.call_count == 2  # Should retry twice
        config.update_request_stats.assert_called()

    @pytest.mark.asyncio
    async def test_get_batch_quotes(self, router):
        """Test batch quotes retrieval."""
        # Mock data source
        config = Mock()
        config.name = "test_source"
        config.is_available = True
        config.batch_size = 100
        config.instance = AsyncMock()
        config.instance.get_batch_quotes.return_value = {
            "000001.SZ": {"symbol": "000001.SZ", "price": 16.85},
            "600036.SH": {"symbol": "600036.SH", "price": 42.50}
        }

        router.data_sources = {"test_source": config}
        router.initialized = True

        # Mock select_data_source to return our config
        router.select_data_source = Mock(return_value=config)

        symbols = ["000001.SZ", "600036.SH", "000858.SZ"]
        quotes = await router.get_batch_quotes(symbols)

        assert len(quotes) == 2
        assert "000001.SZ" in quotes
        assert "600036.SH" in quotes
        assert "000858.SZ" not in quotes  # Not in mock response
        config.instance.get_batch_quotes.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_stock_history(self, router):
        """Test historical data retrieval."""
        # Mock data source
        config = Mock()
        config.name = "test_source"
        config.is_available = True
        config.instance = AsyncMock()

        mock_history = [
            {"symbol": "000001.SZ", "timestamp": datetime.now(), "close": 16.85},
            {"symbol": "000001.SZ", "timestamp": datetime.now() - timedelta(days=1), "close": 16.80}
        ]
        config.instance.get_stock_history.return_value = mock_history

        router.data_sources = {"test_source": config}
        router.initialized = True

        # Mock select_data_source to return our config
        router.select_data_source = Mock(return_value=config)

        start_date = datetime.now() - timedelta(days=30)
        end_date = datetime.now()

        history = await router.get_stock_history("000001.SZ", start_date, end_date, "1d")

        assert len(history) == 2
        config.instance.get_stock_history.assert_called_once_with(
            "000001.SZ", start_date, end_date, "1d"
        )

    def test_get_router_stats(self, router):
        """Test router statistics retrieval."""
        # Add some mock data sources
        config1 = Mock()
        config1.name = "source1"
        config1.status = DataSourceStatus.HEALTHY
        config1.weight = 1.0
        config1.health_score = 0.9
        config1.success_rate = 0.95
        config1.error_rate = 0.05
        config1.avg_response_time = 0.5
        config1.request_count = 100
        config1.error_count = 5
        config1.consecutive_errors = 0
        config1.consecutive_successes = 10
        config1.last_request_time = datetime.now()
        config1.last_success = datetime.now()
        config1.is_available = True

        router.data_sources = {"source1": config1}
        router.initialized = True

        # Set some router stats
        router.total_requests = 50
        router.successful_requests = 45
        router.failed_requests = 5
        router.total_response_time = 25.0
        router.last_route_time = datetime.now()

        stats = router.get_router_stats()

        assert stats["total_requests"] == 50
        assert stats["successful_requests"] == 45
        assert stats["failed_requests"] == 5
        assert stats["success_rate"] == 0.9  # 45/50
        assert stats["avg_response_time"] == 0.5  # 25/50
        assert "source1" in stats["data_sources"]
        assert stats["initialized"] is True

    def test_get_health_status(self, router):
        """Test health status retrieval."""
        # Add mock data sources
        config1 = Mock()
        config1.status = DataSourceStatus.HEALTHY

        config2 = Mock()
        config2.status = DataSourceStatus.DEGRADED

        router.data_sources = {
            "source1": config1,
            "source2": config2
        }

        # Mock get_router_stats
        router.get_router_stats = Mock(return_value={
            "success_rate": 0.95
        })

        health = router.get_health_status()

        assert health["status"] == "healthy"  # At least one healthy source
        assert health["healthy_sources"] == 2  # Both are considered healthy/degraded
        assert health["total_sources"] == 2
        assert health["success_rate"] == 0.95

    def test_clear_cache(self, router):
        """Test cache clearing."""
        router.batch_cache = {
            "key1": {"data": "test1", "timestamp": datetime.now()},
            "key2": {"data": "test2", "timestamp": datetime.now()}
        }

        router.clear_cache()

        assert len(router.batch_cache) == 0

    def test_reset_stats(self, router):
        """Test statistics reset."""
        # Set some stats
        router.total_requests = 100
        router.successful_requests = 90
        router.failed_requests = 10
        router.total_response_time = 50.0
        router.last_route_time = datetime.now()

        # Add a mock data source with stats
        config = Mock()
        config.request_count = 50
        config.error_count = 5
        config.success_count = 45
        config.response_times = [0.5, 0.6, 0.7]
        config.consecutive_errors = 2
        config.consecutive_successes = 5
        config.last_error = "Test error"

        router.data_sources = {"test_source": config}

        router.reset_stats()

        assert router.total_requests == 0
        assert router.successful_requests == 0
        assert router.failed_requests == 0
        assert router.total_response_time == 0.0
        assert router.last_route_time is None

        # Verify data source stats were reset
        assert config.request_count == 0
        assert config.error_count == 0
        assert config.success_count == 0
        assert config.response_times == []
        assert config.consecutive_errors == 0
        assert config.consecutive_successes == 0
        assert config.last_error is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])