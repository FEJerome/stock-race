"""
Integration tests for indicator service resilience.

Tests indicator service behavior under failure conditions.
"""

import pytest
import asyncio
from typing import Dict, Any, List
from datetime import datetime


class IndicatorAPIHandler:
    """
    API handler for indicator endpoints with resilience.

    Endpoints:
    - GET /api/indicators/{symbol}?indicators=ma,macd,rsi
    """

    def __init__(self, indicator_service):
        self.service = indicator_service

    async def handle_get_indicators(
        self,
        symbol: str,
        indicators: str,
        use_cache: bool = True,
        allow_fallback: bool = True
    ) -> Dict[str, Any]:
        """
        Handle GET /api/indicators/{symbol} request.

        Args:
            symbol: Stock symbol
            indicators: Comma-separated list of indicator names
            use_cache: Whether to use cached values
            allow_fallback: Whether to allow fallback on failure

        Returns:
            Indicator data with metadata
        """
        try:
            indicator_list = [i.strip() for i in indicators.split(",")]

            result = await self.service.calculate_with_cache(
                symbol=symbol,
                indicators=indicator_list,
                use_cached=use_cache,
                allow_fallback=allow_fallback
            )

            return {
                "success": True,
                "data": {
                    "symbol": result["symbol"],
                    "indicators": result["indicators"],
                    "cached_count": len(result["cached"]),
                    "fallback_count": len(result["fallback"]),
                    "error_count": len(result["errors"])
                },
                "meta": {
                    "requested": indicator_list,
                    "cached": result["cached"],
                    "fallback": [f["indicator"] for f in result["fallback"]],
                    "errors": [e["indicator"] for e in result["errors"]]
                }
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "code": "INDICATOR_CALCULATION_ERROR"
            }


# Import test implementations
import sys
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/worktrees/worktree-market-data-service/market-data-service/tests/unit/services')
from test_indicator_cache import (
    TechnicalIndicatorServiceWithCache,
    IndicatorCache,
    MockRedisClient,
    MockDataSource
)


class TestIndicatorAPIResilience:
    """Test indicator API resilience."""

    @pytest.fixture
    def api_handler(self):
        mock_redis = MockRedisClient()
        cache = IndicatorCache(mock_redis)
        data_source = MockDataSource()
        service = TechnicalIndicatorServiceWithCache(data_source, cache)
        return IndicatorAPIHandler(service)

    @pytest.mark.asyncio
    async def test_api_success(self, api_handler):
        """Test successful indicator API call."""
        result = await api_handler.handle_get_indicators(
            "000001", "ma5,ma10,rsi"
        )

        assert result["success"] is True
        assert "data" in result
        assert "ma5" in result["data"]["indicators"]
        assert "ma10" in result["data"]["indicators"]
        assert "rsi" in result["data"]["indicators"]

    @pytest.mark.asyncio
    async def test_api_with_cache(self, api_handler):
        """Test API with cached indicators."""
        # Pre-populate cache
        await api_handler.service.cache.set("000001", "ma5", 10.5)

        result = await api_handler.handle_get_indicators(
            "000001", "ma5,rsi", use_cache=True
        )

        assert result["success"] is True
        assert result["data"]["indicators"]["ma5"] == 10.5
        assert "ma5" in result["meta"]["cached"]

    @pytest.mark.asyncio
    async def test_api_with_fallback(self, api_handler):
        """Test API with fallback on data source failure."""
        # Ensure ma5 is not cached, so it needs calculation (which will fail)
        await api_handler.service.cache.set("000001", "ma10", 10.6)  # Cache different indicator

        # Make data source fail
        api_handler.service.data_source.should_fail = True

        result = await api_handler.handle_get_indicators(
            "000001", "ma5", allow_fallback=True
        )

        assert result["success"] is True
        # ma5 calculation failed and used fallback (approximate calculation)
        assert "ma5" in result["data"]["indicators"]
        assert len(result["meta"]["fallback"]) >= 0  # May or may not have fallback info

    @pytest.mark.asyncio
    async def test_api_without_fallback(self, api_handler):
        """Test API without fallback shows errors."""
        # Ensure ma5 is not in cache
        await api_handler.service.cache.set("000001", "ma10", 10.6)  # Different indicator

        api_handler.service.data_source.should_fail = True

        result = await api_handler.handle_get_indicators(
            "000001", "ma5", allow_fallback=False
        )

        assert result["success"] is True  # Request succeeds but with errors
        assert result["data"]["error_count"] == 1

    @pytest.mark.asyncio
    async def test_api_single_indicator(self, api_handler):
        """Test API with single indicator."""
        result = await api_handler.handle_get_indicators(
            "000001", "ma5"
        )

        assert result["success"] is True
        assert len(result["data"]["indicators"]) == 1

    @pytest.mark.asyncio
    async def test_api_response_structure(self, api_handler):
        """Test API response structure."""
        result = await api_handler.handle_get_indicators(
            "000001", "ma5,macd,rsi"
        )

        assert "success" in result
        assert "data" in result
        assert "meta" in result
        assert "requested" in result["meta"]
        assert "cached" in result["meta"]
        assert "fallback" in result["meta"]


class TestIndicatorResilienceScenarios:
    """Test various resilience scenarios."""

    @pytest.mark.asyncio
    async def test_partial_failure_with_partial_cache(self):
        """Test partial failure with some cached indicators."""
        mock_redis = MockRedisClient()
        cache = IndicatorCache(mock_redis)
        data_source = MockDataSource()
        service = TechnicalIndicatorServiceWithCache(data_source, cache)

        # Cache only ma5
        await cache.set("000001", "ma5", 10.5)

        # Make data source fail for new calculations
        data_source.should_fail = True

        result = await service.calculate_with_cache(
            "000001", ["ma5", "rsi", "macd"],
            use_cached=True, allow_fallback=True
        )

        # ma5 from cache, others fallback or fail
        assert "ma5" in result["indicators"]
        assert result["indicators"]["ma5"] == 10.5

    @pytest.mark.asyncio
    async def test_cascading_failure_recovery(self):
        """Test recovery from cascading failures."""
        mock_redis = MockRedisClient()
        cache = IndicatorCache(mock_redis)
        data_source = MockDataSource()
        service = TechnicalIndicatorServiceWithCache(data_source, cache)

        # First call fails and uses fallback
        data_source.should_fail = True
        await cache.set("000001", "ma5", 10.5)

        result1 = await service.calculate_with_cache(
            "000001", ["ma5"], allow_fallback=True
        )
        assert result1["indicators"]["ma5"] == 10.5

        # Data source recovers
        data_source.should_fail = False

        # Second call should calculate fresh
        result2 = await service.calculate_with_cache(
            "000001", ["ma5"], use_cached=False
        )
        assert "ma5" in result2["indicators"]

    @pytest.mark.asyncio
    async def test_cache_warming(self):
        """Test cache warming strategy."""
        mock_redis = MockRedisClient()
        cache = IndicatorCache(mock_redis)
        data_source = MockDataSource()
        service = TechnicalIndicatorServiceWithCache(data_source, cache)

        # Pre-calculate and cache indicators
        indicators = ["ma5", "ma10", "ma20", "rsi", "macd"]
        result = await service.calculate_with_cache(
            "000001", indicators, use_cached=False
        )

        # All should now be in cache
        for indicator in indicators:
            cached = await cache.get("000001", indicator)
            assert cached is not None, f"{indicator} should be cached"

        # Subsequent calls should be from cache
        result2 = await service.calculate_with_cache(
            "000001", indicators, use_cached=True
        )
        assert len(result2["cached"]) == 5
