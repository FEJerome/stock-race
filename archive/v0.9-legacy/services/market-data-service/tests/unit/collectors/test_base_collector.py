"""
Unit tests for base collector interface.

Tests the abstract base class DataSource and its interface definition.
"""

import pytest
from datetime import datetime
from typing import List, Dict, Any
from unittest.mock import Mock, AsyncMock, patch

from data_service.collectors.base import DataSource, DataSourceError, RateLimitError


class MockDataSource(DataSource):
    """Mock implementation of DataSource for testing."""

    async def get_stock_quote(self, symbol: str) -> Dict[str, Any]:
        return {"symbol": symbol, "price": 10.0}

    async def get_stock_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> List[Dict[str, Any]]:
        return [{"symbol": symbol, "close": 10.0}]

    async def get_stock_info(self, symbol: str) -> Dict[str, Any]:
        return {"symbol": symbol, "name": "Test Stock"}

    async def get_batch_quotes(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        return {symbol: {"price": 10.0} for symbol in symbols}


class TestDataSourceInterface:
    """Test DataSource abstract interface."""

    @pytest.fixture
    def data_source(self):
        """Create a mock data source instance."""
        return MockDataSource(name="test", priority=1)

    @pytest.mark.asyncio
    async def test_datasource_initialization(self, data_source):
        """Test DataSource initialization."""
        assert data_source.name == "test"
        assert data_source.priority == 1
        assert data_source.request_count == 0
        assert data_source.error_count == 0
        assert data_source.session is None

    @pytest.mark.asyncio
    async def test_context_manager(self, data_source):
        """Test async context manager."""
        async with data_source as ds:
            assert ds.session is not None
        # After exiting context, session should be closed

    @pytest.mark.asyncio
    async def test_get_stock_quote_interface(self, data_source):
        """Test get_stock_quote interface."""
        result = await data_source.get_stock_quote("000001.SZ")
        assert result["symbol"] == "000001.SZ"
        assert "price" in result

    @pytest.mark.asyncio
    async def test_get_stock_history_interface(self, data_source):
        """Test get_stock_history interface."""
        start = datetime(2026, 1, 1)
        end = datetime(2026, 1, 31)
        result = await data_source.get_stock_history("000001.SZ", start, end, "1d")
        assert isinstance(result, list)
        assert len(result) > 0
        assert result[0]["symbol"] == "000001.SZ"

    @pytest.mark.asyncio
    async def test_get_stock_info_interface(self, data_source):
        """Test get_stock_info interface."""
        result = await data_source.get_stock_info("000001.SZ")
        assert result["symbol"] == "000001.SZ"
        assert "name" in result

    @pytest.mark.asyncio
    async def test_get_batch_quotes_interface(self, data_source):
        """Test get_batch_quotes interface."""
        symbols = ["000001.SZ", "600519.SH"]
        result = await data_source.get_batch_quotes(symbols)
        assert isinstance(result, dict)
        assert "000001.SZ" in result
        assert "600519.SH" in result


class TestDataSourceErrors:
    """Test DataSource error handling."""

    def test_datasource_error(self):
        """Test DataSourceError exception."""
        error = DataSourceError("Test error")
        assert str(error) == "Test error"

    def test_rate_limit_error(self):
        """Test RateLimitError exception."""
        error = RateLimitError("Rate limit exceeded")
        assert str(error) == "Rate limit exceeded"
        assert isinstance(error, DataSourceError)


class TestDataSourceHealth:
    """Test DataSource health status."""

    @pytest.fixture
    def data_source(self):
        """Create a mock data source instance."""
        return MockDataSource(name="test", priority=1)

    def test_health_status_initial(self, data_source):
        """Test initial health status."""
        status = data_source.get_health_status()
        assert status["name"] == "test"
        assert status["priority"] == 1
        assert status["request_count"] == 0
        assert status["error_count"] == 0
        assert status["error_rate"] == 0.0
        assert status["is_healthy"] is True

    def test_health_status_with_errors(self, data_source):
        """Test health status with errors."""
        data_source.error_count = 15
        data_source.request_count = 20
        status = data_source.get_health_status()
        assert status["error_count"] == 15
        assert status["request_count"] == 20
        assert status["error_rate"] == 0.75
        assert status["is_healthy"] is False  # error_count >= 10

    def test_health_status_last_request(self, data_source):
        """Test health status includes last request time."""
        now = datetime.now()
        data_source.last_request_time = now
        status = data_source.get_health_status()
        assert status["last_request"] == now.isoformat()


class TestDataSourceRequestHandling:
    """Test DataSource request handling."""

    @pytest.fixture
    def data_source(self):
        """Create a mock data source instance."""
        return MockDataSource(name="test", priority=1)

    @pytest.mark.asyncio
    async def test_make_request_success(self, data_source, mock_session):
        """Test successful HTTP request."""
        mock_response_text = '{"data": "test"}'
        mock_session_obj = mock_session(response_text=mock_response_text, status=200, content_type="text/plain")
        data_source.session = mock_session_obj

        result = await data_source._make_request("http://test.com")
        assert result == {"text": mock_response_text}

    @pytest.mark.asyncio
    async def test_make_request_rate_limit(self, data_source, mock_aiohttp_response):
        """Test rate limit handling."""
        mock_response = mock_aiohttp_response(status=429)
        mock_session = Mock()

        class AsyncContextManagerMock:
            async def __aenter__(self):
                return mock_response
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                return None

        mock_session.request = lambda *args, **kwargs: AsyncContextManagerMock()
        data_source.session = mock_session

        with pytest.raises(RateLimitError):
            await data_source._make_request("http://test.com")

    @pytest.mark.asyncio
    async def test_make_request_error(self, data_source, mock_aiohttp_response):
        """Test HTTP error handling."""
        mock_response = mock_aiohttp_response(status=500)
        mock_session = Mock()

        class AsyncContextManagerMock:
            async def __aenter__(self):
                return mock_response
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                return None

        mock_session.request = lambda *args, **kwargs: AsyncContextManagerMock()
        data_source.session = mock_session

        with pytest.raises(DataSourceError):
            await data_source._make_request("http://test.com")

    @pytest.mark.asyncio
    async def test_retry_request_success(self, data_source):
        """Test retry mechanism with eventual success."""
        call_count = 0

        async def failing_then_success():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise DataSourceError("Temporary error")
            return "success"

        result = await data_source._retry_request(failing_then_success)
        assert result == "success"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_retry_request_failure(self, data_source):
        """Test retry mechanism with persistent failure."""
        async def always_fail():
            raise DataSourceError("Persistent error")

        with pytest.raises(DataSourceError) as exc_info:
            await data_source._retry_request(always_fail)
        assert "Failed after" in str(exc_info.value)


class TestDataSourceRateLimiting:
    """Test DataSource rate limiting."""

    @pytest.fixture
    def data_source(self):
        """Create a mock data source instance."""
        return MockDataSource(name="test", priority=1)

    @pytest.mark.asyncio
    async def test_rate_limit_delay(self, data_source):
        """Test rate limiting delays requests."""
        import time

        data_source.last_request_time = datetime.now()
        start = time.time()
        await data_source._check_rate_limit()
        elapsed = time.time() - start

        # Should have minimal delay for first request
        assert elapsed < 0.2

    @pytest.mark.asyncio
    async def test_rate_limit_no_delay_if_sufficient_time(self, data_source):
        """Test no delay if sufficient time has passed."""
        import time

        # Set last request to 1 second ago
        data_source.last_request_time = datetime.now() - __import__('datetime').timedelta(seconds=1)
        start = time.time()
        await data_source._check_rate_limit()
        elapsed = time.time() - start

        # Should not delay
        assert elapsed < 0.05
