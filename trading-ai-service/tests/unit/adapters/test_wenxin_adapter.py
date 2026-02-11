"""
Unit tests for Wenxin adapter.
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
import httpx

from ai_service.adapters.wenxin_adapter import WenxinAdapter
from ai_service.adapters.base import ModelRequest, ModelResponse
from ai_service.core.exceptions import ProviderError
from ai_service.models.schemas import AIProvider


@pytest.fixture
def wenxin_adapter():
    """Create a Wenxin adapter instance."""
    return WenxinAdapter()


@pytest.fixture
def mock_request():
    """Create a mock model request."""
    return ModelRequest(
        prompt="Test prompt",
        model="ernie-bot",
        temperature=0.7,
        max_tokens=100,
        system_prompt="You are a helpful assistant",
    )


class TestWenxinAdapter:
    """Test suite for Wenxin adapter."""

    def test_init(self, wenxin_adapter):
        """Test adapter initialization."""
        assert wenxin_adapter.provider == AIProvider.WENXIN
        assert wenxin_adapter.default_model == "ernie-bot"
        assert "ernie-bot" in wenxin_adapter.supported_models
        assert "ernie-bot-turbo" in wenxin_adapter.supported_models
        assert "ernie-bot-4" in wenxin_adapter.supported_models
        assert wenxin_adapter.is_initialized is False

    @pytest.mark.asyncio
    @patch("ai_service.adapters.wenxin_adapter.settings")
    async def test_initialize_success(self, mock_settings, wenxin_adapter):
        """Test successful initialization."""
        mock_settings.WENXIN_API_KEY = "test-api-key"
        mock_settings.WENXIN_SECRET_KEY = "test-secret-key"

        await wenxin_adapter.initialize()

        assert wenxin_adapter.is_initialized is True
        assert wenxin_adapter.api_key == "test-api-key"
        assert wenxin_adapter.client is not None

    @pytest.mark.asyncio
    @patch("ai_service.adapters.wenxin_adapter.settings")
    async def test_initialize_missing_api_key(self, mock_settings, wenxin_adapter):
        """Test initialization with missing API key."""
        mock_settings.WENXIN_API_KEY = None
        mock_settings.WENXIN_SECRET_KEY = "test-secret-key"

        with pytest.raises(ValueError, match="WENXIN_API_KEY not set"):
            await wenxin_adapter.initialize()

    @pytest.mark.asyncio
    async def test_generate_not_initialized(self, wenxin_adapter, mock_request):
        """Test generate without initialization."""
        with pytest.raises(ProviderError, match="not initialized"):
            await wenxin_adapter.generate(mock_request)

    @pytest.mark.asyncio
    @patch("ai_service.adapters.wenxin_adapter.settings")
    async def test_generate_success(self, mock_settings, wenxin_adapter, mock_request):
        """Test successful generation."""
        mock_settings.WENXIN_API_KEY = "test-api-key"
        mock_settings.WENXIN_SECRET_KEY = "test-secret-key"
        await wenxin_adapter.initialize()

        # Mock the HTTP client response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "test-id",
            "object": "chat.completion",
            "created": 1234567890,
            "result": "Test response content",
            "usage": {
                "prompt_tokens": 50,
                "completion_tokens": 30,
                "total_tokens": 80
            }
        }

        wenxin_adapter.client.post = AsyncMock(return_value=mock_response)

        response = await wenxin_adapter.generate(mock_request)

        assert isinstance(response, ModelResponse)
        assert response.content == "Test response content"
        assert response.model == "ernie-bot"
        assert response.provider == AIProvider.WENXIN
        assert response.tokens_used == 80
        assert response.cost_usd is not None
        assert response.processing_time_ms >= 0

    @pytest.mark.asyncio
    @patch("ai_service.adapters.wenxin_adapter.settings")
    async def test_generate_rate_limit(self, mock_settings, wenxin_adapter, mock_request):
        """Test rate limit error handling."""
        mock_settings.WENXIN_API_KEY = "test-api-key"
        mock_settings.WENXIN_SECRET_KEY = "test-secret-key"
        await wenxin_adapter.initialize()

        # Mock rate limit error
        mock_response = Mock()
        mock_response.status_code = 429
        mock_response.json.return_value = {
            "error_code": 18,
            "error_msg": "QPS limit reached"
        }

        error = httpx.HTTPStatusError(
            "Rate limit",
            request=Mock(),
            response=mock_response
        )
        wenxin_adapter.client.post = AsyncMock(side_effect=error)

        with pytest.raises(ProviderError) as exc_info:
            await wenxin_adapter.generate(mock_request)

        assert "rate limit" in str(exc_info.value).lower() or exc_info.value.error_code == "WENXIN_RATE_LIMIT"

    @pytest.mark.asyncio
    @patch("ai_service.adapters.wenxin_adapter.settings")
    async def test_generate_auth_error(self, mock_settings, wenxin_adapter, mock_request):
        """Test authentication error handling."""
        mock_settings.WENXIN_API_KEY = "test-api-key"
        mock_settings.WENXIN_SECRET_KEY = "test-secret-key"
        await wenxin_adapter.initialize()

        # Mock auth error
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.json.return_value = {
            "error_code": 1,
            "error_msg": "Authentication failed"
        }

        error = httpx.HTTPStatusError(
            "Auth failed",
            request=Mock(),
            response=mock_response
        )
        wenxin_adapter.client.post = AsyncMock(side_effect=error)

        with pytest.raises(ProviderError) as exc_info:
            await wenxin_adapter.generate(mock_request)

        assert "auth" in str(exc_info.value).lower() or exc_info.value.error_code == "WENXIN_AUTH_ERROR"

    @pytest.mark.asyncio
    @patch("ai_service.adapters.wenxin_adapter.settings")
    async def test_generate_timeout(self, mock_settings, wenxin_adapter, mock_request):
        """Test timeout error handling."""
        mock_settings.WENXIN_API_KEY = "test-api-key"
        mock_settings.WENXIN_SECRET_KEY = "test-secret-key"
        await wenxin_adapter.initialize()

        wenxin_adapter.client.post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))

        with pytest.raises(ProviderError) as exc_info:
            await wenxin_adapter.generate(mock_request)

        assert "timeout" in str(exc_info.value).lower() or exc_info.value.error_code == "WENXIN_TIMEOUT"

    @pytest.mark.asyncio
    @patch("ai_service.adapters.wenxin_adapter.settings")
    async def test_close(self, mock_settings, wenxin_adapter):
        """Test adapter close."""
        mock_settings.WENXIN_API_KEY = "test-api-key"
        mock_settings.WENXIN_SECRET_KEY = "test-secret-key"
        await wenxin_adapter.initialize()

        await wenxin_adapter.close()

        assert wenxin_adapter.is_initialized is False
        assert wenxin_adapter.client is None

    def test_calculate_cost(self, wenxin_adapter):
        """Test cost calculation."""
        # Test with ernie-bot
        cost = wenxin_adapter.calculate_cost(1000, "ernie-bot")
        assert cost is not None
        assert cost > 0

        # Test with ernie-bot-turbo
        cost = wenxin_adapter.calculate_cost(1000, "ernie-bot-turbo")
        assert cost is not None
        assert cost > 0

        # Test with ernie-bot-4
        cost = wenxin_adapter.calculate_cost(1000, "ernie-bot-4")
        assert cost is not None
        assert cost > 0

        # Test with unknown model
        cost = wenxin_adapter.calculate_cost(1000, "unknown-model")
        assert cost is None

    def test_get_model_info(self, wenxin_adapter):
        """Test model info retrieval."""
        info = wenxin_adapter.get_model_info("ernie-bot")

        assert info["provider"] == "wenxin"
        assert info["model"] == "ernie-bot"
        assert info["supported"] is True
        assert "max_tokens" in info
        assert "context_window" in info

    def test_validate_request(self, wenxin_adapter):
        """Test request validation."""
        # Valid request
        valid_request = ModelRequest(prompt="Test", model="ernie-bot")
        wenxin_adapter.validate_request(valid_request)  # Should not raise

        # Empty prompt
        invalid_request = ModelRequest(prompt="", model="ernie-bot")
        with pytest.raises(ValueError, match="empty"):
            wenxin_adapter.validate_request(invalid_request)

        # Invalid temperature
        invalid_temp = ModelRequest(prompt="Test", model="ernie-bot", temperature=3.0)
        with pytest.raises(ValueError, match="Temperature"):
            wenxin_adapter.validate_request(invalid_temp)

        # Invalid max_tokens
        invalid_tokens = ModelRequest(prompt="Test", model="ernie-bot", max_tokens=0)
        with pytest.raises(ValueError, match="positive"):
            wenxin_adapter.validate_request(invalid_tokens)

    @pytest.mark.asyncio
    @patch("ai_service.adapters.wenxin_adapter.settings")
    async def test_generate_with_optional_params(self, mock_settings, wenxin_adapter):
        """Test generation with optional parameters."""
        mock_settings.WENXIN_API_KEY = "test-api-key"
        mock_settings.WENXIN_SECRET_KEY = "test-secret-key"
        await wenxin_adapter.initialize()

        request = ModelRequest(
            prompt="Test prompt",
            model="ernie-bot",
            temperature=0.5,
            max_tokens=200,
            top_p=0.9,
        )

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "result": "Response",
            "usage": {"total_tokens": 100}
        }

        wenxin_adapter.client.post = AsyncMock(return_value=mock_response)

        response = await wenxin_adapter.generate(request)

        # Verify the call was made
        assert wenxin_adapter.client.post.called
