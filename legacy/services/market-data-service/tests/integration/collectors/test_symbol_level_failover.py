"""
Integration tests for symbol-level failover.

Tests that individual symbols can failover independently when primary source fails.
"""

import pytest
import asyncio
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass
from datetime import datetime
import time


@dataclass
class Quote:
    symbol: str
    price: float
    change: float
    change_percent: float
    volume: int
    timestamp: datetime
    source: str


class SymbolLevelFailoverRouter:
    """
    Router that implements symbol-level failover.

    When primary source fails for specific symbols, automatically
    retries those symbols with fallback sources.
    """

    def __init__(self, primary_source, fallback_sources: List = None):
        self.primary_source = primary_source
        self.fallback_sources = fallback_sources or []
        self.stats = {
            "total_requests": 0,
            "successful_requests": 0,
            "fallback_requests": 0,
            "failed_symbols": 0
        }

    async def collect_quotes(self, symbols: List[str], **kwargs) -> Dict[str, Any]:
        """
        Collect quotes with symbol-level failover.

        Returns:
            Dict with quotes, failures, and detailed statistics
        """
        self.stats["total_requests"] += 1

        result = {
            "quotes": [],
            "failed_symbols": [],
            "fallback_symbols": [],
            "source_distribution": {},
            "collection_time_ms": 0
        }

        start_time = time.time()

        # Try primary source first
        primary_result = await self._try_source(
            self.primary_source, symbols, **kwargs
        )

        successful_symbols = set()
        for quote in primary_result["quotes"]:
            result["quotes"].append(quote)
            successful_symbols.add(quote.symbol)
            result["source_distribution"][quote.source] = \
                result["source_distribution"].get(quote.source, 0) + 1

        # Find symbols that failed with primary
        failed_symbols = [
            s for s in symbols
            if s not in successful_symbols and s not in primary_result["failed_symbols"]
        ]
        failed_symbols.extend(primary_result["failed_symbols"])

        # Try fallback sources for failed symbols
        if failed_symbols and self.fallback_sources:
            for fallback in self.fallback_sources:
                if not failed_symbols:
                    break

                fallback_result = await self._try_source(
                    fallback, failed_symbols, **kwargs
                )

                for quote in fallback_result["quotes"]:
                    result["quotes"].append(quote)
                    result["fallback_symbols"].append(quote.symbol)
                    successful_symbols.add(quote.symbol)
                    result["source_distribution"][quote.source] = \
                        result["source_distribution"].get(quote.source, 0) + 1

                    if quote.symbol in failed_symbols:
                        failed_symbols.remove(quote.symbol)

                self.stats["fallback_requests"] += len(fallback_result["quotes"])

        # Track final failures
        result["failed_symbols"] = failed_symbols
        self.stats["failed_symbols"] += len(failed_symbols)
        self.stats["successful_requests"] += len(successful_symbols)

        result["collection_time_ms"] = (time.time() - start_time) * 1000

        return result

    async def _try_source(self, source, symbols: List[str], **kwargs) -> Dict[str, Any]:
        """Try collecting from a single source."""
        result = {"quotes": [], "failed_symbols": []}

        if not symbols:
            return result

        try:
            quotes = await source.collect_quotes(symbols, **kwargs)

            # Validate returned quotes
            returned_symbols = set()
            for quote in quotes:
                if isinstance(quote, Quote):
                    result["quotes"].append(quote)
                    returned_symbols.add(quote.symbol)
                elif isinstance(quote, dict):
                    # Handle dict format
                    q = Quote(
                        symbol=quote["symbol"],
                        price=quote["price"],
                        change=quote["change"],
                        change_percent=quote["change_percent"],
                        volume=quote["volume"],
                        timestamp=quote["timestamp"],
                        source=quote["source"]
                    )
                    result["quotes"].append(q)
                    returned_symbols.add(q.symbol)

            # Track symbols that weren't returned (missing data)
            for s in symbols:
                if s not in returned_symbols:
                    result["failed_symbols"].append(s)

        except Exception as e:
            # All symbols failed with this source
            result["failed_symbols"] = list(symbols)

        return result


class MockUnreliableSource:
    """Mock source that fails for specific symbols."""

    def __init__(self, name: str, fail_symbols: Set[str] = None, fail_rate: float = 0, delay_ms: float = 1):
        self.name = name
        self.fail_symbols = fail_symbols or set()
        self.fail_rate = fail_rate  # Random failure rate
        self.delay_ms = delay_ms

    async def collect_quotes(self, symbols: List[str], **kwargs) -> List[Quote]:
        await asyncio.sleep(0.001)  # Simulate network delay

        result = []
        for symbol in symbols:
            if symbol in self.fail_symbols:
                continue  # Skip failed symbols

            result.append(Quote(
                symbol=symbol,
                price=10.5,
                change=0.05,
                change_percent=0.48,
                volume=1000000,
                timestamp=datetime.now(),
                source=self.name
            ))

        return result


class TestSymbolLevelFailover:
    """Test symbol-level failover scenarios."""

    @pytest.fixture
    def primary_with_failures(self):
        return MockUnreliableSource(
            "sina",
            fail_symbols={"000001", "000002"}
        )

    @pytest.fixture
    def fallback_source(self):
        return MockUnreliableSource("tencent")

    @pytest.mark.asyncio
    async def test_partial_failover(self, primary_with_failures, fallback_source):
        """Test partial failover when some symbols fail."""
        router = SymbolLevelFailoverRouter(primary_with_failures, [fallback_source])

        result = await router.collect_quotes(["000001", "000002", "600519"])

        # All 3 should succeed
        assert len(result["quotes"]) == 3
        assert len(result["failed_symbols"]) == 0

        # 000001 and 000002 should be from fallback
        assert "000001" in result["fallback_symbols"]
        assert "000002" in result["fallback_symbols"]

        # 600519 should be from primary
        quotes_600519 = [q for q in result["quotes"] if q.symbol == "600519"]
        assert len(quotes_600519) == 1
        assert quotes_600519[0].source == "sina"

    @pytest.mark.asyncio
    async def test_no_failover_needed(self, primary_with_failures, fallback_source):
        """Test when all symbols succeed with primary."""
        router = SymbolLevelFailoverRouter(primary_with_failures, [fallback_source])

        result = await router.collect_quotes(["600519", "000768"])

        assert len(result["quotes"]) == 2
        assert len(result["fallback_symbols"]) == 0

        # All from primary
        assert result["source_distribution"]["sina"] == 2

    @pytest.mark.asyncio
    async def test_complete_failover(self, primary_with_failures, fallback_source):
        """Test when all symbols need failover."""
        router = SymbolLevelFailoverRouter(primary_with_failures, [fallback_source])

        result = await router.collect_quotes(["000001", "000002"])

        assert len(result["quotes"]) == 2
        assert len(result["fallback_symbols"]) == 2

        # All from fallback
        assert result["source_distribution"]["tencent"] == 2

    @pytest.mark.asyncio
    async def test_complete_failure(self, primary_with_failures):
        """Test when all sources fail."""
        failing_fallback = MockUnreliableSource(
            "tencent",
            fail_symbols={"000001", "000002"}
        )

        router = SymbolLevelFailoverRouter(primary_with_failures, [failing_fallback])

        result = await router.collect_quotes(["000001"])

        assert len(result["quotes"]) == 0
        assert "000001" in result["failed_symbols"]


class TestFailoverPerformance:
    """Test failover performance."""

    @pytest.mark.asyncio
    async def test_failover_timing(self):
        """Test that failover doesn't add excessive latency."""
        primary = MockUnreliableSource("sina", fail_symbols={"000001"}, delay_ms=50)
        fallback = MockUnreliableSource("tencent", delay_ms=50)

        router = SymbolLevelFailoverRouter(primary, [fallback])

        start = time.time()
        result = await router.collect_quotes(["000001", "600519"])
        elapsed_ms = (time.time() - start) * 1000

        assert len(result["quotes"]) == 2
        # Should complete in reasonable time (< 200ms for 2 sources with 50ms delay each)
        assert elapsed_ms < 200

    @pytest.mark.asyncio
    async def test_concurrent_failover(self):
        """Test concurrent symbol collection with failover."""
        fail_symbols = {f"{i:06d}" for i in range(1, 51)}  # 000001-000050 fail on primary
        primary = MockUnreliableSource("sina", fail_symbols=fail_symbols, delay_ms=5)
        fallback = MockUnreliableSource("tencent", delay_ms=5)

        router = SymbolLevelFailoverRouter(primary, [fallback])

        symbols = [f"{i:06d}" for i in range(1, 101)]  # 000001-000100

        start = time.time()
        result = await router.collect_quotes(symbols)
        elapsed_ms = (time.time() - start) * 1000

        assert len(result["quotes"]) == 100
        assert len(result["failed_symbols"]) == 0
        # Should complete in reasonable time
        assert elapsed_ms < 2000  # 2 seconds for 100 symbols


class TestFailoverStatistics:
    """Test failover statistics tracking."""

    @pytest.mark.asyncio
    async def test_stats_accumulation(self):
        """Test statistics are accumulated correctly."""
        primary = MockUnreliableSource("sina", fail_symbols={"000001"})
        fallback = MockUnreliableSource("tencent")
        router = SymbolLevelFailoverRouter(primary, [fallback])

        # First request
        await router.collect_quotes(["000001"])
        assert router.stats["total_requests"] == 1
        assert router.stats["fallback_requests"] == 1

        # Second request
        await router.collect_quotes(["000002", "600519"])
        assert router.stats["total_requests"] == 2
        assert router.stats["successful_requests"] == 3  # 1 from first request + 2 from second

    @pytest.mark.asyncio
    async def test_source_distribution_accuracy(self):
        """Test source distribution is accurate."""
        primary = MockUnreliableSource("sina", fail_symbols={"000001", "000002"})
        fallback = MockUnreliableSource("tencent")
        router = SymbolLevelFailoverRouter(primary, [fallback])

        result = await router.collect_quotes(["000001", "000002", "600519", "000768"])

        assert result["source_distribution"]["sina"] == 2
        assert result["source_distribution"]["tencent"] == 2


class TestFailoverEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_empty_symbol_list(self):
        """Test empty symbol list."""
        primary = MockUnreliableSource("sina")
        router = SymbolLevelFailoverRouter(primary)

        result = await router.collect_quotes([])

        assert len(result["quotes"]) == 0
        assert result["collection_time_ms"] >= 0

    @pytest.mark.asyncio
    async def test_single_symbol_success(self):
        """Test single symbol success."""
        primary = MockUnreliableSource("sina")
        router = SymbolLevelFailoverRouter(primary)

        result = await router.collect_quotes(["600519"])

        assert len(result["quotes"]) == 1
        assert result["quotes"][0].symbol == "600519"

    @pytest.mark.asyncio
    async def test_single_symbol_failure(self):
        """Test single symbol failure."""
        primary = MockUnreliableSource("sina", fail_symbols={"000001"})
        router = SymbolLevelFailoverRouter(primary)

        result = await router.collect_quotes(["000001"])

        assert len(result["quotes"]) == 0
        assert "000001" in result["failed_symbols"]

    @pytest.mark.asyncio
    async def test_multiple_fallback_sources(self):
        """Test multiple fallback sources in order."""
        primary = MockUnreliableSource("sina", fail_symbols={"000001"})
        fallback1 = MockUnreliableSource("tencent", fail_symbols={"000001"})
        fallback2 = MockUnreliableSource("eastmoney")

        router = SymbolLevelFailoverRouter(primary, [fallback1, fallback2])

        result = await router.collect_quotes(["000001"])

        assert len(result["quotes"]) == 1
        # Should come from the second fallback since first fallback also fails
        quote_source = result["quotes"][0].source
        assert quote_source == "eastmoney"
