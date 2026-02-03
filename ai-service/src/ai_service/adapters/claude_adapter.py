"""
Claude adapter for AI Service.
"""

import time
from typing import Dict, Any, Optional, List
import anthropic

from loguru import logger

from ..core.config import settings
from ..core.exceptions import ModelError, ProviderError
from ..models.schemas import AIProvider
from .base import BaseAdapter, ModelRequest, ModelResponse


class ClaudeAdapter(BaseAdapter):
    """Adapter for Anthropic Claude models."""

    def __init__(self):
        super().__init__(provider=AIProvider.CLAUDE)
        self.client: Optional[anthropic.AsyncAnthropic] = None
        self.default_model = "claude-3-opus-20240229"
        self.supported_models = [
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307",
            "claude-2.1",
            "claude-2.0",
            "claude-instant-1.2",
        ]

        # Pricing per 1K tokens (USD)
        self.pricing = {
            "claude-3-opus-20240229": {"input": 0.015, "output": 0.075},
            "claude-3-sonnet-20240229": {"input": 0.003, "output": 0.015},
            "claude-3-haiku-20240307": {"input": 0.00025, "output": 0.00125},
            "claude-2.1": {"input": 0.008, "output": 0.024},
            "claude-2.0": {"input": 0.008, "output": 0.024},
            "claude-instant-1.2": {"input": 0.0008, "output": 0.0024},
        }

    async def initialize(self) -> None:
        """Initialize Claude client."""
        api_key = settings.ANTHROPIC_API_KEY
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set in environment variables")

        self.api_key = api_key
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.is_initialized = True
        logger.info(f"Claude adapter initialized with default model: {self.default_model}")

    async def generate(
        self,
        request: ModelRequest,
        **kwargs,
    ) -> ModelResponse:
        """Generate a response using Claude API."""
        if not self.client or not self.is_initialized:
            raise ProviderError("Claude adapter not initialized")

        self.validate_request(request)

        start_time = time.time()

        try:
            # Prepare messages
            messages = []
            if request.system_prompt:
                # Claude uses system parameter instead of system message
                system_prompt = request.system_prompt
            else:
                system_prompt = "You are a helpful AI assistant."

            messages.append({"role": "user", "content": request.prompt})

            # Prepare API call parameters
            api_params = {
                "model": request.model,
                "system": system_prompt,
                "messages": messages,
                "temperature": request.temperature,
                "max_tokens": request.max_tokens,
            }

            # Add optional parameters
            if request.stop_sequences:
                api_params["stop_sequences"] = request.stop_sequences
            if request.top_p is not None:
                api_params["top_p"] = request.top_p

            # Add any additional kwargs
            api_params.update(kwargs)

            # Make API call
            response = await self.client.messages.create(**api_params)

            processing_time_ms = int((time.time() - start_time) * 1000)

            # Extract response
            content = response.content[0].text
            tokens_used = response.usage.input_tokens + response.usage.output_tokens

            # Calculate cost
            cost_usd = self.calculate_cost(
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                model=request.model,
            )

            return ModelResponse(
                content=content,
                model=request.model,
                provider=self.provider,
                tokens_used=tokens_used,
                processing_time_ms=processing_time_ms,
                cost_usd=cost_usd,
                raw_response=response.model_dump(),
            )

        except anthropic.RateLimitError as e:
            logger.error(f"Claude rate limit exceeded: {e}")
            raise ProviderError(
                message="Claude rate limit exceeded",
                error_code="CLAUDE_RATE_LIMIT",
            )
        except anthropic.APITimeoutError as e:
            logger.error(f"Claude API timeout: {e}")
            raise ProviderError(
                message="Claude API timeout",
                error_code="CLAUDE_TIMEOUT",
            )
        except anthropic.APIError as e:
            logger.error(f"Claude API error: {e}")
            raise ProviderError(
                message=f"Claude API error: {str(e)}",
                error_code="CLAUDE_API_ERROR",
                details={"status_code": getattr(e, 'status_code', None)},
            )
        except Exception as e:
            logger.error(f"Unexpected error in Claude adapter: {e}")
            raise ModelError(
                message=f"Unexpected error: {str(e)}",
                error_code="CLAUDE_UNEXPECTED_ERROR",
            )

    async def close(self) -> None:
        """Close Claude client."""
        if self.client:
            await self.client.close()
            self.client = None
            self.is_initialized = False
            logger.info("Claude adapter closed")

    def calculate_cost(
        self,
        input_tokens: int,
        output_tokens: int,
        model: str,
    ) -> Optional[float]:
        """Calculate the cost of API call in USD."""
        if model not in self.pricing:
            logger.warning(f"No pricing information for model: {model}")
            return None

        input_cost = (input_tokens / 1000) * self.pricing[model]["input"]
        output_cost = (output_tokens / 1000) * self.pricing[model]["output"]
        total_cost = input_cost + output_cost

        return round(total_cost, 6)

    def _get_max_tokens_for_model(self, model: str) -> int:
        """Get maximum tokens for a specific Claude model."""
        max_tokens_map = {
            "claude-3-opus-20240229": 4096,
            "claude-3-sonnet-20240229": 4096,
            "claude-3-haiku-20240307": 4096,
            "claude-2.1": 4096,
            "claude-2.0": 4096,
            "claude-instant-1.2": 4096,
        }
        return max_tokens_map.get(model, 4096)

    def _get_context_window_for_model(self, model: str) -> int:
        """Get context window size for a specific Claude model."""
        context_window_map = {
            "claude-3-opus-20240229": 200000,
            "claude-3-sonnet-20240229": 200000,
            "claude-3-haiku-20240307": 200000,
            "claude-2.1": 200000,
            "claude-2.0": 100000,
            "claude-instant-1.2": 100000,
        }
        return context_window_map.get(model, 100000)