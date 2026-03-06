"""
Health check and degradation service for Trading AI Service.

Implements:
- C1-TAI-001: Health check SDK integration
- C1-TAI-002: Degraded operation mode
- C1-TAI-003: Auto-recovery mechanism
"""

import sys
from pathlib import Path
from typing import Dict, Any, Optional, Callable
from datetime import datetime
from enum import Enum
from loguru import logger

# Add service-state SDK to path
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "service-state" / "src"))

from ..core.config import settings
from ..core.redis import get_redis_client


class ServiceMode(Enum):
    """Service operation mode"""
    NORMAL = "normal"           # Full functionality
    DEGRADED = "degraded"       # Limited functionality (no market data/news)
    OFFLINE = "offline"         # Basic functionality only (no AI)


class HealthCheckService:
    """
    Health check service for Trading AI Service.

    Manages:
    - Redis connectivity check
    - Event bus health check
    - AI provider availability
    - Service mode transitions
    """

    _instance: Optional["HealthCheckService"] = None
    _initialized: bool = False

    def __new__(cls) -> "HealthCheckService":
        """Ensure singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize the health check service."""
        if not hasattr(self, '_mode'):
            self._mode = ServiceMode.NORMAL
            self._redis_healthy = False
            self._event_bus_healthy = False
            self._ai_providers_healthy: Dict[str, bool] = {}
            self._last_check: Optional[datetime] = None
            self._check_callbacks: list = []
            self._recovery_callbacks: list = []
            self._degradation_callbacks: list = []

    async def initialize(self) -> None:
        """Initialize health check service."""
        if self._initialized:
            return

        logger.info("🔍 Initializing HealthCheckService...")

        # Perform initial health check
        await self.perform_health_check()

        self._initialized = True
        logger.info(f"✅ HealthCheckService initialized (mode: {self._mode.value})")

    async def perform_health_check(self) -> Dict[str, Any]:
        """
        Perform comprehensive health check.

        Returns:
            Dictionary with health check results
        """
        results = {
            "timestamp": datetime.utcnow().isoformat(),
            "overall": "healthy",
            "checks": {}
        }

        # Check Redis
        redis_status = await self._check_redis()
        results["checks"]["redis"] = redis_status
        self._redis_healthy = redis_status["healthy"]

        # Check Event Bus (Redis-based)
        event_bus_status = await self._check_event_bus()
        results["checks"]["event_bus"] = event_bus_status
        self._event_bus_healthy = event_bus_status["healthy"]

        # Check AI Providers
        ai_status = await self._check_ai_providers()
        results["checks"]["ai_providers"] = ai_status
        self._ai_providers_healthy = ai_status.get("providers", {})

        # Evaluate service mode
        await self._evaluate_mode()

        results["mode"] = self._mode.value
        results["overall"] = "healthy" if self._mode != ServiceMode.OFFLINE else "degraded"

        self._last_check = datetime.utcnow()
        return results

    async def _check_redis(self) -> Dict[str, Any]:
        """Check Redis connectivity."""
        try:
            redis_client = await get_redis_client()
            if redis_client:
                # Try ping
                await redis_client.ping()
                return {
                    "healthy": True,
                    "status": "connected",
                    "message": "Redis connection OK"
                }
            else:
                return {
                    "healthy": False,
                    "status": "not_initialized",
                    "message": "Redis client not initialized"
                }
        except Exception as e:
            logger.warning(f"Redis health check failed: {e}")
            return {
                "healthy": False,
                "status": "error",
                "message": str(e)
            }

    async def _check_event_bus(self) -> Dict[str, Any]:
        """Check event bus connectivity."""
        try:
            # Event bus uses Redis, so check Redis first
            if not self._redis_healthy:
                return {
                    "healthy": False,
                    "status": "redis_unavailable",
                    "message": "Event bus unavailable (Redis down)"
                }

            # Try to import and check event bus
            from .event_bus_manager import EventBusManager
            event_bus = EventBusManager()

            if event_bus.is_initialized:
                is_connected = await event_bus.health_check()
                return {
                    "healthy": is_connected,
                    "status": "connected" if is_connected else "disconnected",
                    "message": "Event bus OK" if is_connected else "Event bus disconnected"
                }
            else:
                return {
                    "healthy": False,
                    "status": "not_initialized",
                    "message": "Event bus not initialized"
                }
        except Exception as e:
            logger.warning(f"Event bus health check failed: {e}")
            return {
                "healthy": False,
                "status": "error",
                "message": str(e)
            }

    async def _check_ai_providers(self) -> Dict[str, Any]:
        """Check AI provider API key configuration."""
        providers = {}

        # Check each provider
        provider_checks = [
            ("openai", settings.OPENAI_API_KEY),
            ("anthropic", settings.ANTHROPIC_API_KEY),
            ("deepseek", settings.DEEPSEEK_API_KEY),
            ("qwen", settings.QWEN_API_KEY),
            ("glm", settings.GLM_API_KEY),
        ]

        any_configured = False
        for name, key in provider_checks:
            is_configured = bool(key)
            providers[name] = {
                "configured": is_configured,
                "status": "available" if is_configured else "not_configured"
            }
            if is_configured:
                any_configured = True

        return {
            "healthy": any_configured,
            "status": "configured" if any_configured else "no_providers",
            "message": f"{sum(1 for p in providers.values() if p['configured'])} providers configured",
            "providers": providers
        }

    async def _evaluate_mode(self) -> None:
        """Evaluate and update service mode based on health checks."""
        old_mode = self._mode

        # Determine new mode
        if not self._ai_providers_healthy.get("healthy", False):
            # No AI providers - offline mode
            new_mode = ServiceMode.OFFLINE
        elif not self._redis_healthy or not self._event_bus_healthy:
            # Redis or event bus down - degraded mode
            new_mode = ServiceMode.DEGRADED
        else:
            # All healthy - normal mode
            new_mode = ServiceMode.NORMAL

        # Handle mode transition
        if new_mode != old_mode:
            self._mode = new_mode
            logger.warning(f"🔄 Service mode changed: {old_mode.value} -> {new_mode.value}")

            if new_mode == ServiceMode.DEGRADED and old_mode == ServiceMode.NORMAL:
                # Entering degraded mode
                await self._on_degradation()
            elif new_mode == ServiceMode.NORMAL and old_mode in [ServiceMode.DEGRADED, ServiceMode.OFFLINE]:
                # Recovering from degraded/offline mode
                await self._on_recovery()

    async def _on_degradation(self) -> None:
        """Handle entering degraded mode."""
        logger.warning("⚠️ Service entering degraded mode - limited functionality available")

        # Execute degradation callbacks
        for callback in self._degradation_callbacks:
            try:
                callback()
            except Exception as e:
                logger.error(f"Degradation callback error: {e}")

    async def _on_recovery(self) -> None:
        """Handle recovery from degraded mode."""
        logger.info("✅ Service recovering to normal mode - full functionality restored")

        # Execute recovery callbacks
        for callback in self._recovery_callbacks:
            try:
                callback()
            except Exception as e:
                logger.error(f"Recovery callback error: {e}")

    def on_degradation(self, callback: Callable) -> None:
        """Register callback for degradation event."""
        self._degradation_callbacks.append(callback)

    def on_recovery(self, callback: Callable) -> None:
        """Register callback for recovery event."""
        self._recovery_callbacks.append(callback)

    def on_health_check(self, callback: Callable) -> None:
        """Register callback for health check."""
        self._check_callbacks.append(callback)

    async def start_monitoring(self, interval_seconds: int = 30) -> None:
        """
        Start periodic health check monitoring.

        Args:
            interval_seconds: Health check interval in seconds
        """
        import asyncio

        logger.info(f"🔄 Starting health check monitoring (interval: {interval_seconds}s)")

        while True:
            try:
                await asyncio.sleep(interval_seconds)
                await self.perform_health_check()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Health check monitoring error: {e}")

    @property
    def mode(self) -> ServiceMode:
        """Get current service mode."""
        return self._mode

    @property
    def is_normal(self) -> bool:
        """Check if service is in normal mode."""
        return self._mode == ServiceMode.NORMAL

    @property
    def is_degraded(self) -> bool:
        """Check if service is in degraded mode."""
        return self._mode == ServiceMode.DEGRADED

    @property
    def is_offline(self) -> bool:
        """Check if service is in offline mode."""
        return self._mode == ServiceMode.OFFLINE

    @property
    def is_healthy(self) -> bool:
        """Check if service is healthy (normal or degraded)."""
        return self._mode in [ServiceMode.NORMAL, ServiceMode.DEGRADED]

    def get_status(self) -> Dict[str, Any]:
        """Get detailed service status."""
        return {
            "mode": self._mode.value,
            "is_healthy": self.is_healthy,
            "is_normal": self.is_normal,
            "is_degraded": self.is_degraded,
            "redis_healthy": self._redis_healthy,
            "event_bus_healthy": self._event_bus_healthy,
            "ai_providers": self._ai_providers_healthy,
            "last_check": self._last_check.isoformat() if self._last_check else None,
        }


class DegradedModeManager:
    """
    Manager for degraded mode operations.

    When the service is in degraded mode (no market data/news from event bus),
    it can still provide basic AI decision functionality using:
    - Static/cached data
    - Basic AI models without external data
    - Simplified decision logic
    """

    def __init__(self, health_service: HealthCheckService):
        self.health_service = health_service
        self._cached_market_data: Dict[str, Any] = {}
        self._cached_news: Dict[str, Any] = {}
        self._basic_mode_enabled = True

    def can_use_external_data(self) -> bool:
        """Check if external data (market/news) can be used."""
        return self.health_service.is_normal

    def can_use_ai(self) -> bool:
        """Check if AI functionality is available."""
        return not self.health_service.is_offline

    def get_fallback_data(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fallback data for a symbol in degraded mode."""
        return self._cached_market_data.get(symbol)

    def cache_market_data(self, symbol: str, data: Dict[str, Any]) -> None:
        """Cache market data for degraded mode fallback."""
        self._cached_market_data[symbol] = {
            **data,
            "cached_at": datetime.utcnow().isoformat()
        }

    def cache_news(self, stock_code: str, data: Dict[str, Any]) -> None:
        """Cache news data for degraded mode fallback."""
        self._cached_news[stock_code] = {
            **data,
            "cached_at": datetime.utcnow().isoformat()
        }

    def get_degraded_decision_prompt(self, symbol: str) -> str:
        """
        Generate a simplified decision prompt for degraded mode.

        When external data is unavailable, use basic AI analysis.
        """
        return f"""
基于有限信息对股票 {symbol} 进行基础分析。

注意：当前服务处于降级模式，无法获取实时行情和新闻数据。
请基于一般性投资原则和风险管理提供建议。

请提供：
1. 基础风险评估
2. 一般性投资建议
3. 风险提示

输出格式为JSON：
{{
    "action": "hold",
    "symbol": "{symbol}",
    "reasoning": "降级模式下的基础分析...",
    "confidence_score": 0.5,
    "risk_level": "medium"
}}
"""


# Global instance
_health_check_service: Optional[HealthCheckService] = None


def get_health_check_service() -> HealthCheckService:
    """Get or create the global health check service instance."""
    global _health_check_service
    if _health_check_service is None:
        _health_check_service = HealthCheckService()
    return _health_check_service
