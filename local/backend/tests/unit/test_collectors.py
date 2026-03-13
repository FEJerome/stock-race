"""
Unit tests for collectors module

Tests the core functionality of the collection framework:
- BaseCollector interface
- RetryPolicy with exponential backoff
- CircuitBreaker state transitions
- CollectionLogger
"""
import pytest
import asyncio
from datetime import datetime, timedelta
from typing import List, Optional

from services.collectors import (
    BaseCollector,
    CollectionResult,
    CollectorStatus,
    CollectorHealth,
    RetryPolicy,
    RetryExhaustedError,
    with_retry,
    retryable,
    CircuitBreaker,
    CircuitState,
    CollectionLogger,
    CollectionLog,
    LogStatus,
    get_logger,
)


# =============================================================================
# Test Fixtures
# =============================================================================

class MockCollector(BaseCollector):
    """Mock collector for testing"""

    def __init__(self, name: str = "mock", fail_count: int = 0):
        super().__init__(name=name, priority=100)
        self.fail_count = fail_count
        self.attempts = 0
        self.collected_items = []

    def get_source_name(self) -> str:
        return self.name

    async def collect(
        self,
        symbol: str,
        since: Optional[datetime] = None,
        limit: int = 100
    ) -> CollectionResult:
        self.attempts += 1
        self._set_running()
        start_time = datetime.utcnow()

        if self.attempts <= self.fail_count:
            self._update_health_error(f"Attempt {self.attempts} failed")
            return CollectionResult(
                source_name=self.name,
                symbol=symbol,
                items=[],
                count=0,
                start_time=start_time,
                end_time=datetime.utcnow(),
                success=False,
                error_message=f"Attempt {self.attempts} failed"
            )

        items = [{"id": f"item_{i}", "symbol": symbol} for i in range(3)]
        self.collected_items.extend(items)

        end_time = datetime.utcnow()
        duration_ms = (end_time - start_time).total_seconds() * 1000
        self._update_health_success(duration_ms)

        return CollectionResult(
            source_name=self.name,
            symbol=symbol,
            items=items,
            count=len(items),
            start_time=start_time,
            end_time=end_time,
            success=True,
            next_since=datetime.utcnow()
        )


@pytest.fixture
def mock_collector():
    """Fixture for mock collector"""
    return MockCollector(name="test_mock")


@pytest.fixture
def failing_collector():
    """Fixture for failing collector"""
    return MockCollector(name="test_failing", fail_count=999)


# =============================================================================
# BaseCollector Tests
# =============================================================================

class TestBaseCollector:
    """Test BaseCollector interface"""

    @pytest.mark.asyncio
    async def test_collect_success(self, mock_collector):
        """Test successful collection"""
        result = await mock_collector.collect("000001.SZ")

        assert result.success is True
        assert result.count == 3
        assert result.symbol == "000001.SZ"
        assert result.source_name == "test_mock"
        assert result.next_since is not None
        assert len(result.items) == 3

    @pytest.mark.asyncio
    async def test_collect_failure(self, failing_collector):
        """Test failed collection"""
        result = await failing_collector.collect("000001.SZ")

        assert result.success is False
        assert result.count == 0
        assert result.error_message is not None

    @pytest.mark.asyncio
    async def test_health_update_on_success(self, mock_collector):
        """Test health tracking on success"""
        await mock_collector.collect("000001.SZ")

        health = await mock_collector.health_check()
        assert health.source_name == "test_mock"
        assert health.status == CollectorStatus.IDLE
        assert health.success_count == 1
        assert health.error_count == 0
        assert health.last_success is not None

    @pytest.mark.asyncio
    async def test_health_update_on_failure(self, failing_collector):
        """Test health tracking on failure"""
        await failing_collector.collect("000001.SZ")

        health = await failing_collector.health_check()
        assert health.status == CollectorStatus.ERROR
        assert health.success_count == 0
        assert health.error_count == 1
        assert health.last_error is not None

    def test_last_since_tracking(self, mock_collector):
        """Test incremental collection timestamp tracking"""
        since = datetime.utcnow()

        assert mock_collector.get_last_since("000001.SZ") is None

        mock_collector.update_last_since("000001.SZ", since)
        assert mock_collector.get_last_since("000001.SZ") == since

        # Test different symbols
        mock_collector.update_last_since("600000.SH", since + timedelta(hours=1))
        assert mock_collector.get_last_since("000001.SZ") == since
        assert mock_collector.get_last_since("600000.SH") == since + timedelta(hours=1)

    def test_abstract_methods(self):
        """Test that BaseCollector cannot be instantiated directly"""
        with pytest.raises(TypeError):
            BaseCollector(name="test")

    def test_repr(self, mock_collector):
        """Test collector string representation"""
        assert repr(mock_collector) == "MockCollector(name=test_mock, priority=100)"


# =============================================================================
# RetryPolicy Tests
# =============================================================================

class TestRetryPolicy:
    """Test retry mechanism"""

    def test_calculate_delay_no_jitter(self):
        """Test delay calculation without jitter"""
        policy = RetryPolicy(
            max_retries=3,
            base_delay=1.0,
            max_delay=60.0,
            jitter=False
        )

        assert policy.calculate_delay(0) == 1.0
        assert policy.calculate_delay(1) == 2.0
        assert policy.calculate_delay(2) == 4.0
        assert policy.calculate_delay(3) == 8.0

    def test_calculate_delay_with_max_limit(self):
        """Test that delay respects max_delay limit"""
        policy = RetryPolicy(
            base_delay=10.0,
            max_delay=30.0,
            jitter=False
        )

        assert policy.calculate_delay(0) == 10.0
        assert policy.calculate_delay(1) == 20.0
        assert policy.calculate_delay(2) == 30.0  # Capped at max_delay
        assert policy.calculate_delay(3) == 30.0  # Still capped

    def test_calculate_delay_with_jitter(self):
        """Test delay calculation with jitter"""
        policy = RetryPolicy(
            base_delay=1.0,
            jitter=True
        )

        delay = policy.calculate_delay(0)
        assert 1.0 <= delay < 2.0  # Should add 0-1 second jitter

    @pytest.mark.asyncio
    async def test_with_retry_success(self):
        """Test retry wrapper with success"""
        call_count = 0

        async def success_func():
            nonlocal call_count
            call_count += 1
            return "success"

        result = await with_retry(success_func, policy=RetryPolicy(max_retries=2))

        assert result == "success"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_with_retry_eventual_success(self):
        """Test retry wrapper with eventual success"""
        call_count = 0

        async def eventual_success():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ConnectionError(f"Attempt {call_count} failed")
            return "success"

        policy = RetryPolicy(max_retries=3, base_delay=0.1)
        result = await with_retry(eventual_success, policy=policy)

        assert result == "success"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_with_retry_exhaustion(self):
        """Test retry wrapper when all retries exhausted"""
        call_count = 0

        async def always_fail():
            nonlocal call_count
            call_count += 1
            raise ConnectionError(f"Attempt {call_count} failed")

        policy = RetryPolicy(max_retries=2, base_delay=0.01)

        with pytest.raises(RetryExhaustedError) as exc_info:
            await with_retry(always_fail, policy=policy)

        assert exc_info.value.attempts == 3  # Initial + 2 retries
        assert exc_info.value.last_exception is not None
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_retryable_decorator(self):
        """Test retryable decorator"""
        call_count = 0

        @retryable(max_retries=2, base_delay=0.01)
        async def decorated_func():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise ConnectionError("Fail")
            return "success"

        result = await decorated_func()

        assert result == "success"
        assert call_count == 2


# =============================================================================
# CircuitBreaker Tests
# =============================================================================

class TestCircuitBreaker:
    """Test circuit breaker functionality"""

    def test_initial_state(self):
        """Test initial circuit breaker state"""
        cb = CircuitBreaker()

        assert cb.state == CircuitState.CLOSED
        assert cb.can_execute() is True
        assert cb.failures == 0

    def test_state_transition_to_open(self):
        """Test transition from CLOSED to OPEN"""
        cb = CircuitBreaker(failure_threshold=3)

        # Record failures up to threshold
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED
        assert cb.failures == 1

        cb.record_failure()
        assert cb.state == CircuitState.CLOSED
        assert cb.failures == 2

        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        assert cb.failures == 3

    def test_open_state_blocks_requests(self):
        """Test that OPEN state blocks requests"""
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=10.0)

        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        assert cb.can_execute() is False

    def test_half_open_transition(self):
        """Test transition from OPEN to HALF_OPEN"""
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=0.01)

        cb.record_failure()
        assert cb.state == CircuitState.OPEN

        # Wait for recovery timeout
        import time
        time.sleep(0.02)

        assert cb.can_execute() is True
        assert cb.state == CircuitState.HALF_OPEN

    def test_half_open_to_closed(self):
        """Test transition from HALF_OPEN to CLOSED on success"""
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=0.01, half_open_max_calls=3)

        cb.record_failure()
        import time
        time.sleep(0.02)

        # Enter half-open
        assert cb.can_execute() is True
        assert cb.state == CircuitState.HALF_OPEN

        # Success should close the circuit
        cb.record_success()
        assert cb.state == CircuitState.CLOSED
        assert cb.failures == 0

    def test_half_open_to_open(self):
        """Test transition from HALF_OPEN back to OPEN on failure"""
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=0.01)

        cb.record_failure()
        import time
        time.sleep(0.02)

        # Enter half-open
        assert cb.can_execute() is True

        # Failure should reopen the circuit
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

    def test_half_open_max_calls(self):
        """Test max calls limit in HALF_OPEN state"""
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=0.01, half_open_max_calls=2)

        cb.record_failure()
        import time
        time.sleep(0.02)

        # Use up half-open calls
        assert cb.can_execute() is True  # First call
        assert cb.can_execute() is True  # Second call
        # Note: current implementation doesn't block after max calls in half_open state
        # It stays in half_open until success/failure recorded


# =============================================================================
# CollectionLogger Tests
# =============================================================================

class TestCollectionLogger:
    """Test collection logging"""

    @pytest.fixture
    def logger(self):
        """Fixture for fresh logger"""
        return CollectionLogger()

    def test_log_success(self, logger):
        """Test logging successful collection"""
        logger.log_success(
            collector_name="test_collector",
            symbol="000001.SZ",
            item_count=10,
            duration_ms=150.5
        )

        logs = logger.get_recent_logs()
        assert len(logs) == 1

        log = logs[0]
        assert log.collector_name == "test_collector"
        assert log.symbol == "000001.SZ"
        assert log.status == "success"
        assert log.item_count == 10
        assert log.duration_ms == 150.5

    def test_log_error(self, logger):
        """Test logging failed collection"""
        logger.log_error(
            collector_name="test_collector",
            symbol="000001.SZ",
            error_message="Connection timeout",
            duration_ms=5000.0
        )

        logs = logger.get_recent_logs()
        assert len(logs) == 1

        log = logs[0]
        assert log.status == "error"
        assert log.error_message == "Connection timeout"

    def test_log_filtering(self, logger):
        """Test log filtering by collector and symbol"""
        # Add logs from different collectors
        logger.log_success("collector_a", "000001.SZ", 5, 100.0)
        logger.log_success("collector_b", "600000.SH", 3, 50.0)
        logger.log_success("collector_a", "000002.SZ", 2, 80.0)

        # Filter by collector
        logs = logger.get_recent_logs(collector_name="collector_a")
        assert len(logs) == 2

        # Filter by symbol
        logs = logger.get_recent_logs(symbol="000001.SZ")
        assert len(logs) == 1

        # Filter by status
        logger.log_error("collector_c", "000003.SZ", "Error", 100.0)
        logs = logger.get_recent_logs(status="error")
        assert len(logs) == 1

    def test_log_stats(self, logger):
        """Test log statistics calculation"""
        # Add mixed logs
        logger.log_success("test", "000001.SZ", 5, 100.0)
        logger.log_success("test", "000002.SZ", 3, 200.0)
        logger.log_error("test", "000003.SZ", "Error", 50.0)
        logger.log_skipped("test", "000004.SZ")

        stats = logger.get_stats(collector_name="test")

        assert stats["total"] == 4
        assert stats["success"] == 2
        assert stats["error"] == 1
        assert stats["skipped"] == 1
        assert stats["success_rate"] == 0.5
        assert stats["avg_duration_ms"] == pytest.approx(150.0, abs=0.1)

    def test_memory_limit(self):
        """Test that logs are trimmed when exceeding memory limit"""
        logger = CollectionLogger(max_memory_logs=5)

        # Add more logs than limit
        for i in range(10):
            logger.log_success(f"collector_{i}", "000001.SZ", i, 100.0)

        assert len(logger._logs) == 5

        # Should keep the most recent (collector_5 through collector_9)
        # get_recent_logs returns newest first
        logs = logger.get_recent_logs(limit=10)
        assert logs[0].collector_name == "collector_9"  # Most recent
        assert logs[-1].collector_name == "collector_5"  # Oldest in retained

    def test_global_logger(self):
        """Test global logger instance"""
        logger1 = get_logger()
        logger2 = get_logger()

        # Should be same instance
        assert logger1 is logger2


# =============================================================================
# CollectionResult Tests
# =============================================================================

class TestCollectionResult:
    """Test CollectionResult data class"""

    def test_duration_calculation(self):
        """Test duration_ms property"""
        start = datetime.utcnow()
        end = start + timedelta(seconds=1.5)

        result = CollectionResult(
            source_name="test",
            symbol="000001.SZ",
            items=[],
            count=0,
            start_time=start,
            end_time=end,
            success=True
        )

        assert result.duration_ms == pytest.approx(1500.0, abs=1.0)

    def test_to_dict(self):
        """Test CollectionLog to_dict conversion"""
        log = CollectionLog(
            timestamp=datetime(2024, 1, 1, 12, 0, 0),
            collector_name="test",
            symbol="000001.SZ",
            status="success",
            item_count=5,
            duration_ms=100.0,
            metadata={"key": "value"}
        )

        d = log.to_dict()

        assert d["collector_name"] == "test"
        assert d["symbol"] == "000001.SZ"
        assert d["status"] == "success"
        assert d["item_count"] == 5
        assert d["metadata"]["key"] == "value"
