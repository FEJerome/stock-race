"""
Cache utilities for Data Service.
"""

import hashlib
import json
import pickle
from datetime import timedelta
from typing import Any, Optional, Union
from functools import wraps

import redis.asyncio as redis
from loguru import logger

from ..core.config import settings


class CacheManager:
    """Cache manager for Data Service."""

    def __init__(self, redis_url: Optional[str] = None):
        """Initialize cache manager."""
        self.redis_url = redis_url or settings.REDIS_URL
        self.client: Optional[redis.Redis] = None
        self.is_connected = False

    async def connect(self) -> None:
        """Connect to Redis."""
        try:
            self.client = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=False,  # We'll handle encoding/decoding ourselves
            )
            await self.client.ping()
            self.is_connected = True
            logger.info(f"Connected to Redis at {self.redis_url}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            self.is_connected = False

    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self.client:
            await self.client.close()
            self.is_connected = False
            logger.info("Disconnected from Redis")

    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        if not self.is_connected or not self.client:
            return None

        try:
            data = await self.client.get(key)
            if data:
                return pickle.loads(data)
        except Exception as e:
            logger.warning(f"Failed to get cache key {key}: {e}")
        return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[Union[int, timedelta]] = None,
    ) -> bool:
        """Set value in cache."""
        if not self.is_connected or not self.client:
            return False

        try:
            serialized = pickle.dumps(value)
            if isinstance(ttl, timedelta):
                ttl = int(ttl.total_seconds())

            await self.client.set(key, serialized, ex=ttl)
            return True
        except Exception as e:
            logger.warning(f"Failed to set cache key {key}: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """Delete key from cache."""
        if not self.is_connected or not self.client:
            return False

        try:
            await self.client.delete(key)
            return True
        except Exception as e:
            logger.warning(f"Failed to delete cache key {key}: {e}")
            return False

    async def exists(self, key: str) -> bool:
        """Check if key exists in cache."""
        if not self.is_connected or not self.client:
            return False

        try:
            return await self.client.exists(key) > 0
        except Exception as e:
            logger.warning(f"Failed to check cache key {key}: {e}")
            return False

    async def clear_pattern(self, pattern: str) -> int:
        """Clear keys matching pattern."""
        if not self.is_connected or not self.client:
            return 0

        try:
            keys = await self.client.keys(pattern)
            if keys:
                await self.client.delete(*keys)
                return len(keys)
        except Exception as e:
            logger.warning(f"Failed to clear cache pattern {pattern}: {e}")
        return 0

    async def publish(self, channel: str, message: Any) -> bool:
        """Publish message to Redis channel."""
        if not self.is_connected or not self.client:
            return False

        try:
            serialized = json.dumps(message)
            await self.client.publish(channel, serialized)
            return True
        except Exception as e:
            logger.warning(f"Failed to publish to channel {channel}: {e}")
            return False


def generate_cache_key(
    prefix: str,
    data: Any,
    include_fields: Optional[list] = None,
    exclude_fields: Optional[list] = None,
) -> str:
    """Generate cache key from data."""
    if isinstance(data, dict):
        filtered_data = data.copy()
    else:
        filtered_data = data.dict() if hasattr(data, "dict") else {}
    # Filter fields
    if include_fields:
        filtered_data = {k: v for k, v in filtered_data.items() if k in include_fields}
    elif exclude_fields:
        filtered_data = {k: v for k, v in filtered_data.items() if k not in exclude_fields}
    # Remove None values and sort keys
    filtered_data = {k: v for k, v in filtered_data.items() if v is not None}
    sorted_data = dict(sorted(filtered_data.items()))
    # Create hash
    data_str = json.dumps(sorted_data, sort_keys=True, default=str)
    data_hash = hashlib.md5(data_str.encode()).hexdigest()
    return f"{prefix}:{data_hash}"


def cache_result(
    prefix: str,
    ttl: Union[int, timedelta] = 300,  # 5 minutes default
    include_fields: Optional[list] = None,
    exclude_fields: Optional[list] = None,
):
    """Decorator to cache function results."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get cache manager from first argument (self) or create new
            cache_manager = None
            if args and hasattr(args[0], "cache_manager"):
                cache_manager = args[0].cache_manager
            elif "cache_manager" in kwargs:
                cache_manager = kwargs["cache_manager"]
            if not cache_manager:
                # No cache manager available, call function directly
                return await func(*args, **kwargs)
            # Generate cache key
            cache_data = {}
            if args:
                cache_data["args"] = args[1:]  # Skip self
            if kwargs:
                cache_data["kwargs"] = kwargs

            cache_key = generate_cache_key(
                prefix=prefix,
                data=cache_data,
                include_fields=include_fields,
                exclude_fields=exclude_fields,
            )

            # Try to get from cache
            cached_result = await cache_manager.get(cache_key)
            if cached_result is not None:
                logger.debug(f"Cache hit for key: {cache_key}")
                return cached_result

            # Call function and cache result
            logger.debug(f"Cache miss for key: {cache_key}")
            result = await func(*args, **kwargs)

            # Cache result
            await cache_manager.set(cache_key, result, ttl=ttl)

            return result
        return wrapper
    return decorator


# Global cache manager instance
cache_manager = CacheManager()
