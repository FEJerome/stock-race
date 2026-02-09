"""
Market monitor service for monitoring market status and scheduling data collection.
"""

import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

from ..core.config import settings

logger = logging.getLogger(__name__)


class MarketMonitor:
    """
    Market monitor for tracking market hours and scheduling data collection.
    """

    def __init__(self):
        self.is_running = False
        self.monitor_task: Optional[asyncio.Task] = None
        self.last_market_status = None
        self.collection_interval = settings.COLLECTION_INTERVAL
        self.stats = {
            "monitor_start_time": None,
            "total_checks": 0,
            "market_open_count": 0,
            "market_closed_count": 0
        }

    async def start(self):
        """Start the market monitor."""
        if self.is_running:
            logger.warning("Market monitor is already running")
            return

        self.is_running = True
        self.stats["monitor_start_time"] = datetime.now()
        self.monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("Market monitor started")

    async def stop(self):
        """Stop the market monitor."""
        if not self.is_running:
            return

        self.is_running = False

        if self.monitor_task:
            self.monitor_task.cancel()
            try:
                await self.monitor_task
            except asyncio.CancelledError:
                pass
            self.monitor_task = None

        logger.info("Market monitor stopped")

    async def _monitor_loop(self):
        """Main monitoring loop."""
        while self.is_running:
            try:
                await self._check_market_status()
                await asyncio.sleep(self.collection_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in market monitor loop: {str(e)}")
                await asyncio.sleep(60)  # Wait 1 minute before retrying

    async def _check_market_status(self):
        """Check current market status."""
        self.stats["total_checks"] += 1

        is_open = self.is_market_hours()

        if is_open != self.last_market_status:
            if is_open:
                logger.info("Market is now OPEN")
                self.stats["market_open_count"] += 1
            else:
                logger.info("Market is now CLOSED")
                self.stats["market_closed_count"] += 1

            self.last_market_status = is_open

    def is_market_hours(self) -> bool:
        """
        Check if current time is within market hours.

        Returns:
            True if market is open, False otherwise
        """
        now = datetime.now()

        # Check if weekend
        if now.weekday() >= 5:  # Saturday or Sunday
            return False

        # Check market hours
        market_open = now.replace(
            hour=settings.MARKET_OPEN_HOUR,
            minute=settings.MARKET_OPEN_MINUTE,
            second=0,
            microsecond=0
        )

        market_close = now.replace(
            hour=settings.MARKET_CLOSE_HOUR,
            minute=settings.MARKET_CLOSE_MINUTE,
            second=0,
            microsecond=0
        )

        return market_open <= now <= market_close

    def get_next_market_open(self) -> Optional[datetime]:
        """
        Get next market open time.

        Returns:
            Next market open datetime or None
        """
        now = datetime.now()

        # If market is open, next open is tomorrow
        if self.is_market_hours():
            next_day = now + timedelta(days=1)
            # Skip weekends
            while next_day.weekday() >= 5:
                next_day += timedelta(days=1)
            return next_day.replace(
                hour=settings.MARKET_OPEN_HOUR,
                minute=settings.MARKET_OPEN_MINUTE,
                second=0,
                microsecond=0
            )

        # If before market open today
        market_open_today = now.replace(
            hour=settings.MARKET_OPEN_HOUR,
            minute=settings.MARKET_OPEN_MINUTE,
            second=0,
            microsecond=0
        )

        if now < market_open_today and now.weekday() < 5:
            return market_open_today

        # Next open is next trading day
        next_day = now + timedelta(days=1)
        while next_day.weekday() >= 5:
            next_day += timedelta(days=1)

        return next_day.replace(
            hour=settings.MARKET_OPEN_HOUR,
            minute=settings.MARKET_OPEN_MINUTE,
            second=0,
            microsecond=0
        )

    def get_stats(self) -> Dict[str, Any]:
        """Get monitor statistics."""
        return {
            **self.stats,
            "is_running": self.is_running,
            "current_status": "open" if self.is_market_hours() else "closed",
            "next_market_open": self.get_next_market_open().isoformat() if self.get_next_market_open() else None
        }
