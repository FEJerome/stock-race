"""
Tests for health check service and degraded mode functionality.

Implements tests for:
- C1-TAI-001: Health check SDK integration
- C1-TAI-002: Degraded operation mode
- C1-TAI-003: Auto-recovery mechanism
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime

import sys
from pathlib import Path

# Add paths for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / "src"))
sys.path.insert(0, str(project_root.parent / "infra" / "service-state" / "src"))
sys.path.insert(0, str(project_root.parent / "infra" / "event-bus" / "src"))

from ai_service.services.health_check_service import (
    HealthCheckService,
    DegradedModeManager,
    ServiceMode,
    get_health_check_service,
)


class TestHealthCheckService:
    """Test cases for HealthCheckService"""

    @pytest.fixture
    def health_service(self):
        """Create a fresh health check service instance."""
        # Reset singleton
        HealthCheckService._instance = None
        service = HealthCheckService()
        return service

    @pytest.mark.asyncio
    async def test_health_check_service_singleton(self):
        """Test that HealthCheckService is a singleton."""
        service1 = HealthCheckService()
        service2 = HealthCheckService()
        assert service1 is service2

    @pytest.mark.asyncio
    async def test_initial_mode_is_normal(self, health_service):
        """Test that initial mode is NORMAL."""
        assert health_service.mode == ServiceMode.NORMAL
        assert health_service.is_normal is True
        assert health_service.is_degraded is False
        assert health_service.is_offline is False
        assert health_service.is_healthy is True

    @pytest.mark.asyncio
    async def test_redis_health_check_unhealthy(self, health_service):
        """Test Redis health check when Redis is unavailable."""
        with patch("ai_service.services.health_check_service.get_redis_client", return_value=None):
            result = await health_service._check_redis()

        assert result["healthy"] is False
        assert result["status"] == "not_initialized"

    @pytest.mark.asyncio
    async def test_redis_health_check_healthy(self, health_service):
        """Test Redis health check when Redis is available."""
        mock_redis = AsyncMock()
        mock_redis.ping = AsyncMock()

        with patch("ai_service.services.health_check_service.get_redis_client", return_value=mock_redis):
            result = await health_service._check_redis()

        assert result["healthy"] is True
        assert result["status"] == "connected"

    @pytest.mark.asyncio
    async def test_event_bus_health_check_without_redis(self, health_service):
        """Test event bus health check when Redis is down."""
        health_service._redis_healthy = False
        result = await health_service._check_event_bus()

        assert result["healthy"] is False
        assert result["status"] == "redis_unavailable"

    @pytest.mark.asyncio
    async def test_ai_providers_health_check_no_providers(self, health_service):
        """Test AI providers check when no providers are configured."""
        with patch("ai_service.services.health_check_service.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            mock_settings.ANTHROPIC_API_KEY = None
            mock_settings.DEEPSEEK_API_KEY = None
            mock_settings.QWEN_API_KEY = None
            mock_settings.GLM_API_KEY = None

            result = await health_service._check_ai_providers()

        assert result["healthy"] is False
        assert result["status"] == "no_providers"

    @pytest.mark.asyncio
    async def test_ai_providers_health_check_with_providers(self, health_service):
        """Test AI providers check when providers are configured."""
        with patch("ai_service.services.health_check_service.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.ANTHROPIC_API_KEY = None
            mock_settings.DEEPSEEK_API_KEY = None
            mock_settings.QWEN_API_KEY = None
            mock_settings.GLM_API_KEY = None

            result = await health_service._check_ai_providers()

        assert result["healthy"] is True
        assert result["status"] == "configured"
        assert result["providers"]["openai"]["configured"] is True

    @pytest.mark.asyncio
    async def test_mode_transition_to_degraded(self, health_service):
        """Test transition from NORMAL to DEGRADED mode."""
        # Setup: Initially normal
        assert health_service.mode == ServiceMode.NORMAL

        # Simulate Redis failure
        health_service._redis_healthy = False
        health_service._event_bus_healthy = False
        health_service._ai_providers_healthy = {"healthy": True}

        # Track callback
        degradation_called = False
        def on_degradation():
            nonlocal degradation_called
            degradation_called = True

        health_service.on_degradation(on_degradation)

        # Evaluate mode
        await health_service._evaluate_mode()

        # Verify mode changed
        assert health_service.mode == ServiceMode.DEGRADED
        assert health_service.is_degraded is True
        assert degradation_called is True

    @pytest.mark.asyncio
    async def test_mode_transition_to_offline(self, health_service):
        """Test transition to OFFLINE mode when no AI providers."""
        # Simulate no AI providers
        health_service._ai_providers_healthy = {"healthy": False}

        await health_service._evaluate_mode()

        assert health_service.mode == ServiceMode.OFFLINE
        assert health_service.is_offline is True
        assert health_service.is_healthy is False  # OFFLINE is unhealthy (no AI capability)

    @pytest.mark.asyncio
    async def test_auto_recovery_to_normal(self, health_service):
        """Test auto-recovery from DEGRADED to NORMAL mode."""
        # Start in degraded mode
        health_service._mode = ServiceMode.DEGRADED
        health_service._redis_healthy = False

        # Track callback
        recovery_called = False
        def on_recovery():
            nonlocal recovery_called
            recovery_called = True

        health_service.on_recovery(on_recovery)

        # Simulate Redis recovery
        health_service._redis_healthy = True
        health_service._event_bus_healthy = True
        health_service._ai_providers_healthy = {"healthy": True}

        await health_service._evaluate_mode()

        # Verify recovery
        assert health_service.mode == ServiceMode.NORMAL
        assert health_service.is_normal is True
        assert recovery_called is True

    @pytest.mark.asyncio
    async def test_get_status(self, health_service):
        """Test getting service status."""
        status = health_service.get_status()

        assert "mode" in status
        assert "is_healthy" in status
        assert "is_normal" in status
        assert "is_degraded" in status
        assert "redis_healthy" in status
        assert "event_bus_healthy" in status
        assert "ai_providers" in status


class TestDegradedModeManager:
    """Test cases for DegradedModeManager"""

    @pytest.fixture
    def mock_health_service(self):
        """Create a mock health service."""
        service = Mock()
        service.is_normal = True
        service.is_degraded = False
        service.is_offline = False
        return service

    @pytest.fixture
    def degraded_manager(self, mock_health_service):
        """Create a degraded mode manager."""
        return DegradedModeManager(mock_health_service)

    def test_can_use_external_data_normal_mode(self, degraded_manager, mock_health_service):
        """Test external data access in normal mode."""
        mock_health_service.is_normal = True
        assert degraded_manager.can_use_external_data() is True

    def test_can_use_external_data_degraded_mode(self, degraded_manager, mock_health_service):
        """Test external data access in degraded mode."""
        mock_health_service.is_normal = False
        mock_health_service.is_degraded = True
        assert degraded_manager.can_use_external_data() is False

    def test_can_use_ai_normal_mode(self, degraded_manager, mock_health_service):
        """Test AI access in normal mode."""
        mock_health_service.is_offline = False
        assert degraded_manager.can_use_ai() is True

    def test_can_use_ai_offline_mode(self, degraded_manager, mock_health_service):
        """Test AI access in offline mode."""
        mock_health_service.is_offline = True
        assert degraded_manager.can_use_ai() is False

    def test_cache_and_get_market_data(self, degraded_manager):
        """Test caching and retrieving market data."""
        symbol = "000001.SZ"
        data = {"price": 10.5, "volume": 1000000}

        degraded_manager.cache_market_data(symbol, data)
        cached = degraded_manager.get_fallback_data(symbol)

        assert cached is not None
        assert cached["price"] == 10.5
        assert cached["volume"] == 1000000
        assert "cached_at" in cached

    def test_get_fallback_data_not_found(self, degraded_manager):
        """Test getting non-existent fallback data."""
        result = degraded_manager.get_fallback_data("999999.SZ")
        assert result is None

    def test_get_degraded_decision_prompt(self, degraded_manager):
        """Test degraded mode decision prompt generation."""
        symbol = "000001.SZ"
        prompt = degraded_manager.get_degraded_decision_prompt(symbol)

        assert symbol in prompt
        assert "降级模式" in prompt
        assert "action" in prompt
        assert "confidence_score" in prompt


class TestHealthCheckIntegration:
    """Integration tests for health check functionality"""

    @pytest.mark.asyncio
    async def test_full_health_check_workflow(self):
        """Test complete health check workflow."""
        # Reset singleton
        HealthCheckService._instance = None
        service = HealthCheckService()

        # Mock all dependencies
        mock_redis = AsyncMock()
        mock_redis.ping = AsyncMock()

        with patch("ai_service.services.health_check_service.get_redis_client", return_value=mock_redis):
            with patch("ai_service.services.health_check_service.settings") as mock_settings:
                mock_settings.OPENAI_API_KEY = "test-key"
                mock_settings.ANTHROPIC_API_KEY = None
                mock_settings.DEEPSEEK_API_KEY = None
                mock_settings.QWEN_API_KEY = None
                mock_settings.GLM_API_KEY = None

                results = await service.perform_health_check()

        assert "timestamp" in results
        assert "overall" in results
        assert "checks" in results
        assert "mode" in results
        assert results["checks"]["redis"]["healthy"] is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
