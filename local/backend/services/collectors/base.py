"""
Base Collector interface and data models

This is the abstract base class for all data collectors.
All concrete implementations must inherit from BaseCollector.

Reference: local/backend/services/news/base.py
"""
from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from enum import Enum


class CollectorStatus(Enum):
    """Collector health status"""
    IDLE = "idle"
    RUNNING = "running"
    ERROR = "error"
    PAUSED = "paused"


@dataclass
class CollectionResult:
    """
    Collection result container

    Attributes:
        source_name: Data source identifier
        symbol: Stock symbol (e.g., "000001.SZ")
        items: Collected data items
        count: Number of items collected
        start_time: Collection start timestamp
        end_time: Collection end timestamp
        success: Whether collection succeeded
        error_message: Error description if failed
        next_since: Timestamp for next incremental collection
    """
    source_name: str
    symbol: str
    items: List[Any]
    count: int
    start_time: datetime
    end_time: datetime
    success: bool
    error_message: Optional[str] = None
    next_since: Optional[datetime] = None

    @property
    def duration_ms(self) -> float:
        """Calculate collection duration in milliseconds"""
        return (self.end_time - self.start_time).total_seconds() * 1000


@dataclass
class CollectorHealth:
    """
    Collector health information

    Attributes:
        source_name: Data source identifier
        status: Current status
        last_success: Timestamp of last successful collection
        last_error: Last error message
        total_requests: Total request count
        success_count: Successful request count
        error_count: Failed request count
        avg_latency_ms: Average latency in milliseconds
    """
    source_name: str
    status: CollectorStatus
    last_success: Optional[datetime]
    last_error: Optional[str]
    total_requests: int = 0
    success_count: int = 0
    error_count: int = 0
    avg_latency_ms: float = 0.0

    @property
    def success_rate(self) -> float:
        """Calculate success rate (0-1)"""
        if self.total_requests == 0:
            return 1.0
        return self.success_count / self.total_requests


class BaseCollector(ABC):
    """
    Abstract base class for all data collectors

    Design principles:
    1. Single Responsibility: One collector per data source
    2. Incremental Collection: Support resumable collection via 'since' parameter
    3. Error Isolation: One collector failure doesn't affect others
    4. Observability: Automatic collection logging

    Example:
        class NewsCollector(BaseCollector):
            async def collect(self, symbol, since=None, limit=100):
                # Implementation
                return CollectionResult(...)

            def get_source_name(self) -> str:
                return "sina_news"
    """

    def __init__(self, name: str, priority: int = 100):
        """
        Initialize collector

        Args:
            name: Source identifier
            priority: Lower number = higher priority (default: 100)
        """
        self.name = name
        self.priority = priority
        self._health = CollectorHealth(
            source_name=name,
            status=CollectorStatus.IDLE,
            last_success=None,
            last_error=None
        )
        self._last_since: Dict[str, datetime] = {}

    @abstractmethod
    async def collect(
        self,
        symbol: str,
        since: Optional[datetime] = None,
        limit: int = 100
    ) -> CollectionResult:
        """
        Execute collection

        Args:
            symbol: Stock symbol (e.g., "000001.SZ")
            since: Incremental collection start time (None = full collection)
            limit: Maximum items to collect

        Returns:
            CollectionResult with collected data and metadata

        Note:
            Implementations should filter items with publish_time > since
            and set next_since to the latest item's timestamp.
        """
        pass

    @abstractmethod
    def get_source_name(self) -> str:
        """Return data source name"""
        pass

    async def health_check(self) -> CollectorHealth:
        """Check collector health status"""
        return self._health

    def get_last_since(self, symbol: str) -> Optional[datetime]:
        """Get last collection time for a symbol"""
        return self._last_since.get(symbol)

    def update_last_since(self, symbol: str, since: datetime):
        """Update last collection time for a symbol"""
        self._last_since[symbol] = since

    def _update_health_success(self, latency_ms: float):
        """Update health status after successful collection (internal use)"""
        self._health.status = CollectorStatus.IDLE
        self._health.last_success = datetime.utcnow()
        self._health.total_requests += 1
        self._health.success_count += 1
        # Update average latency using moving average
        if self._health.avg_latency_ms == 0:
            self._health.avg_latency_ms = latency_ms
        else:
            self._health.avg_latency_ms = (
                self._health.avg_latency_ms * 0.9 + latency_ms * 0.1
            )

    def _update_health_error(self, error_message: str):
        """Update health status after failed collection (internal use)"""
        self._health.status = CollectorStatus.ERROR
        self._health.last_error = error_message
        self._health.total_requests += 1
        self._health.error_count += 1

    def _set_running(self):
        """Set status to running (internal use)"""
        self._health.status = CollectorStatus.RUNNING

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(name={self.name}, priority={self.priority})"
