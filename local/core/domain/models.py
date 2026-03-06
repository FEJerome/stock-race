"""
领域模型 - 核心数据定义

这些模型在 Local/MVP/Full 三种形态中保持一致
依据：DELIVERY_PLAN.md 核心层定义
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    """风险承受等级"""
    CONSERVATIVE = "conservative"      # 保守(-5%回撤)
    MODERATE = "moderate"              # 稳健(-10%)
    AGGRESSIVE = "aggressive"          # 激进(-20%)
    EXTREME = "extreme"                # 极度(-30%或无)


class HoldingPeriod(str, Enum):
    """持仓周期"""
    ULTRA_SHORT = "ultra_short"        # 超短线(1-3天)
    SHORT = "short"                    # 短线(1-2周)
    MEDIUM = "medium"                  # 中线(1-3月)
    LONG = "long"                      # 长线(3月+)


class DecisionAction(str, Enum):
    """交易决策动作"""
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"
    WATCH = "watch"


class AgentStatus(str, Enum):
    """AI交易员状态"""
    IDLE = "idle"                      # 空闲
    MONITORING = "monitoring"          # 监控中
    DECISION_PENDING = "decision_pending"  # 等待决策
    EXECUTING = "executing"            # 执行中
    REVIEWING = "reviewing"            # 复盘


class Strategy(BaseModel):
    """
    策略文档 - 五维度底线
    依据：PRD.md 4.2.2 策略收集机制
    """
    risk_level: RiskLevel = Field(..., description="风险承受")
    focus_sectors: List[str] = Field(default_factory=list, description="关注板块")
    holding_period: HoldingPeriod = Field(..., description="持仓周期")
    max_position_per_stock: Decimal = Field(default=Decimal("0.3"), description="单股最大仓位")
    stop_loss_discipline: str = Field(default="strict", description="止损纪律")
    market_scope: str = Field(default="main_board", description="交易市场范围")
    
    # 用户自定义维度
    custom_rules: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "risk_level": "moderate",
                "focus_sectors": ["科技", "消费"],
                "holding_period": "medium",
                "max_position_per_stock": "0.3",
                "stop_loss_discipline": "strict",
                "market_scope": "main_board"
            }
        }


class AIAgent(BaseModel):
    """
    AI交易员实体
    依据：PRD.md 4.2 AI交易员系统
    """
    id: UUID = Field(default_factory=uuid4)
    name: str = Field(..., description="AI名称")
    
    # 资金配置
    initial_capital: Decimal = Field(default=Decimal("100000"), description="初始资金")
    current_capital: Decimal = Field(default=Decimal("100000"), description="当前资金")
    
    # 策略配置
    strategy: Strategy = Field(..., description="交易策略")
    
    # 模型配置（Local仅支持DeepSeek）
    model_provider: str = Field(default="deepseek", description="模型提供商")
    model_name: str = Field(default="deepseek-chat", description="模型名称")
    
    # 状态
    status: AgentStatus = Field(default=AgentStatus.IDLE)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    # 业绩统计
    total_trades: int = Field(default=0)
    winning_trades: int = Field(default=0)
    total_return: Decimal = Field(default=Decimal("0"))
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "稳健型AI",
                "initial_capital": "100000",
                "model_provider": "deepseek",
                "strategy": {
                    "risk_level": "moderate",
                    "focus_sectors": ["消费"],
                    "holding_period": "medium"
                }
            }
        }


class StockData(BaseModel):
    """股票数据"""
    symbol: str = Field(..., description="股票代码")
    name: str = Field(..., description="股票名称")
    price: Decimal = Field(..., description="当前价格")
    change_percent: Decimal = Field(..., description="涨跌幅")
    volume: int = Field(..., description="成交量")
    
    # 技术指标（可选）
    ma5: Optional[Decimal] = None
    ma10: Optional[Decimal] = None
    ma20: Optional[Decimal] = None


class Position(BaseModel):
    """持仓"""
    symbol: str = Field(..., description="股票代码")
    quantity: int = Field(..., description="持仓数量")
    avg_cost: Decimal = Field(..., description="平均成本")
    current_price: Decimal = Field(..., description="当前价格")
    
    @property
    def market_value(self) -> Decimal:
        return Decimal(str(self.quantity)) * self.current_price
    
    @property
    def unrealized_pnl(self) -> Decimal:
        return (self.current_price - self.avg_cost) * Decimal(str(self.quantity))


class Trade(BaseModel):
    """交易记录"""
    id: UUID = Field(default_factory=uuid4)
    agent_id: UUID = Field(..., description="AI交易员ID")
    
    symbol: str = Field(..., description="股票代码")
    action: DecisionAction = Field(..., description="交易动作")
    quantity: int = Field(..., description="数量")
    price: Decimal = Field(..., description="成交价格")
    
    # 交易结果
    realized_pnl: Optional[Decimal] = None  # 实现盈亏（卖出时）
    
    # 元数据
    timestamp: datetime = Field(default_factory=datetime.now)
    decision_reason: Optional[str] = None  # AI决策理由


class DecisionResult(BaseModel):
    """决策结果"""
    agent_id: UUID
    symbol: str
    action: DecisionAction
    confidence: float = Field(..., ge=0, le=1, description="置信度")
    reason: str = Field(..., description="决策理由")
    suggested_position_size: Optional[int] = None
    
    timestamp: datetime = Field(default_factory=datetime.now)


class Portfolio(BaseModel):
    """账户组合快照"""
    agent_id: UUID
    
    cash: Decimal = Field(..., description="现金")
    positions: List[Position] = Field(default_factory=list)
    
    @property
    def total_value(self) -> Decimal:
        position_value = sum(p.market_value for p in self.positions)
        return self.cash + position_value
    
    @property
    def total_return_percent(self) -> Decimal:
        # 简化计算，实际需要跟踪初始投入
        return Decimal("0")
