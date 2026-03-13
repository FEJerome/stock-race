"""
Collection logging system

Logs collection activities for debugging, monitoring, and auditing.

Outputs to:
1. Console (INFO level)
2. Optional: Database for persistent audit logs
3. Optional: File for long-term storage
"""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, asdict
from enum import Enum
import json


class LogStatus(Enum):
    """Collection log status"""
    SUCCESS = "success"
    ERROR = "error"
    TIMEOUT = "timeout"
    SKIPPED = "skipped"


@dataclass
class CollectionLog:
    """
    Collection log entry

    Attributes:
        timestamp: Log entry time
        collector_name: Collector identifier
        symbol: Stock symbol
        status: Collection status
        item_count: Number of items collected
        duration_ms: Collection duration in milliseconds
        error_message: Error description if failed
        metadata: Additional context data
    """
    timestamp: datetime
    collector_name: str
    symbol: str
    status: str  # success/error/timeout/skipped
    item_count: int = 0
    duration_ms: float = 0.0
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "timestamp": self.timestamp.isoformat(),
            "collector_name": self.collector_name,
            "symbol": self.symbol,
            "status": self.status,
            "item_count": self.item_count,
            "duration_ms": self.duration_ms,
            "error_message": self.error_message,
            "metadata": self.metadata
        }

    def to_json(self) -> str:
        """Convert to JSON string"""
        return json.dumps(self.to_dict(), ensure_ascii=False)


class CollectionLogger:
    """
    Collection activity logger

    Provides structured logging for data collection operations.
    Can be extended to support database persistence.

    Example:
        logger = CollectionLogger()

        # Log successful collection
        logger.log_success(
            collector_name="sina_news",
            symbol="000001.SZ",
            item_count=10,
            duration_ms=150.5
        )

        # Log failed collection
        logger.log_error(
            collector_name="sina_news",
            symbol="000001.SZ",
            error_message="Connection timeout",
            duration_ms=5000.0
        )
    """

    def __init__(self, max_memory_logs: int = 1000):
        """
        Initialize logger

        Args:
            max_memory_logs: Maximum number of logs to keep in memory
        """
        self._logs: List[CollectionLog] = []
        self._max_memory_logs = max_memory_logs

    def log(self, entry: CollectionLog):
        """
        Log a collection entry

        Args:
            entry: Collection log entry
        """
        self._logs.append(entry)

        # Trim memory logs if exceeded
        if len(self._logs) > self._max_memory_logs:
            self._logs = self._logs[-self._max_memory_logs:]

        # Console output
        self._output_to_console(entry)

    def _output_to_console(self, entry: CollectionLog):
        """Output log entry to console"""
        timestamp = entry.timestamp.strftime("%Y-%m-%d %H:%M:%S")

        if entry.status == "success":
            print(f"[{timestamp}] [Collector] {entry.collector_name} | "
                  f"{entry.symbol} | ✓ {entry.item_count} items | "
                  f"{entry.duration_ms:.1f}ms")
        elif entry.status == "error":
            print(f"[{timestamp}] [Collector] {entry.collector_name} | "
                  f"{entry.symbol} | ✗ ERROR | {entry.error_message}")
        elif entry.status == "timeout":
            print(f"[{timestamp}] [Collector] {entry.collector_name} | "
                  f"{entry.symbol} | ⏱ TIMEOUT | {entry.duration_ms:.1f}ms")
        elif entry.status == "skipped":
            print(f"[{timestamp}] [Collector] {entry.collector_name} | "
                  f"{entry.symbol} | ⊘ SKIPPED")

    def log_success(
        self,
        collector_name: str,
        symbol: str,
        item_count: int,
        duration_ms: float,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Log successful collection"""
        self.log(CollectionLog(
            timestamp=datetime.now(timezone.utc),
            collector_name=collector_name,
            symbol=symbol,
            status="success",
            item_count=item_count,
            duration_ms=duration_ms,
            metadata=metadata
        ))

    def log_error(
        self,
        collector_name: str,
        symbol: str,
        error_message: str,
        duration_ms: float = 0.0,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Log failed collection"""
        self.log(CollectionLog(
            timestamp=datetime.now(timezone.utc),
            collector_name=collector_name,
            symbol=symbol,
            status="error",
            error_message=error_message,
            duration_ms=duration_ms,
            metadata=metadata
        ))

    def log_timeout(
        self,
        collector_name: str,
        symbol: str,
        duration_ms: float,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Log timeout"""
        self.log(CollectionLog(
            timestamp=datetime.now(timezone.utc),
            collector_name=collector_name,
            symbol=symbol,
            status="timeout",
            duration_ms=duration_ms,
            metadata=metadata
        ))

    def log_skipped(
        self,
        collector_name: str,
        symbol: str,
        reason: str = "",
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Log skipped collection"""
        meta = metadata or {}
        if reason:
            meta["skip_reason"] = reason

        self.log(CollectionLog(
            timestamp=datetime.now(timezone.utc),
            collector_name=collector_name,
            symbol=symbol,
            status="skipped",
            metadata=meta
        ))

    def get_recent_logs(
        self,
        collector_name: Optional[str] = None,
        symbol: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100
    ) -> List[CollectionLog]:
        """
        Get recent logs with optional filtering

        Args:
            collector_name: Filter by collector name
            symbol: Filter by stock symbol
            status: Filter by status
            limit: Maximum number of logs to return

        Returns:
            List of collection logs (newest first)
        """
        logs = self._logs.copy()

        if collector_name:
            logs = [log for log in logs if log.collector_name == collector_name]

        if symbol:
            logs = [log for log in logs if log.symbol == symbol]

        if status:
            logs = [log for log in logs if log.status == status]

        # Return newest first
        return list(reversed(logs[-limit:]))

    def get_stats(self, collector_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Get collection statistics

        Args:
            collector_name: Filter by collector name (None = all)

        Returns:
            Statistics dictionary
        """
        logs = self._logs
        if collector_name:
            logs = [log for log in logs if log.collector_name == collector_name]

        if not logs:
            return {
                "total": 0,
                "success": 0,
                "error": 0,
                "timeout": 0,
                "skipped": 0,
                "success_rate": 0.0,
                "avg_duration_ms": 0.0
            }

        total = len(logs)
        success = sum(1 for log in logs if log.status == "success")
        error = sum(1 for log in logs if log.status == "error")
        timeout = sum(1 for log in logs if log.status == "timeout")
        skipped = sum(1 for log in logs if log.status == "skipped")

        success_logs = [log for log in logs if log.status == "success"]
        avg_duration = (
            sum(log.duration_ms for log in success_logs) / len(success_logs)
            if success_logs else 0.0
        )

        return {
            "total": total,
            "success": success,
            "error": error,
            "timeout": timeout,
            "skipped": skipped,
            "success_rate": success / total if total > 0 else 0.0,
            "avg_duration_ms": avg_duration
        }

    def clear(self):
        """Clear all in-memory logs"""
        self._logs.clear()


# Global logger instance
_default_logger: Optional[CollectionLogger] = None


def get_logger() -> CollectionLogger:
    """Get global collection logger instance"""
    global _default_logger
    if _default_logger is None:
        _default_logger = CollectionLogger()
    return _default_logger


def set_logger(logger: CollectionLogger):
    """Set global collection logger instance"""
    global _default_logger
    _default_logger = logger
