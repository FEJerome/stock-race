"""
Pytest configuration and fixtures
"""
"""
Pytest configuration and fixtures
"""
import pytest
import pytest_asyncio
import asyncio
import uuid
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from datetime import datetime

from models.database import Base, AgentModel, TradeModel, PositionModel

# Use file-based SQLite for testing (shared across session)
TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create test database engine"""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True
    )

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Cleanup - drop tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a fresh database session for each test with cleanup"""
    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False
    )

    async with async_session() as session:
        yield session
        # Clean up all tables after each test
        from sqlalchemy import delete
        await session.execute(delete(TradeModel))
        await session.execute(delete(PositionModel))
        await session.execute(delete(AgentModel))
        await session.commit()


@pytest_asyncio.fixture
async def sample_agent(db_session: AsyncSession) -> AgentModel:
    """Create a sample agent for testing with unique ID"""
    agent = AgentModel(
        id=f"test-agent-{uuid.uuid4().hex[:8]}",
        name="Test Trader",
        initial_capital=100000.0,
        current_capital=100000.0,
        strategy={
            "risk_tolerance": "稳健",
            "sectors": ["金融", "科技"],
            "holding_period": "中线",
            "position_limit": "单股不超过30%",
            "stop_loss": "8%止损"
        },
        model_provider="kimi",
        model_name="kimi-k2-5",
        agent_level="intern",
        incentive_level="standard",
        status="active",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db_session.add(agent)
    await db_session.commit()
    return agent


@pytest.fixture
def market_context_data():
    """Sample market context data"""
    return {
        "symbol": "000001",
        "name": "平安银行",
        "current_price": 10.5,
        "change_percent": 2.3,
        "volume": 1000000,
        "ma5": 10.2,
        "ma10": 10.0,
        "ma20": 9.8,
        "high_52w": 15.0,
        "low_52w": 8.0
    }


@pytest.fixture
def strategy_config():
    """Sample strategy configuration"""
    return {
        "risk_tolerance": "稳健",
        "sectors": ["金融", "科技"],
        "holding_period": "中线",
        "position_limit": "单股不超过30%",
        "stop_loss": "8%止损",
        "market_scope": "主板+创业板"
    }
