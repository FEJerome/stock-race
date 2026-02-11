"""
Unit tests for granular collection service.

Tests per-symbol collection with individual failover tracking.
"""

import pytest
import asyncio
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class Quote:
    """Stock quote data model."""

    def __init__(self, symbol: str, price: float, change: float,
                 change_percent: float, volume: int, timestamp: datetime,
                 source: str = ""):
        self.symbol = symbol
        self.price = price
        self.change = change
        self.change_percent = change_percent
        self.volume = volume
        self.timestamp = timestamp
        self.source = source


@dataclass
class SymbolCollectionStatus:
    """Status of collection for a single symbol."""

    symbol: str
    success: bool = False
    source: str = ""
    is_fallback: bool = False
    latency_ms: float = 0.0
    error_message: str = ""
    retry_count: int = 0


class GranularCollectionResult:
    """Result of granular collection with detailed tracking."""

    def __init__(self):
        self.quotes: List[Quote] = []
        self.symbol_statuses: Dict[str, SymbolCollectionStatus] = {}
        self.failed_symbols: Set[str] = set()
        self.fallback_symbols: Set[str] = set()
        self.source_distribution: Dict[str, int] = {}
        self.total_latency_ms: float = 0.0
        self.start_time: datetime = datetime.now()
        self.end_time: Optional[datetime] = None

    def add_success(self, quote: Quote, is_fallback: bool = False, latency_ms: float = 0):
        """Add successful collection."""
        self.quotes.append(quote)

        status = SymbolCollectionStatus(
            symbol=quote.symbol,
            success=True,
            source=quote.source,
            is_fallback=is_fallback,
            latency_ms=latency_ms
        )
        self.symbol_statuses[quote.symbol] = status

        # Update distribution
        self.source_distribution[quote.source] = self.source_distribution.get(quote.source, 0) + 1

        if is_fallback:
            self.fallback_symbols.add(quote.symbol)

        self.total_latency_ms += latency_ms

    def add_failure(self, symbol: str, error: str, attempted_sources: List[str] = None):
        """Add failed collection."""
        self.failed_symbols.add(symbol)

        status = SymbolCollectionStatus(
            symbol=symbol,
            success=False,
            error_message=error
        )
        self.symbol_statuses[symbol] = status

    def finalize(self):
        """Finalize the result."""
        self.end_time = datetime.now()

    def get_success_rate(self) -> float:
        """Calculate success rate."""
        total = len(self.symbol_statuses)
        if total == 0:
            return 1.0
        successful = sum(1 for s in self.symbol_statuses.values() if s.success)
        return successful / total

    def get_avg_latency_ms(self) -> float:
        """Calculate average latency."""
        successful = [s for s in self.symbol_statuses.values() if s.success]
        if not successful:
            return 0.0
        return sum(s.latency_ms for s in successful) / len(successful)

    def get_fallback_rate(self) -> float:
        """Calculate fallback usage rate."""
        successful = [s for s in self.symbol_statuses.values() if s.success]
        if not successful:
            return 0.0
        fallback_count = sum(1 for s in successful if s.is_fallback)
        return fallback_count / len(successful)


class GranularCollectionService:
    """
    Service for granular collection with per-symbol tracking.

    Features:
    - Individual symbol collection with separate failover
    - Detailed tracking of source usage per symbol
    - Concurrent collection with configurable concurrency
    """

    def __init__(self, primary_source, fallback_sources: List = None, max_concurrency: int = 50):
        self.primary_source = primary_source
        self.fallback_sources = fallback_sources or []
        self.max_concurrency = max_concurrency
        self.symbol_failure_counts: Dict[str, int] = {}

    async def collect_quotes(self, symbols: List[str], **kwargs) -> GranularCollectionResult:
        """
        Collect quotes for symbols with granular failover.

        Args:
            symbols: List of stock symbols
            **kwargs: Parameters to pass to collectors

        Returns:
            GranularCollectionResult with detailed tracking
        """
        result = GranularCollectionResult()

        # Process symbols with limited concurrency
        semaphore = asyncio.Semaphore(self.max_concurrency)

        async def collect_with_limit(symbol: str) -> Optional[Quote]:
            async with semaphore:
                return await self._collect_single_symbol(symbol, result, **kwargs)

        # Create tasks for all symbols
        tasks = [collect_with_limit(s) for s in symbols]
        await asyncio.gather(*tasks, return_exceptions=True)

        result.finalize()
        return result

    async def _collect_single_symbol(self, symbol: str, result: GranularCollectionResult, **kwargs) -> Optional[Quote]:
        """Collect a single symbol with failover tracking."""
        sources = [self.primary_source] + self.fallback_sources

        for idx, source in enumerate(sources):
            start_time = datetime.now()
            is_fallback = idx > 0

            try:
                quotes = await source.collect_quotes([symbol], **kwargs)

                if quotes and len(quotes) > 0:
                    quote = quotes[0]
                    latency_ms = (datetime.now() - start_time).total_seconds() * 1000

                    result.add_success(quote, is_fallback, latency_ms)

                    # Reset failure count on success
                    if symbol in self.symbol_failure_counts:
                        del self.symbol_failure_counts[symbol]

                    return quote

            except Exception as e:
                # Track failure
                self.symbol_failure_counts[symbol] = self.symbol_failure_counts.get(symbol, 0) + 1
                continue

        # All sources failed
        result.add_failure(symbol, "All sources failed")
        return None


class MockDataSource:
    """Mock data source for testing."""

    def __init__(self, name: str, fail_symbols: Set[str] = None, delay_ms: float = 1):
        self.name = name
        self.fail_symbols = fail_symbols or set()
        self.delay_ms = delay_ms

    async def collect_quotes(self, symbols: List[str], **kwargs) -> List[Quote]:
        await asyncio.sleep(self.delay_ms / 1000)

        # Check if any symbol should fail
        for symbol in symbols:
            if symbol in self.fail_symbols:
                raise Exception(f"Simulated failure for {symbol}")

        return [
            Quote(
                symbol=s,
                price=10.5,
                change=0.05,
                change_percent=0.48,
                volume=1000000,
                timestamp=datetime.now(),
                source=self.name
            )
            for s in symbols
        ]


class TestGranularCollectionService:
    """Test granular collection service."""

    @pytest.fixture
    def primary_source(self):
        return MockDataSource("sina", fail_symbols={"000002", "000003"})

    @pytest.fixture
    def fallback_source(self):
        return MockDataSource("tencent", fail_symbols={"000003"})

    @pytest.fixture
    def service(self, primary_source, fallback_source):
        return GranularCollectionService(primary_source, [fallback_source], max_concurrency=10)

    @pytest.mark.asyncio
    async def test_successful_collection(self, service):
        """Test all symbols collected successfully."""
        result = await service.collect_quotes(["000001", "600519"])

        assert len(result.quotes) == 2
        assert len(result.failed_symbols) == 0
        assert result.get_success_rate() == 1.0

    @pytest.mark.asyncio
    async def test_per_symbol_failover(self, service):
        """Test failover happens per symbol."""
        result = await service.collect_quotes(["000001", "000002"])

        # 000001 from primary
        assert result.symbol_statuses["000001"].source == "sina"
        assert not result.symbol_statuses["000001"].is_fallback

        # 000002 from fallback (primary failed)
        assert result.symbol_statuses["000002"].source == "tencent"
        assert result.symbol_statuses["000002"].is_fallback

        assert "000002" in result.fallback_symbols

    @pytest.mark.asyncio
    async def test_complete_failure(self, service):
        """Test when all sources fail for a symbol."""
        result = await service.collect_quotes(["000003"])  # Fails both sources

        assert len(result.quotes) == 0
        assert "000003" in result.failed_symbols
        assert result.get_success_rate() == 0.0

    @pytest.mark.asyncio
    async def test_source_distribution(self, service):
        """Test source distribution tracking."""
        result = await service.collect_quotes(["000001", "000002", "600519"])

        assert result.source_distribution.get("sina") == 2  # 000001, 600519
        assert result.source_distribution.get("tencent") == 1  # 000002

    @pytest.mark.asyncio
    async def test_fallback_rate(self, service):
        """Test fallback rate calculation."""
        result = await service.collect_quotes(["000001", "000002"])

        # 1 fallback out of 2 successful = 0.5
        assert result.get_fallback_rate() == 0.5

    @pytest.mark.asyncio
    async def test_latency_tracking(self, service):
        """Test latency is tracked per symbol."""
        result = await service.collect_quotes(["000001"])

        assert result.get_avg_latency_ms() > 0
        assert result.symbol_statuses["000001"].latency_ms > 0

    @pytest.mark.asyncio
    async def test_concurrent_collection(self):
        """Test concurrent symbol collection."""
        primary = MockDataSource("sina", delay_ms=10)
        service = GranularCollectionService(primary, max_concurrency=20)

        import time
        start = time.time()

        # 50 symbols with 10ms delay each, 20 concurrent
        # Sequential would take 500ms, concurrent should be much faster
        symbols = [f"{i:06d}" for i in range(1, 51)]
        result = await service.collect_quotes(symbols)

        elapsed = time.time() - start

        assert len(result.quotes) == 50
        assert elapsed < 0.5  # Should complete in under 500ms with concurrency

    @pytest.mark.asyncio
    async def test_result_finalization(self, service):
        """Test result has timestamps."""
        result = await service.collect_quotes(["000001"])

        assert result.start_time is not None
        assert result.end_time is not None
        assert result.end_time >= result.start_time


class TestGranularCollectionEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_empty_symbol_list(self):
        """Test empty symbol list."""
        primary = MockDataSource("sina")
        service = GranularCollectionService(primary)

        result = await service.collect_quotes([])

        assert len(result.quotes) == 0
        assert result.get_success_rate() == 1.0

    @pytest.mark.asyncio
    async def test_single_symbol(self):
        """Test single symbol collection."""
        primary = MockDataSource("sina")
        service = GranularCollectionService(primary)

        result = await service.collect_quotes(["000001"])

        assert len(result.quotes) == 1
        assert result.quotes[0].symbol == "000001"

    @pytest.mark.asyncio
    async def test_duplicate_symbols(self):
        """Test handling duplicate symbols."""
        primary = MockDataSource("sina")
        service = GranularCollectionService(primary)

        result = await service.collect_quotes(["000001", "000001"])

        # Should handle duplicates gracefully
        assert len(result.quotes) == 2

    @pytest.mark.asyncio
    async def test_no_fallback_sources(self):
        """Test collection without fallback sources."""
        primary = MockDataSource("sina", fail_symbols={"000001"})
        service = GranularCollectionService(primary, fallback_sources=[])

        result = await service.collect_quotes(["000001"])

        assert len(result.quotes) == 0
        assert "000001" in result.failed_symbols

    @pytest.mark.asyncio
    async def test_multiple_fallbacks(self):
        """Test multiple fallback sources."""
        primary = MockDataSource("sina", fail_symbols={"000001"})
        fallback1 = MockDataSource("tencent", fail_symbols={"000001"})
        fallback2 = MockDataSource("eastmoney")

        service = GranularCollectionService(primary, [fallback1, fallback2])

        result = await service.collect_quotes(["000001"])

        assert len(result.quotes) == 1
        assert result.quotes[0].source == "eastmoney"
        assert "000001" in result.fallback_symbols

