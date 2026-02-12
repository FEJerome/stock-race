"""
Redis connection management for AI Service.
"""

from typing import Optional
import redis.asyncio as redis
from loguru import logger

from .config import settings
from ..utils.cache import CacheManager


async def init_redis() -> None:
    """Initialize Redis connection."""
    from ..utils.cache import cache_manager

    try:
        await cache_manager.connect()
        logger.info(f"Redis connection initialized at {settings.REDIS_URL}")
    except Exception as e:
        logger.error(f"Failed to initialize Redis: {e}")
        raise


async def close_redis() -> None:
    """Close Redis connection."""
    from ..utils.cache import cache_manager

    try:
        await cache_manager.disconnect()
        logger.info("Redis connection closed")
    except Exception as e:
        logger.error(f"Failed to close Redis connection: {e}")


async def get_redis_client() -> Optional[redis.Redis]:
    """Get the Redis client instance.

    Returns:
        Redis client if connected, None otherwise.
    """
    from ..utils.cache import cache_manager

    if cache_manager._redis:
        return cache_manager._redis
    return None