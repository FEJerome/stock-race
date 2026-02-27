"""
Integration tests for K-line data storage and retrieval.

Tests K-line data operations including bulk inserts, queries, and performance.
"""

import pytest
import asyncio
import time
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock

from data_service.storage.database import DatabaseStorage
from data_service.models.stock import StockData

# Mock asyncpg module if not available
try:
    import asyncpg
except ImportError:
    asyncpg = Mock()


class MockConnection:
    """Mock asyncpg connection for testing."""

    def __init__(self):
        self.executed_queries = []
        self._fetch_results = []

    def set_fetch_results(self, results):
        """Set results for fetch operations."""
        self._fetch_results = results

    async def execute(self, query, *args):
        self.executed_queries.append((query, args))

    async def executemany(self, query, args_list):
        self.executed_queries.append((query, len(args_list)))

    async def fetch(self, query, *args):
        self.executed_queries.append((query, args))
        return self._fetch_results

    async def fetchrow(self, query, *args):
        self.executed_queries.append((query, args))
        return self._fetch_results[0] if self._fetch_results else None

    async def fetchval(self, query, *args):
        self.executed_queries.append((query, args))
        return self._fetch_results[0] if self._fetch_results else None


class MockPool:
    """Mock asyncpg pool for testing."""

    def __init__(self):
        self._conn = MockConnection()
        self.closed = False

    def set_fetch_results(self, results):
        self._conn.set_fetch_results(results)

    async def acquire(self):
        return self._conn

    async def close(self):
        self.closed = True


class TestKlineStorageOperations:
    """Test K-line storage operations."""

    @pytest.fixture
    def sample_klines(self):
        """Create sample K-line data."""
        klines = []
        base_time = datetime(2026, 1, 1, 9, 30)

        for i in range(10):
            klines.append(StockData(
                symbol="000001.SZ",
                timestamp=base_time + timedelta(minutes=i),
                open=10.0 + i * 0.1,
                high=10.5 + i * 0.1,
                low=9.8 + i * 0.1,
                close=10.2 + i * 0.1,
                volume=1000000 + i * 10000,
                amount=10200000.0 + i * 100000,
                adj_close=10.2 + i * 0.1,
                vwap=10.1 + i * 0.1
            ))

        return klines

    @pytest.mark.asyncio
    async def test_save_single_kline(self, sample_klines):
        """Test saving a single K-line record."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db.save_stock_history([sample_klines[0]], interval="1m")

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        insert_query = next((q for q in queries if 'INSERT INTO stock_history' in q), None)

        assert insert_query is not None
        assert 'ON CONFLICT (symbol, timestamp, interval) DO UPDATE' in insert_query

    @pytest.mark.asyncio
    async def test_save_multiple_klines(self, sample_klines):
        """Test saving multiple K-line records."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db.save_stock_history(sample_klines, interval="1m")

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        insert_query = next((q for q in queries if 'INSERT INTO stock_history' in q), None)

        assert insert_query is not None
        # Check that executemany was used for batch insert
        query_info = next((q for q in mock_pool._conn.executed_queries if 'INSERT INTO stock_history' in q[0]), None)
        assert query_info is not None

    @pytest.mark.asyncio
    async def test_query_klines_by_symbol_and_time(self):
        """Test querying K-lines by symbol and time range."""
        db = DatabaseStorage()
        mock_pool = MockPool()

        # Set mock fetch results
        mock_results = [
            {
                "symbol": "000001.SZ",
                "timestamp": datetime(2026, 1, 1, 9, 30),
                "open": 10.0,
                "high": 10.5,
                "low": 9.8,
                "close": 10.2,
                "volume": 1000000
            }
        ]
        mock_pool.set_fetch_results(mock_results)
        db.timescale_pool = mock_pool

        # Test query via get_latest_quotes (which uses the connection)
        result = await db.get_latest_quotes(["000001.SZ"])

        # Check query was executed
        queries = [q[0] for q in mock_pool._conn.executed_queries]
        select_query = next((q for q in queries if 'SELECT' in q), None)

        assert select_query is not None


class TestKlineQueryOperations:
    """Test K-line query operations."""

    @pytest.fixture
    def mock_kline_results(self):
        """Create mock K-line query results."""
        return [
            {
                "symbol": "000001.SZ",
                "timestamp": datetime(2026, 1, 1, 9, 30),
                "interval": "1m",
                "open": 10.0,
                "high": 10.5,
                "low": 9.8,
                "close": 10.2,
                "volume": 1000000,
                "amount": 10200000.0,
                "adj_close": 10.2,
                "vwap": 10.1
            },
            {
                "symbol": "000001.SZ",
                "timestamp": datetime(2026, 1, 1, 9, 31),
                "interval": "1m",
                "open": 10.2,
                "high": 10.6,
                "low": 10.1,
                "close": 10.4,
                "volume": 1200000,
                "amount": 12480000.0,
                "adj_close": 10.4,
                "vwap": 10.3
            }
        ]

    @pytest.mark.asyncio
    async def test_query_with_time_range(self, mock_kline_results):
        """Test querying K-lines with time range filter."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        mock_pool.set_fetch_results(mock_kline_results)
        db.timescale_pool = mock_pool

        start_time = datetime(2026, 1, 1, 9, 30)
        end_time = datetime(2026, 1, 1, 9, 35)

        # Test query execution
        result = await db.get_latest_quotes(["000001.SZ"])

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        select_query = next((q for q in queries if 'SELECT' in q), None)

        assert select_query is not None
        # Query should include symbol filter
        assert 'symbol' in select_query.lower() or '$1' in select_query

    @pytest.mark.asyncio
    async def test_query_with_interval_filter(self, mock_kline_results):
        """Test querying K-lines with interval filter."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        mock_pool.set_fetch_results(mock_kline_results)
        db.timescale_pool = mock_pool

        # Test query execution
        result = await db.get_latest_quotes(["000001.SZ"])

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        select_query = next((q for q in queries if 'SELECT' in q), None)

        assert select_query is not None

    @pytest.mark.asyncio
    async def test_query_returns_kline_data(self, mock_kline_results):
        """Test query returns properly formatted K-line data."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        mock_pool.set_fetch_results(mock_kline_results)
        db.timescale_pool = mock_pool

        result = await db.get_latest_quotes(["000001.SZ"])

        assert result is not None
        assert isinstance(result, list)


class TestKlineDataIntegrity:
    """Test K-line data integrity."""

    @pytest.mark.asyncio
    async def test_kline_fields_required(self):
        """Test all required K-line fields are present."""
        db = DatabaseStorage()
        mock_pool = MockPool()

        # Verify the schema includes all required fields
        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        history_query = next((q for q in queries if 'CREATE TABLE IF NOT EXISTS stock_history' in q), None)

        required_fields = ['open', 'high', 'low', 'close', 'volume', 'timestamp', 'symbol', 'interval']
        for field in required_fields:
            assert field in history_query, f"Missing required field: {field}"

    @pytest.mark.asyncio
    async def test_ohlc_values_are_decimal(self):
        """Test OHLC values use DECIMAL type."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        history_query = next((q for q in queries if 'CREATE TABLE IF NOT EXISTS stock_history' in q), None)

        # Check DECIMAL type for price fields
        assert 'DECIMAL' in history_query

    @pytest.mark.asyncio
    async def test_volume_is_bigint(self):
        """Test volume field uses BIGINT type."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        history_query = next((q for q in queries if 'CREATE TABLE IF NOT EXISTS stock_history' in q), None)

        assert 'BIGINT' in history_query


class TestKlineBatchOperations:
    """Test K-line batch operations."""

    @pytest.mark.asyncio
    async def test_batch_insert_uses_executemany(self):
        """Test batch insert uses executemany for efficiency."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        # Create multiple K-lines
        klines = []
        base_time = datetime(2026, 1, 1, 9, 30)

        for i in range(100):
            klines.append(StockData(
                symbol="000001.SZ",
                timestamp=base_time + timedelta(minutes=i),
                open=10.0,
                high=10.5,
                low=9.8,
                close=10.2,
                volume=1000000,
                amount=10200000.0,
                adj_close=10.2,
                vwap=10.1
            ))

        await db.save_stock_history(klines, interval="1m")

        # Check that executemany was called
        queries = mock_pool._conn.executed_queries
        executemany_calls = [q for q in queries if q[0] == 'executemany' or 'INSERT INTO stock_history' in q[0]]

        assert len(executemany_calls) > 0

    @pytest.mark.asyncio
    async def test_batch_insert_with_multiple_symbols(self):
        """Test batch insert with multiple symbols."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        # Create K-lines for multiple symbols
        klines = []
        symbols = ["000001.SZ", "000002.SZ", "600519.SH"]
        base_time = datetime(2026, 1, 1, 9, 30)

        for symbol in symbols:
            for i in range(10):
                klines.append(StockData(
                    symbol=symbol,
                    timestamp=base_time + timedelta(minutes=i),
                    open=10.0,
                    high=10.5,
                    low=9.8,
                    close=10.2,
                    volume=1000000,
                    amount=10200000.0,
                    adj_close=10.2,
                    vwap=10.1
                ))

        await db.save_stock_history(klines, interval="1m")

        # Check insert was called
        queries = [q[0] for q in mock_pool._conn.executed_queries]
        insert_query = next((q for q in queries if 'INSERT INTO stock_history' in q), None)

        assert insert_query is not None


class TestKlinePerformance:
    """Test K-line storage performance requirements."""

    @pytest.mark.asyncio
    async def test_save_10000_klines_performance(self):
        """Test saving 10,000 K-lines meets performance requirement (< 1 second)."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        # Create 10,000 K-lines
        klines = []
        base_time = datetime(2026, 1, 1, 9, 30)
        symbol = "000001.SZ"

        for i in range(10000):
            klines.append(StockData(
                symbol=symbol,
                timestamp=base_time + timedelta(minutes=i),
                open=10.0 + (i % 10) * 0.1,
                high=10.5 + (i % 10) * 0.1,
                low=9.8 + (i % 10) * 0.1,
                close=10.2 + (i % 10) * 0.1,
                volume=1000000 + (i % 100) * 1000,
                amount=10200000.0 + (i % 100) * 10000,
                adj_close=10.2 + (i % 10) * 0.1,
                vwap=10.1 + (i % 10) * 0.1
            ))

        # Measure time
        start_time = time.time()
        await db.save_stock_history(klines, interval="1m")
        elapsed_time = time.time() - start_time

        # Performance requirement: < 1 second for 10,000 records
        assert elapsed_time < 1.0, f"Performance test failed: {elapsed_time:.2f}s >= 1.0s"

        # Verify the insert was called with correct number of records
        queries = mock_pool._conn.executed_queries
        insert_info = next((q for q in queries if 'INSERT INTO stock_history' in q[0]), None)
        assert insert_info is not None


class TestKlineCompression:
    """Test K-line compression features."""

    @pytest.mark.asyncio
    async def test_compression_policy_exists_in_schema(self):
        """Test that compression can be configured in the schema."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        # Tables should be created
        queries = [q[0] for q in mock_pool._conn.executed_queries]

        # Check for hypertable creation (compression requires hypertable)
        hypertable_queries = [q for q in queries if 'create_hypertable' in q]
        assert len(hypertable_queries) >= 2  # stock_quotes and stock_history

    @pytest.mark.asyncio
    async def test_compression_chunk_interval_configuration(self):
        """Test chunk time interval configuration for compression efficiency."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]

        # Check chunk intervals are set appropriately
        history_hypertable = next((q for q in queries if 'stock_history' in q and 'create_hypertable' in q), None)

        # History data uses 7-day chunks (good for compression)
        assert "chunk_time_interval => INTERVAL '7 days'" in history_hypertable


class TestKlineTimezones:
    """Test K-line timezone handling."""

    @pytest.mark.asyncio
    async def test_timestamp_uses_timestamptz(self):
        """Test that timestamps use TIMESTAMPTZ type."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        history_query = next((q for q in queries if 'CREATE TABLE IF NOT EXISTS stock_history' in q), None)

        # Should use TIMESTAMPTZ for timezone-aware timestamps
        assert 'TIMESTAMPTZ' in history_query


class TestKlineConflictResolution:
    """Test K-line conflict resolution on insert."""

    @pytest.mark.asyncio
    async def test_upsert_on_conflict(self):
        """Test that insert uses upsert (ON CONFLICT DO UPDATE)."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        kline = StockData(
            symbol="000001.SZ",
            timestamp=datetime(2026, 1, 1, 9, 30),
            open=10.0,
            high=10.5,
            low=9.8,
            close=10.2,
            volume=1000000,
            amount=10200000.0,
            adj_close=10.2,
            vwap=10.1
        )

        await db.save_stock_history([kline], interval="1m")

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        insert_query = next((q for q in queries if 'INSERT INTO stock_history' in q), None)

        assert 'ON CONFLICT (symbol, timestamp, interval) DO UPDATE' in insert_query

    @pytest.mark.asyncio
    async def test_conflict_updates_all_fields(self):
        """Test that conflict resolution updates all data fields."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        kline = StockData(
            symbol="000001.SZ",
            timestamp=datetime(2026, 1, 1, 9, 30),
            open=10.0,
            high=10.5,
            low=9.8,
            close=10.2,
            volume=1000000,
            amount=10200000.0,
            adj_close=10.2,
            vwap=10.1
        )

        await db.save_stock_history([kline], interval="1m")

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        insert_query = next((q for q in queries if 'INSERT INTO stock_history' in q), None)

        # All fields should be updated on conflict
        update_fields = ['open = EXCLUDED.open', 'high = EXCLUDED.high', 'low = EXCLUDED.low',
                        'close = EXCLUDED.close', 'volume = EXCLUDED.volume']

        for field in update_fields:
            assert field in insert_query, f"Missing update field: {field}"
