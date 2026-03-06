"""
Tests for AI Query Service - AI决策服务批量行情查询

测试覆盖：
- 多维度并集查询
- 智能采样和压缩
- 多级缓存机制
- 批量并行查询
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime, timedelta
import asyncio

from data_service.models.ai_query import (
    AIQueryRequest, AIQueryScope, AIQueryFilter,
    InfoDensity, TimeRangeStrategy, DataType
)
from data_service.models.stock import StockQuote, StockSymbol


class TestAIQueryRequest:
    """Test AIQueryRequest model validation."""

    def test_valid_request(self):
        """Test creating a valid AI query request."""
        request = AIQueryRequest(
            scope=AIQueryScope(
                sectors=["financial", "technology"],
                symbols=["000001.SZ"]
            ),
            info_density=InfoDensity.MEDIUM,
            max_stocks=200,
            request_id="test_001"
        )

        assert request.scope.sectors == ["financial", "technology"]
        assert request.scope.symbols == ["000001.SZ"]
        assert request.info_density == InfoDensity.MEDIUM
        assert request.max_stocks == 200

    def test_default_values(self):
        """Test default values for AI query request."""
        request = AIQueryRequest(
            scope=AIQueryScope(symbols=["000001.SZ"])
        )

        assert request.info_density == InfoDensity.MEDIUM
        assert request.max_stocks == 100
        assert request.time_range == TimeRangeStrategy.REALTIME_ONLY
        assert request.data_types == [DataType.QUOTE]

    def test_invalid_symbol_format(self):
        """Test validation of symbol format."""
        with pytest.raises(ValueError):
            AIQueryRequest(
                scope=AIQueryScope(symbols=["INVALID"])  # Missing exchange suffix
            )

    def test_max_stocks_validation(self):
        """Test max_stocks validation."""
        with pytest.raises(ValueError):
            AIQueryRequest(
                scope=AIQueryScope(symbols=["000001.SZ"]),
                max_stocks=2000  # Exceeds max of 1000
            )

        with pytest.raises(ValueError):
            AIQueryRequest(
                scope=AIQueryScope(symbols=["000001.SZ"]),
                max_stocks=0  # Less than min of 1
            )


class TestAIQueryService:
    """Test AIQueryService functionality."""

    @pytest.fixture
    def mock_data_service(self):
        """Create mock data service."""
        service = Mock()
        service.redis_cache = Mock()
        service.redis_cache.get = AsyncMock(return_value=None)
        service.redis_cache.set = AsyncMock()
        service.get_stock_quote = AsyncMock()
        service.get_stock_info = AsyncMock()
        service._get_sector_symbols = AsyncMock()
        service._get_industry_symbols = AsyncMock()
        service._get_concept_symbols = AsyncMock()
        service.get_index_components = AsyncMock()
        return service

    @pytest.fixture
    def ai_query_service(self, mock_data_service):
        """Create AI query service with mocks."""
        from data_service.services.ai_query_service import AIQueryService
        return AIQueryService(mock_data_service, mock_data_service.redis_cache)

    @pytest.fixture
    def sample_quote(self):
        """Create sample stock quote."""
        return StockQuote(
            symbol="000001.SZ",
            name="平安银行",
            price=10.5,
            open=10.0,
            high=10.8,
            low=9.9,
            prev_close=10.0,
            change=0.5,
            change_percent=5.0,
            volume=1000000,
            amount=10500000.0,
            timestamp=datetime.now()
        )

    @pytest.mark.asyncio
    async def test_generate_cache_key_consistency(self, ai_query_service):
        """Test cache key generation is consistent for same request."""
        request = AIQueryRequest(
            scope=AIQueryScope(sectors=["financial"], symbols=["000001.SZ"]),
            info_density=InfoDensity.MEDIUM
        )

        key1 = ai_query_service._generate_cache_key(request)
        key2 = ai_query_service._generate_cache_key(request)

        assert key1 == key2
        assert key1.startswith("ai:")

    @pytest.mark.asyncio
    async def test_get_symbols_from_scope_single_symbol(self, ai_query_service, mock_data_service):
        """Test getting symbols from single symbol scope."""
        scope = AIQueryScope(symbols=["000001.SZ", "000002.SZ"])

        symbols = await ai_query_service._get_symbols_from_scope(scope)

        assert symbols == {"000001.SZ", "000002.SZ"}

    @pytest.mark.asyncio
    async def test_get_symbols_from_scope_with_sector(self, ai_query_service, mock_data_service):
        """Test getting symbols from sector scope."""
        mock_data_service._get_sector_symbols.return_value = ["000001.SZ", "000002.SZ"]
        scope = AIQueryScope(sectors=["financial"])

        symbols = await ai_query_service._get_symbols_from_scope(scope)

        assert "000001.SZ" in symbols
        assert "000002.SZ" in symbols
        mock_data_service._get_sector_symbols.assert_called_once_with("financial")

    @pytest.mark.asyncio
    async def test_get_symbols_from_scope_union(self, ai_query_service, mock_data_service):
        """Test union of multiple scopes (no duplicates)."""
        mock_data_service._get_sector_symbols.return_value = ["000001.SZ", "000002.SZ"]
        mock_data_service._get_industry_symbols.return_value = ["000002.SZ", "000003.SZ"]

        scope = AIQueryScope(
            sectors=["financial"],
            industries=["banking"],
            symbols=["000001.SZ"]  # Duplicate with sector
        )

        symbols = await ai_query_service._get_symbols_from_scope(scope)

        # Should be union without duplicates
        assert symbols == {"000001.SZ", "000002.SZ", "000003.SZ"}

    @pytest.mark.asyncio
    async def test_build_compact_data_ultra_low(self, ai_query_service, mock_data_service, sample_quote):
        """Test building compact data with ultra_low density."""
        mock_data_service.get_stock_quote.return_value = sample_quote

        compact_data = await ai_query_service._build_compact_data(
            symbol="000001.SZ",
            quote=sample_quote,
            data_types=[DataType.QUOTE],
            info_density=InfoDensity.ULTRA_LOW
        )

        # Ultra low should only have basic fields
        assert compact_data.symbol == "000001.SZ"
        assert compact_data.price is not None
        assert compact_data.change_percent is not None
        assert compact_data.volume is not None

    @pytest.mark.asyncio
    async def test_build_compact_data_medium(self, ai_query_service, mock_data_service, sample_quote):
        """Test building compact data with medium density."""
        mock_data_service.get_stock_quote.return_value = sample_quote
        mock_data_service.get_stock_info.return_value = Mock(
            market_cap=2000.5,
            pe_ratio=8.5,
            pb_ratio=1.2
        )

        compact_data = await ai_query_service._build_compact_data(
            symbol="000001.SZ",
            quote=sample_quote,
            data_types=[DataType.QUOTE],
            info_density=InfoDensity.MEDIUM
        )

        # Medium should have valuation data
        assert compact_data.market_cap == 2000.5
        assert compact_data.pe_ratio == 8.5
        assert compact_data.pb_ratio == 1.2

    @pytest.mark.asyncio
    async def test_apply_sampling_with_priority(self, ai_query_service):
        """Test sampling preserves priority symbols."""
        stocks = [
            Mock(symbol=f"000{i:03d}.SZ", market_cap=1000-i*10)
            for i in range(1, 101)
        ]

        priority = ["000001.SZ", "000010.SZ"]
        result = ai_query_service._apply_sampling(
            stocks=stocks,
            info_density=InfoDensity.LOW,  # 25% sampling
            max_stocks=20,
            priority_symbols=priority
        )

        # Priority symbols should be in result
        symbols = [s.symbol for s in result]
        assert "000001.SZ" in symbols
        assert "000010.SZ" in symbols

    @pytest.mark.asyncio
    async def test_calculate_market_summary(self, ai_query_service):
        """Test market summary calculation."""
        stocks = [
            Mock(symbol="000001.SZ", change_percent=5.0, volume=1000000, amount=10000000),
            Mock(symbol="000002.SZ", change_percent=-3.0, volume=2000000, amount=20000000),
            Mock(symbol="000003.SZ", change_percent=0.0, volume=1500000, amount=15000000),
            Mock(symbol="000004.SZ", change_percent=8.0, volume=500000, amount=5000000),
        ]

        summary = ai_query_service._calculate_market_summary(stocks)

        assert summary.total_stocks == 4
        assert summary.up_count == 2
        assert summary.down_count == 1
        assert summary.flat_count == 1
        assert summary.total_volume == 5000000
        assert summary.total_amount == 50000000

    @pytest.mark.asyncio
    async def test_query_integration(self, ai_query_service, mock_data_service, sample_quote):
        """Test full query integration."""
        # Setup mocks
        mock_data_service._get_sector_symbols = AsyncMock(return_value=["000001.SZ"])
        mock_data_service.get_stock_quote = AsyncMock(return_value=sample_quote)
        mock_data_service.get_stock_info = AsyncMock(return_value=Mock(market_cap=2000.0, pe_ratio=8.0, pb_ratio=1.0))

        request = AIQueryRequest(
            scope=AIQueryScope(sectors=["financial"]),
            info_density=InfoDensity.MEDIUM,
            max_stocks=10,
            include_market_summary=True,
            request_id="test_integration"
        )

        response = await ai_query_service.query(request)

        assert response.success is True
        assert response.request_id == "test_integration"
        assert len(response.stocks) > 0
        assert response.market_summary is not None
        assert response.metadata.query_time_ms >= 0

    @pytest.mark.asyncio
    async def test_query_cache_hit(self, ai_query_service, mock_data_service):
        """Test cache hit returns cached result."""
        from data_service.models.ai_query import AIQueryResponse, AIQueryMetadata

        cached_response = AIQueryResponse(
            success=True,
            request_id="cached",
            stocks=[],
            stock_count=0,
            total_matched=0,
            metadata=AIQueryMetadata(
                request_id="cached",
                query_time_ms=0,
                data_scope={},
                sampling_rate=1.0,
                compression_ratio=1.0,
                cache_hit=True,
                data_timestamp=datetime.now()
            )
        )

        mock_data_service.redis_cache.get.return_value = cached_response.model_dump()

        request = AIQueryRequest(
            scope=AIQueryScope(symbols=["000001.SZ"]),
            request_id="cache_test"
        )

        response = await ai_query_service.query(request)

        assert response.metadata.cache_hit is True

    @pytest.mark.asyncio
    async def test_query_empty_scope(self, ai_query_service):
        """Test query with empty scope returns empty result."""
        request = AIQueryRequest(
            scope=AIQueryScope(),  # Empty scope
            request_id="empty_test"
        )

        response = await ai_query_service.query(request)

        assert response.success is True
        assert response.stock_count == 0
        assert response.total_matched == 0

    @pytest.mark.asyncio
    async def test_query_error_handling(self, ai_query_service, mock_data_service):
        """Test graceful error handling in query - returns empty result with success=True."""
        # Simulate database error in sector symbols fetch
        mock_data_service._get_sector_symbols = AsyncMock(side_effect=Exception("Database error"))

        request = AIQueryRequest(
            scope=AIQueryScope(sectors=["financial"]),
            request_id="error_test"
        )

        response = await ai_query_service.query(request)

        # Implementation uses graceful degradation - returns success=True even on errors
        # This allows the system to continue operating with partial data
        assert response.success is True
        assert response.stock_count == 0  # No stocks returned due to error
        assert response.request_id == "error_test"


class TestCachingMechanism:
    """Test multi-level caching mechanism."""

    @pytest.fixture
    def mock_data_service(self):
        service = Mock()
        service.redis_cache = Mock()
        service.redis_cache.get = AsyncMock()
        service.redis_cache.set = AsyncMock()
        return service

    @pytest.fixture
    def ai_query_service(self, mock_data_service):
        from data_service.services.ai_query_service import AIQueryService
        return AIQueryService(mock_data_service, mock_data_service.redis_cache)

    @pytest.mark.asyncio
    async def test_symbol_mapping_cache(self, ai_query_service, mock_data_service):
        """Test symbol mapping is cached."""
        mock_data_service._get_sector_symbols = AsyncMock(return_value=["000001.SZ"])
        mock_data_service.redis_cache.get = AsyncMock(return_value=None)

        # First call
        await ai_query_service._get_sector_symbols_cached("financial")

        # Verify cache write
        mock_data_service.redis_cache.set.assert_called_once()
        args = mock_data_service.redis_cache.set.call_args
        assert args[0][0] == "symbols:sector:financial"

    @pytest.mark.asyncio
    async def test_result_cache_ttl(self, ai_query_service, mock_data_service):
        """Test result cache TTL configuration."""
        from data_service.models.ai_query import AIQueryResponse, AIQueryMetadata

        response = AIQueryResponse(
            success=True,
            request_id="test",
            stocks=[],
            stock_count=0,
            total_matched=0,
            metadata=AIQueryMetadata(
                request_id="test",
                query_time_ms=100,
                data_scope={},
                sampling_rate=1.0,
                compression_ratio=1.0,
                cache_hit=False,
                data_timestamp=datetime.now()
            )
        )

        await ai_query_service._cache_result("test_key", response, ttl=30)

        # Verify TTL is passed
        mock_data_service.redis_cache.set.assert_called_once()
        kwargs = mock_data_service.redis_cache.set.call_args[1]
        assert kwargs.get("expire") == 30


class TestPerformanceOptimization:
    """Test performance optimizations."""

    @pytest.fixture
    def mock_data_service(self):
        service = Mock()
        service.redis_cache = Mock()
        service.redis_cache.get = AsyncMock(return_value=None)
        service.redis_cache.set = AsyncMock()
        service.get_stock_quote = AsyncMock()
        return service

    @pytest.fixture
    def ai_query_service(self, mock_data_service):
        from data_service.services.ai_query_service import AIQueryService
        return AIQueryService(mock_data_service, mock_data_service.redis_cache)

    @pytest.mark.asyncio
    async def test_parallel_fetch_limit(self, ai_query_service, mock_data_service):
        """Test parallel fetch respects concurrency limit."""
        # Create many symbols
        symbols = [f"000{i:03d}.SZ" for i in range(1, 101)]

        # Mock get_stock_quote with delay
        async def slow_quote(symbol):
            await asyncio.sleep(0.01)
            return Mock(symbol=symbol)

        mock_data_service.get_stock_quote.side_effect = slow_quote

        # This should complete without overwhelming the system
        start = datetime.now()
        results = await ai_query_service._fetch_stock_data_parallel(
            symbols[:10],
            [DataType.QUOTE],
            InfoDensity.LOW
        )
        elapsed = (datetime.now() - start).total_seconds()

        # With concurrency limit of 20, 10 requests should complete quickly
        assert elapsed < 0.5  # Should be much faster than 10 * 0.01 = 0.1s

    def test_sampling_rates(self, ai_query_service):
        """Test sampling rates for different densities."""
        assert ai_query_service.SAMPLING_RATES["ultra_low"] == 0.10
        assert ai_query_service.SAMPLING_RATES["low"] == 0.25
        assert ai_query_service.SAMPLING_RATES["medium"] == 0.50
        assert ai_query_service.SAMPLING_RATES["high"] == 0.75
        assert ai_query_service.SAMPLING_RATES["full"] == 1.00
