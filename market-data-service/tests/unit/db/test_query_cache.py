"""
Unit tests for TimescaleDB query cache.

Tests query result caching to optimize read performance.
"""

import pytest
import asyncio
import json
import time
import hashlib
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, field


class QueryCache:
    """
    Cache for database query results.

    Caches query results in Redis with configurable TTL.
    Supports cache invalidation and hit/miss statistics.
    """

    def __init__(self, redis_client, default_ttl_seconds: int = 300):
        self.redis = redis_client
        self.default_ttl = default_ttl_seconds
        self.stats = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
            "invalidations": 0
        }

    def _generate_key(self, table: str, query_params: Dict[str, Any]) -> str:
        """Generate cache key from query parameters."""
        # Sort params for consistent key generation
        sorted_params = json.dumps(query_params, sort_keys=True, default=str)
        param_hash = hashlib.md5(sorted_params.encode()).hexdigest()[:16]
        return f"query_cache:{table}:{param_hash}"

    async def get(self, table: str, query_params: Dict[str, Any]) -> Optional[Any]:
        """
        Get cached query result.

        Args:
            table: Table name
            query_params: Query parameters

        Returns:
            Cached result or None if cache miss
        """
        key = self._generate_key(table, query_params)
        cached = await self.redis.get(key)

        if cached is not None:
            self.stats["hits"] += 1
            try:
                return json.loads(cached)
            except json.JSONDecodeError:
                return cached
        else:
            self.stats["misses"] += 1
            return None

    async def set(self, table: str, query_params: Dict[str, Any],
                  result: Any, ttl_seconds: Optional[int] = None) -> bool:
        """
        Cache query result.

        Args:
            table: Table name
            query_params: Query parameters
            result: Result to cache
            ttl_seconds: TTL (uses default if not specified)

        Returns:
            True if cached successfully
        """
        key = self._generate_key(table, query_params)
        ttl = ttl_seconds or self.default_ttl

        try:
            serialized = json.dumps(result, default=str)
            await self.redis.setex(key, ttl, serialized)
            self.stats["sets"] += 1
            return True
        except (TypeError, ValueError) as e:
            # Cannot serialize result
            return False

    async def invalidate(self, table: str, pattern: Optional[str] = None) -> int:
        """
        Invalidate cached queries for a table.

        Args:
            table: Table name
            pattern: Optional pattern to match keys

        Returns:
            Number of keys invalidated
        """
        if pattern:
            key_pattern = f"query_cache:{table}:{pattern}*"
        else:
            key_pattern = f"query_cache:{table}:*"

        keys = await self.redis.keys(key_pattern)
        if keys:
            await self.redis.delete(*keys)
            self.stats["invalidations"] += len(keys)
            return len(keys)
        return 0

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        total_requests = self.stats["hits"] + self.stats["misses"]
        hit_rate = self.stats["hits"] / total_requests if total_requests > 0 else 0.0

        return {
            **self.stats,
            "hit_rate": round(hit_rate, 4),
            "total_requests": total_requests,
            "default_ttl_seconds": self.default_ttl
        }

    async def get_or_compute(self, table: str, query_params: Dict[str, Any],
                             compute_func, ttl_seconds: Optional[int] = None) -> Any:
        """
        Get from cache or compute and cache result.

        Args:
            table: Table name
            query_params: Query parameters
            compute_func: Async function to compute result if cache miss
            ttl_seconds: Optional TTL override

        Returns:
            Result (from cache or computed)
        """
        # Try cache first
        cached = await self.get(table, query_params)
        if cached is not None:
            return cached

        # Compute result
        result = await compute_func()

        # Cache result
        await self.set(table, query_params, result, ttl_seconds)

        return result


class MockRedisClient:
    """Mock Redis client for testing."""

    def __init__(self):
        self.data: Dict[str, tuple] = {}  # key -> (value, expiry_time)

    async def get(self, key: str) -> Optional[str]:
        """Get value if not expired."""
        if key in self.data:
            value, expiry = self.data[key]
            if expiry is None or time.time() < expiry:
                return value
            else:
                del self.data[key]
        return None

    async def setex(self, key: str, seconds: int, value: str):
        """Set value with expiry."""
        expiry = time.time() + seconds
        self.data[key] = (value, expiry)

    async def keys(self, pattern: str) -> List[str]:
        """Find keys matching pattern (simplified)."""
        import fnmatch
        return [k for k in self.data.keys() if fnmatch.fnmatch(k, pattern)]

    async def delete(self, *keys):
        """Delete keys."""
        for key in keys:
            if key in self.data:
                del self.data[key]


class TestQueryCache:
    """Test query cache functionality."""

    @pytest.fixture
    def mock_redis(self):
        return MockRedisClient()

    @pytest.fixture
    def cache(self, mock_redis):
        return QueryCache(mock_redis, default_ttl_seconds=300)

    @pytest.mark.asyncio
    async def test_cache_miss(self, cache, mock_redis):
        """Test cache miss returns None."""
        result = await cache.get("kline_1m", {"symbol": "000001", "period": "1d"})

        assert result is None
        assert cache.stats["misses"] == 1

    @pytest.mark.asyncio
    async def test_cache_hit(self, cache, mock_redis):
        """Test cache hit returns cached value."""
        # Set cache
        await cache.set("kline_1m", {"symbol": "000001", "period": "1d"},
                       [{"time": "2026-01-01", "close": 10.5}])

        # Get from cache
        result = await cache.get("kline_1m", {"symbol": "000001", "period": "1d"})

        assert result is not None
        assert len(result) == 1
        assert result[0]["close"] == 10.5
        assert cache.stats["hits"] == 1

    @pytest.mark.asyncio
    async def test_cache_ttl_expiration(self, mock_redis):
        """Test cache entry expires after TTL."""
        cache = QueryCache(mock_redis, default_ttl_seconds=1)

        # Set cache with 1 second TTL
        await cache.set("kline_1m", {"symbol": "000001"}, {"data": "test"}, ttl_seconds=1)

        # Should hit immediately
        result1 = await cache.get("kline_1m", {"symbol": "000001"})
        assert result1 is not None

        # Wait for expiration
        await asyncio.sleep(1.1)

        # Should miss after expiration
        result2 = await cache.get("kline_1m", {"symbol": "000001"})
        assert result2 is None

    @pytest.mark.asyncio
    async def test_different_params_different_keys(self, cache, mock_redis):
        """Test different query params generate different cache keys."""
        # Cache for symbol 000001
        await cache.set("kline_1m", {"symbol": "000001"}, [{"close": 10.5}])

        # Cache for symbol 000002
        await cache.set("kline_1m", {"symbol": "000002"}, [{"close": 20.5}])

        # Get 000001
        result1 = await cache.get("kline_1m", {"symbol": "000001"})
        assert result1[0]["close"] == 10.5

        # Get 000002
        result2 = await cache.get("kline_1m", {"symbol": "000002"})
        assert result2[0]["close"] == 20.5

    @pytest.mark.asyncio
    async def test_invalidate_by_table(self, cache, mock_redis):
        """Test invalidating all cached queries for a table."""
        # Set multiple caches
        await cache.set("kline_1m", {"symbol": "000001"}, [{"close": 10.5}])
        await cache.set("kline_1m", {"symbol": "000002"}, [{"close": 20.5}])
        await cache.set("quotes", {"symbol": "000001"}, {"price": 10.5})

        # Invalidate kline_1m table only
        invalidated = await cache.invalidate("kline_1m")

        assert invalidated == 2
        assert await cache.get("kline_1m", {"symbol": "000001"}) is None
        assert await cache.get("quotes", {"symbol": "000001"}) is not None

    @pytest.mark.asyncio
    async def test_get_or_compute_cache_hit(self, cache, mock_redis):
        """Test get_or_compute with cache hit."""
        # Pre-populate cache
        await cache.set("kline_1m", {"symbol": "000001"}, [{"cached": True}])

        compute_called = False

        async def compute():
            nonlocal compute_called
            compute_called = True
            return [{"computed": True}]

        result = await cache.get_or_compute("kline_1m", {"symbol": "000001"}, compute)

        assert result == [{"cached": True}]
        assert not compute_called  # Should not call compute on cache hit

    @pytest.mark.asyncio
    async def test_get_or_compute_cache_miss(self, cache, mock_redis):
        """Test get_or_compute with cache miss."""
        async def compute():
            return [{"computed": True}]

        result = await cache.get_or_compute("kline_1m", {"symbol": "000001"}, compute)

        assert result == [{"computed": True}]
        assert cache.stats["misses"] == 1
        assert cache.stats["sets"] == 1

    @pytest.mark.asyncio
    async def test_cache_stats(self, cache, mock_redis):
        """Test cache statistics."""
        # 2 hits
        await cache.set("kline_1m", {"symbol": "000001"}, [{"data": "test"}])
        await cache.get("kline_1m", {"symbol": "000001"})
        await cache.get("kline_1m", {"symbol": "000001"})

        # 1 miss
        await cache.get("kline_1m", {"symbol": "000999"})

        stats = cache.get_stats()

        assert stats["hits"] == 2
        assert stats["misses"] == 1
        assert abs(stats["hit_rate"] - 2 / 3) < 0.0001
        assert stats["total_requests"] == 3


class TestQueryCachePerformance:
    """Test query cache performance."""

    @pytest.mark.asyncio
    async def test_cache_hit_performance(self):
        """Test cache hit response time < 5ms."""
        mock_redis = MockRedisClient()
        cache = QueryCache(mock_redis)

        # Pre-populate cache
        await cache.set("kline_1m", {"symbol": "000001"}, [{"close": 10.5}] * 100)

        start = time.time()
        for _ in range(100):
            await cache.get("kline_1m", {"symbol": "000001"})
        elapsed_ms = (time.time() - start) * 1000

        avg_time = elapsed_ms / 100
        assert avg_time < 5, f"Average cache hit took {avg_time:.2f}ms, expected < 5ms"

    @pytest.mark.asyncio
    async def test_cache_set_performance(self):
        """Test cache set performance for large results."""
        mock_redis = MockRedisClient()
        cache = QueryCache(mock_redis)

        # Large result (1000 klines)
        large_result = [{"time": f"2026-01-{i:02d}", "close": 10.0 + i} for i in range(1, 1001)]

        start = time.time()
        await cache.set("kline_1m", {"symbol": "000001"}, large_result)
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 50, f"Cache set took {elapsed_ms:.2f}ms, expected < 50ms"


class TestQueryCacheEdgeCases:
    """Test edge cases."""

    @pytest.fixture
    def mock_redis(self):
        return MockRedisClient()

    @pytest.fixture
    def cache(self, mock_redis):
        return QueryCache(mock_redis, default_ttl_seconds=300)

    @pytest.mark.asyncio
    async def test_non_serializable_data(self, cache, mock_redis):
        """Test handling non-serializable data gracefully."""
        # Try to cache non-serializable object with circular reference
        data = {"key": "value"}
        data["self"] = data  # Create circular reference

        result = await cache.set("kline_1m", {"symbol": "000001"}, data)

        assert result is False  # Should fail gracefully

    @pytest.mark.asyncio
    async def test_empty_result_caching(self, cache, mock_redis):
        """Test caching empty results."""
        await cache.set("kline_1m", {"symbol": "000001"}, [])

        result = await cache.get("kline_1m", {"symbol": "000001"})

        assert result == []

    @pytest.mark.asyncio
    async def test_datetime_serialization(self, cache, mock_redis):
        """Test datetime serialization in cache."""
        data = {
            "timestamp": datetime(2026, 2, 10, 14, 30, 0),
            "price": 10.5
        }

        await cache.set("quotes", {"symbol": "000001"}, data)
        result = await cache.get("quotes", {"symbol": "000001"})

        assert result is not None
        assert "timestamp" in result

    @pytest.mark.asyncio
    async def test_special_characters_in_params(self, cache, mock_redis):
        """Test special characters in query params."""
        params = {"symbol": "000001.SZ", "query": "price > 10 AND volume < 1000000"}

        await cache.set("kline_1m", params, [{"close": 10.5}])
        result = await cache.get("kline_1m", params)

        assert result is not None
        assert result[0]["close"] == 10.5

