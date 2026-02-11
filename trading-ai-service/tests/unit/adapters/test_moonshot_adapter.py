"""Unit tests for Moonshot adapter."""
import pytest
from unittest.mock import Mock, patch, AsyncMock
from ai_service.adapters.moonshot_adapter import MoonshotAdapter
from ai_service.adapters.base import ModelRequest, ModelResponse
from ai_service.core.exceptions import ProviderError
from ai_service.models.schemas import AIProvider

@pytest.fixture
def moonshot_adapter():
    return MoonshotAdapter()

@pytest.fixture
def mock_request():
    return ModelRequest(prompt="Test prompt", model="moonshot-v1-8k", temperature=0.7, max_tokens=100)

class TestMoonshotAdapter:
    def test_init(self, moonshot_adapter):
        assert moonshot_adapter.provider == AIProvider.MOONSHOT
        assert moonshot_adapter.default_model == "moonshot-v1-8k"
        assert "moonshot-v1-8k" in moonshot_adapter.supported_models

    @pytest.mark.asyncio
    @patch("ai_service.adapters.moonshot_adapter.settings")
    async def test_initialize_success(self, mock_settings, moonshot_adapter):
        mock_settings.MOONSHOT_API_KEY = "test-api-key"
        await moonshot_adapter.initialize()
        assert moonshot_adapter.is_initialized is True

    @pytest.mark.asyncio
    @patch("ai_service.adapters.moonshot_adapter.settings")
    async def test_generate_success(self, mock_settings, moonshot_adapter, mock_request):
        mock_settings.MOONSHOT_API_KEY = "test-api-key"
        await moonshot_adapter.initialize()

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Test response"}}],
            "usage": {"total_tokens": 100}
        }
        moonshot_adapter.client.post = AsyncMock(return_value=mock_response)

        response = await moonshot_adapter.generate(mock_request)
        assert isinstance(response, ModelResponse)
        assert response.content == "Test response"
        assert response.provider == AIProvider.MOONSHOT
