"""
Data source router for load balancing and failover between multiple data sources.
"""

import asyncio
import logging
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple, Set
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
from ..utils.data_quality import (
    get_fallback_strategy,
    DataQualityLevel,
    AnomalyType
)

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
        self.last_weight_update = datetime.now()
        self.weight_update_interval = timedelta(minutes=2)  # 权重每2分钟更新一次

        # 并发配置
        self.max_concurrent_sources = 3  # 最大并发数据源数量
        self.max_batch_size = 100  # 单次批量请求最大股票数量
        self.batch_chunk_size = 50  # 超大批量请求的分块大小

        # 基础配置 for each data source（初始权重，后续动态调整）
        self.source_configs = {
            "sina": {
                "min_interval": 0.1,  # 100ms
                "max_requests_per_minute": 600,
                "batch_size": 100,
                "base_weight": 1.0,
                "current_weight": 1.0,
                "enabled": True
            },
            "tencent": {
                "min_interval": 0.05,  # 50ms
                "max_requests_per_minute": 1200,
                "batch_size": 150,
                "base_weight": 0.8,
                "current_weight": 0.8,
                "enabled": True
            },
            "eastmoney": {
                "min_interval": 0.2,  # 200ms
                "max_requests_per_minute": 300,
                "batch_size": 50,
                "base_weight": 0.6,
                "current_weight": 0.6,
                "enabled": True
            },
            "akshare": {
                "min_interval": 0.05,  # 50ms - fastest for real-time data
                "max_requests_per_minute": 500,  # Conservative limit
                "batch_size": 200,  # Larger batch size
                "base_weight": 1.2,  # 降低初始权重，避免免费API限制
                "current_weight": 1.2,
                "enabled": settings.AKSHARE_ENABLED
            },
            "baostock": {
                "min_interval": 0.15,  # 150ms - historical data doesn't need to be as fast
                "max_requests_per_minute": 300,  # Baostock has no strict limits but be respectful
                "batch_size": 100,
                "base_weight": 1.2,  # Good weight for historical data
                "current_weight": 1.2,
                "enabled": settings.BAOSTOCK_ENABLED
            },
            "tushare": {
                "min_interval": 0.5,  # 500ms - Tushare has rate limits for free tier
                "max_requests_per_minute": 200,  # Free tier limits
                "batch_size": 50,  # Smaller batches due to rate limits
                "base_weight": 1.2,  # 降低初始权重，考虑免费API限制
                "current_weight": 1.2,
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

    def _get_sorted_sources(self) -> List[DataSource]:
        """Get all active sources sorted by weight and health score."""
        available_sources = [s for s in self.data_sources if self.metrics[s.name].is_active]

        if not available_sources:
            return []

        # Update dynamic weights
        self._update_dynamic_weights()

        # Sort by weight (highest first)
        def get_source_weight(source):
            config = self.source_configs.get(source.name, {})
            return config.get('current_weight', 0)

        return sorted(available_sources, key=get_source_weight, reverse=True)

    def _select_source_by_strategy(self, symbol: Optional[str] = None) -> DataSource:
        """Select data source based on strategy."""
        available_sources = [s for s in self.data_sources if self.metrics[s.name].is_active]

        if not available_sources:
            raise DataSourceError("No active data sources available")

        # 更新动态权重
        self._update_dynamic_weights()

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
            # Adaptive selection based on dynamic weights and health score
            weighted_sources = self._get_weighted_sources()

            # 在加权列表中随机选择（偏向高权重）
            total_weight = sum(w for _, w in weighted_sources)
            if total_weight == 0:
                return available_sources[0]

            # 使用加权随机选择
            r = random.uniform(0, total_weight)
            cumulative = 0
            for source, weight in weighted_sources:
                cumulative += weight
                if r <= cumulative:
                    return source

            return weighted_sources[0][0]

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
        """Collect quotes for a segment of symbols with failover."""
        if not symbols:
            return {}

        # Get all available sources sorted by weight/health
        available_sources = self._get_sorted_sources()
        logger.debug(f"Available sources: {len(available_sources)}, names: {[s.name for s in available_sources]}")
        if not available_sources:
            logger.error(f"No active data sources available for segment {segment_idx}")
            return {}

        # Try each source until success
        for source in available_sources:
            logger.info(f"DEBUG: Trying source {source.name} for segment {segment_idx}")
            try:
                # Check rate limiting
                await self._check_rate_limit(source.name)

                # Get batch quotes
                quotes = await source.get_batch_quotes(symbols)

                # Check if result is valid (not empty)
                if not quotes or len(quotes) == 0:
                    logger.warning(f"Source {source.name} returned empty result for segment {segment_idx}, trying next source")
                    self.metrics[source.name].error_count += 1
                    self.metrics[source.name].consecutive_errors += 1
                    continue

                # Update metrics
                self.metrics[source.name].request_count += 1
                self.metrics[source.name].success_count += 1
                self.metrics[source.name].consecutive_errors = 0

                logger.info(f"DEBUG: Source {source.name} succeeded for segment {segment_idx}, got {len(quotes)} quotes")
                return quotes

            except Exception as e:
                logger.warning(f"Source {source.name} failed for segment {segment_idx}: {str(e)}")
                self.metrics[source.name].error_count += 1
                self.metrics[source.name].consecutive_errors += 1

                # Mark source as inactive if too many errors
                if self.metrics[source.name].consecutive_errors >= 5:
                    self.metrics[source.name].is_active = False
                    logger.warning(f"Deactivated source {source.name} due to consecutive errors")

                # Continue to next source
                continue

        # All sources failed
        logger.error(f"All data sources failed for segment {segment_idx} with symbols {symbols}")
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

    # ============ 动态权重调整 ============

    def _update_dynamic_weights(self):
        """
        动态更新数据源权重

        根据以下因素动态计算权重：
        1. 成功率 - 成功率越高，权重越高
        2. 平均延迟 - 延迟越低，权重越高
        3. 速率限制命中 - 限制越多，权重越低
        4. 连续错误 - 错误越多，权重越低
        """
        now = datetime.now()
        # 检查是否需要更新权重
        if (now - self.last_weight_update) < self.weight_update_interval:
            return

        self.last_weight_update = now
        weight_changes = []

        for source_name, config in self.source_configs.items():
            if not config.get("enabled", True):
                continue

            if source_name not in self.metrics:
                continue

            metrics = self.metrics[source_name]
            base_weight = config.get("base_weight", 1.0)

            # 如果请求次数太少，保持基础权重
            if metrics.request_count < 5:
                config["current_weight"] = base_weight
                continue

            # 计算动态权重
            weight_factor = 1.0

            # 1. 成功率影响 (权重: 40%)
            # 成功率 >= 90%: 1.0x
            # 成功率 >= 80%: 0.9x
            # 成功率 >= 70%: 0.7x
            # 成功率 < 70%: 0.5x
            if metrics.success_rate >= 0.9:
                success_factor = 1.0
            elif metrics.success_rate >= 0.8:
                success_factor = 0.9
            elif metrics.success_rate >= 0.7:
                success_factor = 0.7
            else:
                success_factor = 0.5
            weight_factor *= success_factor

            # 2. 平均延迟影响 (权重: 25%)
            # 延迟 < 200ms: 1.1x
            # 延迟 < 500ms: 1.0x
            # 延迟 < 1000ms: 0.8x
            # 延迟 >= 1000ms: 0.5x
            if metrics.average_latency < 0.2:
                latency_factor = 1.1
            elif metrics.average_latency < 0.5:
                latency_factor = 1.0
            elif metrics.average_latency < 1.0:
                latency_factor = 0.8
            else:
                latency_factor = 0.5
            weight_factor *= latency_factor

            # 3. 速率限制命中影响 (权重: 20%)
            # 每命中一次降低10%，最多降低50%
            rate_limit_penalty = min(metrics.rate_limit_hits * 0.1, 0.5)
            rate_limit_factor = 1.0 - rate_limit_penalty
            weight_factor *= rate_limit_factor

            # 4. 连续错误影响 (权重: 15%)
            # 每次连续错误降低5%，最多降低30%
            consecutive_error_penalty = min(metrics.consecutive_errors * 0.05, 0.3)
            consecutive_error_factor = 1.0 - consecutive_error_penalty
            weight_factor *= consecutive_error_factor

            # 计算最终权重（不小于基础权重的30%）
            new_weight = max(base_weight * weight_factor, base_weight * 0.3)

            # 限制最大权重为基础权量的1.5倍
            new_weight = min(new_weight, base_weight * 1.5)

            old_weight = config.get("current_weight", base_weight)
            config["current_weight"] = new_weight

            # 记录权重变化（变化超过10%才记录）
            if abs(new_weight - old_weight) > old_weight * 0.1:
                weight_changes.append({
                    "source": source_name,
                    "old_weight": old_weight,
                    "new_weight": new_weight,
                    "change_percent": ((new_weight - old_weight) / old_weight) * 100,
                    "metrics": {
                        "success_rate": metrics.success_rate,
                        "avg_latency": metrics.average_latency,
                        "rate_limit_hits": metrics.rate_limit_hits,
                        "consecutive_errors": metrics.consecutive_errors
                    }
                })

        if weight_changes:
            logger.info(f"数据源权重已更新: {weight_changes}")

    def _get_source_weight(self, source_name: str) -> float:
        """获取数据源的当前权重"""
        config = self.source_configs.get(source_name, {})
        return config.get("current_weight", config.get("base_weight", 1.0))

    def _get_weighted_sources(self) -> List[Tuple[DataSource, float]]:
        """
        获取按权重排序的数据源列表

        Returns:
            [(数据源, 权重), ...] 按权重降序排列
        """
        weighted_sources = []
        for source in self.data_sources:
            weight = self._get_source_weight(source.name)
            weighted_sources.append((source, weight))

        # 按权重降序排列
        weighted_sources.sort(key=lambda x: x[1], reverse=True)
        return weighted_sources

    def get_weight_info(self) -> Dict[str, Any]:
        """
        获取各数据源的权重信息

        Returns:
            包含权重详情的字典
        """
        weight_info = {}
        for source_name, config in self.source_configs.items():
            if source_name not in self.metrics:
                continue

            metrics = self.metrics[source_name]
            weight_info[source_name] = {
                "base_weight": config.get("base_weight", 1.0),
                "current_weight": config.get("current_weight", 1.0),
                "weight_change_pct": (
                    (config.get("current_weight", 1.0) / config.get("base_weight", 1.0) - 1) * 100
                ),
                "metrics": {
                    "success_rate": metrics.success_rate,
                    "average_latency": metrics.average_latency,
                    "request_count": metrics.request_count,
                    "rate_limit_hits": metrics.rate_limit_hits,
                    "consecutive_errors": metrics.consecutive_errors
                }
            }

        return weight_info

    async def _process_large_batch(
        self,
        symbols: List[str],
        historical_data: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        segmentation_strategy: str = "by_exchange"
    ) -> Dict[str, Dict[str, Any]]:
        """
        处理大批量请求，使用分块并行处理

        Args:
            symbols: 股票代码列表
            historical_data: 历史数据
            segmentation_strategy: 分段策略

        Returns:
            按股票代码分组的结果
        """
        all_results = {}

        # 将符号列表分成多个块
        chunks = []
        for i in range(0, len(symbols), self.batch_chunk_size):
            chunk = symbols[i:i + self.batch_chunk_size]
            chunks.append(chunk)

        logger.info(f"将 {len(symbols)} 个请求分成 {len(chunks)} 个块处理")

        # 并发处理各块（限制并发数）
        semaphore = asyncio.Semaphore(self.max_concurrent_sources)

        async def process_chunk(chunk: List[str]) -> Dict[str, Dict[str, Any]]:
            async with semaphore:
                return await self.get_batch_quotes_with_fallback(
                    chunk, historical_data, segmentation_strategy
                )

        # 并发获取所有块的结果
        tasks = [process_chunk(chunk) for chunk in chunks]
        chunk_results = await asyncio.gather(*tasks, return_exceptions=True)

        # 合并结果
        for i, result in enumerate(chunk_results):
            if isinstance(result, Exception):
                logger.error(f"块 {i} 处理失败: {str(result)}")
                # 为该块生成备份数据
                chunk = chunks[i]
                fallback_strategy = get_fallback_strategy()
                chunk_results[i] = self._generate_all_fallback(chunk, historical_data, fallback_strategy)
            elif result:
                all_results.update(result)

        return all_results

    def _generate_all_fallback(
        self,
        symbols: List[str],
        historical_data: Optional[Dict[str, List[Dict[str, Any]]]],
        fallback_strategy: "DataFallbackStrategy"
    ) -> Dict[str, Dict[str, Any]]:
        """
        为所有股票生成备份数据

        Args:
            symbols: 股票代码列表
            historical_data: 历史数据
            fallback_strategy: 降级策略实例

        Returns:
            按股票代码分组的备份数据
        """
        results = {}
        for symbol in symbols:
            fallback_data = fallback_strategy.generate_fallback_data(
                symbol,
                historical_data.get(symbol) if historical_data else None
            )
            results[symbol] = {
                "quote": fallback_data,
                "quality": None,
                "source": "fallback",
                "warnings": ["所有数据源失败"],
                "fallback_used": True
            }
        return results

    # ============ 数据降级策略方法 ============

    async def get_stock_quote_with_fallback(
        self,
        symbol: str,
        historical_data: Optional[List[Dict[str, Any]]] = None,
        max_sources: int = 3
    ) -> Dict[str, Any]:
        """
        获取股票报价并应用数据降级策略

        Args:
            symbol: 股票代码
            historical_data: 历史数据
            max_sources: 最大尝试的数据源数量

        Returns:
            {
                "quote": 报价数据,
                "quality": 质量评分结果,
                "source": 数据源,
                "warnings": 警告列表,
                "fallback_used": 是否使用了降级策略,
                "all_sources": 所有尝试的数据源结果,
                "anomalies": 检测到的异常列表
            }
        """
        start_time = datetime.now()
        quotes_by_source = {}
        source_errors = {}

        # 收集多个数据源的数据
        active_sources = [s for s in self.data_sources if self.metrics[s.name].is_active]
        sources_to_try = active_sources[:max_sources]

        logger.debug(f"尝试从 {len(sources_to_try)} 个数据源获取 {symbol} 的数据")

        for source in sources_to_try:
            try:
                # 检查速率限制
                await self._check_rate_limit(source.name)

                # 获取数据
                quote = await source.get_stock_quote(symbol)
                quotes_by_source[source.name] = quote

                # 更新指标
                latency = (datetime.now() - start_time).total_seconds()
                await self._update_metrics(source.name, success=True, latency=latency)

                logger.debug(f"从 {source.name} 获取 {symbol} 数据成功")

            except RateLimitError as e:
                logger.warning(f"数据源 {source.name} 达到速率限制: {str(e)}")
                source_errors[source.name] = {"type": "rate_limit", "message": str(e)}
                latency = (datetime.now() - start_time).total_seconds()
                await self._update_metrics(source.name, success=False, latency=latency, is_rate_limit=True)

            except DataSourceError as e:
                logger.warning(f"数据源 {source.name} 获取数据失败: {str(e)}")
                source_errors[source.name] = {"type": "error", "message": str(e)}
                latency = (datetime.now() - start_time).total_seconds()
                await self._update_metrics(source.name, success=False, latency=latency)

        # 如果没有获取到任何数据
        if not quotes_by_source:
            logger.error(f"所有数据源都失败，无法获取 {symbol} 的数据")
            fallback_strategy = get_fallback_strategy()
            fallback_data = fallback_strategy.generate_fallback_data(symbol, historical_data)

            return {
                "quote": fallback_data,
                "quality": None,
                "source": "fallback",
                "warnings": [f"所有数据源失败: {source_errors}"],
                "fallback_used": True,
                "all_sources": [],
                "source_errors": source_errors,
                "anomalies": [AnomalyType.CALCULATION_ERROR.value]
            }

        # 应用数据降级策略
        fallback_strategy = get_fallback_strategy()
        result = fallback_strategy.evaluate_and_fallback(quotes_by_source, {symbol: historical_data} if historical_data else None)

        # 记录质量信息和异常
        if result["quality"]:
            quality = result["quality"]

            # 添加异常信息到结果
            result["anomalies"] = quality.anomalies
            result["anomaly_details"] = quality.anomaly_details

            if quality.has_anomalies:
                logger.info(
                    f"[异常汇总] {symbol} 检测到 {len(quality.anomalies)} 个异常: "
                    f"{', '.join(quality.anomalies)}"
                )

            if quality.level == DataQualityLevel.POOR:
                logger.warning(
                    f"[{symbol}] 选择低质量数据: {result['source']} "
                    f"(得分: {quality.score:.2f}, "
                    f"所有源得分: {[q['score'] for q in result.get('all_scores', [])]})"
                )
            elif quality.level == DataQualityLevel.INVALID:
                logger.error(
                    f"[{symbol}] 所选数据质量无效: {result['source']} "
                    f"(得分: {quality.score:.2f})"
                )

        result["source_errors"] = source_errors

        return result

    async def get_batch_quotes_with_fallback(
        self,
        symbols: List[str],
        historical_data: Optional[Dict[str, List[Dict[str, Any]]] ] = None,
        segmentation_strategy: str = "by_exchange"
    ) -> Dict[str, Dict[str, Any]]:
        """
        批量获取股票报价并应用数据降级策略

        Args:
            symbols: 股票代码列表
            historical_data: 按股票代码分组的历史数据
            segmentation_strategy: 分段策略

        Returns:
            按股票代码分组的结果
        """
        if not symbols:
            return {}

        # 更新动态权重
        self._update_dynamic_weights()

        # 如果批量请求过大，分块处理
        if len(symbols) > self.max_batch_size:
            logger.info(f"批量请求 {len(symbols)} 只股票超过最大值 {self.max_batch_size}，分块处理")
            return await self._process_large_batch(symbols, historical_data, segmentation_strategy)

        # 收集所有数据源的数据
        all_quotes_by_source = {}

        # 使用多个数据源获取数据（按权重排序，使用前N个）
        weighted_sources = self._get_weighted_sources()
        sources_to_try = [s for s, _ in weighted_sources[:self.max_concurrent_sources]
                          if self.metrics[s.name].is_active]

        if not sources_to_try:
            # 没有可用数据源，返回备份数据
            fallback_strategy = get_fallback_strategy()
            return self._generate_all_fallback(symbols, historical_data, fallback_strategy)

        tasks = []
        for source in sources_to_try:
            task = self._collect_batch_for_source(source, symbols)
            tasks.append((source.name, task))

        # 并发获取（使用返回异常模式，避免单个失败影响整体）
        results = await asyncio.gather(*[task for _, task in tasks], return_exceptions=True)

        for (source_name, _), result in zip(tasks, results):
            if isinstance(result, Exception):
                logger.error(f"数据源 {source_name} 批量获取失败: {str(result)}")
                all_quotes_by_source[source_name] = {}
            elif result:
                all_quotes_by_source[source_name] = result

        # 应用降级策略
        fallback_strategy = get_fallback_strategy()

        # 重组数据格式: {source: {symbol: quote}}
        final_results = {}
        for symbol in symbols:
            symbol_quotes = {}
            for source_name, quotes in all_quotes_by_source.items():
                if symbol in quotes:
                    symbol_quotes[source_name] = quotes[symbol]

            # 应用降级策略
            if symbol_quotes:
                result = fallback_strategy.evaluate_and_fallback(
                    symbol_quotes,
                    {symbol: historical_data.get(symbol)} if historical_data else None
                )
                # 添加异常信息
                if result.get("quality"):
                    result["anomalies"] = result["quality"].anomalies
                    result["anomaly_details"] = result["quality"].anomaly_details
                    # 记录异常汇总
                    if result["quality"].has_anomalies:
                        symbol_anomalies = result["quality"].anomalies
                        if AnomalyType.PRICE_EXTREME_CHANGE.value in symbol_anomalies:
                            logger.info(f"[批量异常] {symbol} 价格极端变化")
                        if AnomalyType.VOLUME_ABNORMAL.value in symbol_anomalies:
                            logger.info(f"[批量异常] {symbol} 成交量异常")
                final_results[symbol] = result
            else:
                # 所有数据源都失败，生成备份数据
                fallback_data = fallback_strategy.generate_fallback_data(
                    symbol,
                    historical_data.get(symbol) if historical_data else None
                )
                final_results[symbol] = {
                    "quote": fallback_data,
                    "quality": None,
                    "source": "fallback",
                    "warnings": ["所有数据源失败"],
                    "fallback_used": True
                }

        return final_results

    async def _collect_batch_for_source(
        self,
        source: DataSource,
        symbols: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """
        从单个数据源批量获取报价

        Args:
            source: 数据源
            symbols: 股票代码列表

        Returns:
            按股票代码分组的报价
        """
        try:
            await self._check_rate_limit(source.name)
            quotes = await source.get_batch_quotes(symbols)

            # 更新指标
            self.metrics[source.name].request_count += 1
            self.metrics[source.name].success_count += 1

            return quotes

        except Exception as e:
            logger.error(f"从 {source.name} 批量获取数据失败: {str(e)}")
            self.metrics[source.name].error_count += 1
            return {}