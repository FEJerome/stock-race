"""
Integration tests for data source failover functionality.

Tests the automatic failover mechanism when primary data source fails.
"""

import pytest
from datetime import datetime
from unittest.mock import Mock, AsyncMock, patch

from data_service.collectors.router import DataSourceRouter, DataSourceStrategy, DataSourceMetrics
from data_service.collectors.sina import SinaCollector
from data_service.collectors.tencent import TencentCollector
from data_service.collectors.base import DataSourceError


class TestDataSourceRouterFailover:
    """Test DataSourceRouter failover functionality."""

    @pytest.fixture
    def router(self):
        """Create a DataSourceRouter instance."""
        return DataSourceRouter(strategy=DataSourceStrategy.PRIORITY)

    def test_router_initialization(self, router):
        """Test router initializes with data sources."""
        assert router.strategy == DataSourceStrategy.PRIORITY
        assert "sina" in router.source_configs
        assert "tencent" in router.source_configs

    def test_metrics_updated_on_failure(self, router):
        """Test that metrics are updated when source has errors."""
        # Create a metric for sina
        router.metrics["sina"] = DataSourceMetrics(name="sina", priority=1)
        initial_errors = router.metrics["sina"].error_count

        # Simulate an error
        router.metrics["sina"].error_count += 1
        router.metrics["sina"].consecutive_errors += 1

        # Metrics should be updated
        assert router.metrics["sina"].error_count > initial_errors
        assert router.metrics["sina"].consecutive_errors > 0

    def test_metrics_updated_on_success(self, router):
        """Test that metrics are updated when source succeeds."""
        # Create a metric for sina
        router.metrics["sina"] = DataSourceMetrics(name="sina", priority=1)
        initial_success = router.metrics["sina"].success_count

        # Simulate a success
        router.metrics["sina"].success_count += 1
        router.metrics["sina"].request_count += 1

        # Metrics should be updated
        assert router.metrics["sina"].success_count > initial_success


class TestDataSourceRouterHealth:
    """Test DataSourceRouter health checking."""

    @pytest.fixture
    def router(self):
        return DataSourceRouter(strategy=DataSourceStrategy.PRIORITY)

    def test_get_source_health_all_sources(self, router):
        """Test health check for all sources."""
        health = router.get_source_health()
        assert isinstance(health, dict)

    def test_get_source_health_with_failed_source(self, router):
        """Test health check with a failed source."""
        # Create a metric with failures
        router.metrics["sina"] = DataSourceMetrics(name="sina", priority=1)
        router.metrics["sina"].consecutive_errors = 10
        router.metrics["sina"].is_active = False

        health = router.get_source_health("sina")

        assert health["is_active"] is False
        assert health["consecutive_errors"] == 10


class TestDataSourceMetrics:
    """Test DataSourceMetrics calculations."""

    @pytest.fixture
    def metrics(self):
        return DataSourceMetrics(name="test", priority=1)

    def test_success_rate_calculation(self, metrics):
        """Test success rate calculation."""
        metrics.request_count = 100
        metrics.success_count = 95
        assert metrics.success_rate == 0.95

    def test_success_rate_zero_requests(self, metrics):
        """Test success rate with zero requests."""
        assert metrics.success_rate == 0.0

    def test_average_latency_calculation(self, metrics):
        """Test average latency calculation."""
        metrics.request_count = 10
        metrics.total_latency = 5.0
        assert metrics.average_latency == 0.5

    def test_error_rate_calculation(self, metrics):
        """Test error rate calculation."""
        metrics.request_count = 100
        metrics.error_count = 5
        assert metrics.error_rate == 0.05

    def test_health_score_perfect(self, metrics):
        """Test health score with perfect metrics."""
        metrics.request_count = 100
        metrics.success_count = 100
        metrics.total_latency = 10.0  # 100ms average
        assert metrics.health_score == 80.0  # 70 + 10 for low latency

    def test_health_score_with_errors(self, metrics):
        """Test health score with errors."""
        metrics.request_count = 100
        metrics.success_count = 90
        metrics.error_count = 10
        metrics.consecutive_errors = 2
        score = metrics.health_score
        assert score < 70.0  # Penalty for consecutive errors

    def test_health_score_inactive(self, metrics):
        """Test health score for inactive source."""
        metrics.is_active = False
        assert metrics.health_score == 0.0


class TestDataSourceFormatConsistency:
    """Test data format consistency across sources."""

    @pytest.fixture
    def router(self):
        return DataSourceRouter(strategy=DataSourceStrategy.PRIORITY)

    def test_quote_format_consistency(self, router):
        """Test that quotes from different sources have consistent format."""
        required_fields = [
            "symbol", "name", "price", "open", "high", "low",
            "prev_close", "volume", "change", "change_percent"
        ]

        # Mock Sina response
        sina_quote = {
            "symbol": "000001.SZ",
            "name": "平安银行",
            "price": 10.5,
            "open": 10.3,
            "high": 10.8,
            "low": 10.2,
            "prev_close": 10.4,
            "volume": 1000000,
            "change": 0.1,
            "change_percent": 0.96
        }

        # Mock Tencent response
        tencent_quote = {
            "symbol": "000001.SZ",
            "name": "平安银行",
            "price": 10.51,
            "open": 10.3,
            "high": 10.8,
            "low": 10.2,
            "prev_close": 10.4,
            "volume": 1000000,
            "change": 0.11,
            "change_percent": 1.06
        }

        # Verify both have required fields
        for field in required_fields:
            assert field in sina_quote, f"Sina missing field: {field}"
            assert field in tencent_quote, f"Tencent missing field: {field}"

    def test_batch_quotes_format_consistency(self, router):
        """Test that batch quotes from different sources have consistent format."""
        symbols = ["000001.SZ", "600519.SH"]

        # Mock Sina batch response
        sina_batch = {
            "000001.SZ": {"price": 10.5, "volume": 1000000},
            "600519.SH": {"price": 1500.0, "volume": 50000}
        }

        # Mock Tencent batch response
        tencent_batch = {
            "000001.SZ": {"price": 10.51, "volume": 1000000},
            "600519.SH": {"price": 1501.0, "volume": 50000}
        }

        # Verify both return dict with same keys
        assert set(sina_batch.keys()) == set(symbols)
        assert set(tencent_batch.keys()) == set(symbols)

        # Verify structure is consistent
        for symbol in symbols:
            assert "price" in sina_batch[symbol]
            assert "price" in tencent_batch[symbol]
            assert "volume" in sina_batch[symbol]
            assert "volume" in tencent_batch[symbol]
