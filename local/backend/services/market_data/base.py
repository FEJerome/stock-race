"""
Base DataSource interface and data models

This is the abstract base class for all market data sources.
All concrete implementations must inherit from DataSource.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum


class DataSourceStatus(Enum):
    """Data source health status"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"


@dataclass
class Quote:
    """Stock quote data"""
    symbol: str                    # 股票代码，如 "000001.SZ"
    name: str                      # 股票名称
    price: float                   # 当前价格
    change: float                  # 涨跌额
    change_percent: float          # 涨跌幅（百分比）
    volume: int                    # 成交量（股）
    amount: Optional[float] = None # 成交额
    open: Optional[float] = None   # 开盘价
    high: Optional[float] = None   # 最高价
    low: Optional[float] = None    # 最低价
    prev_close: Optional[float] = None  # 昨收价
    timestamp: Optional[datetime] = None  # 数据时间戳
    source: Optional[str] = None   # 数据来源标识

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "symbol": self.symbol,
            "name": self.name,
            "price": self.price,
            "change": self.change,
            "change_percent": self.change_percent,
            "volume": self.volume,
            "amount": self.amount,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "prev_close": self.prev_close,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "source": self.source,
        }


@dataclass
class MarketData:
    """Aggregated market data from multiple sources"""
    symbol: str
    name: str
    price: float
    change: float
    change_percent: float
    volume: int
    timestamp: datetime
    sources: List[str]  # 数据来源列表
    confidence: float   # 数据置信度 (0-1)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "symbol": self.symbol,
            "name": self.name,
            "price": self.price,
            "change": self.change,
            "change_percent": self.change_percent,
            "volume": self.volume,
            "timestamp": self.timestamp.isoformat(),
            "sources": self.sources,
            "confidence": self.confidence,
        }


@dataclass
class DataSourceHealth:
    """Data source health information"""
    source_name: str
    status: DataSourceStatus
    latency_ms: float
    last_success: Optional[datetime]
    error_rate: float
    weight: float  # 当前权重 (0-1)


class DataSource(ABC):
    """
    Abstract base class for market data sources

    All data source implementations must inherit from this class
    and implement the abstract methods.
    """

    def __init__(self, name: str, priority: int = 100):
        """
        Initialize data source

        Args:
            name: Source identifier
            priority: Lower number = higher priority (default: 100)
        """
        self.name = name
        self.priority = priority
        self._health = DataSourceHealth(
            source_name=name,
            status=DataSourceStatus.UNKNOWN,
            latency_ms=0,
            last_success=None,
            error_rate=0,
            weight=1.0
        )

    @abstractmethod
    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """
        Get real-time quote for a single stock

        Args:
            symbol: Stock symbol (e.g., "000001.SZ")

        Returns:
            Quote object or None if unavailable
        """
        pass

    @abstractmethod
    async def get_quotes(self, symbols: List[str]) -> Dict[str, Optional[Quote]]:
        """
        Get real-time quotes for multiple stocks

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to Quote (or None if unavailable)
        """
        pass

    @abstractmethod
    async def get_all_stocks(self) -> List[Quote]:
        """
        Get quotes for all available stocks

        Returns:
            List of Quote objects
        """
        pass

    @abstractmethod
    async def health_check(self) -> DataSourceHealth:
        """
        Check data source health

        Returns:
            Health status information
        """
        pass

    def get_health(self) -> DataSourceHealth:
        """Get current health status"""
        return self._health

    def _update_health(self, status: DataSourceStatus, latency_ms: float, success: bool = True):
        """Update health status (internal use)"""
        self._health.status = status
        self._health.latency_ms = latency_ms
        if success:
            self._health.last_success = datetime.utcnow()
            self._health.error_rate = max(0, self._health.error_rate - 0.1)
        else:
            self._health.error_rate = min(1.0, self._health.error_rate + 0.1)

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(name={self.name}, priority={self.priority})"
