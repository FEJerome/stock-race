"""
Market Data Service Health Service.

Integrates with the unified health check SDK to provide:
- Service health monitoring (C1-MD-001)
- Degraded mode operation (C1-MD-002)
- Auto-recovery mechanism (C1-MD-003)
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Callable
from pathlib import Path
import sys

# Add health-check SDK to path
project_root = Path(__file__).parent.parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "health-check" / "src"))

from health_check import HealthChecker, HealthStatus

from ..core.config import settings
from ..storage.cache import RedisCache

logger = logging.getLogger(__name__)


class MarketDataHealthService:
    """
    Market Data Service Health Service.

    Manages service health monitoring and degraded mode operation.
    """

    def __init__(self):
        """Initialize the health service."""
        self.checker = HealthChecker(
            service_name="market-data-service",
            version="1.0.0",
            check_interval=30
        )

        self._redis_cache: Optional[RedisCache] = None
        self._data_service = None

        # Degraded mode flags
        self._is_degraded = False
        self._degraded_reason: Optional[str] = None
        self._degraded_since: Optional[datetime] = None

        # Recovery tracking
        self._recovery_callbacks: list = []
        self._degradation_callbacks: list = []

    async def initialize(
        self,
        redis_cache: Optional[RedisCache] = None,
        data_service=None
    ):
        """
        Initialize health service with dependencies (C1-MD-001).

        Args:
            redis_cache: Redis cache instance
            data_service: Data service instance
        """
        self._redis_cache = redis_cache
        self._data_service = data_service

        # Add Redis dependency check
        if redis_cache:
            self.checker.add_dependency(
                name="redis",
                check_func=self._check_redis,
                is_critical=True,
                timeout=5.0,
                retry_count=3
            )

        # Add data sources dependency check
        self.checker.add_dependency(
            name="data_sources",
            check_func=self._check_data_sources,
            is_critical=False,  # Non-critical - can work with degraded sources
            timeout=10.0,
            retry_count=2
        )

        # Add custom metrics check
        self.checker.add_custom_check(self._get_custom_metrics)

        # Perform initial health check
        await self.checker.check_health()

        # Start periodic health checks
        asyncio.create_task(self.checker.start_periodic_checks())

        # Start recovery monitor
        asyncio.create_task(self._monitor_recovery())

        logger.info("MarketDataHealthService initialized")

    async def _check_redis(self) -> bool:
        """Check Redis connectivity."""
        if not self._redis_cache:
            return False
        try:
            # Try to ping Redis
            await self._redis_cache.ping()
            return True
        except Exception as e:
            logger.warning(f"Redis health check failed: {e}")
            return False

    async def _check_data_sources(self) -> bool:
        """Check data sources availability."""
        if not self._data_service:
            return True  # No data service means no sources to check

        try:
            # Get router stats
            router_stats = self._data_service.data_router.get_router_stats()
            healthy_sources = router_stats.get("healthy_sources", 0)
            total_sources = router_stats.get("total_sources", 0)

            # Consider healthy if at least one source is available
            return healthy_sources > 0
        except Exception as e:
            logger.warning(f"Data sources health check failed: {e}")
            return False

    async def _get_custom_metrics(self) -> Dict[str, Any]:
        """Get custom health metrics."""
        metrics = {
            "is_degraded": self._is_degraded,
            "degraded_reason": self._degraded_reason,
        }

        if self._data_service:
            try:
                router_stats = self._data_service.data_router.get_router_stats()
                metrics["data_sources_total"] = router_stats.get("total_sources", 0)
                metrics["data_sources_healthy"] = router_stats.get("healthy_sources", 0)
                metrics["collection_success_rate"] = router_stats.get("success_rate", 0)
            except Exception:
                pass

        return metrics

    async def _monitor_recovery(self):
        """
        Monitor service health and handle recovery (C1-MD-003).

        Automatically recovers from degraded mode when dependencies are restored.
        """
        while True:
            try:
                await asyncio.sleep(10)  # Check every 10 seconds

                if not self._is_degraded:
                    # Check if we need to enter degraded mode
                    health = self.checker.get_health()
                    if health and health.status == HealthStatus.DEGRADED:
                        await self._enter_degraded_mode(health.message)
                    elif health and health.status == HealthStatus.UNHEALTHY:
                        await self._enter_degraded_mode(health.message, critical=True)
                else:
                    # Check if we can recover
                    health = self.checker.get_health()
                    if health and health.status == HealthStatus.HEALTHY:
                        await self._recover_from_degraded_mode()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in recovery monitor: {e}")

    async def _enter_degraded_mode(self, reason: str, critical: bool = False):
        """
        Enter degraded mode (C1-MD-002).

        Args:
            reason: Degradation reason
            critical: Whether this is a critical failure
        """
        if self._is_degraded:
            return

        self._is_degraded = True
        self._degraded_reason = reason
        self._degraded_since = datetime.now()

        logger.warning(f"Entering degraded mode: {reason}")

        # Execute degradation callbacks
        for callback in self._degradation_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(reason, critical)
                else:
                    callback(reason, critical)
            except Exception as e:
                logger.error(f"Degradation callback failed: {e}")

    async def _recover_from_degraded_mode(self):
        """
        Recover from degraded mode (C1-MD-003).

        Automatically called when dependencies are restored.
        """
        if not self._is_degraded:
            return

        duration = datetime.now() - self._degraded_since if self._degraded_since else timedelta(0)

        logger.info(f"Recovering from degraded mode after {duration}")

        self._is_degraded = False
        self._degraded_reason = None
        self._degraded_since = None

        # Execute recovery callbacks
        for callback in self._recovery_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback()
                else:
                    callback()
            except Exception as e:
                logger.error(f"Recovery callback failed: {e}")

    def on_degradation(self, callback: Callable):
        """
        Register a callback for degradation events.

        Args:
            callback: Function to call when entering degraded mode
        """
        self._degradation_callbacks.append(callback)

    def on_recovery(self, callback: Callable):
        """
        Register a callback for recovery events.

        Args:
            callback: Function to call when recovering from degraded mode
        """
        self._recovery_callbacks.append(callback)

    def is_healthy(self) -> bool:
        """Check if service is healthy."""
        return self.checker.is_healthy()

    def is_degraded(self) -> bool:
        """Check if service is in degraded mode."""
        return self._is_degraded

    def get_status(self) -> Dict[str, Any]:
        """Get current health status."""
        status = self.checker.to_dict()
        status["degraded"] = {
            "is_degraded": self._is_degraded,
            "reason": self._degraded_reason,
            "since": self._degraded_since.isoformat() if self._degraded_since else None,
        }
        return status

    async def shutdown(self):
        """Shutdown the health service."""
        self.checker.stop_periodic_checks()
        logger.info("MarketDataHealthService shutdown")


# Global health service instance
health_service = MarketDataHealthService()


# Degraded mode strategies (C1-MD-002)
class DegradedModeStrategies:
    """
    Degraded mode operation strategies.

    Defines how the service behaves when in degraded mode.
    """

    @staticmethod
    def should_collect_data(health_service: MarketDataHealthService) -> bool:
        """
        Determine if data collection should proceed.

        In degraded mode, we may want to reduce collection frequency
        or only collect from reliable sources.
        """
        if not health_service.is_degraded():
            return True

        # In degraded mode, check if we have at least one data source
        health = health_service.checker.get_health()
        if health and "data_sources" in health.dependencies:
            ds_status = health.dependencies["data_sources"]
            return ds_status.get("status") == HealthStatus.HEALTHY.value

        return False

    @staticmethod
    def get_collection_interval(normal_interval: int, health_service: MarketDataHealthService) -> int:
        """
        Get adjusted collection interval for degraded mode.

        Args:
            normal_interval: Normal collection interval in seconds
            health_service: Health service instance

        Returns:
            Adjusted collection interval
        """
        if not health_service.is_degraded():
            return normal_interval

        # In degraded mode, increase interval to reduce load
        return normal_interval * 2  # Double the interval

    @staticmethod
    def should_use_cache(health_service: MarketDataHealthService) -> bool:
        """
        Determine if cache should be used more aggressively.

        In degraded mode, we rely more on cached data.
        """
        if not health_service.is_degraded():
            return False

        # Check if Redis is healthy
        health = health_service.checker.get_health()
        if health and "redis" in health.dependencies:
            redis_status = health.dependencies["redis"]
            return redis_status.get("status") == HealthStatus.HEALTHY.value

        return False
