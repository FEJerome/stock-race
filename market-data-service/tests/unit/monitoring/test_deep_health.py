"""
Unit tests for deep health checking.

Tests multi-dimensional health checks including business logic,
data freshness, and end-to-end pipeline verification.
"""

import pytest
import asyncio
from typing import Dict, Any, List
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum


class HealthStatus(Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class HealthCheckDimension:
    """A single dimension of health check."""
    name: str
    status: HealthStatus
    latency_ms: float
    message: str
    details: Dict[str, Any]


class DeepHealthChecker:
    """
    Deep health checker with multiple dimensions.

    Dimensions:
    - Basic: Database, Redis connectivity
    - Business: Data freshness, collection rate
    - End-to-end: Full pipeline verification
    """

    def __init__(self, db_client, redis_client, collector, config=None):
        self.db = db_client
        self.redis = redis_client
        self.collector = collector
        self.config = config or {}

        # Thresholds
        self.max_data_delay_seconds = self.config.get("max_data_delay_seconds", 60)
        self.min_collection_rate = self.config.get("min_collection_rate", 0.95)

    async def check_deep_health(self) -> Dict[str, Any]:
        """Perform comprehensive health check."""
        # Check all dimensions
        basic_check = await self._check_basic_health()
        business_check = await self._check_business_health()
        e2e_check = await self._check_end_to_end()

        # Determine overall status
        all_checks = [basic_check, business_check, e2e_check]
        overall_status = self._determine_overall_status(all_checks)

        return {
            "status": overall_status.value,
            "timestamp": datetime.now().isoformat(),
            "basic": basic_check,
            "business": business_check,
            "end_to_end": e2e_check
        }

    async def _check_basic_health(self) -> Dict[str, Any]:
        """Check basic infrastructure health."""
        dependencies = {}

        # Check TimescaleDB
        start = datetime.now()
        try:
            await self.db.ping()
            db_latency = (datetime.now() - start).total_seconds() * 1000
            dependencies["timescaledb"] = {
                "status": HealthStatus.HEALTHY.value,
                "latency_ms": round(db_latency, 2)
            }
        except Exception as e:
            dependencies["timescaledb"] = {
                "status": HealthStatus.UNHEALTHY.value,
                "error": str(e)
            }

        # Check Redis
        start = datetime.now()
        try:
            await self.redis.ping()
            redis_latency = (datetime.now() - start).total_seconds() * 1000
            dependencies["redis"] = {
                "status": HealthStatus.HEALTHY.value,
                "latency_ms": round(redis_latency, 2)
            }
        except Exception as e:
            dependencies["redis"] = {
                "status": HealthStatus.UNHEALTHY.value,
                "error": str(e)
            }

        # Check data sources
        for source_name in ["sina", "tencent", "eastmoney"]:
            try:
                health = await self.collector.check_source_health(source_name)
                dependencies[source_name] = {
                    "status": HealthStatus.HEALTHY.value if health else HealthStatus.UNHEALTHY.value,
                    "latency_ms": 100 if health else 0
                }
            except Exception as e:
                dependencies[source_name] = {
                    "status": HealthStatus.UNHEALTHY.value,
                    "error": str(e)
                }

        # Determine overall basic status
        unhealthy_count = sum(1 for d in dependencies.values() if d.get("status") == HealthStatus.UNHEALTHY.value)
        if unhealthy_count == 0:
            basic_status = HealthStatus.HEALTHY
        elif unhealthy_count <= 1:
            basic_status = HealthStatus.DEGRADED
        else:
            basic_status = HealthStatus.UNHEALTHY

        return {
            "status": basic_status.value,
            "dependencies": dependencies
        }

    async def _check_business_health(self) -> Dict[str, Any]:
        """Check business logic health."""
        business_checks = {}

        # Check data freshness
        last_quote_time = await self.collector.get_last_quote_time()
        if last_quote_time:
            delay_seconds = (datetime.now() - last_quote_time).total_seconds()
            is_fresh = delay_seconds < self.max_data_delay_seconds

            business_checks["data_freshness"] = {
                "status": HealthStatus.HEALTHY.value if is_fresh else HealthStatus.DEGRADED.value,
                "last_quote_time": last_quote_time.isoformat(),
                "max_delay_seconds": self.max_data_delay_seconds,
                "actual_delay_seconds": round(delay_seconds, 2)
            }
        else:
            business_checks["data_freshness"] = {
                "status": HealthStatus.UNHEALTHY.value,
                "message": "No quote data available"
            }

        # Check collection rate (5 minutes)
        collection_stats = await self.collector.get_collection_stats(minutes=5)
        collection_rate = collection_stats.get("success_rate", 0)

        if collection_rate >= self.min_collection_rate:
            collection_status = HealthStatus.HEALTHY
        elif collection_rate >= 0.8:
            collection_status = HealthStatus.DEGRADED
        else:
            collection_status = HealthStatus.UNHEALTHY

        business_checks["collection_rate_5m"] = {
            "status": collection_status.value,
            "rate": round(collection_rate, 4),
            "threshold": self.min_collection_rate
        }

        # Determine overall business status
        statuses = [c.get("status") for c in business_checks.values()]
        if HealthStatus.UNHEALTHY.value in statuses:
            overall = HealthStatus.UNHEALTHY
        elif HealthStatus.DEGRADED.value in statuses:
            overall = HealthStatus.DEGRADED
        else:
            overall = HealthStatus.HEALTHY

        return {
            "status": overall.value,
            **business_checks
        }

    async def _check_end_to_end(self) -> Dict[str, Any]:
        """Perform end-to-end pipeline check."""
        start = datetime.now()
        test_symbol = "000001"  # Test with a common symbol

        try:
            # Full pipeline: collect -> process -> store -> cache
            quote = await self.collector.collect_single_quote(test_symbol)

            if quote:
                elapsed_ms = (datetime.now() - start).total_seconds() * 1000

                # Verify storage
                stored = await self._verify_storage(test_symbol)

                return {
                    "full_pipeline": {
                        "status": HealthStatus.HEALTHY.value if stored else HealthStatus.DEGRADED.value,
                        "test_symbol": test_symbol,
                        "collection_time_ms": round(elapsed_ms, 2),
                        "storage_verified": stored
                    }
                }
            else:
                return {
                    "full_pipeline": {
                        "status": HealthStatus.UNHEALTHY.value,
                        "test_symbol": test_symbol,
                        "error": "Failed to collect quote"
                    }
                }

        except Exception as e:
            return {
                "full_pipeline": {
                    "status": HealthStatus.UNHEALTHY.value,
                    "test_symbol": test_symbol,
                    "error": str(e)
                }
            }

    async def _verify_storage(self, symbol: str) -> bool:
        """Verify data was properly stored."""
        try:
            # Check cache
            cached = await self.redis.get(f"quote:{symbol}")
            return cached is not None
        except Exception:
            return False

    def _determine_overall_status(self, checks: List[Dict]) -> HealthStatus:
        """Determine overall health status from all checks."""
        statuses = [c.get("status") for c in checks]

        if HealthStatus.UNHEALTHY.value in statuses:
            return HealthStatus.UNHEALTHY
        elif HealthStatus.DEGRADED.value in statuses:
            return HealthStatus.DEGRADED
        else:
            return HealthStatus.HEALTHY


class MockDBClient:
    """Mock database client."""
    should_fail = False

    async def ping(self):
        if self.should_fail:
            raise Exception("Connection refused")


class MockRedisClient:
    """Mock Redis client."""
    should_fail = False
    data = {}

    async def ping(self):
        if self.should_fail:
            raise Exception("Connection refused")

    async def get(self, key):
        return self.data.get(key)


class MockCollector:
    """Mock data collector."""
    last_quote_time = None
    collection_rate = 0.99
    should_fail = False

    async def check_source_health(self, source: str) -> bool:
        return not self.should_fail

    async def get_last_quote_time(self):
        return self.last_quote_time

    async def get_collection_stats(self, minutes: int = 5):
        return {"success_rate": self.collection_rate}

    async def collect_single_quote(self, symbol: str):
        if self.should_fail:
            return None
        return {"symbol": symbol, "price": 10.5}


class TestDeepHealthChecker:
    """Test deep health checker."""

    @pytest.fixture
    def checker(self):
        db = MockDBClient()
        redis = MockRedisClient()
        collector = MockCollector()
        collector.last_quote_time = datetime.now() - timedelta(seconds=30)
        return DeepHealthChecker(db, redis, collector)

    @pytest.mark.asyncio
    async def test_healthy_system(self, checker):
        """Test healthy system check."""
        result = await checker.check_deep_health()

        assert result["status"] == HealthStatus.HEALTHY.value
        assert "basic" in result
        assert "business" in result
        assert "end_to_end" in result

    @pytest.mark.asyncio
    async def test_basic_health_check(self, checker):
        """Test basic health dimension."""
        result = await checker._check_basic_health()

        assert "status" in result
        assert "dependencies" in result
        assert "timescaledb" in result["dependencies"]
        assert "redis" in result["dependencies"]

    @pytest.mark.asyncio
    async def test_business_health_check(self, checker):
        """Test business health dimension."""
        result = await checker._check_business_health()

        assert "status" in result
        assert "data_freshness" in result
        assert "collection_rate_5m" in result

    @pytest.mark.asyncio
    async def test_end_to_end_check(self, checker):
        """Test end-to-end pipeline check."""
        result = await checker._check_end_to_end()

        assert "full_pipeline" in result
        assert "status" in result["full_pipeline"]

    @pytest.mark.asyncio
    async def test_db_failure(self, checker):
        """Test health check with DB failure."""
        checker.db.should_fail = True

        result = await checker.check_deep_health()

        assert result["basic"]["dependencies"]["timescaledb"]["status"] == HealthStatus.UNHEALTHY.value

    @pytest.mark.asyncio
    async def test_stale_data(self, checker):
        """Test health check with stale data."""
        checker.collector.last_quote_time = datetime.now() - timedelta(minutes=5)

        result = await checker.check_deep_health()

        # Should be degraded due to stale data
        assert result["business"]["data_freshness"]["status"] == HealthStatus.DEGRADED.value

    @pytest.mark.asyncio
    async def test_low_collection_rate(self, checker):
        """Test health check with low collection rate."""
        checker.collector.collection_rate = 0.7

        result = await checker.check_deep_health()

        assert result["business"]["collection_rate_5m"]["status"] == HealthStatus.UNHEALTHY.value


class TestDeepHealthEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_no_quote_data(self):
        """Test health check when no quote data exists."""
        db = MockDBClient()
        redis = MockRedisClient()
        collector = MockCollector()
        collector.last_quote_time = None

        checker = DeepHealthChecker(db, redis, collector)
        result = await checker.check_deep_health()

        assert result["business"]["data_freshness"]["status"] == HealthStatus.UNHEALTHY.value

    @pytest.mark.asyncio
    async def test_pipeline_failure(self):
        """Test health check when pipeline fails."""
        db = MockDBClient()
        redis = MockRedisClient()
        collector = MockCollector()
        collector.should_fail = True

        checker = DeepHealthChecker(db, redis, collector)
        result = await checker.check_deep_health()

        assert result["end_to_end"]["full_pipeline"]["status"] == HealthStatus.UNHEALTHY.value
