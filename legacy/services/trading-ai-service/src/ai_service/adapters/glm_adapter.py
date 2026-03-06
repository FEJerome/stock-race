"""
GLM (智谱AI) adapter for AI Service.
支持GLM4.5、GLM4.6等模型。
"""

import time
from typing import Dict, Any, Optional, List
import httpx

from loguru import logger

from ..core.config import settings
from ..core.exceptions import ModelError, ProviderError
from ..models.schemas import AIProvider
from .base import BaseAdapter, ModelRequest, ModelResponse


class GLMAdapter(BaseAdapter):
    """Adapter for GLM (智谱AI) models."""

    def __init__(self):
        super().__init__(provider=AIProvider.GLM)
        self.client: Optional[httpx.AsyncClient] = None
        self.default_model = "glm-4"
        self.supported_models = [
            "glm-4",           # GLM-4 标准版
            "glm-4-plus",      # GLM-4 Plus版
            "glm-4v",          # GLM-4V 多模态版
            "glm-4-0520",      # GLM-4 0520版本
            "glm-4-air",       # GLM-4 Air 轻量版
            "glm-4-airx",      # GLM-4 AirX 增强版
            "glm-3-turbo",     # GLM-3 Turbo
            "glm-4-flash",     # GLM-4 Flash 快速版
        ]
        self.base_url = "https://open.bigmodel.cn/api/paas/v4"

    async def initialize(self) -> None:
        """Initialize GLM client."""
        api_key = settings.GLM_API_KEY
        if not api_key:
            raise ValueError("GLM_API_KEY not set in environment variables")

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
        logger.info(f"GLM adapter initialized with default model: {self.default_model}")

    async def generate(
        self,
        request: ModelRequest,
        **kwargs,
    ) -> ModelResponse:
        """Generate a response using GLM API."""
        if not self.client or not self.is_initialized:
            raise ProviderError("GLM adapter not initialized")

        self.validate_request(request)

        start_time = time.time()

        try:
            # Prepare messages for GLM API
            messages = []
            if request.system_prompt:
                messages.append({"role": "system", "content": request.system_prompt})
            messages.append({"role": "user", "content": request.prompt})

            # Prepare API call parameters for GLM
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

            # Make API call to GLM
            response = await self.client.post("/chat/completions", json=api_params)
            response.raise_for_status()

            processing_time_ms = int((time.time() - start_time) * 1000)

            # Parse GLM response
            data = response.json()

            # GLM API response format
            if "choices" in data and len(data["choices"]) > 0:
                content = data["choices"][0]["message"]["content"]
                tokens_used = data.get("usage", {}).get("total_tokens", 0)
            else:
                # Alternative response format
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                tokens_used = data.get("usage", {}).get("total_tokens", 0)

            # Calculate cost (GLM pricing information)
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
            error_msg = f"GLM API error: {status_code}"

            try:
                error_data = e.response.json()
                error_msg += f" - {error_data.get('error', {}).get('message', str(e))}"
            except:
                error_msg += f" - {str(e)}"

            logger.error(error_msg)

            if status_code == 429:
                raise ProviderError(
                    message="GLM rate limit exceeded",
                    error_code="GLM_RATE_LIMIT",
                )
            elif status_code == 401:
                raise ProviderError(
                    message="GLM authentication failed",
                    error_code="GLM_AUTH_ERROR",
                )
            elif status_code >= 500:
                raise ProviderError(
                    message="GLM server error",
                    error_code="GLM_SERVER_ERROR",
                )
            else:
                raise ProviderError(
                    message=error_msg,
                    error_code="GLM_API_ERROR",
                    details={"status_code": status_code},
                )

        except httpx.TimeoutException as e:
            logger.error(f"GLM API timeout: {e}")
            raise ProviderError(
                message="GLM API timeout",
                error_code="GLM_TIMEOUT",
            )
        except Exception as e:
            logger.error(f"Unexpected error in GLM adapter: {e}")
            raise ModelError(
                message=f"Unexpected error: {str(e)}",
                error_code="GLM_UNEXPECTED_ERROR",
            )

    async def close(self) -> None:
        """Close GLM client."""
        if self.client:
            await self.client.aclose()
            self.client = None
            self.is_initialized = False
            logger.info("GLM adapter closed")

    def calculate_cost(
        self,
        tokens_used: int,
        model: str,
    ) -> Optional[float]:
        """Calculate the cost of API call in USD."""
        # GLM pricing (approximate, check official pricing for accuracy)
        # 智谱AI定价参考：https://open.bigmodel.cn/pricing
        pricing = {
            "glm-4": {"input": 0.001, "output": 0.002},  # 示例价格，单位：元/千 tokens
            "glm-4-plus": {"input": 0.002, "output": 0.004},
            "glm-4v": {"input": 0.003, "output": 0.006},
            "glm-4-0520": {"input": 0.0015, "output": 0.003},
            "glm-4-air": {"input": 0.0005, "output": 0.001},
            "glm-4-airx": {"input": 0.0008, "output": 0.0016},
            "glm-3-turbo": {"input": 0.0003, "output": 0.0006},
            "glm-4-flash": {"input": 0.0004, "output": 0.0008},
        }

        if model not in pricing:
            logger.warning(f"No pricing information for model: {model}")
            return None

        # For simplicity, use output pricing
        # 注意：GLM定价是人民币，这里转换为美元（假设汇率 1 USD = 7.2 CNY）
        exchange_rate = 7.2
        price_per_token_cny = pricing[model]["output"] / 1000
        price_per_token_usd = price_per_token_cny / exchange_rate
        cost = tokens_used * price_per_token_usd

        return round(cost, 6)

    def _get_max_tokens_for_model(self, model: str) -> int:
        """Get maximum tokens for a specific GLM model."""
        max_tokens_map = {
            "glm-4": 8192,
            "glm-4-plus": 32768,
            "glm-4v": 8192,
            "glm-4-0520": 8192,
            "glm-4-air": 8192,
            "glm-4-airx": 8192,
            "glm-3-turbo": 8192,
            "glm-4-flash": 8192,
        }
        return max_tokens_map.get(model, 8192)

    def _get_context_window_for_model(self, model: str) -> int:
        """Get context window size for a specific GLM model."""
        context_window_map = {
            "glm-4": 128000,
            "glm-4-plus": 128000,
            "glm-4v": 128000,
            "glm-4-0520": 128000,
            "glm-4-air": 128000,
            "glm-4-airx": 128000,
            "glm-3-turbo": 128000,
            "glm-4-flash": 128000,
        }
        return context_window_map.get(model, 128000)

    async def health_check(self) -> bool:
        """Check if the GLM adapter is healthy."""
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
            logger.error(f"GLM health check failed: {e}")
            # 如果API密钥无效或网络问题，返回False
            return False