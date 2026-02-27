"""
Wenxin adapter for AI Service.
支持百度文心一言模型（ernie-bot, ernie-bot-turbo, ernie-bot-4）。
使用百度千帆API。
"""

import time
from typing import Dict, Any, Optional, List

import httpx
from loguru import logger

from ..core.config import settings
from ..core.exceptions import ModelError, ProviderError
from ..models.schemas import AIProvider
from .base import BaseAdapter, ModelRequest, ModelResponse


class WenxinAdapter(BaseAdapter):
    """Adapter for Baidu Wenxin (文心一言) models."""

    def __init__(self):
        super().__init__(provider=AIProvider.WENXIN)
        self.client: Optional[httpx.AsyncClient] = None
        self.default_model = "ernie-bot"
        self.supported_models = [
            "ernie-bot",           # 文心一言标准版
            "ernie-bot-turbo",     # 文心一言轻量版
            "ernie-bot-4",         # 文心一言4.0
            "ernie-bot-8k",        # 长上下文版本
        ]
        # 百度千帆API
        self.base_url = "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat"

    async def initialize(self) -> None:
        """Initialize Wenxin client with Baidu Qianfan API."""
        api_key = settings.WENXIN_API_KEY
        secret_key = getattr(settings, 'WENXIN_SECRET_KEY', None)

        if not api_key:
            raise ValueError("WENXIN_API_KEY not set in environment variables")

        self.api_key = api_key
        self.secret_key = secret_key

        self.client = httpx.AsyncClient(
            timeout=60.0,  # Wenxin可能需要更长的响应时间
        )
        self.is_initialized = True
        logger.info(f"Wenxin adapter initialized with default model: {self.default_model}")

    def _get_model_endpoint(self, model: str) -> str:
        """Get the API endpoint for a specific model."""
        # 百度千帆模型端点映射
        model_endpoints = {
            "ernie-bot": "completions",
            "ernie-bot-turbo": "eb-instant",
            "ernie-bot-4": "completions_pro",
            "ernie-bot-8k": "ernie_bot_8k",
        }
        endpoint = model_endpoints.get(model, "completions")
        return f"{self.base_url}/{endpoint}"

    async def generate(
        self,
        request: ModelRequest,
        **kwargs,
    ) -> ModelResponse:
        """Generate a response using Wenxin API via Baidu Qianfan."""
        if not self.client or not self.is_initialized:
            raise ProviderError("Wenxin adapter not initialized")

        self.validate_request(request)

        start_time = time.time()

        try:
            # Prepare messages for Wenxin API
            # 百度API使用messages格式
            messages = []
            if request.system_prompt:
                messages.append({"role": "system", "content": request.system_prompt})
            messages.append({"role": "user", "content": request.prompt})

            # Prepare API call parameters for Baidu Qianfan
            api_params = {
                "messages": messages,
                "temperature": request.temperature,
                "max_output_tokens": request.max_tokens,
            }

            # Add optional parameters
            if request.top_p is not None:
                api_params["top_p"] = request.top_p
            if request.stop_sequences:
                api_params["stop"] = request.stop_sequences

            # Add any additional kwargs
            api_params.update(kwargs)

            # Get model endpoint
            endpoint = self._get_model_endpoint(request.model)

            # Make API call to Baidu Qianfan
            # 百度API需要在URL中传递access_token
            # 简化处理：假设API Key可以直接使用，或者通过其他方式获取token
            url = f"{endpoint}?access_token={self.api_key}"
            response = await self.client.post(
                url,
                json=api_params,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()

            processing_time_ms = int((time.time() - start_time) * 1000)

            # Parse Baidu Qianfan response
            data = response.json()

            # Check for API error
            if "error_code" in data:
                error_code = data.get("error_code")
                error_msg = data.get("error_msg", "Unknown error")
                logger.error(f"Wenxin API error: {error_code} - {error_msg}")

                # Map error codes
                if error_code == 18:  # QPS limit
                    raise ProviderError(
                        message="Wenxin rate limit exceeded",
                        error_code="WENXIN_RATE_LIMIT",
                    )
                elif error_code in [1, 2, 3]:  # Auth errors
                    raise ProviderError(
                        message=f"Wenxin authentication failed: {error_msg}",
                        error_code="WENXIN_AUTH_ERROR",
                    )
                else:
                    raise ProviderError(
                        message=f"Wenxin API error: {error_msg}",
                        error_code=f"WENXIN_ERROR_{error_code}",
                    )

            # Extract content from response
            content = data.get("result", "")

            # Get token usage
            usage = data.get("usage", {})
            tokens_used = usage.get("total_tokens", 0)
            if tokens_used == 0:
                # Calculate from input/output tokens
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
            error_msg = f"Wenxin API error: {status_code}"

            try:
                error_data = e.response.json()
                error_msg += f" - {error_data.get('error_msg', str(e))}"
            except:
                error_msg += f" - {str(e)}"

            logger.error(error_msg)

            if status_code == 429:
                raise ProviderError(
                    message="Wenxin rate limit exceeded",
                    error_code="WENXIN_RATE_LIMIT",
                )
            elif status_code == 401:
                raise ProviderError(
                    message="Wenxin authentication failed",
                    error_code="WENXIN_AUTH_ERROR",
                )
            elif status_code >= 500:
                raise ProviderError(
                    message="Wenxin server error",
                    error_code="WENXIN_SERVER_ERROR",
                )
            else:
                raise ProviderError(
                    message=error_msg,
                    error_code="WENXIN_API_ERROR",
                    details={"status_code": status_code},
                )

        except httpx.TimeoutException as e:
            logger.error(f"Wenxin API timeout: {e}")
            raise ProviderError(
                message="Wenxin API timeout",
                error_code="WENXIN_TIMEOUT",
            )
        except Exception as e:
            logger.error(f"Unexpected error in Wenxin adapter: {e}")
            raise ModelError(
                message=f"Unexpected error: {str(e)}",
                error_code="WENXIN_UNEXPECTED_ERROR",
            )

    async def close(self) -> None:
        """Close Wenxin client."""
        if self.client:
            await self.client.aclose()
            self.client = None
            self.is_initialized = False
            logger.info("Wenxin adapter closed")

    def calculate_cost(
        self,
        tokens_used: int,
        model: str,
    ) -> Optional[float]:
        """Calculate the cost of API call in USD.

        百度千帆定价参考：https://cloud.baidu.com/doc/WENXINWORKSHOP/s/Blfmc9djq
        价格单位：元/千tokens
        """
        # 百度千帆定价（人民币）- 按量付费
        pricing = {
            "ernie-bot": {"input": 0.012, "output": 0.012},      # 约1.2元/千tokens
            "ernie-bot-turbo": {"input": 0.008, "output": 0.008},  # 约0.8元/千tokens
            "ernie-bot-4": {"input": 0.04, "output": 0.12},      # 约4-12元/千tokens
            "ernie-bot-8k": {"input": 0.012, "output": 0.012},
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
        """Get maximum tokens for a specific Wenxin model."""
        max_tokens_map = {
            "ernie-bot": 4096,
            "ernie-bot-turbo": 4096,
            "ernie-bot-4": 8192,
            "ernie-bot-8k": 8192,
        }
        return max_tokens_map.get(model, 4096)

    def _get_context_window_for_model(self, model: str) -> int:
        """Get context window size for a specific Wenxin model."""
        context_window_map = {
            "ernie-bot": 8192,
            "ernie-bot-turbo": 8192,
            "ernie-bot-4": 32768,
            "ernie-bot-8k": 8192,
        }
        return context_window_map.get(model, 8192)

    async def health_check(self) -> bool:
        """Check if the Wenxin adapter is healthy."""
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
            logger.error(f"Wenxin health check failed: {e}")
            return False
