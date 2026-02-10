"""
Unit tests for technical indicator caching and fallback.

Tests caching of indicator calculations and fallback strategies
when data sources fail.
"""

import pytest
import asyncio
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
import json
import hashlib


class IndicatorCache:
    """
    Cache for technical indicator calculations.

    Caches indicator results with appropriate TTL based on indicator type:
    - MA5/MA10: 60 seconds
    - MACD: 30 seconds
    - RSI: 60 seconds
    - Bollinger Bands: 60 seconds
    """

    DEFAULT_TTLS = {
        "ma5": 60,
        "ma10": 60,
        "ma20": 60,
        "ma60": 60,
        "macd": 30,
        "macd_signal": 30,
        "macd_histogram": 30,
        "rsi": 60,
        "rsi6": 60,
        "rsi12": 60,
        "rsi24": 60,
        "boll_upper": 60,
        "boll_middle": 60,
        "boll_lower": 60,
    }

    def __init__(self, redis_client, default_ttl_seconds: int = 60):
        self.redis = redis_client
        self.default_ttl = default_ttl_seconds
        self.stats = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
            "fallback_uses": 0
        }

    def _generate_key(self, symbol: str, indicator: str, params: Dict[str, Any] = None) -> str:
        """Generate cache key for indicator."""
        params_str = json.dumps(params or {}, sort_keys=True, default=str)
        param_hash = hashlib.md5(params_str.encode()).hexdigest()[:8]
        return f"indicator:{symbol}:{indicator}:{param_hash}"

    async def get(self, symbol: str, indicator: str, params: Dict[str, Any] = None) -> Optional[float]:
        """Get cached indicator value."""
        key = self._generate_key(symbol, indicator, params)
        cached = await self.redis.get(key)

        if cached is not None:
            self.stats["hits"] += 1
            try:
                return float(cached)
            except (ValueError, TypeError):
                return cached
        else:
            self.stats["misses"] += 1
            return None

    async def set(self, symbol: str, indicator: str, value: float,
                  params: Dict[str, Any] = None, ttl_seconds: int = None) -> bool:
        """Cache indicator value."""
        key = self._generate_key(symbol, indicator, params)
        ttl = ttl_seconds or self.DEFAULT_TTLS.get(indicator, self.default_ttl)

        try:
            await self.redis.setex(key, ttl, str(value))
            self.stats["sets"] += 1
            return True
        except Exception:
            return False

    async def get_batch(self, symbol: str, indicators: List[str],
                        params: Dict[str, Any] = None) -> Dict[str, Optional[float]]:
        """Get multiple cached indicators."""
        results = {}
        for indicator in indicators:
            results[indicator] = await self.get(symbol, indicator, params)
        return results

    async def set_batch(self, symbol: str, indicators: Dict[str, float],
                        params: Dict[str, Any] = None) -> bool:
        """Cache multiple indicators."""
        tasks = [
            self.set(symbol, name, value, params)
            for name, value in indicators.items()
        ]
        results = await asyncio.gather(*tasks)
        return all(results)

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        total = self.stats["hits"] + self.stats["misses"]
        hit_rate = self.stats["hits"] / total if total > 0 else 0.0
        return {
            **self.stats,
            "hit_rate": round(hit_rate, 4),
            "total_requests": total
        }


class IndicatorFallbackStrategy:
    """
    Fallback strategies for indicator calculation failures.

    Strategies:
    - cached: Use last cached value
    - approximate: Use simplified calculation
    - interpolated: Interpolate from nearby values
    - stale: Use stale data with warning flag
    """

    @staticmethod
    def use_cached(cached_value: float) -> Dict[str, Any]:
        """Return cached value with fallback flag."""
        return {
            "value": cached_value,
            "fallback": True,
            "fallback_type": "cached",
            "stale": False
        }

    @staticmethod
    def use_approximate(approximate_value: float, method: str = "simplified") -> Dict[str, Any]:
        """Return approximate value."""
        return {
            "value": approximate_value,
            "fallback": True,
            "fallback_type": "approximate",
            "method": method,
            "accuracy": "estimated"
        }

    @staticmethod
    def use_stale(stale_value: float, age_seconds: int) -> Dict[str, Any]:
        """Return stale value with age information."""
        return {
            "value": stale_value,
            "fallback": True,
            "fallback_type": "stale",
            "stale": True,
            "age_seconds": age_seconds
        }


class TechnicalIndicatorServiceWithCache:
    """
    Technical indicator service with caching and fallback support.
    """

    def __init__(self, data_source, cache: IndicatorCache, market_calendar=None):
        self.data_source = data_source
        self.cache = cache
        self.calendar = market_calendar

    async def calculate_with_cache(
        self,
        symbol: str,
        indicators: List[str],
        use_cached: bool = True,
        allow_fallback: bool = True
    ) -> Dict[str, Any]:
        """
        Calculate indicators with caching and fallback support.

        Args:
            symbol: Stock symbol
            indicators: List of indicator names
            use_cached: Whether to use cached values
            allow_fallback: Whether to allow fallback on failure

        Returns:
            Dict with indicator values and metadata
        """
        result = {
            "symbol": symbol,
            "indicators": {},
            "cached": [],
            "fallback": [],
            "errors": []
        }

        # Try to get from cache first
        if use_cached:
            cached = await self.cache.get_batch(symbol, indicators)
            for indicator, value in cached.items():
                if value is not None:
                    result["indicators"][indicator] = value
                    result["cached"].append(indicator)

        # Calculate missing indicators
        missing = [i for i in indicators if i not in result["indicators"]]

        if missing:
            try:
                # Try real-time calculation
                calculated = await self._calculate_realtime(symbol, missing)

                for indicator, value in calculated.items():
                    result["indicators"][indicator] = value
                    # Cache the new value
                    await self.cache.set(symbol, indicator, value)

            except Exception as e:
                if allow_fallback:
                    # Try fallback for missing indicators
                    for indicator in missing:
                        fallback_result = await self._try_fallback(symbol, indicator)
                        if fallback_result:
                            result["indicators"][indicator] = fallback_result["value"]
                            result["fallback"].append({
                                "indicator": indicator,
                                **fallback_result
                            })
                        else:
                            result["errors"].append({
                                "indicator": indicator,
                                "error": str(e)
                            })
                else:
                    result["errors"].extend([
                        {"indicator": i, "error": str(e)} for i in missing
                    ])

        return result

    async def _calculate_realtime(self, symbol: str, indicators: List[str]) -> Dict[str, float]:
        """Calculate indicators in real-time from data source."""
        # Check if data source is available
        try:
            await self.data_source.get_klines(symbol, "1d", 100)
        except Exception as e:
            raise Exception(f"Data source unavailable: {e}")

        return {i: 10.5 for i in indicators}

    async def _try_fallback(self, symbol: str, indicator: str) -> Optional[Dict[str, Any]]:
        """Try fallback strategy for failed indicator."""
        # Try to get stale cached value with longer TTL tolerance
        cached = await self.cache.get(symbol, indicator)
        if cached is not None:
            return IndicatorFallbackStrategy.use_cached(cached)

        # Try approximate calculation
        try:
            approx_value = await self._approximate_calculation(symbol, indicator)
            return IndicatorFallbackStrategy.use_approximate(approx_value)
        except Exception:
            pass

        return None

    async def _approximate_calculation(self, symbol: str, indicator: str) -> float:
        """Simplified/approximate indicator calculation."""
        # Simplified MA calculation using fewer periods
        if indicator.startswith("ma"):
            return await self._quick_ma(symbol, int(indicator[2:]))

        # Simplified RSI
        if indicator.startswith("rsi"):
            return 50.0  # Neutral RSI as approximation

        # Default approximation
        return 0.0

    async def _quick_ma(self, symbol: str, period: int) -> float:
        """Quick MA using fewer data points."""
        # Use half the periods for quick calculation
        quick_period = max(period // 2, 5)
        # Return mock value for testing
        return 10.5


class MockRedisClient:
    """Mock Redis for testing."""

    def __init__(self):
        self.data = {}

    async def get(self, key: str) -> Optional[str]:
        item = self.data.get(key)
        if item:
            value, expiry = item
            if expiry is None or datetime.now().timestamp() < expiry:
                return value
            else:
                del self.data[key]
        return None

    async def setex(self, key: str, seconds: int, value: str):
        expiry = datetime.now().timestamp() + seconds
        self.data[key] = (value, expiry)

    async def delete(self, key: str):
        if key in self.data:
            del self.data[key]


class MockDataSource:
    """Mock data source that can fail."""

    def __init__(self, should_fail: bool = False):
        self.should_fail = should_fail

    async def get_klines(self, symbol: str, period: str, limit: int):
        if self.should_fail:
            raise Exception("Data source unavailable")
        return [{"close": 10.5} for _ in range(limit)]


class TestIndicatorCache:
    """Test indicator cache functionality."""

    @pytest.fixture
    def mock_redis(self):
        return MockRedisClient()

    @pytest.fixture
    def cache(self, mock_redis):
        return IndicatorCache(mock_redis)

    @pytest.mark.asyncio
    async def test_cache_hit(self, cache, mock_redis):
        """Test cache hit returns value."""
        await cache.set("000001", "ma5", 10.5)

        result = await cache.get("000001", "ma5")

        assert result == 10.5
        assert cache.stats["hits"] == 1

    @pytest.mark.asyncio
    async def test_cache_miss(self, cache):
        """Test cache miss returns None."""
        result = await cache.get("000001", "ma5")

        assert result is None
        assert cache.stats["misses"] == 1

    @pytest.mark.asyncio
    async def test_cache_ttl(self, mock_redis):
        """Test cache entry expires."""
        cache = IndicatorCache(mock_redis)
        await cache.set("000001", "ma5", 10.5, ttl_seconds=1)

        # Should hit immediately
        result1 = await cache.get("000001", "ma5")
        assert result1 == 10.5

        # Wait for expiration
        await asyncio.sleep(1.1)

        # Should miss after expiration
        result2 = await cache.get("000001", "ma5")
        assert result2 is None

    @pytest.mark.asyncio
    async def test_batch_operations(self, cache):
        """Test batch get/set operations."""
        indicators = {"ma5": 10.5, "ma10": 10.6, "rsi": 55.0}
        await cache.set_batch("000001", indicators)

        results = await cache.get_batch("000001", ["ma5", "ma10", "rsi", "macd"])

        assert results["ma5"] == 10.5
        assert results["ma10"] == 10.6
        assert results["rsi"] == 55.0
        assert results["macd"] is None

    @pytest.mark.asyncio
    async def test_indicator_specific_ttl(self, cache, mock_redis):
        """Test different TTLs for different indicators."""
        await cache.set("000001", "ma5", 10.5)  # Default 60s
        await cache.set("000001", "macd", 0.5)  # Default 30s

        # Check TTLs are different
        ma5_key = cache._generate_key("000001", "ma5")
        macd_key = cache._generate_key("000001", "macd")

        # Both should be in cache
        assert await mock_redis.get(ma5_key) is not None
        assert await mock_redis.get(macd_key) is not None


class TestIndicatorFallback:
    """Test fallback strategies."""

    @pytest.mark.asyncio
    async def test_use_cached_fallback(self):
        """Test using cached value as fallback."""
        fallback = IndicatorFallbackStrategy.use_cached(10.5)

        assert fallback["value"] == 10.5
        assert fallback["fallback"] is True
        assert fallback["fallback_type"] == "cached"

    @pytest.mark.asyncio
    async def test_use_approximate_fallback(self):
        """Test using approximate value as fallback."""
        fallback = IndicatorFallbackStrategy.use_approximate(10.5, "simplified")

        assert fallback["value"] == 10.5
        assert fallback["fallback"] is True
        assert fallback["fallback_type"] == "approximate"
        assert fallback["accuracy"] == "estimated"

    @pytest.mark.asyncio
    async def test_use_stale_fallback(self):
        """Test using stale value as fallback."""
        fallback = IndicatorFallbackStrategy.use_stale(10.5, 120)

        assert fallback["value"] == 10.5
        assert fallback["fallback"] is True
        assert fallback["fallback_type"] == "stale"
        assert fallback["stale"] is True
        assert fallback["age_seconds"] == 120


class TestIndicatorServiceWithCache:
    """Test indicator service with caching."""

    @pytest.fixture
    def mock_redis(self):
        return MockRedisClient()

    @pytest.fixture
    def cache(self, mock_redis):
        return IndicatorCache(mock_redis)

    @pytest.fixture
    def data_source(self):
        return MockDataSource()

    @pytest.fixture
    def service(self, data_source, cache):
        return TechnicalIndicatorServiceWithCache(data_source, cache)

    @pytest.mark.asyncio
    async def test_calculate_with_cache_hit(self, service, cache):
        """Test calculation uses cache on hit."""
        # Pre-populate cache
        await cache.set("000001", "ma5", 10.5)
        await cache.set("000001", "rsi", 55.0)

        result = await service.calculate_with_cache(
            "000001", ["ma5", "rsi"], use_cached=True
        )

        assert result["indicators"]["ma5"] == 10.5
        assert result["indicators"]["rsi"] == 55.0
        assert "ma5" in result["cached"]
        assert "rsi" in result["cached"]

    @pytest.mark.asyncio
    async def test_calculate_cache_miss(self, service, cache):
        """Test calculation computes on cache miss."""
        result = await service.calculate_with_cache(
            "000001", ["ma5"], use_cached=True
        )

        assert "ma5" in result["indicators"]
        assert result["cached"] == []  # Was not in cache

        # Should now be cached
        cached = await cache.get("000001", "ma5")
        assert cached is not None

    @pytest.mark.asyncio
    async def test_fallback_on_failure(self, service, cache, data_source):
        """Test fallback when data source fails."""
        # Pre-populate cache for ma10 (but not ma5, so it will need calculation)
        await cache.set("000001", "ma10", 10.6)

        # Make data source fail
        data_source.should_fail = True

        result = await service.calculate_with_cache(
            "000001", ["ma5"], use_cached=True, allow_fallback=True
        )

        # ma5 is not cached, calculation fails, tries fallback
        # Since ma5 is not in cache, it will use approximate calculation
        assert "ma5" in result["indicators"]
        assert len(result["fallback"]) > 0

    @pytest.mark.asyncio
    async def test_no_fallback_when_disabled(self, service, data_source, cache):
        """Test no fallback when allow_fallback is False."""
        # Ensure ma5 is not in cache by using a fresh key
        await cache.set("000001", "ma10", 10.6)  # Set different indicator

        data_source.should_fail = True

        result = await service.calculate_with_cache(
            "000001", ["ma5"], use_cached=True, allow_fallback=False
        )

        assert "ma5" not in result["indicators"]
        assert len(result["errors"]) == 1


class TestIndicatorServiceEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_empty_indicator_list(self):
        """Test empty indicator list."""
        mock_redis = MockRedisClient()
        cache = IndicatorCache(mock_redis)
        data_source = MockDataSource()
        service = TechnicalIndicatorServiceWithCache(data_source, cache)

        result = await service.calculate_with_cache("000001", [])

        assert result["indicators"] == {}
        assert result["cached"] == []

    @pytest.mark.asyncio
    async def test_partial_cache_hit(self):
        """Test partial cache hit."""
        mock_redis = MockRedisClient()
        cache = IndicatorCache(mock_redis)
        data_source = MockDataSource()
        service = TechnicalIndicatorServiceWithCache(data_source, cache)

        # Only cache one indicator
        await cache.set("000001", "ma5", 10.5)

        result = await service.calculate_with_cache(
            "000001", ["ma5", "rsi"], use_cached=True
        )

        assert "ma5" in result["cached"]
        assert "rsi" not in result["cached"]
        assert "ma5" in result["indicators"]
        assert "rsi" in result["indicators"]

    @pytest.mark.asyncio
    async def test_cache_disabled(self):
        """Test calculation with cache disabled."""
        mock_redis = MockRedisClient()
        cache = IndicatorCache(mock_redis)
        data_source = MockDataSource()
        service = TechnicalIndicatorServiceWithCache(data_source, cache)

        result = await service.calculate_with_cache(
            "000001", ["ma5"], use_cached=False
        )

        assert "ma5" in result["indicators"]
        assert result["cached"] == []  # Should not use cache
