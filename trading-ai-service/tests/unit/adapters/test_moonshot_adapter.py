"""
Unit tests for Moonshot adapter.
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
import httpx

from ai_service.adapters.moonshot_adapter import MoonshotAdapter
from ai_service.adapters.base import ModelRequest, ModelResponse
from ai_service.core.exceptions import ProviderError
from ai_service.models.schemas import AIProvider


@pytest.fixture
def moonshot_adapter():
    """Create a Moonshot adapter instance."""
    return MoonshotAdapter()


@pytest.fixture
def mock_request():
    """Create a mock model request."""
    return ModelRequest(
        prompt="Test prompt",
        model="moonshot-v1-8k",
        temperature=0.7,
        max_tokens=100,
        system_prompt="You are a helpful assistant",
    )


class TestMoonshotAdapter:
    """Test suite for Moonshot adapter."""

    def test_init(self, moonshot_adapter):
        """Test adapter initialization."""
        assert moonshot_adapter.provider == AIProvider.MOONSHOT
        assert moonshot_adapter.default_model == "moonshot-v1-8k"
        assert "moonshot-v1-8k" in moonshot_adapter.supported_models
        assert "moonshot-v1-32k" in moonshot_adapter.supported_models
        assert "moonshot-v1-128k" in moonshot_adapter.supported_models
        assert moonshot_adapter.is_initialized is False

    @pytest.mark.asyncio
    @patch("ai_service.adapters.moonshot_adapter.settings")
    async def test_initialize_success(self, mock_settings, moonshot_adapter):
        """Test successful initialization."""
        mock_settings.MOONSHOT_API_KEY = "test-api-key"

        await moonshot_adapter.initialize()

        assert moonshot_adapter.is_initialized is True
        assert moonshot_adapter.api_key == "test-api-key"
        assert moonshot_adapter.client is not None

    @pytest.mark.asyncio
    @patch("ai_service.adapters.moonshot_adapter.settings")
    async def test_initialize_missing_api_key(self, mock_settings, moonshot_adapter):
        """Test initialization with missing API key."""
        mock_settings.MOONSHOT_API_KEY = None

        with pytest.raises(ValueError, match="MOONSHOT_API_KEY not set"):
            await moonshot_adapter.initialize()

    @pytest.mark.asyncio
    async def test_generate_not_initialized(self, moonshot_adapter, mock_request):
        """Test generate without initialization."""
        with pytest.raises(ProviderError, match="not initialized"):
            await moonshot_adapter.generate(mock_request)

    @pytest.mark.asyncio
    @patch("ai_service.adapters.moonshot_adapter.settings")
    async def test_generate_success(self, mock_settings, moonshot_adapter, mock_request):
        """Test successful generation."""
        mock_settings.MOONSHOT_API_KEY = "test-api-key"
        await moonshot_adapter.initialize()

        # Mock the HTTP client response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "test-id",
            "object": "chat.completion",
            "created": 1234567890,
            "model": "moonshot-v1-8k",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "Test response content"
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": 50,
                "completion_tokens": 30,
                "total_tokens": 80
            }
        }

        moonshot_adapter.client.post = AsyncMock(return_value=mock_response)

        response = await moonshot_adapter.generate(mock_request)

        assert isinstance(response, ModelResponse)
        assert response.content == "Test response content"
        assert response.model == "moonshot-v1-8k"
        assert response.provider == AIProvider.MOONSHOT
        assert response.tokens_used == 80
        assert response.cost_usd is not None
        assert response.processing_time_ms >= 0

    @pytest.mark.asyncio
    @patch("ai_service.adapters.moonshot_adapter.settings")
    async def test_generate_rate_limit(self, mock_settings, moonshot_adapter, mock_request):
        """Test rate limit error handling."""
        mock_settings.MOONSHOT_API_KEY = "test-api-key"
        await moonshot_adapter.initialize()

        # Mock rate limit error
        mock_response = Mock()
        mock_response.status_code = 429
        mock_response.json.return_value = {
            "error": {
                "message": "Rate limit exceeded",
                "type": "rate_limit_error"
            }
        }

        error = httpx.HTTPStatusError(
            "Rate limit",
            request=Mock(),
            response=mock_response
        )
        moonshot_adapter.client.post = AsyncMock(side_effect=error)

        with pytest.raises(ProviderError) as exc_info:
            await moonshot_adapter.generate(mock_request)

        assert "rate limit" in str(exc_info.value).lower() or exc_info.value.error_code == "MOONSHOT_RATE_LIMIT"

    @pytest.mark.asyncio
    @patch("ai_service.adapters.moonshot_adapter.settings")
    async def test_generate_auth_error(self, mock_settings, moonshot_adapter, mock_request):
        """Test authentication error handling."""
        mock_settings.MOONSHOT_API_KEY = "test-api-key"
        await moonshot_adapter.initialize()

        # Mock auth error
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.json.return_value = {
            "error": {
                "message": "Invalid API key",
                "type": "authentication_error"
            }
        }

        error = httpx.HTTPStatusError(
            "Auth failed",
            request=Mock(),
            response=mock_response
        )
        moonshot_adapter.client.post = AsyncMock(side_effect=error)

        with pytest.raises(ProviderError) as exc_info:
            await moonshot_adapter.generate(mock_request)

        assert "auth" in str(exc_info.value).lower() or exc_info.value.error_code == "MOONSHOT_AUTH_ERROR"

    @pytest.mark.asyncio
    @patch("ai_service.adapters.moonshot_adapter.settings")
    async def test_generate_timeout(self, mock_settings, moonshot_adapter, mock_request):
        """Test timeout error handling."""
        mock_settings.MOONSHOT_API_KEY = "test-api-key"
        await moonshot_adapter.initialize()

        moonshot_adapter.client.post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))

        with pytest.raises(ProviderError) as exc_info:
            await moonshot_adapter.generate(mock_request)

        assert "timeout" in str(exc_info.value).lower() or exc_info.value.error_code == "MOONSHOT_TIMEOUT"

    @pytest.mark.asyncio
    @patch("ai_service.adapters.moonshot_adapter.settings")
    async def test_close(self, mock_settings, moonshot_adapter):
        """Test adapter close."""
        mock_settings.MOONSHOT_API_KEY = "test-api-key"
        await moonshot_adapter.initialize()

        await moonshot_adapter.close()

        assert moonshot_adapter.is_initialized is False
        assert moonshot_adapter.client is None

    def test_calculate_cost(self, moonshot_adapter):
        """Test cost calculation."""
        # Test with moonshot-v1-8k
        cost = moonshot_adapter.calculate_cost(1000, "moonshot-v1-8k")
        assert cost is not None
        assert cost > 0

        # Test with moonshot-v1-32k
        cost = moonshot_adapter.calculate_cost(1000, "moonshot-v1-32k")
        assert cost is not None
        assert cost > 0

        # Test with moonshot-v1-128k
        cost = moonshot_adapter.calculate_cost(1000, "moonshot-v1-128k")
        assert cost is not None
        assert cost > 0

        # Test with unknown model
        cost = moonshot_adapter.calculate_cost(1000, "unknown-model")
        assert cost is None

    def test_get_model_info(self, moonshot_adapter):
        """Test model info retrieval."""
        info = moonshot_adapter.get_model_info("moonshot-v1-8k")

        assert info["provider"] == "moonshot"
        assert info["model"] == "moonshot-v1-8k"
        assert info["supported"] is True
        assert "max_tokens" in info
        assert "context_window" in info

    def test_validate_request(self, moonshot_adapter):
        """Test request validation."""
        # Valid request
        valid_request = ModelRequest(prompt="Test", model="moonshot-v1-8k")
        moonshot_adapter.validate_request(valid_request)  # Should not raise

        # Empty prompt
        invalid_request = ModelRequest(prompt="", model="moonshot-v1-8k")
        with pytest.raises(ValueError, match="empty"):
            moonshot_adapter.validate_request(invalid_request)

        # Invalid temperature
        invalid_temp = ModelRequest(prompt="Test", model="moonshot-v1-8k", temperature=3.0)
        with pytest.raises(ValueError, match="Temperature"):
            moonshot_adapter.validate_request(invalid_temp)

        # Invalid max_tokens
        invalid_tokens = ModelRequest(prompt="Test", model="moonshot-v1-8k", max_tokens=0)
        with pytest.raises(ValueError, match="positive"):
            moonshot_adapter.validate_request(invalid_tokens)

    @pytest.mark.asyncio
    @patch("ai_service.adapters.moonshot_adapter.settings")
    async def test_generate_with_optional_params(self, mock_settings, moonshot_adapter):
        """Test generation with optional parameters."""
        mock_settings.MOONSHOT_API_KEY = "test-api-key"
        await moonshot_adapter.initialize()

        request = ModelRequest(
            prompt="Test prompt",
            model="moonshot-v1-8k",
            temperature=0.5,
            max_tokens=200,
            top_p=0.9,
            stop_sequences=["STOP"],
        )

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [
                {"message": {"role": "assistant", "content": "Response"}}
            ],
            "usage": {"total_tokens": 100}
        }

        moonshot_adapter.client.post = AsyncMock(return_value=mock_response)

        response = await moonshot_adapter.generate(request)

        # Verify the call was made with correct parameters
        call_args = moonshot_adapter.client.post.call_args
        assert call_args[1]["json"]["temperature"] == 0.5
        assert call_args[1]["json"]["max_tokens"] == 200
        assert call_args[1]["json"]["top_p"] == 0.9
