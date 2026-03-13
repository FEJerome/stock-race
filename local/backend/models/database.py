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
# 事件舆情系统模型
# ============================================
# 事件相关模型定义在 models/event.py
# Event/EventRelation/EventWindow


class FinancialReportModel(Base):
    """财报数据模型 - 存储结构化财报数据"""
    __tablename__ = "financial_reports"

    id = Column(String, primary_key=True)  # {symbol}_{report_period}
    symbol = Column(String, nullable=False, index=True)
    report_type = Column(String, nullable=False)  # Q1/Q2/Q3/ANNUAL/FLASH
    report_year = Column(Integer, nullable=False)
    report_period = Column(String, nullable=False)  # 2024-Q1, 2024-ANNUAL

    # 文件存储
    pdf_path = Column(String, nullable=True)  # 本地PDF路径
    source_url = Column(String, nullable=True)  # 来源URL

    # 关键指标 (单位: 万元)
    revenue = Column(Float, nullable=True)  # 营业收入
    revenue_yoy = Column(Float, nullable=True)  # 营收同比%
    revenue_qoq = Column(Float, nullable=True)  # 营收环比%

    net_profit = Column(Float, nullable=True)  # 净利润
    net_profit_yoy = Column(Float, nullable=True)  # 净利润同比%
    net_profit_qoq = Column(Float, nullable=True)  # 净利润环比%

    gross_profit = Column(Float, nullable=True)  # 毛利润
    gross_margin = Column(Float, nullable=True)  # 毛利率%

    eps = Column(Float, nullable=True)  # 每股收益
    roe = Column(Float, nullable=True)  # 净资产收益率%

    # 原始文本内容 (用于AI分析)
    raw_text = Column(String, nullable=True)

    # 元数据
    publish_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_financial_symbol_period', 'symbol', 'report_period'),
        Index('idx_financial_symbol_year', 'symbol', 'report_year'),
    )


class SentimentTrendModel(Base):
    """情绪趋势数据模型 - 用于热度追踪和情绪分析"""
    __tablename__ = "sentiment_trends"

    id = Column(String, primary_key=True)  # {symbol}_{timestamp}
    symbol = Column(String, nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)

    # 情绪得分 (-100 to 100)
    sentiment_score = Column(Float, nullable=False, default=0)
    sentiment_label = Column(String, nullable=False, default='neutral')  # positive/negative/neutral

    # 统计数据
    post_count = Column(Integer, default=0)
    positive_count = Column(Integer, default=0)
    negative_count = Column(Integer, default=0)
    neutral_count = Column(Integer, default=0)

    # 热度指标
    hot_score = Column(Float, default=0)  # 热度得分 (0-100)
    mention_count = Column(Integer, default=0)  # 提及次数
    interaction_count = Column(Integer, default=0)  # 点赞+评论+转发总数

    # 数据源统计
    xueqiu_count = Column(Integer, default=0)
    guba_count = Column(Integer, default=0)

    # 情绪分布详情 (JSON格式存储AI分析结果)
    sentiment_details = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_sentiment_symbol_time', 'symbol', 'timestamp'),
    )
