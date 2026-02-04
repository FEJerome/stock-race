"""
DataSourceRouter - Multi-source load balancing and failover router.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple, Callable
from enum import Enum
import random
import statistics

from .base import DataSource, DataSourceError, RateLimitError
from ..core.config import settings

logger = logging.getLogger(__name__)


class DataSourceStatus(Enum):
    """Data source status enumeration."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    OFFLINE = "offline"


class DataSourceConfig:
    """Configuration for a data source."""

    def __init__(
        self,
        name: str,
        collector_class: type,
        weight: float = 1.0,
        min_interval_ms: int = 100,
        max_requests_per_minute: int = 600,
        batch_size: int = 100,
        timeout_seconds: int = 30,
        retry_count: int = 3
    ):
        self.name = name
        self.collector_class = collector_class
        self.weight = weight
        self.min_interval_ms = min_interval_ms
        self.max_requests_per_minute = max_requests_per_minute
        self.batch_size = batch_size
        self.timeout_seconds = timeout_seconds
        self.retry_count = retry_count

        # Dynamic state
        self.instance: Optional[DataSource] = None
        self.status = DataSourceStatus.HEALTHY
        self.last_request_time: Optional[datetime] = None
        self.request_count = 0
        self.error_count = 0
        self.success_count = 0
        self.response_times: List[float] = []
        self.last_error: Optional[str] = None
        self.last_success: Optional[datetime] = None
        self.consecutive_errors = 0
        self.consecutive_successes = 0

    @property
    def success_rate(self) -> float:
        """Calculate success rate."""
        total = self.request_count
        if total == 0:
            return 1.0
        return self.success_count / total

    @property
    def error_rate(self) -> float:
        """Calculate error rate."""
        total = self.request_count
        if total == 0:
            return 0.0
        return self.error_count / total

    @property
    def avg_response_time(self) -> float:
        """Calculate average response time."""
        if not self.response_times:
            return 0.0
        return statistics.mean(self.response_times)

    @property
    def is_available(self) -> bool:
        """Check if data source is available."""
        if self.status == DataSourceStatus.OFFLINE:
            return False

        # Check if we've exceeded rate limits
        if self.last_request_time:
            time_since_last = (datetime.now() - self.last_request_time).total_seconds()
            if time_since_last < (self.min_interval_ms / 1000):
                return False

        return True

    @property
    def health_score(self) -> float:
        """Calculate health score (0.0 to 1.0)."""
        score = 0.0

        # Success rate contributes 40%
        score += self.success_rate * 0.4

        # Response time contributes 30% (faster is better)
        if self.avg_response_time > 0:
            # Normalize response time (0-5 seconds is good, >5 seconds is bad)
            response_score = max(0, 1.0 - (self.avg_response_time / 5.0))
            score += response_score * 0.3

        # Consecutive successes contribute 20%
        consecutive_success_score = min(1.0, self.consecutive_successes / 10.0)
        score += consecutive_success_score * 0.2

        # Recent activity contributes 10%
        if self.last_success:
            time_since_success = (datetime.now() - self.last_success).total_seconds()
            if time_since_success < 300:  # 5 minutes
                score += 0.1

        return min(1.0, max(0.0, score))

    def update_request_stats(self, success: bool, response_time: float):
        """Update request statistics."""
        self.request_count += 1
        self.last_request_time = datetime.now()

        if success:
            self.success_count += 1
            self.consecutive_successes += 1
            self.consecutive_errors = 0
            self.last_success = datetime.now()
            self.response_times.append(response_time)

            # Keep only last 100 response times
            if len(self.response_times) > 100:
                self.response_times = self.response_times[-100:]
        else:
            self.error_count += 1
            self.consecutive_errors += 1
            self.consecutive_successes = 0

        # Update status based on performance
        self._update_status()

    def _update_status(self):
        """Update data source status based on performance."""
        if self.consecutive_errors >= 10:
            self.status = DataSourceStatus.OFFLINE
        elif self.error_rate > 0.3:
            self.status = DataSourceStatus.UNHEALTHY
        elif self.error_rate > 0.1:
            self.status = DataSourceStatus.DEGRADED
        elif self.success_rate >= 0.9:
            self.status = DataSourceStatus.HEALTHY
        else:
            self.status = DataSourceStatus.DEGRADED


class DataSourceRouter:
    """
    Router for managing multiple data sources with load balancing and failover.
    """

    def __init__(self):
        self.data_sources: Dict[str, DataSourceConfig] = {}
        self.initialized = False
        self.default_configs = {
            "sina": {
                "weight": 1.0,
                "min_interval_ms": 100,
                "max_requests_per_minute": 600,
                "batch_size": 100,
                "timeout_seconds": 30,
                "retry_count": 3
            },
            "tencent": {
                "weight": 0.8,
                "min_interval_ms": 50,
                "max_requests_per_minute": 1200,
                "batch_size": 150,
                "timeout_seconds": 30,
                "retry_count": 3
            },
            "eastmoney": {
                "weight": 0.6,
                "min_interval_ms": 200,
                "max_requests_per_minute": 300,
                "batch_size": 50,
                "timeout_seconds": 30,
                "retry_count": 3
            }
        }

        # Statistics
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.total_response_time = 0.0
        self.last_route_time: Optional[datetime] = None

        # Cache for batch requests
        self.batch_cache: Dict[str, Dict[str, Any]] = {}
        self.cache_ttl = timedelta(seconds=5)

    async def initialize(self):
        """Initialize the router and all data sources."""
        if self.initialized:
            return

        try:
            # Import collector classes
            from .sina import SinaCollector
            from .tencent import TencentCollector
            from .eastmoney import EastMoneyCollector

            collector_classes = {
                "sina": SinaCollector,
                "tencent": TencentCollector,
                "eastmoney": EastMoneyCollector
            }

            # Create data source configurations
            for name, collector_class in collector_classes.items():
                config_dict = self.default_configs.get(name, {})
                config = DataSourceConfig(
                    name=name,
                    collector_class=collector_class,
                    **config_dict
                )

                # Create collector instance
                config.instance = collector_class()
                await config.instance.__aenter__()

                self.data_sources[name] = config

            self.initialized = True
            logger.info(f"DataSourceRouter initialized with {len(self.data_sources)} data sources")

        except Exception as e:
            logger.error(f"Failed to initialize DataSourceRouter: {str(e)}")
            raise

    async def close(self):
        """Close all data sources."""
        for config in self.data_sources.values():
            if config.instance:
                try:
                    await config.instance.close()
                except Exception as e:
                    logger.error(f"Failed to close data source {config.name}: {str(e)}")

        self.initialized = False
        logger.info("DataSourceRouter closed")

    def select_data_source(
        self,
        operation: str = "quote",
        symbols: Optional[List[str]] = None
    ) -> Optional[DataSourceConfig]:
        """
        Select the best data source for the operation.

        Args:
            operation: Type of operation (quote, history, info, batch)
            symbols: List of symbols (for batch operations)

        Returns:
            Selected DataSourceConfig or None if no source available
        """
        if not self.initialized:
            logger.warning("DataSourceRouter not initialized")
            return None

        # Filter available sources
        available_sources = [
            config for config in self.data_sources.values()
            if config.is_available
        ]

        if not available_sources:
            logger.warning("No data sources available")
            return None

        # Calculate selection probabilities based on weights and health scores
        total_score = sum(config.weight * config.health_score for config in available_sources)

        if total_score <= 0:
            # Fallback to round-robin
            return available_sources[self.total_requests % len(available_sources)]

        # Weighted random selection
        selection_point = random.random() * total_score
        cumulative_score = 0.0

        for config in available_sources:
            score = config.weight * config.health_score
            cumulative_score += score
            if cumulative_score >= selection_point:
                return config

        # Fallback to first available
        return available_sources[0]

    async def get_stock_quote(
        self,
        symbol: str,
        max_retries: int = 3
    ) -> Optional[Dict[str, Any]]:
        """
        Get stock quote with automatic failover.

        Args:
            symbol: Stock symbol
            max_retries: Maximum number of retry attempts

        Returns:
            Quote data or None if all attempts fail
        """
        if not self.initialized:
            await self.initialize()

        attempts = 0
        errors = []

        while attempts < max_retries:
            attempts += 1

            # Select data source
            config = self.select_data_source(operation="quote")
            if not config:
                logger.error(f"No data source available for quote {symbol}")
                break

            try:
                start_time = datetime.now()

                # Make request
                quote = await config.instance.get_stock_quote(symbol)

                # Calculate response time
                response_time = (datetime.now() - start_time).total_seconds()

                # Update statistics
                config.update_request_stats(success=True, response_time=response_time)
                self._update_router_stats(success=True, response_time=response_time)

                logger.debug(f"Got quote for {symbol} from {config.name} in {response_time:.2f}s")
                return quote

            except (DataSourceError, RateLimitError) as e:
                response_time = (datetime.now() - start_time).total_seconds()
                config.update_request_stats(success=False, response_time=response_time)
                self._update_router_stats(success=False, response_time=response_time)

                errors.append(f"{config.name}: {str(e)}")
                logger.warning(f"Failed to get quote for {symbol} from {config.name}: {str(e)}")

                # If rate limited, wait before retrying
                if isinstance(e, RateLimitError):
                    await asyncio.sleep(1)

                continue
            except Exception as e:
                response_time = (datetime.now() - start_time).total_seconds()
                config.update_request_stats(success=False, response_time=response_time)
                self._update_router_stats(success=False, response_time=response_time)

                errors.append(f"{config.name}: {str(e)}")
                logger.error(f"Unexpected error getting quote for {symbol} from {config.name}: {str(e)}")
                break

        if errors:
            logger.error(f"Failed to get quote for {symbol} after {attempts} attempts: {errors}")

        return None

    async def get_batch_quotes(
        self,
        symbols: List[str],
        max_batch_size: int = 100,
        max_retries: int = 2
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get batch quotes with intelligent batching and load balancing.

        Args:
            symbols: List of stock symbols
            max_batch_size: Maximum batch size per request
            max_retries: Maximum number of retry attempts

        Returns:
            Dictionary mapping symbol to quote data
        """
        if not self.initialized:
            await self.initialize()

        # Check cache first
        cached_results = {}
        fresh_symbols = []

        for symbol in symbols:
            cache_key = f"batch:{','.join(sorted(symbols))}"
            if cache_key in self.batch_cache:
                cached_data = self.batch_cache[cache_key]
                if datetime.now() - cached_data.get("timestamp", datetime.min) < self.cache_ttl:
                    if symbol in cached_data.get("quotes", {}):
                        cached_results[symbol] = cached_data["quotes"][symbol]
                        continue

            fresh_symbols.append(symbol)

        if not fresh_symbols:
            return cached_results

        # Split symbols into batches
        batches = []
        for i in range(0, len(fresh_symbols), max_batch_size):
            batch = fresh_symbols[i:i + max_batch_size]
            batches.append(batch)

        all_results = cached_results.copy()

        # Process batches in parallel
        batch_tasks = []
        for batch in batches:
            task = self._process_batch(batch, max_retries)
            batch_tasks.append(task)

        # Wait for all batches to complete
        batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)

        # Merge results
        for result in batch_results:
            if isinstance(result, Exception):
                logger.error(f"Batch processing failed: {str(result)}")
                continue

            if isinstance(result, dict):
                all_results.update(result)

        # Update cache
        if all_results:
            cache_key = f"batch:{','.join(sorted(symbols))}"
            self.batch_cache[cache_key] = {
                "quotes": all_results,
                "timestamp": datetime.now()
            }

        return all_results

    async def _process_batch(
        self,
        symbols: List[str],
        max_retries: int
    ) -> Dict[str, Dict[str, Any]]:
        """Process a single batch of symbols."""
        attempts = 0
        errors = []

        while attempts < max_retries:
            attempts += 1

            # Select data source for batch operation
            config = self.select_data_source(operation="batch", symbols=symbols)
            if not config:
                logger.error(f"No data source available for batch operation")
                break

            try:
                start_time = datetime.now()

                # Make batch request
                batch_size = min(len(symbols), config.batch_size)
                batch_symbols = symbols[:batch_size]

                quotes = await config.instance.get_batch_quotes(batch_symbols)

                # Calculate response time
                response_time = (datetime.now() - start_time).total_seconds()

                # Update statistics
                config.update_request_stats(success=True, response_time=response_time)
                self._update_router_stats(success=True, response_time=response_time)

                logger.debug(f"Got batch quotes for {len(quotes)} symbols from {config.name} in {response_time:.2f}s")
                return quotes

            except (DataSourceError, RateLimitError) as e:
                response_time = (datetime.now() - start_time).total_seconds()
                config.update_request_stats(success=False, response_time=response_time)
                self._update_router_stats(success=False, response_time=response_time)

                errors.append(f"{config.name}: {str(e)}")
                logger.warning(f"Batch request failed from {config.name}: {str(e)}")

                # If rate limited, wait before retrying
                if isinstance(e, RateLimitError):
                    await asyncio.sleep(2)

                continue
            except Exception as e:
                response_time = (datetime.now() - start_time).total_seconds()
                config.update_request_stats(success=False, response_time=response_time)
                self._update_router_stats(success=False, response_time=response_time)

                errors.append(f"{config.name}: {str(e)}")
                logger.error(f"Unexpected error in batch request from {config.name}: {str(e)}")
                break

        if errors:
            logger.error(f"Failed to process batch after {attempts} attempts: {errors}")

        return {}

    async def get_stock_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d",
        max_retries: int = 2
    ) -> List[Dict[str, Any]]:
        """
        Get historical data with failover.

        Args:
            symbol: Stock symbol
            start_date: Start date
            end_date: End date
            interval: Data interval
            max_retries: Maximum number of retry attempts

        Returns:
            List of historical data points
        """
        if not self.initialized:
            await self.initialize()

        attempts = 0
        errors = []

        while attempts < max_retries:
            attempts += 1

            # Select data source for history operation
            config = self.select_data_source(operation="history")
            if not config:
                logger.error(f"No data source available for history {symbol}")
                break

            try:
                start_time = datetime.now()

                # Make request
                history = await config.instance.get_stock_history(
                    symbol, start_date, end_date, interval
                )

                # Calculate response time
                response_time = (datetime.now() - start_time).total_seconds()

                # Update statistics
                config.update_request_stats(success=True, response_time=response_time)
                self._update_router_stats(success=True, response_time=response_time)

                logger.debug(f"Got history for {symbol} from {config.name} in {response_time:.2f}s")
                return history

            except (DataSourceError, RateLimitError) as e:
                response_time = (datetime.now() - start_time).total_seconds()
                config.update_request_stats(success=False, response_time=response_time)
                self._update_router_stats(success=False, response_time=response_time)

                errors.append(f"{config.name}: {str(e)}")
                logger.warning(f"Failed to get history for {symbol} from {config.name}: {str(e)}")

                continue
            except Exception as e:
                response_time = (datetime.now() - start_time).total_seconds()
                config.update_request_stats(success=False, response_time=response_time)
                self._update_router_stats(success=False, response_time=response_time)

                errors.append(f"{config.name}: {str(e)}")
                logger.error(f"Unexpected error getting history for {symbol} from {config.name}: {str(e)}")
                break

        if errors:
            logger.error(f"Failed to get history for {symbol} after {attempts} attempts: {errors}")

        return []

    async def get_stock_info(
        self,
        symbol: str,
        max_retries: int = 2
    ) -> Optional[Dict[str, Any]]:
        """
        Get stock information with failover.

        Args:
            symbol: Stock symbol
            max_retries: Maximum number of retry attempts

        Returns:
            Stock information or None if all attempts fail
        """
        if not self.initialized:
            await self.initialize()

        attempts = 0
        errors = []

        while attempts < max_retries:
            attempts += 1

            # Select data source for info operation
            config = self.select_data_source(operation="info")
            if not config:
                logger.error(f"No data source available for info {symbol}")
                break

            try:
                start_time = datetime.now()

                # Make request
                info = await config.instance.get_stock_info(symbol)

                # Calculate response time
                response_time = (datetime.now() - start_time).total_seconds()

                # Update statistics
                config.update_request_stats(success=True, response_time=response_time)
                self._update_router_stats(success=True, response_time=response_time)

                logger.debug(f"Got info for {symbol} from {config.name} in {response_time:.2f}s")
                return info

            except (DataSourceError, RateLimitError) as e:
                response_time = (datetime.now() - start_time).total_seconds()
                config.update_request_stats(success=False, response_time=response_time)
                self._update_router_stats(success=False, response_time=response_time)

                errors.append(f"{config.name}: {str(e)}")
                logger.warning(f"Failed to get info for {symbol} from {config.name}: {str(e)}")

                continue
            except Exception as e:
                response_time = (datetime.now() - start_time).total_seconds()
                config.update_request_stats(success=False, response_time=response_time)
                self._update_router_stats(success=False, response_time=response_time)

                errors.append(f"{config.name}: {str(e)}")
                logger.error(f"Unexpected error getting info for {symbol} from {config.name}: {str(e)}")
                break

        if errors:
            logger.error(f"Failed to get info for {symbol} after {attempts} attempts: {errors}")

        return None

    def get_router_stats(self) -> Dict[str, Any]:
        """Get router statistics."""
        avg_response_time = 0.0
        if self.total_requests > 0:
            avg_response_time = self.total_response_time / self.total_requests

        success_rate = 0.0
        if self.total_requests > 0:
            success_rate = self.successful_requests / self.total_requests

        # Get data source details
        source_details = {}
        for name, config in self.data_sources.items():
            source_details[name] = {
                "status": config.status.value,
                "weight": config.weight,
                "health_score": config.health_score,
                "success_rate": config.success_rate,
                "error_rate": config.error_rate,
                "avg_response_time": config.avg_response_time,
                "request_count": config.request_count,
                "error_count": config.error_count,
                "consecutive_errors": config.consecutive_errors,
                "consecutive_successes": config.consecutive_successes,
                "last_request": config.last_request_time.isoformat() if config.last_request_time else None,
                "last_success": config.last_success.isoformat() if config.last_success else None,
                "is_available": config.is_available
            }

        return {
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "success_rate": success_rate,
            "avg_response_time": avg_response_time,
            "last_route_time": self.last_route_time.isoformat() if self.last_route_time else None,
            "data_sources": source_details,
            "cache_size": len(self.batch_cache),
            "initialized": self.initialized
        }

    def get_health_status(self) -> Dict[str, Any]:
        """Get overall health status."""
        stats = self.get_router_stats()

        # Determine overall health
        healthy_sources = sum(
            1 for source in stats["data_sources"].values()
            if source["status"] in ["healthy", "degraded"]
        )

        overall_health = "healthy" if healthy_sources > 0 else "unhealthy"

        return {
            "status": overall_health,
            "healthy_sources": healthy_sources,
            "total_sources": len(stats["data_sources"]),
            "success_rate": stats["success_rate"],
            "timestamp": datetime.now().isoformat()
        }

    def _update_router_stats(self, success: bool, response_time: float):
        """Update router statistics."""
        self.total_requests += 1
        self.total_response_time += response_time
        self.last_route_time = datetime.now()

        if success:
            self.successful_requests += 1
        else:
            self.failed_requests += 1

    def clear_cache(self):
        """Clear the batch cache."""
        self.batch_cache.clear()
        logger.info("Batch cache cleared")

    def reset_stats(self):
        """Reset all statistics."""
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.total_response_time = 0.0
        self.last_route_time = None

        for config in self.data_sources.values():
            config.request_count = 0
            config.error_count = 0
            config.success_count = 0
            config.response_times = []
            config.consecutive_errors = 0
            config.consecutive_successes = 0
            config.last_error = None

        logger.info("Router statistics reset")