"""
Data source router for load balancing and failover between multiple data sources.
"""

import asyncio
import logging
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum

from .base import DataSource, DataSourceError, RateLimitError
from .sina import SinaCollector
from .tencent import TencentCollector
from .eastmoney import EastMoneyCollector
from .akshare import AkShareCollector
from .baostock import BaostockCollector
from .tushare import TushareCollector

from ..core.config import settings

logger = logging.getLogger(__name__)


class DataSourceStrategy(Enum):
    """Data source selection strategies."""
    PRIORITY = "priority"  # Use highest priority source
    ROUND_ROBIN = "round_robin"  # Rotate between sources
    LOAD_BALANCED = "load_balanced"  # Distribute based on load
    ADAPTIVE = "adaptive"  # Adapt based on performance


@dataclass
class DataSourceMetrics:
    """Metrics for a data source."""
    name: str
    priority: int
    request_count: int = 0
    success_count: int = 0
    error_count: int = 0
    total_latency: float = 0.0
    last_request_time: Optional[datetime] = None
    last_error_time: Optional[datetime] = None
    consecutive_errors: int = 0
    rate_limit_hits: int = 0
    is_active: bool = True

    @property
    def success_rate(self) -> float:
        """Calculate success rate."""
        total = self.request_count
        return self.success_count / total if total > 0 else 0.0

    @property
    def average_latency(self) -> float:
        """Calculate average latency."""
        return self.total_latency / self.request_count if self.request_count > 0 else 0.0

    @property
    def error_rate(self) -> float:
        """Calculate error rate."""
        total = self.request_count
        return self.error_count / total if total > 0 else 0.0

    @property
    def health_score(self) -> float:
        """Calculate health score (0-100)."""
        if not self.is_active:
            return 0.0

        # Base score from success rate
        score = self.success_rate * 70

        # Penalty for recent errors
        if self.consecutive_errors > 0:
            score -= min(self.consecutive_errors * 10, 30)

        # Penalty for rate limit hits
        if self.rate_limit_hits > 0:
            score -= min(self.rate_limit_hits * 5, 20)

        # Bonus for low latency
        if self.average_latency < 0.5:  # Less than 500ms
            score += 10
        elif self.average_latency > 2.0:  # More than 2 seconds
            score -= 10

        return max(0.0, min(100.0, score))


class DataSourceRouter:
    """Router for managing multiple data sources with load balancing and failover."""

    def __init__(self, strategy: DataSourceStrategy = DataSourceStrategy.ADAPTIVE):
        self.strategy = strategy
        self.data_sources: List[DataSource] = []
        self.metrics: Dict[str, DataSourceMetrics] = {}
        self.current_index = 0
        self.last_rotation = datetime.now()
        self.rotation_interval = timedelta(minutes=5)  # Rotate every 5 minutes
        self.min_request_interval = 0.1  # 100ms minimum between requests

        # Configuration for each data source
        self.source_configs = {
            "sina": {
                "min_interval": 0.1,  # 100ms
                "max_requests_per_minute": 600,
                "batch_size": 100,
                "weight": 1.0,
                "enabled": True
            },
            "tencent": {
                "min_interval": 0.05,  # 50ms
                "max_requests_per_minute": 1200,
                "batch_size": 150,
                "weight": 0.8,
                "enabled": True
            },
            "eastmoney": {
                "min_interval": 0.2,  # 200ms
                "max_requests_per_minute": 300,
                "batch_size": 50,
                "weight": 0.6,
                "enabled": True
            },
            "akshare": {
                "min_interval": 0.05,  # 50ms - fastest for real-time data
                "max_requests_per_minute": 500,  # Conservative limit
                "batch_size": 200,  # Larger batch size
                "weight": 1.5,  # Higher weight for real-time data
                "enabled": settings.AKSHARE_ENABLED
            },
            "baostock": {
                "min_interval": 0.15,  # 150ms - historical data doesn't need to be as fast
                "max_requests_per_minute": 300,  # Baostock has no strict limits but be respectful
                "batch_size": 100,
                "weight": 1.2,  # Good weight for historical data
                "enabled": settings.BAOSTOCK_ENABLED
            },
            "tushare": {
                "min_interval": 0.5,  # 500ms - Tushare has rate limits for free tier
                "max_requests_per_minute": 200,  # Free tier limits
                "batch_size": 50,  # Smaller batches due to rate limits
                "weight": 1.8,  # Highest weight for data quality
                "enabled": bool(settings.TUSHARE_TOKEN and settings.TUSHARE_TOKEN != "your-tushare-token-here")
            }
        }

        # Stock segmentation strategies
        self.segmentation_strategies = {
            "by_exchange": self._segment_by_exchange,
            "by_first_letter": self._segment_by_first_letter,
            "by_market_cap": self._segment_by_market_cap,
            "round_robin": self._segment_round_robin
        }

    async def initialize(self):
        """Initialize data sources and metrics."""
        try:
            # Create data sources based on enabled configuration
            data_sources_to_create = []

            # Define source mapping
            source_mapping = {
                "sina": SinaCollector,
                "tencent": TencentCollector,
                "eastmoney": EastMoneyCollector,
                "akshare": AkShareCollector,
                "baostock": BaostockCollector,
                "tushare": TushareCollector
            }

            # Check each source and create if enabled
            for source_name, collector_class in source_mapping.items():
                if source_name in self.source_configs:
                    config = self.source_configs[source_name]
                    if config.get("enabled", True):
                        try:
                            collector = collector_class()
                            data_sources_to_create.append((source_name, collector))
                            logger.debug(f"Added data source: {source_name}")
                        except Exception as e:
                            logger.warning(f"Failed to create data source {source_name}: {str(e)}")
                    else:
                        logger.debug(f"Data source {source_name} is disabled")
                else:
                    logger.warning(f"No configuration found for data source: {source_name}")

            # Create data sources
            self.data_sources = [collector for _, collector in data_sources_to_create]

            # Initialize metrics for each source
            for source_name, collector in data_sources_to_create:
                self.metrics[collector.name] = DataSourceMetrics(
                    name=collector.name,
                    priority=collector.priority
                )

                # Initialize source
                try:
                    await collector.__aenter__()
                    logger.debug(f"Successfully initialized data source: {collector.name}")
                except Exception as e:
                    logger.error(f"Failed to initialize data source {collector.name}: {str(e)}")
                    # Mark as inactive
                    self.metrics[collector.name].is_active = False

            active_sources = [s for s in self.data_sources if self.metrics[s.name].is_active]
            logger.info(f"DataSourceRouter initialized with {len(active_sources)} active sources out of {len(self.data_sources)} total")

        except Exception as e:
            logger.error(f"Failed to initialize DataSourceRouter: {str(e)}")
            raise

    async def close(self):
        """Close all data sources."""
        for source in self.data_sources:
            try:
                await source.close()
            except Exception as e:
                logger.error(f"Failed to close data source {source.name}: {str(e)}")

        logger.info("DataSourceRouter closed")

    def _select_source_by_strategy(self, symbol: Optional[str] = None) -> DataSource:
        """Select data source based on strategy."""
        available_sources = [s for s in self.data_sources if self.metrics[s.name].is_active]

        if not available_sources:
            raise DataSourceError("No active data sources available")

        if self.strategy == DataSourceStrategy.PRIORITY:
            # Select highest priority source
            return min(available_sources, key=lambda x: x.priority)

        elif self.strategy == DataSourceStrategy.ROUND_ROBIN:
            # Rotate between sources
            self.current_index = (self.current_index + 1) % len(available_sources)
            return available_sources[self.current_index]

        elif self.strategy == DataSourceStrategy.LOAD_BALANCED:
            # Distribute based on request count
            return min(available_sources, key=lambda x: self.metrics[x.name].request_count)

        elif self.strategy == DataSourceStrategy.ADAPTIVE:
            # Adaptive selection based on health score
            scored_sources = []
            for source in available_sources:
                metrics = self.metrics[source.name]
                score = metrics.health_score

                # Adjust score based on priority
                adjusted_score = score * (1.0 / source.priority)

                scored_sources.append((adjusted_score, source))

            # Select source with highest adjusted score
            return max(scored_sources, key=lambda x: x[0])[1]

        else:
            # Default to priority
            return min(available_sources, key=lambda x: x.priority)

    async def _update_metrics(self, source_name: str, success: bool, latency: float,
                            is_rate_limit: bool = False):
        """Update metrics for a data source."""
        metrics = self.metrics[source_name]
        metrics.request_count += 1
        metrics.total_latency += latency
        metrics.last_request_time = datetime.now()

        if success:
            metrics.success_count += 1
            metrics.consecutive_errors = 0
        else:
            metrics.error_count += 1
            metrics.consecutive_errors += 1
            metrics.last_error_time = datetime.now()

            # Deactivate source if too many consecutive errors
            if metrics.consecutive_errors >= 10:
                metrics.is_active = False
                logger.warning(f"Deactivated data source {source_name} due to {metrics.consecutive_errors} consecutive errors")

        if is_rate_limit:
            metrics.rate_limit_hits += 1

        # Reactivate source if it's been inactive for a while
        if not metrics.is_active and metrics.last_error_time:
            time_since_error = datetime.now() - metrics.last_error_time
            if time_since_error > timedelta(minutes=5):
                metrics.is_active = True
                metrics.consecutive_errors = 0
                logger.info(f"Reactivated data source {source_name}")

    async def get_stock_quote(self, symbol: str, max_retries: int = 3) -> Dict[str, Any]:
        """
        Get real-time quote with failover between sources.

        Args:
            symbol: Stock symbol
            max_retries: Maximum number of retries with different sources

        Returns:
            Dictionary with quote data
        """
        start_time = datetime.now()

        for attempt in range(max_retries):
            try:
                # Select source based on strategy
                source = self._select_source_by_strategy(symbol)

                # Check rate limiting
                await self._check_rate_limit(source.name)

                # Make request
                quote = await source.get_stock_quote(symbol)

                # Update metrics
                latency = (datetime.now() - start_time).total_seconds()
                await self._update_metrics(source.name, success=True, latency=latency)

                return quote

            except RateLimitError as e:
                logger.warning(f"Rate limit hit for {source.name}: {str(e)}")
                latency = (datetime.now() - start_time).total_seconds()
                await self._update_metrics(source.name, success=False, latency=latency, is_rate_limit=True)

                # Try next source
                continue

            except DataSourceError as e:
                logger.warning(f"Data source {source.name} failed: {str(e)}")
                latency = (datetime.now() - start_time).total_seconds()
                await self._update_metrics(source.name, success=False, latency=latency)

                # Try next source
                continue

        # All retries failed
        raise DataSourceError(f"Failed to get quote for {symbol} after {max_retries} attempts")

    async def get_batch_quotes(self, symbols: List[str], segmentation_strategy: str = "by_exchange") -> Dict[str, Dict[str, Any]]:
        """
        Get real-time quotes for multiple stocks with segmentation.

        Args:
            symbols: List of stock symbols
            segmentation_strategy: Strategy for segmenting symbols

        Returns:
            Dictionary mapping symbol to quote data
        """
        if not symbols:
            return {}

        # Segment symbols for distributed collection
        segments = self._segment_symbols(symbols, segmentation_strategy)

        all_quotes = {}

        # Collect from each segment in parallel
        tasks = []
        for segment_idx, segment_symbols in enumerate(segments):
            task = self._collect_segment_quotes(segment_symbols, segment_idx)
            tasks.append(task)

        # Wait for all segments to complete
        segment_results = await asyncio.gather(*tasks, return_exceptions=True)

        # Combine results
        for result in segment_results:
            if isinstance(result, Exception):
                logger.error(f"Segment collection failed: {str(result)}")
                continue

            if result:
                all_quotes.update(result)

        return all_quotes

    async def _collect_segment_quotes(self, symbols: List[str], segment_idx: int) -> Dict[str, Dict[str, Any]]:
        """Collect quotes for a segment of symbols."""
        if not symbols:
            return {}

        # Select source for this segment
        source = self._select_source_by_strategy()

        try:
            # Check rate limiting
            await self._check_rate_limit(source.name)

            # Get batch quotes
            quotes = await source.get_batch_quotes(symbols)

            # Update metrics
            self.metrics[source.name].request_count += 1
            self.metrics[source.name].success_count += 1

            return quotes

        except Exception as e:
            logger.error(f"Failed to collect segment {segment_idx} from {source.name}: {str(e)}")
            self.metrics[source.name].error_count += 1
            return {}

    def _segment_symbols(self, symbols: List[str], strategy: str) -> List[List[str]]:
        """
        Segment symbols for distributed collection.

        Args:
            symbols: List of stock symbols
            strategy: Segmentation strategy

        Returns:
            List of symbol segments
        """
        if strategy not in self.segmentation_strategies:
            strategy = "round_robin"

        segment_func = self.segmentation_strategies[strategy]
        return segment_func(symbols)

    def _segment_by_exchange(self, symbols: List[str]) -> List[List[str]]:
        """Segment symbols by exchange."""
        sh_symbols = [s for s in symbols if s.endswith(".SH") or (not s.endswith(".SZ") and s.startswith("6"))]
        sz_symbols = [s for s in symbols if s.endswith(".SZ") or (not s.endswith(".SH") and not s.startswith("6"))]

        segments = []
        if sh_symbols:
            segments.append(sh_symbols)
        if sz_symbols:
            segments.append(sz_symbols)

        return segments

    def _segment_by_first_letter(self, symbols: List[str]) -> List[List[str]]:
        """Segment symbols by first letter of code."""
        segments_dict = {}

        for symbol in symbols:
            # Extract code part
            if "." in symbol:
                code = symbol.split(".")[0]
            else:
                code = symbol

            first_letter = code[0] if code else "0"

            if first_letter not in segments_dict:
                segments_dict[first_letter] = []

            segments_dict[first_letter].append(symbol)

        # Convert to list of segments
        segments = list(segments_dict.values())

        # Limit segment size
        max_segment_size = 50
        final_segments = []

        for segment in segments:
            if len(segment) <= max_segment_size:
                final_segments.append(segment)
            else:
                # Split large segments
                for i in range(0, len(segment), max_segment_size):
                    final_segments.append(segment[i:i + max_segment_size])

        return final_segments

    def _segment_by_market_cap(self, symbols: List[str]) -> List[List[str]]:
        """Segment symbols by market cap (placeholder - would need actual data)."""
        # For now, just do round robin
        return self._segment_round_robin(symbols)

    def _segment_round_robin(self, symbols: List[str]) -> List[List[str]]:
        """Segment symbols using round robin."""
        num_segments = min(len(self.data_sources), 3)  # Max 3 segments
        segments = [[] for _ in range(num_segments)]

        for i, symbol in enumerate(symbols):
            segment_idx = i % num_segments
            segments[segment_idx].append(symbol)

        return segments

    async def _check_rate_limit(self, source_name: str):
        """Check and enforce rate limiting for a data source."""
        config = self.source_configs.get(source_name, {})
        min_interval = config.get("min_interval", self.min_request_interval)

        metrics = self.metrics[source_name]

        if metrics.last_request_time:
            elapsed = (datetime.now() - metrics.last_request_time).total_seconds()
            if elapsed < min_interval:
                wait_time = min_interval - elapsed
                await asyncio.sleep(wait_time)

    def get_source_health(self, source_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Get health status of data sources.

        Args:
            source_name: Optional specific source name

        Returns:
            Dictionary with health information
        """
        if source_name:
            if source_name not in self.metrics:
                return {"error": f"Unknown data source: {source_name}"}

            metrics = self.metrics[source_name]
            return {
                "name": metrics.name,
                "is_active": metrics.is_active,
                "health_score": metrics.health_score,
                "success_rate": metrics.success_rate,
                "error_rate": metrics.error_rate,
                "average_latency": metrics.average_latency,
                "request_count": metrics.request_count,
                "consecutive_errors": metrics.consecutive_errors,
                "rate_limit_hits": metrics.rate_limit_hits,
                "last_request": metrics.last_request_time.isoformat() if metrics.last_request_time else None,
                "last_error": metrics.last_error_time.isoformat() if metrics.last_error_time else None
            }

        # Return all sources
        health_info = {}
        for name, metrics in self.metrics.items():
            health_info[name] = {
                "is_active": metrics.is_active,
                "health_score": metrics.health_score,
                "success_rate": metrics.success_rate,
                "request_count": metrics.request_count,
                "error_count": metrics.error_count,
                "consecutive_errors": metrics.consecutive_errors
            }

        return health_info

    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get overall performance metrics."""
        total_requests = sum(m.request_count for m in self.metrics.values())
        total_success = sum(m.success_count for m in self.metrics.values())
        total_errors = sum(m.error_count for m in self.metrics.values())

        active_sources = [name for name, m in self.metrics.items() if m.is_active]

        return {
            "total_requests": total_requests,
            "total_success": total_success,
            "total_errors": total_errors,
            "overall_success_rate": total_success / total_requests if total_requests > 0 else 0.0,
            "active_sources": active_sources,
            "total_sources": len(self.data_sources),
            "current_strategy": self.strategy.value,
            "segmentation_strategies": list(self.segmentation_strategies.keys())
        }

    async def rotate_strategy(self):
        """Rotate to next strategy (for testing and optimization)."""
        strategies = list(DataSourceStrategy)
        current_idx = strategies.index(self.strategy)
        next_idx = (current_idx + 1) % len(strategies)

        self.strategy = strategies[next_idx]
        logger.info(f"Rotated data source strategy to: {self.strategy.value}")

        return {"new_strategy": self.strategy.value}

    async def reset_source(self, source_name: str):
        """Reset a data source (clear errors and reactivate)."""
        if source_name not in self.metrics:
            return {"error": f"Unknown data source: {source_name}"}

        metrics = self.metrics[source_name]
        metrics.consecutive_errors = 0
        metrics.is_active = True
        metrics.last_error_time = None

        logger.info(f"Reset data source: {source_name}")

        return {"success": True, "source": source_name, "is_active": True}