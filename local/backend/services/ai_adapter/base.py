"""
AI Adapter Base Interface

Unified interface for LLM providers
"""
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

    @property
    def cost_usd(self) -> float:
        """Calculate approximate cost in USD"""
        # Kimi K2.5 pricing: $0.5/M input, $2/M output
        input_cost = self.prompt_tokens * 0.5 / 1_000_000
        output_cost = self.completion_tokens * 2.0 / 1_000_000
        return input_cost + output_cost


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
    news_sentiment: Optional[str] = None  # 新闻情绪
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
