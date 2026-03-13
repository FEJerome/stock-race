"""
Pytest fixtures and configuration
"""
import pytest
import pytest_asyncio
import asyncio
from datetime import datetime, timedelta
from typing import AsyncGenerator
from uuid import uuid4

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from models.event import Event, EventWindow, EventRelation, EventSentiment, EventType, Base
from services.event_window_manager import EventWindowManager


# Test database URL (in-memory SQLite)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def async_engine():
    """Create a test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True
    )

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Cleanup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(async_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False
    )

    session = async_session()
    async with session.begin():
        yield session


@pytest_asyncio.fixture(scope="function")
async def event_window_manager(db_session: AsyncSession) -> EventWindowManager:
    """Create an EventWindowManager instance with test session."""
    return EventWindowManager(
        db_session=db_session,
        window_days=30,
        max_events=100,
        ema_alpha=0.9
    )


# Test data fixtures

@pytest.fixture
def sample_stock_code() -> str:
    """Sample stock code."""
    return "000001.SZ"


@pytest.fixture
def create_test_event():
    """Factory fixture for creating test events."""
    def _create_event(
        stock_code: str = "000001.SZ",
        trigger: str = "发布",
        subject: str = "公司",
        obj: str = "新产品",
        event_type: str = EventType.BUSINESS,
        intensity: float = 0.8,
        sentiment: str = EventSentiment.POSITIVE,
        timestamp: datetime = None,
        days_ago: int = 0
    ) -> Event:
        if timestamp is None:
            timestamp = datetime.utcnow() - timedelta(days=days_ago)

        return Event(
            id=str(uuid4()),
            news_id=str(uuid4()),
            stock_code=stock_code,
            trigger=trigger,
            subject=subject,
            object=obj,
            event_type=event_type,
            intensity=intensity,
            sentiment=sentiment,
            timestamp=timestamp
        )

    return _create_event


@pytest.fixture
def sample_events(create_test_event, sample_stock_code) -> list:
    """Create a list of sample events for testing."""
    events = [
        create_test_event(
            stock_code=sample_stock_code,
            trigger="发布",
            subject="公司A",
            obj="财报",
            event_type=EventType.PERFORMANCE,
            intensity=0.9,
            sentiment=EventSentiment.POSITIVE,
            days_ago=1
        ),
        create_test_event(
            stock_code=sample_stock_code,
            trigger="回购",
            subject="公司A",
            obj="股份",
            event_type=EventType.EQUITY,
            intensity=0.7,
            sentiment=EventSentiment.POSITIVE,
            days_ago=5
        ),
        create_test_event(
            stock_code=sample_stock_code,
            trigger="涉嫌",
            subject="公司A",
            obj="违规",
            event_type=EventType.GOVERNANCE,
            intensity=0.6,
            sentiment=EventSentiment.NEGATIVE,
            days_ago=10
        ),
        create_test_event(
            stock_code=sample_stock_code,
            trigger="推出",
            subject="公司A",
            obj="新产品",
            event_type=EventType.BUSINESS,
            intensity=0.5,
            sentiment=EventSentiment.POSITIVE,
            days_ago=15
        ),
        create_test_event(
            stock_code=sample_stock_code,
            trigger="受政策影响",
            subject="行业",
            obj=None,
            event_type=EventType.POLICY,
            intensity=0.4,
            sentiment=EventSentiment.NEUTRAL,
            days_ago=20
        ),
    ]
    return events
