"""
Token Debouncer for Trading AI Service.

Implements a debounce mechanism to prevent excessive AI API calls
and control token costs. Minimum interval between requests is 5 minutes.
"""

from typing import Dict, Optional, Tuple, Any
from datetime import datetime, timedelta
from dataclasses import dataclass
from loguru import logger

from ..models.schemas import AIProvider


@dataclass(frozen=True)
class DebounceKey:
    """
    Key for debounce tracking.

    Uniquely identifies a decision request by account, symbol, and provider.
    """
    account_id: str
    symbol: str
    provider: AIProvider

    def __hash__(self) -> int:
        """Hash for use as dict key."""
        return hash((self.account_id, self.symbol, self.provider.value))

    def __eq__(self, other: object) -> bool:
        """Equality comparison."""
        if not isinstance(other, DebounceKey):
            return False
        return (
            self.account_id == other.account_id
            and self.symbol == other.symbol
            and self.provider == other.provider
        )


class TokenDebouncer:
    """
    Singleton debouncer for AI decision requests.

    Prevents event storms and controls token costs by enforcing
    a minimum interval between requests for the same account/symbol/provider.

    Default interval: 5 minutes (300 seconds)
    """

    _instance: Optional["TokenDebouncer"] = None
    _initialized: bool = False

    def __new__(cls, min_interval_seconds: int = 300) -> "TokenDebouncer":
        """Ensure singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, min_interval_seconds: int = 300):
        """
        Initialize the debouncer.

        Args:
            min_interval_seconds: Minimum seconds between requests (default: 300 = 5 minutes)
        """
        if not hasattr(self, '_last_request_times'):
            self._min_interval_seconds = min_interval_seconds
            self._last_request_times: Dict[DebounceKey, datetime] = {}

    def can_make_request(
        self,
        key: DebounceKey
    ) -> Tuple[bool, int]:
        """
        Check if a request can be made for the given key.

        Args:
            key: The debounce key (account_id, symbol, provider)

        Returns:
            Tuple of (can_request: bool, wait_time_seconds: int)
            - can_request: True if request is allowed, False if debounced
            - wait_time_seconds: Seconds to wait if debounced, 0 if allowed
        """
        now = datetime.now()
        last_request = self._last_request_times.get(key)

        if last_request is None:
            # No previous request, allow
            return True, 0

        elapsed = (now - last_request).total_seconds()

        if elapsed >= self._min_interval_seconds:
            # Enough time has passed, allow
            return True, 0

        # Still within debounce interval
        wait_time = int(self._min_interval_seconds - elapsed)
        logger.debug(
            f"⏳ Debounced request for {key.account_id}/{key.symbol}: "
            f"wait {wait_time}s"
        )
        return False, wait_time

    def record_request(self, key: DebounceKey) -> None:
        """
        Record a request timestamp for the given key.

        Args:
            key: The debounce key
        """
        self._last_request_times[key] = datetime.now()
        logger.debug(
            f"📝 Recorded request for {key.account_id}/{key.symbol} "
            f"with {key.provider.value}"
        )

    def get_remaining_seconds(self, key: DebounceKey) -> int:
        """
        Get remaining seconds until next allowed request.

        Args:
            key: The debounce key

        Returns:
            Seconds remaining (0 if request is allowed)
        """
        last_request = self._last_request_times.get(key)

        if last_request is None:
            return 0

        elapsed = (datetime.now() - last_request).total_seconds()
        remaining = max(0, int(self._min_interval_seconds - elapsed))

        return remaining

    def clear_record(self, key: DebounceKey) -> None:
        """
        Clear the record for a specific key.

        Args:
            key: The debounce key to clear
        """
        if key in self._last_request_times:
            del self._last_request_times[key]
            logger.debug(f"🗑️ Cleared debounce record for {key.account_id}/{key.symbol}")

    def clear_all_records(self) -> None:
        """Clear all debounce records."""
        self._last_request_times.clear()
        logger.info("🗑️ Cleared all debounce records")

    def get_stats(self) -> Dict[str, Any]:
        """
        Get debouncer statistics.

        Returns:
            Dictionary with statistics
        """
        now = datetime.now()
        active_records = 0
        expired_records = 0

        for key, timestamp in self._last_request_times.items():
            elapsed = (now - timestamp).total_seconds()
            if elapsed < self._min_interval_seconds:
                active_records += 1
            else:
                expired_records += 1

        return {
            "total_records": len(self._last_request_times),
            "active_records": active_records,
            "expired_records": expired_records,
            "min_interval_seconds": self._min_interval_seconds,
        }

    def cleanup_expired(self) -> int:
        """
        Remove expired records.

        Returns:
            Number of records removed
        """
        now = datetime.now()
        expired_keys = [
            key for key, timestamp in self._last_request_times.items()
            if (now - timestamp).total_seconds() >= self._min_interval_seconds
        ]

        for key in expired_keys:
            del self._last_request_times[key]

        if expired_keys:
            logger.debug(f"🧹 Cleaned up {len(expired_keys)} expired debounce records")

        return len(expired_keys)

    @property
    def min_interval_seconds(self) -> int:
        """Get the minimum interval in seconds."""
        return self._min_interval_seconds


class DebouncedDecisionService:
    """
    Wrapper for decision service with debouncing.

    Ensures that decision requests respect the minimum interval
    to prevent token cost explosions.
    """

    def __init__(self, decision_service, min_interval_seconds: int = 300):
        """
        Initialize the debounced service.

        Args:
            decision_service: The underlying decision service
            min_interval_seconds: Minimum seconds between requests
        """
        self._decision_service = decision_service
        self._debouncer = TokenDebouncer(min_interval_seconds)

    async def generate_decision(self, request, use_cache: bool = True):
        """
        Generate a decision with debouncing.

        Args:
            request: The decision request
            use_cache: Whether to use caching

        Returns:
            Decision result or None if debounced

        Raises:
            DebounceError: If request is debounced (with wait time)
        """
        from ..core.exceptions import DebounceError

        # Create debounce key
        key = DebounceKey(
            account_id=request.account_info.account_id,
            symbol=request.stock_data[0].symbol if request.stock_data else "unknown",
            provider=request.ai_provider
        )

        # Check if request is allowed
        can_request, wait_time = self._debouncer.can_make_request(key)

        if not can_request:
            raise DebounceError(
                message=f"Decision request debounced. Please wait {wait_time} seconds.",
                error_code="DECISION_DEBOUNCED",
                details={"wait_time_seconds": wait_time}
            )

        # Record the request
        self._debouncer.record_request(key)

        # Call the actual service
        return await self._decision_service.generate_decision(request, use_cache)
