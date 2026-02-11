"""
Unit tests for Qwen adapter.
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
import httpx

from ai_service.adapters.qwen_adapter import QwenAdapter
from ai_service.adapters.base import ModelRequest, ModelResponse
from ai_service.core.exceptions import ProviderError
from ai_service.models.schemas import AIProvider


@pytest.fixture
def qwen_adapter():
    """Create a Qwen adapter instance."""
    return QwenAdapter()


@pytest.fixture
def mock_request():
    """Create a mock model request."""
    return ModelRequest(
        prompt="Test prompt",
        model="qwen-turbo",
        temperature=0.7,
        max_tokens=100,
        system_prompt="You are a helpful assistant",
    )


class TestQwenAdapter:
    """Test suite for Qwen adapter."""

    def test_init(self, qwen_adapter):
        """Test adapter initialization."""
        assert qwen_adapter.provider == AIProvider.QWEN
        assert qwen_adapter.default_model == "qwen-turbo"
        assert "qwen-turbo" in qwen_adapter.supported_models
        assert "qwen-plus" in qwen_adapter.supported_models
        assert "qwen-max" in qwen_adapter.supported_models
        assert qwen_adapter.is_initialized is False

    @pytest.mark.asyncio
    @patch("ai_service.adapters.qwen_adapter.settings")
    async def test_initialize_success(self, mock_settings, qwen_adapter):
        """Test successful initialization."""
        mock_settings.QWEN_API_KEY = "test-api-key"

        await qwen_adapter.initialize()

        assert qwen_adapter.is_initialized is True
        assert qwen_adapter.api_key == "test-api-key"
        assert qwen_adapter.client is not None

    @pytest.mark.asyncio
    @patch("ai_service.adapters.qwen_adapter.settings")
    async def test_initialize_missing_api_key(self, mock_settings, qwen_adapter):
        """Test initialization with missing API key."""
        mock_settings.QWEN_API_KEY = None

        with pytest.raises(ValueError, match="QWEN_API_KEY not set"):
            await qwen_adapter.initialize()

    @pytest.mark.asyncio
    async def test_generate_not_initialized(self, qwen_adapter, mock_request):
        """Test generate without initialization."""
        with pytest.raises(ProviderError, match="not initialized"):
            await qwen_adapter.generate(mock_request)

    @pytest.mark.asyncio
    @patch("ai_service.adapters.qwen_adapter.settings")
    async def test_generate_success(self, mock_settings, qwen_adapter, mock_request):
        """Test successful generation."""
        mock_settings.QWEN_API_KEY = "test-api-key"
        await qwen_adapter.initialize()

        # Mock the HTTP client response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "output": {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "Test response content"
                        }
                    }
                ]
            },
            "usage": {
                "input_tokens": 50,
                "output_tokens": 30,
                "total_tokens": 80
            }
        }

        qwen_adapter.client.post = AsyncMock(return_value=mock_response)

        response = await qwen_adapter.generate(mock_request)

        assert isinstance(response, ModelResponse)
        assert response.content == "Test response content"
        assert response.model == "qwen-turbo"
        assert response.provider == AIProvider.QWEN
        assert response.tokens_used == 80
        assert response.cost_usd is not None
        assert response.processing_time_ms >= 0

    @pytest.mark.asyncio
    @patch("ai_service.adapters.qwen_adapter.settings")
    async def test_generate_rate_limit(self, mock_settings, qwen_adapter, mock_request):
        """Test rate limit error handling."""
        mock_settings.QWEN_API_KEY = "test-api-key"
        await qwen_adapter.initialize()

        # Mock rate limit error
        mock_response = Mock()
        mock_response.status_code = 429
        mock_response.json.return_value = {
            "code": "Throttling.RateQuota",
            "message": "Rate limit exceeded"
        }

        error = httpx.HTTPStatusError(
            "Rate limit",
            request=Mock(),
            response=mock_response
        )
        qwen_adapter.client.post = AsyncMock(side_effect=error)

        with pytest.raises(ProviderError) as exc_info:
            await qwen_adapter.generate(mock_request)

        assert "rate limit" in str(exc_info.value).lower() or exc_info.value.error_code == "QWEN_RATE_LIMIT"

    @pytest.mark.asyncio
    @patch("ai_service.adapters.qwen_adapter.settings")
    async def test_close(self, mock_settings, qwen_adapter):
        """Test adapter close."""
        mock_settings.QWEN_API_KEY = "test-api-key"
        await qwen_adapter.initialize()

        await qwen_adapter.close()

        assert qwen_adapter.is_initialized is False
        assert qwen_adapter.client is None

    def test_calculate_cost(self, qwen_adapter):
        """Test cost calculation."""
        # Test with qwen-turbo
        cost = qwen_adapter.calculate_cost(1000, "qwen-turbo")
        assert cost is not None
        assert cost > 0

        # Test with unknown model
        cost = qwen_adapter.calculate_cost(1000, "unknown-model")
        assert cost is None
