"""
Collection Scheduler - APScheduler-based task scheduling

Manages scheduled execution of multiple collectors with:
- Configurable intervals
- Concurrent execution
- Health monitoring
- Circuit breaker integration
"""
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.job import Job

from .base import BaseCollector, CollectionResult
from .retry import with_retry, RetryPolicy, CircuitBreaker
from .logger import CollectionLogger, get_logger


@dataclass
class ScheduledTask:
    """Scheduled collection task configuration"""
    name: str
    collector: BaseCollector
    symbols: List[str]
    interval_minutes: int = 5
    retry_policy: RetryPolicy = field(default_factory=RetryPolicy)
    circuit_breaker: CircuitBreaker = field(default_factory=CircuitBreaker)
    callback: Optional[Callable[[CollectionResult], None]] = None
    enabled: bool = True


class CollectorScheduler:
    """
    Collector scheduler with APScheduler

    Manages multiple collectors with individual scheduling configurations.
    Supports both interval-based and cron-based triggers.

    Example:
        scheduler = CollectorScheduler()

        # Register collectors
        scheduler.register_collector(
            news_collector,
            interval_minutes=5,
            symbols=["000001.SZ", "600000.SH"]
        )

        # Start scheduling
        await scheduler.start()

        # ... runs scheduled tasks ...

        # Stop scheduler
        await scheduler.stop()
    """

    def __init__(self, logger: Optional[CollectionLogger] = None):
        """
        Initialize scheduler

        Args:
            logger: Collection logger (uses global if None)
        """
        self._collectors: Dict[str, BaseCollector] = {}
        self._tasks: Dict[str, ScheduledTask] = {}
        self._scheduler: Optional[AsyncIOScheduler] = None
        self._running = False
        self._logger = logger or get_logger()
        self._job_ids: Dict[str, str] = {}  # task_name -> job_id

    def register_collector(
        self,
        collector: BaseCollector,
        interval_minutes: int = 5,
        symbols: Optional[List[str]] = None,
        retry_policy: Optional[RetryPolicy] = None,
        callback: Optional[Callable[[CollectionResult], None]] = None,
        enabled: bool = True
    ) -> str:
        """
        Register a collector with scheduling configuration

        Args:
            collector: Collector instance
            interval_minutes: Collection interval in minutes
            symbols: List of stock symbols to collect
            retry_policy: Retry policy for failed collections
            callback: Optional callback for collection results
            enabled: Whether task is enabled

        Returns:
            Task name (collector name)
        """
        task_name = collector.name

        self._collectors[task_name] = collector
        self._tasks[task_name] = ScheduledTask(
            name=task_name,
            collector=collector,
            symbols=symbols or [],
            interval_minutes=interval_minutes,
            retry_policy=retry_policy or RetryPolicy(),
            circuit_breaker=CircuitBreaker(),
            callback=callback,
            enabled=enabled
        )

        print(f"[Scheduler] Registered collector: {task_name} "
              f"(interval={interval_minutes}m, symbols={len(symbols or [])})")

        return task_name

    def unregister_collector(self, name: str):
        """Unregister a collector"""
        if name in self._collectors:
            del self._collectors[name]
        if name in self._tasks:
            del self._tasks[name]
        if name in self._job_ids and self._scheduler:
            try:
                self._scheduler.remove_job(self._job_ids[name])
            except Exception:
                pass
            del self._job_ids[name]

    async def start(self):
        """Start the scheduler"""
        if self._running:
            return

        print("[Scheduler] Starting collector scheduler...")

        # Create scheduler
        self._scheduler = AsyncIOScheduler()

        # Schedule tasks
        for task_name, task in self._tasks.items():
            if not task.enabled:
                continue

            job = self._scheduler.add_job(
                self._execute_task,
                IntervalTrigger(minutes=task.interval_minutes),
                args=[task_name],
                id=f"collect_{task_name}",
                name=f"Collect {task_name}",
                replace_existing=True,
                max_instances=1  # Prevent overlapping executions
            )
            self._job_ids[task_name] = job.id

            print(f"[Scheduler] Scheduled: {task_name} every {task.interval_minutes} minutes")

        # Start scheduler
        self._scheduler.start()
        self._running = True

        print("[Scheduler] Collector scheduler started")

    async def stop(self):
        """Stop the scheduler"""
        if not self._running:
            return

        print("[Scheduler] Stopping collector scheduler...")

        if self._scheduler:
            self._scheduler.shutdown(wait=False)
            self._scheduler = None

        self._running = False
        self._job_ids.clear()

        print("[Scheduler] Collector scheduler stopped")

    async def _execute_task(self, task_name: str):
        """Execute a scheduled task for all its symbols"""
        task = self._tasks.get(task_name)
        if not task:
            return

        # Check circuit breaker
        if not task.circuit_breaker.can_execute():
            print(f"[Scheduler] Circuit breaker OPEN for {task_name}, skipping")
            for symbol in task.symbols:
                self._logger.log_skipped(task_name, symbol, "circuit_breaker_open")
            return

        # Collect for each symbol
        results = []
        for symbol in task.symbols:
            try:
                result = await self._collect_single(task, symbol)
                results.append(result)

                if result.success:
                    task.circuit_breaker.record_success()
                else:
                    task.circuit_breaker.record_failure()

                # Call callback if provided
                if task.callback:
                    try:
                        task.callback(result)
                    except Exception as e:
                        print(f"[Scheduler] Callback error for {task_name}: {e}")

            except Exception as e:
                print(f"[Scheduler] Unhandled error in {task_name} for {symbol}: {e}")
                task.circuit_breaker.record_failure()

        # Log summary
        success_count = sum(1 for r in results if r.success)
        print(f"[Scheduler] Task {task_name} completed: {success_count}/{len(results)} symbols")

    async def _collect_single(self, task: ScheduledTask, symbol: str) -> CollectionResult:
        """Execute collection for a single symbol with retry"""
        collector = task.collector

        # Get incremental collection timestamp
        since = collector.get_last_since(symbol)

        start_time = datetime.utcnow()

        try:
            # Execute collection with retry
            result = await with_retry(
                collector.collect,
                symbol=symbol,
                since=since,
                policy=task.retry_policy
            )

            # Update last since timestamp
            if result.next_since:
                collector.update_last_since(symbol, result.next_since)

            # Log success
            self._logger.log_success(
                collector_name=collector.name,
                symbol=symbol,
                item_count=result.count,
                duration_ms=result.duration_ms,
                metadata={"next_since": result.next_since.isoformat() if result.next_since else None}
            )

            return result

        except Exception as e:
            end_time = datetime.utcnow()
            duration_ms = (end_time - start_time).total_seconds() * 1000

            # Create error result
            result = CollectionResult(
                source_name=collector.name,
                symbol=symbol,
                items=[],
                count=0,
                start_time=start_time,
                end_time=end_time,
                success=False,
                error_message=str(e)
            )

            # Log error
            self._logger.log_error(
                collector_name=collector.name,
                symbol=symbol,
                error_message=str(e),
                duration_ms=duration_ms
            )

            return result

    async def manual_collect(self, collector_name: str, symbol: str) -> CollectionResult:
        """
        Manually trigger collection for a specific collector and symbol

        Args:
            collector_name: Name of registered collector
            symbol: Stock symbol

        Returns:
            CollectionResult
        """
        task = self._tasks.get(collector_name)
        if not task:
            raise ValueError(f"Collector not found: {collector_name}")

        return await self._collect_single(task, symbol)

    def get_collector(self, name: str) -> Optional[BaseCollector]:
        """Get registered collector by name"""
        return self._collectors.get(name)

    def get_task_info(self, name: str) -> Optional[Dict[str, Any]]:
        """Get task information"""
        task = self._tasks.get(name)
        if not task:
            return None

        return {
            "name": task.name,
            "interval_minutes": task.interval_minutes,
            "symbols": task.symbols,
            "enabled": task.enabled,
            "circuit_state": task.circuit_breaker.state,
            "circuit_failures": task.circuit_breaker.failures
        }

    def list_collectors(self) -> List[str]:
        """List all registered collector names"""
        return list(self._collectors.keys())

    def get_health(self) -> Dict[str, Any]:
        """Get scheduler health status"""
        return {
            "running": self._running,
            "collectors": {
                name: {
                    "health": task.collector._health.__dict__,
                    "circuit_state": task.circuit_breaker.state
                }
                for name, task in self._tasks.items()
            }
        }


# Global scheduler instance
_default_scheduler: Optional[CollectorScheduler] = None


def get_scheduler() -> CollectorScheduler:
    """Get global scheduler instance"""
    global _default_scheduler
    if _default_scheduler is None:
        _default_scheduler = CollectorScheduler()
    return _default_scheduler


def set_scheduler(scheduler: CollectorScheduler):
    """Set global scheduler instance"""
    global _default_scheduler
    _default_scheduler = scheduler
