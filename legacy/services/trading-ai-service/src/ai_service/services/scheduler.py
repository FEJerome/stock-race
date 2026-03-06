"""
APScheduler integration for Trading AI Service.

Provides scheduled decision triggers for AI accounts using APScheduler.
"""
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Dict, List, Optional, Any, Union
from functools import wraps

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.job import Job as APJob
from loguru import logger


@dataclass
class DecisionJob:
    """Represents a scheduled decision job for an AI account."""

    job_id: str
    account_id: str
    frequency_minutes: int
    trigger_type: str = "interval"
    next_run_time: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        """Validate job parameters."""
        if self.frequency_minutes not in [5, 15, 60]:
            raise ValueError(
                f"Invalid frequency: {self.frequency_minutes}. "
                "Must be one of: 5, 15, 60 minutes"
            )


class SchedulerManager:
    """
    Singleton manager for APScheduler.

    Manages scheduled decision jobs for AI accounts.
    Supports interval-based triggering (5/15/60 minutes).
    """

    _instance: Optional['SchedulerManager'] = None
    _initialized: bool = False

    def __new__(cls) -> 'SchedulerManager':
        """Ensure singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize scheduler manager."""
        if not self._initialized:
            self._scheduler: Optional[AsyncIOScheduler] = None
            self._jobs: Dict[str, DecisionJob] = {}
            self._callbacks: Dict[str, Callable] = {}
            self._lock = asyncio.Lock()
            SchedulerManager._initialized = True

    def initialize(self, event_loop: Optional[asyncio.AbstractEventLoop] = None) -> None:
        """
        Initialize the APScheduler.

        Must be called before adding jobs. Safe to call multiple times.

        Args:
            event_loop: Optional event loop to use. If not provided, will try to get current loop.
        """
        if self._scheduler is None:
            try:
                # Get or create event loop
                try:
                    loop = event_loop or asyncio.get_running_loop()
                except RuntimeError:
                    # No running loop, create a new one
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)

                self._scheduler = AsyncIOScheduler(event_loop=loop)
                self._scheduler.start()
                logger.info("SchedulerManager initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize scheduler: {e}")
                raise RuntimeError(f"Scheduler initialization failed: {e}")
        else:
            logger.debug("Scheduler already initialized")

    def shutdown(self, wait: bool = True) -> None:
        """
        Shutdown the scheduler and clean up resources.

        Args:
            wait: Whether to wait for running jobs to complete
        """
        if self._scheduler is not None:
            try:
                self._scheduler.shutdown(wait=wait)
                logger.info("SchedulerManager shutdown successfully")
            except Exception as e:
                logger.error(f"Error during scheduler shutdown: {e}")
            finally:
                self._scheduler = None
                self._jobs.clear()
                self._callbacks.clear()

    @property
    def is_running(self) -> bool:
        """Check if scheduler is running."""
        return self._scheduler is not None and self._scheduler.running

    def _ensure_initialized(self) -> None:
        """Ensure scheduler is initialized before operations."""
        if not self.is_running:
            raise RuntimeError(
                "Scheduler not initialized. Call initialize() first."
            )

    def _create_job_id(self, account_id: str) -> str:
        """Create a unique job ID for an account."""
        return f"decision_{account_id}"

    def _wrap_callback(
        self,
        account_id: str,
        callback: Callable[[str], Any]
    ) -> Callable:
        """
        Wrap callback to handle errors and logging.

        Args:
            account_id: The AI account ID
            callback: The callback function to wrap

        Returns:
            Wrapped callback function
        """
        @wraps(callback)
        async def async_wrapper():
            try:
                logger.debug(f"Executing scheduled decision for account: {account_id}")
                if asyncio.iscoroutinefunction(callback):
                    await callback(account_id)
                else:
                    callback(account_id)
                logger.debug(f"Decision execution completed for account: {account_id}")
            except Exception as e:
                logger.error(
                    f"Error executing decision callback for account {account_id}: {e}"
                )

        @wraps(callback)
        def sync_wrapper():
            try:
                logger.debug(f"Executing scheduled decision for account: {account_id}")
                callback(account_id)
                logger.debug(f"Decision execution completed for account: {account_id}")
            except Exception as e:
                logger.error(
                    f"Error executing decision callback for account {account_id}: {e}"
                )

        return async_wrapper if asyncio.iscoroutinefunction(callback) else sync_wrapper

    def add_decision_job(
        self,
        account_id: str,
        frequency_minutes: int,
        callback: Callable[[str], Any],
        replace_existing: bool = True,
        **metadata
    ) -> DecisionJob:
        """
        Add a scheduled decision job for an AI account.

        Args:
            account_id: The AI account ID
            frequency_minutes: Decision frequency (5, 15, or 60 minutes)
            callback: Callback function to execute (sync or async)
            replace_existing: Whether to replace existing job for same account
            **metadata: Additional metadata for the job

        Returns:
            DecisionJob: The created job

        Raises:
            RuntimeError: If scheduler not initialized
            ValueError: If frequency is invalid
        """
        self._ensure_initialized()

        job_id = self._create_job_id(account_id)

        # Remove existing job if present
        if replace_existing and account_id in self._jobs:
            self.remove_decision_job(account_id)
            logger.debug(f"Replaced existing job for account: {account_id}")

        # Create wrapped callback for error handling
        wrapped_callback = self._wrap_callback(account_id, callback)

        # Add job to APScheduler
        try:
            ap_job = self._scheduler.add_job(
                func=wrapped_callback,
                trigger=IntervalTrigger(minutes=frequency_minutes),
                id=job_id,
                replace_existing=replace_existing,
                misfire_grace_time=300,  # 5 minutes grace period
                max_instances=1,  # Only one instance at a time
            )
        except Exception as e:
            logger.error(f"Failed to add job for account {account_id}: {e}")
            raise RuntimeError(f"Failed to add decision job: {e}")

        # Create and store job info
        job = DecisionJob(
            job_id=job_id,
            account_id=account_id,
            frequency_minutes=frequency_minutes,
            trigger_type="interval",
            next_run_time=ap_job.next_run_time.replace(tzinfo=None) if ap_job.next_run_time else None,
            metadata=metadata
        )

        self._jobs[account_id] = job
        self._callbacks[account_id] = callback

        logger.info(
            f"Added decision job for account {account_id} "
            f"with frequency {frequency_minutes} minutes"
        )

        return job

    def remove_decision_job(self, account_id: str) -> bool:
        """
        Remove a scheduled decision job.

        Args:
            account_id: The AI account ID

        Returns:
            bool: True if job was removed, False if not found
        """
        self._ensure_initialized()

        if account_id not in self._jobs:
            logger.debug(f"No job found for account: {account_id}")
            return False

        job_id = self._create_job_id(account_id)

        try:
            # Remove from APScheduler
            ap_job = self._scheduler.get_job(job_id)
            if ap_job:
                ap_job.remove()

            # Remove from tracking
            del self._jobs[account_id]
            del self._callbacks[account_id]

            logger.info(f"Removed decision job for account: {account_id}")
            return True
        except Exception as e:
            logger.error(f"Error removing job for account {account_id}: {e}")
            return False

    def get_decision_job(self, account_id: str) -> Optional[DecisionJob]:
        """
        Get a decision job by account ID.

        Args:
            account_id: The AI account ID

        Returns:
            DecisionJob if found, None otherwise
        """
        self._ensure_initialized()
        return self._jobs.get(account_id)

    def list_decision_jobs(self) -> List[DecisionJob]:
        """
        List all scheduled decision jobs.

        Returns:
            List of DecisionJob
        """
        self._ensure_initialized()
        return list(self._jobs.values())

    def pause_decision_job(self, account_id: str) -> bool:
        """
        Pause a scheduled decision job.

        Args:
            account_id: The AI account ID

        Returns:
            bool: True if job was paused, False if not found
        """
        self._ensure_initialized()

        if account_id not in self._jobs:
            return False

        job_id = self._create_job_id(account_id)

        try:
            ap_job = self._scheduler.get_job(job_id)
            if ap_job:
                ap_job.pause()
                logger.info(f"Paused decision job for account: {account_id}")
                return True
        except Exception as e:
            logger.error(f"Error pausing job for account {account_id}: {e}")

        return False

    def resume_decision_job(self, account_id: str) -> bool:
        """
        Resume a paused decision job.

        Args:
            account_id: The AI account ID

        Returns:
            bool: True if job was resumed, False if not found
        """
        self._ensure_initialized()

        if account_id not in self._jobs:
            return False

        job_id = self._create_job_id(account_id)

        try:
            ap_job = self._scheduler.get_job(job_id)
            if ap_job:
                ap_job.resume()
                logger.info(f"Resumed decision job for account: {account_id}")
                return True
        except Exception as e:
            logger.error(f"Error resuming job for account {account_id}: {e}")

        return False

    def get_job_statistics(self) -> Dict[str, Any]:
        """
        Get scheduler statistics.

        Returns:
            Dict with scheduler stats
        """
        self._ensure_initialized()

        return {
            "is_running": self.is_running,
            "total_jobs": len(self._jobs),
            "jobs": [
                {
                    "account_id": job.account_id,
                    "frequency_minutes": job.frequency_minutes,
                    "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
                }
                for job in self._jobs.values()
            ]
        }


# Global scheduler instance
def get_scheduler() -> SchedulerManager:
    """Get the global scheduler manager instance."""
    return SchedulerManager()
