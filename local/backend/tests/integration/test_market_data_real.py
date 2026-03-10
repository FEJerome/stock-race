"""
Real Market Data Integration Tests

Tests real data sources (Sina, Tencent, EastMoney) without mocks.
Requires network connectivity to external APIs.
"""
import pytest
import pytest_asyncio
import asyncio
from typing import List

from services.market_data import (
    SinaDataSource,
    TencentDataSource,
    EastMoneyDataSource,
    DataSourceRouter,
    Quote,
    DataSourceStatus,
)


# Test symbols
TEST_SYMBOLS = ["000001.SZ", "600000.SH"]  # 平安银行, 浦发银行
POPULAR_SYMBOLS = [
    "600000.SH", "600036.SH", "600519.SH",  # Shanghai
    "000001.SZ", "000002.SZ", "000858.SZ",  # Shenzhen
    "002415.SZ", "002594.SZ",               # SME
    "300059.SZ", "300750.SZ"                # ChiNext
]


@pytest_asyncio.fixture
async def sina_source():
    """Create and cleanup Sina data source"""
    source = SinaDataSource(name="sina", priority=50)
    yield source
    await source.close()


@pytest_asyncio.fixture
async def tencent_source():
    """Create and cleanup Tencent data source"""
    source = TencentDataSource(name="tencent", priority=40)
    yield source
    await source.close()


@pytest_asyncio.fixture
async def eastmoney_source():
    """Create and cleanup EastMoney data source"""
    source = EastMoneyDataSource(name="eastmoney", priority=60)
    yield source
    await source.close()


@pytest_asyncio.fixture
async def router():
    """Create and cleanup router with all sources"""
    router = DataSourceRouter()

    # Register all sources
    sources = [
        TencentDataSource(name="tencent", priority=40),
        SinaDataSource(name="sina", priority=50),
        EastMoneyDataSource(name="eastmoney", priority=60),
    ]

    for source in sources:
        router.register_source(source, weight=1.0)

    yield router

    # Cleanup
    for source in sources:
        await source.close()


@pytest.mark.asyncio
class TestSinaDataSource:
    """Tests for Sina Finance data source"""

    async def test_get_quote_single_stock(self, sina_source):
        """Test fetching single stock quote from Sina"""
        quote = await sina_source.get_quote("000001.SZ")

        assert quote is not None, "Failed to fetch quote from Sina"
        assert isinstance(quote, Quote)
        assert quote.symbol == "000001.SZ"
        assert quote.name is not None and len(quote.name) > 0
        assert quote.price > 0, f"Invalid price: {quote.price}"
        assert quote.volume >= 0, f"Invalid volume: {quote.volume}"
        assert quote.source == "sina"
        assert quote.timestamp is not None

        print(f"\n[Sina] {quote.symbol} {quote.name}: ¥{quote.price} ({quote.change_percent:+.2f}%)")

    async def test_get_quote_shanghai_stock(self, sina_source):
        """Test fetching Shanghai stock quote"""
        quote = await sina_source.get_quote("600000.SH")

        assert quote is not None, "Failed to fetch Shanghai stock from Sina"
        assert quote.symbol == "600000.SH"
        assert quote.price > 0

        print(f"\n[Sina] {quote.symbol} {quote.name}: ¥{quote.price}")

    async def test_get_quotes_batch(self, sina_source):
        """Test batch fetching multiple stocks"""
        quotes = await sina_source.get_quotes(TEST_SYMBOLS)

        assert len(quotes) == len(TEST_SYMBOLS)

        for symbol in TEST_SYMBOLS:
            assert symbol in quotes
            quote = quotes[symbol]
            assert quote is not None, f"Failed to fetch {symbol}"
            assert quote.symbol == symbol
            assert quote.price > 0

        success_count = sum(1 for q in quotes.values() if q is not None)
        print(f"\n[Sina Batch] Fetched {success_count}/{len(TEST_SYMBOLS)} stocks successfully")

    async def test_get_all_stocks(self, sina_source):
        """Test fetching popular stocks list"""
        quotes = await sina_source.get_all_stocks()

        assert len(quotes) > 0, "No stocks returned"
        assert all(isinstance(q, Quote) for q in quotes)
        assert all(q.price > 0 for q in quotes)

        print(f"\n[Sina All] Fetched {len(quotes)} popular stocks")
        for q in quotes[:3]:
            print(f"  - {q.symbol}: {q.name} @ ¥{q.price}")

    async def test_health_check(self, sina_source):
        """Test Sina health check"""
        health = await sina_source.health_check()

        assert health is not None
        assert health.source_name == "sina"
        assert health.status in [DataSourceStatus.HEALTHY, DataSourceStatus.DEGRADED, DataSourceStatus.UNAVAILABLE]
        assert health.latency_ms >= 0

        print(f"\n[Sina Health] Status: {health.status.value}, Latency: {health.latency_ms:.2f}ms")

    async def test_symbol_normalization(self, sina_source):
        """Test various symbol format inputs"""
        formats = ["000001.SZ", "000001", "sz000001", "SZ000001"]

        for fmt in formats:
            quote = await sina_source.get_quote(fmt)
            if quote:
                assert quote.price > 0
                print(f"\n[Sina] Format '{fmt}' -> Success: {quote.name} @ ¥{quote.price}")
                break


@pytest.mark.asyncio
class TestTencentDataSource:
    """Tests for Tencent Finance data source"""

    async def test_get_quote_single_stock(self, tencent_source):
        """Test fetching single stock quote from Tencent"""
        quote = await tencent_source.get_quote("000001.SZ")

        assert quote is not None, "Failed to fetch quote from Tencent"
        assert isinstance(quote, Quote)
        assert quote.symbol == "000001.SZ"
        assert quote.name is not None and len(quote.name) > 0
        assert quote.price > 0, f"Invalid price: {quote.price}"
        assert quote.source == "tencent"

        print(f"\n[Tencent] {quote.symbol} {quote.name}: ¥{quote.price} ({quote.change_percent:+.2f}%)")

    async def test_get_quotes_batch(self, tencent_source):
        """Test batch fetching from Tencent"""
        quotes = await tencent_source.get_quotes(TEST_SYMBOLS)

        success_count = sum(1 for q in quotes.values() if q is not None)
        assert success_count > 0, "Failed to fetch any quotes from Tencent"

        print(f"\n[Tencent Batch] Success: {success_count}/{len(TEST_SYMBOLS)}")

    async def test_health_check(self, tencent_source):
        """Test Tencent health check"""
        health = await tencent_source.health_check()

        assert health is not None
        assert health.source_name == "tencent"
        assert health.latency_ms >= 0

        print(f"\n[Tencent Health] Status: {health.status.value}, Latency: {health.latency_ms:.2f}ms")


@pytest.mark.asyncio
class TestEastMoneyDataSource:
    """Tests for East Money data source"""

    async def test_get_quote_single_stock(self, eastmoney_source):
        """Test fetching single stock quote from East Money"""
        quote = await eastmoney_source.get_quote("000001.SZ")

        assert quote is not None, "Failed to fetch quote from East Money"
        assert isinstance(quote, Quote)
        assert quote.symbol == "000001.SZ"
        assert quote.price > 0
        assert quote.source == "eastmoney"

        print(f"\n[EastMoney] {quote.symbol} {quote.name}: ¥{quote.price} ({quote.change_percent:+.2f}%)")

    async def test_get_quote_with_full_data(self, eastmoney_source):
        """Test East Money returns complete quote data"""
        quote = await eastmoney_source.get_quote("600000.SH")

        assert quote is not None
        assert quote.open is not None and quote.open > 0
        assert quote.high is not None and quote.high > 0
        assert quote.low is not None and quote.low > 0
        assert quote.prev_close is not None and quote.prev_close > 0
        assert quote.volume >= 0

        print(f"\n[EastMoney Full] OHLC: {quote.open}/{quote.high}/{quote.low}/{quote.price}")

    async def test_health_check(self, eastmoney_source):
        """Test East Money health check"""
        health = await eastmoney_source.health_check()

        assert health is not None
        assert health.source_name == "eastmoney"

        print(f"\n[EastMoney Health] Status: {health.status.value}, Latency: {health.latency_ms:.2f}ms")


@pytest.mark.asyncio
class TestDataSourceRouter:
    """Tests for data source router with real sources"""

    async def test_router_get_quote_with_failover(self, router):
        """Test router fetches quote with automatic failover"""
        quote = await router.get_quote("000001.SZ")

        assert quote is not None, "Router failed to fetch quote from any source"
        assert quote.price > 0
        assert quote.source is not None

        print(f"\n[Router] Fetched from {quote.source}: {quote.name} @ ¥{quote.price}")

    async def test_router_get_quotes_aggregation(self, router):
        """Test router aggregates data from multiple sources"""
        market_data = await router.get_quotes(TEST_SYMBOLS)

        assert len(market_data) > 0

        for symbol, data in market_data.items():
            assert data.symbol == symbol
            assert data.price > 0
            assert len(data.sources) > 0
            assert 0 <= data.confidence <= 1

        print(f"\n[Router Aggregation] Aggregated {len(market_data)} stocks")
        for symbol, data in list(market_data.items())[:2]:
            print(f"  - {symbol}: ¥{data.price:.2f} (sources: {', '.join(data.sources)}, confidence: {data.confidence})")

    async def test_router_health_check_all_sources(self, router):
        """Test router health check for all registered sources"""
        health_map = await router.health_check()

        assert len(health_map) == 3  # tencent, sina, eastmoney

        for name, health in health_map.items():
            assert health.source_name == name
            print(f"\n[Router Health] {name}: {health.status.value}, {health.latency_ms:.2f}ms")

    async def test_router_source_stats(self, router):
        """Test router source statistics"""
        # First do a health check to populate stats
        await router.health_check()

        stats = router.get_source_stats()

        assert len(stats) == 3
        for name, stat in stats.items():
            assert "priority" in stat
            assert "weight" in stat
            print(f"\n[Router Stats] {name}: priority={stat['priority']}, weight={stat['weight']:.2f}")


@pytest.mark.asyncio
class TestDataSourceComparison:
    """Compare data from different sources"""

    async def test_price_consistency_across_sources(self):
        """Test that different sources return similar prices"""
        sina = SinaDataSource(name="sina")
        tencent = TencentDataSource(name="tencent")
        eastmoney = EastMoneyDataSource(name="eastmoney")

        try:
            symbol = "000001.SZ"

            sina_quote = await sina.get_quote(symbol)
            tencent_quote = await tencent.get_quote(symbol)
            eastmoney_quote = await eastmoney.get_quote(symbol)

            quotes = [q for q in [sina_quote, tencent_quote, eastmoney_quote] if q]
            assert len(quotes) >= 2, "Less than 2 sources returned data"

            prices = [q.price for q in quotes]
            price_variance = max(prices) - min(prices)
            avg_price = sum(prices) / len(prices)
            variance_pct = (price_variance / avg_price) * 100 if avg_price > 0 else 0

            print(f"\n[Price Comparison] {symbol}")
            for q in quotes:
                print(f"  {q.source}: ¥{q.price}")
            print(f"  Variance: {price_variance:.2f} ({variance_pct:.2f}%)")

            # Allow up to 1% variance between sources
            assert variance_pct < 1.0, f"Price variance too high: {variance_pct:.2f}%"

        finally:
            await sina.close()
            await tencent.close()
            await eastmoney.close()


@pytest.mark.asyncio
async def test_all_sources_concurrent():
    """Test all sources concurrently for performance comparison"""
    import time

    sources = {
        "tencent": TencentDataSource(name="tencent"),
        "sina": SinaDataSource(name="sina"),
        "eastmoney": EastMoneyDataSource(name="eastmoney"),
    }

    try:
        symbol = "000001.SZ"
        results = {}

        async def fetch_with_timing(name: str, source):
            start = time.time()
            quote = await source.get_quote(symbol)
            latency = (time.time() - start) * 1000
            return name, quote, latency

        # Fetch concurrently
        tasks = [fetch_with_timing(name, source) for name, source in sources.items()]
        completed = await asyncio.gather(*tasks, return_exceptions=True)

        print(f"\n[Concurrent Performance] {symbol}")
        for result in completed:
            if isinstance(result, Exception):
                print(f"  Error: {result}")
                continue
            name, quote, latency = result
            if quote:
                print(f"  {name}: {latency:.2f}ms - {quote.name} @ ¥{quote.price}")
            else:
                print(f"  {name}: {latency:.2f}ms - FAILED")

    finally:
        for source in sources.values():
            await source.close()
