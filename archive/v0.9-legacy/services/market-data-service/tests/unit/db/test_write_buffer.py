"""
Unit tests for TimescaleDB write buffer.

Tests batch write buffering to optimize database write performance.
"""

import pytest
import asyncio
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import deque
import time


@dataclass
class BufferedRecord:
    """A record waiting to be written to database."""

    table: str
    data: Dict[str, Any]
    timestamp: datetime = field(default_factory=datetime.now)
    retry_count: int = 0


class WriteBuffer:
    """
    Write buffer for batching database writes.

    Buffers writes and flushes to database in batches for better performance.
    Supports automatic flushing based on batch size and time interval.
    """

    def __init__(self, db_client, batch_size: int = 1000, flush_interval_seconds: float = 5.0):
        self.db = db_client
        self.batch_size = batch_size
        self.flush_interval_seconds = flush_interval_seconds

        self._buffer: deque[BufferedRecord] = deque()
        self._buffer_lock = asyncio.Lock()
        self._last_flush_time = datetime.now()
        self._flush_task: Optional[asyncio.Task] = None
        self._running = False

        # Statistics
        self.stats = {
            "buffered_records": 0,
            "flushed_records": 0,
            "flush_count": 0,
            "failed_flushes": 0,
            "avg_flush_time_ms": 0.0,
            "total_flush_time_ms": 0.0
        }

    async def start(self):
        """Start the background flush task."""
        self._running = True
        self._flush_task = asyncio.create_task(self._background_flush())

    async def stop(self):
        """Stop the background flush task and flush remaining data."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        # Final flush
        await self.flush()

    async def add(self, table: str, data: Dict[str, Any]) -> bool:
        """
        Add a record to the buffer.

        Args:
            table: Target table name
            data: Record data

        Returns:
            True if added successfully
        """
        async with self._buffer_lock:
            record = BufferedRecord(table=table, data=data)
            self._buffer.append(record)
            self.stats["buffered_records"] += 1

            # Check if we need to flush
            if len(self._buffer) >= self.batch_size:
                asyncio.create_task(self.flush())

        return True

    async def add_batch(self, table: str, records: List[Dict[str, Any]]) -> int:
        """
        Add multiple records to the buffer.

        Returns:
            Number of records added
        """
        async with self._buffer_lock:
            for data in records:
                record = BufferedRecord(table=table, data=data)
                self._buffer.append(record)
            self.stats["buffered_records"] += len(records)

            # Check if we need to flush
            if len(self._buffer) >= self.batch_size:
                asyncio.create_task(self.flush())

        return len(records)

    async def flush(self) -> bool:
        """
        Flush all buffered records to database.

        Returns:
            True if flush succeeded
        """
        async with self._buffer_lock:
            if not self._buffer:
                return True

            # Get all records from buffer
            records_to_flush = list(self._buffer)
            self._buffer.clear()

        if not records_to_flush:
            return True

        start_time = time.time()

        try:
            # Group by table
            table_groups: Dict[str, List[Dict]] = {}
            for record in records_to_flush:
                if record.table not in table_groups:
                    table_groups[record.table] = []
                table_groups[record.table].append(record.data)

            # Batch insert by table
            for table, records in table_groups.items():
                await self.db.batch_insert(table, records)

            # Update statistics
            elapsed_ms = (time.time() - start_time) * 1000
            self.stats["flushed_records"] += len(records_to_flush)
            self.stats["flush_count"] += 1
            self.stats["total_flush_time_ms"] += elapsed_ms
            self.stats["avg_flush_time_ms"] = (
                self.stats["total_flush_time_ms"] / self.stats["flush_count"]
            )
            self._last_flush_time = datetime.now()

            return True

        except Exception as e:
            self.stats["failed_flushes"] += 1
            # In real implementation, might retry or log
            return False

    async def _background_flush(self):
        """Background task for periodic flushing."""
        while self._running:
            try:
                await asyncio.sleep(self.flush_interval_seconds)

                # Check if we need to flush based on time
                time_since_flush = (datetime.now() - self._last_flush_time).total_seconds()
                if time_since_flush >= self.flush_interval_seconds:
                    await self.flush()

            except asyncio.CancelledError:
                break
            except Exception as e:
                # Log error and continue
                await asyncio.sleep(1)

    def get_pending_count(self) -> int:
        """Get number of pending records in buffer."""
        return len(self._buffer)

    def get_stats(self) -> Dict[str, Any]:
        """Get buffer statistics."""
        return {
            **self.stats,
            "pending_records": self.get_pending_count(),
            "buffer_size_limit": self.batch_size,
            "flush_interval_seconds": self.flush_interval_seconds
        }


class MockDBClient:
    """Mock database client for testing."""

    def __init__(self, delay_ms: float = 1.0):
        self.delay_ms = delay_ms
        self.inserted_records: Dict[str, List[Dict]] = {}
        self.insert_count = 0

    async def batch_insert(self, table: str, records: List[Dict]):
        """Mock batch insert."""
        await asyncio.sleep(self.delay_ms / 1000)

        if table not in self.inserted_records:
            self.inserted_records[table] = []

        self.inserted_records[table].extend(records)
        self.insert_count += len(records)


class TestWriteBuffer:
    """Test write buffer functionality."""

    @pytest.fixture
    def mock_db(self):
        return MockDBClient(delay_ms=1)

    @pytest.fixture
    def buffer(self, mock_db):
        return WriteBuffer(mock_db, batch_size=10, flush_interval_seconds=1.0)

    @pytest.mark.asyncio
    async def test_add_single_record(self, buffer, mock_db):
        """Test adding a single record."""
        success = await buffer.add("kline_1m", {"symbol": "000001", "price": 10.5})

        assert success is True
        assert buffer.get_pending_count() == 1

    @pytest.mark.asyncio
    async def test_batch_add(self, buffer, mock_db):
        """Test adding multiple records."""
        records = [
            {"symbol": f"{i:06d}", "price": 10.0 + i}
            for i in range(1, 6)
        ]

        count = await buffer.add_batch("kline_1m", records)

        assert count == 5
        assert buffer.get_pending_count() == 5

    @pytest.mark.asyncio
    async def test_manual_flush(self, buffer, mock_db):
        """Test manual flush."""
        # Add records
        for i in range(5):
            await buffer.add("kline_1m", {"symbol": f"{i:06d}", "price": 10.0})

        # Flush
        success = await buffer.flush()

        assert success is True
        assert buffer.get_pending_count() == 0
        assert mock_db.insert_count == 5

    @pytest.mark.asyncio
    async def test_auto_flush_on_batch_size(self, mock_db):
        """Test auto-flush when batch size reached."""
        buffer = WriteBuffer(mock_db, batch_size=5, flush_interval_seconds=60)

        # Add records up to batch size
        for i in range(5):
            await buffer.add("kline_1m", {"symbol": f"{i:06d}", "price": 10.0})

        # Wait a bit for async flush
        await asyncio.sleep(0.1)

        assert mock_db.insert_count == 5
        assert buffer.get_pending_count() == 0

    @pytest.mark.asyncio
    async def test_flush_grouped_by_table(self, buffer, mock_db):
        """Test that records are grouped by table during flush."""
        # Add records to different tables
        await buffer.add("kline_1m", {"symbol": "000001", "price": 10.5})
        await buffer.add("kline_1m", {"symbol": "000002", "price": 20.5})
        await buffer.add("quotes", {"symbol": "000001", "price": 10.6})

        await buffer.flush()

        assert "kline_1m" in mock_db.inserted_records
        assert "quotes" in mock_db.inserted_records
        assert len(mock_db.inserted_records["kline_1m"]) == 2
        assert len(mock_db.inserted_records["quotes"]) == 1

    @pytest.mark.asyncio
    async def test_stats_tracking(self, buffer, mock_db):
        """Test statistics tracking."""
        # Add and flush records
        for i in range(10):
            await buffer.add("kline_1m", {"symbol": f"{i:06d}", "price": 10.0})

        await buffer.flush()

        stats = buffer.get_stats()
        assert stats["flushed_records"] == 10
        assert stats["flush_count"] == 1
        assert stats["avg_flush_time_ms"] > 0

    @pytest.mark.asyncio
    async def test_background_flush(self, mock_db):
        """Test background periodic flush."""
        buffer = WriteBuffer(mock_db, batch_size=100, flush_interval_seconds=0.1)
        await buffer.start()

        # Add records
        await buffer.add("kline_1m", {"symbol": "000001", "price": 10.5})

        # Wait for background flush
        await asyncio.sleep(0.2)

        assert mock_db.insert_count >= 1

        await buffer.stop()

    @pytest.mark.asyncio
    async def test_multiple_flushes(self, buffer, mock_db):
        """Test multiple flush cycles."""
        for cycle in range(3):
            for i in range(5):
                await buffer.add("kline_1m", {"symbol": f"{cycle}_{i}", "price": 10.0})
            await buffer.flush()

        assert buffer.stats["flush_count"] == 3
        assert buffer.stats["flushed_records"] == 15


class TestWriteBufferPerformance:
    """Test write buffer performance."""

    @pytest.mark.asyncio
    async def test_batch_write_performance(self):
        """Test batch write performance - 10k records in < 500ms."""
        mock_db = MockDBClient(delay_ms=1)
        buffer = WriteBuffer(mock_db, batch_size=1000)

        start = time.time()

        # Add 10,000 records
        for i in range(10000):
            await buffer.add("kline_1m", {
                "symbol": f"{i % 5000:06d}",
                "price": 10.0 + (i % 100),
                "timestamp": datetime.now()
            })

        # Flush all
        await buffer.flush()

        elapsed_ms = (time.time() - start) * 1000

        assert mock_db.insert_count == 10000
        assert elapsed_ms < 500, f"Batch write took {elapsed_ms:.2f}ms, expected < 500ms"

    @pytest.mark.asyncio
    async def test_concurrent_adds(self):
        """Test concurrent record addition."""
        mock_db = MockDBClient(delay_ms=1)
        buffer = WriteBuffer(mock_db, batch_size=1000)

        async def add_records(start_idx: int, count: int):
            for i in range(count):
                await buffer.add("kline_1m", {"symbol": f"{start_idx + i:06d}", "price": 10.0})
                # Small delay to allow other coroutines to run
                await asyncio.sleep(0)

        # Concurrent additions
        tasks = [
            add_records(i * 100, 100)
            for i in range(10)
        ]
        await asyncio.gather(*tasks)

        # Wait a bit for any background flush
        await asyncio.sleep(0.1)

        # Flush remaining
        await buffer.flush()

        assert mock_db.insert_count == 1000


class TestWriteBufferEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_empty_flush(self):
        """Test flushing empty buffer."""
        mock_db = MockDBClient()
        buffer = WriteBuffer(mock_db)

        success = await buffer.flush()

        assert success is True
        assert mock_db.insert_count == 0

    @pytest.mark.asyncio
    async def test_flush_after_stop(self):
        """Test behavior after stopping buffer."""
        mock_db = MockDBClient()
        buffer = WriteBuffer(mock_db)

        await buffer.add("kline_1m", {"symbol": "000001", "price": 10.5})
        await buffer.stop()

        # Should have flushed on stop
        assert mock_db.insert_count == 1

    @pytest.mark.asyncio
    async def test_large_records(self):
        """Test handling large records."""
        mock_db = MockDBClient()
        buffer = WriteBuffer(mock_db, batch_size=5)

        # Add large records
        for i in range(10):
            await buffer.add("kline_1m", {
                "symbol": f"{i:06d}",
                "data": "x" * 1000  # Large data field
            })

        await buffer.flush()

        assert mock_db.insert_count == 10

    @pytest.mark.asyncio
    async def test_stats_consistency(self):
        """Test stats are consistent after multiple operations."""
        mock_db = MockDBClient()
        buffer = WriteBuffer(mock_db, batch_size=3)

        # Add and flush multiple times
        for i in range(9):
            await buffer.add("kline_1m", {"symbol": f"{i:06d}", "price": 10.0})

        await buffer.flush()

        stats = buffer.get_stats()
        assert stats["buffered_records"] == 9
        assert stats["flushed_records"] == 9
        assert stats["pending_records"] == 0

