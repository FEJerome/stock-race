"""
Data collector service for coordinating data collection tasks.
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from ..collectors.base import DataSource
from ..collectors.sina import SinaCollector
from ..collectors.tencent import TencentCollector
from ..collectors.eastmoney import EastMoneyCollector
from ..processors.data_processor import DataProcessor
from ..storage.database import DatabaseStorage
from ..storage.cache import RedisCache, get_redis_cache

logger = logging.getLogger(__name__)


class DataCollector:
    """
    Data collector coordinator.
    Manages data sources and coordinates data collection tasks.
    """

    def __init__(self):
        self.data_sources: List[DataSource] = []
        self.data_processor = DataProcessor()
        self.database_storage = DatabaseStorage()
        self.redis_cache = get_redis_cache()
        self.is_initialized = False
        self.collection_stats = {
            "total_collections": 0,
            "successful_collections": 0,
            "failed_collections": 0,
            "last_collection": None
        }

    async def initialize(self):
        """Initialize the data collector."""
        if self.is_initialized:
            return

        try:
            # Initialize data sources
            self.data_sources = [
                SinaCollector(),
                TencentCollector(),
                EastMoneyCollector()
            ]

            # Initialize storage
            await self.database_storage.connect()
            await self.redis_cache.connect()

            # Initialize data sources
            for source in self.data_sources:
                await source.__aenter__()

            self.is_initialized = True
            logger.info("Data collector initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize data collector: {str(e)}")
            raise

    async def close(self):
        """Close the data collector and cleanup resources."""
        try:
            # Close data sources
            for source in self.data_sources:
                try:
                    await source.close()
                except Exception as e:
                    logger.error(f"Failed to close data source {source.name}: {str(e)}")

            # Close storage
            await self.database_storage.close()
            await self.redis_cache.close()

            self.is_initialized = False
            logger.info("Data collector closed")

        except Exception as e:
            logger.error(f"Error closing data collector: {str(e)}")

    async def collect_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Collect real-time quote for a symbol.

        Args:
            symbol: Stock symbol

        Returns:
            Quote data or None if failed
        """
        if not self.is_initialized:
            await self.initialize()

        for source in sorted(self.data_sources, key=lambda x: x.priority):
            try:
                quote = await source.get_stock_quote(symbol)
                if quote:
                    self.collection_stats["successful_collections"] += 1
                    return quote
            except Exception as e:
                logger.warning(f"Failed to get quote from {source.name}: {str(e)}")
                continue

        self.collection_stats["failed_collections"] += 1
        return None

    async def collect_batch_quotes(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Collect real-time quotes for multiple symbols.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to quote data
        """
        if not self.is_initialized:
            await self.initialize()

        quotes = {}

        for source in sorted(self.data_sources, key=lambda x: x.priority):
            try:
                batch_quotes = await source.get_batch_quotes(symbols)
                if batch_quotes:
                    quotes.update(batch_quotes)
                    # If we got all symbols, break
                    if len(quotes) == len(symbols):
                        break
            except Exception as e:
                logger.warning(f"Failed to get batch quotes from {source.name}: {str(e)}")
                continue

        self.collection_stats["total_collections"] += 1
        self.collection_stats["last_collection"] = datetime.now()

        return quotes

    async def collect_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> List[Dict[str, Any]]:
        """
        Collect historical data for a symbol.

        Args:
            symbol: Stock symbol
            start_date: Start date
            end_date: End date
            interval: Data interval

        Returns:
            List of historical data points
        """
        if not self.is_initialized:
            await self.initialize()

        for source in sorted(self.data_sources, key=lambda x: x.priority):
            try:
                history = await source.get_stock_history(symbol, start_date, end_date, interval)
                if history:
                    return history
            except Exception as e:
                logger.warning(f"Failed to get history from {source.name}: {str(e)}")
                continue

        return []

    def get_stats(self) -> Dict[str, Any]:
        """Get collection statistics."""
        return {
            **self.collection_stats,
            "data_sources": [source.name for source in self.data_sources],
            "is_initialized": self.is_initialized
        }
