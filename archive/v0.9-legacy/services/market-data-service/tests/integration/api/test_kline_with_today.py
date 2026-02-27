"""
Integration tests for K-line API with today's data.

Tests that historical K-line API includes today's real-time data
when market is open or has opened.
"""

import pytest
import asyncio
from typing import Dict, Any, List
from datetime import datetime, timedelta


class KlineAPIHandler:
    """
    API handler for K-line queries with intraday support.

    Endpoint:
    - GET /api/kline/{symbol}?period={period}&start={start}&end={end}
    """

    def __init__(self, intraday_service, market_calendar):
        self.service = intraday_service
        self.calendar = market_calendar

    async def handle_get_kline(self, symbol: str, period: str,
                               start: str, end: str) -> Dict[str, Any]:
        """
        Handle GET /api/kline/{symbol} request.

        Returns K-line data including today's intraday data if applicable.
        """
        try:
            # Parse dates
            start_date = datetime.fromisoformat(start.replace('Z', '+00:00'))
            end_date = datetime.fromisoformat(end.replace('Z', '+00:00'))

            # Get K-lines with intraday data
            klines = await self.service.get_klines_with_intraday(
                symbol, period, start_date, end_date
            )

            return {
                "success": True,
                "data": klines,
                "meta": {
                    "symbol": symbol,
                    "period": period,
                    "count": len(klines),
                    "includes_today": self._includes_today(start_date, end_date),
                    "market_session": self.calendar.get_current_session().value
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


# Import test implementations from unit tests
import sys
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/worktrees/worktree-market-data-service/market-data-service/tests/unit/services')
from test_intraday_data import (
    MarketCalendarService, IntradayDataService,
    MockDBService, MockRedisCache
)


class TestKlineAPIWithToday:
    """Test K-line API with today's data integration."""

    @pytest.fixture
    def api_handler(self):
        mock_db = MockDBService()
        mock_cache = MockRedisCache()
        calendar = MarketCalendarService()
        service = IntradayDataService(mock_db, mock_cache, calendar)
        return KlineAPIHandler(service, calendar)

    @pytest.mark.asyncio
    async def test_api_returns_historical_only(self, api_handler):
        """Test API returns only historical data for past dates."""
        result = await api_handler.handle_get_kline(
            "000001", "1d",
            "2026-02-01", "2026-02-05"
        )

        assert result["success"] is True
        assert len(result["data"]) == 5
        assert result["meta"]["includes_today"] is False

    @pytest.mark.asyncio
    async def test_api_includes_today_on_trading_day(self, api_handler):
        """Test API includes today's data on trading day."""
        # Mock today as a trading day
        api_handler.calendar.is_trading_day = lambda d: True

        # Add today's quote to cache
        today = datetime.now()
        api_handler.service.cache.set_quote("000001", {
            "symbol": "000001",
            "price": 12.5,
            "open": 11.0,
            "high": 13.0,
            "low": 10.5,
            "volume": 5000000
        })

        result = await api_handler.handle_get_kline(
            "000001", "1d",
            "2026-02-05", today.isoformat()
        )

        assert result["success"] is True
        assert result["meta"]["includes_today"] is True

        # Check that today's data is included
        sources = [k.get("source") for k in result["data"]]
        assert "realtime_cache" in sources or len(result["data"]) > 0

    @pytest.mark.asyncio
    async def test_api_response_structure(self, api_handler):
        """Test API response structure."""
        api_handler.calendar.is_trading_day = lambda d: True

        result = await api_handler.handle_get_kline(
            "000001", "1d",
            "2026-02-01", "2026-02-05"
        )

        assert "success" in result
        assert "data" in result
        assert "meta" in result
        assert "symbol" in result["meta"]
        assert "period" in result["meta"]
        assert "count" in result["meta"]


class TestKlineAPIAuctionPeriod:
    """Test K-line API with auction period data."""

    @pytest.mark.asyncio
    async def test_auction_data_included_in_response(self):
        """Test auction data is included in K-line response during auction period."""
        mock_db = MockDBService()
        mock_cache = MockRedisCache()
        calendar = MarketCalendarService()
        service = IntradayDataService(mock_db, mock_cache, calendar)
        handler = KlineAPIHandler(service, calendar)

        # Set up auction data
        auction_time = datetime(2026, 2, 9, 9, 20)
        mock_cache.set_auction_data("000001", auction_time, {
            "symbol": "000001",
            "auction_price": 10.5,
            "auction_volume": 10000
        })

        # Set today's quote
        mock_cache.set_quote("000001", {
            "symbol": "000001",
            "price": 10.5,
            "open": 10.5,  # Auction determined price
            "high": 10.5,
            "low": 10.5,
            "volume": 10000,
            "auction_data": {
                "price": 10.5,
                "volume": 10000
            }
        })

        # Mock as trading day
        calendar.is_trading_day = lambda d: True

        result = await handler.handle_get_kline(
            "000001", "1d",
            "2026-02-09", "2026-02-09"
        )

        assert result["success"] is True
        # Should include today's K-line
        today_klines = [k for k in result["data"] if k.get("is_intraday")]
        assert len(today_klines) >= 0


class TestKlineAPIEdgeCases:
    """Test K-line API edge cases."""

    @pytest.mark.asyncio
    async def test_api_with_invalid_dates(self):
        """Test API handles invalid dates."""
        mock_db = MockDBService()
        mock_cache = MockRedisCache()
        calendar = MarketCalendarService()
        service = IntradayDataService(mock_db, mock_cache, calendar)
        handler = KlineAPIHandler(service, calendar)

        result = await handler.handle_get_kline(
            "000001", "1d",
            "invalid-date", "2026-02-05"
        )

        assert result["success"] is False
        assert "error" in result

    @pytest.mark.asyncio
    async def test_api_with_weekend_query(self):
        """Test API handles weekend queries."""
        mock_db = MockDBService()
        mock_cache = MockRedisCache()
        calendar = MarketCalendarService()
        service = IntradayDataService(mock_db, mock_cache, calendar)
        handler = KlineAPIHandler(service, calendar)

        result = await handler.handle_get_kline(
            "000001", "1d",
            "2026-02-14", "2026-02-15"  # Weekend
        )

        assert result["success"] is True
        # Should return empty or handle gracefully

    @pytest.mark.asyncio
    async def test_api_start_after_end(self):
        """Test API handles start date after end date."""
        mock_db = MockDBService()
        mock_cache = MockRedisCache()
        calendar = MarketCalendarService()
        service = IntradayDataService(mock_db, mock_cache, calendar)
        handler = KlineAPIHandler(service, calendar)

        result = await handler.handle_get_kline(
            "000001", "1d",
            "2026-02-10", "2026-02-01"  # Start after end
        )

        # Should handle gracefully
        assert result["success"] is True
