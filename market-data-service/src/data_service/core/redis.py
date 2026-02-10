"""
Redis connection management for Data Service.
"""

from typing import Optional
import redis.asyncio as redis
from loguru import logger

from .config import settings
from ..utils.cache import CacheManager


# Global cache manager instance
_cache_manager: Optional[CacheManager] = None


def get_cache_manager() -> CacheManager:
    """Get or create global cache manager instance."""
    global _cache_manager
    if _cache_manager is None:
        _cache_manager = CacheManager(settings.REDIS_URL)
    return _cache_manager


async def init_redis() -> None:
    """Initialize Redis connection."""
    cache_manager = get_cache_manager()
    try:
        await cache_manager.connect()
        logger.info(f"Redis connection initialized at {settings.REDIS_URL}")
    except Exception as e:
        logger.error(f"Failed to initialize Redis: {e}")
        raise


async def close_redis() -> None:
    """Close Redis connection."""
    cache_manager = get_cache_manager()
    try:
        await cache_manager.disconnect()
        logger.info("Redis connection closed")
    except Exception as e:
        logger.error(f"Failed to close Redis connection: {e}")


# For backward compatibility with code that imports from cache
cache_manager = get_cache_manager()
