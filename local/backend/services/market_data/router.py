"""
DataSource Router - Multi-source market data aggregation

Manages multiple data sources and provides:
- Source prioritization and failover
- Data aggregation from multiple sources
- Health monitoring and automatic recovery
"""
import asyncio
import time
from typing import List, Dict, Optional, Set
from dataclasses import dataclass
from datetime import datetime, timedelta

from .base import DataSource, Quote, MarketData, DataSourceHealth, DataSourceStatus


@dataclass
class SourceResult:
    """Result from a single data source"""
    source_name: str
    quote: Optional[Quote]
    latency_ms: float
    success: bool


class DataSourceRouter:
    """
    Routes market data requests to multiple sources

    Features:
    - Priority-based source selection
    - Automatic failover on source failure
    - Data aggregation from multiple sources
    - Health monitoring and weight adjustment
    """

    def __init__(self):
        self._sources: Dict[str, DataSource] = {}
        self._weights: Dict[str, float] = {}
        self._health_cache: Dict[str, DataSourceHealth] = {}
        self._last_health_check: Optional[datetime] = None
        self._health_check_interval = timedelta(seconds=30)

    def register_source(self, source: DataSource, weight: float = 1.0):
        """
        Register a data source

        Args:
            source: Data source instance
            weight: Initial weight (0-1), higher = preferred
        """
        self._sources[source.name] = source
        self._weights[source.name] = max(0.0, min(1.0, weight))
        print(f"[DataSourceRouter] Registered: {source.name} (priority={source.priority}, weight={weight})")

    def unregister_source(self, name: str):
        """Unregister a data source"""
        if name in self._sources:
            del self._sources[name]
            del self._weights[name]
            print(f"[DataSourceRouter] Unregistered: {name}")

    def get_source(self, name: str) -> Optional[DataSource]:
        """Get a registered data source by name"""
        return self._sources.get(name)

    def list_sources(self) -> List[str]:
        """List all registered source names"""
        return list(self._sources.keys())

    def _get_sorted_sources(self) -> List[DataSource]:
        """Get sources sorted by priority and weight"""
        return sorted(
            self._sources.values(),
            key=lambda s: (s.priority, -self._weights.get(s.name, 0))
        )

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """
        Get quote with failover

        Tries sources in priority order until one succeeds.

        Args:
            symbol: Stock symbol

        Returns:
            Quote from first successful source, or None if all fail
        """
        for source in self._get_sorted_sources():
            try:
                quote = await source.get_quote(symbol)
                if quote:
                    return quote
            except Exception as e:
                print(f"[DataSourceRouter] {source.name} failed for {symbol}: {e}")
                continue

        return None

    async def get_quotes(self, symbols: List[str]) -> Dict[str, MarketData]:
        """
        Get quotes from all sources with aggregation

        Fetches data from all sources and aggregates results.
        Uses weighted average for price when multiple sources available.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to aggregated MarketData
        """
        # Fetch from all sources concurrently
        tasks = []
        for source in self._sources.values():
            task = self._fetch_from_source(source, symbols)
            tasks.append(task)

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Aggregate results
        aggregated: Dict[str, List[SourceResult]] = {s: [] for s in symbols}

        for source, result in zip(self._sources.values(), results):
            if isinstance(result, Exception):
                print(f"[DataSourceRouter] {source.name} error: {result}")
                continue

            for symbol, source_result in result.items():
                if source_result.success and source_result.quote:
                    aggregated[symbol].append(source_result)

        # Build final MarketData
        market_data: Dict[str, MarketData] = {}
        for symbol, results in aggregated.items():
            if results:
                market_data[symbol] = self._aggregate_results(symbol, results)

        return market_data

    async def _fetch_from_source(
        self,
        source: DataSource,
        symbols: List[str]
    ) -> Dict[str, SourceResult]:
        """Fetch quotes from a single source"""
        start_time = time.time()
        results: Dict[str, SourceResult] = {}

        try:
            quotes = await source.get_quotes(symbols)
            latency_ms = (time.time() - start_time) * 1000

            for symbol in symbols:
                quote = quotes.get(symbol)
                results[symbol] = SourceResult(
                    source_name=source.name,
                    quote=quote,
                    latency_ms=latency_ms,
                    success=quote is not None
                )

        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            for symbol in symbols:
                results[symbol] = SourceResult(
                    source_name=source.name,
                    quote=None,
                    latency_ms=latency_ms,
                    success=False
                )

        return results

    def _aggregate_results(self, symbol: str, results: List[SourceResult]) -> MarketData:
        """
        Aggregate results from multiple sources

        Uses weighted average based on source weights and recency.
        """
        # Get weights for each result
        total_weight = 0
        weighted_price = 0
        weighted_change = 0
        weighted_volume = 0
        sources_used = []

        for result in results:
            weight = self._weights.get(result.source_name, 0.5)
            # Boost weight for low latency
            if result.latency_ms < 100:
                weight *= 1.2
            elif result.latency_ms > 500:
                weight *= 0.8

            quote = result.quote
            if quote:
                weighted_price += quote.price * weight
                weighted_change += quote.change_percent * weight
                weighted_volume += quote.volume
                total_weight += weight
                sources_used.append(result.source_name)

        if total_weight == 0:
            # Fallback to first result
            quote = results[0].quote
            return MarketData(
                symbol=symbol,
                name=quote.name if quote else symbol,
                price=quote.price if quote else 0,
                change=quote.change if quote else 0,
                change_percent=quote.change_percent if quote else 0,
                volume=quote.volume if quote else 0,
                timestamp=datetime.utcnow(),
                sources=[r.source_name for r in results if r.quote],
                confidence=0.5
            )

        # Calculate weighted values
        avg_price = weighted_price / total_weight
        avg_change = weighted_change / total_weight

        # Get latest quote for reference data
        latest_quote = max(results, key=lambda r: r.quote.timestamp if r.quote else datetime.min).quote

        # Calculate confidence based on source agreement
        prices = [r.quote.price for r in results if r.quote]
        if len(prices) > 1:
            price_std = sum((p - avg_price) ** 2 for p in prices) / len(prices) ** 0.5
            confidence = max(0.5, 1 - price_std / avg_price) if avg_price > 0 else 0.5
        else:
            confidence = 0.7 if prices else 0.3

        return MarketData(
            symbol=symbol,
            name=latest_quote.name if latest_quote else symbol,
            price=avg_price,
            change=latest_quote.change if latest_quote else 0,
            change_percent=avg_change,
            volume=int(weighted_volume / len(results)),  # Average volume
            timestamp=datetime.utcnow(),
            sources=sources_used,
            confidence=round(confidence, 2)
        )

    async def health_check(self) -> Dict[str, DataSourceHealth]:
        """
        Check health of all data sources

        Updates weights based on health status.
        """
        now = datetime.utcnow()

        # Use cached health if recent
        if self._last_health_check and \
           now - self._last_health_check < self._health_check_interval:
            return self._health_cache

        # Check all sources concurrently
        tasks = [source.health_check() for source in self._sources.values()]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        health_map = {}
        for source, result in zip(self._sources.values(), results):
            if isinstance(result, Exception):
                health = DataSourceHealth(
                    source_name=source.name,
                    status=DataSourceStatus.UNAVAILABLE,
                    latency_ms=0,
                    last_success=None,
                    error_rate=1.0,
                    weight=self._weights.get(source.name, 0)
                )
            else:
                health = result

            health_map[source.name] = health

            # Update weight based on health
            if health.status == DataSourceStatus.HEALTHY:
                self._weights[source.name] = min(1.0, health.weight * 1.1)
            elif health.status == DataSourceStatus.DEGRADED:
                self._weights[source.name] *= 0.8
            elif health.status == DataSourceStatus.UNAVAILABLE:
                self._weights[source.name] = max(0.1, self._weights[source.name] * 0.5)

        self._health_cache = health_map
        self._last_health_check = now

        return health_map

    def get_source_stats(self) -> Dict[str, dict]:
        """Get statistics for all sources"""
        return {
            name: {
                "priority": source.priority,
                "weight": self._weights.get(name, 0),
                "health": self._health_cache.get(name, None)
            }
            for name, source in self._sources.items()
        }


# Global router instance
_router: Optional[DataSourceRouter] = None


def get_router() -> DataSourceRouter:
    """Get or create global router instance"""
    global _router
    if _router is None:
        _router = DataSourceRouter()
    return _router


def reset_router():
    """Reset global router (for testing)"""
    global _router
    _router = None
