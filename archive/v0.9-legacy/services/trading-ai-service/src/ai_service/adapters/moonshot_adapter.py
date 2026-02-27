"""
Moonshot adapter for AI Service.
支持月之暗面Moonshot模型（moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k）。
"""

import time
from typing import Dict, Any, Optional, List

import httpx
from loguru import logger

from ..core.config import settings
from ..core.exceptions import ModelError, ProviderError
from ..models.schemas import AIProvider
from .base import BaseAdapter, ModelRequest, ModelResponse


class MoonshotAdapter(BaseAdapter):
    """Adapter for Moonshot (月之暗面) models."""

    def __init__(self):
        super().__init__(provider=AIProvider.MOONSHOT)
        self.client: Optional[httpx.AsyncClient] = None
        self.default_model = "moonshot-v1-8k"
        self.supported_models = [
            "moonshot-v1-8k",     # 8K上下文
            "moonshot-v1-32k",    # 32K上下文
            "moonshot-v1-128k",   # 128K上下文
        ]
        self.base_url = "https://api.moonshot.cn/v1"

    async def initialize(self) -> None:
        """Initialize Moonshot client."""
        api_key = settings.MOONSHOT_API_KEY
        if not api_key:
            raise ValueError("MOONSHOT_API_KEY not set in environment variables")

        self.api_key = api_key
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=60.0,
        )
        self.is_initialized = True
        logger.info(f"Moonshot adapter initialized with default model: {self.default_model}")

    async def generate(
        self,
        request: ModelRequest,
        **kwargs,
    ) -> ModelResponse:
        """Generate a response using Moonshot API."""
        if not self.client or not self.is_initialized:
            raise ProviderError("Moonshot adapter not initialized")

        self.validate_request(request)

        start_time = time.time()

        try:
            # Prepare messages for Moonshot API (OpenAI compatible format)
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

            # Make API call to Moonshot
            response = await self.client.post("/chat/completions", json=api_params)
            response.raise_for_status()

            processing_time_ms = int((time.time() - start_time) * 1000)

            # Parse Moonshot response (OpenAI compatible format)
            data = response.json()

            # Extract content from response
            if "choices" in data and len(data["choices"]) > 0:
                content = data["choices"][0]["message"]["content"]
            else:
                content = ""

            # Get token usage
            usage = data.get("usage", {})
            tokens_used = usage.get("total_tokens", 0)
            if tokens_used == 0:
                tokens_used = usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0)

            # Calculate cost
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
            error_msg = f"Moonshot API error: {status_code}"

            try:
                error_data = e.response.json()
                error_msg += f" - {error_data.get('error', {}).get('message', str(e))}"
            except:
                error_msg += f" - {str(e)}"

            logger.error(error_msg)

            if status_code == 429:
                raise ProviderError(
                    message="Moonshot rate limit exceeded",
                    error_code="MOONSHOT_RATE_LIMIT",
                )
            elif status_code == 401:
                raise ProviderError(
                    message="Moonshot authentication failed",
                    error_code="MOONSHOT_AUTH_ERROR",
                )
            elif status_code >= 500:
                raise ProviderError(
                    message="Moonshot server error",
                    error_code="MOONSHOT_SERVER_ERROR",
                )
            else:
                raise ProviderError(
                    message=error_msg,
                    error_code="MOONSHOT_API_ERROR",
                    details={"status_code": status_code},
                )

        except httpx.TimeoutException as e:
            logger.error(f"Moonshot API timeout: {e}")
            raise ProviderError(
                message="Moonshot API timeout",
                error_code="MOONSHOT_TIMEOUT",
            )
        except Exception as e:
            logger.error(f"Unexpected error in Moonshot adapter: {e}")
            raise ModelError(
                message=f"Unexpected error: {str(e)}",
                error_code="MOONSHOT_UNEXPECTED_ERROR",
            )

    async def close(self) -> None:
        """Close Moonshot client."""
        if self.client:
            await self.client.aclose()
            self.client = None
            self.is_initialized = False
            logger.info("Moonshot adapter closed")

    def calculate_cost(
        self,
        tokens_used: int,
        model: str,
    ) -> Optional[float]:
        """Calculate the cost of API call in USD.

        Moonshot定价参考：https://platform.moonshot.cn/docs/pricing
        """
        # Moonshot定价（人民币）
        pricing = {
            "moonshot-v1-8k": {"input": 0.012, "output": 0.012},    # 约12元/百万tokens
            "moonshot-v1-32k": {"input": 0.024, "output": 0.024},  # 约24元/百万tokens
            "moonshot-v1-128k": {"input": 0.060, "output": 0.060}, # 约60元/百万tokens
        }

        if model not in pricing:
            logger.warning(f"No pricing information for model: {model}")
            return None

        # 转换为美元（假设汇率 1 USD = 7.2 CNY）
        exchange_rate = 7.2
        avg_price_cny = (pricing[model]["input"] + pricing[model]["output"]) / 2 / 1000
        avg_price_usd = avg_price_cny / exchange_rate
        cost = tokens_used * avg_price_usd

        return round(cost, 6)

    def _get_max_tokens_for_model(self, model: str) -> int:
        """Get maximum tokens for a specific Moonshot model."""
        max_tokens_map = {
            "moonshot-v1-8k": 8192,
            "moonshot-v1-32k": 8192,
            "moonshot-v1-128k": 8192,
        }
        return max_tokens_map.get(model, 8192)

    def _get_context_window_for_model(self, model: str) -> int:
        """Get context window size for a specific Moonshot model."""
        context_window_map = {
            "moonshot-v1-8k": 8192,
            "moonshot-v1-32k": 32768,
            "moonshot-v1-128k": 128000,
        }
        return context_window_map.get(model, 8192)

    async def health_check(self) -> bool:
        """Check if the Moonshot adapter is healthy."""
        try:
            test_request = ModelRequest(
                prompt="Hello",
                model=self.default_model,
                max_tokens=10,
            )
            await self.generate(test_request)
            return True
        except Exception as e:
            logger.error(f"Moonshot health check failed: {e}")
            return False
