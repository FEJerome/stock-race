"""
News Collector - Adapter for NewsSource to BaseCollector

Wraps existing NewsSource implementations (SinaNewsSource, EastmoneyNewsSource)
to provide the BaseCollector interface with incremental collection support.
"""
from datetime import datetime
from typing import Optional

from .base import BaseCollector, CollectionResult
from ..news.base import NewsSource, NewsItem


class NewsCollector(BaseCollector):
    """
    News collector adapter

    Wraps NewsSource implementations to provide BaseCollector interface.
    Supports incremental collection by filtering news items by publish_time.

    Example:
        from services.news.sina_news import SinaNewsSource

        source = SinaNewsSource(priority=50)
        collector = NewsCollector(source)

        # Full collection
        result = await collector.collect("000001.SZ")

        # Incremental collection (only items after since)
        result = await collector.collect(
            "000001.SZ",
            since=datetime(2024, 1, 1, 12, 0, 0)
        )
    """

    def __init__(self, source: NewsSource):
        """
        Initialize news collector

        Args:
            source: NewsSource implementation (SinaNewsSource, EastmoneyNewsSource, etc.)
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
        Collect news for a symbol

        Args:
            symbol: Stock symbol (e.g., "000001.SZ")
            since: Incremental collection start time (None = all)
            limit: Maximum items to collect

        Returns:
            CollectionResult with news items and metadata
        """
        start_time = datetime.utcnow()
        self._set_running()

        try:
            # Fetch news from source
            news_items: list[NewsItem] = await self._source.fetch_news(symbol, limit=limit)

            # Filter by publish_time if since is provided (incremental collection)
            if since:
                filtered_items = [
                    item for item in news_items
                    if item.publish_time and item.publish_time > since
                ]
            else:
                filtered_items = news_items

            # Determine next_since (latest publish_time from collected items)
            next_since = None
            if filtered_items:
                publish_times = [
                    item.publish_time for item in filtered_items
                    if item.publish_time
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
                items=filtered_items,
                count=len(filtered_items),
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
            source_health = await self._source.health_check()
            self._health.status = CollectorStatus.HEALTHY if source_health.status.value == "healthy" else CollectorStatus.ERROR
            return self._health
        except Exception as e:
            self._health.status = CollectorStatus.ERROR
            self._health.last_error = str(e)
            return self._health

    async def close(self):
        """Close source connections"""
        if hasattr(self._source, 'close'):
            await self._source.close()


# Import here to avoid circular imports at module level
from .base import CollectorStatus


class MultiSourceNewsCollector(BaseCollector):
    """
    Multi-source news collector

    Aggregates multiple NewsSource implementations into a single collector.
    Automatically merges and deduplicates results from all sources.

    Example:
        collector = MultiSourceNewsCollector([
            SinaNewsSource(priority=50),
            EastmoneyNewsSource(priority=60)
        ])

        result = await collector.collect("000001.SZ")
        # result.items contains merged news from all sources
    """

    def __init__(self, sources: list[NewsSource], name: str = "multi_news"):
        """
        Initialize multi-source collector

        Args:
            sources: List of NewsSource implementations
            name: Collector name
        """
        super().__init__(name=name, priority=min(s.priority for s in sources))
        self._sources = sources
        self._collectors = [NewsCollector(s) for s in sources]

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
        Collect news from all sources

        Args:
            symbol: Stock symbol
            since: Incremental collection start time
            limit: Maximum items per source

        Returns:
            CollectionResult with merged news items
        """
        start_time = datetime.utcnow()
        self._set_running()

        all_items = []
        errors = []
        next_since = since

        # Collect from each source
        for collector in self._collectors:
            try:
                result = await collector.collect(symbol, since=since, limit=limit)

                if result.success:
                    all_items.extend(result.items)
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
        unique_items = []
        for item in all_items:
            if item.id not in seen_ids:
                seen_ids.add(item.id)
                unique_items.append(item)

        # Sort by publish_time (newest first)
        unique_items.sort(
            key=lambda x: x.publish_time or datetime.min,
            reverse=True
        )

        # Limit total results
        final_items = unique_items[:limit]

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
                items=final_items,
                count=len(final_items),
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
