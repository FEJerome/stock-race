"""
News Service Integration Tests

Tests real news data sources without mocks.
Requires network connectivity.
"""
import pytest
import pytest_asyncio
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from services.news.service import NewsService
from services.news.sina_news import SinaNewsSource
from services.news.eastmoney_news import EastmoneyNewsSource
from services.news.processor import SentimentProcessor
from services.news.base import NewsItem
from models.database import NewsIntelligenceModel


TEST_SYMBOL = "000001.SZ"  # 平安银行


@pytest_asyncio.fixture
async def news_service():
    """Create news service instance"""
    service = NewsService()
    yield service
    await service.close()


@pytest_asyncio.fixture
async def sina_source():
    """Create Sina data source"""
    source = SinaNewsSource()
    yield source
    await source.close()


@pytest_asyncio.fixture
async def eastmoney_source():
    """Create EastMoney data source"""
    source = EastmoneyNewsSource()
    yield source
    await source.close()


@pytest.mark.asyncio
class TestSinaNewsSource:
    """Sina Finance collector tests"""

    async def test_fetch_news(self, sina_source):
        """Test fetching stock news from Sina"""
        news = await sina_source.fetch_news(TEST_SYMBOL, limit=5)

        assert isinstance(news, list)
        print(f"\n[Sina] Fetched {len(news)} news for {TEST_SYMBOL}")

        if len(news) > 0:
            item = news[0]
            assert item.symbol == TEST_SYMBOL
            assert len(item.title) > 0
            assert len(item.id) == 32  # MD5 length
            print(f"  - {item.title[:40]}...")

    async def test_health_check(self, sina_source):
        """Test Sina health check"""
        health = await sina_source.health_check()

        assert health is not None
        assert health.source_name == "sina"
        assert health.latency_ms >= 0
        print(f"\n[Sina Health] Status: {health.status.value}, Latency: {health.latency_ms:.2f}ms")


@pytest.mark.asyncio
class TestEastmoneyNewsSource:
    """EastMoney collector tests"""

    async def test_fetch_news(self, eastmoney_source):
        """Test fetching stock news from EastMoney"""
        news = await eastmoney_source.fetch_news(TEST_SYMBOL, limit=5)

        assert isinstance(news, list)
        print(f"\n[Eastmoney] Fetched {len(news)} news for {TEST_SYMBOL}")

        if len(news) > 0:
            item = news[0]
            assert item.symbol == TEST_SYMBOL
            print(f"  - {item.title[:40]}...")

    async def test_health_check(self, eastmoney_source):
        """Test EastMoney health check"""
        health = await eastmoney_source.health_check()

        assert health is not None
        assert health.source_name == "eastmoney"
        print(f"\n[Eastmoney Health] Status: {health.status.value}, Latency: {health.latency_ms:.2f}ms")


@pytest.mark.asyncio
class TestSentimentProcessor:
    """Sentiment analysis processor tests"""

    async def test_sentiment_analysis_positive(self):
        """Test positive sentiment detection"""
        processor = SentimentProcessor()

        # Simulate positive news
        item = NewsItem(
            id="test001",
            symbol=TEST_SYMBOL,
            title="平安银行业绩预增50%，创历史新高",
            summary="公司发布业绩预告，净利润大幅增长",
            source="test",
            url="http://test.com/1",
            publish_time=datetime.utcnow(),
            collected_at=datetime.utcnow()
        )

        result = processor.process(item)

        assert result is not None
        assert result.sentiment == "positive"
        assert result.confidence > 0.5
        print(f"\n[Sentiment] Positive: {result.headline} (confidence: {result.confidence})")

    async def test_sentiment_analysis_negative(self):
        """Test negative sentiment detection"""
        processor = SentimentProcessor()

        # Simulate negative news
        item = NewsItem(
            id="test002",
            symbol=TEST_SYMBOL,
            title="平安银行预减亏损，股价下跌",
            summary="公司面临业绩下滑压力",
            source="test",
            url="http://test.com/2",
            publish_time=datetime.utcnow(),
            collected_at=datetime.utcnow()
        )

        result = processor.process(item)

        assert result is not None
        assert result.sentiment == "negative"
        print(f"\n[Sentiment] Negative: {result.headline} (confidence: {result.confidence})")

    async def test_relevance_filter(self):
        """Test relevance filtering"""
        processor = SentimentProcessor()

        # Low relevance news (old stock code not in title)
        item = NewsItem(
            id="test003",
            symbol="999999.SZ",  # Non-existent code
            title="通用新闻标题，没有股票信息",
            summary="无关内容",
            source="test",
            url="http://test.com/3",
            publish_time=datetime.utcnow(),
            collected_at=datetime.utcnow()
        )

        result = processor.process(item)

        # Should be filtered out due to low relevance
        assert result is None or result.relevance_score < 0.6
        print(f"\n[Relevance] Low relevance item filtered out")


@pytest.mark.asyncio
class TestNewsService:
    """News service integration tests"""

    async def test_collect_and_store(self, news_service, db_session: AsyncSession):
        """Test collection and storage to database"""
        db = db_session
        # Collect news
        intelligence = await news_service.collect_news(TEST_SYMBOL, db, limit=5)

        # Verify database has data
        result = await db.execute(
            select(NewsIntelligenceModel)
            .where(NewsIntelligenceModel.symbol == TEST_SYMBOL)
        )
        stored = result.scalars().all()

        print(f"\n[Service] Collected {len(intelligence)} intelligence, {len(stored)} stored")

        # Verify stored data
        if len(stored) > 0:
            item = stored[0]
            assert item.symbol == TEST_SYMBOL
            assert item.sentiment in ["positive", "negative", "neutral"]
            assert 0 <= item.confidence <= 1
            assert item.expires_at > item.created_at

    async def test_get_intelligence_summary(self, news_service, db_session: AsyncSession):
        """Test getting intelligence summary"""
        db = db_session
        # First collect some data
        await news_service.collect_news(TEST_SYMBOL, db, limit=3)

        # Get summary
        summary = await news_service.get_intelligence_summary(TEST_SYMBOL, db)

        print(f"\n[Summary] {summary}")

        if summary:
            # Verify format includes sentiment labels
            assert "(" in summary and ")" in summary

    async def test_storage_size_constraint(self, news_service, db_session: AsyncSession):
        """Verify storage size constraint (<500 bytes)"""
        db = db_session
        await news_service.collect_news(TEST_SYMBOL, db, limit=1)

        result = await db.execute(
            select(NewsIntelligenceModel)
            .where(NewsIntelligenceModel.symbol == TEST_SYMBOL)
            .limit(1)
        )
        item = result.scalar_one_or_none()

        if item:
            # Estimate storage size
            size = len(item.headline or "") + len(item.sentiment or "") + len(str(item.key_points or ""))
            print(f"\n[Storage] Estimated size: {size} bytes")
            assert size < 500, f"Storage size {size} exceeds 500 bytes limit"

    async def test_health_check(self, news_service):
        """Test service health check"""
        health = await news_service.health_check()

        assert "sina" in health
        assert "eastmoney" in health

        print(f"\n[Service Health]")
        for name, h in health.items():
            print(f"  {name}: {h.status.value}, {h.latency_ms:.2f}ms")
