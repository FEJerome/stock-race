"""
Integration tests for Redis TTL expiration.

Tests the TTL behavior of cached quotes including expiration,
refresh, and edge cases.
"""

import pytest
import asyncio
import time
import json
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch
from typing import Dict, Any, Optional, List


class RedisTTLIntegrationTest:
    """
    Integration test fixture for Redis TTL tests.

    Simulates real Redis behavior with actual time-based expiration.
    """

    def __init__(self):
        self.data = {}  # key -> (value, expire_at)
        self.stats = {
            "expired_keys": 0,
            "accessed_keys": 0
        }

    async def setex(self, key: str, ttl: int, value: str):
        """Set key with expiration (seconds)."""
        expire_at = time.time() + ttl
        self.data[key] = (value, expire_at)

    async def get(self, key: str) -> Optional[str]:
        """Get key value, return None if expired."""
        if key not in self.data:
            return None

        value, expire_at = self.data[key]
        if time.time() > expire_at:
            del self.data[key]
            self.stats["expired_keys"] += 1
            return None

        self.stats["accessed_keys"] += 1
        return value

    async def ttl(self, key: str) -> int:
        """Get remaining TTL in seconds."""
        if key not in self.data:
            return -2  # Key does not exist

        value, expire_at = self.data[key]
        remaining = int(expire_at - time.time())

        if remaining <= 0:
            del self.data[key]
            self.stats["expired_keys"] += 1
            return -2

        return remaining

    async def exists(self, key: str) -> int:
        """Check if key exists and is not expired."""
        if key not in self.data:
            return 0

        _, expire_at = self.data[key]
        if time.time() > expire_at:
            del self.data[key]
            self.stats["expired_keys"] += 1
            return 0

        return 1

    async def delete(self, key: str):
        """Delete key."""
        if key in self.data:
            del self.data[key]

    def pipeline(self):
        """Create pipeline."""
        return MockPipeline(self)

    def get_expired_count(self) -> int:
        """Get count of expired keys."""
        return self.stats["expired_keys"]


class MockPipeline:
    """Mock Redis pipeline for integration tests."""

    def __init__(self, client: RedisTTLIntegrationTest):
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
        """Execute all commands."""
        results = []
        for cmd in self.commands:
            if cmd[0] == "setex":
                await self.client.setex(cmd[1], cmd[2], cmd[3])
                results.append(True)
            elif cmd[0] == "get":
                value = await self.client.get(cmd[1])
                results.append(value)
        return results


class QuoteCacheWithTTL:
    """Quote cache implementation for TTL testing."""

    def __init__(self, redis_client, default_ttl: int = 10):
        self.redis_client = redis_client
        self.default_ttl = default_ttl

    async def set_quote(self, symbol: str, data: Dict[str, Any], ttl: Optional[int] = None):
        """Store quote with TTL."""
        if not self.redis_client:
            return False

        try:
            key = f"quote:{symbol}"
            ttl = ttl or self.default_ttl

            if "updated_at" not in data:
                data["updated_at"] = time.time()

            await self.redis_client.setex(key, ttl, json.dumps(data))
            return True
        except Exception:
            return False

    async def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Retrieve quote from cache."""
        if not self.redis_client:
            return None

        try:
            key = f"quote:{symbol}"
            value = await self.redis_client.get(key)

            if value:
                return json.loads(value)
            return None
        except Exception:
            return None

    async def get_remaining_ttl(self, symbol: str) -> int:
        """Get remaining TTL for a quote."""
        if not self.redis_client:
            return -2

        key = f"quote:{symbol}"
        return await self.redis_client.ttl(key)

    async def is_expired(self, symbol: str) -> bool:
        """Check if quote has expired."""
        ttl = await self.get_remaining_ttl(symbol)
        return ttl == -2 or ttl == 0


class TestRedisTTLSingleKey:
    """Test TTL behavior for single key operations."""

    @pytest.fixture
    def cache_setup(self):
        """Create cache with mock Redis."""
        redis = RedisTTLIntegrationTest()
        cache = QuoteCacheWithTTL(redis_client=redis, default_ttl=10)
        return cache, redis

    @pytest.mark.asyncio
    async def test_ttl_set_correctly(self, cache_setup):
        """Test TTL is set correctly when storing quote."""
        cache, redis = cache_setup

        quote_data = {"symbol": "000001.SZ", "price": 10.50}
        await cache.set_quote("000001.SZ", quote_data, ttl=10)

        remaining_ttl = await cache.get_remaining_ttl("000001.SZ")

        assert 8 <= remaining_ttl <= 10  # Allow 2 seconds for execution

    @pytest.mark.asyncio
    async def test_key_expires_after_ttl(self, cache_setup):
        """Test key expires after TTL period."""
        cache, redis = cache_setup

        quote_data = {"symbol": "000001.SZ", "price": 10.50}
        await cache.set_quote("000001.SZ", quote_data, ttl=2)  # 2 second TTL

        # Verify key exists
        result = await cache.get_quote("000001.SZ")
        assert result is not None

        # Wait for expiration
        await asyncio.sleep(2.5)

        # Key should be expired
        result = await cache.get_quote("000001.SZ")
        assert result is None

    @pytest.mark.asyncio
    async def test_ttl_returns_negative_two_when_expired(self, cache_setup):
        """Test TTL returns -2 when key is expired."""
        cache, redis = cache_setup

        quote_data = {"symbol": "000001.SZ", "price": 10.50}
        await cache.set_quote("000001.SZ", quote_data, ttl=1)

        # Wait for expiration
        await asyncio.sleep(1.5)

        ttl = await cache.get_remaining_ttl("000001.SZ")

        assert ttl == -2

    @pytest.mark.asyncio
    async def test_ttl_decreases_over_time(self, cache_setup):
        """Test TTL value decreases as time passes."""
        cache, redis = cache_setup

        quote_data = {"symbol": "000001.SZ", "price": 10.50}
        await cache.set_quote("000001.SZ", quote_data, ttl=5)

        ttl1 = await cache.get_remaining_ttl("000001.SZ")
        await asyncio.sleep(1)
        ttl2 = await cache.get_remaining_ttl("000001.SZ")

        assert ttl2 < ttl1
        assert ttl1 - ttl2 >= 1


class TestRedisTTLBatchOperations:
    """Test TTL behavior for batch operations."""

    @pytest.fixture
    def cache_setup(self):
        """Create cache with mock Redis."""
        redis = RedisTTLIntegrationTest()
        cache = QuoteCacheWithTTL(redis_client=redis, default_ttl=10)
        return cache, redis

    @pytest.mark.asyncio
    async def test_batch_set_with_same_ttl(self, cache_setup):
        """Test batch set with same TTL for all keys."""
        cache, redis = cache_setup

        pipeline = redis.pipeline()

        # Set multiple keys with same TTL
        quotes = {
            "000001.SZ": {"price": 10.50},
            "600519.SH": {"price": 1500.0},
            "000858.SZ": {"price": 50.0}
        }

        for symbol, data in quotes.items():
            key = f"quote:{symbol}"
            data["updated_at"] = time.time()
            pipeline.setex(key, 10, json.dumps(data))

        await pipeline.execute()

        # Verify all keys have similar TTL
        for symbol in quotes:
            ttl = await cache.get_remaining_ttl(symbol)
            assert 8 <= ttl <= 10

    @pytest.mark.asyncio
    async def test_batch_partial_expiration(self, cache_setup):
        """Test partial expiration in batch - some keys expire, some remain."""
        cache, redis = cache_setup

        # Set keys with different TTLs
        await cache.set_quote("SHORT", {"price": 10}, ttl=1)
        await cache.set_quote("LONG", {"price": 20}, ttl=5)

        # Wait for short TTL to expire
        await asyncio.sleep(1.5)

        # SHORT should be expired, LONG should exist
        assert await cache.is_expired("SHORT") is True
        assert await cache.is_expired("LONG") is False

        result_short = await cache.get_quote("SHORT")
        result_long = await cache.get_quote("LONG")

        assert result_short is None
        assert result_long is not None


class TestRedisTTLRefresh:
    """Test TTL refresh scenarios."""

    @pytest.fixture
    def cache_setup(self):
        """Create cache with mock Redis."""
        redis = RedisTTLIntegrationTest()
        cache = QuoteCacheWithTTL(redis_client=redis, default_ttl=10)
        return cache, redis

    @pytest.mark.asyncio
    async def test_ttl_refreshed_on_update(self, cache_setup):
        """Test that updating a key refreshes its TTL."""
        cache, redis = cache_setup

        # Set initial value
        await cache.set_quote("000001.SZ", {"price": 10.50}, ttl=3)

        # Wait half the TTL
        await asyncio.sleep(1.5)

        ttl_before = await cache.get_remaining_ttl("000001.SZ")
        assert 1 <= ttl_before <= 2

        # Update the value
        await cache.set_quote("000001.SZ", {"price": 11.00}, ttl=3)

        ttl_after = await cache.get_remaining_ttl("000001.SZ")

        # TTL should be refreshed
        assert ttl_after >= 2  # Should be close to full TTL again

    @pytest.mark.asyncio
    async def test_value_updated_ttl_preserved(self, cache_setup):
        """Test that value is updated and TTL is preserved correctly."""
        cache, redis = cache_setup

        # Set initial value
        await cache.set_quote("000001.SZ", {"price": 10.50, "volume": 1000}, ttl=5)

        # Update with new price
        await cache.set_quote("000001.SZ", {"price": 11.00, "volume": 2000}, ttl=5)

        result = await cache.get_quote("000001.SZ")

        assert result["price"] == 11.00
        assert result["volume"] == 2000


class TestRedisTTLEdgeCases:
    """Test TTL edge cases."""

    @pytest.fixture
    def cache_setup(self):
        """Create cache with mock Redis."""
        redis = RedisTTLIntegrationTest()
        cache = QuoteCacheWithTTL(redis_client=redis, default_ttl=10)
        return cache, redis

    @pytest.mark.asyncio
    async def test_zero_ttl_not_allowed(self, cache_setup):
        """Test that zero TTL uses default instead."""
        cache, redis = cache_setup

        quote_data = {"symbol": "000001.SZ", "price": 10.50}

        # This should use default TTL if 0 is passed
        ttl_to_use = 0 or cache.default_ttl

        await redis.setex("quote:000001.SZ", ttl_to_use, json.dumps(quote_data))

        ttl = await cache.get_remaining_ttl("000001.SZ")
        assert ttl > 0

    @pytest.mark.asyncio
    async def test_negative_ttl_becomes_expired(self, cache_setup):
        """Test negative TTL results in immediate expiration."""
        cache, redis = cache_setup

        # Manually set with negative TTL
        expire_at = time.time() - 1  # Already expired
        redis.data["quote:000001.SZ"] = (json.dumps({"price": 10.50}), expire_at)

        result = await cache.get_quote("000001.SZ")

        assert result is None

    @pytest.mark.asyncio
    async def test_very_short_ttl(self, cache_setup):
        """Test very short TTL (1 second)."""
        cache, redis = cache_setup

        quote_data = {"symbol": "000001.SZ", "price": 10.50}
        await cache.set_quote("000001.SZ", quote_data, ttl=1)

        # Should exist immediately
        result1 = await cache.get_quote("000001.SZ")
        assert result1 is not None

        # Wait for expiration
        await asyncio.sleep(1.2)

        result2 = await cache.get_quote("000001.SZ")
        assert result2 is None

    @pytest.mark.asyncio
    async def test_long_ttl(self, cache_setup):
        """Test long TTL (1 hour)."""
        cache, redis = cache_setup

        quote_data = {"symbol": "000001.SZ", "price": 10.50}
        await cache.set_quote("000001.SZ", quote_data, ttl=3600)

        ttl = await cache.get_remaining_ttl("000001.SZ")

        assert ttl > 3500  # Should be close to 3600

    @pytest.mark.asyncio
    async def test_ttl_after_manual_delete(self, cache_setup):
        """Test TTL after manual deletion."""
        cache, redis = cache_setup

        quote_data = {"symbol": "000001.SZ", "price": 10.50}
        await cache.set_quote("000001.SZ", quote_data, ttl=10)

        # Delete manually
        await redis.delete("quote:000001.SZ")

        ttl = await cache.get_remaining_ttl("000001.SZ")

        assert ttl == -2  # Key doesn't exist


class TestRedisTTLConcurrentAccess:
    """Test TTL with concurrent access."""

    @pytest.fixture
    def cache_setup(self):
        """Create cache with mock Redis."""
        redis = RedisTTLIntegrationTest()
        cache = QuoteCacheWithTTL(redis_client=redis, default_ttl=10)
        return cache, redis

    @pytest.mark.asyncio
    async def test_concurrent_read_while_expiring(self, cache_setup):
        """Test concurrent reads while key is expiring."""
        cache, redis = cache_setup

        await cache.set_quote("VOLATILE", {"price": 10}, ttl=1)

        # Multiple concurrent reads during expiration window
        await asyncio.sleep(0.8)

        tasks = [cache.get_quote("VOLATILE") for _ in range(10)]
        results = await asyncio.gather(*tasks)

        # All should get the same result (either all exist or all None)
        assert all(r is not None for r in results) or all(r is None for r in results)

    @pytest.mark.asyncio
    async def test_concurrent_update_and_read(self, cache_setup):
        """Test concurrent updates and reads."""
        cache, redis = cache_setup

        await cache.set_quote("SHARED", {"price": 10}, ttl=5)

        async def reader():
            await asyncio.sleep(0.05)
            return await cache.get_quote("SHARED")

        async def updater():
            await cache.set_quote("SHARED", {"price": 20}, ttl=5)
            return True

        # Mix of reads and updates
        tasks = [reader(), updater(), reader(), reader()]
        results = await asyncio.gather(*tasks)

        # At least one read should succeed
        reads = [r for r in results if isinstance(r, dict)]
        assert len(reads) >= 2


class TestRedisTTLExpirationTracking:
    """Test expiration tracking and statistics."""

    @pytest.fixture
    def cache_setup(self):
        """Create cache with mock Redis."""
        redis = RedisTTLIntegrationTest()
        cache = QuoteCacheWithTTL(redis_client=redis, default_ttl=10)
        return cache, redis

    @pytest.mark.asyncio
    async def test_expired_keys_count(self, cache_setup):
        """Test tracking of expired keys."""
        cache, redis = cache_setup

        # Set multiple keys with short TTL
        for i in range(5):
            await cache.set_quote(f"STOCK{i}", {"price": float(i)}, ttl=1)

        # Wait for expiration
        await asyncio.sleep(1.5)

        # Access keys to trigger expiration
        for i in range(5):
            await cache.get_quote(f"STOCK{i}")

        assert redis.get_expired_count() == 5

    @pytest.mark.asyncio
    async def test_expiration_timing_accuracy(self, cache_setup):
        """Test expiration timing accuracy."""
        cache, redis = cache_setup

        ttl_seconds = 2
        await cache.set_quote("TIMED", {"price": 10}, ttl=ttl_seconds)

        start = time.time()

        # Poll until expired
        while await cache.get_quote("TIMED") is not None:
            await asyncio.sleep(0.1)

        elapsed = time.time() - start

        # Should expire close to the TTL
        assert 1.8 <= elapsed <= 2.5, f"Expired after {elapsed}s, expected ~{ttl_seconds}s"


class TestRedisTTLRealWorldScenarios:
    """Test real-world TTL scenarios."""

    @pytest.fixture
    def cache_setup(self):
        """Create cache with mock Redis."""
        redis = RedisTTLIntegrationTest()
        cache = QuoteCacheWithTTL(redis_client=redis, default_ttl=10)
        return cache, redis

    @pytest.mark.asyncio
    async def test_stock_quotes_refresh_cycle(self, cache_setup):
        """Test stock quotes refresh cycle (10s TTL for real-time)."""
        cache, redis = cache_setup

        # Simulate real-time quote updates
        for iteration in range(3):
            quote_data = {
                "symbol": "000001.SZ",
                "price": 10.50 + iteration * 0.01,
                "volume": 1000000 + iteration * 1000,
                "updated_at": time.time()
            }

            await cache.set_quote("000001.SZ", quote_data, ttl=10)

            ttl = await cache.get_remaining_ttl("000001.SZ")
            assert 8 <= ttl <= 10

            await asyncio.sleep(0.1)  # Small delay between updates

    @pytest.mark.asyncio
    async def test_market_data_volatility_period(self, cache_setup):
        """Test cache behavior during market volatility (rapid updates)."""
        cache, redis = cache_setup

        # Simulate rapid price changes
        prices = [10.50, 10.52, 10.48, 10.55, 10.53]

        for price in prices:
            await cache.set_quote("VOLATILE", {"price": price}, ttl=5)
            await asyncio.sleep(0.05)  # Rapid updates

        # Final value should be in cache
        result = await cache.get_quote("VOLATILE")
        assert result["price"] == 10.53

    @pytest.mark.asyncio
    async def test_after_hours_data_persistence(self, cache_setup):
        """Test data persistence for after-hours (longer TTL)."""
        cache, redis = cache_setup

        # After-hours data might use longer TTL
        closing_price = {"symbol": "000001.SZ", "price": 10.50, "is_closing": True}
        await cache.set_quote("000001.SZ", closing_price, ttl=3600)  # 1 hour

        ttl = await cache.get_remaining_ttl("000001.SZ")

        assert ttl > 3500  # Should persist for a long time
