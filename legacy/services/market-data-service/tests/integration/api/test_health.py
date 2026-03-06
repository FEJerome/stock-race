"""
Integration tests for health check endpoint.

Tests the /health endpoint:
- Overall service health status
- Dependency health checks (TimescaleDB, Redis, data sources)
- Response time requirements (< 50ms)
- Failure handling
"""

import pytest
import asyncio
import time
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class HealthStatus(Enum):
    """Health status enumeration."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class DependencyHealth:
    """Health status for a single dependency."""
    name: str
    status: HealthStatus
    latency_ms: float
    message: str = ""
    last_checked: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "status": self.status.value,
            "latency_ms": round(self.latency_ms, 2),
            "message": self.message,
            "last_checked": self.last_checked.isoformat() if self.last_checked else None
        }


class HealthChecker:
    """
    Health checker for service dependencies.

    Checks:
    - TimescaleDB connectivity
    - Redis connectivity
    - Data source availability
    """

    def __init__(self):
        self.dependencies: Dict[str, DependencyHealth] = {}
        self.checkers = {}

    def register_dependency(
        self,
        name: str,
        checker_func,
        timeout_ms: float = 5000
    ):
        """Register a dependency to check."""
        self.checkers[name] = {
            "func": checker_func,
            "timeout_ms": timeout_ms
        }

    async def check_dependency(self, name: str) -> DependencyHealth:
        """Check a single dependency."""
        if name not in self.checkers:
            return DependencyHealth(
                name=name,
                status=HealthStatus.UNHEALTHY,
                latency_ms=0,
                message="Checker not registered"
            )

        checker = self.checkers[name]
        start_time = time.time()

        try:
            # Run checker with timeout
            result = await asyncio.wait_for(
                checker["func"](),
                timeout=checker["timeout_ms"] / 1000
            )
            latency_ms = (time.time() - start_time) * 1000

            return DependencyHealth(
                name=name,
                status=HealthStatus.HEALTHY if result else HealthStatus.UNHEALTHY,
                latency_ms=latency_ms,
                message="OK" if result else "Check failed",
                last_checked=datetime.now()
            )
        except asyncio.TimeoutError:
            return DependencyHealth(
                name=name,
                status=HealthStatus.UNHEALTHY,
                latency_ms=checker["timeout_ms"],
                message="Check timed out",
                last_checked=datetime.now()
            )
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            return DependencyHealth(
                name=name,
                status=HealthStatus.UNHEALTHY,
                latency_ms=latency_ms,
                message=str(e),
                last_checked=datetime.now()
            )

    async def check_all(self) -> Dict[str, Any]:
        """Check all registered dependencies."""
        results = {}
        overall_status = HealthStatus.HEALTHY

        # Check all dependencies concurrently
        tasks = [
            self.check_dependency(name)
            for name in self.checkers.keys()
        ]

        health_results = await asyncio.gather(*tasks)

        for health in health_results:
            results[health.name] = health.to_dict()

            # Determine overall status
            if health.status == HealthStatus.UNHEALTHY:
                overall_status = HealthStatus.UNHEALTHY
            elif health.status == HealthStatus.DEGRADED and overall_status == HealthStatus.HEALTHY:
                overall_status = HealthStatus.DEGRADED

        return {
            "status": overall_status.value,
            "timestamp": datetime.now().isoformat(),
            "dependencies": results
        }


class HealthAPIHandler:
    """
    API handler for health check endpoint.

    Endpoint:
    - GET /health - Service health status
    """

    def __init__(self, health_checker: Optional[HealthChecker] = None):
        self.health_checker = health_checker or HealthChecker()
        self.request_count = 0
        self.total_response_time_ms = 0

    async def handle_get_health(self) -> Dict[str, Any]:
        """
        Handle GET /health request.

        Returns:
            Health status response
        """
        start_time = time.time()
        self.request_count += 1

        try:
            health = await self.health_checker.check_all()

            response_time_ms = (time.time() - start_time) * 1000
            self.total_response_time_ms += response_time_ms

            return {
                "success": True,
                "response_time_ms": round(response_time_ms, 2),
                "data": health
            }
        except Exception as e:
            response_time_ms = (time.time() - start_time) * 1000
            self.total_response_time_ms += response_time_ms

            return {
                "success": False,
                "error": str(e),
                "code": "HEALTH_CHECK_ERROR",
                "response_time_ms": round(response_time_ms, 2)
            }

    def get_stats(self) -> Dict[str, Any]:
        """Get health check statistics."""
        return {
            "request_count": self.request_count,
            "avg_response_time_ms": round(
                self.total_response_time_ms / self.request_count, 2
            ) if self.request_count > 0 else 0
        }


# Mock checkers for testing
async def mock_healthy_checker() -> bool:
    """Mock healthy dependency checker."""
    await asyncio.sleep(0.001)  # Simulate 1ms latency
    return True


async def mock_unhealthy_checker() -> bool:
    """Mock unhealthy dependency checker."""
    await asyncio.sleep(0.001)
    return False


async def mock_slow_checker() -> bool:
    """Mock slow dependency checker."""
    await asyncio.sleep(0.1)  # 100ms
    return True


async def mock_error_checker() -> bool:
    """Mock checker that raises exception."""
    raise Exception("Connection refused")


class TestHealthChecker:
    """Test HealthChecker class."""

    @pytest.fixture
    def health_checker(self):
        return HealthChecker()

    @pytest.mark.asyncio
    async def test_register_dependency(self, health_checker):
        """Test registering a dependency."""
        health_checker.register_dependency(
            "timescaledb",
            mock_healthy_checker
        )

        assert "timescaledb" in health_checker.checkers

    @pytest.mark.asyncio
    async def test_check_healthy_dependency(self, health_checker):
        """Test checking healthy dependency."""
        health_checker.register_dependency("redis", mock_healthy_checker)

        result = await health_checker.check_dependency("redis")

        assert result.status == HealthStatus.HEALTHY
        assert result.latency_ms > 0

    @pytest.mark.asyncio
    async def test_check_unhealthy_dependency(self, health_checker):
        """Test checking unhealthy dependency."""
        health_checker.register_dependency("sina", mock_unhealthy_checker)

        result = await health_checker.check_dependency("sina")

        assert result.status == HealthStatus.UNHEALTHY

    @pytest.mark.asyncio
    async def test_check_timeout(self, health_checker):
        """Test checker timeout handling."""
        health_checker.register_dependency(
            "slow",
            mock_slow_checker,
            timeout_ms=50  # 50ms timeout
        )

        result = await health_checker.check_dependency("slow")

        assert result.status == HealthStatus.UNHEALTHY
        assert "timed out" in result.message.lower()

    @pytest.mark.asyncio
    async def test_check_error(self, health_checker):
        """Test checker error handling."""
        health_checker.register_dependency("error", mock_error_checker)

        result = await health_checker.check_dependency("error")

        assert result.status == HealthStatus.UNHEALTHY
        assert "Connection refused" in result.message

    @pytest.mark.asyncio
    async def test_check_unregistered(self, health_checker):
        """Test checking unregistered dependency."""
        result = await health_checker.check_dependency("unknown")

        assert result.status == HealthStatus.UNHEALTHY
        assert "not registered" in result.message

    @pytest.mark.asyncio
    async def test_check_all_healthy(self, health_checker):
        """Test checking all healthy dependencies."""
        health_checker.register_dependency("db", mock_healthy_checker)
        health_checker.register_dependency("cache", mock_healthy_checker)

        result = await health_checker.check_all()

        assert result["status"] == "healthy"
        assert len(result["dependencies"]) == 2

    @pytest.mark.asyncio
    async def test_check_all_with_unhealthy(self, health_checker):
        """Test checking with unhealthy dependency."""
        health_checker.register_dependency("db", mock_healthy_checker)
        health_checker.register_dependency("sina", mock_unhealthy_checker)

        result = await health_checker.check_all()

        assert result["status"] == "unhealthy"


class TestHealthAPIHandler:
    """Test HealthAPIHandler class."""

    @pytest.fixture
    def api_handler(self):
        checker = HealthChecker()
        checker.register_dependency("timescaledb", mock_healthy_checker)
        checker.register_dependency("redis", mock_healthy_checker)
        return HealthAPIHandler(checker)

    @pytest.mark.asyncio
    async def test_get_health_success(self, api_handler):
        """Test successful health check."""
        result = await api_handler.handle_get_health()

        assert result["success"] is True
        assert "data" in result
        assert "response_time_ms" in result

    @pytest.mark.asyncio
    async def test_get_health_response_structure(self, api_handler):
        """Test health response structure."""
        result = await api_handler.handle_get_health()

        data = result["data"]
        assert "status" in data
        assert "timestamp" in data
        assert "dependencies" in data

    @pytest.mark.asyncio
    async def test_get_health_dependency_structure(self, api_handler):
        """Test dependency health structure."""
        result = await api_handler.handle_get_health()

        for dep_name, dep_health in result["data"]["dependencies"].items():
            assert "status" in dep_health
            assert "latency_ms" in dep_health
            assert "message" in dep_health
            assert "last_checked" in dep_health

    @pytest.mark.asyncio
    async def test_get_health_stats(self, api_handler):
        """Test health check statistics."""
        for _ in range(5):
            await api_handler.handle_get_health()

        stats = api_handler.get_stats()

        assert stats["request_count"] == 5
        assert stats["avg_response_time_ms"] > 0


class TestHealthEndpointResponseTime:
    """Test health endpoint response time requirement."""

    @pytest.mark.asyncio
    async def test_response_time_under_50ms(self):
        """Test health endpoint responds in < 50ms."""
        checker = HealthChecker()
        checker.register_dependency("db", mock_healthy_checker)
        checker.register_dependency("cache", mock_healthy_checker)
        handler = HealthAPIHandler(checker)

        start = time.time()
        result = await handler.handle_get_health()
        elapsed_ms = (time.time() - start) * 1000

        assert result["success"] is True
        assert elapsed_ms < 50, f"Response took {elapsed_ms:.2f}ms, expected < 50ms"

    @pytest.mark.asyncio
    async def test_response_time_with_multiple_deps(self):
        """Test response time with multiple dependencies."""
        checker = HealthChecker()
        for i in range(5):
            checker.register_dependency(f"dep_{i}", mock_healthy_checker)

        handler = HealthAPIHandler(checker)

        start = time.time()
        result = await handler.handle_get_health()
        elapsed_ms = (time.time() - start) * 1000

        assert result["success"] is True
        assert elapsed_ms < 50, f"Response took {elapsed_ms:.2f}ms, expected < 50ms"


class TestHealthEndpointWithFailures:
    """Test health endpoint with dependency failures."""

    @pytest.mark.asyncio
    async def test_unhealthy_when_db_down(self):
        """Test unhealthy status when database is down."""
        checker = HealthChecker()
        checker.register_dependency("timescaledb", mock_unhealthy_checker)
        checker.register_dependency("redis", mock_healthy_checker)
        handler = HealthAPIHandler(checker)

        result = await handler.handle_get_health()

        assert result["success"] is True
        assert result["data"]["status"] == "unhealthy"
        assert result["data"]["dependencies"]["timescaledb"]["status"] == "unhealthy"

    @pytest.mark.asyncio
    async def test_unhealthy_when_all_deps_down(self):
        """Test unhealthy status when all dependencies are down."""
        checker = HealthChecker()
        checker.register_dependency("db", mock_unhealthy_checker)
        checker.register_dependency("cache", mock_unhealthy_checker)
        handler = HealthAPIHandler(checker)

        result = await handler.handle_get_health()

        assert result["data"]["status"] == "unhealthy"

    @pytest.mark.asyncio
    async def test_healthy_when_all_deps_ok(self):
        """Test healthy status when all dependencies are OK."""
        checker = HealthChecker()
        checker.register_dependency("db", mock_healthy_checker)
        checker.register_dependency("cache", mock_healthy_checker)
        checker.register_dependency("sina", mock_healthy_checker)
        handler = HealthAPIHandler(checker)

        result = await handler.handle_get_health()

        assert result["data"]["status"] == "healthy"


class TestHealthEndpointEdgeCases:
    """Test health endpoint edge cases."""

    @pytest.mark.asyncio
    async def test_empty_dependencies(self):
        """Test health check with no dependencies."""
        handler = HealthAPIHandler()

        result = await handler.handle_get_health()

        assert result["success"] is True
        assert result["data"]["status"] == "healthy"
        assert result["data"]["dependencies"] == {}

    @pytest.mark.asyncio
    async def test_single_dependency(self):
        """Test health check with single dependency."""
        checker = HealthChecker()
        checker.register_dependency("db", mock_healthy_checker)
        handler = HealthAPIHandler(checker)

        result = await handler.handle_get_health()

        assert result["data"]["status"] == "healthy"
        assert len(result["data"]["dependencies"]) == 1

    @pytest.mark.asyncio
    async def test_mixed_dependencies(self):
        """Test health check with mixed healthy/unhealthy deps."""
        checker = HealthChecker()
        checker.register_dependency("healthy1", mock_healthy_checker)
        checker.register_dependency("unhealthy", mock_unhealthy_checker)
        checker.register_dependency("healthy2", mock_healthy_checker)
        handler = HealthAPIHandler(checker)

        result = await handler.handle_get_health()

        assert result["data"]["status"] == "unhealthy"
        deps = result["data"]["dependencies"]
        assert deps["healthy1"]["status"] == "healthy"
        assert deps["unhealthy"]["status"] == "unhealthy"

    @pytest.mark.asyncio
    async def test_concurrent_health_checks(self):
        """Test concurrent health check requests."""
        checker = HealthChecker()
        checker.register_dependency("db", mock_healthy_checker)
        handler = HealthAPIHandler(checker)

        async def check():
            return await handler.handle_get_health()

        tasks = [check() for _ in range(10)]
        results = await asyncio.gather(*tasks)

        assert all(r["success"] for r in results)
        assert handler.get_stats()["request_count"] == 10


class TestHealthEndpointFormat:
    """Test health endpoint response format."""

    @pytest.fixture
    def api_handler(self):
        checker = HealthChecker()
        checker.register_dependency("timescaledb", mock_healthy_checker)
        checker.register_dependency("redis", mock_healthy_checker)
        checker.register_dependency("sina", mock_healthy_checker)
        return HealthAPIHandler(checker)

    @pytest.mark.asyncio
    async def test_status_values(self, api_handler):
        """Test status values are valid."""
        result = await api_handler.handle_get_health()

        status = result["data"]["status"]
        assert status in ["healthy", "degraded", "unhealthy"]

    @pytest.mark.asyncio
    async def test_timestamp_format(self, api_handler):
        """Test timestamp is ISO format."""
        result = await api_handler.handle_get_health()

        timestamp = result["data"]["timestamp"]
        # Should be parseable as datetime
        datetime.fromisoformat(timestamp)

    @pytest.mark.asyncio
    async def test_latency_positive(self, api_handler):
        """Test latency values are positive."""
        result = await api_handler.handle_get_health()

        for dep in result["data"]["dependencies"].values():
            assert dep["latency_ms"] >= 0

    @pytest.mark.asyncio
    async def test_response_time_included(self, api_handler):
        """Test response time is included in response."""
        result = await api_handler.handle_get_health()

        assert "response_time_ms" in result
        assert result["response_time_ms"] >= 0
