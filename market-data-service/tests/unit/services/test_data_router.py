"""
Unit tests for DataSourceRouter.

Tests the routing logic, health checks, and failover mechanisms.
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock

from data_service.collectors.router import (
    DataSourceRouter,
    DataSourceStrategy,
    DataSourceMetrics
)
from data_service.collectors.base import DataSource, DataSourceError
from data_service.collectors.sina import SinaCollector
from data_service.collectors.tencent import TencentCollector


class MockDataSource:
    """Mock data source for testing."""

    def __init__(self, name, priority=1):
        self.name = name
        self.priority = priority
        self.request_count = 0
        self.error_count = 0

    async def get_stock_quote(self, symbol):
        return {"symbol": symbol, "price": 10.0, "source": self.name}

    async def get_batch_quotes(self, symbols):
        return {s: {"price": 10.0, "source": self.name} for s in symbols}


class TestDataSourceRouterInitialization:
    """Test DataSourceRouter initialization."""

    def test_default_initialization(self):
        """Test router initializes with default strategy."""
        router = DataSourceRouter()
        assert router.strategy == DataSourceStrategy.ADAPTIVE
        assert len(router.source_configs) > 0
        assert "sina" in router.source_configs
        assert "tencent" in router.source_configs

    def test_priority_strategy_initialization(self):
        """Test router initializes with priority strategy."""
        router = DataSourceRouter(strategy=DataSourceStrategy.PRIORITY)
        assert router.strategy == DataSourceStrategy.PRIORITY

    def test_round_robin_strategy_initialization(self):
        """Test router initializes with round robin strategy."""
        router = DataSourceRouter(strategy=DataSourceStrategy.ROUND_ROBIN)
        assert router.strategy == DataSourceStrategy.ROUND_ROBIN

    def test_load_balanced_strategy_initialization(self):
        """Test router initializes with load balanced strategy."""
        router = DataSourceRouter(strategy=DataSourceStrategy.LOAD_BALANCED)
        assert router.strategy == DataSourceStrategy.LOAD_BALANCED

    def test_adaptive_strategy_initialization(self):
        """Test router initializes with adaptive strategy."""
        router = DataSourceRouter(strategy=DataSourceStrategy.ADAPTIVE)
        assert router.strategy == DataSourceStrategy.ADAPTIVE


class TestDataSourceRouterSourceSelection:
    """Test data source selection strategies."""

    @pytest.fixture
    def router_with_mock_sources(self):
        """Create router with mock sources."""
        router = DataSourceRouter(strategy=DataSourceStrategy.PRIORITY)

        # Create mock sources
        sina = MockDataSource("sina", priority=1)
        tencent = MockDataSource("tencent", priority=2)
        eastmoney = MockDataSource("eastmoney", priority=3)

        router.data_sources = [sina, tencent, eastmoney]

        # Initialize metrics
        for source in router.data_sources:
            router.metrics[source.name] = DataSourceMetrics(
                name=source.name,
                priority=source.priority
            )
            router.metrics[source.name].is_active = True

        return router

    def test_priority_strategy_selects_lowest_priority(self, router_with_mock_sources):
        """Test priority strategy selects source with lowest priority number."""
        router = router_with_mock_sources
        router.strategy = DataSourceStrategy.PRIORITY

        source = router._select_source_by_strategy()
        assert source.name == "sina"  # priority=1

    def test_priority_strategy_skips_inactive_sources(self, router_with_mock_sources):
        """Test priority strategy skips inactive sources."""
        router = router_with_mock_sources
        router.strategy = DataSourceStrategy.PRIORITY

        # Deactivate sina
        router.metrics["sina"].is_active = False

        source = router._select_source_by_strategy()
        assert source.name == "tencent"  # Next lowest priority

    def test_priority_strategy_raises_when_all_inactive(self, router_with_mock_sources):
        """Test priority strategy raises error when all sources inactive."""
        router = router_with_mock_sources
        router.strategy = DataSourceStrategy.PRIORITY

        # Deactivate all sources
        for metrics in router.metrics.values():
            metrics.is_active = False

        with pytest.raises(DataSourceError) as exc_info:
            router._select_source_by_strategy()
        assert "No active data sources" in str(exc_info.value)

    def test_round_robin_strategy_rotates_sources(self, router_with_mock_sources):
        """Test round robin strategy rotates between sources."""
        router = router_with_mock_sources
        router.strategy = DataSourceStrategy.ROUND_ROBIN

        # First call
        source1 = router._select_source_by_strategy()
        # Second call
        source2 = router._select_source_by_strategy()
        # Third call
        source3 = router._select_source_by_strategy()

        assert source1.name != source2.name or source2.name != source3.name

    def test_load_balanced_strategy_selects_least_used(self, router_with_mock_sources):
        """Test load balanced strategy selects source with lowest request count."""
        router = router_with_mock_sources
        router.strategy = DataSourceStrategy.LOAD_BALANCED

        # Set different request counts
        router.metrics["sina"].request_count = 10
        router.metrics["tencent"].request_count = 5
        router.metrics["eastmoney"].request_count = 15

        source = router._select_source_by_strategy()
        assert source.name == "tencent"  # Lowest request count

    def test_adaptive_strategy_returns_source(self, router_with_mock_sources):
        """Test adaptive strategy returns an active source."""
        router = router_with_mock_sources
        router.strategy = DataSourceStrategy.ADAPTIVE

        # Test that it returns one of the active sources
        source = router._select_source_by_strategy()
        assert source.name in ["sina", "tencent", "eastmoney"]
        assert router.metrics[source.name].is_active


class TestDataSourceMetrics:
    """Test DataSourceMetrics functionality."""

    @pytest.fixture
    def metrics(self):
        return DataSourceMetrics(name="test", priority=1)

    def test_initial_metrics_state(self, metrics):
        """Test initial state of metrics."""
        assert metrics.name == "test"
        assert metrics.priority == 1
        assert metrics.request_count == 0
        assert metrics.success_count == 0
        assert metrics.error_count == 0
        assert metrics.is_active is True

    def test_success_rate_calculation(self, metrics):
        """Test success rate calculation."""
        metrics.request_count = 100
        metrics.success_count = 95
        assert metrics.success_rate == 0.95

    def test_success_rate_with_no_requests(self, metrics):
        """Test success rate when no requests made."""
        assert metrics.success_rate == 0.0

    def test_error_rate_calculation(self, metrics):
        """Test error rate calculation."""
        metrics.request_count = 100
        metrics.error_count = 5
        assert metrics.error_rate == 0.05

    def test_average_latency_calculation(self, metrics):
        """Test average latency calculation."""
        metrics.request_count = 10
        metrics.total_latency = 5.0  # 5 seconds total
        assert metrics.average_latency == 0.5  # 500ms average

    def test_health_score_perfect_metrics(self, metrics):
        """Test health score with perfect metrics."""
        metrics.request_count = 100
        metrics.success_count = 100
        metrics.total_latency = 10.0  # 100ms average
        assert metrics.health_score == 80.0  # 70 base + 10 for low latency

    def test_health_score_with_errors(self, metrics):
        """Test health score with errors."""
        metrics.request_count = 100
        metrics.success_count = 90
        metrics.error_count = 10
        metrics.consecutive_errors = 5
        score = metrics.health_score
        assert score < 70.0  # Penalty for consecutive errors

    def test_health_score_inactive_source(self, metrics):
        """Test health score for inactive source."""
        metrics.is_active = False
        assert metrics.health_score == 0.0

    def test_health_score_with_high_latency(self, metrics):
        """Test health score penalizes high latency."""
        metrics.request_count = 10
        metrics.success_count = 10
        metrics.total_latency = 50.0  # 5 seconds average - very high
        score = metrics.health_score
        assert score < 70.0  # Penalty for high latency


class TestDataSourceRouterHealthStatus:
    """Test health status reporting."""

    @pytest.fixture
    def router_with_metrics(self):
        """Create router with sample metrics."""
        router = DataSourceRouter()

        # Create metrics for different sources
        router.metrics["sina"] = DataSourceMetrics(name="sina", priority=1)
        router.metrics["sina"].request_count = 100
        router.metrics["sina"].success_count = 99
        router.metrics["sina"].total_latency = 15.0  # 150ms average

        router.metrics["tencent"] = DataSourceMetrics(name="tencent", priority=2)
        router.metrics["tencent"].request_count = 100
        router.metrics["tencent"].success_count = 98
        router.metrics["tencent"].total_latency = 20.0  # 200ms average

        router.metrics["eastmoney"] = DataSourceMetrics(name="eastmoney", priority=3)
        router.metrics["eastmoney"].request_count = 100
        router.metrics["eastmoney"].success_count = 50
        router.metrics["eastmoney"].consecutive_errors = 15
        router.metrics["eastmoney"].is_active = False

        return router

    def test_get_source_health_all_sources(self, router_with_metrics):
        """Test getting health status for all sources."""
        router = router_with_metrics
        health = router.get_source_health()

        assert "sina" in health
        assert "tencent" in health
        assert "eastmoney" in health

        # Check sina health
        assert health["sina"]["is_active"] is True
        assert health["sina"]["success_rate"] == 0.99
        assert health["sina"]["health_score"] > 0

        # Check eastmoney health
        assert health["eastmoney"]["is_active"] is False

    def test_get_source_health_specific_source(self, router_with_metrics):
        """Test getting health status for specific source."""
        router = router_with_metrics
        health = router.get_source_health("sina")

        assert health["name"] == "sina"
        assert health["is_active"] is True
        assert health["success_rate"] == 0.99
        assert health["average_latency"] == 0.15  # 150ms
        assert health["request_count"] == 100

    def test_get_source_health_unknown_source(self, router_with_metrics):
        """Test getting health status for unknown source."""
        router = router_with_metrics
        health = router.get_source_health("unknown")

        assert "error" in health
        assert "Unknown data source" in health["error"]


class TestDataSourceRouterMetricsUpdate:
    """Test metrics update functionality."""

    @pytest.fixture
    def router(self):
        return DataSourceRouter()

    @pytest.mark.asyncio
    async def test_update_metrics_success(self, router):
        """Test updating metrics on successful request."""
        router.metrics["sina"] = DataSourceMetrics(name="sina", priority=1)
        router.metrics["sina"].is_active = True

        initial_success = router.metrics["sina"].success_count

        await router._update_metrics("sina", success=True, latency=0.1)

        assert router.metrics["sina"].request_count == 1
        assert router.metrics["sina"].success_count == initial_success + 1
        assert router.metrics["sina"].consecutive_errors == 0
        assert router.metrics["sina"].total_latency == 0.1

    @pytest.mark.asyncio
    async def test_update_metrics_failure(self, router):
        """Test updating metrics on failed request."""
        router.metrics["sina"] = DataSourceMetrics(name="sina", priority=1)
        router.metrics["sina"].is_active = True

        initial_errors = router.metrics["sina"].error_count

        await router._update_metrics("sina", success=False, latency=0.5)

        assert router.metrics["sina"].request_count == 1
        assert router.metrics["sina"].error_count == initial_errors + 1
        assert router.metrics["sina"].consecutive_errors == 1

    @pytest.mark.asyncio
    async def test_update_metrics_deactivates_on_many_errors(self, router):
        """Test source is deactivated after many consecutive errors."""
        router.metrics["sina"] = DataSourceMetrics(name="sina", priority=1)
        router.metrics["sina"].is_active = True
        router.metrics["sina"].consecutive_errors = 9

        # One more error should deactivate
        await router._update_metrics("sina", success=False, latency=0.1)

        assert router.metrics["sina"].is_active is False
        assert router.metrics["sina"].consecutive_errors == 10

    @pytest.mark.asyncio
    async def test_update_metrics_reactivates_after_timeout(self, router):
        """Test source is reactivated after error timeout."""
        router.metrics["sina"] = DataSourceMetrics(name="sina", priority=1)
        router.metrics["sina"].is_active = False
        router.metrics["sina"].consecutive_errors = 10
        router.metrics["sina"].last_error_time = datetime.now() - timedelta(minutes=6)

        await router._update_metrics("sina", success=True, latency=0.1)

        assert router.metrics["sina"].is_active is True
        assert router.metrics["sina"].consecutive_errors == 0

    @pytest.mark.asyncio
    async def test_update_metrics_rate_limit_tracking(self, router):
        """Test rate limit hit tracking."""
        router.metrics["sina"] = DataSourceMetrics(name="sina", priority=1)
        router.metrics["sina"].is_active = True

        await router._update_metrics("sina", success=False, latency=0.1, is_rate_limit=True)

        assert router.metrics["sina"].rate_limit_hits == 1


class TestDataSourceRouterDynamicWeights:
    """Test dynamic weight calculations."""

    @pytest.fixture
    def router_with_sources(self):
        """Create router with active sources."""
        router = DataSourceRouter(strategy=DataSourceStrategy.ADAPTIVE)

        # Create mock data sources
        for name in ["sina", "tencent", "eastmoney"]:
            mock_source = Mock()
            mock_source.name = name
            mock_source.priority = 1
            router.data_sources.append(mock_source)

            router.metrics[name] = DataSourceMetrics(name=name, priority=1)
            router.metrics[name].is_active = True

        return router

    def test_update_dynamic_weights_calculates_correctly(self, router_with_sources):
        """Test dynamic weight calculation based on metrics."""
        router = router_with_sources

        # Set up different performance profiles with enough requests
        router.metrics["sina"].request_count = 100
        router.metrics["sina"].success_count = 99
        router.metrics["sina"].total_latency = 15.0  # 150ms average
        base_sina = router.source_configs["sina"]["base_weight"]

        router.metrics["tencent"].request_count = 100
        router.metrics["tencent"].success_count = 95
        router.metrics["tencent"].total_latency = 25.0  # 250ms average

        # Force weight update by setting last_weight_update to past
        router.last_weight_update = datetime.now() - timedelta(minutes=5)
        router._update_dynamic_weights()

        # Sina should have higher weight due to better performance
        sina_weight = router.source_configs["sina"]["current_weight"]

        # Weights should be adjusted from base values (sina has better metrics)
        assert sina_weight >= base_sina

    def test_weighted_sources_returns_all_sources(self, router_with_sources):
        """Test weighted sources returns all data sources."""
        router = router_with_sources

        weighted = router._get_weighted_sources()
        source_names = [source.name for source, _ in weighted]

        assert "sina" in source_names
        assert "tencent" in source_names
        assert "eastmoney" in source_names


class TestDataSourceRouterFailover:
    """Test failover mechanisms."""

    @pytest.fixture
    def router_for_failover(self):
        """Create router setup for failover testing."""
        router = DataSourceRouter(strategy=DataSourceStrategy.PRIORITY)

        # Create mock sources with AsyncMock
        sina = Mock()
        sina.name = "sina"
        sina.priority = 1
        sina.get_stock_quote = AsyncMock(side_effect=DataSourceError("Sina failed"))

        tencent = Mock()
        tencent.name = "tencent"
        tencent.priority = 2
        tencent.get_stock_quote = AsyncMock(return_value={
            "symbol": "000001.SZ",
            "price": 10.5,
            "name": "平安银行"
        })

        router.data_sources = [sina, tencent]

        # Initialize metrics
        for source in router.data_sources:
            router.metrics[source.name] = DataSourceMetrics(
                name=source.name,
                priority=source.priority
            )
            router.metrics[source.name].is_active = True

        return router, sina, tencent

    @pytest.mark.asyncio
    async def test_get_stock_quote_failover_after_deactivation(self, router_for_failover):
        """Test failover to secondary source after primary is deactivated."""
        router, sina_mock, tencent_mock = router_for_failover

        # Pre-set sina to be deactivated (simulating consecutive failures)
        router.metrics["sina"].is_active = False

        # Should select tencent since sina is inactive
        result = await router.get_stock_quote("000001.SZ")

        assert result["symbol"] == "000001.SZ"
        assert result["price"] == 10.5
        sina_mock.get_stock_quote.assert_not_called()
        tencent_mock.get_stock_quote.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_stock_quote_all_sources_fail(self, router_for_failover):
        """Test error when all sources fail."""
        router, sina_mock, tencent_mock = router_for_failover

        # Make tencent also fail
        tencent_mock.get_stock_quote = AsyncMock(side_effect=DataSourceError("Tencent failed"))

        with pytest.raises(DataSourceError) as exc_info:
            await router.get_stock_quote("000001.SZ")

        # Error message indicates all retries failed
        assert "Failed to get quote" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_stock_quote_success_no_failover(self, router_for_failover):
        """Test no failover when primary succeeds."""
        router, sina_mock, tencent_mock = router_for_failover

        # Make sina succeed
        sina_mock.get_stock_quote = AsyncMock(return_value={
            "symbol": "000001.SZ",
            "price": 10.4,
            "name": "平安银行"
        })

        result = await router.get_stock_quote("000001.SZ")

        assert result["price"] == 10.4
        sina_mock.get_stock_quote.assert_called_once()
        tencent_mock.get_stock_quote.assert_not_called()


class TestDataSourceRouterSourceConfigs:
    """Test source configuration management."""

    def test_default_source_configs_exist(self):
        """Test default configurations exist for all sources."""
        router = DataSourceRouter()

        required_sources = ["sina", "tencent", "eastmoney", "akshare", "baostock", "tushare"]

        for source in required_sources:
            assert source in router.source_configs
            config = router.source_configs[source]
            assert "min_interval" in config
            assert "max_requests_per_minute" in config
            assert "batch_size" in config
            assert "base_weight" in config
            assert "current_weight" in config
            assert "enabled" in config

    def test_source_configs_reasonable_values(self):
        """Test source configurations have reasonable values."""
        router = DataSourceRouter()

        for name, config in router.source_configs.items():
            assert config["min_interval"] > 0
            assert config["max_requests_per_minute"] > 0
            assert config["batch_size"] > 0
            assert config["base_weight"] > 0
            assert config["current_weight"] > 0


class TestDataSourceRouterPerformanceMetrics:
    """Test performance metrics tracking."""

    @pytest.fixture
    def router_with_performance_data(self):
        """Create router with performance data."""
        router = DataSourceRouter()

        # Set up metrics with various performance characteristics
        router.metrics["sina"] = DataSourceMetrics(name="sina", priority=1)
        router.metrics["sina"].request_count = 1000
        router.metrics["sina"].success_count = 995
        router.metrics["sina"].error_count = 5
        router.metrics["sina"].total_latency = 150.0  # 150ms average
        router.metrics["sina"].rate_limit_hits = 2

        router.metrics["tencent"] = DataSourceMetrics(name="tencent", priority=2)
        router.metrics["tencent"].request_count = 800
        router.metrics["tencent"].success_count = 760
        router.metrics["tencent"].error_count = 40
        router.metrics["tencent"].total_latency = 200.0  # 250ms average
        router.metrics["tencent"].rate_limit_hits = 10

        return router

    def test_get_performance_metrics(self, router_with_performance_data):
        """Test getting overall performance metrics."""
        router = router_with_performance_data
        perf = router.get_performance_metrics()

        assert "total_requests" in perf
        assert "total_success" in perf
        assert "total_errors" in perf
        assert "overall_success_rate" in perf
        assert "active_sources" in perf
        assert "total_sources" in perf
        assert "current_strategy" in perf

        # Verify calculations
        assert perf["total_requests"] == 1800  # 1000 + 800
        assert perf["total_success"] == 1755  # 995 + 760
        assert perf["total_errors"] == 45  # 5 + 40
        assert abs(perf["overall_success_rate"] - 0.975) < 0.01  # 1755/1800

    def test_get_performance_metrics_active_sources(self, router_with_performance_data):
        """Test active sources in performance metrics."""
        router = router_with_performance_data
        perf = router.get_performance_metrics()

        assert "active_sources" in perf
        # Both sources should be active by default
        assert len(perf["active_sources"]) == 2


class TestDataSourceRouterSegmentation:
    """Test stock segmentation strategies."""

    @pytest.fixture
    def router_with_sources(self):
        """Create router with mock data sources."""
        router = DataSourceRouter()
        # Add mock data sources to avoid division by zero
        for name in ["sina", "tencent", "eastmoney"]:
            mock_source = Mock()
            mock_source.name = name
            router.data_sources.append(mock_source)
        return router

    def test_segment_by_exchange(self, router_with_sources):
        """Test segmentation by exchange."""
        router = router_with_sources
        symbols = ["000001.SZ", "000002.SZ", "600519.SH", "600036.SH", "300001.SZ"]
        segments = router._segment_by_exchange(symbols)

        # Returns list of lists, not dict
        assert isinstance(segments, list)
        assert len(segments) == 2  # SH and SZ

        # Check all symbols are in segments
        all_symbols = []
        for segment in segments:
            all_symbols.extend(segment)
        assert set(all_symbols) == set(symbols)

    def test_segment_by_first_letter(self, router_with_sources):
        """Test segmentation by first letter."""
        router = router_with_sources
        symbols = ["000001.SZ", "000002.SZ", "600519.SH", "300001.SZ"]
        segments = router._segment_by_first_letter(symbols)

        # Returns list of lists
        assert isinstance(segments, list)
        assert len(segments) == 3  # 000, 600, 300

        # Check all symbols are in segments
        all_symbols = []
        for segment in segments:
            all_symbols.extend(segment)
        assert set(all_symbols) == set(symbols)

    def test_segment_round_robin(self, router_with_sources):
        """Test round robin segmentation."""
        router = router_with_sources
        symbols = ["000001.SZ", "000002.SZ", "600519.SH", "600036.SH"]
        segments = router._segment_round_robin(symbols)

        # Returns list of lists
        assert isinstance(segments, list)
        # Each segment should have roughly equal number of symbols
        total_symbols = sum(len(s) for s in segments)
        assert total_symbols == len(symbols)

    def test_segment_by_market_cap(self, router_with_sources):
        """Test segmentation by market cap."""
        router = router_with_sources
        symbols = ["000001.SZ", "000002.SZ", "600519.SH"]
        # This would require market cap data, so just test it doesn't crash
        segments = router._segment_by_market_cap(symbols)
        # Returns list of lists
        assert isinstance(segments, list)
        # Check all symbols are in segments
        all_symbols = []
        for segment in segments:
            all_symbols.extend(segment)
        assert set(all_symbols) == set(symbols)
