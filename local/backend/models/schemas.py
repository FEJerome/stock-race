"""
Pydantic schemas for API request/response validation
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any, Literal
from datetime import datetime


class StrategyConfig(BaseModel):
    """Five-dimension strategy configuration"""
    risk_tolerance: str = Field(..., description="风险承受能力: 保守/稳健/积极")
    sectors: list[str] = Field(default=[], description="关注行业板块")
    holding_period: str = Field(..., description="持仓周期: 短线/中线/长线")
    position_limit: str = Field(..., description="仓位限制")
    stop_loss: str = Field(..., description="止损策略")
    market_scope: str = Field(default="主板+创业板", description="市场范围")


class AgentCreate(BaseModel):
    """Request schema for creating an AI agent"""
    name: str = Field(..., min_length=2, max_length=20, description="AI名称")
    initial_capital: float = Field(..., ge=10000, le=1_000_000_000, description="初始资金(1万-10亿)")
    strategy: StrategyConfig = Field(..., description="策略配置")
    model_provider: str = Field(default="kimi", description="模型提供商")
    model_name: str = Field(default="kimi-k2-5", description="模型名称")
    agent_level: Literal["intern", "manager", "partner"] = Field(default="intern", description="职级")
    incentive_level: Literal["standard", "active", "aggressive"] = Field(default="standard", description="档位")


class AgentResponse(BaseModel):
    """Response schema for AI agent"""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    initial_capital: float
    current_capital: float
    strategy: Dict[str, Any]
    model_provider: str
    model_name: str
    agent_level: str
    incentive_level: str
    status: str
    created_at: datetime
    updated_at: datetime


class AgentListResponse(BaseModel):
    """Response schema for agent list"""
    items: list[AgentResponse]
    total: int


class ApiResponse(BaseModel):
    """Standard API response wrapper"""
    code: int = Field(default=0, description="0=成功，非0=错误码")
    message: str = Field(default="success", description="错误描述")
    data: Optional[Any] = Field(default=None, description="响应数据")


class AgentUpdate(BaseModel):
    """Request schema for updating an AI agent"""
    name: Optional[str] = Field(None, min_length=2, max_length=20)
    status: Optional[Literal["active", "paused"]] = None
    incentive_level: Optional[Literal["standard", "active", "aggressive"]] = None


class TradeCreate(BaseModel):
    """Request schema for creating a trade"""
    symbol: str = Field(..., description="股票代码")
    action: Literal["buy", "sell"] = Field(..., description="操作类型")
    quantity: int = Field(..., gt=0, description="数量")
    price: float = Field(..., gt=0, description="价格")


class TradeResponse(BaseModel):
    """Response schema for trade record"""
    model_config = ConfigDict(from_attributes=True)

    id: str
    agent_id: str
    symbol: str
    name: Optional[str]
    action: str
    quantity: int
    price: float
    total_amount: float
    realized_pnl: Optional[float]
    decision_reason: Optional[str]
    timestamp: datetime


class PositionResponse(BaseModel):
    """Response schema for position"""
    model_config = ConfigDict(from_attributes=True)

    agent_id: str
    symbol: str
    name: Optional[str]
    quantity: int
    avg_cost: float
    current_price: Optional[float]
    market_value: Optional[float]
    unrealized_pnl: Optional[float]
    unrealized_pnl_pct: Optional[float]


class QuoteResponse(BaseModel):
    """Response schema for market quote"""
    symbol: str
    name: str
    price: float
    change: float
    change_percent: float
    volume: int
    timestamp: datetime
