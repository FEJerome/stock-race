"""
Qwen adapter for AI Service.
支持阿里云通义千问模型（qwen-turbo, qwen-plus, qwen-max）。
使用阿里云DashScope API。
"""

import time
from typing import Dict, Any, Optional, List

import httpx
from loguru import logger

from ..core.config import settings
from ..core.exceptions import ModelError, ProviderError
from ..models.schemas import AIProvider
from .base import BaseAdapter, ModelRequest, ModelResponse


class QwenAdapter(BaseAdapter):
    """Adapter for Alibaba Qwen (通义千问) models."""

    def __init__(self):
        super().__init__(provider=AIProvider.QWEN)
        self.client: Optional[httpx.AsyncClient] = None
        self.default_model = "qwen-turbo"
        self.supported_models = [
            "qwen-turbo",      # 快速响应，成本低
            "qwen-plus",       # 平衡性能与成本
            "qwen-max",        # 最强性能
            "qwen-max-longcontext",  # 长上下文版本
        ]
        # 阿里云DashScope API
        self.base_url = "https://dashscope.aliyuncs.com/api/v1"

    async def initialize(self) -> None:
        """Initialize Qwen client with DashScope API."""
        api_key = settings.QWEN_API_KEY
        if not api_key:
            raise ValueError("QWEN_API_KEY not set in environment variables")

        self.api_key = api_key
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=60.0,  # Qwen可能需要更长的响应时间
        )
        self.is_initialized = True
        logger.info(f"Qwen adapter initialized with default model: {self.default_model}")

    async def generate(
        self,
        request: ModelRequest,
        **kwargs,
    ) -> ModelResponse:
        """Generate a response using Qwen API via DashScope."""
        if not self.client or not self.is_initialized:
            raise ProviderError("Qwen adapter not initialized")

        self.validate_request(request)

        start_time = time.time()

        try:
            # Prepare messages for Qwen API
            messages = []
            if request.system_prompt:
                messages.append({"role": "system", "content": request.system_prompt})
            messages.append({"role": "user", "content": request.prompt})

            # Prepare API call parameters for DashScope
            api_params = {
                "model": request.model,
                "input": {
                    "messages": messages
                },
                "parameters": {
                    "temperature": request.temperature,
                    "max_tokens": request.max_tokens,
                    "result_format": "message",
                }
            }

            # Add optional parameters
            if request.stop_sequences:
                api_params["parameters"]["stop"] = request.stop_sequences
            if request.top_p is not None:
                api_params["parameters"]["top_p"] = request.top_p
            if request.frequency_penalty is not None:
                api_params["parameters"]["repetition_penalty"] = request.frequency_penalty

            # Add any additional kwargs
            api_params.update(kwargs)

            # Make API call to DashScope
            response = await self.client.post("/services/aigc/text-generation/generation", json=api_params)
            response.raise_for_status()

            processing_time_ms = int((time.time() - start_time) * 1000)

            # Parse DashScope response
            data = response.json()

            # DashScope API response format
            if "output" in data and "choices" in data["output"]:
                choices = data["output"]["choices"]
                if len(choices) > 0 and "message" in choices[0]:
                    content = choices[0]["message"]["content"]
                else:
                    content = choices[0].get("text", "")
            else:
                # Fallback for alternative response format
                content = data.get("output", {}).get("text", "")

            # Get token usage
            usage = data.get("usage", {})
            tokens_used = usage.get("total_tokens", 0)
            if tokens_used == 0:
                # Calculate from input/output tokens
                tokens_used = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

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
            error_msg = f"Qwen API error: {status_code}"

            try:
                error_data = e.response.json()
                error_code = error_data.get("code", "")
                error_message = error_data.get("message", str(e))
                error_msg += f" - {error_code}: {error_message}"
            except:
                error_msg += f" - {str(e)}"

            logger.error(error_msg)

            # Map DashScope error codes
            if status_code == 429 or "Throttling" in error_msg:
                raise ProviderError(
                    message="Qwen rate limit exceeded",
                    error_code="QWEN_RATE_LIMIT",
                )
            elif status_code == 401 or "InvalidApiKey" in error_msg:
                raise ProviderError(
                    message="Qwen authentication failed",
                    error_code="QWEN_AUTH_ERROR",
                )
            elif status_code >= 500:
                raise ProviderError(
                    message="Qwen server error",
                    error_code="QWEN_SERVER_ERROR",
                )
            else:
                raise ProviderError(
                    message=error_msg,
                    error_code="QWEN_API_ERROR",
                    details={"status_code": status_code},
                )

        except httpx.TimeoutException as e:
            logger.error(f"Qwen API timeout: {e}")
            raise ProviderError(
                message="Qwen API timeout",
                error_code="QWEN_TIMEOUT",
            )
        except Exception as e:
            logger.error(f"Unexpected error in Qwen adapter: {e}")
            raise ModelError(
                message=f"Unexpected error: {str(e)}",
                error_code="QWEN_UNEXPECTED_ERROR",
            )

    async def close(self) -> None:
        """Close Qwen client."""
        if self.client:
            await self.client.aclose()
            self.client = None
            self.is_initialized = False
            logger.info("Qwen adapter closed")

    def calculate_cost(
        self,
        tokens_used: int,
        model: str,
    ) -> Optional[float]:
        """Calculate the cost of API call in USD.

        DashScope定价参考：https://dashscope.aliyun.com/pricing
        价格单位：元/千tokens
        """
        # 阿里云DashScope定价（人民币）
        pricing = {
            "qwen-turbo": {"input": 0.002, "output": 0.006},  # 约0.5元/百万tokens
            "qwen-plus": {"input": 0.004, "output": 0.012},   # 约1元/百万tokens
            "qwen-max": {"input": 0.04, "output": 0.12},     # 约10元/百万tokens
            "qwen-max-longcontext": {"input": 0.04, "output": 0.12},
        }

        if model not in pricing:
            logger.warning(f"No pricing information for model: {model}")
            return None

        # 转换为美元（假设汇率 1 USD = 7.2 CNY）
        exchange_rate = 7.2
        # 使用平均价格估算
        avg_price_cny = (pricing[model]["input"] + pricing[model]["output"]) / 2 / 1000
        avg_price_usd = avg_price_cny / exchange_rate
        cost = tokens_used * avg_price_usd

        return round(cost, 6)

    def _get_max_tokens_for_model(self, model: str) -> int:
        """Get maximum tokens for a specific Qwen model."""
        max_tokens_map = {
            "qwen-turbo": 8192,
            "qwen-plus": 8192,
            "qwen-max": 8192,
            "qwen-max-longcontext": 8192,
        }
        return max_tokens_map.get(model, 8192)

    def _get_context_window_for_model(self, model: str) -> int:
        """Get context window size for a specific Qwen model."""
        context_window_map = {
            "qwen-turbo": 8192,
            "qwen-plus": 32768,
            "qwen-max": 32768,
            "qwen-max-longcontext": 128000,
        }
        return context_window_map.get(model, 8192)

    async def health_check(self) -> bool:
        """Check if the Qwen adapter is healthy."""
        try:
            # Try a simple request to check connectivity
            test_request = ModelRequest(
                prompt="Hello",
                model=self.default_model,
                max_tokens=10,
            )
            await self.generate(test_request)
            return True
        except Exception as e:
            logger.error(f"Qwen health check failed: {e}")
            return False
