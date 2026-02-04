"""
Market monitor service.
"""

import asyncio
import logging
from typing import Dict, Any
from loguru import logger


class MarketMonitor:
    """Market monitor service."""

    def __init__(self):
        logger.info("Initializing MarketMonitor")
        self.is_monitoring = False
        self.task = None

    async def start(self):
        """Start market monitoring."""
        if self.is_monitoring:
            return
        self.is_monitoring = True
        self.task = asyncio.create_task(self._monitor_loop())
        logger.info("MarketMonitor started")

    async def stop(self):
        """Stop market monitoring."""
        self.is_monitoring = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("MarketMonitor stopped")

    async def _monitor_loop(self):
        """Market monitoring loop."""
        while self.is_monitoring:
            try:
                # Simulate market monitoring
                await asyncio.sleep(60)  # Check every minute
                logger.debug("Market monitoring check")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in market monitoring: {e}")
                await asyncio.sleep(10)