"""
Tests for Health Check SDK.
"""

import pytest
import asyncio
from unittest.mock import Mock, patch
from datetime import datetime
import sys
from pathlib import Path

# Add health-check SDK to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from health_check import HealthChecker, HealthStatus


class TestHealthChecker:
    """Test HealthChecker functionality."""

    @pytest.fixture
    def checker(self):
        return HealthChecker(
            service_name="test-service",
            version="1.0.0",
            check_interval=30
        )

    def test_initialization(self, checker):
        """Test health checker initialization."""
        assert checker.service_name == "test-service"
        assert checker.version == "1.0.0"
        assert checker.check_interval == 30
        assert checker._last_result is None

    def test_add_dependency(self, checker):
        """Test adding dependency check."""
        mock_check = Mock(return_value=True)

        checker.add_dependency(
            name="redis",
            check_func=mock_check,
            is_critical=True,
            timeout=5.0
        )

        assert len(checker._dependencies) == 1
        assert checker._dependencies[0].name == "redis"
        assert checker._dependencies[0].is_critical is True

    def test_add_custom_check(self, checker):
        """Test adding custom health check."""
        mock_check = Mock(return_value={"memory_usage": 50})

        checker.add_custom_check(mock_check)

        assert len(checker._custom_checks) == 1

    @pytest.mark.asyncio
    async def test_check_dependency_healthy(self, checker):
        """Test checking a healthy dependency."""
        mock_check = Mock(return_value=True)

        checker.add_dependency(
            name="redis",
            check_func=mock_check,
            is_critical=True
        )

        result = await checker.check_dependency(checker._dependencies[0])

        assert result["status"] == HealthStatus.HEALTHY.value
        assert result["name"] == "redis"
        assert result["critical"] is True

    @pytest.mark.asyncio
    async def test_check_dependency_unhealthy(self, checker):
        """Test checking an unhealthy dependency."""
        mock_check = Mock(return_value=False)

        checker.add_dependency(
            name="database",
            check_func=mock_check,
            is_critical=True
        )

        result = await checker.check_dependency(checker._dependencies[0])

        assert result["status"] == HealthStatus.UNHEALTHY.value
        assert result["name"] == "database"

    @pytest.mark.asyncio
    async def test_check_dependency_exception(self, checker):
        """Test checking a dependency that raises exception."""
        mock_check = Mock(side_effect=Exception("Connection refused"))

        checker.add_dependency(
            name="api",
            check_func=mock_check,
            is_critical=True
        )

        result = await checker.check_dependency(checker._dependencies[0])

        assert result["status"] == HealthStatus.UNHEALTHY.value
        assert "Connection refused" in result["message"]

    @pytest.mark.asyncio
    async def test_check_health_all_healthy(self, checker):
        """Test health check when all dependencies are healthy."""
        checker.add_dependency("redis", Mock(return_value=True), is_critical=True)
        checker.add_dependency("db", Mock(return_value=True), is_critical=True)

        result = await checker.check_health()

        assert result.status == HealthStatus.HEALTHY
        assert result.message == "All dependencies healthy"
        assert len(result.dependencies) == 2

    @pytest.mark.asyncio
    async def test_check_health_critical_failure(self, checker):
        """Test health check when critical dependency fails."""
        checker.add_dependency("redis", Mock(return_value=False), is_critical=True)
        checker.add_dependency("db", Mock(return_value=True), is_critical=True)

        result = await checker.check_health()

        assert result.status == HealthStatus.UNHEALTHY
        assert "1 critical dependencies failed" in result.message

    @pytest.mark.asyncio
    async def test_check_health_non_critical_failure(self, checker):
        """Test health check when non-critical dependency fails."""
        checker.add_dependency("redis", Mock(return_value=True), is_critical=True)
        checker.add_dependency("cache", Mock(return_value=False), is_critical=False)

        result = await checker.check_health()

        assert result.status == HealthStatus.DEGRADED
        assert "1 non-critical dependencies failed" in result.message

    def test_is_healthy(self, checker):
        """Test is_healthy method."""
        assert checker.is_healthy() is False  # No check performed yet

        # Simulate healthy result
        from health_check.checker import HealthCheckResult
        checker._last_result = HealthCheckResult(
            status=HealthStatus.HEALTHY,
            message="OK",
            timestamp=datetime.now()
        )

        assert checker.is_healthy() is True

    def test_is_degraded(self, checker):
        """Test is_degraded method."""
        assert checker.is_degraded() is False

        # Simulate degraded result
        from health_check.checker import HealthCheckResult
        checker._last_result = HealthCheckResult(
            status=HealthStatus.DEGRADED,
            message="Degraded",
            timestamp=datetime.now()
        )

        assert checker.is_degraded() is True

    def test_to_dict(self, checker):
        """Test to_dict method."""
        checker.add_dependency("redis", Mock(return_value=True), is_critical=True)

        # Perform a health check first
        asyncio.run(checker.check_health())

        data = checker.to_dict()

        assert data["service"] == "test-service"
        assert data["version"] == "1.0.0"
        assert "status" in data
        assert "dependencies" in data
        assert "redis" in data["dependencies"]


class TestHealthStatus:
    """Test HealthStatus enum."""

    def test_health_status_values(self):
        """Test health status enum values."""
        assert HealthStatus.HEALTHY.value == "healthy"
        assert HealthStatus.DEGRADED.value == "degraded"
        assert HealthStatus.UNHEALTHY.value == "unhealthy"
        assert HealthStatus.UNKNOWN.value == "unknown"


class TestAsyncHealthCheck:
    """Test async health check functionality."""

    @pytest.fixture
    def checker(self):
        return HealthChecker(service_name="async-service")

    @pytest.mark.asyncio
    async def test_async_dependency_check(self, checker):
        """Test async dependency check function."""
        async def async_check():
            await asyncio.sleep(0.01)
            return True

        checker.add_dependency("async-dep", async_check)

        result = await checker.check_dependency(checker._dependencies[0])

        assert result["status"] == HealthStatus.HEALTHY.value

    @pytest.mark.asyncio
    async def test_async_custom_check(self, checker):
        """Test async custom check function."""
        async def async_custom():
            await asyncio.sleep(0.01)
            return {"async_metric": 42}

        checker.add_custom_check(async_custom)
        checker.add_dependency("dep", Mock(return_value=True))

        result = await checker.check_health()

        assert result.metrics.get("async_metric") == 42

    @pytest.mark.asyncio
    async def test_periodic_checks(self, checker):
        """Test periodic health checks."""
        checker.add_dependency("dep", Mock(return_value=True))
        checker.check_interval = 0.1  # 100ms for testing

        # Start periodic checks
        task = asyncio.create_task(checker.start_periodic_checks())

        # Wait for a few checks
        await asyncio.sleep(0.25)

        # Stop periodic checks
        checker.stop_periodic_checks()

        # Wait for task to complete
        try:
            await asyncio.wait_for(task, timeout=1.0)
        except asyncio.CancelledError:
            pass

        # Verify checks were performed
        assert checker._last_result is not None
