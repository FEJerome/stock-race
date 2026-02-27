"""
Integration tests for HTTP fallback API.

Tests HTTP snapshot endpoint for WebSocket fallback.
"""

import pytest
import asyncio
from typing import Dict, Any, List


class HTTPFallbackHandler:
    """
    API handler for HTTP fallback endpoint.

    Endpoint:
    - GET /api/quotes/snapshot?symbols=000001,600519 - Full snapshot for polling
    """

    def __init__(self, quote_service):
        self.service = quote_service

    async def handle_get_snapshot(self, symbols_str: str) -> Dict[str, Any]:
        """
        Handle GET /api/quotes/snapshot request.

        Args:
            symbols_str: Comma-separated list of symbols

        Returns:
            Full snapshot of quotes for requested symbols
        """
        try:
            symbols = [s.strip() for s in symbols_str.split(",") if s.strip()]

            quotes = await self.service.get_quotes_batch(symbols)

            return {
                "success": True,
                "type": "snapshot",
                "data": quotes,
                "timestamp": datetime.now().isoformat(),
                "count": len(quotes)
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "code": "SNAPSHOT_ERROR"
            }


class QuoteService:
    """Mock quote service."""

    def __init__(self):
        self.quotes = {
            "000001": {"symbol": "000001", "price": 10.5, "change": 0.05},
            "600519": {"symbol": "600519", "price": 150.0, "change": -1.2},
            "000768": {"symbol": "000768", "price": 25.3, "change": 0.12}
        }

    async def get_quotes_batch(self, symbols: List[str]) -> Dict[str, Any]:
        """Get quotes for multiple symbols."""
        await asyncio.sleep(0.01)  # Simulate DB query
        return {
            symbol: self.quotes.get(symbol, {})
            for symbol in symbols
            if symbol in self.quotes
        }


class TestHTTPFallbackAPI:
    """Test HTTP fallback API."""

    @pytest.fixture
    def api_handler(self):
        service = QuoteService()
        return HTTPFallbackHandler(service)

    @pytest.mark.asyncio
    async def test_get_snapshot_single_symbol(self, api_handler):
        """Test snapshot for single symbol."""
        result = await api_handler.handle_get_snapshot("000001")

        assert result["success"] is True
        assert result["type"] == "snapshot"
        assert "000001" in result["data"]
        assert result["data"]["000001"]["price"] == 10.5

    @pytest.mark.asyncio
    async def test_get_snapshot_multiple_symbols(self, api_handler):
        """Test snapshot for multiple symbols."""
        result = await api_handler.handle_get_snapshot("000001,600519")

        assert result["success"] is True
        assert len(result["data"]) == 2
        assert "000001" in result["data"]
        assert "600519" in result["data"]

    @pytest.mark.asyncio
    async def test_get_snapshot_with_spaces(self, api_handler):
        """Test snapshot with spaces in symbol list."""
        result = await api_handler.handle_get_snapshot("000001, 600519")

        assert result["success"] is True
        assert len(result["data"]) == 2

    @pytest.mark.asyncio
    async def test_get_snapshot_unknown_symbol(self, api_handler):
        """Test snapshot with unknown symbol."""
        result = await api_handler.handle_get_snapshot("000001,999999")

        assert result["success"] is True
        # Should only return known symbols
        assert len(result["data"]) == 1
        assert "000001" in result["data"]

    @pytest.mark.asyncio
    async def test_get_snapshot_empty(self, api_handler):
        """Test snapshot with empty symbol list."""
        result = await api_handler.handle_get_snapshot("")

        assert result["success"] is True
        assert result["count"] == 0


class TestHTTPFallbackPerformance:
    """Test HTTP fallback performance."""

    @pytest.mark.asyncio
    async def test_snapshot_response_time(self):
        """Test snapshot response time < 100ms."""
        import time

        service = QuoteService()
        handler = HTTPFallbackHandler(service)

        start = time.time()
        result = await handler.handle_get_snapshot("000001,600519,000768")
        elapsed_ms = (time.time() - start) * 1000

        assert result["success"] is True
        assert elapsed_ms < 100, f"Response took {elapsed_ms:.2f}ms"


from datetime import datetime