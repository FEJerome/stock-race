"""
Database configuration and session management
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, String, Integer, Float, DateTime, JSON, Index, BigInteger
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


class NewsIntelligenceModel(Base):
    """新闻结构化情报模型 - 精简情报架构"""
    __tablename__ = "news_intelligence"

    id = Column(String, primary_key=True)           # URL MD5作为ID
    symbol = Column(String, index=True)              # 股票代码
    headline = Column(String)                        # 一句话摘要(≤50字)
    sentiment = Column(String)                       # positive/negative/neutral
    confidence = Column(Float)                       # 置信度0-1
    relevance_score = Column(Float)                  # 关联度0-1
    key_points = Column(JSON)                        # 关键信息点列表
    source = Column(String)                          # 来源: sina/eastmoney
    url = Column(String)                             # 原文链接
    publish_time = Column(DateTime)                  # 发布时间
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)                    # 过期时间(7天后)

    __table_args__ = (
        Index('idx_news_symbol_created', 'symbol', 'created_at'),  # 复合索引：按股票查最新新闻
        Index('idx_news_expires', 'expires_at'),                   # 过期清理索引
    )


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


class MarketQuoteModel(Base):
    """行情历史数据模型 - 惰性存储"""
    __tablename__ = "market_quotes"

    symbol = Column(String, primary_key=True)
    timestamp = Column(DateTime, primary_key=True)
    price = Column(Float, nullable=False)
    change = Column(Float, default=0)
    change_percent = Column(Float, default=0)
    volume = Column(BigInteger, default=0)
    amount = Column(BigInteger, default=0)

    __table_args__ = (
        Index('idx_quotes_symbol_time', 'symbol', 'timestamp'),
    )


# ============================================
# 事件舆情系统 - 基于学术论文的时序分析
# ============================================

class EventModel(Base):
    """事件数据模型 - 从新闻抽取的独立事件"""
    __tablename__ = "events"

    id = Column(String, primary_key=True)
    symbol = Column(String, index=True, nullable=False)
    news_id = Column(String, nullable=True)  # 来源新闻ID
    event_type = Column(String, nullable=False)  # 业绩/股权/治理/业务/政策
    trigger_word = Column(String, nullable=False)  # 触发词
    subject = Column(String, nullable=True)  # 主体
    object = Column(String, nullable=True)  # 客体
    event_date = Column(DateTime, nullable=True)  # 事件日期
    sentiment = Column(String, default="neutral")  # positive/negative/neutral
    intensity = Column(Float, default=0.0)  # 事件强度 S = P_up - P_down
    p_up = Column(Float, default=0.5)  # 上涨概率
    p_down = Column(Float, default=0.5)  # 下跌概率
    is_merged = Column(String, default="false")  # 是否合并事件
    merged_count = Column(Integer, default=1)  # 合并事件数量
    source_text = Column(String, nullable=True)  # 原文片段
    publish_time = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)  # 30天后过期

    __table_args__ = (
        Index('idx_events_symbol_created', 'symbol', 'created_at'),
        Index('idx_events_expires', 'expires_at'),
    )


class EventRelationModel(Base):
    """事件时序关系模型 - Before/After/Equal/Vague"""
    __tablename__ = "event_relations"

    id = Column(String, primary_key=True)
    event_a_id = Column(String, nullable=False, index=True)
    event_b_id = Column(String, nullable=False, index=True)
    relation = Column(String, nullable=False)  # Before/After/Equal/Vague
    confidence = Column(Float, default=0.8)
    source = Column(String, default="llm_boolean")  # date/position/llm_boolean
    q1_answer = Column(String, nullable=True)  # YES/NO
    q2_answer = Column(String, nullable=True)  # YES/NO
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_relations_events', 'event_a_id', 'event_b_id'),
        Index('idx_relations_created', 'created_at'),  # 用于定期清理
    )


class EventWindowModel(Base):
    """事件窗口模型 - 30天滚动窗口聚合结果"""
    __tablename__ = "event_windows"

    id = Column(String, primary_key=True)
    symbol = Column(String, nullable=False, index=True)
    window_date = Column(DateTime, nullable=False)  # 窗口日期
    narrative_summary = Column(String, nullable=True)  # 叙事摘要
    net_expectation = Column(Float, default=0.0)  # Fa值（净预期强度）
    dominant_sentiment = Column(String, default="neutral")
    logical_consistency = Column(Float, default=0.0)  # 0-1
    sentiment_volatility = Column(Float, default=0.0)
    temporal_pattern = Column(String, default="Complex")  # Reversal/Cumulative/Conflict
    event_count = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_windows_symbol_date', 'symbol', 'window_date'),
    )
