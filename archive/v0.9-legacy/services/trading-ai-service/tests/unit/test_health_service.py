"""
Tests for Trading AI Health Service using Infra SDK.

Implements tests for:
- C1-TAI-001: 接入健康检查SDK (infra/health-check)
- C1-TAI-002: 实现降级运行模式
- C1-TAI-003: 实现自动恢复机制
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
sys.path.insert(0, str(project_root.parent / "infra" / "health-check" / "src"))
sys.path.insert(0, str(project_root.parent / "infra" / "event-bus" / "src"))

from ai_service.services.health_service import (
    TradingAIHealthService,
    DegradedModeManager,
    ServiceMode,
    get_health_service,
)
from health_check import HealthStatus


class TestTradingAIHealthService:
    """Test cases for TradingAIHealthService using Infra SDK"""

    @pytest.fixture
    def health_service(self):
        """Create a fresh health service instance."""
        # Reset singleton
        TradingAIHealthService._instance = None
        service = TradingAIHealthService()
        # Mock the checker
        service.checker = Mock()
        service.checker.add_dependency = Mock()
        service.checker.check_health = AsyncMock()
        service.checker.get_health = Mock(return_value=None)
        service.checker.to_dict = Mock(return_value={
            "service": "trading-ai-service",
            "status": "healthy",
            "dependencies": {}
        })
        service.checker.start_periodic_checks = AsyncMock()
        service.checker.stop_periodic_checks = Mock()
        return service

    def test_health_service_singleton(self):
        """Test that TradingAIHealthService is a singleton."""
        service1 = TradingAIHealthService()
        service2 = TradingAIHealthService()
        assert service1 is service2

    def test_initial_mode_is_normal(self, health_service):
        """Test that initial mode is NORMAL."""
        assert health_service.mode == ServiceMode.NORMAL
        assert health_service.is_normal is True
        assert health_service.is_degraded is False
        assert health_service.is_offline is False

    @pytest.mark.asyncio
    async def test_initialize_registers_dependencies(self, health_service):
        """Test that initialize registers all dependencies."""
        with patch("ai_service.services.health_service.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-key"

            await health_service.initialize()

        # Should register 4 dependencies
        assert health_service.checker.add_dependency.call_count == 4
        health_service.checker.start_periodic_checks.assert_called_once()

    def test_check_ai_api_with_providers(self, health_service):
        """Test AI API check when providers are configured."""
        with patch("ai_service.services.health_service.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.ANTHROPIC_API_KEY = None
            mock_settings.DEEPSEEK_API_KEY = None
            mock_settings.QWEN_API_KEY = None
            mock_settings.GLM_API_KEY = None

            result = health_service._check_ai_api()

        assert result is True

    def test_check_ai_api_without_providers(self, health_service):
        """Test AI API check when no providers are configured."""
        with patch("ai_service.services.health_service.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            mock_settings.ANTHROPIC_API_KEY = None
            mock_settings.DEEPSEEK_API_KEY = None
            mock_settings.QWEN_API_KEY = None
            mock_settings.GLM_API_KEY = None

            result = health_service._check_ai_api()

        assert result is False

    @pytest.mark.asyncio
    async def test_mode_transition_to_degraded(self, health_service):
        """Test transition from NORMAL to DEGRADED mode."""
        # Setup: Initially normal
        assert health_service.mode == ServiceMode.NORMAL

        # Track callback
        degradation_called = False
        def on_degradation():
            nonlocal degradation_called
            degradation_called = True

        health_service.on_degradation(on_degradation)

        # Simulate entering degraded mode
        health_service._mode = ServiceMode.DEGRADED

        # Verify mode changed
        assert health_service.mode == ServiceMode.DEGRADED
        assert health_service.is_degraded is True

    @pytest.mark.asyncio
    async def test_auto_recovery(self, health_service):
        """Test recovery from DEGRADED to NORMAL mode."""
        # Start in degraded mode
        health_service._mode = ServiceMode.DEGRADED

        # Track callback
        recovery_called = False
        def on_recovery():
            nonlocal recovery_called
            recovery_called = True

        health_service.on_recovery(on_recovery)

        # Simulate recovery
        health_service._mode = ServiceMode.NORMAL

        # Verify recovery
        assert health_service.mode == ServiceMode.NORMAL
        assert health_service.is_normal is True

    def test_get_status(self, health_service):
        """Test getting service status."""
        status = health_service.get_status()

        assert "mode" in status
        assert "is_healthy" in status
        assert "is_normal" in status
        assert "is_degraded" in status
        assert "health_check" in status

    def test_get_health_dict(self, health_service):
        """Test getting health dict for /health endpoint."""
        health_dict = health_service.get_health_dict()

        assert health_dict == {
            "service": "trading-ai-service",
            "status": "healthy",
            "dependencies": {}
        }


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

    def test_get_degraded_prompt(self, degraded_manager):
        """Test degraded mode decision prompt generation."""
        symbol = "000001.SZ"
        prompt = degraded_manager.get_degraded_prompt(symbol)

        assert symbol in prompt
        assert "降级模式" in prompt
        assert "action" in prompt
        assert "confidence_score" in prompt


class TestServiceMode:
    """Test cases for ServiceMode enum"""

    def test_service_mode_values(self):
        """Test ServiceMode enum values."""
        assert ServiceMode.NORMAL.value == "normal"
        assert ServiceMode.DEGRADED.value == "degraded"
        assert ServiceMode.OFFLINE.value == "offline"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
