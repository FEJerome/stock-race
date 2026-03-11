"""
News Collection Service - Main service class

Manages multiple news sources, processes and stores intelligence.
Reference: archive/v0.9-legacy/docs/modules/news-service/HAVE_DONE.md
"""
from typing import List, Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, desc

from .base import NewsSource, NewsItem
from .sina_news import SinaNewsSource
from .eastmoney_news import EastmoneyNewsSource
from .processor import SentimentProcessor, DuplicateDetector, NewsIntelligence


class NewsService:
    """
    News collection service main class

    Responsibilities:
    - Manage multiple news sources
    - Collect and process news
    - Store structured intelligence to SQLite
    - Provide query interfaces
    """

    def __init__(self):
        self.sources: List[NewsSource] = [
            SinaNewsSource(priority=50),
            EastmoneyNewsSource(priority=60)
        ]
        self.processor = SentimentProcessor()
        self.duplicate_detector = DuplicateDetector(similarity_threshold=0.9)

    async def collect_news(self, symbol: str, db: AsyncSession, limit: int = 10) -> List[NewsIntelligence]:
        """
        Collect news for a specific stock

        Args:
            symbol: Stock symbol
            db: Database session
            limit: Max items per source

        Returns:
            List of processed NewsIntelligence
        """
        all_intelligence = []

        for source in self.sources:
            try:
                # 1. Fetch raw news
                news_items = await source.fetch_news(symbol, limit=limit)

                # 2. Process and filter
                for item in news_items:
                    # Duplicate check
                    if self.duplicate_detector.is_duplicate(item.title):
                        continue

                    # Sentiment processing
                    intelligence = self.processor.process(item)
                    if intelligence:
                        all_intelligence.append(intelligence)

            except Exception as e:
                print(f"[NewsService] Error collecting from {source.name}: {e}")
                continue

        # 3. Save to database
        for intel in all_intelligence:
            await self._save_intelligence(intel, db)

        # Clear duplicate cache periodically
        if len(self.duplicate_detector._seen_titles) > 1000:
            self.duplicate_detector.clear()

        return all_intelligence

    async def _save_intelligence(self, intel: NewsIntelligence, db: AsyncSession):
        """Save structured intelligence to database"""
        from models.database import NewsIntelligenceModel

        # Check if exists
        result = await db.execute(
            select(NewsIntelligenceModel).where(NewsIntelligenceModel.id == intel.id)
        )
        if result.scalar_one_or_none():
            return  # Already exists, skip

        # Create new record
        model = NewsIntelligenceModel(
            id=intel.id,
            symbol=intel.symbol,
            headline=intel.headline,
            sentiment=intel.sentiment,
            confidence=intel.confidence,
            relevance_score=intel.relevance_score,
            key_points=intel.key_points,
            source=intel.source,
            url=intel.url,
            publish_time=intel.publish_time,
            expires_at=intel.expires_at
        )
        db.add(model)
        await db.commit()

    async def get_intelligence(
        self,
        symbol: str,
        db: AsyncSession,
        limit: int = 10,
        min_confidence: float = 0.0
    ) -> List[dict]:
        """
        Get latest intelligence for a stock

        Args:
            symbol: Stock symbol
            db: Database session
            limit: Max results
            min_confidence: Minimum confidence filter

        Returns:
            List of intelligence dicts
        """
        from models.database import NewsIntelligenceModel

        result = await db.execute(
            select(NewsIntelligenceModel)
            .where(NewsIntelligenceModel.symbol == symbol)
            .where(NewsIntelligenceModel.confidence >= min_confidence)
            .where(NewsIntelligenceModel.expires_at > datetime.utcnow())
            .order_by(desc(NewsIntelligenceModel.created_at))
            .limit(limit)
        )

        items = result.scalars().all()
        return [
            {
                "id": item.id,
                "headline": item.headline,
                "sentiment": item.sentiment,
                "confidence": item.confidence,
                "source": item.source,
                "url": item.url,
                "created_at": item.created_at.isoformat() if item.created_at else None
            }
            for item in items
        ]

    async def get_intelligence_summary(self, symbol: str, db: AsyncSession) -> Optional[str]:
        """
        Get intelligence summary for AI decision making

        Returns:
            Format: "1. Summary(positive) 2. Summary(negative) ..."
        """
        intelligence = await self.get_intelligence(symbol, db, limit=5)

        if not intelligence:
            return None

        # Generate concise summary
        summaries = []
        for idx, item in enumerate(intelligence, 1):
            sentiment_label = ""
            if item["sentiment"] == "positive":
                sentiment_label = "(正面)"
            elif item["sentiment"] == "negative":
                sentiment_label = "(负面)"
            else:
                sentiment_label = "(中性)"

            summaries.append(f"{idx}. {item['headline']}{sentiment_label}")

        return " ".join(summaries)

    async def cleanup_expired(self, db: AsyncSession) -> int:
        """Clean up expired data, returns deleted count"""
        from models.database import NewsIntelligenceModel

        result = await db.execute(
            delete(NewsIntelligenceModel)
            .where(NewsIntelligenceModel.expires_at < datetime.utcnow())
        )
        await db.commit()
        return result.rowcount

    async def health_check(self) -> dict:
        """Check health of all news sources"""
        health_map = {}
        for source in self.sources:
            try:
                health_map[source.name] = await source.health_check()
            except Exception as e:
                print(f"[NewsService] Health check error for {source.name}: {e}")
                from .base import NewsSourceHealth, NewsSourceStatus
                health_map[source.name] = NewsSourceHealth(
                    source_name=source.name,
                    status=NewsSourceStatus.UNAVAILABLE,
                    latency_ms=0,
                    last_success=None,
                    error_rate=1.0
                )
        return health_map

    async def close(self):
        """Close all data source connections"""
        for source in self.sources:
            if hasattr(source, 'close'):
                try:
                    await source.close()
                except Exception as e:
                    print(f"[NewsService] Error closing {source.name}: {e}")


# Global service instance (singleton)
_news_service: Optional[NewsService] = None


def get_news_service() -> NewsService:
    """Get news service singleton instance"""
    global _news_service
    if _news_service is None:
        _news_service = NewsService()
    return _news_service


async def get_news_service_async() -> NewsService:
    """Get news service singleton instance (async version for FastAPI)"""
    return get_news_service()
