"""Unit tests for Wenxin adapter."""
import pytest
from unittest.mock import Mock, patch, AsyncMock
import httpx
from ai_service.adapters.wenxin_adapter import WenxinAdapter
from ai_service.adapters.base import ModelRequest, ModelResponse
from ai_service.core.exceptions import ProviderError
from ai_service.models.schemas import AIProvider

@pytest.fixture
def wenxin_adapter():
    return WenxinAdapter()

@pytest.fixture
def mock_request():
    return ModelRequest(prompt="Test prompt", model="ernie-bot", temperature=0.7, max_tokens=100)

class TestWenxinAdapter:
    def test_init(self, wenxin_adapter):
        assert wenxin_adapter.provider == AIProvider.WENXIN
        assert wenxin_adapter.default_model == "ernie-bot"
        assert "ernie-bot" in wenxin_adapter.supported_models

    @pytest.mark.asyncio
    @patch("ai_service.adapters.wenxin_adapter.settings")
    async def test_initialize_success(self, mock_settings, wenxin_adapter):
        mock_settings.WENXIN_API_KEY = "test-api-key"
        await wenxin_adapter.initialize()
        assert wenxin_adapter.is_initialized is True

    @pytest.mark.asyncio
    @patch("ai_service.adapters.wenxin_adapter.settings")
    async def test_generate_success(self, mock_settings, wenxin_adapter, mock_request):
        mock_settings.WENXIN_API_KEY = "test-api-key"
        await wenxin_adapter.initialize()

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"result": "Test response", "usage": {"total_tokens": 100}}
        wenxin_adapter.client.post = AsyncMock(return_value=mock_response)

        response = await wenxin_adapter.generate(mock_request)
        assert isinstance(response, ModelResponse)
        assert response.content == "Test response"
        assert response.provider == AIProvider.WENXIN
