"""
Unit tests for AdapterFactory.

Tests for:
- AdapterFactory.create_adapter
- AdapterFactory.get_adapter
- Provider configuration validation
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

import sys
from pathlib import Path

# Add paths for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / "src"))

from ai_service.adapters.base import AdapterFactory
from ai_service.models.schemas import AIProvider


class TestAdapterFactory:
    """Test cases for AdapterFactory."""

    def test_create_adapter_openai(self):
        """Test creating OpenAI adapter."""
        with patch("ai_service.adapters.openai_adapter.OpenAIAdapter") as mock_adapter:
            mock_instance = MagicMock()
            mock_adapter.return_value = mock_instance

            adapter = AdapterFactory._create_adapter(AIProvider.OPENAI)

            mock_adapter.assert_called_once()
            assert adapter == mock_instance

    def test_create_adapter_deepseek(self):
        """Test creating DeepSeek adapter."""
        with patch("ai_service.adapters.deepseek_adapter.DeepSeekAdapter") as mock_adapter:
            mock_instance = MagicMock()
            mock_adapter.return_value = mock_instance

            adapter = AdapterFactory._create_adapter(AIProvider.DEEPSEEK)

            mock_adapter.assert_called_once()
            assert adapter == mock_instance

    def test_create_adapter_claude(self):
        """Test creating Claude adapter."""
        with patch("ai_service.adapters.claude_adapter.ClaudeAdapter") as mock_adapter:
            mock_instance = MagicMock()
            mock_adapter.return_value = mock_instance

            adapter = AdapterFactory._create_adapter(AIProvider.CLAUDE)

            mock_adapter.assert_called_once()
            assert adapter == mock_instance

    def test_create_adapter_qwen(self):
        """Test creating Qwen adapter."""
        with patch("ai_service.adapters.qwen_adapter.QwenAdapter") as mock_adapter:
            mock_instance = MagicMock()
            mock_adapter.return_value = mock_instance

            adapter = AdapterFactory._create_adapter(AIProvider.QWEN)

            mock_adapter.assert_called_once()
            assert adapter == mock_instance

    def test_create_adapter_glm(self):
        """Test creating GLM adapter."""
        with patch("ai_service.adapters.glm_adapter.GLMAdapter") as mock_adapter:
            mock_instance = MagicMock()
            mock_adapter.return_value = mock_instance

            adapter = AdapterFactory._create_adapter(AIProvider.GLM)

            mock_adapter.assert_called_once()
            assert adapter == mock_instance

    def test_create_adapter_moonshot(self):
        """Test creating Moonshot adapter."""
        with patch("ai_service.adapters.moonshot_adapter.MoonshotAdapter") as mock_adapter:
            mock_instance = MagicMock()
            mock_adapter.return_value = mock_instance

            adapter = AdapterFactory._create_adapter(AIProvider.MOONSHOT)

            mock_adapter.assert_called_once()
            assert adapter == mock_instance

    def test_create_adapter_wenxin(self):
        """Test creating Wenxin adapter."""
        with patch("ai_service.adapters.wenxin_adapter.WenxinAdapter") as mock_adapter:
            mock_instance = MagicMock()
            mock_adapter.return_value = mock_instance

            adapter = AdapterFactory._create_adapter(AIProvider.WENXIN)

            mock_adapter.assert_called_once()
            assert adapter == mock_instance

    @pytest.mark.asyncio
    async def test_get_adapter_from_enum(self):
        """Test getting adapter from enum."""
        import asyncio

        with patch("ai_service.adapters.openai_adapter.OpenAIAdapter") as mock_adapter:
            mock_instance = MagicMock()
            mock_instance.is_initialized = True
            # Make initialize an async mock
            mock_instance.initialize = AsyncMock()
            mock_adapter.return_value = mock_instance

            # Clear cache first
            AdapterFactory._adapters.clear()

            adapter = await AdapterFactory.get_adapter(AIProvider.OPENAI)

            assert adapter == mock_instance

    def test_get_adapter_invalid_provider(self):
        """Test getting adapter with invalid provider."""
        with pytest.raises(ValueError):
            AdapterFactory._create_adapter("invalid_provider")

    @pytest.mark.asyncio
    async def test_close_all(self):
        """Test closing all adapters."""
        import asyncio

        mock_instance = MagicMock()
        # Make close an async mock
        mock_instance.close = AsyncMock()

        # Add mock adapter to cache
        AdapterFactory._adapters[AIProvider.OPENAI] = mock_instance

        # Close all
        await AdapterFactory.close_all()

        mock_instance.close.assert_called_once()
        assert len(AdapterFactory._adapters) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
