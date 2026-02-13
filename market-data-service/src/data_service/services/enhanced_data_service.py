"""
Enhanced data service with multi-source routing, segmentation, and advanced features.
"""

import asyncio
import logging
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from contextlib import asynccontextmanager

from ..collectors.router import DataSourceRouter, DataSourceStrategy
from ..processors.data_processor import DataProcessor
from ..storage.database import DatabaseStorage
from ..storage.cache import RedisCache, get_redis_cache
from ..models.stock import (
    StockSymbol, StockQuote, StockData, StockHistory,
    TechnicalIndicator, DataQualityMetrics, CollectionResult,
    MonitoringMetrics
)
from ..core.config import settings

logger = logging.getLogger(__name__)


class EnhancedDataService:
    """Enhanced data service with advanced multi-source capabilities."""

    def __init__(self, strategy: DataSourceStrategy = DataSourceStrategy.ADAPTIVE):
        self.data_router = DataSourceRouter(strategy=strategy)
        self.data_processor = DataProcessor()
        self.database_storage = DatabaseStorage()
        self.redis_cache = get_redis_cache()
        self.is_initialized = False

        # Enhanced collection stats
        self.collection_stats = {
            "total_collections": 0,
            "successful_collections": 0,
            "failed_collections": 0,
            "last_collection": None,
            "segmentation_stats": {},
            "performance_metrics": {}
        }

        # Configuration
        self.batch_size = 50
        self.max_concurrent_requests = 5
        self.cache_ttl = {
            "quote": 5,  # 5 seconds
            "history": 3600,  # 1 hour
            "info": 86400,  # 24 hours
            "indices": 300,  # 5 minutes
            "indicators": 3600  # 1 hour
        }

        # Trading hours (China A-share market)
        self.market_hours = {
            "morning_open": datetime.now().replace(hour=9, minute=30, second=0, microsecond=0),
            "morning_close": datetime.now().replace(hour=11, minute=30, second=0, microsecond=0),
            "afternoon_open": datetime.now().replace(hour=13, minute=0, second=0, microsecond=0),
            "afternoon_close": datetime.now().replace(hour=15, minute=0, second=0, microsecond=0)
        }

    async def initialize(self):
        """Initialize enhanced data service components."""
        if self.is_initialized:
            return

        try:
            # Initialize router
            await self.data_router.initialize()

            # Initialize storage
            await self.database_storage.connect()
            await self.redis_cache.connect()

            # Initialize segmentation stats
            for strategy in self.data_router.segmentation_strategies.keys():
                self.collection_stats["segmentation_stats"][strategy] = {
                    "uses": 0,
                    "success_rate": 0.0,
                    "average_batch_size": 0
                }

            self.is_initialized = True
            logger.info("Enhanced data service initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize enhanced data service: {str(e)}")
            raise

    async def close(self):
        """Close enhanced data service components."""
        try:
            # Close router
            await self.data_router.close()

            # Close storage
            await self.database_storage.close()
            await self.redis_cache.close()

            self.is_initialized = False
            logger.info("Enhanced data service closed")

        except Exception as e:
            logger.error(f"Error closing enhanced data service: {str(e)}")

    async def get_stock_quote(self, symbol: str, use_cache: bool = True) -> Optional[StockQuote]:
        """
        Get real-time quote with enhanced multi-source routing.

        Args:
            symbol: Stock symbol
            use_cache: Whether to use cached data

        Returns:
            StockQuote object or None if not found
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # Try cache first if enabled
            if use_cache:
                cached_quote = await self.redis_cache.get_cached_quote(symbol)
                if cached_quote:
                    cache_age = (datetime.now() - cached_quote.timestamp).total_seconds()
                    if cache_age < self.cache_ttl["quote"]:
                        return cached_quote

            # Get fresh quote using router
            raw_quote = await self.data_router.get_stock_quote(symbol)

            if not raw_quote:
                logger.warning(f"No quote data returned for {symbol}")
                return None

            # Process quote
            cleaned_quote = self.data_processor.clean_stock_quote(raw_quote)

            # Save to storage
            await self.database_storage.save_stock_quote(cleaned_quote)
            await self.redis_cache.cache_stock_quote(cleaned_quote)

            # Update stats
            self._update_collection_stats(success=True)

            return cleaned_quote

        except Exception as e:
            logger.error(f"Failed to get stock quote for {symbol}: {str(e)}")
            self._update_collection_stats(success=False)
            return None

    async def get_batch_quotes(
        self,
        symbols: List[str],
        segmentation_strategy: str = "by_exchange",
        use_cache: bool = True
    ) -> Dict[str, StockQuote]:
        """
        Get real-time quotes for multiple stocks with segmentation.

        Args:
            symbols: List of stock symbols
            segmentation_strategy: Strategy for segmenting symbols
            use_cache: Whether to use cached data

        Returns:
            Dictionary mapping symbol to StockQuote
        """
        if not self.is_initialized:
            await self.initialize()

        quotes = {}

        try:
            # Update segmentation stats
            if segmentation_strategy in self.collection_stats["segmentation_stats"]:
                stats = self.collection_stats["segmentation_stats"][segmentation_strategy]
                stats["uses"] += 1
                stats["average_batch_size"] = (
                    (stats["average_batch_size"] * (stats["uses"] - 1) + len(symbols)) / stats["uses"]
                )

            # Try cache first if enabled
            if use_cache:
                cached_quotes = await self.redis_cache.get_batch_cached_quotes(symbols)

                # Identify symbols that need fresh data
                fresh_symbols = []
                for symbol in symbols:
                    if symbol in cached_quotes:
                        quote = cached_quotes[symbol]
                        cache_age = (datetime.now() - quote.timestamp).total_seconds()
                        if cache_age < self.cache_ttl["quote"]:
                            quotes[symbol] = quote
                        else:
                            fresh_symbols.append(symbol)
                    else:
                        fresh_symbols.append(symbol)

                symbols = fresh_symbols  # Update symbols to only those needing fresh data

            # Collect fresh data in batches
            if symbols:
                # Split symbols into batches
                batches = []
                for i in range(0, len(symbols), self.batch_size):
                    batch = symbols[i:i + self.batch_size]
                    batches.append(batch)

                # Collect batches with rate limiting
                semaphore = asyncio.Semaphore(self.max_concurrent_requests)

                async def collect_batch(batch_symbols):
                    async with semaphore:
                        try:
                            raw_quotes = await self.data_router.get_batch_quotes(
                                batch_symbols, segmentation_strategy
                            )

                            batch_quotes = {}
                            for symbol, raw_quote in raw_quotes.items():
                                try:
                                    cleaned_quote = self.data_processor.clean_stock_quote(raw_quote)
                                    batch_quotes[symbol] = cleaned_quote

                                    # Save to storage
                                    await self.database_storage.save_stock_quote(cleaned_quote)
                                    await self.redis_cache.cache_stock_quote(cleaned_quote)

                                except Exception as e:
                                    logger.error(f"Failed to process quote for {symbol}: {str(e)}")
                                    continue

                            return batch_quotes

                        except Exception as e:
                            logger.error(f"Batch collection failed: {str(e)}")
                            return {}

                # Collect all batches
                batch_tasks = [collect_batch(batch) for batch in batches]
                batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)

                # Combine results
                for result in batch_results:
                    if isinstance(result, Exception):
                        logger.error(f"Batch task failed: {str(result)}")
                        continue

                    if result:
                        quotes.update(result)

            # Update stats
            successful = len([q for q in quotes.values() if q])
            self._update_collection_stats(success=successful > 0)

            # Update segmentation success rate
            if segmentation_strategy in self.collection_stats["segmentation_stats"]:
                stats = self.collection_stats["segmentation_stats"][segmentation_strategy]
                current_rate = stats["success_rate"]
                new_rate = successful / len(symbols) if symbols else 0.0
                stats["success_rate"] = (current_rate * (stats["uses"] - 1) + new_rate) / stats["uses"]

            return quotes

        except Exception as e:
            logger.error(f"Failed to get batch quotes: {str(e)}")
            self._update_collection_stats(success=False)
            return {}

    async def get_stock_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d",
        use_cache: bool = True
    ) -> List[StockData]:
        """
        Get historical data with multi-source fallback.

        Args:
            symbol: Stock symbol
            start_date: Start date
            end_date: End date
            interval: Data interval
            use_cache: Whether to use cached data

        Returns:
            List of StockData objects
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # Generate cache key
            cache_key = f"history:{symbol}:{interval}:{start_date.date()}:{end_date.date()}"

            # Try cache first if enabled
            if use_cache:
                cached_history = await self.redis_cache.get_cached_history(cache_key)
                if cached_history:
                    # Check cache age
                    if cached_history and len(cached_history) > 0:
                        latest_timestamp = max(h.timestamp for h in cached_history)
                        cache_age = (datetime.now() - latest_timestamp).total_seconds()
                        if cache_age < self.cache_ttl["history"]:
                            return cached_history

            # Try database
            db_history = await self.database_storage.get_stock_history(
                symbol, start_date, end_date, interval
            )

            if db_history:
                # Check if we have enough data
                expected_points = self._calculate_expected_points(start_date, end_date, interval)
                if len(db_history) >= expected_points * 0.8:  # At least 80% coverage
                    # Update cache
                    await self.redis_cache.cache_history(cache_key, db_history)
                    return db_history

            # Collect fresh data using router
            # Note: Router doesn't have direct history method, so we need to implement fallback
            raw_history = []
            sources = self.data_router.data_sources

            for source in sorted(sources, key=lambda x: x.priority):
                try:
                    raw_history = await source.get_stock_history(
                        symbol, start_date, end_date, interval
                    )
                    if raw_history:
                        break
                except Exception as e:
                    logger.warning(f"History collection failed for {source.name}: {str(e)}")
                    continue

            if not raw_history:
                logger.warning(f"No historical data found for {symbol}")
                return db_history or []

            # Process data
            cleaned_history = self.data_processor.clean_stock_data(raw_history)

            # Save to storage
            await self.database_storage.save_stock_history(cleaned_history, interval)
            await self.redis_cache.cache_history(cache_key, cleaned_history)

            # Update stats
            self._update_collection_stats(success=True)

            return cleaned_history

        except Exception as e:
            logger.error(f"Failed to get stock history for {symbol}: {str(e)}")
            self._update_collection_stats(success=False)
            return []

    async def get_market_indices(self, use_cache: bool = True) -> List[Dict[str, Any]]:
        """
        Get major market indices with enhanced data collection.

        Args:
            use_cache: Whether to use cached data

        Returns:
            List of market index dictionaries
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # Try cache first if enabled
            if use_cache:
                cached_indices = await self.redis_cache.get_cached_market_indices()
                if cached_indices:
                    # Check cache age
                    if cached_indices and len(cached_indices) > 0:
                        latest_timestamp = max(
                            datetime.fromisoformat(idx.get("timestamp", "2000-01-01"))
                            for idx in cached_indices
                        )
                        cache_age = (datetime.now() - latest_timestamp).total_seconds()
                        if cache_age < self.cache_ttl["indices"]:
                            return cached_indices

            # Default Chinese market indices
            indices_symbols = [
                ("000001.SH", "上证指数"),
                ("399001.SZ", "深证成指"),
                ("399006.SZ", "创业板指"),
                ("000300.SH", "沪深300"),
                ("000905.SH", "中证500")
            ]

            # Collect index data in parallel
            indices = []
            tasks = []

            for symbol, name in indices_symbols:
                task = self._get_index_data(symbol, name)
                tasks.append(task)

            # Wait for all indices
            index_results = await asyncio.gather(*tasks, return_exceptions=True)

            for result in index_results:
                if isinstance(result, Exception):
                    logger.error(f"Index collection failed: {str(result)}")
                    continue

                if result:
                    indices.append(result)

            # Cache indices
            await self.redis_cache.cache_market_indices(indices)

            return indices

        except Exception as e:
            logger.error(f"Failed to get market indices: {str(e)}")
            return []

    async def _get_index_data(self, symbol: str, name: str) -> Dict[str, Any]:
        """Get data for a single market index."""
        try:
            quote = await self.get_stock_quote(symbol, use_cache=False)

            if quote:
                return {
                    "symbol": symbol,
                    "name": name,
                    "price": quote.price,
                    "change": quote.change,
                    "change_percent": quote.change_percent,
                    "volume": quote.volume,
                    "amount": quote.amount,
                    "timestamp": quote.timestamp.isoformat()
                }
            else:
                # Fallback to basic info
                return {
                    "symbol": symbol,
                    "name": name,
                    "price": 0.0,
                    "change": 0.0,
                    "change_percent": 0.0,
                    "timestamp": datetime.now().isoformat()
                }

        except Exception as e:
            logger.error(f"Failed to get index data for {symbol}: {str(e)}")
            return {
                "symbol": symbol,
                "name": name,
                "price": 0.0,
                "change": 0.0,
                "change_percent": 0.0,
                "timestamp": datetime.now().isoformat()
            }

    async def get_data_quality(
        self,
        symbol: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> DataQualityMetrics:
        """
        Get enhanced data quality metrics.

        Args:
            symbol: Optional stock symbol
            start_date: Optional start date
            end_date: Optional end date

        Returns:
            DataQualityMetrics object
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # Get basic metrics from database
            metrics = await self.database_storage.get_data_quality_metrics(
                symbol, start_date, end_date
            )

            # Get router health metrics
            router_health = self.data_router.get_source_health()
            router_performance = self.data_router.get_performance_metrics()

            # Calculate enhanced metrics
            total_sources = router_performance.get("total_sources", 0)
            active_sources = len(router_performance.get("active_sources", []))

            source_availability = active_sources / total_sources if total_sources > 0 else 0.0
            overall_success_rate = router_performance.get("overall_success_rate", 0.0)

            # Create enhanced DataQualityMetrics
            if symbol:
                symbol_str = symbol
            else:
                symbol_str = "all"

            return DataQualityMetrics(
                symbol=symbol_str,
                completeness=metrics.get("completeness", 0.0),
                accuracy=overall_success_rate * 0.9,  # Adjusted by success rate
                timeliness=metrics.get("timeliness", 0.0),
                consistency=source_availability * 0.95,  # Based on source availability
                total_records=metrics.get("total_records", 0),
                missing_records=metrics.get("missing_records", 0),
                duplicate_records=metrics.get("duplicate_records", 0),
                invalid_records=metrics.get("invalid_prices", 0) + metrics.get("invalid_volumes", 0),
                source_availability=source_availability,
                data_freshness=self._calculate_data_freshness(symbol),
                last_update=datetime.fromisoformat(metrics.get("latest_timestamp")) if metrics.get("latest_timestamp") else datetime.now()
            )

        except Exception as e:
            logger.error(f"Failed to get data quality metrics: {str(e)}")
            return DataQualityMetrics(
                symbol=symbol or "unknown",
                completeness=0.0,
                accuracy=0.0,
                timeliness=0.0,
                consistency=0.0,
                total_records=0,
                missing_records=0,
                duplicate_records=0,
                invalid_records=0,
                source_availability=0.0,
                data_freshness=0.0,
                last_update=datetime.now()
            )

    async def get_monitoring_metrics(self) -> MonitoringMetrics:
        """
        Get enhanced monitoring metrics.

        Returns:
            MonitoringMetrics object
        """
        total = self.collection_stats["total_collections"]
        successful = self.collection_stats["successful_collections"]
        failed = self.collection_stats["failed_collections"]

        success_rate = successful / total if total > 0 else 0.0

        # Get router metrics
        router_performance = self.data_router.get_performance_metrics()
        router_health = self.data_router.get_source_health()

        # Calculate average latency (placeholder - would need actual tracking)
        average_latency = 0.0
        if router_health:
            latencies = [h.get("average_latency", 0.0) for h in router_health.values()]
            if latencies:
                average_latency = sum(latencies) / len(latencies)

        return MonitoringMetrics(
            total_collections=total,
            successful_collections=successful,
            failed_collections=failed,
            success_rate=success_rate,
            average_latency=average_latency,
            last_collection=self.collection_stats["last_collection"],
            active_sources=router_performance.get("active_sources", []),
            data_coverage=self._calculate_data_coverage(),
            segmentation_stats=self.collection_stats["segmentation_stats"],
            router_performance=router_performance
        )

    async def manual_collection(
        self,
        symbols: List[str],
        data_types: List[str] = ["quote", "history"],
        segmentation_strategy: str = "by_exchange"
    ) -> List[CollectionResult]:
        """
        Trigger enhanced manual data collection.

        Args:
            symbols: List of stock symbols
            data_types: Types of data to collect
            segmentation_strategy: Strategy for segmenting symbols

        Returns:
            List of collection results
        """
        if not self.is_initialized:
            await self.initialize()

        results = []

        # Collect in batches
        for i in range(0, len(symbols), self.batch_size):
            batch_symbols = symbols[i:i + self.batch_size]

            try:
                records_collected = 0

                if "quote" in data_types:
                    quotes = await self.get_batch_quotes(
                        batch_symbols, segmentation_strategy, use_cache=False
                    )
                    records_collected += len(quotes)

                if "history" in data_types:
                    # Collect last 30 days of daily data for each symbol
                    end_date = datetime.now()
                    start_date = end_date - timedelta(days=30)

                    history_tasks = []
                    for symbol in batch_symbols:
                        task = self.get_stock_history(
                            symbol, start_date, end_date, "1d", use_cache=False
                        )
                        history_tasks.append(task)

                    # Wait for all history collections
                    history_results = await asyncio.gather(*history_tasks, return_exceptions=True)

                    for result in history_results:
                        if isinstance(result, Exception):
                            continue
                        if result:
                            records_collected += len(result)

                # Create results for this batch
                for symbol in batch_symbols:
                    results.append(CollectionResult(
                        symbol=symbol,
                        data_type=",".join(data_types),
                        success=True,
                        records_collected=records_collected // len(batch_symbols)  # Approximate
                    ))

                # Rate limiting between batches
                await asyncio.sleep(1.0)

            except Exception as e:
                # Mark all symbols in batch as failed
                for symbol in batch_symbols:
                    results.append(CollectionResult(
                        symbol=symbol,
                        data_type=",".join(data_types),
                        success=False,
                        error=str(e)
                    ))

        return results

    async def get_router_health(self) -> Dict[str, Any]:
        """Get router health information."""
        if not self.is_initialized:
            await self.initialize()

        return {
            "source_health": self.data_router.get_source_health(),
            "performance": self.data_router.get_performance_metrics(),
            "strategies": {
                "current": self.data_router.strategy.value,
                "available": [s.value for s in DataSourceStrategy]
            }
        }

    async def rotate_strategy(self) -> Dict[str, Any]:
        """Rotate to next data source strategy."""
        if not self.is_initialized:
            await self.initialize()

        return await self.data_router.rotate_strategy()

    async def reset_source(self, source_name: str) -> Dict[str, Any]:
        """Reset a data source."""
        if not self.is_initialized:
            await self.initialize()

        return await self.data_router.reset_source(source_name)

    def _update_collection_stats(self, success: bool):
        """Update collection statistics."""
        self.collection_stats["total_collections"] += 1
        if success:
            self.collection_stats["successful_collections"] += 1
        else:
            self.collection_stats["failed_collections"] += 1
        self.collection_stats["last_collection"] = datetime.now()

    def _calculate_data_coverage(self) -> Dict[str, float]:
        """Calculate data coverage for default stocks."""
        coverage = {}
        total_stocks = len(settings.DEFAULT_STOCK_SYMBOLS)

        # Simple coverage calculation based on cache
        # In production, this would check actual data availability
        for symbol in settings.DEFAULT_STOCK_SYMBOLS:
            # Placeholder - would need actual data check
            coverage[symbol] = 0.85  # Assume 85% coverage

        return coverage

    def _calculate_data_freshness(self, symbol: Optional[str] = None) -> float:
        """Calculate data freshness score (0-100)."""
        # Placeholder implementation
        # In production, this would check timestamps of latest data
        return 95.0  # Assume 95% freshness

    def _calculate_expected_points(self, start_date: datetime, end_date: datetime, interval: str) -> int:
        """Calculate expected number of data points."""
        if interval == "1d":
            # Exclude weekends
            days = (end_date - start_date).days
            weekdays = days * 5 // 7  # Approximate
            return max(weekdays, 1)
        elif interval == "1w":
            weeks = (end_date - start_date).days // 7
            return max(weeks, 1)
        elif interval == "1M":
            months = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month)
            return max(months, 1)
        else:
            # For intraday intervals
            trading_hours_per_day = 4  # 9:30-11:30, 13:00-15:00
            if interval == "1m":
                points_per_hour = 60
            elif interval == "5m":
                points_per_hour = 12
            elif interval == "15m":
                points_per_hour = 4
            elif interval == "30m":
                points_per_hour = 2
            elif interval == "1h":
                points_per_hour = 1
            else:
                points_per_hour = 1

            days = (end_date - start_date).days
            weekdays = days * 5 // 7  # Approximate
            return weekdays * trading_hours_per_day * points_per_hour

    def is_market_hours(self) -> bool:
        """Check if current time is within market hours."""
        now = datetime.now()
        weekday = now.weekday()

        # Check if weekday (0-4 = Monday-Friday)
        if weekday >= 5:
            return False

        # Check time
        current_time = now.time()

        morning_open = self.market_hours["morning_open"].time()
        morning_close = self.market_hours["morning_close"].time()
        afternoon_open = self.market_hours["afternoon_open"].time()
        afternoon_close = self.market_hours["afternoon_close"].time()

        return (
            (morning_open <= current_time <= morning_close) or
            (afternoon_open <= current_time <= afternoon_close)
        )

    def get_next_collection_time(self) -> datetime:
        """Calculate next optimal collection time."""
        now = datetime.now()

        if self.is_market_hours():
            # During market hours, collect every 10 seconds
            return now + timedelta(seconds=10)
        else:
            # Outside market hours, collect every 5 minutes
            return now + timedelta(minutes=5)