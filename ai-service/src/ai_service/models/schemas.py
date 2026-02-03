"""
Pydantic schemas for AI Service.
"""

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any, Union
from pydantic import BaseModel, Field, validator


class DecisionAction(str, Enum):
    """Trading decision actions."""
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"
    SELL_ALL = "sell_all"


class RiskLevel(str, Enum):
    """Risk levels for trading decisions."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERY_HIGH = "very_high"


class AIProvider(str, Enum):
    """Supported AI providers."""
    OPENAI = "openai"
    CLAUDE = "claude"
    DEEPSEEK = "deepseek"
    QWEN = "qwen"
    WENXIN = "wenxin"


class StockData(BaseModel):
    """Stock market data."""
    symbol: str = Field(..., description="Stock symbol (e.g., 'AAPL')")
    name: Optional[str] = Field(None, description="Stock name")
    current_price: float = Field(..., description="Current price")
    open_price: Optional[float] = Field(None, description="Opening price")
    high_price: Optional[float] = Field(None, description="Daily high")
    low_price: Optional[float] = Field(None, description="Daily low")
    volume: Optional[int] = Field(None, description="Trading volume")
    change: Optional[float] = Field(None, description="Price change")
    change_percent: Optional[float] = Field(None, description="Price change percentage")
    market_cap: Optional[float] = Field(None, description="Market capitalization")
    pe_ratio: Optional[float] = Field(None, description="P/E ratio")
    dividend_yield: Optional[float] = Field(None, description="Dividend yield")

    # Technical indicators
    ma_5: Optional[float] = Field(None, description="5-day moving average")
    ma_20: Optional[float] = Field(None, description="20-day moving average")
    ma_60: Optional[float] = Field(None, description="60-day moving average")
    rsi: Optional[float] = Field(None, description="RSI indicator")
    macd: Optional[float] = Field(None, description="MACD indicator")
    bollinger_upper: Optional[float] = Field(None, description="Bollinger upper band")
    bollinger_lower: Optional[float] = Field(None, description="Bollinger lower band")

    # Timestamps
    timestamp: datetime = Field(default_factory=datetime.now, description="Data timestamp")
    data_source: Optional[str] = Field(None, description="Data source")


class Position(BaseModel):
    """Portfolio position."""
    symbol: str = Field(..., description="Stock symbol")
    quantity: int = Field(..., description="Number of shares")
    avg_cost: float = Field(..., description="Average cost per share")
    current_price: float = Field(..., description="Current market price")
    market_value: float = Field(..., description="Current market value")
    unrealized_pnl: float = Field(..., description="Unrealized profit/loss")
    unrealized_pnl_percent: float = Field(..., description="Unrealized P&L percentage")

    @validator('market_value', 'unrealized_pnl', 'unrealized_pnl_percent', pre=True, always=True)
    def calculate_fields(cls, v, values):
        """Calculate derived fields."""
        if 'quantity' in values and 'current_price' in values and 'avg_cost' in values:
            quantity = values['quantity']
            current_price = values['current_price']
            avg_cost = values['avg_cost']

            market_value = quantity * current_price
            unrealized_pnl = quantity * (current_price - avg_cost)
            unrealized_pnl_percent = ((current_price - avg_cost) / avg_cost) * 100 if avg_cost > 0 else 0

            return {
                'market_value': market_value,
                'unrealized_pnl': unrealized_pnl,
                'unrealized_pnl_percent': unrealized_pnl_percent
            }.get(values.get('field_name'), v)
        return v


class AccountInfo(BaseModel):
    """Account information."""
    account_id: str = Field(..., description="Account ID")
    user_id: str = Field(..., description="User ID")
    total_balance: float = Field(..., description="Total account balance")
    available_cash: float = Field(..., description="Available cash for trading")
    total_market_value: float = Field(..., description="Total market value of positions")
    total_unrealized_pnl: float = Field(..., description="Total unrealized P&L")
    total_unrealized_pnl_percent: float = Field(..., description="Total unrealized P&L percentage")
    risk_tolerance: Optional[str] = Field(None, description="User risk tolerance")
    trading_strategy: Optional[str] = Field(None, description="Preferred trading strategy")


class DecisionRequest(BaseModel):
    """Request for AI trading decision."""
    account_info: AccountInfo = Field(..., description="Account information")
    positions: List[Position] = Field(default_factory=list, description="Current positions")
    stock_data: List[StockData] = Field(..., description="Stock market data")
    market_conditions: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Market conditions")
    constraints: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Trading constraints")

    # AI configuration
    ai_provider: AIProvider = Field(default=AIProvider.OPENAI, description="AI provider to use")
    model_name: Optional[str] = Field(None, description="Specific model name")
    temperature: Optional[float] = Field(None, description="Model temperature")
    max_tokens: Optional[int] = Field(None, description="Maximum tokens for response")

    # Prompt customization
    custom_prompt: Optional[str] = Field(None, description="Custom prompt template")
    include_technical_analysis: bool = Field(default=True, description="Include technical analysis")
    include_fundamental_analysis: bool = Field(default=True, description="Include fundamental analysis")
    include_risk_assessment: bool = Field(default=True, description="Include risk assessment")


class DecisionResult(BaseModel):
    """AI trading decision result."""
    decision_id: str = Field(..., description="Unique decision ID")
    timestamp: datetime = Field(default_factory=datetime.now, description="Decision timestamp")

    # Decision details
    action: DecisionAction = Field(..., description="Recommended action")
    symbol: str = Field(..., description="Stock symbol")
    quantity: Optional[int] = Field(None, description="Recommended quantity")
    price_target: Optional[float] = Field(None, description="Target price")
    stop_loss: Optional[float] = Field(None, description="Stop loss price")
    take_profit: Optional[float] = Field(None, description="Take profit price")

    # Analysis
    reasoning: str = Field(..., description="Decision reasoning")
    technical_analysis: Optional[str] = Field(None, description="Technical analysis details")
    fundamental_analysis: Optional[str] = Field(None, description="Fundamental analysis details")
    risk_assessment: Optional[str] = Field(None, description="Risk assessment details")

    # Metrics
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Confidence score (0-1)")
    risk_level: RiskLevel = Field(..., description="Risk level")
    expected_return: Optional[float] = Field(None, description="Expected return percentage")
    time_horizon: Optional[str] = Field(None, description="Recommended time horizon")

    # Metadata
    ai_provider: AIProvider = Field(..., description="AI provider used")
    model_name: str = Field(..., description="Model name used")
    processing_time_ms: Optional[int] = Field(None, description="Processing time in milliseconds")
    cost_usd: Optional[float] = Field(None, description="API cost in USD")

    # Raw response
    raw_response: Optional[Dict[str, Any]] = Field(None, description="Raw AI response")


class DecisionResponse(BaseModel):
    """API response for decision request."""
    success: bool = Field(..., description="Request success status")
    decision: Optional[DecisionResult] = Field(None, description="Decision result")
    error: Optional[str] = Field(None, description="Error message if any")
    warnings: List[str] = Field(default_factory=list, description="Warning messages")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Response metadata")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = Field(..., description="Service status")
    service: str = Field(..., description="Service name")
    version: str = Field(..., description="Service version")
    timestamp: datetime = Field(default_factory=datetime.now, description="Check timestamp")
    uptime_seconds: Optional[float] = Field(None, description="Service uptime in seconds")
    dependencies: Dict[str, str] = Field(default_factory=dict, description="Dependency status")


class ErrorResponse(BaseModel):
    """Error response."""
    detail: str = Field(..., description="Error detail")
    error_code: Optional[str] = Field(None, description="Error code")
    timestamp: datetime = Field(default_factory=datetime.now, description="Error timestamp")