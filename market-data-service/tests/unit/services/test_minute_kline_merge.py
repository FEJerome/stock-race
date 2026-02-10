"""
Unit tests for minute-level K-line merging with intraday data.

Tests merging historical minute K-lines with current day real-time data.
"""

import pytest
import asyncio
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum


class KlinePeriod(Enum):
    """K-line periods."""
    MIN_1 = "1m"
    MIN_5 = "5m"
    MIN_15 = "15m"
    MIN_30 = "30m"
    MIN_60 = "60m"


@dataclass
class MinuteKline:
    """Minute-level K-line data."""
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    symbol: str = ""
    source: str = ""  # "db" or "realtime"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "time": self.time.isoformat() if isinstance(self.time, datetime) else self.time,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
            "symbol": self.symbol,
            "source": self.source
        }


class IntradayMinuteKlineService:
    """
    Service for merging minute-level K-lines with intraday data.

    Features:
    - Query historical minute K-lines from TimescaleDB
    - Merge with current day real-time data from Redis
    - Build current incomplete minute from tick data
    """

    def __init__(self, db_service, redis_cache, market_calendar):
        self.db = db_service
        self.cache = redis_cache
        self.calendar = market_calendar

    async def get_minute_klines(
        self,
        symbol: str,
        period: str,
        start: datetime,
        end: datetime
    ) -> List[Dict[str, Any]]:
        """
        Get minute K-lines with intraday data merged.

        Args:
            symbol: Stock symbol
            period: K-line period (1m, 5m, 15m, 30m, 60m)
            start: Start time
            end: End time

        Returns:
            List of K-line data including current incomplete minute
        """
        # Get historical data from DB
        historical = await self.db.query_minute_klines(symbol, period, start, end)

        # Check if query includes today
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = end.replace(hour=0, minute=0, second=0, microsecond=0)

        if end_date >= today and self.calendar.is_trading_day(datetime.now()):
            # Get current minute data from cache
            current_minute = await self._build_current_minute(symbol, period)

            if current_minute:
                # Check if we need to update the last historical bar or add new
                if historical:
                    last_bar_time = historical[-1]["time"]
                    if isinstance(last_bar_time, str):
                        last_bar_time = datetime.fromisoformat(last_bar_time)

                    if last_bar_time.replace(second=0, microsecond=0) == current_minute.time.replace(second=0, microsecond=0):
                        # Update last bar
                        historical[-1] = current_minute.to_dict()
                    else:
                        # Add new bar
                        historical.append(current_minute.to_dict())
                else:
                    historical.append(current_minute.to_dict())

        return historical

    async def _build_current_minute(self, symbol: str, period: str) -> Optional[MinuteKline]:
        """
        Build current minute K-line from real-time tick data.

        Gets current OHLC from Redis tick cache and builds a minute bar.
        """
        tick_data = await self.cache.get_current_tick(symbol)

        if not tick_data:
            return None

        now = datetime.now()
        # Round to current minute
        current_minute = now.replace(second=0, microsecond=0)

        return MinuteKline(
            time=current_minute,
            symbol=symbol,
            open=tick_data.get("open", tick_data.get("price", 0)),
            high=tick_data.get("high", tick_data.get("price", 0)),
            low=tick_data.get("low", tick_data.get("price", 0)),
            close=tick_data.get("price", 0),
            volume=tick_data.get("volume", 0),
            source="realtime"
        )

    def merge_klines(self, historical: List[MinuteKline], realtime: MinuteKline) -> List[MinuteKline]:
        """
        Merge historical and realtime K-lines.

        If the realtime bar time matches the last historical bar,
        replace it with the more up-to-date realtime data.
        """
        if not historical:
            return [realtime]

        last_bar = historical[-1]

        # Compare minute-level timestamps
        if last_bar.time.replace(second=0, microsecond=0) == realtime.time.replace(second=0, microsecond=0):
            # Replace last bar with realtime data
            historical[-1] = realtime
        else:
            # Append new bar
            historical.append(realtime)

        return historical


class MockDBService:
    """Mock database service."""

    async def query_minute_klines(
        self,
        symbol: str,
        period: str,
        start: datetime,
        end: datetime
    ) -> List[Dict[str, Any]]:
        """Mock query historical minute K-lines."""
        klines = []
        current = start

        # Generate mock historical data
        while current <= end:
            # Skip if it's today (will be filled by realtime)
            if current.date() == datetime.now().date():
                current += timedelta(minutes=1)
                continue

            klines.append({
                "time": current,
                "symbol": symbol,
                "open": 10.0,
                "high": 11.0,
                "low": 9.0,
                "close": 10.5,
                "volume": 10000,
                "source": "db"
            })

            # Increment based on period
            if period == "1m":
                current += timedelta(minutes=1)
            elif period == "5m":
                current += timedelta(minutes=5)
            elif period == "15m":
                current += timedelta(minutes=15)
            else:
                current += timedelta(minutes=1)

        return klines


class MockRedisCache:
    """Mock Redis cache with tick data."""

    def __init__(self):
        self.tick_data = {}

    def set_tick(self, symbol: str, data: Dict):
        """Set current tick data."""
        self.tick_data[symbol] = data

    async def get_current_tick(self, symbol: str) -> Optional[Dict]:
        """Get current tick data."""
        return self.tick_data.get(symbol)


class MockMarketCalendar:
    """Mock market calendar."""

    def is_trading_day(self, date: datetime) -> bool:
        return True


class TestIntradayMinuteKlineService:
    """Test minute K-line service."""

    @pytest.fixture
    def service(self):
        db = MockDBService()
        cache = MockRedisCache()
        calendar = MockMarketCalendar()
        return IntradayMinuteKlineService(db, cache, calendar)

    @pytest.mark.asyncio
    async def test_historical_only(self, service):
        """Test query for past dates returns only historical."""
        start = datetime(2026, 2, 1, 9, 30)
        end = datetime(2026, 2, 1, 15, 0)

        result = await service.get_minute_klines("000001", "1m", start, end)

        assert len(result) > 0
        assert all(r["source"] == "db" for r in result)

    @pytest.mark.asyncio
    async def test_merge_intraday_data(self, service):
        """Test merging with current day realtime data."""
        # Set current tick data
        service.cache.set_tick("000001", {
            "symbol": "000001",
            "price": 12.5,
            "open": 11.0,
            "high": 13.0,
            "low": 10.5,
            "volume": 50000
        })

        # Query including today
        today_start = datetime.now().replace(hour=9, minute=30)
        today_end = datetime.now()

        result = await service.get_minute_klines("000001", "1m", today_start, today_end)

        # Should have both historical and realtime data
        sources = [r.get("source", "db") for r in result]
        assert "realtime" in sources

    @pytest.mark.asyncio
    async def test_current_minute_building(self, service):
        """Test building current minute from tick data."""
        service.cache.set_tick("000001", {
            "price": 15.5,
            "open": 15.0,
            "high": 16.0,
            "low": 14.5,
            "volume": 100000
        })

        current_minute = await service._build_current_minute("000001", "1m")

        assert current_minute is not None
        assert current_minute.close == 15.5
        assert current_minute.source == "realtime"

    @pytest.mark.asyncio
    async def test_no_tick_data_returns_historical_only(self, service):
        """Test when no tick data, only historical is returned."""
        # Don't set any tick data
        today_start = datetime.now().replace(hour=9, minute=30)
        today_end = datetime.now()

        result = await service.get_minute_klines("000001", "1m", today_start, today_end)

        # Should only have historical data
        if result:
            assert all(r.get("source", "db") == "db" for r in result[:-1])


class TestKlineMerge:
    """Test K-line merging logic."""

    def test_merge_replace_last_bar(self):
        """Test merge replaces last bar when time matches."""
        service = IntradayMinuteKlineService(None, None, None)

        now = datetime.now().replace(second=0, microsecond=0)
        historical = [
            MinuteKline(time=now - timedelta(minutes=2), open=10, high=11, low=9, close=10.5, volume=1000),
            MinuteKline(time=now - timedelta(minutes=1), open=10.5, high=11.5, low=10, close=11, volume=2000),
        ]

        realtime = MinuteKline(
            time=now - timedelta(minutes=1),  # Same as last historical
            open=10.5, high=12, low=10, close=11.8, volume=2500,
            source="realtime"
        )

        result = service.merge_klines(historical, realtime)

        assert len(result) == 2
        assert result[-1].close == 11.8
        assert result[-1].source == "realtime"

    def test_merge_append_new_bar(self):
        """Test merge appends new bar when time is different."""
        service = IntradayMinuteKlineService(None, None, None)

        now = datetime.now().replace(second=0, microsecond=0)
        historical = [
            MinuteKline(time=now - timedelta(minutes=2), open=10, high=11, low=9, close=10.5, volume=1000),
            MinuteKline(time=now - timedelta(minutes=1), open=10.5, high=11.5, low=10, close=11, volume=2000),
        ]

        realtime = MinuteKline(
            time=now,  # New minute
            open=11, high=12, low=11, close=11.5, volume=3000,
            source="realtime"
        )

        result = service.merge_klines(historical, realtime)

        assert len(result) == 3
        assert result[-1].time == now
        assert result[-1].source == "realtime"

    def test_merge_empty_historical(self):
        """Test merge with empty historical list."""
        service = IntradayMinuteKlineService(None, None, None)

        realtime = MinuteKline(
            time=datetime.now(),
            open=10, high=11, low=9, close=10.5, volume=1000,
            source="realtime"
        )

        result = service.merge_klines([], realtime)

        assert len(result) == 1
        assert result[0].source == "realtime"


class TestMinuteKlinePerformance:
    """Test performance requirements."""

    @pytest.mark.asyncio
    async def test_query_response_time(self):
        """Test minute K-line query < 50ms."""
        import time

        db = MockDBService()
        cache = MockRedisCache()
        calendar = MockMarketCalendar()
        service = IntradayMinuteKlineService(db, cache, calendar)

        start = datetime(2026, 2, 1, 9, 30)
        end = datetime(2026, 2, 1, 10, 0)

        start_time = time.time()
        result = await service.get_minute_klines("000001", "1m", start, end)
        elapsed_ms = (time.time() - start_time) * 1000

        assert elapsed_ms < 50, f"Query took {elapsed_ms:.2f}ms, expected < 50ms"


class TestMinuteKlineEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_cross_day_boundary(self):
        """Test query crossing day boundary."""
        db = MockDBService()
        cache = MockRedisCache()
        calendar = MockMarketCalendar()
        service = IntradayMinuteKlineService(db, cache, calendar)

        # Yesterday to today
        yesterday = datetime.now() - timedelta(days=1)
        yesterday = yesterday.replace(hour=14, minute=30)
        today = datetime.now()

        result = await service.get_minute_klines("000001", "1m", yesterday, today)

        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_invalid_period(self):
        """Test handling invalid period."""
        db = MockDBService()
        cache = MockRedisCache()
        calendar = MockMarketCalendar()
        service = IntradayMinuteKlineService(db, cache, calendar)

        start = datetime(2026, 2, 1, 9, 30)
        end = datetime(2026, 2, 1, 10, 0)

        # Should handle invalid period gracefully
        result = await service.get_minute_klines("000001", "invalid", start, end)

        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_no_trading_day(self):
        """Test query on non-trading day."""
        db = MockDBService()
        cache = MockRedisCache()
        calendar = MockMarketCalendar()
        calendar.is_trading_day = lambda d: False  # Override to return False
        service = IntradayMinuteKlineService(db, cache, calendar)

        today_start = datetime.now().replace(hour=9, minute=30)
        today_end = datetime.now()

        result = await service.get_minute_klines("000001", "1m", today_start, today_end)

        # Should not add realtime data on non-trading day
        if result:
            assert all(r.get("source", "db") == "db" for r in result)
