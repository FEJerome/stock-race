"""
Database configuration and session management
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, String, Integer, Float, DateTime, JSON
from datetime import datetime
import os

# Get the project root directory (stock-race)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "local", "backend", "db", "local_trading.db")

# Database URL - SQLite for Local version
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite+aiosqlite:///{DEFAULT_DB_PATH}"
)

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Base class for models
Base = declarative_base()


# Database Models
class AgentModel(Base):
    """AI Agent database model"""
    __tablename__ = "agents"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    initial_capital = Column(Float, nullable=False)
    current_capital = Column(Float, nullable=False)
    strategy = Column(JSON, nullable=False, default=dict)
    model_provider = Column(String, default="kimi")  # Default: Kimi K2.5
    model_name = Column(String, default="kimi-k2-5")
    agent_level = Column(String, default="intern")  # intern/manager/partner
    incentive_level = Column(String, default="standard")  # standard/active/aggressive
    status = Column(String, default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TradeModel(Base):
    """Trade record database model"""
    __tablename__ = "trades"

    id = Column(String, primary_key=True)
    agent_id = Column(String, nullable=False, index=True)
    symbol = Column(String, nullable=False)
    action = Column(String, nullable=False)  # buy/sell
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)
    realized_pnl = Column(Float, nullable=True)
    decision_reason = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)


class PositionModel(Base):
    """Position database model"""
    __tablename__ = "positions"

    agent_id = Column(String, primary_key=True)
    symbol = Column(String, primary_key=True)
    name = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False, default=0)
    avg_cost = Column(Float, nullable=False, default=0.0)
    current_price = Column(Float, nullable=True)


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    """Get database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
