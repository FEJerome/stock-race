"""Unit tests for EventBusManager."""
import pytest
from unittest.mock import Mock, patch, AsyncMock

from ai_service.services.event_bus_manager import EventBusManager
from ai_service.core.exceptions import ProviderError


class TestEventBusManager:
    """Test suite for EventBusManager."""

    def setup_method(self):
        """Reset singleton before each test."""
        EventBusManager._instance = None
        EventBusManager._initialized = False

    def test_singleton(self):
        """Test that EventBusManager is a singleton."""
        manager1 = EventBusManager()
        manager2 = EventBusManager()
        assert manager1 is manager2

    @pytest.mark.asyncio
    async def test_publish_not_initialized(self):
        """Test publishing when not initialized."""
        manager = EventBusManager()
        manager._initialized = False
        manager._producer = None

        with pytest.raises(ProviderError, match="EventBusManager not initialized"):
            await manager.publish("ai:decision:made", {})

    @pytest.mark.asyncio
    async def test_subscribe_not_initialized(self):
        """Test subscribing when not initialized."""
        manager = EventBusManager()
        manager._initialized = False

        with pytest.raises(ProviderError, match="EventBusManager not initialized"):
            await manager.subscribe("market:quote:realtime", Mock())

    @pytest.mark.asyncio
    async def test_health_check_not_initialized(self):
        """Test health check when not initialized."""
        manager = EventBusManager()
        manager._initialized = False

        result = await manager.health_check()
        assert result is False

    def test_is_initialized_property(self):
        """Test is_initialized property."""
        manager = EventBusManager()
        assert manager.is_initialized is False
        manager._initialized = True
        assert manager.is_initialized is True
