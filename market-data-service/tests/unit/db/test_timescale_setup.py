"""
Unit tests for TimescaleDB setup and configuration.

Tests database initialization, table creation, and hypertable configuration.
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock, call

from data_service.storage.database import DatabaseStorage
from data_service.models.stock import StockQuote, StockData

# Mock asyncpg module if not available
try:
    import asyncpg
except ImportError:
    asyncpg = Mock()


class MockConnection:
    """Mock asyncpg connection for testing."""

    def __init__(self):
        self.executed_queries = []

    async def execute(self, query, *args):
        self.executed_queries.append((query, args))

    async def executemany(self, query, args_list):
        self.executed_queries.append((query, len(args_list)))

    async def fetch(self, query, *args):
        return []

    async def fetchrow(self, query, *args):
        return None


class MockPool:
    """Mock asyncpg pool for testing."""

    def __init__(self):
        self._conn = MockConnection()
        self.closed = False

    async def acquire(self):
        return self._conn

    async def close(self):
        self.closed = True

    def acquire_context(self):
        class _Context:
            async def __aenter__(_self):
                return self._conn
            async def __aexit__(_self, *args):
                pass
        return _Context()


class TestDatabaseStorageInitialization:
    """Test DatabaseStorage initialization."""

    @pytest.fixture
    def db_storage(self):
        return DatabaseStorage()

    @pytest.mark.asyncio
    async def test_initial_state(self, db_storage):
        """Test initial state of DatabaseStorage."""
        assert db_storage.timescale_pool is None

    @pytest.mark.asyncio
    async def test_connect_success(self, db_storage):
        """Test successful database connection."""
        mock_pool = MockPool()

        with patch('asyncpg.create_pool', return_value=mock_pool):
            await db_storage.connect()

        assert db_storage.timescale_pool is mock_pool

    @pytest.mark.asyncio
    async def test_connect_failure_fallback(self, db_storage):
        """Test connection failure falls back to in-memory mode."""
        with patch('asyncpg.create_pool', side_effect=Exception("Connection failed")):
            await db_storage.connect()

        # Should set pool to None on failure
        assert db_storage.timescale_pool is None

    @pytest.mark.asyncio
    async def test_close_connection(self, db_storage):
        """Test closing database connection."""
        mock_pool = MockPool()
        db_storage.timescale_pool = mock_pool

        await db_storage.close()

        assert mock_pool.closed is True


class TestDatabaseTableCreation:
    """Test database table creation."""

    @pytest.fixture
    def db_with_mock_pool(self):
        """Create DatabaseStorage with mock pool."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool
        return db, mock_pool

    @pytest.mark.asyncio
    async def test_create_stock_quotes_table(self, db_with_mock_pool):
        """Test stock_quotes table creation."""
        db, mock_pool = db_with_mock_pool

        await db._create_tables()

        # Check stock_quotes table creation
        queries = [q[0] for q in mock_pool._conn.executed_queries]
        stock_quotes_query = next((q for q in queries if 'stock_quotes' in q), None)
        assert stock_quotes_query is not None
        assert 'CREATE TABLE IF NOT EXISTS stock_quotes' in stock_quotes_query

    @pytest.mark.asyncio
    async def test_create_stock_history_table(self, db_with_mock_pool):
        """Test stock_history table creation."""
        db, mock_pool = db_with_mock_pool

        await db._create_tables()

        # Check stock_history table creation
        queries = [q[0] for q in mock_pool._conn.executed_queries]
        stock_history_query = next((q for q in queries if 'stock_history' in q), None)
        assert stock_history_query is not None
        assert 'CREATE TABLE IF NOT EXISTS stock_history' in stock_history_query

    @pytest.mark.asyncio
    async def test_create_hypertable_for_quotes(self, db_with_mock_pool):
        """Test hypertable creation for stock_quotes."""
        db, mock_pool = db_with_mock_pool

        await db._create_tables()

        # Check hypertable creation
        queries = [q[0] for q in mock_pool._conn.executed_queries]
        hypertable_query = next((q for q in queries if 'create_hypertable' in q and 'stock_quotes' in q), None)
        assert hypertable_query is not None
        assert "chunk_time_interval => INTERVAL '1 day'" in hypertable_query

    @pytest.mark.asyncio
    async def test_create_hypertable_for_history(self, db_with_mock_pool):
        """Test hypertable creation for stock_history."""
        db, mock_pool = db_with_mock_pool

        await db._create_tables()

        # Check hypertable creation
        queries = [q[0] for q in mock_pool._conn.executed_queries]
        hypertable_query = next((q for q in queries if 'create_hypertable' in q and 'stock_history' in q), None)
        assert hypertable_query is not None
        assert "chunk_time_interval => INTERVAL '7 days'" in hypertable_query

    @pytest.mark.asyncio
    async def test_create_indexes(self, db_with_mock_pool):
        """Test index creation."""
        db, mock_pool = db_with_mock_pool

        await db._create_tables()

        # Check index creation
        queries = [q[0] for q in mock_pool._conn.executed_queries]
        index_queries = [q for q in queries if 'CREATE INDEX' in q]

        assert len(index_queries) >= 2

        # Check for specific indexes
        index_names = [q for q in queries if 'idx_quotes_symbol_time' in q or 'idx_history_symbol_interval_time' in q]
        assert len(index_names) >= 2

    @pytest.mark.asyncio
    async def test_skip_table_creation_when_no_pool(self):
        """Test table creation is skipped when no pool."""
        db = DatabaseStorage()
        db.timescale_pool = None

        # Should not raise error
        await db._create_tables()


class TestStockQuotesTableSchema:
    """Test stock_quotes table schema."""

    @pytest.mark.asyncio
    async def test_stock_quotes_columns(self):
        """Test stock_quotes table has required columns."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        create_query = next((q for q in queries if 'CREATE TABLE IF NOT EXISTS stock_quotes' in q), None)

        required_columns = [
            'symbol', 'timestamp', 'price', 'open', 'high', 'low',
            'prev_close', 'change', 'change_percent', 'volume', 'amount',
            'bid_price', 'ask_price', 'bid_volume', 'ask_volume'
        ]

        for column in required_columns:
            assert column in create_query, f"Missing column: {column}"

    @pytest.mark.asyncio
    async def test_stock_quotes_primary_key(self):
        """Test stock_quotes has correct primary key."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        create_query = next((q for q in queries if 'CREATE TABLE IF NOT EXISTS stock_quotes' in q), None)

        assert 'PRIMARY KEY (symbol, timestamp)' in create_query


class TestStockHistoryTableSchema:
    """Test stock_history table schema."""

    @pytest.mark.asyncio
    async def test_stock_history_columns(self):
        """Test stock_history table has required columns."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        create_query = next((q for q in queries if 'CREATE TABLE IF NOT EXISTS stock_history' in q), None)

        required_columns = [
            'symbol', 'timestamp', 'interval', 'open', 'high', 'low',
            'close', 'volume', 'amount', 'adj_close', 'vwap'
        ]

        for column in required_columns:
            assert column in create_query, f"Missing column: {column}"

    @pytest.mark.asyncio
    async def test_stock_history_primary_key(self):
        """Test stock_history has correct primary key."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        create_query = next((q for q in queries if 'CREATE TABLE IF NOT EXISTS stock_history' in q), None)

        assert 'PRIMARY KEY (symbol, timestamp, interval)' in create_query


class TestDatabaseSaveOperations:
    """Test database save operations."""

    @pytest.fixture
    def sample_quote(self):
        """Create sample stock quote."""
        return StockQuote(
            symbol="000001.SZ",
            timestamp=datetime(2026, 1, 1, 10, 0, 0),
            price=10.5,
            open=10.3,
            high=10.8,
            low=10.2,
            prev_close=10.4,
            change=0.1,
            change_percent=0.96,
            volume=1000000,
            amount=10500000.0,
            bid_price=10.49,
            ask_price=10.51,
            bid_volume=500,
            ask_volume=600
        )

    @pytest.fixture
    def sample_history_data(self):
        """Create sample history data."""
        return [
            StockData(
                symbol="000001.SZ",
                timestamp=datetime(2026, 1, 1),
                open=10.0,
                high=10.5,
                low=9.8,
                close=10.2,
                volume=1000000,
                amount=10200000.0,
                adj_close=10.2,
                vwap=10.1
            ),
            StockData(
                symbol="000001.SZ",
                timestamp=datetime(2026, 1, 2),
                open=10.2,
                high=10.6,
                low=10.1,
                close=10.4,
                volume=1200000,
                amount=12480000.0,
                adj_close=10.4,
                vwap=10.3
            )
        ]

    @pytest.mark.asyncio
    async def test_save_stock_quote_success(self, sample_quote):
        """Test saving stock quote."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db.save_stock_quote(sample_quote)

        # Check INSERT query was executed
        queries = [q[0] for q in mock_pool._conn.executed_queries]
        insert_query = next((q for q in queries if 'INSERT INTO stock_quotes' in q), None)
        assert insert_query is not None
        assert 'ON CONFLICT (symbol, timestamp) DO UPDATE' in insert_query

    @pytest.mark.asyncio
    async def test_save_stock_quote_no_pool(self, sample_quote):
        """Test saving quote when no pool (in-memory mode)."""
        db = DatabaseStorage()
        db.timescale_pool = None

        # Should not raise error
        await db.save_stock_quote(sample_quote)

    @pytest.mark.asyncio
    async def test_save_stock_history_success(self, sample_history_data):
        """Test saving stock history."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db.save_stock_history(sample_history_data, interval="1d")

        # Check INSERT query was executed
        queries = [q[0] for q in mock_pool._conn.executed_queries]
        insert_query = next((q for q in queries if 'INSERT INTO stock_history' in q), None)
        assert insert_query is not None

    @pytest.mark.asyncio
    async def test_save_stock_history_empty_list(self):
        """Test saving empty history list."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db.save_stock_history([], interval="1d")

        # No queries should be executed
        assert len(mock_pool._conn.executed_queries) == 0

    @pytest.mark.asyncio
    async def test_save_stock_history_no_pool(self, sample_history_data):
        """Test saving history when no pool."""
        db = DatabaseStorage()
        db.timescale_pool = None

        # Should not raise error
        await db.save_stock_history(sample_history_data, interval="1d")


class TestChunkTimeIntervals:
    """Test hypertable chunk time intervals."""

    @pytest.mark.asyncio
    async def test_quotes_chunk_interval_1_day(self):
        """Test stock_quotes uses 1-day chunk interval."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        quotes_hypertable = next((q for q in queries if 'stock_quotes' in q and 'create_hypertable' in q), None)

        assert "chunk_time_interval => INTERVAL '1 day'" in quotes_hypertable

    @pytest.mark.asyncio
    async def test_history_chunk_interval_7_days(self):
        """Test stock_history uses 7-day chunk interval."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        history_hypertable = next((q for q in queries if 'stock_history' in q and 'create_hypertable' in q), None)

        assert "chunk_time_interval => INTERVAL '7 days'" in history_hypertable


class TestIfNotExists:
    """Test IF NOT EXISTS clauses."""

    @pytest.mark.asyncio
    async def test_tables_use_if_not_exists(self):
        """Test tables are created with IF NOT EXISTS."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]

        # Check tables
        stock_quotes_query = next((q for q in queries if 'stock_quotes' in q and 'CREATE TABLE' in q), None)
        stock_history_query = next((q for q in queries if 'stock_history' in q and 'CREATE TABLE' in q), None)

        assert 'IF NOT EXISTS' in stock_quotes_query
        assert 'IF NOT EXISTS' in stock_history_query

    @pytest.mark.asyncio
    async def test_hypertables_use_if_not_exists(self):
        """Test hypertables are created with if_not_exists."""
        db = DatabaseStorage()
        mock_pool = MockPool()
        db.timescale_pool = mock_pool

        await db._create_tables()

        queries = [q[0] for q in mock_pool._conn.executed_queries]
        hypertable_queries = [q for q in queries if 'create_hypertable' in q]

        for query in hypertable_queries:
            assert 'if_not_exists => TRUE' in query
