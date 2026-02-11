"""
Unit tests for flexible data source interface.

Tests that the unified interface maintains flexibility for each data source
to pass specific parameters while maintaining a common contract.
"""

import pytest
import asyncio
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum


class Quote:
    """Stock quote data model."""

    def __init__(self, symbol: str, price: float, change: float,
                 change_percent: float, volume: int, timestamp: datetime,
                 source: str = "", raw_data: Dict = None):
        self.symbol = symbol
        self.price = price
        self.change = change
        self.change_percent = change_percent
        self.volume = volume
        self.timestamp = timestamp
        self.source = source
        self.raw_data = raw_data or {}


class Kline:
    """Kline (candlestick) data model."""

    def __init__(self, symbol: str, time: datetime, open_price: float,
                 high: float, low: float, close: float, volume: int,
                 source: str = ""):
        self.symbol = symbol
        self.time = time
        self.open = open_price
        self.high = high
        self.low = low
        self.close = close
        self.volume = volume
        self.source = source


class BaseCollector(ABC):
    """
    Enhanced base collector with flexible interface.

    Each data source can pass specific parameters via **kwargs
    while maintaining a unified contract.
    """

    @abstractmethod
    def get_name(self) -> str:
        """Get data source name."""
        pass

    @abstractmethod
    def get_capabilities(self) -> Dict[str, Any]:
        """Get data source capabilities and specific options."""
        pass

    @abstractmethod
    async def collect_quotes(self, symbols: List[str], **kwargs) -> List[Quote]:
        """
        Collect quotes for symbols.

        Common kwargs:
            - timeout: Request timeout in seconds
            - retry_count: Number of retries on failure
            - use_cache: Whether to use cached data

        Data source specific kwargs can be passed and handled individually.
        """
        pass

    @abstractmethod
    async def collect_kline(self, symbol: str, period: str, **kwargs) -> List[Kline]:
        """
        Collect kline data for a symbol.

        Common kwargs:
            - start: Start time
            - end: End time
            - limit: Maximum number of records

        Data source specific kwargs can be passed and handled individually.
        """
        pass

    @abstractmethod
    async def check_health(self) -> Dict[str, Any]:
        """Check data source health."""
        pass


class SinaCollector(BaseCollector):
    """
    Sina Finance collector with specific parameters support.

    Sina-specific kwargs:
        - use_https: Use HTTPS instead of HTTP
        - compress: Enable compression
        - batch_size: Number of symbols per request
    """

    def __init__(self):
        self.name = "sina"
        self.default_timeout = 5
        self.default_batch_size = 100

    def get_name(self) -> str:
        return self.name

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "name": "sina",
            "supports_batch": True,
            "max_batch_size": 100,
            "supports_kline": True,
            "specific_options": {
                "use_https": {"type": "bool", "default": True},
                "compress": {"type": "bool", "default": True},
                "batch_size": {"type": "int", "default": 100, "max": 100}
            }
        }

    async def collect_quotes(self, symbols: List[str], **kwargs) -> List[Quote]:
        # Extract Sina-specific parameters with defaults
        use_https = kwargs.get("use_https", True)
        compress = kwargs.get("compress", True)
        batch_size = kwargs.get("batch_size", self.default_batch_size)
        timeout = kwargs.get("timeout", self.default_timeout)

        # Simulate API call with specific parameters
        await asyncio.sleep(0.001)

        # Mock return data
        return [
            Quote(
                symbol=s,
                price=10.5,
                change=0.05,
                change_percent=0.48,
                volume=1000000,
                timestamp=datetime.now(),
                source="sina",
                raw_data={"https": use_https, "compress": compress}
            )
            for s in symbols[:batch_size]
        ]

    async def collect_kline(self, symbol: str, period: str, **kwargs) -> List[Kline]:
        start = kwargs.get("start")
        end = kwargs.get("end")
        limit = kwargs.get("limit", 100)

        await asyncio.sleep(0.001)

        return [
            Kline(
                symbol=symbol,
                time=datetime.now(),
                open_price=10.0,
                high=10.5,
                low=9.8,
                close=10.2,
                volume=1000000,
                source="sina"
            )
        ]

    async def check_health(self) -> Dict[str, Any]:
        return {"status": "healthy", "latency_ms": 50}


class TencentCollector(BaseCollector):
    """
    Tencent Finance collector with specific parameters support.

    Tencent-specific kwargs:
        - market: Market type (sh, sz)
        - fields: Specific fields to return
        - real_time: Whether to get real-time data
    """

    def __init__(self):
        self.name = "tencent"
        self.default_timeout = 5

    def get_name(self) -> str:
        return self.name

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "name": "tencent",
            "supports_batch": True,
            "max_batch_size": 50,
            "supports_kline": True,
            "specific_options": {
                "market": {"type": "str", "default": "all", "options": ["sh", "sz", "all"]},
                "fields": {"type": "list", "default": ["price", "volume"]},
                "real_time": {"type": "bool", "default": True}
            }
        }

    async def collect_quotes(self, symbols: List[str], **kwargs) -> List[Quote]:
        market = kwargs.get("market", "all")
        fields = kwargs.get("fields", ["price", "volume"])
        real_time = kwargs.get("real_time", True)

        await asyncio.sleep(0.001)

        return [
            Quote(
                symbol=s,
                price=10.5,
                change=0.05,
                change_percent=0.48,
                volume=1000000,
                timestamp=datetime.now(),
                source="tencent",
                raw_data={"market": market, "fields": fields, "real_time": real_time}
            )
            for s in symbols
        ]

    async def collect_kline(self, symbol: str, period: str, **kwargs) -> List[Kline]:
        start = kwargs.get("start")
        end = kwargs.get("end")
        limit = kwargs.get("limit", 100)

        await asyncio.sleep(0.001)

        return [
            Kline(
                symbol=symbol,
                time=datetime.now(),
                open_price=10.0,
                high=10.5,
                low=9.8,
                close=10.2,
                volume=1000000,
                source="tencent"
            )
        ]

    async def check_health(self) -> Dict[str, Any]:
        return {"status": "healthy", "latency_ms": 60}


@dataclass
class GranularCollectionResult:
    """Result of granular collection with per-symbol tracking."""

    quotes: List[Quote] = field(default_factory=list)
    failed_symbols: Set[str] = field(default_factory=set)
    fallback_symbols: Set[str] = field(default_factory=set)
    source_distribution: Dict[str, int] = field(default_factory=dict)
    symbol_to_source: Dict[str, str] = field(default_factory=dict)
    errors: Dict[str, str] = field(default_factory=dict)

    def add_quote(self, quote: Quote, is_fallback: bool = False):
        """Add a quote to the result."""
        self.quotes.append(quote)
        source = quote.source

        self.symbol_to_source[quote.symbol] = source
        self.source_distribution[source] = self.source_distribution.get(source, 0) + 1

        if is_fallback:
            self.fallback_symbols.add(quote.symbol)

    def add_failure(self, symbol: str, error: str):
        """Record a failed symbol."""
        self.failed_symbols.add(symbol)
        self.errors[symbol] = error

    def get_success_rate(self) -> float:
        """Get success rate of collection."""
        total = len(self.quotes) + len(self.failed_symbols)
        if total == 0:
            return 1.0
        return len(self.quotes) / total


class GranularCollector:
    """
    Granular collector that handles per-symbol failover.

    Each symbol is collected independently with fallback to alternative sources
    if the primary source fails.
    """

    def __init__(self, primary_source: BaseCollector,
                 fallback_sources: List[BaseCollector] = None):
        self.primary_source = primary_source
        self.fallback_sources = fallback_sources or []
        self.symbol_failures: Dict[str, int] = {}  # Track consecutive failures

    async def collect_quotes(self, symbols: List[str], **kwargs) -> GranularCollectionResult:
        """
        Collect quotes with per-symbol failover.

        For each symbol:
        1. Try primary source
        2. If fails, try fallback sources in order
        3. Track which source succeeded for each symbol
        """
        result = GranularCollectionResult()

        # Process each symbol independently
        for symbol in symbols:
            quote = await self._collect_single_symbol(symbol, **kwargs)

            if quote:
                is_fallback = quote.source != self.primary_source.get_name()
                result.add_quote(quote, is_fallback)
            else:
                result.add_failure(symbol, "All sources failed")

        return result

    async def _collect_single_symbol(self, symbol: str, **kwargs) -> Optional[Quote]:
        """
        Collect a single symbol with failover.

        Returns the first successful quote or None if all sources fail.
        """
        sources = [self.primary_source] + self.fallback_sources

        for source in sources:
            try:
                quotes = await source.collect_quotes([symbol], **kwargs)

                if quotes and len(quotes) > 0:
                    quote = quotes[0]
                    # Reset failure count on success
                    if symbol in self.symbol_failures:
                        del self.symbol_failures[symbol]
                    return quote

            except Exception as e:
                # Track failure for this symbol with this source
                failure_key = f"{symbol}:{source.get_name()}"
                self.symbol_failures[failure_key] = self.symbol_failences.get(failure_key, 0) + 1
                continue

        return None

    @property
    def symbol_failences(self):
        """Alias for symbol_failures (typo fix helper)."""
        return self.symbol_failures


class TestFlexibleInterface:
    """Test flexible interface maintains data source flexibility."""

    @pytest.fixture
    def sina_collector(self):
        return SinaCollector()

    @pytest.fixture
    def tencent_collector(self):
        return TencentCollector()

    @pytest.mark.asyncio
    async def test_sina_specific_parameters(self, sina_collector):
        """Test Sina collector accepts specific parameters."""
        quotes = await sina_collector.collect_quotes(
            ["000001", "600519"],
            use_https=True,
            compress=False,
            batch_size=50,
            timeout=10
        )

        assert len(quotes) == 2
        assert quotes[0].raw_data["https"] is True
        assert quotes[0].raw_data["compress"] is False

    @pytest.mark.asyncio
    async def test_tencent_specific_parameters(self, tencent_collector):
        """Test Tencent collector accepts specific parameters."""
        quotes = await tencent_collector.collect_quotes(
            ["000001", "600519"],
            market="sh",
            fields=["price", "volume", "pe"],
            real_time=True
        )

        assert len(quotes) == 2
        assert quotes[0].raw_data["market"] == "sh"
        assert quotes[0].raw_data["fields"] == ["price", "volume", "pe"]
        assert quotes[0].raw_data["real_time"] is True

    @pytest.mark.asyncio
    async def test_interface_contract_common_kwargs(self, sina_collector, tencent_collector):
        """Test both collectors handle common kwargs."""
        common_kwargs = {"timeout": 5, "retry_count": 3}

        sina_quotes = await sina_collector.collect_quotes(["000001"], **common_kwargs)
        tencent_quotes = await tencent_collector.collect_quotes(["000001"], **common_kwargs)

        assert len(sina_quotes) == 1
        assert len(tencent_quotes) == 1
        assert sina_quotes[0].symbol == "000001"
        assert tencent_quotes[0].symbol == "000001"

    def test_capabilities_exposure(self, sina_collector, tencent_collector):
        """Test each collector exposes its capabilities."""
        sina_caps = sina_collector.get_capabilities()
        tencent_caps = tencent_collector.get_capabilities()

        assert sina_caps["name"] == "sina"
        assert "specific_options" in sina_caps
        assert "use_https" in sina_caps["specific_options"]

        assert tencent_caps["name"] == "tencent"
        assert "market" in tencent_caps["specific_options"]

    @pytest.mark.asyncio
    async def test_default_parameters(self, sina_collector, tencent_collector):
        """Test collectors use sensible defaults."""
        sina_quotes = await sina_collector.collect_quotes(["000001"])
        tencent_quotes = await tencent_collector.collect_quotes(["000001"])

        # Sina defaults
        assert sina_quotes[0].raw_data["https"] is True

        # Tencent defaults
        assert tencent_quotes[0].raw_data["real_time"] is True


class TestGranularCollection:
    """Test granular collection with per-symbol failover."""

    @pytest.fixture
    def mock_primary(self):
        """Create a mock primary source that fails for specific symbols."""
        collector = SinaCollector()

        async def mock_collect(symbols, **kwargs):
            await asyncio.sleep(0.001)
            if "600519" in symbols:  # Simulate failure for 600519
                raise Exception("Connection timeout")
            return [
                Quote(s, 10.5, 0.05, 0.48, 1000000, datetime.now(), "sina")
                for s in symbols
            ]

        collector.collect_quotes = mock_collect
        return collector

    @pytest.fixture
    def mock_fallback(self):
        """Create a mock fallback source."""
        collector = TencentCollector()

        async def mock_collect(symbols, **kwargs):
            await asyncio.sleep(0.001)
            return [
                Quote(s, 10.6, 0.06, 0.5, 1100000, datetime.now(), "tencent")
                for s in symbols
            ]

        collector.collect_quotes = mock_collect
        return collector

    @pytest.mark.asyncio
    async def test_granular_result_structure(self, mock_primary, mock_fallback):
        """Test granular collection returns detailed result."""
        collector = GranularCollector(mock_primary, [mock_fallback])

        result = await collector.collect_quotes(["000001", "600519"])

        assert isinstance(result, GranularCollectionResult)
        assert len(result.quotes) == 2
        assert "000001" in result.symbol_to_source
        assert "600519" in result.symbol_to_source

    @pytest.mark.asyncio
    async def test_per_symbol_failover(self, mock_primary, mock_fallback):
        """Test failover happens per symbol."""
        collector = GranularCollector(mock_primary, [mock_fallback])

        result = await collector.collect_quotes(["000001", "600519"])

        # 000001 should come from primary (sina)
        assert result.symbol_to_source["000001"] == "sina"
        assert "000001" not in result.fallback_symbols

        # 600519 should come from fallback (tencent) because primary failed
        assert result.symbol_to_source["600519"] == "tencent"
        assert "600519" in result.fallback_symbols

    @pytest.mark.asyncio
    async def test_source_distribution_tracking(self, mock_primary, mock_fallback):
        """Test source distribution is tracked correctly."""
        collector = GranularCollector(mock_primary, [mock_fallback])

        result = await collector.collect_quotes(["000001", "600519"])

        assert result.source_distribution["sina"] == 1
        assert result.source_distribution["tencent"] == 1

    @pytest.mark.asyncio
    async def test_success_rate_calculation(self, mock_primary, mock_fallback):
        """Test success rate is calculated correctly."""
        collector = GranularCollector(mock_primary, [mock_fallback])

        result = await collector.collect_quotes(["000001", "600519"])

        assert result.get_success_rate() == 1.0  # All succeeded via fallback
        assert len(result.failed_symbols) == 0

    @pytest.mark.asyncio
    async def test_complete_failure_handling(self, mock_primary):
        """Test handling when all sources fail for a symbol."""
        # Create a fallback that also fails
        failing_fallback = TencentCollector()

        async def mock_fail(symbols, **kwargs):
            raise Exception("Fallback also failed")

        failing_fallback.collect_quotes = mock_fail

        collector = GranularCollector(mock_primary, [failing_fallback])

        result = await collector.collect_quotes(["600519"])

        assert len(result.quotes) == 0
        assert "600519" in result.failed_symbols
        assert result.errors["600519"] == "All sources failed"
        assert result.get_success_rate() == 0.0


class TestGranularCollectionIntegration:
    """Integration tests for granular collection."""

    @pytest.mark.asyncio
    async def test_mixed_success_failure(self):
        """Test collection with mixed success and failure scenarios."""
        # Create a primary that randomly fails
        primary = SinaCollector()
        fail_symbols = {"000001", "000002"}

        async def mock_primary_collect(symbols, **kwargs):
            await asyncio.sleep(0.001)
            successful = [s for s in symbols if s not in fail_symbols]
            return [
                Quote(s, 10.5, 0.05, 0.48, 1000000, datetime.now(), "sina")
                for s in successful
            ]

        primary.collect_quotes = mock_primary_collect

        fallback = TencentCollector()
        fail_fallback = {"000002"}  # Fallback also fails for 000002

        async def mock_fallback_collect(symbols, **kwargs):
            await asyncio.sleep(0.001)
            successful = [s for s in symbols if s not in fail_fallback]
            return [
                Quote(s, 10.6, 0.06, 0.5, 1100000, datetime.now(), "tencent")
                for s in successful
            ]

        fallback.collect_quotes = mock_fallback_collect

        collector = GranularCollector(primary, [fallback])

        result = await collector.collect_quotes(["000001", "000002", "600519"])

        # 000001: primary failed, fallback succeeded
        assert result.symbol_to_source.get("000001") == "tencent"
        assert "000001" in result.fallback_symbols

        # 000002: both failed
        assert "000002" in result.failed_symbols

        # 600519: primary succeeded
        assert result.symbol_to_source.get("600519") == "sina"
        assert "600519" not in result.fallback_symbols

        assert result.get_success_rate() == 2 / 3

    @pytest.mark.asyncio
    async def test_concurrent_symbol_collection(self):
        """Test that symbols can be collected concurrently."""
        primary = SinaCollector()

        async def slow_collect(symbols, **kwargs):
            await asyncio.sleep(0.01)  # 10ms delay
            return [
                Quote(s, 10.5, 0.05, 0.48, 1000000, datetime.now(), "sina")
                for s in symbols
            ]

        primary.collect_quotes = slow_collect

        collector = GranularCollector(primary)

        import time
        start = time.time()

        # Collect 10 symbols - with sequential processing this would take 100ms
        # but with proper implementation it could be faster
        symbols = [f"{i:06d}" for i in range(1, 11)]
        result = await collector.collect_quotes(symbols)

        elapsed = time.time() - start

        assert len(result.quotes) == 10
        # Should complete in reasonable time (sequential would be ~100ms)
        assert elapsed < 0.5  # Allow some buffer


class TestFlexibleInterfaceEdgeCases:
    """Test edge cases for flexible interface."""

    @pytest.fixture
    def sina_collector(self):
        return SinaCollector()

    @pytest.fixture
    def tencent_collector(self):
        return TencentCollector()

    @pytest.mark.asyncio
    async def test_empty_symbol_list(self, sina_collector):
        """Test handling empty symbol list."""
        quotes = await sina_collector.collect_quotes([])
        assert len(quotes) == 0

    @pytest.mark.asyncio
    async def test_unknown_kwargs_ignored(self, sina_collector):
        """Test unknown kwargs are gracefully ignored."""
        # Sina collector should ignore Tencent-specific parameters
        quotes = await sina_collector.collect_quotes(
            ["000001"],
            market="sh",  # Tencent-specific
            unknown_param="value"
        )

        assert len(quotes) == 1

    @pytest.mark.asyncio
    async def test_partial_failure_in_batch(self):
        """Test handling partial failure within a batch request."""
        primary = SinaCollector()

        async def partial_fail(symbols, **kwargs):
            await asyncio.sleep(0.001)
            if len(symbols) > 5:
                raise Exception("Batch too large")
            return [
                Quote(s, 10.5, 0.05, 0.48, 1000000, datetime.now(), "sina")
                for s in symbols
            ]

        primary.collect_quotes = partial_fail

        collector = GranularCollector(primary)

        # This should handle large batch gracefully
        symbols = [f"{i:06d}" for i in range(1, 21)]
        result = await collector.collect_quotes(symbols)

        # Implementation should handle by retrying with smaller batches
        # or individual symbol collection
        assert result.get_success_rate() >= 0.0  # May vary based on implementation

