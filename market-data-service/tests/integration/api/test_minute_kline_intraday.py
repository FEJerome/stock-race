"""
Integration tests for minute K-line API with intraday data.

Tests API endpoint for minute-level K-lines including real-time data.
"""

import pytest
import asyncio
from typing import Dict, Any, List
from datetime import datetime, timedelta


class MinuteKlineAPIHandler:
    """
    API handler for minute K-line queries.

    Endpoint:
    - GET /api/kline/{symbol}?period=1m&start={start}&end={end}
    """

    def __init__(self, minute_service):
        self.service = minute_service

    async def handle_get_kline(
        self,
        symbol: str,
        period: str,
        start: str,
        end: str
    ) -> Dict[str, Any]:
        """
        Handle GET /api/kline/{symbol} request for minute data.

        Args:
            symbol: Stock symbol
            period: K-line period (1m, 5m, 15m, 30m, 60m)
            start: Start time (ISO format)
            end: End time (ISO format)

        Returns:
            K-line data including current incomplete minute
        """
        try:
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))

            klines = await self.service.get_minute_klines(symbol, period, start_dt, end_dt)

            return {
                "success": True,
                "data": klines,
                "meta": {
                    "symbol": symbol,
                    "period": period,
                    "count": len(klines),
                    "includes_intraday": self._includes_today(start_dt, end_dt)
                }
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "code": "KLINE_QUERY_ERROR"
            }

    def _includes_today(self, start: datetime, end: datetime) -> bool:
        """Check if query includes today."""
        today = datetime.now().date()
        return start.date() <= today <= end.date()


# Import from unit tests
import sys
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/worktrees/worktree-market-data-service/market-data-service/tests/unit/services')
from test_minute_kline_merge import IntradayMinuteKlineService, MockDBService, MockRedisCache, MockMarketCalendar


class TestMinuteKlineAPI:
    """Test minute K-line API."""

    @pytest.fixture
    def api_handler(self):
        service = IntradayMinuteKlineService(
            MockDBService(),
            MockRedisCache(),
            MockMarketCalendar()
        )
        return MinuteKlineAPIHandler(service)

    @pytest.mark.asyncio
    async def test_get_minute_kline_historical(self, api_handler):
        """Test getting historical minute K-lines."""
        start = "2026-02-01T09:30:00"
        end = "2026-02-01T10:00:00"

        result = await api_handler.handle_get_kline("000001", "1m", start, end)

        assert result["success"] is True
        assert "data" in result
        assert result["meta"]["period"] == "1m"

    @pytest.mark.asyncio
    async def test_get_minute_kline_with_intraday(self, api_handler):
        """Test minute K-line including intraday data."""
        # Set current tick data
        now = datetime.now()
        start = (now - timedelta(hours=1)).isoformat()
        end = now.isoformat()

        # Set tick data in cache
        api_handler.service.cache.set_tick("000001", {
            "price": 12.5,
            "open": 12.0,
            "high": 13.0,
            "low": 11.5,
            "volume": 50000
        })

        result = await api_handler.handle_get_kline("000001", "1m", start, end)

        assert result["success"] is True
        assert result["meta"]["includes_intraday"] is True

    @pytest.mark.asyncio
    async def test_get_minute_kline_5m_period(self, api_handler):
        """Test 5-minute K-lines."""
        start = "2026-02-01T09:30:00"
        end = "2026-02-01T10:30:00"

        result = await api_handler.handle_get_kline("000001", "5m", start, end)

        assert result["success"] is True
        assert result["meta"]["period"] == "5m"

    @pytest.mark.asyncio
    async def test_api_response_structure(self, api_handler):
        """Test API response structure."""
        start = "2026-02-01T09:30:00"
        end = "2026-02-01T09:35:00"

        result = await api_handler.handle_get_kline("000001", "1m", start, end)

        assert "success" in result
        assert "data" in result
        assert "meta" in result
        assert "symbol" in result["meta"]
        assert "count" in result["meta"]

    @pytest.mark.asyncio
    async def test_api_error_handling(self, api_handler):
        """Test API error handling for invalid dates."""
        result = await api_handler.handle_get_kline(
            "000001", "1m", "invalid-date", "2026-02-01T10:00:00"
        )

        assert result["success"] is False
        assert "error" in result


class TestMinuteKlineAPIPerformance:
    """Test minute K-line API performance."""

    @pytest.mark.asyncio
    async def test_api_response_time(self):
        """Test API response time < 50ms."""
        import time

        service = IntradayMinuteKlineService(
            MockDBService(),
            MockRedisCache(),
            MockMarketCalendar()
        )
        handler = MinuteKlineAPIHandler(service)

        start = "2026-02-01T09:30:00"
        end = "2026-02-01T09:35:00"

        t0 = time.time()
        result = await handler.handle_get_kline("000001", "1m", start, end)
        elapsed_ms = (time.time() - t0) * 1000

        assert result["success"] is True
        assert elapsed_ms < 50, f"Response took {elapsed_ms:.2f}ms"


class TestMinuteKlineEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_empty_time_range(self):
        """Test API with empty time range."""
        service = IntradayMinuteKlineService(
            MockDBService(),
            MockRedisCache(),
            MockMarketCalendar()
        )
        handler = MinuteKlineAPIHandler(service)

        # End before start
        result = await handler.handle_get_kline(
            "000001", "1m",
            "2026-02-01T10:00:00", "2026-02-01T09:00:00"
        )

        # Should handle gracefully
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_future_date(self):
        """Test API with future date."""
        service = IntradayMinuteKlineService(
            MockDBService(),
            MockRedisCache(),
            MockMarketCalendar()
        )
        handler = MinuteKlineAPIHandler(service)

        future = (datetime.now() + timedelta(days=30)).isoformat()
        result = await handler.handle_get_kline(
            "000001", "1m",
            future, future
        )

        assert result["success"] is True
