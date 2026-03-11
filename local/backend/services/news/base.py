"""
Base NewsSource interface and data models

This is the abstract base class for all news sources.
All concrete implementations must inherit from NewsSource.

Reference: local/backend/services/market_data/base.py
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from enum import Enum
import hashlib


class NewsSourceStatus(Enum):
    """News source health status"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"


@dataclass
class NewsItem:
    """
    Raw news data (in-memory only, not stored to DB)

    Reference: NewsIntelligenceModel in models/database.py
    """
    id: str                           # URL MD5 as ID
    symbol: str                       # Stock symbol (e.g., "000001.SZ")
    title: str                        # Title (≤100 chars)
    summary: str                      # Summary (≤300 chars)
    source: str                       # Source identifier: sina/eastmoney
    url: str                          # Original URL
    publish_time: datetime            # Publication time
    collected_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None  # Expiration time (7 days)

    def __post_init__(self):
        """Set default expiration time if not provided"""
        if self.expires_at is None:
            self.expires_at = self.collected_at + timedelta(days=7)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "id": self.id,
            "symbol": self.symbol,
            "title": self.title,
            "summary": self.summary,
            "source": self.source,
            "url": self.url,
            "publish_time": self.publish_time.isoformat() if self.publish_time else None,
            "collected_at": self.collected_at.isoformat() if self.collected_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }

    @property
    def is_expired(self) -> bool:
        """Check if news item has expired"""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at


@dataclass
class NewsSourceHealth:
    """News source health information"""
    source_name: str
    status: NewsSourceStatus
    latency_ms: float
    last_success: Optional[datetime]
    error_rate: float
    weight: float = 1.0  # Current weight (0-1)


class NewsSource(ABC):
    """
    Abstract base class for news sources

    All news source implementations must inherit from this class
    and implement the abstract methods.
    """

    def __init__(self, name: str, priority: int = 100):
        """
        Initialize news source

        Args:
            name: Source identifier
            priority: Lower number = higher priority (default: 100)
        """
        self.name = name
        self.priority = priority
        self._health = NewsSourceHealth(
            source_name=name,
            status=NewsSourceStatus.UNKNOWN,
            latency_ms=0,
            last_success=None,
            error_rate=0.0,
            weight=1.0
        )

    @abstractmethod
    async def fetch_news(self, symbol: str, limit: int = 10) -> List[NewsItem]:
        """
        Get news for a specific stock

        Args:
            symbol: Stock symbol (e.g., "000001.SZ")
            limit: Maximum number of news items to fetch

        Returns:
            List of NewsItem objects
        """
        pass

    @abstractmethod
    async def fetch_by_keywords(self, keywords: List[str], limit: int = 10) -> List[NewsItem]:
        """
        Search news by keywords

        Args:
            keywords: List of keywords to search for
            limit: Maximum number of news items to fetch

        Returns:
            List of NewsItem objects
        """
        pass

    @abstractmethod
    async def health_check(self) -> NewsSourceHealth:
        """
        Check data source health

        Returns:
            Health status information
        """
        pass

    def get_health(self) -> NewsSourceHealth:
        """Get current health status"""
        return self._health

    def _update_health(self, status: NewsSourceStatus, latency_ms: float, success: bool = True):
        """Update health status (internal use)"""
        self._health.status = status
        self._health.latency_ms = latency_ms
        if success:
            self._health.last_success = datetime.utcnow()
            self._health.error_rate = max(0, self._health.error_rate - 0.1)
        else:
            self._health.error_rate = min(1.0, self._health.error_rate + 0.1)

    def _generate_id(self, url: str) -> str:
        """
        Generate unique ID from URL using MD5 hash

        Args:
            url: News article URL

        Returns:
            MD5 hash string (32 characters)
        """
        return hashlib.md5(url.encode('utf-8')).hexdigest()

    def _normalize_symbol(self, symbol: str) -> str:
        """
        Normalize symbol to standard format

        Args:
            symbol: Stock symbol (e.g., "000001.SZ", "sz000001")

        Returns:
            Standard format symbol (e.g., "000001.SZ")
        """
        symbol = symbol.upper()

        # Handle various formats
        if symbol.startswith("SH") and "." not in symbol:
            # sh600000 -> 600000.SH
            return f"{symbol[2:]}.SH"
        elif symbol.startswith("SZ") and "." not in symbol:
            # sz000001 -> 000001.SZ
            return f"{symbol[2:]}.SZ"
        elif "." not in symbol:
            # Infer exchange from code
            if symbol.startswith("6"):
                return f"{symbol}.SH"
            else:
                return f"{symbol}.SZ"

        return symbol

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(name={self.name}, priority={self.priority})"
