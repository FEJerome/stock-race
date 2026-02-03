"""
Redis cache layer for stock data.
"""

import json
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Set
import logging
import aioredis

from ..core.config import settings
from ..models.stock import StockQuote, StockSymbol

logger = logging.getLogger(__name__)


class RedisCache:
    """Redis cache for stock data."""

    def __init__(self):
        self.redis: Optional[aioredis.Redis] = None
        self.pubsub: Optional[aioredis.client.PubSub] = None

    async def connect(self):
        """Connect to Redis."""
        try:
            self.redis = await aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True
            )
            await self.redis.ping()
            logger.info("Connected to Redis")

        except Exception as e:
            logger.error(f"Failed to connect to Redis: {str(e)}")
            raise

    async def close(self):
        """Close Redis connection."""
        if self.redis:
            await self.redis.close()
            logger.info("Closed Redis connection")

    async def cache_stock_quote(self, quote: StockQuote, ttl: int = 60):
        """
        Cache stock quote in Redis.

        Args:
            quote: StockQuote object
            ttl: Time to live in seconds
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            # Convert to dictionary
            quote_dict = quote.dict()
            quote_dict["timestamp"] = quote.timestamp.isoformat()

            # Cache individual quote
            quote_key = f"stock:quote:{quote.symbol}"
            await self.redis.setex(
                quote_key,
                ttl,
                json.dumps(quote_dict)
            )

            # Add to recent quotes sorted set (for quick access to latest quotes)
            await self.redis.zadd(
                "stock:quotes:recent",
                {quote.symbol: quote.timestamp.timestamp()}
            )

            # Keep only last 1000 symbols in sorted set
            await self.redis.zremrangebyrank("stock:quotes:recent", 0, -1001)

            # Publish update to channel
            await self.publish_quote_update(quote)

            logger.debug(f"Cached quote for {quote.symbol}")

        except Exception as e:
            logger.error(f"Failed to cache quote for {quote.symbol}: {str(e)}")

    async def get_cached_quote(self, symbol: str) -> Optional[StockQuote]:
        """
        Get cached stock quote from Redis.

        Args:
            symbol: Stock symbol

        Returns:
            StockQuote object or None if not found
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            quote_key = f"stock:quote:{symbol}"
            quote_json = await self.redis.get(quote_key)

            if not quote_json:
                return None

            quote_dict = json.loads(quote_json)
            quote_dict["timestamp"] = datetime.fromisoformat(quote_dict["timestamp"])

            return StockQuote(**quote_dict)

        except Exception as e:
            logger.error(f"Failed to get cached quote for {symbol}: {str(e)}")
            return None

    async def get_batch_cached_quotes(self, symbols: List[str]) -> Dict[str, StockQuote]:
        """
        Get cached quotes for multiple stocks.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to StockQuote
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        quotes = {}

        try:
            # Use pipeline for batch get
            async with self.redis.pipeline() as pipe:
                for symbol in symbols:
                    pipe.get(f"stock:quote:{symbol}")

                results = await pipe.execute()

                for symbol, result in zip(symbols, results):
                    if result:
                        try:
                            quote_dict = json.loads(result)
                            quote_dict["timestamp"] = datetime.fromisoformat(quote_dict["timestamp"])
                            quotes[symbol] = StockQuote(**quote_dict)
                        except (json.JSONDecodeError, KeyError) as e:
                            logger.debug(f"Invalid cached quote for {symbol}: {str(e)}")
                            continue

        except Exception as e:
            logger.error(f"Failed to get batch cached quotes: {str(e)}")

        return quotes

    async def cache_stock_info(self, stock_info: StockSymbol, ttl: int = 3600):
        """
        Cache stock information in Redis.

        Args:
            stock_info: StockSymbol object
            ttl: Time to live in seconds
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            # Convert to dictionary
            info_dict = stock_info.dict()
            info_dict["created_at"] = stock_info.created_at.isoformat()
            info_dict["updated_at"] = stock_info.updated_at.isoformat()
            if stock_info.listing_date:
                info_dict["listing_date"] = stock_info.listing_date.isoformat()

            # Cache stock info
            info_key = f"stock:info:{stock_info.symbol}"
            await self.redis.setex(
                info_key,
                ttl,
                json.dumps(info_dict)
            )

            # Add to stock index
            await self.redis.sadd("stock:index", stock_info.symbol)

            logger.debug(f"Cached info for {stock_info.symbol}")

        except Exception as e:
            logger.error(f"Failed to cache stock info for {stock_info.symbol}: {str(e)}")

    async def get_cached_stock_info(self, symbol: str) -> Optional[StockSymbol]:
        """
        Get cached stock information from Redis.

        Args:
            symbol: Stock symbol

        Returns:
            StockSymbol object or None if not found
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            info_key = f"stock:info:{symbol}"
            info_json = await self.redis.get(info_key)

            if not info_json:
                return None

            info_dict = json.loads(info_json)
            info_dict["created_at"] = datetime.fromisoformat(info_dict["created_at"])
            info_dict["updated_at"] = datetime.fromisoformat(info_dict["updated_at"])
            if info_dict.get("listing_date"):
                info_dict["listing_date"] = datetime.fromisoformat(info_dict["listing_date"])

            return StockSymbol(**info_dict)

        except Exception as e:
            logger.error(f"Failed to get cached stock info for {symbol}: {str(e)}")
            return None

    async def cache_market_status(self, status: Dict[str, Any], ttl: int = 300):
        """
        Cache market status in Redis.

        Args:
            status: Market status dictionary
            ttl: Time to live in seconds
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            status["timestamp"] = datetime.now().isoformat()
            await self.redis.setex(
                "market:status",
                ttl,
                json.dumps(status)
            )
        except Exception as e:
            logger.error(f"Failed to cache market status: {str(e)}")

    async def get_cached_market_status(self) -> Optional[Dict[str, Any]]:
        """
        Get cached market status from Redis.

        Returns:
            Market status dictionary or None if not found
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            status_json = await self.redis.get("market:status")
            if not status_json:
                return None

            status = json.loads(status_json)
            return status
        except Exception as e:
            logger.error(f"Failed to get cached market status: {str(e)}")
            return None

    async def cache_market_indices(self, indices: List[Dict[str, Any]], ttl: int = 300):
        """
        Cache market indices in Redis.

        Args:
            indices: List of market index dictionaries
            ttl: Time to live in seconds
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            for index in indices:
                index["timestamp"] = datetime.now().isoformat()
                symbol = index.get("symbol", "unknown")
                await self.redis.setex(
                    f"market:index:{symbol}",
                    ttl,
                    json.dumps(index)
                )
        except Exception as e:
            logger.error(f"Failed to cache market indices: {str(e)}")

    async def get_cached_market_indices(self) -> List[Dict[str, Any]]:
        """
        Get cached market indices from Redis.

        Returns:
            List of market index dictionaries
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        indices = []

        try:
            # Get all index keys
            keys = await self.redis.keys("market:index:*")

            for key in keys:
                try:
                    index_json = await self.redis.get(key)
                    if index_json:
                        indices.append(json.loads(index_json))
                except (json.JSONDecodeError, KeyError):
                    continue

        except Exception as e:
            logger.error(f"Failed to get cached market indices: {str(e)}")

        return indices

    async def cache_technical_indicators(
        self,
        symbol: str,
        indicators: Dict[str, Any],
        ttl: int = 3600
    ):
        """
        Cache technical indicators in Redis.

        Args:
            symbol: Stock symbol
            indicators: Technical indicators dictionary
            ttl: Time to live in seconds
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            indicators["timestamp"] = datetime.now().isoformat()
            await self.redis.setex(
                f"stock:technical:{symbol}",
                ttl,
                json.dumps(indicators)
            )
        except Exception as e:
            logger.error(f"Failed to cache technical indicators for {symbol}: {str(e)}")

    async def get_cached_technical_indicators(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Get cached technical indicators from Redis.

        Args:
            symbol: Stock symbol

        Returns:
            Technical indicators dictionary or None if not found
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            indicators_json = await self.redis.get(f"stock:technical:{symbol}")
            if not indicators_json:
                return None

            return json.loads(indicators_json)
        except Exception as e:
            logger.error(f"Failed to get cached technical indicators for {symbol}: {str(e)}")
            return None

    async def publish_quote_update(self, quote: StockQuote):
        """
        Publish quote update to Redis channel.

        Args:
            quote: StockQuote object
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            message = {
                "type": "quote_update",
                "symbol": quote.symbol,
                "data": quote.dict(),
                "timestamp": datetime.now().isoformat()
            }

            await self.redis.publish(
                "stock:updates",
                json.dumps(message)
            )

            # Also publish to symbol-specific channel
            await self.redis.publish(
                f"stock:{quote.symbol}:updates",
                json.dumps(message)
            )

        except Exception as e:
            logger.error(f"Failed to publish quote update for {quote.symbol}: {str(e)}")

    async def subscribe_to_updates(self, callback):
        """
        Subscribe to stock updates.

        Args:
            callback: Callback function to handle messages
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            self.pubsub = self.redis.pubsub()
            await self.pubsub.subscribe("stock:updates")

            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        await callback(data)
                    except (json.JSONDecodeError, KeyError) as e:
                        logger.error(f"Failed to process update message: {str(e)}")

        except Exception as e:
            logger.error(f"Failed to subscribe to updates: {str(e)}")
            raise

    async def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get Redis cache statistics.

        Returns:
            Dictionary with cache statistics
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            # Get info from Redis
            info = await self.redis.info()

            # Count cached items
            quote_keys = await self.redis.keys("stock:quote:*")
            info_keys = await self.redis.keys("stock:info:*")
            technical_keys = await self.redis.keys("stock:technical:*")

            stats = {
                "redis_version": info.get("redis_version", "unknown"),
                "used_memory": info.get("used_memory_human", "0"),
                "connected_clients": info.get("connected_clients", 0),
                "total_commands_processed": info.get("total_commands_processed", 0),
                "cached_quotes": len(quote_keys),
                "cached_stock_info": len(info_keys),
                "cached_technical_indicators": len(technical_keys),
                "timestamp": datetime.now().isoformat()
            }

            return stats

        except Exception as e:
            logger.error(f"Failed to get cache stats: {str(e)}")
            return {
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    async def clear_cache(self, pattern: str = "stock:*"):
        """
        Clear cache entries matching pattern.

        Args:
            pattern: Redis key pattern
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            keys = await self.redis.keys(pattern)
            if keys:
                await self.redis.delete(*keys)
                logger.info(f"Cleared {len(keys)} cache entries matching {pattern}")
        except Exception as e:
            logger.error(f"Failed to clear cache: {str(e)}")

    async def get_recently_updated_symbols(self, limit: int = 50) -> List[str]:
        """
        Get recently updated stock symbols.

        Args:
            limit: Maximum number of symbols to return

        Returns:
            List of stock symbols
        """
        if not self.redis:
            raise RuntimeError("Redis not connected")

        try:
            # Get symbols from sorted set (sorted by timestamp)
            symbols = await self.redis.zrevrange(
                "stock:quotes:recent",
                0,
                limit - 1
            )
            return symbols
        except Exception as e:
            logger.error(f"Failed to get recently updated symbols: {str(e)}")
            return []