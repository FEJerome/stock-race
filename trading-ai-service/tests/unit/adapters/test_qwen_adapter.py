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
        assert response.processing_time_ms >= 0  # May be 0 in fast test environment

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
    async def test_generate_auth_error(self, mock_settings, qwen_adapter, mock_request):
        """Test authentication error handling."""
        mock_settings.QWEN_API_KEY = "test-api-key"
        await qwen_adapter.initialize()

        # Mock auth error
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.json.return_value = {
            "code": "InvalidApiKey",
            "message": "Invalid API key"
        }

        error = httpx.HTTPStatusError(
            "Auth failed",
            request=Mock(),
            response=mock_response
        )
        qwen_adapter.client.post = AsyncMock(side_effect=error)

        with pytest.raises(ProviderError) as exc_info:
            await qwen_adapter.generate(mock_request)

        assert "auth" in str(exc_info.value).lower() or exc_info.value.error_code == "QWEN_AUTH_ERROR"

    @pytest.mark.asyncio
    @patch("ai_service.adapters.qwen_adapter.settings")
    async def test_generate_timeout(self, mock_settings, qwen_adapter, mock_request):
        """Test timeout error handling."""
        mock_settings.QWEN_API_KEY = "test-api-key"
        await qwen_adapter.initialize()

        qwen_adapter.client.post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))

        with pytest.raises(ProviderError) as exc_info:
            await qwen_adapter.generate(mock_request)

        assert "timeout" in str(exc_info.value).lower() or exc_info.value.error_code == "QWEN_TIMEOUT"

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

        # Test with qwen-plus
        cost = qwen_adapter.calculate_cost(1000, "qwen-plus")
        assert cost is not None
        assert cost > 0

        # Test with qwen-max
        cost = qwen_adapter.calculate_cost(1000, "qwen-max")
        assert cost is not None
        assert cost > 0

        # Test with unknown model
        cost = qwen_adapter.calculate_cost(1000, "unknown-model")
        assert cost is None

    def test_get_model_info(self, qwen_adapter):
        """Test model info retrieval."""
        info = qwen_adapter.get_model_info("qwen-turbo")

        assert info["provider"] == "qwen"
        assert info["model"] == "qwen-turbo"
        assert info["supported"] is True
        assert "max_tokens" in info
        assert "context_window" in info

    def test_validate_request(self, qwen_adapter):
        """Test request validation."""
        # Valid request
        valid_request = ModelRequest(prompt="Test", model="qwen-turbo")
        qwen_adapter.validate_request(valid_request)  # Should not raise

        # Empty prompt
        invalid_request = ModelRequest(prompt="", model="qwen-turbo")
        with pytest.raises(ValueError, match="empty"):
            qwen_adapter.validate_request(invalid_request)

        # Invalid temperature
        invalid_temp = ModelRequest(prompt="Test", model="qwen-turbo", temperature=3.0)
        with pytest.raises(ValueError, match="Temperature"):
            qwen_adapter.validate_request(invalid_temp)

        # Invalid max_tokens
        invalid_tokens = ModelRequest(prompt="Test", model="qwen-turbo", max_tokens=0)
        with pytest.raises(ValueError, match="positive"):
            qwen_adapter.validate_request(invalid_tokens)

    @pytest.mark.asyncio
    @patch("ai_service.adapters.qwen_adapter.settings")
    async def test_generate_with_optional_params(self, mock_settings, qwen_adapter):
        """Test generation with optional parameters."""
        mock_settings.QWEN_API_KEY = "test-api-key"
        await qwen_adapter.initialize()

        request = ModelRequest(
            prompt="Test prompt",
            model="qwen-turbo",
            temperature=0.5,
            max_tokens=200,
            top_p=0.9,
            stop_sequences=["STOP"],
        )

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "output": {
                "choices": [
                    {"message": {"role": "assistant", "content": "Response"}}
                ]
            },
            "usage": {"total_tokens": 100}
        }

        qwen_adapter.client.post = AsyncMock(return_value=mock_response)

        response = await qwen_adapter.generate(request)

        # Verify the call was made with correct parameters
        call_args = qwen_adapter.client.post.call_args
        json_params = call_args[1]["json"]
        assert json_params["parameters"]["temperature"] == 0.5
        assert json_params["parameters"]["max_tokens"] == 200
        assert json_params["parameters"]["top_p"] == 0.9
