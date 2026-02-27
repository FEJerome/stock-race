"""
Integration tests for buffered database writes.

Tests Write Buffer integration with database operations.
"""

import pytest
import asyncio
from typing import Dict, Any, List
from datetime import datetime
import time


class TimescaleDBWithBuffer:
    """TimescaleDB wrapper with write buffering and query caching."""

    def __init__(self, db_client, write_buffer, query_cache):
        self.db = db_client
        self.write_buffer = write_buffer
        self.query_cache = query_cache

    async def save_klines(self, table: str, klines: List[Dict[str, Any]]) -> bool:
        """Save klines through write buffer."""
        return await self.write_buffer.add_batch(table, klines)

    async def query_klines(self, table: str, symbol: str,
                          start: datetime, end: datetime,
                          use_cache: bool = True) -> List[Dict[str, Any]]:
        """Query klines with caching."""
        cache_params = {
            "table": table,
            "symbol": symbol,
            "start": start.isoformat(),
            "end": end.isoformat()
        }

        if use_cache:
            return await self.query_cache.get_or_compute(
                table, cache_params,
                lambda: self._query_db(table, symbol, start, end)
            )
        else:
            return await self._query_db(table, symbol, start, end)

    async def _query_db(self, table: str, symbol: str,
                       start: datetime, end: datetime) -> List[Dict[str, Any]]:
        """Query database directly."""
        return await self.db.query(table, symbol, start, end)

    async def flush(self):
        """Flush write buffer."""
        return await self.write_buffer.flush()


class MockTimescaleDB:
    """Mock TimescaleDB for testing."""

    def __init__(self, query_delay_ms: float = 5):
        self.tables: Dict[str, List[Dict]] = {}
        self.query_delay_ms = query_delay_ms
        self.query_count = 0

    async def batch_insert(self, table: str, records: List[Dict]):
        """Batch insert records."""
        if table not in self.tables:
            self.tables[table] = []
        self.tables[table].extend(records)

    async def query(self, table: str, symbol: str,
                   start: datetime, end: datetime) -> List[Dict]:
        """Query records."""
        await asyncio.sleep(self.query_delay_ms / 1000)
        self.query_count += 1

        if table not in self.tables:
            return []

        return [
            r for r in self.tables[table]
            if r.get("symbol") == symbol and start <= r.get("timestamp", datetime.now()) <= end
        ]


# Import from unit tests
import sys
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/worktrees/worktree-market-data-service/market-data-service/tests/unit/db')
from test_write_buffer import WriteBuffer, MockDBClient
from test_query_cache import QueryCache, MockRedisClient


class TestBufferedWriteIntegration:
    """Test buffered write integration."""

    @pytest.fixture
    def mock_db(self):
        return MockTimescaleDB()

    @pytest.fixture
    def mock_redis(self):
        return MockRedisClient()

    @pytest.fixture
    def db_with_buffer(self, mock_db, mock_redis):
        write_buffer = WriteBuffer(mock_db, batch_size=100, flush_interval_seconds=5)
        query_cache = QueryCache(mock_redis, default_ttl_seconds=60)
        return TimescaleDBWithBuffer(mock_db, write_buffer, query_cache)

    @pytest.mark.asyncio
    async def test_buffered_kline_write(self, db_with_buffer, mock_db):
        """Test writing klines through buffer."""
        klines = [
            {"symbol": "000001", "timestamp": datetime(2026, 2, 10, 14, 30), "close": 10.5}
            for _ in range(50)
        ]

        count = await db_with_buffer.save_klines("kline_1m", klines)

        assert count == 50
        # Should be buffered, not yet in DB
        assert len(mock_db.tables.get("kline_1m", [])) == 0

        # Flush buffer
        await db_with_buffer.flush()

        # Now should be in DB
        assert len(mock_db.tables.get("kline_1m", [])) == 50

    @pytest.mark.asyncio
    async def test_cached_kline_query(self, db_with_buffer, mock_db):
        """Test querying klines with caching."""
        # Insert data directly
        await mock_db.batch_insert("kline_1m", [
            {"symbol": "000001", "timestamp": datetime(2026, 2, 10, 14, 30), "close": 10.5},
            {"symbol": "000001", "timestamp": datetime(2026, 2, 10, 14, 31), "close": 10.6}
        ])

        # First query - cache miss
        result1 = await db_with_buffer.query_klines(
            "kline_1m", "000001",
            datetime(2026, 2, 10, 14, 0), datetime(2026, 2, 10, 15, 0),
            use_cache=True
        )

        assert len(result1) == 2
        assert mock_db.query_count == 1

        # Second query - cache hit
        result2 = await db_with_buffer.query_klines(
            "kline_1m", "000001",
            datetime(2026, 2, 10, 14, 0), datetime(2026, 2, 10, 15, 0),
            use_cache=True
        )

        assert len(result2) == 2
        assert mock_db.query_count == 1  # No additional DB query

    @pytest.mark.asyncio
    async def test_write_then_read(self, db_with_buffer, mock_db):
        """Test write then read flow."""
        # Write through buffer
        klines = [
            {"symbol": "000001", "timestamp": datetime(2026, 2, 10, i, 0), "close": 10.0 + i}
            for i in range(10)
        ]
        await db_with_buffer.save_klines("kline_1m", klines)
        await db_with_buffer.flush()

        # Read back
        result = await db_with_buffer.query_klines(
            "kline_1m", "000001",
            datetime(2026, 2, 10, 0, 0), datetime(2026, 2, 10, 23, 59),
            use_cache=False
        )

        assert len(result) == 10


class TestBufferedWritePerformance:
    """Test buffered write performance."""

    @pytest.mark.asyncio
    async def test_high_throughput_write(self):
        """Test high throughput write performance."""
        mock_db = MockTimescaleDB()
        write_buffer = WriteBuffer(mock_db, batch_size=1000)
        mock_redis = MockRedisClient()
        query_cache = QueryCache(mock_redis)
        db = TimescaleDBWithBuffer(mock_db, write_buffer, query_cache)

        # Write 10,000 records
        klines = [
            {"symbol": f"{i % 100:06d}", "timestamp": datetime.now(), "close": 10.0}
            for i in range(10000)
        ]

        start = time.time()

        for kline in klines:
            await db.save_klines("kline_1m", [kline])

        await db.flush()

        elapsed_ms = (time.time() - start) * 1000

        assert mock_db.tables["kline_1m"].__len__() == 10000
        assert elapsed_ms < 1000, f"Write took {elapsed_ms:.2f}ms, expected < 1000ms"

    @pytest.mark.asyncio
    async def test_cached_query_performance(self):
        """Test cached query performance."""
        mock_db = MockTimescaleDB(query_delay_ms=50)  # Slow DB
        write_buffer = WriteBuffer(mock_db)
        mock_redis = MockRedisClient()
        query_cache = QueryCache(mock_redis)
        db = TimescaleDBWithBuffer(mock_db, write_buffer, query_cache)

        # Insert data
        await mock_db.batch_insert("kline_1m", [
            {"symbol": "000001", "timestamp": datetime(2026, 2, 10, i % 24, 0), "close": 10.0}
            for i in range(100)
        ])

        # First query (cache miss) - slow
        start = time.time()
        await db.query_klines("kline_1m", "000001",
                             datetime(2026, 2, 10, 0, 0), datetime(2026, 2, 10, 23, 59))
        first_query_ms = (time.time() - start) * 1000

        # Second query (cache hit) - fast
        start = time.time()
        await db.query_klines("kline_1m", "000001",
                             datetime(2026, 2, 10, 0, 0), datetime(2026, 2, 10, 23, 59))
        second_query_ms = (time.time() - start) * 1000

        assert first_query_ms > 40  # Should take ~50ms
        assert second_query_ms < 10  # Should be very fast from cache


class TestBufferedWriteEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_flush_empty_buffer(self):
        """Test flushing empty buffer."""
        mock_db = MockTimescaleDB()
        write_buffer = WriteBuffer(mock_db)
        mock_redis = MockRedisClient()
        query_cache = QueryCache(mock_redis)
        db = TimescaleDBWithBuffer(mock_db, write_buffer, query_cache)

        success = await db.flush()

        assert success is True

    @pytest.mark.asyncio
    async def test_concurrent_writes(self):
        """Test concurrent buffered writes."""
        mock_db = MockTimescaleDB()
        write_buffer = WriteBuffer(mock_db, batch_size=500)
        mock_redis = MockRedisClient()
        query_cache = QueryCache(mock_redis)
        db = TimescaleDBWithBuffer(mock_db, write_buffer, query_cache)

        async def write_batch(start_idx: int):
            klines = [
                {"symbol": f"{i:06d}", "timestamp": datetime.now(), "close": 10.0}
                for i in range(start_idx, start_idx + 100)
            ]
            await db.save_klines("kline_1m", klines)

        # Concurrent writes
        tasks = [write_batch(i * 100) for i in range(10)]
        await asyncio.gather(*tasks)

        await db.flush()

        assert len(mock_db.tables["kline_1m"]) == 1000
