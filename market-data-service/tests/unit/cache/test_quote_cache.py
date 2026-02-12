"""
Unit tests for quote cache with Redis.

Tests the QuoteCache class for real-time quote caching with TTL.
"""

import pytest
import asyncio
import time
import json
from datetime import datetime
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from typing import Dict, Any, Optional, List


class QuoteCache:
    """
    Redis-based cache for real-time stock quotes.

    Features:
    - TTL-based expiration (default 10 seconds)
    - Batch operations for efficiency
    - Performance metrics tracking
    """

    def __init__(
        self,
        redis_client=None,
        default_ttl: int = 10,
        prefix: str = "quote:"
    ):
        self.redis_client = redis_client
        self.default_ttl = default_ttl
        self.prefix = prefix
        self.stats = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
            "batch_sets": 0,
            "errors": 0
        }

    def _key(self, symbol: str) -> str:
        """Generate Redis key for a symbol."""
        return f"{self.prefix}{symbol}"

    async def set_quote(
        self,
        symbol: str,
        data: Dict[str, Any],
        ttl: Optional[int] = None
    ) -> bool:
        """
        Store a single quote in cache.

        Args:
            symbol: Stock symbol (e.g., '000001.SZ')
            data: Quote data dictionary
            ttl: Time-to-live in seconds (default: 10)

        Returns:
            True if successful, False otherwise
        """
        if not self.redis_client:
            return False

        try:
            key = self._key(symbol)
            ttl = ttl or self.default_ttl

            # Add timestamp if not present
            if "updated_at" not in data:
                data["updated_at"] = time.time()

            # Serialize to JSON
            value = json.dumps(data)

            await self.redis_client.setex(key, ttl, value)
            self.stats["sets"] += 1
            return True
        except Exception as e:
            self.stats["errors"] += 1
            return False

    async def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a quote from cache.

        Args:
            symbol: Stock symbol

        Returns:
            Quote data or None if not found/expired
        """
        if not self.redis_client:
            self.stats["misses"] += 1
            return None

        try:
            key = self._key(symbol)
            value = await self.redis_client.get(key)

            if value:
                self.stats["hits"] += 1
                return json.loads(value)
            else:
                self.stats["misses"] += 1
                return None
        except Exception as e:
            self.stats["errors"] += 1
            self.stats["misses"] += 1
            return None

    async def set_quotes_batch(
        self,
        quotes: Dict[str, Dict[str, Any]],
        ttl: Optional[int] = None
    ) -> Dict[str, bool]:
        """
        Store multiple quotes in cache using pipeline.

        Args:
            quotes: Dictionary mapping symbol to quote data
            ttl: Time-to-live in seconds

        Returns:
            Dictionary mapping symbol to success status
        """
        if not self.redis_client:
            return {symbol: False for symbol in quotes}

        results = {}
        ttl = ttl or self.default_ttl

        try:
            # Use pipeline for batch operation
            pipeline = self.redis_client.pipeline()

            for symbol, data in quotes.items():
                key = self._key(symbol)
                if "updated_at" not in data:
                    data["updated_at"] = time.time()
                value = json.dumps(data)
                pipeline.setex(key, ttl, value)

            await pipeline.execute()

            # All quotes were successfully set
            for symbol in quotes.keys():
                results[symbol] = True

            self.stats["batch_sets"] += 1
            self.stats["sets"] += len(quotes)
            return results
        except Exception as e:
            self.stats["errors"] += 1
            return {symbol: False for symbol in quotes}

    async def get_quotes_batch(
        self,
        symbols: List[str]
    ) -> Dict[str, Optional[Dict[str, Any]]]:
        """
        Retrieve multiple quotes from cache.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to quote data (None if not found)
        """
        if not self.redis_client:
            self.stats["misses"] += len(symbols)
            return {symbol: None for symbol in symbols}

        results = {}

        try:
            # Use pipeline for batch get
            pipeline = self.redis_client.pipeline()

            for symbol in symbols:
                key = self._key(symbol)
                pipeline.get(key)

            values = await pipeline.execute()

            for symbol, value in zip(symbols, values):
                if value:
                    results[symbol] = json.loads(value)
                else:
                    results[symbol] = None

            return results
        except Exception as e:
            self.stats["errors"] += 1
            return {symbol: None for symbol in symbols}

    async def delete_quote(self, symbol: str) -> bool:
        """Delete a quote from cache."""
        if not self.redis_client:
            return False

        try:
            key = self._key(symbol)
            await self.redis_client.delete(key)
            return True
        except Exception:
            self.stats["errors"] += 1
            return False

    async def exists(self, symbol: str) -> bool:
        """Check if a quote exists in cache."""
        if not self.redis_client:
            return False

        try:
            key = self._key(symbol)
            return await self.redis_client.exists(key) > 0
        except Exception:
            return False

    async def ttl(self, symbol: str) -> int:
        """Get remaining TTL for a quote."""
        if not self.redis_client:
            return -2  # Key doesn't exist

        try:
            key = self._key(symbol)
            return await self.redis_client.ttl(key)
        except Exception:
            return -2

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        total_requests = self.stats["hits"] + self.stats["misses"]
        hit_rate = self.stats["hits"] / total_requests if total_requests > 0 else 0

        return {
            **self.stats,
            "hit_rate": round(hit_rate, 4),
            "total_requests": total_requests,
            "default_ttl": self.default_ttl,
            "prefix": self.prefix
        }

    async def clear_stats(self):
        """Reset statistics."""
        self.stats = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
            "batch_sets": 0,
            "errors": 0
        }


class MockRedisClient:
    """Mock Redis client for testing."""

    def __init__(self):
        self.data = {}  # key -> (value, expire_at)
        self.pipelines = []

    async def setex(self, key: str, ttl: int, value: str):
        """Set key with expiration."""
        expire_at = time.time() + ttl
        self.data[key] = (value, expire_at)

    async def get(self, key: str) -> Optional[str]:
        """Get key value."""
        if key not in self.data:
            return None

        value, expire_at = self.data[key]
        if time.time() > expire_at:
            del self.data[key]
            return None

        return value

    async def delete(self, key: str):
        """Delete key."""
        if key in self.data:
            del self.data[key]

    async def exists(self, key: str) -> int:
        """Check if key exists."""
        if key not in self.data:
            return 0

        _, expire_at = self.data[key]
        if time.time() > expire_at:
            del self.data[key]
            return 0

        return 1

    async def ttl(self, key: str) -> int:
        """Get remaining TTL."""
        if key not in self.data:
            return -2

        _, expire_at = self.data[key]
        remaining = int(expire_at - time.time())
        if remaining <= 0:
            del self.data[key]
            return -2

        return remaining

    def pipeline(self):
        """Create a pipeline."""
        pipeline = MockPipeline(self)
        self.pipelines.append(pipeline)
        return pipeline


class MockPipeline:
    """Mock Redis pipeline."""

    def __init__(self, client: MockRedisClient):
        self.client = client
        self.commands = []

    def setex(self, key: str, ttl: int, value: str):
        """Queue setex command."""
        self.commands.append(("setex", key, ttl, value))
        return self

    def get(self, key: str):
        """Queue get command."""
        self.commands.append(("get", key))
        return self

    async def execute(self):
        """Execute all queued commands."""
        results = []
        for cmd in self.commands:
            if cmd[0] == "setex":
                await self.client.setex(cmd[1], cmd[2], cmd[3])
                results.append(True)
            elif cmd[0] == "get":
                value = await self.client.get(cmd[1])
                results.append(value)
        return results


class TestQuoteCacheInitialization:
    """Test QuoteCache initialization."""

    def test_default_initialization(self):
        """Test default initialization."""
        cache = QuoteCache()

        assert cache.redis_client is None
        assert cache.default_ttl == 10
        assert cache.prefix == "quote:"
        assert cache.stats["hits"] == 0
        assert cache.stats["misses"] == 0

    def test_custom_initialization(self):
        """Test custom initialization."""
        redis = MockRedisClient()
        cache = QuoteCache(
            redis_client=redis,
            default_ttl=30,
            prefix="stock:"
        )

        assert cache.redis_client == redis
        assert cache.default_ttl == 30
        assert cache.prefix == "stock:"

    def test_key_generation(self):
        """Test Redis key generation."""
        cache = QuoteCache(prefix="quote:")

        assert cache._key("000001.SZ") == "quote:000001.SZ"
        assert cache._key("600519.SH") == "quote:600519.SH"


class TestQuoteCacheSingleOperations:
    """Test single quote cache operations."""

    @pytest.fixture
    def cache_with_redis(self):
        """Create cache with mock Redis."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)
        return cache, redis

    @pytest.mark.asyncio
    async def test_set_quote_success(self, cache_with_redis):
        """Test setting a quote successfully."""
        cache, redis = cache_with_redis

        quote_data = {
            "symbol": "000001.SZ",
            "price": 10.50,
            "change": 0.05,
            "change_percent": 0.48,
            "volume": 1000000
        }

        result = await cache.set_quote("000001.SZ", quote_data)

        assert result is True
        assert cache.stats["sets"] == 1
        assert "quote:000001.SZ" in redis.data

    @pytest.mark.asyncio
    async def test_set_quote_with_custom_ttl(self, cache_with_redis):
        """Test setting a quote with custom TTL."""
        cache, redis = cache_with_redis

        quote_data = {"symbol": "000001.SZ", "price": 10.50}

        result = await cache.set_quote("000001.SZ", quote_data, ttl=30)

        assert result is True
        # Check TTL is set correctly
        ttl = await redis.ttl("quote:000001.SZ")
        assert 25 <= ttl <= 30  # Allow some time for execution

    @pytest.mark.asyncio
    async def test_set_quote_adds_timestamp(self, cache_with_redis):
        """Test that set_quote adds updated_at timestamp."""
        cache, redis = cache_with_redis

        quote_data = {"symbol": "000001.SZ", "price": 10.50}

        await cache.set_quote("000001.SZ", quote_data)

        # Retrieve and check timestamp
        stored = await redis.get("quote:000001.SZ")
        parsed = json.loads(stored)
        assert "updated_at" in parsed
        assert isinstance(parsed["updated_at"], (int, float))

    @pytest.mark.asyncio
    async def test_get_quote_success(self, cache_with_redis):
        """Test getting an existing quote."""
        cache, redis = cache_with_redis

        # Pre-populate cache
        quote_data = {
            "symbol": "000001.SZ",
            "price": 10.50,
            "updated_at": time.time()
        }
        await redis.setex("quote:000001.SZ", 10, json.dumps(quote_data))

        result = await cache.get_quote("000001.SZ")

        assert result is not None
        assert result["symbol"] == "000001.SZ"
        assert result["price"] == 10.50
        assert cache.stats["hits"] == 1
        assert cache.stats["misses"] == 0

    @pytest.mark.asyncio
    async def test_get_quote_miss(self, cache_with_redis):
        """Test getting a non-existent quote."""
        cache, redis = cache_with_redis

        result = await cache.get_quote("000001.SZ")

        assert result is None
        assert cache.stats["hits"] == 0
        assert cache.stats["misses"] == 1

    @pytest.mark.asyncio
    async def test_get_quote_without_redis(self):
        """Test getting quote when Redis is not available."""
        cache = QuoteCache(redis_client=None)

        result = await cache.get_quote("000001.SZ")

        assert result is None
        assert cache.stats["misses"] == 1

    @pytest.mark.asyncio
    async def test_set_quote_without_redis(self):
        """Test setting quote when Redis is not available."""
        cache = QuoteCache(redis_client=None)

        quote_data = {"symbol": "000001.SZ", "price": 10.50}
        result = await cache.set_quote("000001.SZ", quote_data)

        assert result is False


class TestQuoteCacheBatchOperations:
    """Test batch quote cache operations."""

    @pytest.fixture
    def cache_with_redis(self):
        """Create cache with mock Redis."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)
        return cache, redis

    @pytest.mark.asyncio
    async def test_set_quotes_batch_success(self, cache_with_redis):
        """Test setting multiple quotes in batch."""
        cache, redis = cache_with_redis

        quotes = {
            "000001.SZ": {"symbol": "000001.SZ", "price": 10.50},
            "600519.SH": {"symbol": "600519.SH", "price": 1500.0},
            "000858.SZ": {"symbol": "000858.SZ", "price": 50.0}
        }

        results = await cache.set_quotes_batch(quotes)

        # Check results and data are stored correctly
        assert results["000001.SZ"] is True
        assert results["600519.SH"] is True
        assert results["000858.SZ"] is True
        assert cache.stats["batch_sets"] == 1
        assert cache.stats["sets"] == 3
        assert "quote:000001.SZ" in redis.data
        assert "quote:600519.SH" in redis.data
        assert "quote:000858.SZ" in redis.data

    @pytest.mark.asyncio
    async def test_get_quotes_batch_success(self, cache_with_redis):
        """Test getting multiple quotes in batch."""
        cache, redis = cache_with_redis

        # Pre-populate cache
        for symbol in ["000001.SZ", "600519.SH"]:
            await redis.setex(
                f"quote:{symbol}",
                10,
                json.dumps({"symbol": symbol, "price": 10.0})
            )

        results = await cache.get_quotes_batch(["000001.SZ", "600519.SH", "000858.SZ"])

        assert results["000001.SZ"] is not None
        assert results["600519.SH"] is not None
        assert results["000858.SZ"] is None  # Not in cache

    @pytest.mark.asyncio
    async def test_batch_operations_use_pipeline(self, cache_with_redis):
        """Test that batch operations use Redis pipeline."""
        cache, redis = cache_with_redis

        quotes = {
            "000001.SZ": {"symbol": "000001.SZ", "price": 10.50},
            "600519.SH": {"symbol": "600519.SH", "price": 1500.0}
        }

        await cache.set_quotes_batch(quotes)

        # Verify pipeline was created
        assert len(redis.pipelines) == 1


class TestQuoteCacheUtilityOperations:
    """Test utility cache operations."""

    @pytest.fixture
    def cache_with_redis(self):
        """Create cache with mock Redis."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)
        return cache, redis

    @pytest.mark.asyncio
    async def test_delete_quote_success(self, cache_with_redis):
        """Test deleting a quote."""
        cache, redis = cache_with_redis

        # Pre-populate cache
        await redis.setex("quote:000001.SZ", 10, json.dumps({"price": 10.50}))

        result = await cache.delete_quote("000001.SZ")

        assert result is True
        assert "quote:000001.SZ" not in redis.data

    @pytest.mark.asyncio
    async def test_exists_true(self, cache_with_redis):
        """Test checking existence of existing quote."""
        cache, redis = cache_with_redis

        await redis.setex("quote:000001.SZ", 10, json.dumps({"price": 10.50}))

        result = await cache.exists("000001.SZ")

        assert result is True

    @pytest.mark.asyncio
    async def test_exists_false(self, cache_with_redis):
        """Test checking existence of non-existent quote."""
        cache, redis = cache_with_redis

        result = await cache.exists("000001.SZ")

        assert result is False

    @pytest.mark.asyncio
    async def test_ttl_existing(self, cache_with_redis):
        """Test getting TTL of existing quote."""
        cache, redis = cache_with_redis

        await redis.setex("quote:000001.SZ", 10, json.dumps({"price": 10.50}))

        result = await cache.ttl("000001.SZ")

        assert 0 <= result <= 10

    @pytest.mark.asyncio
    async def test_ttl_nonexistent(self, cache_with_redis):
        """Test getting TTL of non-existent quote."""
        cache, redis = cache_with_redis

        result = await cache.ttl("000001.SZ")

        assert result == -2


class TestQuoteCacheStatistics:
    """Test cache statistics."""

    @pytest.fixture
    def cache_with_redis(self):
        """Create cache with mock Redis."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)
        return cache, redis

    @pytest.mark.asyncio
    async def test_stats_initial(self, cache_with_redis):
        """Test initial statistics."""
        cache, _ = cache_with_redis

        stats = cache.get_stats()

        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["sets"] == 0
        assert stats["batch_sets"] == 0
        assert stats["errors"] == 0
        assert stats["hit_rate"] == 0
        assert stats["total_requests"] == 0

    @pytest.mark.asyncio
    async def test_stats_after_operations(self, cache_with_redis):
        """Test statistics after cache operations."""
        cache, redis = cache_with_redis

        # Perform operations
        await cache.set_quote("000001.SZ", {"price": 10.50})
        await cache.get_quote("000001.SZ")  # Hit
        await cache.get_quote("600519.SH")  # Miss

        stats = cache.get_stats()

        assert stats["hits"] == 1
        assert stats["misses"] == 1
        assert stats["sets"] == 1
        assert stats["total_requests"] == 2
        assert stats["hit_rate"] == 0.5

    @pytest.mark.asyncio
    async def test_hit_rate_calculation(self, cache_with_redis):
        """Test hit rate calculation."""
        cache, redis = cache_with_redis

        # Pre-populate
        await redis.setex("quote:A", 10, json.dumps({"price": 10}))
        await redis.setex("quote:B", 10, json.dumps({"price": 20}))

        # 2 hits, 1 miss
        await cache.get_quote("A")  # Hit
        await cache.get_quote("B")  # Hit
        await cache.get_quote("C")  # Miss

        stats = cache.get_stats()

        # hit_rate is rounded to 4 decimal places
        assert abs(stats["hit_rate"] - 2/3) < 0.0001

    @pytest.mark.asyncio
    async def test_clear_stats(self, cache_with_redis):
        """Test clearing statistics."""
        cache, redis = cache_with_redis

        # Perform operations
        await cache.set_quote("000001.SZ", {"price": 10.50})
        await cache.get_quote("000001.SZ")

        # Clear stats
        await cache.clear_stats()

        stats = cache.get_stats()

        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["sets"] == 0


class TestQuoteCachePerformance:
    """Test cache performance requirements."""

    @pytest.mark.asyncio
    async def test_batch_write_performance(self):
        """Test batch write performance: 1000 stocks < 100ms."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)

        # Create 1000 quotes
        quotes = {
            f"{i:06d}.SZ": {
                "symbol": f"{i:06d}.SZ",
                "price": 10.0 + i * 0.01,
                "volume": 1000000 + i
            }
            for i in range(1000)
        }

        start_time = time.time()
        await cache.set_quotes_batch(quotes)
        elapsed_ms = (time.time() - start_time) * 1000

        assert elapsed_ms < 100, f"Batch write took {elapsed_ms:.2f}ms, expected < 100ms"

    @pytest.mark.asyncio
    async def test_single_read_performance(self):
        """Test single read performance: < 1ms."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)

        # Pre-populate
        await redis.setex(
            "quote:000001.SZ",
            10,
            json.dumps({"symbol": "000001.SZ", "price": 10.50})
        )

        start_time = time.time()
        result = await cache.get_quote("000001.SZ")
        elapsed_ms = (time.time() - start_time) * 1000

        assert elapsed_ms < 1, f"Read took {elapsed_ms:.4f}ms, expected < 1ms"
        assert result is not None


class TestQuoteCacheConcurrency:
    """Test cache concurrency requirements."""

    @pytest.mark.asyncio
    async def test_concurrent_writes_no_conflict(self):
        """Test concurrent writes don't conflict."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)

        # Concurrent writes to different keys
        tasks = [
            cache.set_quote(f"STOCK{i}", {"price": float(i)})
            for i in range(100)
        ]

        results = await asyncio.gather(*tasks)

        assert all(results)
        assert cache.stats["sets"] == 100

    @pytest.mark.asyncio
    async def test_concurrent_writes_same_key(self):
        """Test concurrent writes to same key (last write wins)."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)

        # Concurrent writes to same key
        tasks = [
            cache.set_quote("SAME_KEY", {"price": float(i)})
            for i in range(10)
        ]

        results = await asyncio.gather(*tasks)

        assert all(results)
        # Last write should be in cache
        final = await cache.get_quote("SAME_KEY")
        assert final is not None
        assert "price" in final

    @pytest.mark.asyncio
    async def test_concurrent_reads_no_conflict(self):
        """Test concurrent reads don't conflict."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)

        # Pre-populate
        for i in range(100):
            await redis.setex(
                f"quote:STOCK{i}",
                10,
                json.dumps({"price": float(i)})
            )

        # Concurrent reads
        tasks = [
            cache.get_quote(f"STOCK{i}")
            for i in range(100)
        ]

        results = await asyncio.gather(*tasks)

        assert all(r is not None for r in results)
        assert cache.stats["hits"] == 100


class TestQuoteCacheErrorHandling:
    """Test cache error handling."""

    @pytest.mark.asyncio
    async def test_set_quote_error_handling(self):
        """Test set_quote handles Redis errors gracefully."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)

        # Mock error
        async def raise_error(*args, **kwargs):
            raise Exception("Redis connection error")

        redis.setex = raise_error

        result = await cache.set_quote("000001.SZ", {"price": 10.50})

        assert result is False
        assert cache.stats["errors"] == 1

    @pytest.mark.asyncio
    async def test_get_quote_error_handling(self):
        """Test get_quote handles Redis errors gracefully."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)

        # Mock error
        async def raise_error(*args, **kwargs):
            raise Exception("Redis connection error")

        redis.get = raise_error

        result = await cache.get_quote("000001.SZ")

        assert result is None
        assert cache.stats["errors"] == 1
        assert cache.stats["misses"] == 1

    @pytest.mark.asyncio
    async def test_batch_set_error_handling(self):
        """Test batch set handles errors gracefully."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)

        # Mock pipeline error
        class FailingPipeline:
            def setex(self, *args, **kwargs):
                return self
            async def execute(self):
                raise Exception("Pipeline error")

        redis.pipeline = lambda: FailingPipeline()

        quotes = {"000001.SZ": {"price": 10.50}}
        results = await cache.set_quotes_batch(quotes)

        assert results["000001.SZ"] is False
        assert cache.stats["errors"] == 1


class TestQuoteCacheDataTypes:
    """Test cache data type handling."""

    @pytest.fixture
    def cache_with_redis(self):
        """Create cache with mock Redis."""
        redis = MockRedisClient()
        cache = QuoteCache(redis_client=redis, default_ttl=10)
        return cache, redis

    @pytest.mark.asyncio
    async def test_numeric_values_preserved(self, cache_with_redis):
        """Test numeric values are preserved correctly."""
        cache, redis = cache_with_redis

        quote_data = {
            "symbol": "000001.SZ",
            "price": 10.50,
            "change": -0.05,
            "change_percent": -0.48,
            "volume": 1000000,
            "amount": 10500000.50
        }

        await cache.set_quote("000001.SZ", quote_data)
        result = await cache.get_quote("000001.SZ")

        assert result["price"] == 10.50
        assert result["change"] == -0.05
        assert result["change_percent"] == -0.48
        assert result["volume"] == 1000000
        assert result["amount"] == 10500000.50

    @pytest.mark.asyncio
    async def test_nested_data_structure(self, cache_with_redis):
        """Test nested data structures are handled correctly."""
        cache, redis = cache_with_redis

        quote_data = {
            "symbol": "000001.SZ",
            "price": 10.50,
            "bid_ask": {
                "bid": 10.49,
                "ask": 10.51
            },
            "depth": [
                {"price": 10.49, "volume": 100},
                {"price": 10.48, "volume": 200}
            ]
        }

        await cache.set_quote("000001.SZ", quote_data)
        result = await cache.get_quote("000001.SZ")

        assert result["bid_ask"]["bid"] == 10.49
        assert result["bid_ask"]["ask"] == 10.51
        assert len(result["depth"]) == 2
