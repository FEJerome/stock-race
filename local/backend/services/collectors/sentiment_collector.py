"""
Sentiment Collector - Adapter for SentimentSource to BaseCollector

Wraps existing SentimentSource implementations (XueqiuSource, EastmoneyGubaSource)
to provide the BaseCollector interface with incremental collection support.
"""
from datetime import datetime
from typing import Optional

from .base import BaseCollector, CollectionResult, CollectorStatus
from ..sentiment.base import SentimentSource, SentimentPost


class SentimentCollector(BaseCollector):
    """
    Sentiment/Social media collector adapter

    Wraps SentimentSource implementations to provide BaseCollector interface.
    Supports incremental collection by filtering posts by publish_time.

    Example:
        from services.sentiment.xueqiu_source import XueqiuSource

        source = XueqiuSource(priority=50)
        collector = SentimentCollector(source)

        # Full collection
        result = await collector.collect("000001.SZ")

        # Incremental collection (only items after since)
        result = await collector.collect(
            "000001.SZ",
            since=datetime(2024, 1, 1, 12, 0, 0)
        )
    """

    def __init__(self, source: SentimentSource):
        """
        Initialize sentiment collector

        Args:
            source: SentimentSource implementation (XueqiuSource, EastmoneyGubaSource, etc.)
        """
        super().__init__(name=source.name, priority=source.priority)
        self._source = source

    def get_source_name(self) -> str:
        """Return data source name"""
        return self._source.name

    async def collect(
        self,
        symbol: str,
        since: Optional[datetime] = None,
        limit: int = 100
    ) -> CollectionResult:
        """
        Collect sentiment posts for a symbol

        Args:
            symbol: Stock symbol (e.g., "000001.SZ")
            since: Incremental collection start time (None = all)
            limit: Maximum items to collect

        Returns:
            CollectionResult with sentiment posts and metadata
        """
        start_time = datetime.utcnow()
        self._set_running()

        try:
            # Fetch posts from source
            posts: list[SentimentPost] = await self._source.fetch_posts(symbol, limit=limit)

            # Filter by publish_time if since is provided (incremental collection)
            if since:
                filtered_posts = [
                    post for post in posts
                    if post.publish_time and post.publish_time > since
                ]
            else:
                filtered_posts = posts

            # Determine next_since (latest publish_time from collected items)
            next_since = None
            if filtered_posts:
                publish_times = [
                    post.publish_time for post in filtered_posts
                    if post.publish_time
                ]
                if publish_times:
                    next_since = max(publish_times)

            end_time = datetime.utcnow()

            # Update health
            duration_ms = (end_time - start_time).total_seconds() * 1000
            self._update_health_success(duration_ms)

            return CollectionResult(
                source_name=self._source.name,
                symbol=symbol,
                items=filtered_posts,
                count=len(filtered_posts),
                start_time=start_time,
                end_time=end_time,
                success=True,
                next_since=next_since
            )

        except Exception as e:
            end_time = datetime.utcnow()
            error_msg = str(e)

            self._update_health_error(error_msg)

            return CollectionResult(
                source_name=self._source.name,
                symbol=symbol,
                items=[],
                count=0,
                start_time=start_time,
                end_time=end_time,
                success=False,
                error_message=error_msg
            )

    async def health_check(self):
        """Check source health"""
        try:
            is_healthy = await self._source.health_check()
            self._health.status = CollectorStatus.HEALTHY if is_healthy else CollectorStatus.ERROR
            return self._health
        except Exception as e:
            self._health.status = CollectorStatus.ERROR
            self._health.last_error = str(e)
            return self._health

    async def close(self):
        """Close source connections"""
        if hasattr(self._source, 'close'):
            await self._source.close()


class MultiSourceSentimentCollector(BaseCollector):
    """
    Multi-source sentiment collector

    Aggregates multiple SentimentSource implementations into a single collector.
    Automatically merges and deduplicates results from all sources.

    Example:
        from services.sentiment.xueqiu_source import XueqiuSource
        from services.sentiment.eastmoney_guba_source import EastmoneyGubaSource

        collector = MultiSourceSentimentCollector([
            XueqiuSource(priority=50),
            EastmoneyGubaSource(priority=60)
        ])

        result = await collector.collect("000001.SZ")
        # result.items contains merged posts from all sources
    """

    def __init__(self, sources: list[SentimentSource], name: str = "multi_sentiment"):
        """
        Initialize multi-source collector

        Args:
            sources: List of SentimentSource implementations
            name: Collector name
        """
        super().__init__(name=name, priority=min(s.priority for s in sources))
        self._sources = sources
        self._collectors = [SentimentCollector(s) for s in sources]

    def get_source_name(self) -> str:
        """Return data source name"""
        return self.name

    async def collect(
        self,
        symbol: str,
        since: Optional[datetime] = None,
        limit: int = 100
    ) -> CollectionResult:
        """
        Collect sentiment posts from all sources

        Args:
            symbol: Stock symbol
            since: Incremental collection start time
            limit: Maximum items per source

        Returns:
            CollectionResult with merged sentiment posts
        """
        start_time = datetime.utcnow()
        self._set_running()

        all_posts = []
        errors = []
        next_since = since

        # Collect from each source
        for collector in self._collectors:
            try:
                result = await collector.collect(symbol, since=since, limit=limit)

                if result.success:
                    all_posts.extend(result.items)
                    # Update next_since to the latest timestamp
                    if result.next_since:
                        if next_since is None or result.next_since > next_since:
                            next_since = result.next_since
                else:
                    errors.append(f"{collector.name}: {result.error_message}")

            except Exception as e:
                errors.append(f"{collector.name}: {str(e)}")

        end_time = datetime.utcnow()

        # Deduplicate by ID
        seen_ids = set()
        unique_posts = []
        for post in all_posts:
            if post.id not in seen_ids:
                seen_ids.add(post.id)
                unique_posts.append(post)

        # Sort by publish_time (newest first)
        unique_posts.sort(
            key=lambda x: x.publish_time or datetime.min,
            reverse=True
        )

        # Limit total results
        final_posts = unique_posts[:limit]

        # Update health
        if errors and len(errors) == len(self._collectors):
            # All sources failed
            self._update_health_error("; ".join(errors))
            return CollectionResult(
                source_name=self.name,
                symbol=symbol,
                items=[],
                count=0,
                start_time=start_time,
                end_time=end_time,
                success=False,
                error_message="; ".join(errors),
                next_since=since
            )
        else:
            duration_ms = (end_time - start_time).total_seconds() * 1000
            self._update_health_success(duration_ms)

            return CollectionResult(
                source_name=self.name,
                symbol=symbol,
                items=final_posts,
                count=len(final_posts),
                start_time=start_time,
                end_time=end_time,
                success=True,
                error_message="; ".join(errors) if errors else None,
                next_since=next_since
            )

    async def close(self):
        """Close all source connections"""
        for collector in self._collectors:
            await collector.close()
