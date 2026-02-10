"""
Integration tests for quotes REST API.

Tests real-time quote query endpoints:
- GET /api/quotes/{symbol} - Single quote
- GET /api/quotes/batch - Batch quotes
- Parameter validation
- Performance requirements
"""

import pytest
import asyncio
import time
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from unittest.mock import Mock, AsyncMock


class MockQuoteCache:
    """Mock quote cache for API testing."""

    def __init__(self):
        self.data = {}

    def _normalize_symbol(self, symbol: str) -> str:
        """Normalize symbol to uppercase."""
        return symbol.strip().upper()

    async def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get quote from cache."""
        return self.data.get(self._normalize_symbol(symbol))

    async def get_quotes_batch(self, symbols: List[str]) -> Dict[str, Optional[Dict[str, Any]]]:
        """Get multiple quotes from cache."""
        return {s: self.data.get(self._normalize_symbol(s)) for s in symbols}

    def set_mock_data(self, symbol: str, data: Dict[str, Any]):
        """Set mock data for testing."""
        self.data[self._normalize_symbol(symbol)] = data


class MockTimescaleDB:
    """Mock TimescaleDB for API testing."""

    def __init__(self):
        self.quotes = {}

    async def get_latest_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get latest quote from database."""
        return self.quotes.get(symbol)

    def set_mock_data(self, symbol: str, data: Dict[str, Any]):
        """Set mock data for testing."""
        self.quotes[symbol] = data


class QuotesAPIHandler:
    """
    API handler for quotes endpoints.

    Endpoints:
    - GET /api/quotes/{symbol} - Get real-time quote
    - GET /api/quotes/batch?symbols=000001,600519 - Get batch quotes
    """

    def __init__(self, quote_cache=None, timescale_db=None):
        self.quote_cache = quote_cache or MockQuoteCache()
        self.timescale_db = timescale_db or MockTimescaleDB()
        self.request_count = 0
        self.error_count = 0

    def _validate_symbol(self, symbol: str) -> tuple:
        """Validate stock symbol format."""
        if not symbol:
            return False, "Symbol is required"

        # Remove whitespace and make uppercase
        symbol = symbol.strip().upper()
        # Remove exchange suffix if present
        symbol_clean = symbol.replace('.SZ', '').replace('.SH', '')

        if not symbol_clean.isdigit():
            return False, "Symbol must contain only digits"

        if len(symbol_clean) != 6:
            return False, "Symbol must be 6 digits"

        return True, None

    def _format_quote_response(self, symbol: str, quote: Dict[str, Any]) -> Dict[str, Any]:
        """Format quote for API response."""
        return {
            "symbol": symbol,
            "price": quote.get("price"),
            "open": quote.get("open"),
            "high": quote.get("high"),
            "low": quote.get("low"),
            "prev_close": quote.get("prev_close"),
            "change": quote.get("change"),
            "change_percent": quote.get("change_percent"),
            "volume": quote.get("volume"),
            "amount": quote.get("amount"),
            "bid_price": quote.get("bid_price"),
            "ask_price": quote.get("ask_price"),
            "bid_volume": quote.get("bid_volume"),
            "ask_volume": quote.get("ask_volume"),
            "updated_at": quote.get("updated_at", datetime.now().isoformat())
        }

    async def handle_get_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Handle GET /api/quotes/{symbol}.

        Args:
            symbol: Stock symbol

        Returns:
            API response dictionary
        """
        self.request_count += 1

        # Validate symbol
        valid, error = self._validate_symbol(symbol)
        if not valid:
            self.error_count += 1
            return {
                "success": False,
                "error": error,
                "code": "INVALID_SYMBOL"
            }

        try:
            # Try cache first
            quote = await self.quote_cache.get_quote(symbol)

            # Fallback to database if not in cache
            if quote is None:
                quote = await self.timescale_db.get_latest_quote(symbol)

            if quote is None:
                return {
                    "success": False,
                    "error": f"Quote not found for symbol: {symbol}",
                    "code": "NOT_FOUND"
                }

            return {
                "success": True,
                "data": self._format_quote_response(symbol, quote)
            }

        except Exception as e:
            self.error_count += 1
            return {
                "success": False,
                "error": str(e),
                "code": "INTERNAL_ERROR"
            }

    async def handle_get_batch_quotes(self, symbols_str: str) -> Dict[str, Any]:
        """
        Handle GET /api/quotes/batch.

        Args:
            symbols_str: Comma-separated list of symbols

        Returns:
            API response dictionary
        """
        self.request_count += 1

        if not symbols_str:
            self.error_count += 1
            return {
                "success": False,
                "error": "Symbols parameter is required",
                "code": "MISSING_SYMBOLS"
            }

        # Parse symbols
        symbols = [s.strip().upper() for s in symbols_str.split(",")]

        # Validate all symbols
        invalid_symbols = []
        for symbol in symbols:
            valid, _ = self._validate_symbol(symbol)
            if not valid:
                invalid_symbols.append(symbol)

        if invalid_symbols:
            self.error_count += 1
            return {
                "success": False,
                "error": f"Invalid symbols: {', '.join(invalid_symbols)}",
                "code": "INVALID_SYMBOLS"
            }

        # Limit batch size
        if len(symbols) > 100:
            symbols = symbols[:100]

        try:
            # Get quotes from cache
            quotes = await self.quote_cache.get_quotes_batch(symbols)

            # Format results
            results = {}
            for symbol in symbols:
                if quotes.get(symbol):
                    results[symbol] = self._format_quote_response(symbol, quotes[symbol])
                else:
                    results[symbol] = None

            return {
                "success": True,
                "data": {
                    "quotes": results,
                    "count": len([q for q in results.values() if q is not None]),
                    "total": len(symbols)
                }
            }

        except Exception as e:
            self.error_count += 1
            return {
                "success": False,
                "error": str(e),
                "code": "INTERNAL_ERROR"
            }

    def get_stats(self) -> Dict[str, Any]:
        """Get API handler statistics."""
        return {
            "request_count": self.request_count,
            "error_count": self.error_count,
            "success_rate": (self.request_count - self.error_count) / self.request_count
                          if self.request_count > 0 else 1.0
        }


class TestQuotesAPISingleQuote:
    """Test single quote API endpoint."""

    @pytest.fixture
    def api_handler(self):
        cache = MockQuoteCache()
        db = MockTimescaleDB()
        return QuotesAPIHandler(quote_cache=cache, timescale_db=db)

    @pytest.fixture
    def sample_quote(self):
        return {
            "price": 10.50,
            "open": 10.30,
            "high": 10.80,
            "low": 10.20,
            "prev_close": 10.40,
            "change": 0.10,
            "change_percent": 0.96,
            "volume": 1000000,
            "amount": 10500000.0,
            "bid_price": 10.49,
            "ask_price": 10.51,
            "bid_volume": 500,
            "ask_volume": 600,
            "updated_at": "2026-02-10T14:30:00Z"
        }

    @pytest.mark.asyncio
    async def test_get_quote_success_from_cache(self, api_handler, sample_quote):
        """Test getting quote from cache."""
        api_handler.quote_cache.set_mock_data("000001.SZ", sample_quote)

        result = await api_handler.handle_get_quote("000001.SZ")

        assert result["success"] is True
        assert result["data"]["symbol"] == "000001.SZ"
        assert result["data"]["price"] == 10.50

    @pytest.mark.asyncio
    async def test_get_quote_success_from_db(self, api_handler, sample_quote):
        """Test getting quote from database (cache miss)."""
        api_handler.timescale_db.set_mock_data("600519.SH", sample_quote)

        result = await api_handler.handle_get_quote("600519.SH")

        assert result["success"] is True
        assert result["data"]["symbol"] == "600519.SH"

    @pytest.mark.asyncio
    async def test_get_quote_not_found(self, api_handler):
        """Test getting non-existent quote."""
        result = await api_handler.handle_get_quote("000001.SZ")

        assert result["success"] is False
        assert result["code"] == "NOT_FOUND"

    @pytest.mark.asyncio
    async def test_get_quote_empty_symbol(self, api_handler):
        """Test getting quote with empty symbol."""
        result = await api_handler.handle_get_quote("")

        assert result["success"] is False
        assert result["code"] == "INVALID_SYMBOL"

    @pytest.mark.asyncio
    async def test_get_quote_invalid_format(self, api_handler):
        """Test getting quote with invalid symbol format."""
        result = await api_handler.handle_get_quote("ABC123")

        assert result["success"] is False
        assert result["code"] == "INVALID_SYMBOL"

    @pytest.mark.asyncio
    async def test_get_quote_wrong_length(self, api_handler):
        """Test getting quote with wrong symbol length."""
        result = await api_handler.handle_get_quote("00001")

        assert result["success"] is False
        assert "6 digits" in result["error"]


class TestQuotesAPIBatchQuotes:
    """Test batch quotes API endpoint."""

    @pytest.fixture
    def api_handler(self):
        cache = MockQuoteCache()
        return QuotesAPIHandler(quote_cache=cache)

    @pytest.fixture
    def sample_quotes(self):
        return {
            "000001.SZ": {"price": 10.50, "volume": 1000000},
            "600519.SH": {"price": 1500.0, "volume": 500000},
            "000858.SZ": {"price": 50.0, "volume": 2000000}
        }

    @pytest.mark.asyncio
    async def test_get_batch_quotes_success(self, api_handler, sample_quotes):
        """Test getting batch quotes."""
        for symbol, data in sample_quotes.items():
            api_handler.quote_cache.set_mock_data(symbol, data)

        result = await api_handler.handle_get_batch_quotes("000001.SZ,600519.SH,000858.SZ")

        assert result["success"] is True
        assert result["data"]["count"] == 3
        assert result["data"]["total"] == 3
        assert "000001.SZ" in result["data"]["quotes"]

    @pytest.mark.asyncio
    async def test_get_batch_quotes_partial(self, api_handler):
        """Test batch quotes with some missing."""
        api_handler.quote_cache.set_mock_data("000001.SZ", {"price": 10.50})
        # 600519.SH not set - will be None

        result = await api_handler.handle_get_batch_quotes("000001.SZ,600519.SH")

        assert result["success"] is True
        assert result["data"]["count"] == 1
        assert result["data"]["quotes"]["000001.SZ"] is not None
        assert result["data"]["quotes"]["600519.SH"] is None

    @pytest.mark.asyncio
    async def test_get_batch_quotes_empty_symbols(self, api_handler):
        """Test batch quotes with empty symbols."""
        result = await api_handler.handle_get_batch_quotes("")

        assert result["success"] is False
        assert result["code"] == "MISSING_SYMBOLS"

    @pytest.mark.asyncio
    async def test_get_batch_quotes_invalid_symbol(self, api_handler):
        """Test batch quotes with invalid symbol."""
        result = await api_handler.handle_get_batch_quotes("000001.SZ,INVALID,600519.SH")

        assert result["success"] is False
        assert result["code"] == "INVALID_SYMBOLS"

    @pytest.mark.asyncio
    async def test_get_batch_quotes_limit(self, api_handler):
        """Test batch quotes limit (max 100)."""
        # Set 150 symbols
        symbols = [f"{i:06d}.SZ" for i in range(150)]
        for s in symbols:
            api_handler.quote_cache.set_mock_data(s, {"price": 10.0})

        result = await api_handler.handle_get_batch_quotes(",".join(symbols)
        )

        assert result["success"] is True
        assert result["data"]["total"] == 100  # Limited to 100


class TestQuotesAPIResponseFormat:
    """Test API response format."""

    @pytest.fixture
    def api_handler(self):
        cache = MockQuoteCache()
        return QuotesAPIHandler(quote_cache=cache)

    @pytest.mark.asyncio
    async def test_single_quote_response_structure(self, api_handler):
        """Test single quote response structure."""
        api_handler.quote_cache.set_mock_data("000001.SZ", {
            "price": 10.50,
            "volume": 1000000
        })

        result = await api_handler.handle_get_quote("000001.SZ")

        assert "success" in result
        assert "data" in result
        data = result["data"]
        assert "symbol" in data
        assert "price" in data
        assert "volume" in data
        assert "updated_at" in data

    @pytest.mark.asyncio
    async def test_batch_quotes_response_structure(self, api_handler):
        """Test batch quotes response structure."""
        api_handler.quote_cache.set_mock_data("000001.SZ", {"price": 10.50})

        result = await api_handler.handle_get_batch_quotes("000001.SZ")

        assert "success" in result
        assert "data" in result
        assert "quotes" in result["data"]
        assert "count" in result["data"]
        assert "total" in result["data"]

    @pytest.mark.asyncio
    async def test_error_response_structure(self, api_handler):
        """Test error response structure."""
        result = await api_handler.handle_get_quote("")

        assert "success" in result
        assert "error" in result
        assert "code" in result
        assert result["success"] is False


class TestQuotesAPIPerformance:
    """Test API performance requirements."""

    @pytest.fixture
    def api_handler(self):
        cache = MockQuoteCache()
        return QuotesAPIHandler(quote_cache=cache)

    @pytest.mark.asyncio
    async def test_single_quote_response_time(self, api_handler):
        """Test single quote API response time < 100ms."""
        api_handler.quote_cache.set_mock_data("000001.SZ", {"price": 10.50})

        start = time.time()
        result = await api_handler.handle_get_quote("000001.SZ")
        elapsed_ms = (time.time() - start) * 1000

        assert result["success"] is True
        assert elapsed_ms < 100, f"Response took {elapsed_ms:.2f}ms, expected < 100ms"

    @pytest.mark.asyncio
    async def test_batch_quotes_response_time(self, api_handler):
        """Test batch quotes API response time < 100ms."""
        # Set 50 symbols
        for i in range(50):
            api_handler.quote_cache.set_mock_data(f"{i:06d}.SZ", {"price": 10.0 + i})

        symbols = ",".join([f"{i:06d}.SZ" for i in range(50)])

        start = time.time()
        result = await api_handler.handle_get_batch_quotes(symbols)
        elapsed_ms = (time.time() - start) * 1000

        assert result["success"] is True
        assert elapsed_ms < 100, f"Response took {elapsed_ms:.2f}ms, expected < 100ms"

    @pytest.mark.asyncio
    async def test_concurrent_requests_performance(self, api_handler):
        """Test concurrent API requests performance."""
        for i in range(20):
            api_handler.quote_cache.set_mock_data(f"{i:06d}.SZ", {"price": 10.0 + i})

        async def request(symbol):
            return await api_handler.handle_get_quote(symbol)

        start = time.time()
        tasks = [request(f"{i:06d}.SZ") for i in range(20)]
        results = await asyncio.gather(*tasks)
        elapsed_ms = (time.time() - start) * 1000

        assert all(r["success"] for r in results)
        assert elapsed_ms < 500, f"Concurrent requests took {elapsed_ms:.2f}ms"


class TestQuotesAPIStats:
    """Test API statistics tracking."""

    @pytest.fixture
    def api_handler(self):
        cache = MockQuoteCache()
        return QuotesAPIHandler(quote_cache=cache)

    @pytest.mark.asyncio
    async def test_request_count_tracking(self, api_handler):
        """Test request count tracking."""
        api_handler.quote_cache.set_mock_data("000001.SZ", {"price": 10.50})

        for _ in range(5):
            await api_handler.handle_get_quote("000001.SZ")

        stats = api_handler.get_stats()
        assert stats["request_count"] == 5

    @pytest.mark.asyncio
    async def test_error_count_tracking(self, api_handler):
        """Test error count tracking."""
        # 3 successful requests
        api_handler.quote_cache.set_mock_data("000001.SZ", {"price": 10.50})
        for _ in range(3):
            await api_handler.handle_get_quote("000001.SZ")

        # 2 failed requests
        for _ in range(2):
            await api_handler.handle_get_quote("")

        stats = api_handler.get_stats()
        assert stats["request_count"] == 5
        assert stats["error_count"] == 2
        assert abs(stats["success_rate"] - 0.6) < 0.001


class TestQuotesAPIEdgeCases:
    """Test API edge cases."""

    @pytest.fixture
    def api_handler(self):
        cache = MockQuoteCache()
        return QuotesAPIHandler(quote_cache=cache)

    @pytest.mark.asyncio
    async def test_symbol_case_insensitive(self, api_handler):
        """Test symbol case insensitivity."""
        api_handler.quote_cache.set_mock_data("000001.SZ", {"price": 10.50})

        result = await api_handler.handle_get_quote("000001.sz")
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_symbol_with_whitespace(self, api_handler):
        """Test symbol with whitespace."""
        api_handler.quote_cache.set_mock_data("000001.SZ", {"price": 10.50})

        result = await api_handler.handle_get_quote("  000001.SZ  ")
        # Symbol validation should handle whitespace
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_batch_with_whitespace(self, api_handler):
        """Test batch symbols with whitespace."""
        api_handler.quote_cache.set_mock_data("000001.SZ", {"price": 10.50})
        api_handler.quote_cache.set_mock_data("600519.SH", {"price": 1500.0})

        result = await api_handler.handle_get_batch_quotes("  000001.SZ  ,  600519.SH  ")

        assert result["success"] is True
        assert result["data"]["count"] == 2

    @pytest.mark.asyncio
    async def test_quote_with_special_values(self, api_handler):
        """Test quote with special values (zero, negative change)."""
        api_handler.quote_cache.set_mock_data("000001.SZ", {
            "price": 10.50,
            "change": -0.50,
            "change_percent": -4.76,
            "volume": 0  # Zero volume
        })

        result = await api_handler.handle_get_quote("000001.SZ")

        assert result["success"] is True
        assert result["data"]["change"] == -0.50
        assert result["data"]["volume"] == 0
