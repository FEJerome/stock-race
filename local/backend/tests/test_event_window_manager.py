"""
Tests for EventWindowManager

Phase 1.4 事件舆情数据层 - 包4核心测试
覆盖：
- 添加事件
- 查询窗口事件
- 30天过期淘汰
- FIFO容量控制（100事件限制）
"""
import pytest
import pytest_asyncio
import asyncio
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.event import Event, EventWindow, EventSentiment, EventType
from services.event_window_manager import EventWindowManager, WindowConfig


@pytest.mark.asyncio
class TestEventWindowManager:
    """Tests for EventWindowManager"""

    def create_test_event(
        self,
        stock_code: str = "000001.SZ",
        days_ago: int = 0,
        intensity: float = 0.5,
        sentiment: str = EventSentiment.POSITIVE,
        event_type: str = EventType.BUSINESS
    ) -> Event:
        """Helper to create test events."""
        return Event(
            id=str(uuid4()),
            news_id=str(uuid4()),
            stock_code=stock_code,
            trigger="测试",
            subject="公司",
            object="事件",
            event_type=event_type,
            intensity=intensity,
            sentiment=sentiment,
            timestamp=datetime.utcnow() - timedelta(days=days_ago)
        )


@pytest.mark.asyncio
class TestAddEvent(TestEventWindowManager):
    """Tests for add_event method"""

    async def test_add_single_event(self, event_window_manager: EventWindowManager):
        """Test adding a single event"""
        event = self.create_test_event(stock_code="000001.SZ", days_ago=1)

        result = await event_window_manager.add_event(event)
        assert result is True

        # Verify event was added
        events = await event_window_manager.get_window_events("000001.SZ")
        assert len(events) == 1
        assert events[0].id == event.id

    async def test_add_multiple_events(self, event_window_manager: EventWindowManager):
        """Test adding multiple events"""
        stock_code = "000001.SZ"

        # Add 5 events
        for i in range(5):
            event = self.create_test_event(
                stock_code=stock_code,
                days_ago=i,
                intensity=0.5 + i * 0.1
            )
            result = await event_window_manager.add_event(event)
            assert result is True

        # Verify all events were added
        events = await event_window_manager.get_window_events(stock_code)
        assert len(events) == 5

    async def test_add_event_different_stocks(self, event_window_manager: EventWindowManager):
        """Test adding events for different stocks"""
        stocks = ["000001.SZ", "000002.SZ", "600000.SH"]

        for stock in stocks:
            event = self.create_test_event(stock_code=stock, days_ago=1)
            result = await event_window_manager.add_event(event)
            assert result is True

        # Verify each stock has its own window
        for stock in stocks:
            events = await event_window_manager.get_window_events(stock)
            assert len(events) == 1


@pytest.mark.asyncio
class TestGetWindowEvents(TestEventWindowManager):
    """Tests for get_window_events method"""

    async def test_get_events_within_window(self, event_window_manager: EventWindowManager):
        """Test retrieving events within 30-day window"""
        stock_code = "000001.SZ"

        # Add events at different times (all within 30 days)
        for i in range(10):
            event = self.create_test_event(
                stock_code=stock_code,
                days_ago=i * 2  # Spread over 18 days
            )
            await event_window_manager.add_event(event)

        events = await event_window_manager.get_window_events(stock_code)
        assert len(events) == 10

    async def test_get_events_returns_sorted(self, event_window_manager: EventWindowManager):
        """Test that events are returned in descending time order"""
        stock_code = "000001.SZ"

        # Add events in random order
        for i in [5, 1, 10, 3, 7]:
            event = self.create_test_event(
                stock_code=stock_code,
                days_ago=i
            )
            await event_window_manager.add_event(event)

        events = await event_window_manager.get_window_events(stock_code)

        # Verify descending order
        for i in range(len(events) - 1):
            assert events[i].timestamp >= events[i + 1].timestamp

    async def test_get_events_as_of_date(self, event_window_manager: EventWindowManager):
        """Test retrieving events as of specific date"""
        stock_code = "000001.SZ"
        now = datetime.utcnow()

        # Add events at different dates
        for i in range(20):
            event = Event(
                id=str(uuid4()),
                news_id=str(uuid4()),
                stock_code=stock_code,
                trigger="测试",
                subject="公司",
                object="事件",
                event_type=EventType.BUSINESS,
                intensity=0.5,
                sentiment=EventSentiment.POSITIVE,
                timestamp=now - timedelta(days=i * 2)
            )
            await event_window_manager.add_event(event)

        # Query as of 10 days ago
        as_of = now - timedelta(days=10)
        events = await event_window_manager.get_window_events(stock_code, as_of_date=as_of)

        # Should only include events up to 10 days ago
        for event in events:
            assert event.timestamp <= as_of

    async def test_get_events_no_stock(self, event_window_manager: EventWindowManager):
        """Test retrieving events for stock with no events"""
        events = await event_window_manager.get_window_events("999999.SZ")
        assert len(events) == 0


@pytest.mark.asyncio
class TestEvictExpired(TestEventWindowManager):
    """Tests for 30-day expiration eviction"""

    async def test_evict_events_older_than_30_days(
        self,
        event_window_manager: EventWindowManager,
        db_session: AsyncSession
    ):
        """Test that events older than 30 days are evicted"""
        stock_code = "000001.SZ"

        # Add events within window (10-29 days ago)
        for i in range(5):
            event = self.create_test_event(
                stock_code=stock_code,
                days_ago=10 + i  # 10-14 days ago
            )
            await event_window_manager.add_event(event)

        # Add events outside window (31-35 days ago)
        for i in range(5):
            event = self.create_test_event(
                stock_code=stock_code,
                days_ago=31 + i  # 31-35 days ago
            )
            await event_window_manager.add_event(event)

        # Manually trigger eviction
        evicted = await event_window_manager._evict_expired(stock_code)
        assert evicted == 5

        # Verify only 5 events remain
        events = await event_window_manager.get_window_events(stock_code)
        assert len(events) == 5

    async def test_evict_no_old_events(self, event_window_manager: EventWindowManager):
        """Test eviction when no old events exist"""
        stock_code = "000001.SZ"

        # Add only recent events
        for i in range(5):
            event = self.create_test_event(
                stock_code=stock_code,
                days_ago=i
            )
            await event_window_manager.add_event(event)

        evicted = await event_window_manager._evict_expired(stock_code)
        assert evicted == 0

    async def test_eviction_on_add_event(self, event_window_manager: EventWindowManager):
        """Test that eviction is triggered automatically on add_event"""
        stock_code = "000001.SZ"

        # Add old events (35 days ago)
        old_event = self.create_test_event(
            stock_code=stock_code,
            days_ago=35
        )
        await event_window_manager.add_event(old_event)

        # Add a new event - should trigger eviction
        new_event = self.create_test_event(
            stock_code=stock_code,
            days_ago=1
        )
        await event_window_manager.add_event(new_event)

        # Verify old event was evicted
        events = await event_window_manager.get_window_events(stock_code)
        assert len(events) == 1
        assert events[0].id == new_event.id


@pytest.mark.asyncio
class TestFIFOEviction(TestEventWindowManager):
    """Tests for FIFO capacity control (100 event limit)"""

    async def test_fifo_eviction_when_over_capacity(
        self,
        event_window_manager: EventWindowManager,
        db_session: AsyncSession
    ):
        """Test FIFO eviction when exceeding max capacity"""
        stock_code = "000001.SZ"

        # Set small max_events for testing
        event_window_manager.config.max_events = 10

        # Add 15 events (over capacity)
        event_ids = []
        for i in range(15):
            event = self.create_test_event(
                stock_code=stock_code,
                days_ago=i  # Older events have higher days_ago
            )
            event_ids.append(event.id)
            await event_window_manager.add_event(event)

        # Verify only 10 events remain (most recent)
        events = await event_window_manager.get_window_events(stock_code)
        assert len(events) == 10

        # Oldest 5 events should have been evicted
        remaining_ids = {e.id for e in events}
        for old_id in event_ids[-5:]:  # Last 5 are oldest
            assert old_id not in remaining_ids

    async def test_fifo_no_eviction_under_capacity(self, event_window_manager: EventWindowManager):
        """Test no eviction when under capacity"""
        stock_code = "000001.SZ"
        event_window_manager.config.max_events = 100

        # Add 50 events (under capacity)
        for i in range(50):
            event = self.create_test_event(
                stock_code=stock_code,
                days_ago=i
            )
            await event_window_manager.add_event(event)

        events = await event_window_manager.get_window_events(stock_code)
        assert len(events) == 50

    async def test_fifo_eviction_count(self, event_window_manager: EventWindowManager):
        """Test correct number of events are evicted"""
        stock_code = "000001.SZ"
        event_window_manager.config.max_events = 5

        # Add 8 events
        for i in range(8):
            event = self.create_test_event(
                stock_code=stock_code,
                days_ago=i
            )
            await event_window_manager.add_event(event)

        # Should evict 3 oldest events
        evicted = await event_window_manager._evict_fifo_if_needed(stock_code)
        assert evicted == 3

        # Verify remaining count
        events = await event_window_manager.get_window_events(stock_code)
        assert len(events) == 5


@pytest.mark.asyncio
class TestWindowFeatures(TestEventWindowManager):
    """Tests for window feature aggregation"""

    async def test_window_features_calculated(self, event_window_manager: EventWindowManager):
        """Test that window features are calculated after adding events"""
        stock_code = "000001.SZ"

        # Add multiple positive events
        for i in range(5):
            event = self.create_test_event(
                stock_code=stock_code,
                days_ago=i,
                intensity=0.8,
                sentiment=EventSentiment.POSITIVE
            )
            await event_window_manager.add_event(event)

        # Get window features
        features = await event_window_manager.get_window_features(stock_code)

        assert features is not None
        assert features.dominant_sentiment == "bullish"
        assert features.event_count == 5
        assert features.bullish_count == 5

    async def test_window_features_cached(self, event_window_manager: EventWindowManager):
        """Test that window features are cached in EventWindow table"""
        stock_code = "000001.SZ"

        # Add events
        for i in range(3):
            event = self.create_test_event(
                stock_code=stock_code,
                days_ago=i
            )
            await event_window_manager.add_event(event)

        # Query EventWindow table directly
        stmt = select(EventWindow).where(EventWindow.stock_code == stock_code)
        result = await event_window_manager.db.execute(stmt)
        window = result.scalar_one_or_none()

        assert window is not None
        assert window.event_count == 3
        assert window.features_json is not None


@pytest.mark.asyncio
class TestClearWindow(TestEventWindowManager):
    """Tests for clear_window method"""

    async def test_clear_window_removes_events(
        self,
        event_window_manager: EventWindowManager,
        db_session: AsyncSession
    ):
        """Test that clear_window removes all events"""
        stock_code = "000001.SZ"

        # Add events
        for i in range(10):
            event = self.create_test_event(
                stock_code=stock_code,
                days_ago=i
            )
            await event_window_manager.add_event(event)

        # Clear window
        deleted = await event_window_manager.clear_window(stock_code)
        assert deleted == 10

        # Verify no events remain
        events = await event_window_manager.get_window_events(stock_code)
        assert len(events) == 0


@pytest.mark.asyncio
class TestGetAllStockCodes(TestEventWindowManager):
    """Tests for get_all_stock_codes method"""

    async def test_get_all_stock_codes(self, event_window_manager: EventWindowManager):
        """Test retrieving all stock codes with events"""
        stocks = ["000001.SZ", "000002.SZ", "600000.SH"]

        for stock in stocks:
            event = self.create_test_event(stock_code=stock)
            await event_window_manager.add_event(event)

        result = await event_window_manager.get_all_stock_codes()
        assert sorted(result) == sorted(stocks)

    async def test_get_all_stock_codes_empty(self, event_window_manager: EventWindowManager):
        """Test retrieving stock codes when no events exist"""
        result = await event_window_manager.get_all_stock_codes()
        assert result == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
