"""
DeepSeek adapter for AI Service.
"""

import time
from typing import Dict, Any, Optional, List
import httpx

from loguru import logger

from ..core.config import settings
from ..core.exceptions import ModelError, ProviderError
from ..models.schemas import AIProvider
from .base import BaseAdapter, ModelRequest, ModelResponse


class DeepSeekAdapter(BaseAdapter):
    """Adapter for DeepSeek models."""

    def __init__(self):
        super().__init__(provider=AIProvider.DEEPSEEK)
        self.client: Optional[httpx.AsyncClient] = None
        self.default_model = "deepseek-chat"
        self.supported_models = [
            "deepseek-chat",
            "deepseek-coder",
        ]
        self.base_url = "https://api.deepseek.com"

    async def initialize(self) -> None:
        """Initialize DeepSeek client."""
        api_key = settings.DEEPSEEK_API_KEY
        if not api_key:
            raise ValueError("DEEPSEEK_API_KEY not set in environment variables")

        self.api_key = api_key
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )
        self.is_initialized = True
        logger.info(f"DeepSeek adapter initialized with default model: {self.default_model}")

    async def generate(
        self,
        request: ModelRequest,
        **kwargs,
    ) -> ModelResponse:
        """Generate a response using DeepSeek API."""
        if not self.client or not self.is_initialized:
            raise ProviderError("DeepSeek adapter not initialized")

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
                "stream": False,
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
            response = await self.client.post("/chat/completions", json=api_params)
            response.raise_for_status()

            processing_time_ms = int((time.time() - start_time) * 1000)

            # Parse response
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            tokens_used = data["usage"]["total_tokens"]

            # Calculate cost (DeepSeek pricing information)
            cost_usd = self.calculate_cost(tokens_used, request.model)

            return ModelResponse(
                content=content,
                model=request.model,
                provider=self.provider,
                tokens_used=tokens_used,
                processing_time_ms=processing_time_ms,
                cost_usd=cost_usd,
                raw_response=data,
            )

        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code
            error_msg = f"DeepSeek API error: {status_code}"

            try:
                error_data = e.response.json()
                error_msg += f" - {error_data.get('error', {}).get('message', str(e))}"
            except:
                error_msg += f" - {str(e)}"

            logger.error(error_msg)

            if status_code == 429:
                raise ProviderError(
                    message="DeepSeek rate limit exceeded",
                    error_code="DEEPSEEK_RATE_LIMIT",
                )
            elif status_code == 401:
                raise ProviderError(
                    message="DeepSeek authentication failed",
                    error_code="DEEPSEEK_AUTH_ERROR",
                )
            elif status_code >= 500:
                raise ProviderError(
                    message="DeepSeek server error",
                    error_code="DEEPSEEK_SERVER_ERROR",
                )
            else:
                raise ProviderError(
                    message=error_msg,
                    error_code="DEEPSEEK_API_ERROR",
                    details={"status_code": status_code},
                )

        except httpx.TimeoutException as e:
            logger.error(f"DeepSeek API timeout: {e}")
            raise ProviderError(
                message="DeepSeek API timeout",
                error_code="DEEPSEEK_TIMEOUT",
            )
        except Exception as e:
            logger.error(f"Unexpected error in DeepSeek adapter: {e}")
            raise ModelError(
                message=f"Unexpected error: {str(e)}",
                error_code="DEEPSEEK_UNEXPECTED_ERROR",
            )

    async def close(self) -> None:
        """Close DeepSeek client."""
        if self.client:
            await self.client.aclose()
            self.client = None
            self.is_initialized = False
            logger.info("DeepSeek adapter closed")

    def calculate_cost(
        self,
        tokens_used: int,
        model: str,
    ) -> Optional[float]:
        """Calculate the cost of API call in USD."""
        # DeepSeek pricing (approximate, check official pricing for accuracy)
        # deepseek-chat: $0.00014 per 1K tokens input, $0.00028 per 1K tokens output
        pricing = {
            "deepseek-chat": {"input": 0.00014, "output": 0.00028},
            "deepseek-coder": {"input": 0.00014, "output": 0.00028},
        }

        if model not in pricing:
            logger.warning(f"No pricing information for model: {model}")
            return None

        # For simplicity, use output pricing
        price_per_token = pricing[model]["output"] / 1000
        cost = tokens_used * price_per_token

        return round(cost, 6)

    def _get_max_tokens_for_model(self, model: str) -> int:
        """Get maximum tokens for a specific DeepSeek model."""
        max_tokens_map = {
            "deepseek-chat": 4096,
            "deepseek-coder": 4096,
        }
        return max_tokens_map.get(model, 4096)

    def _get_context_window_for_model(self, model: str) -> int:
        """Get context window size for a specific DeepSeek model."""
        context_window_map = {
            "deepseek-chat": 4096,
            "deepseek-coder": 4096,
        }
        return context_window_map.get(model, 4096)