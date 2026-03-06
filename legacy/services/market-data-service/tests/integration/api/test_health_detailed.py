"""
Integration tests for detailed health check API.

Tests health endpoint with depth parameter for multi-dimensional checks.
"""

import pytest
import asyncio
from typing import Dict, Any


class HealthAPIHandler:
    """
    Enhanced API handler for health endpoint.

    Supports:
    - GET /health - Basic health check (< 50ms)
    - GET /health?depth=deep - Comprehensive health check
    """

    def __init__(self, basic_checker, deep_checker):
        self.basic = basic_checker
        self.deep = deep_checker

    async def handle_get_health(self, depth: str = "basic") -> Dict[str, Any]:
        """
        Handle GET /health request.

        Args:
            depth: 'basic' or 'deep'

        Returns:
            Health status response
        """
        try:
            if depth == "deep":
                health = await self.deep.check_deep_health()
            else:
                health = await self.basic.check_all()

            return {
                "success": True,
                "data": health
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "code": "HEALTH_CHECK_ERROR"
            }


# Import test implementations
import sys
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/worktrees/worktree-market-data-service/market-data-service/tests/unit/monitoring')
from test_deep_health import DeepHealthChecker, MockDBClient, MockRedisClient, MockCollector, HealthStatus


class MockBasicHealthChecker:
    """Mock basic health checker."""

    async def check_all(self) -> Dict[str, Any]:
        return {
            "status": HealthStatus.HEALTHY.value,
            "dependencies": {
                "timescaledb": {"status": "healthy", "latency_ms": 5},
                "redis": {"status": "healthy", "latency_ms": 2}
            }
        }


class TestHealthAPI:
    """Test health API with different depths."""

    @pytest.fixture
    def api_handler(self):
        basic = MockBasicHealthChecker()
        deep = DeepHealthChecker(
            MockDBClient(),
            MockRedisClient(),
            MockCollector()
        )
        return HealthAPIHandler(basic, deep)

    @pytest.mark.asyncio
    async def test_basic_health_endpoint(self, api_handler):
        """Test basic health endpoint."""
        result = await api_handler.handle_get_health(depth="basic")

        assert result["success"] is True
        assert "data" in result
        assert "status" in result["data"]
        assert "dependencies" in result["data"]

    @pytest.mark.asyncio
    async def test_deep_health_endpoint(self, api_handler):
        """Test deep health endpoint."""
        result = await api_handler.handle_get_health(depth="deep")

        assert result["success"] is True
        assert "data" in result
        # Deep health should have more dimensions
        assert "basic" in result["data"]
        assert "business" in result["data"]
        assert "end_to_end" in result["data"]

    @pytest.mark.asyncio
    async def test_default_to_basic(self, api_handler):
        """Test default health check is basic."""
        result = await api_handler.handle_get_health()

        assert result["success"] is True
        # Should use basic format
        assert "dependencies" in result["data"]

    @pytest.mark.asyncio
    async def test_deep_health_response_time(self, api_handler):
        """Test deep health check completes in reasonable time."""
        import time
        start = time.time()

        result = await api_handler.handle_get_health(depth="deep")

        elapsed_ms = (time.time() - start) * 1000

        assert result["success"] is True
        # Deep health should complete in under 1 second
        assert elapsed_ms < 1000


class TestHealthAPIErrors:
    """Test health API error handling."""

    @pytest.mark.asyncio
    async def test_health_check_failure(self):
        """Test handling of health check failure."""
        class FailingChecker:
            async def check_deep_health(self):
                raise Exception("Health check failed")

        handler = HealthAPIHandler(None, FailingChecker())
        result = await handler.handle_get_health(depth="deep")

        assert result["success"] is False
        assert "error" in result


class TestHealthResponseFormat:
    """Test health response format compliance."""

    @pytest.mark.asyncio
    async def test_basic_health_status_values(self):
        """Test basic health status values are valid."""
        basic = MockBasicHealthChecker()
        deep = DeepHealthChecker(
            MockDBClient(),
            MockRedisClient(),
            MockCollector()
        )
        handler = HealthAPIHandler(basic, deep)

        result = await handler.handle_get_health(depth="basic")

        status = result["data"]["status"]
        assert status in ["healthy", "degraded", "unhealthy"]

    @pytest.mark.asyncio
    async def test_deep_health_dimensions(self):
        """Test deep health has all required dimensions."""
        basic = MockBasicHealthChecker()
        deep = DeepHealthChecker(
            MockDBClient(),
            MockRedisClient(),
            MockCollector()
        )
        handler = HealthAPIHandler(basic, deep)

        result = await handler.handle_get_health(depth="deep")

        data = result["data"]
        assert "basic" in data
        assert "business" in data
        assert "end_to_end" in data
        assert "timestamp" in data
