"""
Integration tests for new data sources: AkShare, Baostock, Tushare

Tests real data sources without mocks.
Requires network connectivity and valid credentials (for Tushare).
"""
import pytest
import pytest_asyncio
import asyncio
import os
from typing import List

from services.market_data import (
    AkShareDataSource,
    BaostockDataSource,
    TushareDataSource,
    DataSourceRouter,
    Quote,
    DataSourceStatus,
)


# Test symbols
TEST_SYMBOLS = ["000001.SZ", "600000.SH"]
POPULAR_SYMBOLS = [
    "600000.SH", "600036.SH", "600519.SH",
    "000001.SZ", "000002.SZ", "000858.SZ",
]


@pytest_asyncio.fixture
async def akshare_source():
    """Create and cleanup AkShare data source"""
    source = AkShareDataSource(name="akshare", priority=70)
    yield source
    await source.close()


@pytest_asyncio.fixture
async def baostock_source():
    """Create and cleanup Baostock data source"""
    source = BaostockDataSource(name="baostock", priority=80)
    await source.login()
    yield source
    await source.close()


@pytest_asyncio.fixture
async def tushare_source():
    """Create and cleanup Tushare data source"""
    source = TushareDataSource(name="tushare", priority=75)
    yield source
    await source.close()


@pytest.mark.asyncio
class TestAkShareDataSource:
    """Tests for AkShare data source"""

    async def test_get_quote_single_stock(self, akshare_source):
        """Test fetching single stock quote from AkShare"""
        quote = await akshare_source.get_quote("000001.SZ")

        # AkShare may fail due to network issues, so we just check structure
        if quote is not None:
            assert isinstance(quote, Quote)
            assert quote.symbol == "000001.SZ"
            assert quote.name is not None
            assert quote.price >= 0
            assert quote.volume >= 0
            assert quote.source == "akshare"
            print(f"\n[AkShare] {quote.symbol} {quote.name}: ¥{quote.price}")
        else:
            print("\n[AkShare] Quote unavailable (network/data issue)")

    async def test_get_quotes_batch(self, akshare_source):
        """Test batch fetching from AkShare"""
        quotes = await akshare_source.get_quotes(TEST_SYMBOLS)

        assert len(quotes) == len(TEST_SYMBOLS)

        success_count = sum(1 for q in quotes.values() if q is not None)
        print(f"\n[AkShare Batch] Success: {success_count}/{len(TEST_SYMBOLS)}")

        for symbol, quote in quotes.items():
            if quote:
                assert quote.symbol == symbol.upper()

    async def test_get_all_stocks(self, akshare_source):
        """Test fetching all stocks"""
        quotes = await akshare_source.get_all_stocks()

        # Should return some stocks if successful
        print(f"\n[AkShare All] Fetched {len(quotes)} stocks")

        if quotes:
            for q in quotes[:3]:
                print(f"  - {q.symbol}: {q.name} @ ¥{q.price}")

    async def test_get_historical_data(self, akshare_source):
        """Test fetching historical data"""
        data = await akshare_source.get_historical_data(
            "000001.SZ",
            period="daily",
            days=5
        )

        print(f"\n[AkShare History] Fetched {len(data)} days")

        if data:
            for d in data[:3]:
                print(f"  - {d['date']}: O={d['open']}, H={d['high']}, L={d['low']}, C={d['close']}")

    async def test_health_check(self, akshare_source):
        """Test AkShare health check"""
        health = await akshare_source.health_check()

        assert health is not None
        assert health.source_name == "akshare"
        assert health.status in [DataSourceStatus.HEALTHY, DataSourceStatus.DEGRADED, DataSourceStatus.UNAVAILABLE]

        print(f"\n[AkShare Health] Status: {health.status.value}, Latency: {health.latency_ms:.2f}ms")


@pytest.mark.asyncio
class TestBaostockDataSource:
    """Tests for Baostock data source"""

    async def test_login(self, baostock_source):
        """Test Baostock login"""
        # Login is done in fixture, just verify we're logged in
        assert baostock_source._logged_in
        print("\n[Baostock] Login successful")

    async def test_get_stock_list(self, baostock_source):
        """Test fetching stock list"""
        stocks = await baostock_source.get_stock_list()

        print(f"\n[Baostock] Fetched {len(stocks)} stocks")

        if stocks:
            for s in stocks[:3]:
                print(f"  - {s['symbol']}: {s['name']}")

    async def test_get_quote(self, baostock_source):
        """Test fetching quote"""
        quote = await baostock_source.get_quote("000001.SZ")

        if quote:
            assert isinstance(quote, Quote)
            assert quote.symbol == "000001.SZ"
            assert quote.price > 0
            print(f"\n[Baostock] {quote.symbol} {quote.name}: ¥{quote.price}")
        else:
            print("\n[Baostock] Quote unavailable (market closed or data issue)")

    async def test_get_fundamentals(self, baostock_source):
        """Test fetching fundamental data"""
        fundamentals = await baostock_source.get_fundamentals("000001.SZ")

        print(f"\n[Baostock Fundamentals] {fundamentals}")

        if fundamentals:
            print(f"  PE_TTM: {fundamentals.get('pe_ttm')}")
            print(f"  PB_MRQ: {fundamentals.get('pb_mrq')}")

    async def test_get_historical_data(self, baostock_source):
        """Test fetching historical data"""
        data = await baostock_source.get_historical_data(
            "000001.SZ",
            days=5
        )

        print(f"\n[Baostock History] Fetched {len(data)} days")

        if data:
            for d in data[:3]:
                print(f"  - {d['date']}: O={d['open']}, H={d['high']}, L={d['low']}, C={d['close']}")

    async def test_health_check(self, baostock_source):
        """Test Baostock health check"""
        health = await baostock_source.health_check()

        assert health is not None
        assert health.source_name == "baostock"

        print(f"\n[Baostock Health] Status: {health.status.value}, Latency: {health.latency_ms:.2f}ms")


@pytest.mark.asyncio
class TestTushareDataSource:
    """Tests for Tushare data source"""

    async def test_initialization_without_token(self):
        """Test Tushare fails gracefully without token"""
        source = TushareDataSource(name="tushare_no_token", token=None)
        assert source._token is None

        health = await source.health_check()
        assert health.status == DataSourceStatus.UNAVAILABLE

    async def test_get_stock_list(self, tushare_source):
        """Test fetching stock list"""
        if not tushare_source._token:
            pytest.skip("TUSHARE_TOKEN not set")

        stocks = await tushare_source.get_stock_list()

        print(f"\n[Tushare] Fetched {len(stocks)} stocks")

        if stocks:
            for s in stocks[:3]:
                print(f"  - {s['symbol']}: {s['name']} ({s.get('industry', '')})")

    async def test_get_quote(self, tushare_source):
        """Test fetching quote"""
        if not tushare_source._token:
            pytest.skip("TUSHARE_TOKEN not set")

        quote = await tushare_source.get_quote("000001.SZ")

        if quote:
            assert isinstance(quote, Quote)
            assert quote.symbol == "000001.SZ"
            assert quote.price > 0
            print(f"\n[Tushare] {quote.symbol} {quote.name}: ¥{quote.price}")
        else:
            print("\n[Tushare] Quote unavailable")

    async def test_get_daily_basic(self, tushare_source):
        """Test fetching daily basic indicators"""
        if not tushare_source._token:
            pytest.skip("TUSHARE_TOKEN not set")

        data = await tushare_source.get_daily_basic("000001.SZ")

        if data:
            print(f"\n[Tushare Daily Basic] {data['symbol']}")
            print(f"  PE: {data.get('pe')}")
            print(f"  PB: {data.get('pb')}")
            print(f"  Turnover: {data.get('turnover_rate')}%")
            print(f"  Market Cap: {data.get('total_mv')}万")

    async def test_get_financial_data(self, tushare_source):
        """Test fetching financial data"""
        if not tushare_source._token:
            pytest.skip("TUSHARE_TOKEN not set")

        data = await tushare_source.get_financial_data("000001.SZ")

        if data:
            print(f"\n[Tushare Financials] {data['symbol']}")
            if data.get('income'):
                print(f"  Revenue: {data['income'].get('total_revenue')}")
            if data.get('indicators'):
                print(f"  ROE: {data['indicators'].get('roe')}%")

    async def test_health_check(self, tushare_source):
        """Test Tushare health check"""
        health = await tushare_source.health_check()

        assert health is not None
        assert health.source_name == "tushare"

        print(f"\n[Tushare Health] Status: {health.status.value}, Latency: {health.latency_ms:.2f}ms")


@pytest.mark.asyncio
class TestDataSourceRouterWithNewSources:
    """Test router with new data sources"""

    async def test_router_with_all_sources(self):
        """Test router with all sources registered"""
        router = DataSourceRouter()

        # Register all sources
        sources = [
            TushareDataSource(name="tushare", priority=75),
            BaostockDataSource(name="baostock", priority=80),
            AkShareDataSource(name="akshare", priority=70),
        ]

        # Login to baostock
        await sources[1].login()

        for source in sources:
            router.register_source(source, weight=1.0)

        # Check all sources are registered
        source_names = router.list_sources()
        print(f"\n[Router] Registered sources: {source_names}")

        assert "tushare" in source_names
        assert "baostock" in source_names
        assert "akshare" in source_names

        # Cleanup
        for source in sources:
            await source.close()

    async def test_router_health_check(self):
        """Test router health check with new sources"""
        router = DataSourceRouter()

        # Register sources
        akshare = AkShareDataSource(name="akshare", priority=70)
        baostock = BaostockDataSource(name="baostock", priority=80)
        await baostock.login()

        router.register_source(akshare, weight=1.0)
        router.register_source(baostock, weight=0.8)

        # Health check
        health = await router.health_check()

        print(f"\n[Router Health] Checked {len(health)} sources")
        for name, status in health.items():
            print(f"  {name}: {status.status.value}")

        # Cleanup
        await akshare.close()
        await baostock.close()


@pytest.mark.asyncio
async def test_circuit_breaker():
    """Test circuit breaker functionality"""
    from services.market_data.collector import CircuitBreaker, CircuitState

    cb = CircuitBreaker(failure_threshold=3, recovery_timeout=0.1)

    # Initially closed
    assert cb.state == CircuitState.CLOSED
    assert cb.can_execute()

    # Record failures
    cb.record_failure()
    cb.record_failure()
    assert cb.state == CircuitState.CLOSED  # Still closed

    cb.record_failure()
    assert cb.state == CircuitState.OPEN  # Now open
    assert not cb.can_execute()

    # Wait for recovery
    await asyncio.sleep(0.15)
    assert cb.can_execute()  # Should be half-open
    assert cb.state == CircuitState.HALF_OPEN

    # Record success to close
    cb.record_success()
    assert cb.state == CircuitState.CLOSED
    assert cb.can_execute()

    print("\n[Circuit Breaker] All tests passed")


@pytest.mark.asyncio
async def test_symbol_normalization():
    """Test symbol normalization across sources"""
    akshare = AkShareDataSource()
    baostock = BaostockDataSource()
    tushare = TushareDataSource()

    test_cases = [
        ("000001.SZ", "sz000001", "sz.000001", "000001.SZ"),
        ("600000.SH", "sh600000", "sh.600000", "600000.SH"),
    ]

    print("\n[Symbol Normalization]")
    for standard, ak_expected, bs_expected, ts_expected in test_cases:
        ak_result = akshare._normalize_symbol(standard)
        bs_result = baostock._normalize_symbol(standard)
        ts_result = tushare._normalize_symbol(standard)

        print(f"  {standard}:")
        print(f"    AkShare: {ak_result} (expected {ak_expected})")
        print(f"    Baostock: {bs_result} (expected {bs_expected})")
        print(f"    Tushare: {ts_result} (expected {ts_expected})")

        assert ak_result == ak_expected
        assert bs_result == bs_expected
        assert ts_result == ts_expected

    await akshare.close()
    await baostock.close()
    await tushare.close()
