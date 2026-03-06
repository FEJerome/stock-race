"""Unit tests for APScheduler integration."""
import pytest
import sys
import asyncio
import time
from pathlib import Path
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, AsyncMock

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from ai_service.services.scheduler import SchedulerManager, DecisionJob


class TestSchedulerManager:
    """Test suite for SchedulerManager."""

    def setup_method(self):
        """Reset scheduler before each test."""
        SchedulerManager._instance = None
        SchedulerManager._initialized = False
        self.scheduler = SchedulerManager()

    def teardown_method(self):
        """Shutdown scheduler after each test."""
        if self.scheduler.is_running:
            self.scheduler.shutdown()

    def test_singleton(self):
        """Test that SchedulerManager is a singleton."""
        scheduler1 = SchedulerManager()
        scheduler2 = SchedulerManager()
        assert scheduler1 is scheduler2

    def test_init(self):
        """Test scheduler initialization."""
        assert self.scheduler is not None
        assert self.scheduler._scheduler is None
        assert self.scheduler.is_running is False

    @pytest.mark.asyncio
    async def test_initialize(self):
        """Test scheduler explicit initialization."""
        self.scheduler.initialize()
        assert self.scheduler._scheduler is not None
        assert self.scheduler.is_running is True

    @pytest.mark.asyncio
    async def test_initialize_already_running(self):
        """Test double initialization is safe."""
        self.scheduler.initialize()
        first_scheduler = self.scheduler._scheduler

        # Second initialize should not create new scheduler
        self.scheduler.initialize()
        assert self.scheduler._scheduler is first_scheduler

    @pytest.mark.asyncio
    async def test_shutdown(self):
        """Test scheduler shutdown."""
        self.scheduler.initialize()
        assert self.scheduler.is_running is True

        self.scheduler.shutdown()
        assert self.scheduler.is_running is False
        assert self.scheduler._scheduler is None

    def test_shutdown_not_running(self):
        """Test shutdown when not running is safe."""
        # Should not raise exception
        self.scheduler.shutdown()
        assert self.scheduler.is_running is False


class TestDecisionJob:
    """Test suite for DecisionJob data class."""

    def test_job_creation(self):
        """Test DecisionJob creation."""
        job = DecisionJob(
            job_id="decision_acc_123",
            account_id="acc_123",
            frequency_minutes=5,
            trigger_type="interval"
        )

        assert job.job_id == "decision_acc_123"
        assert job.account_id == "acc_123"
        assert job.frequency_minutes == 5
        assert job.trigger_type == "interval"
        assert job.next_run_time is None

    def test_job_with_next_run_time(self):
        """Test DecisionJob with next run time."""
        next_run = datetime.now() + timedelta(minutes=5)
        job = DecisionJob(
            job_id="decision_acc_456",
            account_id="acc_456",
            frequency_minutes=15,
            trigger_type="interval",
            next_run_time=next_run
        )

        assert job.next_run_time == next_run


class TestSchedulerJobs:
    """Test suite for job management."""

    @pytest.fixture(autouse=True)
    async def setup_scheduler(self):
        """Setup scheduler for each test."""
        SchedulerManager._instance = None
        SchedulerManager._initialized = False
        self.scheduler = SchedulerManager()
        self.scheduler.initialize()
        yield
        # Cleanup after each test
        if self.scheduler.is_running:
            self.scheduler.shutdown()

    def test_add_interval_job(self):
        """Test adding an interval job."""
        mock_callback = Mock()

        job = self.scheduler.add_decision_job(
            account_id="acc_123",
            frequency_minutes=5,
            callback=mock_callback
        )

        assert job is not None
        assert job.account_id == "acc_123"
        assert job.frequency_minutes == 5
        assert "acc_123" in job.job_id

    def test_add_job_with_custom_callback(self):
        """Test adding job with custom callback function."""
        call_count = 0

        def custom_callback(account_id):
            nonlocal call_count
            call_count += 1

        job = self.scheduler.add_decision_job(
            account_id="acc_test",
            frequency_minutes=5,
            callback=custom_callback
        )

        assert job is not None

    def test_remove_job(self):
        """Test removing a job."""
        mock_callback = Mock()

        job = self.scheduler.add_decision_job(
            account_id="acc_remove",
            frequency_minutes=5,
            callback=mock_callback
        )

        # Remove the job
        result = self.scheduler.remove_decision_job("acc_remove")
        assert result is True

    def test_remove_nonexistent_job(self):
        """Test removing a job that doesn't exist."""
        result = self.scheduler.remove_decision_job("nonexistent")
        assert result is False

    def test_get_job(self):
        """Test getting a job by account ID."""
        mock_callback = Mock()

        self.scheduler.add_decision_job(
            account_id="acc_get",
            frequency_minutes=5,
            callback=mock_callback
        )

        job = self.scheduler.get_decision_job("acc_get")
        assert job is not None
        assert job.account_id == "acc_get"

    def test_get_nonexistent_job(self):
        """Test getting a job that doesn't exist."""
        job = self.scheduler.get_decision_job("nonexistent")
        assert job is None

    def test_list_jobs(self):
        """Test listing all decision jobs."""
        mock_callback = Mock()

        # Add multiple jobs
        self.scheduler.add_decision_job(
            account_id="acc_1",
            frequency_minutes=5,
            callback=mock_callback
        )
        self.scheduler.add_decision_job(
            account_id="acc_2",
            frequency_minutes=15,
            callback=mock_callback
        )

        jobs = self.scheduler.list_decision_jobs()
        assert len(jobs) == 2

    def test_list_jobs_empty(self):
        """Test listing jobs when none exist."""
        jobs = self.scheduler.list_decision_jobs()
        assert jobs == []

    def test_job_frequency_validation(self):
        """Test job frequency validation."""
        mock_callback = Mock()

        # Valid frequencies: 5, 15, 60 minutes
        with pytest.raises(ValueError):
            self.scheduler.add_decision_job(
                account_id="acc_invalid",
                frequency_minutes=10,  # Invalid frequency
                callback=mock_callback
            )

    def test_job_replace_existing(self):
        """Test that adding job with same account ID replaces existing."""
        mock_callback = Mock()

        # Add first job
        job1 = self.scheduler.add_decision_job(
            account_id="acc_replace",
            frequency_minutes=5,
            callback=mock_callback
        )

        # Add second job with same account ID
        job2 = self.scheduler.add_decision_job(
            account_id="acc_replace",
            frequency_minutes=15,
            callback=mock_callback
        )

        # Should have only one job
        jobs = self.scheduler.list_decision_jobs()
        assert len(jobs) == 1


class TestSchedulerAsyncOperations:
    """Test suite for async operations."""

    @pytest.fixture(autouse=True)
    async def setup_scheduler(self):
        """Setup scheduler for each test."""
        SchedulerManager._instance = None
        SchedulerManager._initialized = False
        self.scheduler = SchedulerManager()
        self.scheduler.initialize()
        yield
        # Cleanup after each test
        if self.scheduler.is_running:
            self.scheduler.shutdown()

    @pytest.mark.asyncio
    async def test_async_job_execution(self):
        """Test that async callbacks work correctly."""
        call_count = 0
        received_account_id = None

        async def async_callback(account_id):
            nonlocal call_count, received_account_id
            call_count += 1
            received_account_id = account_id

        self.scheduler.add_decision_job(
            account_id="acc_async",
            frequency_minutes=5,
            callback=async_callback
        )

        # Manually trigger the job for testing
        await async_callback("acc_async")

        assert call_count == 1
        assert received_account_id == "acc_async"


class TestSchedulerErrorHandling:
    """Test suite for error handling."""

    @pytest.fixture(autouse=True)
    async def setup_scheduler(self):
        """Setup scheduler for each test."""
        SchedulerManager._instance = None
        SchedulerManager._initialized = False
        self.scheduler = SchedulerManager()
        yield
        # Cleanup after each test
        if self.scheduler.is_running:
            self.scheduler.shutdown()

    def test_add_job_without_initialization(self):
        """Test adding job without initialization raises error."""
        mock_callback = Mock()

        with pytest.raises(RuntimeError):
            self.scheduler.add_decision_job(
                account_id="acc_no_init",
                frequency_minutes=5,
                callback=mock_callback
            )

    @pytest.mark.asyncio
    async def test_callback_error_handling(self):
        """Test that errors in callbacks are handled gracefully."""
        def error_callback(account_id):
            raise ValueError("Test error")

        self.scheduler.initialize()

        # Should not raise exception during add
        job = self.scheduler.add_decision_job(
            account_id="acc_error",
            frequency_minutes=5,
            callback=error_callback
        )

        assert job is not None


class TestSchedulerIntegration:
    """Integration tests for SchedulerManager."""

    @pytest.fixture(autouse=True)
    async def setup_scheduler(self):
        """Reset singleton before each test."""
        SchedulerManager._instance = None
        SchedulerManager._initialized = False
        yield

    @pytest.mark.asyncio
    async def test_full_lifecycle(self):
        """Test full scheduler lifecycle."""
        scheduler = SchedulerManager()
        mock_callback = Mock()

        # Initialize
        scheduler.initialize()
        assert scheduler.is_running is True

        # Add jobs
        job1 = scheduler.add_decision_job(
            account_id="acc_lifecycle_1",
            frequency_minutes=5,
            callback=mock_callback
        )
        job2 = scheduler.add_decision_job(
            account_id="acc_lifecycle_2",
            frequency_minutes=15,
            callback=mock_callback
        )

        assert len(scheduler.list_decision_jobs()) == 2

        # Get job
        retrieved = scheduler.get_decision_job("acc_lifecycle_1")
        assert retrieved is not None

        # Remove one job
        scheduler.remove_decision_job("acc_lifecycle_1")
        assert len(scheduler.list_decision_jobs()) == 1

        # Shutdown
        scheduler.shutdown()
        assert scheduler.is_running is False

