"""
OpenAI adapter for AI Service.
"""

import time
from typing import Dict, Any, Optional, List
from openai import AsyncOpenAI, APIError, RateLimitError, APITimeoutError

from loguru import logger

from ..core.config import settings
from ..core.exceptions import ModelError, ProviderError, RateLimitError as ServiceRateLimitError
from ..models.schemas import AIProvider
from .base import BaseAdapter, ModelRequest, ModelResponse


class OpenAIAdapter(BaseAdapter):
    """Adapter for OpenAI models."""

    def __init__(self):
        super().__init__(provider=AIProvider.OPENAI)
        self.client: Optional[AsyncOpenAI] = None
        self.default_model = settings.DEFAULT_MODEL
        self.supported_models = [
            "gpt-4-turbo-preview",
            "gpt-4",
            "gpt-4-32k",
            "gpt-3.5-turbo",
            "gpt-3.5-turbo-16k",
        ]

        # Pricing per 1K tokens (USD)
        self.pricing = {
            "gpt-4-turbo-preview": {"input": 0.01, "output": 0.03},
            "gpt-4": {"input": 0.03, "output": 0.06},
            "gpt-4-32k": {"input": 0.06, "output": 0.12},
            "gpt-3.5-turbo": {"input": 0.0015, "output": 0.002},
            "gpt-3.5-turbo-16k": {"input": 0.003, "output": 0.004},
        }

    async def initialize(self) -> None:
        """Initialize OpenAI client."""
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set in environment variables")

        self.api_key = api_key
        self.client = AsyncOpenAI(api_key=api_key)
        self.is_initialized = True
        logger.info(f"OpenAI adapter initialized with default model: {self.default_model}")

    async def generate(
        self,
        request: ModelRequest,
        **kwargs,
    ) -> ModelResponse:
        """Generate a response using OpenAI API."""
        if not self.client or not self.is_initialized:
            raise ProviderError("OpenAI adapter not initialized")

        self.validate_request(request)

        start_time = time.time()

        try:
            # Prepare messages
            messages = []
            if request.system_prompt:
                messages.append({"role": "system", "content": request.system_prompt})
            messages.append({"role": "user", "content": request.prompt})

            # Prepare API call parameters
            api_params = {
                "model": request.model,
                "messages": messages,
                "temperature": request.temperature,
                "max_tokens": request.max_tokens,
            }

            # Add optional parameters
            if request.stop_sequences:
                api_params["stop"] = request.stop_sequences
            if request.top_p is not None:
                api_params["top_p"] = request.top_p
            if request.frequency_penalty is not None:
                api_params["frequency_penalty"] = request.frequency_penalty
            if request.presence_penalty is not None:
                api_params["presence_penalty"] = request.presence_penalty

            # Add any additional kwargs
            api_params.update(kwargs)

            # Make API call
            response = await self.client.chat.completions.create(**api_params)

            processing_time_ms = int((time.time() - start_time) * 1000)

            # Extract response
            content = response.choices[0].message.content or ""
            tokens_used = response.usage.total_tokens

            # Calculate cost
            cost_usd = self.calculate_cost(tokens_used, request.model)

            return ModelResponse(
                content=content,
                model=request.model,
                provider=self.provider,
                tokens_used=tokens_used,
                processing_time_ms=processing_time_ms,
                cost_usd=cost_usd,
                raw_response=response.model_dump(),
            )

        except RateLimitError as e:
            logger.error(f"OpenAI rate limit exceeded: {e}")
            raise ServiceRateLimitError(
                message="OpenAI rate limit exceeded",
                error_code="OPENAI_RATE_LIMIT",
                details={"retry_after": getattr(e, 'retry_after', None)},
            )
        except APITimeoutError as e:
            logger.error(f"OpenAI API timeout: {e}")
            raise ProviderError(
                message="OpenAI API timeout",
                error_code="OPENAI_TIMEOUT",
            )
        except APIError as e:
            logger.error(f"OpenAI API error: {e}")
            raise ProviderError(
                message=f"OpenAI API error: {str(e)}",
                error_code="OPENAI_API_ERROR",
                details={"status_code": getattr(e, 'status_code', None)},
            )
        except Exception as e:
            logger.error(f"Unexpected error in OpenAI adapter: {e}")
            raise ModelError(
                message=f"Unexpected error: {str(e)}",
                error_code="OPENAI_UNEXPECTED_ERROR",
            )

    async def close(self) -> None:
        """Close OpenAI client."""
        if self.client:
            await self.client.close()
            self.client = None
            self.is_initialized = False
            logger.info("OpenAI adapter closed")

    def calculate_cost(
        self,
        tokens_used: int,
        model: str,
    ) -> Optional[float]:
        """Calculate the cost of API call in USD."""
        if model not in self.pricing:
            logger.warning(f"No pricing information for model: {model}")
            return None

        # For simplicity, we'll use output pricing for all tokens
        # In reality, OpenAI charges differently for input and output tokens
        price_per_token = self.pricing[model]["output"] / 1000
        cost = tokens_used * price_per_token

        return round(cost, 6)  # Round to 6 decimal places

    def _get_max_tokens_for_model(self, model: str) -> int:
        """Get maximum tokens for a specific OpenAI model."""
        max_tokens_map = {
            "gpt-4-turbo-preview": 4096,
            "gpt-4": 8192,
            "gpt-4-32k": 32768,
            "gpt-3.5-turbo": 4096,
            "gpt-3.5-turbo-16k": 16384,
        }
        return max_tokens_map.get(model, 4096)

    def _get_context_window_for_model(self, model: str) -> int:
        """Get context window size for a specific OpenAI model."""
        context_window_map = {
            "gpt-4-turbo-preview": 128000,
            "gpt-4": 8192,
            "gpt-4-32k": 32768,
            "gpt-3.5-turbo": 4096,
            "gpt-3.5-turbo-16k": 16384,
        }
        return context_window_map.get(model, 4096)

    async def list_models(self) -> List[Dict[str, Any]]:
        """List available OpenAI models."""
        if not self.client or not self.is_initialized:
            raise ProviderError("OpenAI adapter not initialized")

        try:
            models = await self.client.models.list()
            return [
                {
                    "id": model.id,
                    "created": model.created,
                    "owned_by": model.owned_by,
                }
                for model in models.data
            ]
        except Exception as e:
            logger.error(f"Failed to list OpenAI models: {e}")
            raise ProviderError(
                message=f"Failed to list models: {str(e)}",
                error_code="OPENAI_LIST_MODELS_ERROR",
            )