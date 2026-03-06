"""
Stock data models.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator, ConfigDict
from enum import Enum


class StockExchange(str, Enum):
    """Stock exchange enumeration."""
    SHANGHAI = "SH"
    SHENZHEN = "SZ"
    HONG_KONG = "HK"
    NEW_YORK = "NYSE"
    NASDAQ = "NASDAQ"


class StockSector(str, Enum):
    """Stock sector enumeration."""
    FINANCIAL = "financial"
    TECHNOLOGY = "technology"
    CONSUMER = "consumer"
    INDUSTRIAL = "industrial"
    HEALTHCARE = "healthcare"
    ENERGY = "energy"
    MATERIALS = "materials"
    UTILITIES = "utilities"
    REAL_ESTATE = "real_estate"
    COMMUNICATION = "communication"


class StockSymbol(BaseModel):
    """Stock symbol information."""
    symbol: str = Field(..., description="Stock symbol (e.g., 000001.SZ)")
    name: str = Field(..., description="Company name")
    exchange: StockExchange = Field(..., description="Stock exchange")
    sector: Optional[StockSector] = Field(None, description="Industry sector")
    market_cap: Optional[float] = Field(None, description="Market capitalization (in CNY)")
    pe_ratio: Optional[float] = Field(None, description="Price-to-earnings ratio")
    pb_ratio: Optional[float] = Field(None, description="Price-to-book ratio")
    dividend_yield: Optional[float] = Field(None, description="Dividend yield")
    listing_date: Optional[datetime] = Field(None, description="Listing date")
    is_active: bool = Field(True, description="Whether the stock is actively traded")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        }
    )


class StockQuote(BaseModel):
    """Real-time stock quote."""
    symbol: str = Field(..., description="Stock symbol")
    price: float = Field(..., description="Current price")
    open: float = Field(..., description="Opening price")
    high: float = Field(..., description="Daily high")
    low: float = Field(..., description="Daily low")
    prev_close: float = Field(..., description="Previous close")
    change: float = Field(..., description="Price change")
    change_percent: float = Field(..., description="Price change percentage")
    volume: int = Field(..., description="Trading volume")
    amount: float = Field(..., description="Trading amount (in CNY)")
    bid_price: Optional[float] = Field(None, description="Best bid price")
    ask_price: Optional[float] = Field(None, description="Best ask price")
    bid_volume: Optional[int] = Field(None, description="Best bid volume")
    ask_volume: Optional[int] = Field(None, description="Best ask volume")
    timestamp: datetime = Field(..., description="Quote timestamp")

    @field_validator('change_percent')
    @classmethod
    def validate_change_percent(cls, v):
        """Validate change percentage is reasonable."""
        if abs(v) > 1000:  # More than 1000% change is unrealistic
            raise ValueError(f"Change percentage {v}% is unrealistic")
        return v

    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        }
    )


class StockData(BaseModel):
    """Historical stock data."""
    symbol: str = Field(..., description="Stock symbol")
    timestamp: datetime = Field(..., description="Data timestamp")
    open: float = Field(..., description="Opening price")
    high: float = Field(..., description="High price")
    low: float = Field(..., description="Low price")
    close: float = Field(..., description="Closing price")
    volume: int = Field(..., description="Trading volume")
    amount: Optional[float] = Field(None, description="Trading amount (in CNY)")
    adj_close: Optional[float] = Field(None, description="Adjusted close price")
    vwap: Optional[float] = Field(None, description="Volume weighted average price")

    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        }
    )


class StockHistory(BaseModel):
    """Stock history with metadata."""
    symbol: str = Field(..., description="Stock symbol")
    data: List[StockData] = Field(..., description="Historical data points")
    interval: str = Field(..., description="Data interval (1m, 5m, 1d, etc.)")
    start_date: datetime = Field(..., description="Start date")
    end_date: datetime = Field(..., description="End date")
    count: int = Field(..., description="Number of data points")

    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        }
    )


class TechnicalIndicator(BaseModel):
    """Technical indicator data."""
    name: str = Field(..., description="Indicator name (e.g., MA, MACD, RSI)")
    values: List[float] = Field(..., description="Indicator values")
    timestamps: List[datetime] = Field(..., description="Corresponding timestamps")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Indicator parameters")

    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        }
    )


class MarketIndex(BaseModel):
    """Market index information."""
    symbol: str = Field(..., description="Index symbol (e.g., 000001.SH)")
    name: str = Field(..., description="Index name")
    price: float = Field(..., description="Current price")
    change: float = Field(..., description="Price change")
    change_percent: float = Field(..., description="Price change percentage")
    timestamp: datetime = Field(..., description="Quote timestamp")

    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        }
    )


class DataQualityMetrics(BaseModel):
    """Data quality metrics."""
    symbol: str = Field(..., description="Stock symbol")
    completeness: float = Field(..., description="Data completeness (0-1)")
    accuracy: float = Field(..., description="Data accuracy (0-1)")
    timeliness: float = Field(..., description="Data timeliness (0-1)")
    consistency: float = Field(..., description="Data consistency (0-1)")
    total_records: int = Field(..., description="Total records")
    missing_records: int = Field(..., description="Missing records")
    duplicate_records: int = Field(..., description="Duplicate records")
    invalid_records: int = Field(..., description="Invalid records")
    last_update: datetime = Field(..., description="Last update timestamp")

    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        }
    )


class RealtimeMessage(BaseModel):
    """Real-time WebSocket message."""
    type: str = Field(..., description="Message type (quote, trade, alert)")
    data: Dict[str, Any] = Field(..., description="Message data")
    timestamp: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        }
    )


class CollectionResult(BaseModel):
    """Data collection result."""
    symbol: str = Field(..., description="Stock symbol")
    data_type: str = Field(..., description="Data type (quote, history)")
    success: bool = Field(..., description="Collection success")
    records_collected: int = Field(0, description="Number of records collected")
    error: Optional[str] = Field(None, description="Error message if failed")
    timestamp: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        }
    )


class MonitoringMetrics(BaseModel):
    """Data collection monitoring metrics."""
    total_collections: int = Field(..., description="Total collection attempts")
    successful_collections: int = Field(..., description="Successful collections")
    failed_collections: int = Field(..., description="Failed collections")
    success_rate: float = Field(..., description="Collection success rate")
    average_latency: float = Field(..., description="Average collection latency (ms)")
    last_collection: datetime = Field(..., description="Last collection timestamp")
    active_sources: List[str] = Field(..., description="Active data sources")
    data_coverage: Dict[str, float] = Field(..., description="Data coverage by symbol")

    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        }
    )