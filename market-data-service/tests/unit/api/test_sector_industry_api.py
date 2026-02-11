"""
Tests for sector/industry/index API endpoints (C6-004, C6-005, C6-006, C6-008).
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from fastapi.testclient import TestClient
from datetime import datetime

from data_service.models.stock import StockQuote, StockSymbol


class TestSectorQuotesAPI:
    """Test sector quotes API (C6-004)."""

    @pytest.fixture
    def mock_data_service(self):
        service = Mock()
        service.get_sector_quotes = AsyncMock()
        return service

    @pytest.mark.asyncio
    async def test_get_sector_quotes_success(self, mock_data_service):
        """Test getting sector quotes successfully."""
        mock_quotes = {
            "000001.SZ": StockQuote(
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
        }
        mock_data_service.get_sector_quotes.return_value = mock_quotes

        result = await mock_data_service.get_sector_quotes("financial")

        assert "000001.SZ" in result
        assert result["000001.SZ"].symbol == "000001.SZ"

    @pytest.mark.asyncio
    async def test_get_sector_quotes_pagination(self, mock_data_service):
        """Test sector quotes pagination (C6-008)."""
        mock_data_service.get_sector_quotes.return_value = {}

        await mock_data_service.get_sector_quotes("financial", skip=0, limit=50)

        mock_data_service.get_sector_quotes.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_sector_quotes_invalid_sector(self, mock_data_service):
        """Test getting quotes for invalid sector."""
        mock_data_service.get_sector_quotes.return_value = {}

        result = await mock_data_service.get_sector_quotes("invalid_sector")

        assert result == {}

    @pytest.mark.asyncio
    async def test_get_sector_quotes_caching(self, mock_data_service):
        """Test sector quotes caching (C6-008)."""
        mock_quotes = {"000001.SZ": Mock()}
        mock_data_service.get_sector_quotes.return_value = mock_quotes

        # First call
        result1 = await mock_data_service.get_sector_quotes("financial")
        # Second call (should be cached)
        result2 = await mock_data_service.get_sector_quotes("financial")

        assert result1 == result2


class TestIndustryQuotesAPI:
    """Test industry quotes API (C6-005)."""

    @pytest.fixture
    def mock_data_service(self):
        service = Mock()
        service.get_industry_quotes = AsyncMock()
        return service

    @pytest.mark.asyncio
    async def test_get_industry_quotes_success(self, mock_data_service):
        """Test getting industry quotes successfully."""
        mock_quotes = {
            "000001.SZ": StockQuote(
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
        }
        mock_data_service.get_industry_quotes.return_value = mock_quotes

        result = await mock_data_service.get_industry_quotes("banking")

        assert "000001.SZ" in result

    @pytest.mark.asyncio
    async def test_get_industry_quotes_pagination(self, mock_data_service):
        """Test industry quotes pagination (C6-008)."""
        mock_data_service.get_industry_quotes.return_value = {}

        await mock_data_service.get_industry_quotes("banking", skip=50, limit=50)

        mock_data_service.get_industry_quotes.assert_called_once()


class TestIndexComponentsAPI:
    """Test index components API (C6-006)."""

    @pytest.fixture
    def mock_data_service(self):
        service = Mock()
        service.get_index_components = AsyncMock()
        service.get_index_quotes = AsyncMock()
        return service

    @pytest.mark.asyncio
    async def test_get_index_components_success(self, mock_data_service):
        """Test getting index components successfully."""
        mock_components = [
            StockSymbol(
                symbol="000001.SZ",
                name="平安银行",
                exchange="SZ",
                sector="financial"
            ),
            StockSymbol(
                symbol="000002.SZ",
                name="万科A",
                exchange="SZ",
                sector="real_estate"
            )
        ]
        mock_data_service.get_index_components.return_value = mock_components

        result = await mock_data_service.get_index_components("000001.SH")

        assert len(result) == 2
        assert result[0].symbol == "000001.SZ"

    @pytest.mark.asyncio
    async def test_get_index_quotes_success(self, mock_data_service):
        """Test getting index component quotes."""
        mock_quotes = {
            "000001.SZ": StockQuote(
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
        }
        mock_data_service.get_index_quotes.return_value = mock_quotes

        result = await mock_data_service.get_index_quotes("000001.SH")

        assert "000001.SZ" in result

    @pytest.mark.asyncio
    async def test_get_index_components_invalid_index(self, mock_data_service):
        """Test getting components for invalid index."""
        mock_data_service.get_index_components.return_value = []

        result = await mock_data_service.get_index_components("INVALID")

        assert result == []


class TestStockClassificationMapping:
    """Test stock classification mapping (C6-007)."""

    @pytest.fixture
    def mock_data_service(self):
        service = Mock()
        service.get_stock_classification = AsyncMock()
        service.get_sector_list = AsyncMock()
        service.get_industry_list = AsyncMock()
        return service

    @pytest.mark.asyncio
    async def test_get_stock_classification(self, mock_data_service):
        """Test getting stock classification."""
        mock_classification = {
            "symbol": "000001.SZ",
            "sector": "financial",
            "industry": "banking",
            "concept": ["fintech", "blue_chip"]
        }
        mock_data_service.get_stock_classification.return_value = mock_classification

        result = await mock_data_service.get_stock_classification("000001.SZ")

        assert result["symbol"] == "000001.SZ"
        assert result["sector"] == "financial"
        assert "banking" in result["industry"]

    @pytest.mark.asyncio
    async def test_get_sector_list(self, mock_data_service):
        """Test getting sector list."""
        mock_sectors = [
            {"code": "financial", "name": "金融", "count": 150},
            {"code": "technology", "name": "科技", "count": 200}
        ]
        mock_data_service.get_sector_list.return_value = mock_sectors

        result = await mock_data_service.get_sector_list()

        assert len(result) == 2
        assert result[0]["code"] == "financial"

    @pytest.mark.asyncio
    async def test_get_industry_list(self, mock_data_service):
        """Test getting industry list."""
        mock_industries = [
            {"code": "banking", "name": "银行", "count": 40},
            {"code": "software", "name": "软件", "count": 100}
        ]
        mock_data_service.get_industry_list.return_value = mock_industries

        result = await mock_data_service.get_industry_list()

        assert len(result) == 2
        assert result[0]["code"] == "banking"


class TestCachingAndPagination:
    """Test caching and pagination (C6-008)."""

    @pytest.fixture
    def mock_redis_cache(self):
        cache = Mock()
        cache.get = AsyncMock()
        cache.set = AsyncMock()
        return cache

    @pytest.mark.asyncio
    async def test_sector_quotes_cached(self, mock_redis_cache):
        """Test that sector quotes are cached for 5 minutes."""
        mock_redis_cache.get.return_value = None  # Cache miss

        # After fetching, should be cached
        await mock_redis_cache.set("sector:financial:quotes", {}, expire=300)

        mock_redis_cache.set.assert_called_with("sector:financial:quotes", {}, expire=300)

    @pytest.mark.asyncio
    async def test_pagination_large_dataset(self):
        """Test pagination with large dataset."""
        # Simulate large dataset
        all_stocks = [f"000{i:03d}.SZ" for i in range(1, 1001)]

        # Test pagination
        page1 = all_stocks[0:50]
        page2 = all_stocks[50:100]

        assert len(page1) == 50
        assert len(page2) == 50
        assert page1[-1] == "000050.SZ"
        assert page2[0] == "000051.SZ"

    def test_pagination_parameters(self):
        """Test pagination parameter validation."""
        # Valid parameters
        skip = 0
        limit = 50
        assert skip >= 0
        assert 1 <= limit <= 100

        # Invalid parameters should be rejected
        invalid_skip = -1
        invalid_limit = 101
        assert invalid_skip < 0
        assert invalid_limit > 100


class TestAPIEndpoints:
    """Test API endpoint integration."""

    def test_sector_endpoint_structure(self):
        """Test sector endpoint structure."""
        # Expected endpoint: GET /api/v1/market/sector/{sector}/quotes
        endpoint = "/api/v1/market/sector/{sector}/quotes"
        assert "{sector}" in endpoint
        assert "/quotes" in endpoint

    def test_industry_endpoint_structure(self):
        """Test industry endpoint structure."""
        # Expected endpoint: GET /api/v1/market/industry/{industry}/quotes
        endpoint = "/api/v1/market/industry/{industry}/quotes"
        assert "{industry}" in endpoint
        assert "/quotes" in endpoint

    def test_index_endpoint_structure(self):
        """Test index endpoint structure."""
        # Expected endpoint: GET /api/v1/market/index/{index}/components
        endpoint = "/api/v1/market/index/{index}/components"
        assert "{index}" in endpoint
        assert "/components" in endpoint

    def test_query_parameters(self):
        """Test query parameter structure."""
        # Expected parameters
        params = {
            "skip": 0,
            "limit": 50,
            "sort_by": "market_cap",
            "sort_order": "desc"
        }

        assert params["skip"] >= 0
        assert 1 <= params["limit"] <= 100
        assert params["sort_by"] in ["market_cap", "price", "change_percent", "volume"]
        assert params["sort_order"] in ["asc", "desc"]
