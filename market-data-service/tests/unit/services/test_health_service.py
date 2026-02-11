"""
Tests for Market Data Service Health Service (C1-MD-001, C1-MD-002, C1-MD-003).
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime
import asyncio
import sys
from pathlib import Path

# Add health-check SDK to path
project_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "health-check" / "src"))

from health_check import HealthStatus


class TestMarketDataHealthService:
    """Test MarketDataHealthService functionality."""

    @pytest.fixture
    def health_service(self):
        from data_service.services.health_service import MarketDataHealthService
        return MarketDataHealthService()

    @pytest.fixture
    def mock_redis_cache(self):
        mock = Mock()
        mock.ping = AsyncMock(return_value=True)
        return mock

    @pytest.fixture
    def mock_data_service(self):
        mock = Mock()
        mock.data_router = Mock()
        mock.data_router.get_router_stats = Mock(return_value={
            "total_sources": 6,
            "healthy_sources": 5,
            "success_rate": 0.95
        })
        return mock

    @pytest.mark.asyncio
    async def test_initialization(self, health_service, mock_redis_cache, mock_data_service):
        """Test health service initialization (C1-MD-001)."""
        await health_service.initialize(
            redis_cache=mock_redis_cache,
            data_service=mock_data_service
        )

        assert health_service._redis_cache is mock_redis_cache
        assert health_service._data_service is mock_data_service
        assert len(health_service.checker._dependencies) == 2

    @pytest.mark.asyncio
    async def test_check_redis_healthy(self, health_service, mock_redis_cache):
        """Test Redis health check - healthy."""
        health_service._redis_cache = mock_redis_cache

        result = await health_service._check_redis()

        assert result is True
        mock_redis_cache.ping.assert_called_once()

    @pytest.mark.asyncio
    async def test_check_redis_unhealthy(self, health_service):
        """Test Redis health check - unhealthy."""
        mock_redis = Mock()
        mock_redis.ping = AsyncMock(side_effect=Exception("Connection refused"))
        health_service._redis_cache = mock_redis

        result = await health_service._check_redis()

        assert result is False

    @pytest.mark.asyncio
    async def test_check_data_sources_healthy(self, health_service, mock_data_service):
        """Test data sources health check - healthy."""
        health_service._data_service = mock_data_service

        result = await health_service._check_data_sources()

        assert result is True

    @pytest.mark.asyncio
    async def test_check_data_sources_unhealthy(self, health_service):
        """Test data sources health check - unhealthy."""
        mock_service = Mock()
        mock_service.data_router = Mock()
        mock_service.data_router.get_router_stats = Mock(return_value={
            "total_sources": 6,
            "healthy_sources": 0
        })
        health_service._data_service = mock_service

        result = await health_service._check_data_sources()

        assert result is False

    @pytest.mark.asyncio
    async def test_enter_degraded_mode(self, health_service):
        """Test entering degraded mode (C1-MD-002)."""
        callback = AsyncMock()
        health_service.on_degradation(callback)

        await health_service._enter_degraded_mode("Redis unavailable")

        assert health_service.is_degraded() is True
        assert health_service._degraded_reason == "Redis unavailable"
        assert health_service._degraded_since is not None
        callback.assert_called_once_with("Redis unavailable", False)

    @pytest.mark.asyncio
    async def test_recover_from_degraded_mode(self, health_service):
        """Test recovering from degraded mode (C1-MD-003)."""
        # First enter degraded mode
        await health_service._enter_degraded_mode("Test reason")

        recovery_callback = AsyncMock()
        health_service.on_recovery(recovery_callback)

        # Then recover
        await health_service._recover_from_degraded_mode()

        assert health_service.is_degraded() is False
        assert health_service._degraded_reason is None
        recovery_callback.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_status(self, health_service, mock_redis_cache, mock_data_service):
        """Test getting health status."""
        await health_service.initialize(
            redis_cache=mock_redis_cache,
            data_service=mock_data_service
        )

        status = health_service.get_status()

        assert "service" in status
        assert status["service"] == "market-data-service"
        assert "degraded" in status
        assert "is_degraded" in status["degraded"]

    @pytest.mark.asyncio
    async def test_is_healthy(self, health_service, mock_redis_cache, mock_data_service):
        """Test is_healthy method."""
        await health_service.initialize(
            redis_cache=mock_redis_cache,
            data_service=mock_data_service
        )

        # Should be healthy after initialization
        assert health_service.is_healthy() is True


class TestDegradedModeStrategies:
    """Test degraded mode strategies (C1-MD-002)."""

    @pytest.fixture
    def mock_health_service(self):
        mock = Mock()
        mock.is_degraded = Mock(return_value=False)
        mock.checker = Mock()
        mock.checker.get_health = Mock(return_value=None)
        return mock

    def test_should_collect_data_normal(self, mock_health_service):
        """Test should_collect_data in normal mode."""
        from data_service.services.health_service import DegradedModeStrategies

        result = DegradedModeStrategies.should_collect_data(mock_health_service)

        assert result is True

    def test_should_collect_data_degraded(self, mock_health_service):
        """Test should_collect_data in degraded mode."""
        from data_service.services.health_service import DegradedModeStrategies

        mock_health_service.is_degraded.return_value = True
        mock_health_service.checker.get_health.return_value = Mock(
            dependencies={
                "data_sources": {"status": "healthy"}
            }
        )

        result = DegradedModeStrategies.should_collect_data(mock_health_service)

        assert result is True

    def test_get_collection_interval_normal(self, mock_health_service):
        """Test get_collection_interval in normal mode."""
        from data_service.services.health_service import DegradedModeStrategies

        result = DegradedModeStrategies.get_collection_interval(10, mock_health_service)

        assert result == 10

    def test_get_collection_interval_degraded(self, mock_health_service):
        """Test get_collection_interval in degraded mode."""
        from data_service.services.health_service import DegradedModeStrategies

        mock_health_service.is_degraded.return_value = True

        result = DegradedModeStrategies.get_collection_interval(10, mock_health_service)

        assert result == 20  # Double the interval

    def test_should_use_cache_normal(self, mock_health_service):
        """Test should_use_cache in normal mode."""
        from data_service.services.health_service import DegradedModeStrategies

        result = DegradedModeStrategies.should_use_cache(mock_health_service)

        assert result is False

    def test_should_use_cache_degraded(self, mock_health_service):
        """Test should_use_cache in degraded mode with healthy Redis."""
        from data_service.services.health_service import DegradedModeStrategies

        mock_health_service.is_degraded.return_value = True
        mock_health_service.checker.get_health.return_value = Mock(
            dependencies={
                "redis": {"status": "healthy"}
            }
        )

        result = DegradedModeStrategies.should_use_cache(mock_health_service)

        assert result is True
