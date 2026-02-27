"""
Base adapter for AI model providers.
"""

import asyncio
import time
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from dataclasses import dataclass

from loguru import logger

from ..core.config import settings
from ..core.exceptions import ModelError, ProviderError
from ..models.schemas import AIProvider


@dataclass
class ModelResponse:
    """Standardized model response."""
    content: str
    model: str
    provider: AIProvider
    tokens_used: int
    processing_time_ms: int
    cost_usd: Optional[float] = None
    raw_response: Optional[Dict[str, Any]] = None


@dataclass
class ModelRequest:
    """Standardized model request."""
    prompt: str
    model: str
    temperature: float = 0.7
    max_tokens: int = 2000
    system_prompt: Optional[str] = None
    stop_sequences: Optional[List[str]] = None
    top_p: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None


class BaseAdapter(ABC):
    """Base class for AI model adapters."""

    def __init__(self, provider: AIProvider):
        self.provider = provider
        self.api_key: Optional[str] = None
        self.base_url: Optional[str] = None
        self.default_model: str = ""
        self.supported_models: List[str] = []
        self.is_initialized = False

    @abstractmethod
    async def initialize(self) -> None:
        """Initialize the adapter with API credentials."""
        pass

    @abstractmethod
    async def generate(
        self,
        request: ModelRequest,
        **kwargs,
    ) -> ModelResponse:
        """Generate a response from the model."""
        pass

    @abstractmethod
    async def close(self) -> None:
        """Close any open connections."""
        pass

    def validate_request(self, request: ModelRequest) -> None:
        """Validate the model request."""
        if not request.prompt:
            raise ValueError("Prompt cannot be empty")

        if request.temperature < 0 or request.temperature > 2:
            raise ValueError("Temperature must be between 0 and 2")

        if request.max_tokens <= 0:
            raise ValueError("Max tokens must be positive")

        if request.model not in self.supported_models:
            logger.warning(
                f"Model {request.model} not in supported models list. "
                f"Supported: {self.supported_models}"
            )

    async def call_with_retry(
        self,
        func,
        *args,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        **kwargs,
    ) -> Any:
        """Call a function with retry logic."""
        last_exception = None

        for attempt in range(max_retries):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                logger.warning(
                    f"Attempt {attempt + 1}/{max_retries} failed: {str(e)}"
                )

                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay * (2 ** attempt))  # Exponential backoff
                else:
                    raise ProviderError(
                        message=f"Failed after {max_retries} attempts",
                        error_code="MAX_RETRIES_EXCEEDED",
                        details={"last_exception": str(last_exception)},
                    )

        raise last_exception  # Should never reach here

    def calculate_cost(
        self,
        tokens_used: int,
        model: str,
    ) -> Optional[float]:
        """Calculate the cost of API call in USD."""
        # Default implementation - should be overridden by specific adapters
        # with actual pricing information
        return None

    def get_model_info(self, model: str) -> Dict[str, Any]:
        """Get information about a specific model."""
        return {
            "provider": self.provider.value,
            "model": model,
            "supported": model in self.supported_models,
            "max_tokens": self._get_max_tokens_for_model(model),
            "context_window": self._get_context_window_for_model(model),
        }

    def _get_max_tokens_for_model(self, model: str) -> int:
        """Get maximum tokens for a specific model."""
        # Default implementation - should be overridden
        return 4096

    def _get_context_window_for_model(self, model: str) -> int:
        """Get context window size for a specific model."""
        # Default implementation - should be overridden
        return 8192

    async def health_check(self) -> bool:
        """Check if the adapter is healthy."""
        try:
            # Try a simple request to check connectivity
            test_request = ModelRequest(
                prompt="Test",
                model=self.default_model,
                max_tokens=10,
            )
            await self.generate(test_request)
            return True
        except Exception as e:
            logger.error(f"Health check failed for {self.provider}: {e}")
            return False


class AdapterFactory:
    """Factory for creating AI model adapters."""

    _adapters: Dict[AIProvider, BaseAdapter] = {}

    @classmethod
    async def get_adapter(
        cls,
        provider: AIProvider,
        force_recreate: bool = False,
    ) -> BaseAdapter:
        """Get or create an adapter for the specified provider."""
        if not force_recreate and provider in cls._adapters:
            adapter = cls._adapters[provider]
            if adapter.is_initialized:
                return adapter

        # Create new adapter
        adapter = cls._create_adapter(provider)
        await adapter.initialize()
        cls._adapters[provider] = adapter
        return adapter

    @classmethod
    def _create_adapter(cls, provider: AIProvider) -> BaseAdapter:
        """Create an adapter instance for the specified provider."""
        if provider == AIProvider.OPENAI:
            from .openai_adapter import OpenAIAdapter
            return OpenAIAdapter()
        elif provider == AIProvider.CLAUDE:
            from .claude_adapter import ClaudeAdapter
            return ClaudeAdapter()
        elif provider == AIProvider.DEEPSEEK:
            from .deepseek_adapter import DeepSeekAdapter
            return DeepSeekAdapter()
        elif provider == AIProvider.QWEN:
            from .qwen_adapter import QwenAdapter
            return QwenAdapter()
        elif provider == AIProvider.WENXIN:
            from .wenxin_adapter import WenxinAdapter
            return WenxinAdapter()
        elif provider == AIProvider.GLM:
            from .glm_adapter import GLMAdapter
            return GLMAdapter()
        elif provider == AIProvider.MOONSHOT:
            from .moonshot_adapter import MoonshotAdapter
            return MoonshotAdapter()
        else:
            raise ValueError(f"Unsupported provider: {provider}")

    @classmethod
    async def close_all(cls) -> None:
        """Close all adapters."""
        for adapter in cls._adapters.values():
            try:
                await adapter.close()
            except Exception as e:
                logger.error(f"Error closing adapter {adapter.provider}: {e}")

        cls._adapters.clear()