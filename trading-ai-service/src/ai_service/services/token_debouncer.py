"""
Token debouncer for Trading AI Service.

Prevents event storms and controls token costs by enforcing minimum
decision intervals per account + symbol + provider combination.
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple, Any
from threading import Lock

from loguru import logger

from ..models.schemas import AIProvider


@dataclass(frozen=True)
class DebounceKey:
    """
    Composite key for debounce tracking.

    Combines account_id, symbol, and provider to create a unique
    identifier for rate limiting decisions.

    Attributes:
        account_id: The AI account ID
        symbol: The stock symbol (e.g., "000001.SZ")
        provider: The AI provider (e.g., AIProvider.OPENAI)
    """
    account_id: str
    symbol: str
    provider: AIProvider


class TokenDebouncer:
    """
    Singleton debouncer for controlling AI decision frequency.

    Prevents excessive token costs by enforcing a minimum interval
    between decisions for the same account + symbol + provider combination.

    Default interval is 5 minutes (300 seconds).

    Example:
        >>> debouncer = TokenDebouncer()
        >>> key = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)
        >>>
        >>> # Check if request is allowed
        >>> can_request, wait_time = debouncer.can_make_request(key)
        >>> if can_request:
        ...     # Make AI decision
        ...     debouncer.record_request(key)
        ... else:
        ...     print(f"Please wait {wait_time} seconds")
    """

    _instance: Optional['TokenDebouncer'] = None
    _initialized: bool = False
    _lock: Lock = Lock()

    def __new__(cls, *args, **kwargs) -> 'TokenDebouncer':
        """Ensure singleton pattern."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, min_interval_seconds: int = 300):
        """
        Initialize the debouncer.

        Args:
            min_interval_seconds: Minimum interval between requests (default: 300 = 5 minutes)
        """
        if not self._initialized:
            self._min_interval_seconds: int = min_interval_seconds
            self._last_request_times: Dict[DebounceKey, datetime] = {}
            self._instance_lock: Lock = Lock()
            TokenDebouncer._initialized = True
            logger.info(f"TokenDebouncer initialized with {min_interval_seconds}s interval")

    def can_make_request(self, key: DebounceKey) -> Tuple[bool, int]:
        """
        Check if a request is allowed for the given key.

        Args:
            key: The DebounceKey to check

        Returns:
            Tuple[bool, int]: (is_allowed, remaining_seconds)
                - is_allowed: True if request can proceed, False if debounced
                - remaining_seconds: Seconds to wait if debounced, 0 if allowed
        """
        with self._instance_lock:
            last_request = self._last_request_times.get(key)

            if last_request is None:
                # No previous request, allow immediately
                return True, 0

            elapsed = (datetime.now() - last_request).total_seconds()
            remaining = self._min_interval_seconds - elapsed

            if remaining <= 0:
                # Interval has passed, allow request
                return True, 0
            else:
                # Still within debounce interval
                logger.debug(
                    f"Request debounced for {key.account_id}/{key.symbol}: "
                    f"{remaining:.1f}s remaining"
                )
                return False, int(remaining)

    def record_request(self, key: DebounceKey) -> None:
        """
        Record a request timestamp for the given key.

        This should be called after a successful AI decision to mark
        the start of the debounce interval.

        Args:
            key: The DebounceKey to record
        """
        with self._instance_lock:
            self._last_request_times[key] = datetime.now()
            logger.debug(
                f"Recorded request for {key.account_id}/{key.symbol} "
                f"with {self._min_interval_seconds}s interval"
            )

    def get_remaining_seconds(self, key: DebounceKey) -> int:
        """
        Get the remaining debounce time for a key.

        Args:
            key: The DebounceKey to check

        Returns:
            int: Remaining seconds (0 if no record or interval passed)
        """
        with self._instance_lock:
            last_request = self._last_request_times.get(key)

            if last_request is None:
                return 0

            elapsed = (datetime.now() - last_request).total_seconds()
            remaining = self._min_interval_seconds - elapsed

            return max(0, int(remaining))

    def clear_record(self, key: DebounceKey) -> None:
        """
        Clear the debounce record for a specific key.

        Args:
            key: The DebounceKey to clear
        """
        with self._instance_lock:
            if key in self._last_request_times:
                del self._last_request_times[key]
                logger.debug(f"Cleared debounce record for {key.account_id}/{key.symbol}")

    def clear_all_records(self) -> None:
        """Clear all debounce records."""
        with self._instance_lock:
            count = len(self._last_request_times)
            self._last_request_times.clear()
            logger.info(f"Cleared all {count} debounce records")

    def get_stats(self) -> Dict[str, Any]:
        """
        Get debouncer statistics.

        Returns:
            Dict with statistics:
                - total_records: Number of tracked keys
                - min_interval_seconds: Current debounce interval
        """
        with self._instance_lock:
            return {
                "total_records": len(self._last_request_times),
                "min_interval_seconds": self._min_interval_seconds,
            }

    def cleanup_expired(self) -> int:
        """
        Remove expired records that are beyond the debounce interval.

        Returns:
            int: Number of records removed
        """
        with self._instance_lock:
            now = datetime.now()
            expired_keys = [
                key for key, timestamp in self._last_request_times.items()
                if (now - timestamp).total_seconds() > self._min_interval_seconds
            ]

            for key in expired_keys:
                del self._last_request_times[key]

            if expired_keys:
                logger.debug(f"Cleaned up {len(expired_keys)} expired debounce records")

            return len(expired_keys)


# Global debouncer instance
def get_debouncer(min_interval_seconds: int = 300) -> TokenDebouncer:
    """
    Get the global TokenDebouncer instance.

    Args:
        min_interval_seconds: Minimum interval (only used on first call)

    Returns:
        TokenDebouncer: The singleton instance
    """
    return TokenDebouncer(min_interval_seconds=min_interval_seconds)
