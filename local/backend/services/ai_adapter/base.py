"""
AI Adapter Base Interface

Unified interface for LLM providers
"""
import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum


class DecisionAction(str, Enum):
    """交易决策动作"""
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"
    WATCH = "watch"


@dataclass
class TokenUsage:
    """Token使用统计"""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cached_tokens: int = 0

    def get_cost_usd(self, model: str = "") -> float:
        """Calculate cost in USD based on model

        Args:
            model: Model identifier for model-specific pricing

        Returns:
            Cost in USD
        """
        pricing = self._get_model_pricing(model)
        input_cost = self.prompt_tokens * pricing["input"] / 1_000_000
        output_cost = self.completion_tokens * pricing["output"] / 1_000_000
        return input_cost + output_cost

    @property
    def cost_usd(self) -> float:
        """Calculate approximate cost in USD (default to Kimi pricing)"""
        return self.get_cost_usd("kimi")

    @staticmethod
    def _get_model_pricing(model: str) -> dict:
        """Get pricing for specific model in $/M tokens

        Args:
            model: Model identifier

        Returns:
            Dict with 'input' and 'output' pricing
        """
        model_lower = model.lower()

        # Kimi pricing (Moonshot)
        if "kimi" in model_lower or "moonshot" in model_lower:
            return {"input": 0.5, "output": 2.0}

        # Qwen pricing (Alibaba DashScope)
        if "qwen" in model_lower:
            if "max" in model_lower:
                return {"input": 5.0, "output": 10.0}
            if "plus" in model_lower:
                return {"input": 2.0, "output": 6.0}
            if "turbo" in model_lower:
                return {"input": 0.5, "output": 1.0}
            # Default qwen-plus
            return {"input": 2.0, "output": 6.0}

        # DeepSeek pricing
        if "deepseek" in model_lower:
            return {"input": 0.14, "output": 0.28}

        # GLM pricing (Zhipu AI)
        if "glm" in model_lower:
            # glm-4-flash is free
            if "flash" in model_lower:
                return {"input": 0.0, "output": 0.0}
            # glm-4, glm-4-plus, glm-4-air
            return {"input": 0.1, "output": 0.1}

        # Default fallback to Kimi pricing
        return {"input": 0.5, "output": 2.0}


@dataclass
class MarketContext:
    """市场上下文数据"""
    symbol: str
    name: str
    current_price: float
    change_percent: float
    volume: int
    ma5: Optional[float] = None
    ma10: Optional[float] = None
    ma20: Optional[float] = None
    volume_ma5: Optional[float] = None
    price_change_1h: Optional[float] = None
    trend: str = "unknown"  # up/down/sideways/unknown
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None


@dataclass
class PositionContext:
    """持仓上下文数据"""
    symbol: str
    quantity: int
    avg_cost: float
    current_price: float
    unrealized_pnl: float
    unrealized_pnl_pct: float


@dataclass
class DecisionRequest:
    """AI决策请求"""
    agent_id: str
    agent_name: str
    symbol: str
    market_data: MarketContext
    position: Optional[PositionContext]
    strategy: Dict[str, Any]  # 策略配置
    portfolio_summary: Dict[str, Any]  # 组合概览
    trade_history: List[Dict[str, Any]]  # 最近交易历史
    news_sentiment: Optional[str] = None  # 新闻情绪（旧版，将逐步替换）
    event_analysis: Optional[Dict[str, Any]] = None  # 事件舆情分析（新增）
    agent_level: str = "intern"  # 职级
    incentive_level: str = "standard"  # 档位


@dataclass
class DecisionResponse:
    """AI决策响应"""
    action: DecisionAction
    confidence: float  # 0-1
    reason: str  # 决策理由（内心戏）
    suggested_quantity: Optional[int] = None  # 建议数量
    risk_warning: Optional[str] = None  # 风险提示
    token_usage: Optional[TokenUsage] = None
    latency_ms: float = 0.0
    model_name: str = ""
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()


class AIAdapter(ABC):
    """
    AI适配器基类

    所有LLM提供商的适配器必须继承此类
    """

    def __init__(self, model_name: str, api_key: Optional[str] = None):
        self.model_name = model_name
        self.api_key = api_key
        self._total_tokens_used = 0
        self._total_cost_usd = 0.0

    @abstractmethod
    async def make_decision(self, request: DecisionRequest) -> DecisionResponse:
        """
        执行交易决策

        Args:
            request: 决策请求上下文

        Returns:
            决策响应
        """
        pass

    @abstractmethod
    def build_prompt(self, request: DecisionRequest) -> str:
        """
        构建决策Prompt

        Args:
            request: 决策请求

        Returns:
            格式化后的Prompt字符串
        """
        pass

    @abstractmethod
    def parse_response(self, raw_response: str) -> DecisionResponse:
        """
        解析LLM响应

        Args:
            raw_response: 原始LLM输出

        Returns:
            结构化决策响应
        """
        pass

    def get_usage_stats(self) -> Dict[str, Any]:
        """获取使用统计"""
        return {
            "model": self.model_name,
            "total_tokens": self._total_tokens_used,
            "total_cost_usd": round(self._total_cost_usd, 4),
            "provider": self.__class__.__name__,
        }

    def _create_error_response(self, error_msg: str, start_time: float) -> DecisionResponse:
        """创建统一的错误响应

        Args:
            error_msg: 错误信息
            start_time: 请求开始时间戳

        Returns:
            标准化的错误决策响应
        """
        return DecisionResponse(
            action=DecisionAction.HOLD,
            confidence=0.0,
            reason=f"决策失败: {error_msg}",
            risk_warning=error_msg,
            latency_ms=(time.time() - start_time) * 1000,
            model_name=self.model_name,
        )

    def _clean_json_response(self, raw: str) -> str:
        """清理 JSON 响应中的 markdown 代码块

        Args:
            raw: 原始响应字符串

        Returns:
            清理后的 JSON 字符串
        """
        cleaned = raw.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        return cleaned.strip()

    def _parse_response_default(
        self,
        raw_response: str,
        latency_ms: float = 0.0,
        token_usage: Optional[TokenUsage] = None
    ) -> DecisionResponse:
        """默认的响应解析实现

        子类可以选择继承此实现或提供自己的实现

        Args:
            raw_response: 原始 LLM 输出
            latency_ms: 请求延迟(毫秒)
            token_usage: Token 使用统计

        Returns:
            结构化决策响应
        """
        try:
            cleaned = self._clean_json_response(raw_response)
            data = json.loads(cleaned)

            action_map = {
                "buy": DecisionAction.BUY,
                "sell": DecisionAction.SELL,
                "hold": DecisionAction.HOLD,
                "watch": DecisionAction.WATCH,
            }
            action_str = data.get("action", "hold").lower()
            action = action_map.get(action_str, DecisionAction.HOLD)

            return DecisionResponse(
                action=action,
                confidence=float(data.get("confidence", 0.5)),
                reason=data.get("reason", "未提供决策理由"),
                suggested_quantity=data.get("suggested_quantity"),
                risk_warning=data.get("risk_warning") if data.get("risk_warning") else None,
                latency_ms=latency_ms,
                model_name=self.model_name,
                token_usage=token_usage,
            )

        except json.JSONDecodeError as e:
            return DecisionResponse(
                action=DecisionAction.HOLD,
                confidence=0.0,
                reason=f"无法解析AI响应: {raw_response[:200]}",
                risk_warning=f"JSON解析错误: {str(e)}",
                latency_ms=latency_ms,
                model_name=self.model_name,
                token_usage=token_usage,
            )

        except Exception as e:
            return DecisionResponse(
                action=DecisionAction.HOLD,
                confidence=0.0,
                reason=f"响应处理错误: {str(e)}",
                risk_warning=str(e),
                latency_ms=latency_ms,
                model_name=self.model_name,
                token_usage=token_usage,
            )
