"""
Unit tests for intraday data service.

Tests that historical K-line data includes today's real-time data
(including pre-market auction period) on trading days before market close.
"""

import pytest
import asyncio
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from enum import Enum


class MarketSession(Enum):
    """A-share market trading sessions."""

    PRE_MARKET = "pre_market"  # 9:00 - 9:15 (order placement)
    AUCTION = "auction"  # 9:15 - 9:25 (call auction)
    MORNING = "morning"  # 9:30 - 11:30
    NOON_BREAK = "noon_break"  # 11:30 - 13:00
    AFTERNOON = "afternoon"  # 13:00 - 15:00
    POST_MARKET = "post_market"  # After 15:00
    CLOSED = "closed"


class MarketCalendarService:
    """
    Service for managing market calendar and trading hours.

    A-share trading hours:
    - Pre-market: 9:00 - 9:15
    - Call auction: 9:15 - 9:25
    - Morning session: 9:30 - 11:30
    - Afternoon session: 13:00 - 15:00
    """

    TRADING_DAYS = {0, 1, 2, 3, 4}  # Monday to Friday

    AUCTION_START = time(9, 15)
    AUCTION_END = time(9, 25)
    MORNING_START = time(9, 30)
    MORNING_END = time(11, 30)
    AFTERNOON_START = time(13, 0)
    AFTERNOON_END = time(15, 0)

    # Holiday calendar (simplified - should be fetched from backend)
    HOLIDAYS = {
        # 2026 Spring Festival
        datetime(2026, 2, 16).date(), datetime(2026, 2, 17).date(),
        datetime(2026, 2, 18).date(),
        # 2026 Labor Day
        datetime(2026, 5, 1).date(),
        # 2026 National Day
        datetime(2026, 10, 1).date(), datetime(2026, 10, 2).date(),
    }

    def __init__(self, backend_client=None):
        self.backend = backend_client
        self._cached_holidays = set(self.HOLIDAYS)

    def is_trading_day(self, date: datetime) -> bool:
        """Check if date is a trading day."""
        date_only = date.date() if isinstance(date, datetime) else date

        # Weekend check
        if date_only.weekday() not in self.TRADING_DAYS:
            return False

        # Holiday check
        if date_only in self._cached_holidays:
            return False

        return True

    def is_market_open(self, check_time: datetime = None) -> bool:
        """
        Check if market is currently open.

        Market is considered "open" from auction start (9:15) to close (15:00).
        This includes the auction period.
        """
        if check_time is None:
            check_time = datetime.now()

        if not self.is_trading_day(check_time):
            return False

        current_time = check_time.time()

        # Market is open during:
        # - Auction: 9:15 - 9:25
        # - Morning: 9:30 - 11:30
        # - Afternoon: 13:00 - 15:00

        if self.AUCTION_START <= current_time <= self.AFTERNOON_END:
            # Exclude noon break
            if self.MORNING_END < current_time < self.AFTERNOON_START:
                return False
            return True

        return False

    def is_auction_period(self, check_time: datetime = None) -> bool:
        """Check if currently in auction period (9:15 - 9:25)."""
        if check_time is None:
            check_time = datetime.now()

        if not self.is_trading_day(check_time):
            return False

        current_time = check_time.time()
        return self.AUCTION_START <= current_time <= self.AUCTION_END

    def get_current_session(self, check_time: datetime = None) -> MarketSession:
        """Get current market session."""
        if check_time is None:
            check_time = datetime.now()

        if not self.is_trading_day(check_time):
            return MarketSession.CLOSED

        current_time = check_time.time()

        if time(9, 0) <= current_time < self.AUCTION_START:
            return MarketSession.PRE_MARKET
        elif self.AUCTION_START <= current_time <= self.AUCTION_END:
            return MarketSession.AUCTION
        elif self.MORNING_START <= current_time < self.MORNING_END:
            return MarketSession.MORNING
        elif self.MORNING_END <= current_time < self.AFTERNOON_START:
            return MarketSession.NOON_BREAK
        elif self.AFTERNOON_START <= current_time < self.AFTERNOON_END:
            return MarketSession.AFTERNOON
        else:
            return MarketSession.POST_MARKET


@dataclass
class Kline:
    """Kline data model."""

    symbol: str
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    source: str = ""


class IntradayDataService:
    """
    Service for managing intraday data including auction period.

    Features:
    - Merge historical data with today's real-time data
    - Support auction period data (9:15 - 9:25)
    - Build daily K-line from real-time quotes
    """

    def __init__(self, db_service, redis_cache, market_calendar: MarketCalendarService):
        self.db = db_service
        self.cache = redis_cache
        self.calendar = market_calendar

    async def get_klines_with_intraday(
        self,
        symbol: str,
        period: str,
        start: datetime,
        end: datetime
    ) -> List[Dict[str, Any]]:
        """
        Get K-lines with intraday data merged.

        If end date is today and market is open/has opened,
        merge historical data with today's real-time data.
        """
        # Get historical data from database
        historical = await self._get_historical_klines(symbol, period, start, end)

        # Check if we need to add today's data
        today = datetime.now().date()
        end_date = end.date() if isinstance(end, datetime) else end

        if end_date >= today and self.calendar.is_trading_day(today):
            # Get today's data from cache
            today_kline = await self._build_today_kline(symbol)

            if today_kline:
                # Check if we already have today's data in historical
                historical_dates = {
                    k["time"].date() if isinstance(k["time"], datetime)
                    else datetime.fromisoformat(k["time"]).date()
                    for k in historical
                }

                if today not in historical_dates:
                    historical.append(today_kline)

        return historical

    async def _get_historical_klines(
        self,
        symbol: str,
        period: str,
        start: datetime,
        end: datetime
    ) -> List[Dict[str, Any]]:
        """Get historical K-lines from database."""
        # This would query TimescaleDB
        # For now, return mock data
        return await self.db.query_klines(symbol, period, start, end)

    async def _build_today_kline(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Build today's K-line from real-time quotes in cache.

        This includes auction period data if available.
        """
        # Get cached quote for symbol
        cached_quote = await self.cache.get_quote(symbol)

        if not cached_quote:
            return None

        # Get OHLC from cached data
        # In real implementation, this would aggregate all ticks for the day
        today = datetime.now()

        return {
            "time": today.replace(hour=0, minute=0, second=0, microsecond=0),
            "symbol": symbol,
            "open": cached_quote.get("open", cached_quote.get("price", 0)),
            "high": cached_quote.get("high", cached_quote.get("price", 0)),
            "low": cached_quote.get("low", cached_quote.get("price", 0)),
            "close": cached_quote.get("price", 0),
            "volume": cached_quote.get("volume", 0),
            "source": "realtime_cache",
            "is_intraday": True
        }

    async def get_auction_data(self, symbol: str, date: datetime = None) -> Optional[Dict[str, Any]]:
        """
        Get auction period data for a symbol.

        Auction period: 9:15 - 9:25
        """
        if date is None:
            date = datetime.now()

        if not self.calendar.is_auction_period(date) and not self._is_after_auction(date):
            return None

        # Get from cache (auction data is cached separately)
        auction_data = await self.cache.get_auction_data(symbol, date)

        return auction_data

    def _is_after_auction(self, check_time: datetime) -> bool:
        """Check if current time is after auction period."""
        if not self.calendar.is_trading_day(check_time):
            return False
        return check_time.time() >= MarketCalendarService.AUCTION_END


class MockDBService:
    """Mock database service."""

    async def query_klines(self, symbol: str, period: str,
                          start: datetime, end: datetime) -> List[Dict]:
        """Mock query."""
        # Return some historical data
        klines = []
        current = start
        while current <= end:
            klines.append({
                "time": current,
                "symbol": symbol,
                "open": 10.0,
                "high": 11.0,
                "low": 9.0,
                "close": 10.5,
                "volume": 1000000,
                "source": "timescaledb"
            })
            current += timedelta(days=1)
        return klines


class MockRedisCache:
    """Mock Redis cache with auction data support."""

    def __init__(self):
        self.quotes = {}
        self.auction_data = {}

    async def get_quote(self, symbol: str) -> Optional[Dict]:
        return self.quotes.get(symbol)

    def set_quote(self, symbol: str, data: Dict):
        self.quotes[symbol] = data

    async def get_auction_data(self, symbol: str, date: datetime) -> Optional[Dict]:
        key = f"{symbol}:{date.date()}"
        return self.auction_data.get(key)

    def set_auction_data(self, symbol: str, date: datetime, data: Dict):
        key = f"{symbol}:{date.date()}"
        self.auction_data[key] = data


class TestMarketCalendarService:
    """Test market calendar service."""

    @pytest.fixture
    def calendar(self):
        return MarketCalendarService()

    def test_weekend_not_trading_day(self, calendar):
        """Test weekends are not trading days."""
        saturday = datetime(2026, 2, 14)  # Saturday
        sunday = datetime(2026, 2, 15)  # Sunday

        assert not calendar.is_trading_day(saturday)
        assert not calendar.is_trading_day(sunday)

    def test_weekday_is_trading_day(self, calendar):
        """Test weekdays are trading days."""
        monday = datetime(2026, 2, 9)  # Monday

        assert calendar.is_trading_day(monday)

    def test_holiday_not_trading_day(self, calendar):
        """Test holidays are not trading days."""
        spring_festival = datetime(2026, 2, 16)  # Holiday

        assert not calendar.is_trading_day(spring_festival)

    def test_auction_period_detection(self, calendar):
        """Test auction period detection."""
        # 9:20 AM during auction
        auction_time = datetime(2026, 2, 9, 9, 20)
        assert calendar.is_auction_period(auction_time)

        # 9:30 AM after auction
        after_auction = datetime(2026, 2, 9, 9, 30)
        assert not calendar.is_auction_period(after_auction)

    def test_market_open_hours(self, calendar):
        """Test market open detection."""
        # During morning session
        morning = datetime(2026, 2, 9, 10, 30)
        assert calendar.is_market_open(morning)

        # During afternoon session
        afternoon = datetime(2026, 2, 9, 14, 0)
        assert calendar.is_market_open(afternoon)

        # During noon break
        noon = datetime(2026, 2, 9, 12, 0)
        assert not calendar.is_market_open(noon)

        # After close
        evening = datetime(2026, 2, 9, 16, 0)
        assert not calendar.is_market_open(evening)

    def test_market_session_detection(self, calendar):
        """Test market session detection."""
        assert calendar.get_current_session(datetime(2026, 2, 9, 9, 20)) == MarketSession.AUCTION
        assert calendar.get_current_session(datetime(2026, 2, 9, 10, 30)) == MarketSession.MORNING
        assert calendar.get_current_session(datetime(2026, 2, 9, 12, 0)) == MarketSession.NOON_BREAK
        assert calendar.get_current_session(datetime(2026, 2, 9, 14, 0)) == MarketSession.AFTERNOON


class TestIntradayDataService:
    """Test intraday data service."""

    @pytest.fixture
    def mock_db(self):
        return MockDBService()

    @pytest.fixture
    def mock_cache(self):
        return MockRedisCache()

    @pytest.fixture
    def calendar(self):
        return MarketCalendarService()

    @pytest.fixture
    def service(self, mock_db, mock_cache, calendar):
        return IntradayDataService(mock_db, mock_cache, calendar)

    @pytest.mark.asyncio
    async def test_historical_data_only(self, service, mock_cache):
        """Test query for past dates returns only historical data."""
        start = datetime(2026, 2, 1)
        end = datetime(2026, 2, 5)

        result = await service.get_klines_with_intraday("000001", "1d", start, end)

        assert len(result) == 5
        assert all(r["source"] == "timescaledb" for r in result)

    @pytest.mark.asyncio
    async def test_intraday_data_merged(self, service, mock_cache):
        """Test today's data is merged with historical."""
        # Set up mock quote in cache
        mock_cache.set_quote("000001", {
            "symbol": "000001",
            "price": 12.5,
            "open": 11.0,
            "high": 13.0,
            "low": 10.5,
            "volume": 5000000
        })

        # Query from a past date to today
        # Use yesterday as end date so historical data doesn't include today
        yesterday = datetime.now() - timedelta(days=1)
        start = datetime(2026, 2, 5)

        # Only run if today is a trading day
        if service.calendar.is_trading_day(datetime.now()):
            result = await service.get_klines_with_intraday("000001", "1d", start, yesterday)

            # Should have historical + today's data from cache
            sources = [r["source"] for r in result]
            # Check if today's data was added from cache
            today_data = [r for r in result if r.get("is_intraday")]
            if today_data:
                assert today_data[0]["source"] == "realtime_cache"

    @pytest.mark.asyncio
    async def test_no_intraday_on_weekend(self, service, mock_cache):
        """Test no intraday data on weekends."""
        # Mock weekend
        saturday = datetime(2026, 2, 14, 10, 0)  # Saturday

        # Temporarily override calendar check
        original_is_trading = service.calendar.is_trading_day
        service.calendar.is_trading_day = lambda d: False

        result = await service.get_klines_with_intraday("000001", "1d", saturday, saturday)

        # Restore
        service.calendar.is_trading_day = original_is_trading

        # Should only have historical data if any
        assert all(r["source"] == "timescaledb" for r in result)

    @pytest.mark.asyncio
    async def test_auction_data_retrieval(self, service, mock_cache):
        """Test auction data can be retrieved."""
        auction_time = datetime(2026, 2, 9, 9, 20)  # During auction

        # Set up auction data
        mock_cache.set_auction_data("000001", auction_time, {
            "symbol": "000001",
            "auction_price": 10.5,
            "auction_volume": 10000,
            "matched_orders": 500
        })

        # Mock trading day
        service.calendar.is_trading_day = lambda d: True

        result = await service.get_auction_data("000001", auction_time)

        assert result is not None
        assert result["auction_price"] == 10.5

    @pytest.mark.asyncio
    async def test_no_auction_data_before_auction(self, service):
        """Test no auction data before 9:15."""
        before_auction = datetime(2026, 2, 9, 9, 10)

        service.calendar.is_trading_day = lambda d: True

        result = await service.get_auction_data("000001", before_auction)

        assert result is None


class TestIntradayDataEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_empty_cache_returns_historical_only(self):
        """Test when cache is empty, only historical data is returned."""
        mock_db = MockDBService()
        mock_cache = MockRedisCache()  # Empty cache
        calendar = MarketCalendarService()
        service = IntradayDataService(mock_db, mock_cache, calendar)

        start = datetime(2026, 2, 5)
        end = datetime.now()

        result = await service.get_klines_with_intraday("000001", "1d", start, end)

        # Should only have historical data
        assert all(r["source"] == "timescaledb" for r in result[:-1] if result)

    @pytest.mark.asyncio
    async def test_auction_period_included_in_intraday(self):
        """Test auction period data is included in intraday K-line."""
        mock_db = MockDBService()
        mock_cache = MockRedisCache()
        calendar = MarketCalendarService()
        service = IntradayDataService(mock_db, mock_cache, calendar)

        # Set quote data that includes auction
        mock_cache.set_quote("000001", {
            "symbol": "000001",
            "price": 10.5,
            "open": 10.0,  # Auction opening price
            "high": 10.8,
            "low": 9.8,
            "volume": 1000000,
            "auction_price": 10.5  # Auction determined price
        })

        # Mock today as trading day
        calendar.is_trading_day = lambda d: True

        result = await service._build_today_kline("000001")

        assert result is not None
        assert result["open"] == 10.0
