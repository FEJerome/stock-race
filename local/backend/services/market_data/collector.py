"""
Market Data Collector - Scheduled data collection with circuit breaker

Provides scheduled data collection from multiple sources:
- High frequency (1 minute): Real-time quotes via AkShare
- Low frequency (daily EOD): Fundamental data via Baostock/Tushare

Features:
- APScheduler for task scheduling
- Circuit breaker pattern for fault tolerance
- Automatic failover between data sources
- Health monitoring and weight adjustment
"""
import asyncio
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Callable, Any
from dataclasses import dataclass, field
from enum import Enum

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .base import DataSource, DataSourceStatus, Quote
from .router import DataSourceRouter
from .akshare_source import AkShareDataSource
from .baostock_source import BaostockDataSource
from .tushare_source import TushareDataSource


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing if recovered


@dataclass
class CircuitBreaker:
    """Circuit breaker for data source protection"""
    failure_threshold: int = 5
    recovery_timeout: float = 60.0  # seconds
    half_open_max_calls: int = 3

    failures: int = 0
    last_failure_time: Optional[datetime] = None
    state: CircuitState = CircuitState.CLOSED
    half_open_calls: int = 0

    def can_execute(self) -> bool:
        """Check if request can be executed"""
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            if self.last_failure_time and \
               (datetime.utcnow() - self.last_failure_time).total_seconds() > self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                self.half_open_calls = 0
                return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            if self.half_open_calls < self.half_open_max_calls:
                self.half_open_calls += 1
                return True
            return False

        return True

    def record_success(self):
        """Record successful execution"""
        self.failures = 0
        self.half_open_calls = 0
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.CLOSED

    def record_failure(self):
        """Record failed execution"""
        self.failures += 1
        self.last_failure_time = datetime.utcnow()

        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
        elif self.failures >= self.failure_threshold:
            self.state = CircuitState.OPEN


@dataclass
class CollectionTask:
    """Data collection task configuration"""
    name: str
    source: DataSource
    symbols: List[str]
    callback: Optional[Callable[[Quote], None]] = None
    circuit_breaker: CircuitBreaker = field(default_factory=CircuitBreaker)
    last_success: Optional[datetime] = None
    last_error: Optional[str] = None


class MarketDataCollector:
    """
    Market data collector with scheduling and circuit breaker

    Manages scheduled data collection from multiple sources:
    - AkShare: 1-minute interval for real-time data
    - Baostock: Daily at 15:30 for EOD fundamental data
    - Tushare: Daily at 15:30 for EOD financial data

    Usage:
        collector = MarketDataCollector(router)
        await collector.start()
        # ... runs scheduled tasks ...
        await collector.stop()
    """

    def __init__(
        self,
        router: Optional[DataSourceRouter] = None,
        db_session_factory=None,
        enable_akshare: bool = True,
        enable_baostock: bool = True,
        enable_tushare: bool = True
    ):
        """
        Initialize market data collector

        Args:
            router: DataSourceRouter instance (creates new if None)
            db_session_factory: Factory for database sessions
            enable_akshare: Enable AkShare collection
            enable_baostock: Enable Baostock collection
            enable_tushare: Enable Tushare collection (requires token)
        """
        self._router = router or DataSourceRouter()
        self._db_factory = db_session_factory
        self._scheduler: Optional[AsyncIOScheduler] = None
        self._running = False
        self._tasks: Dict[str, CollectionTask] = {}

        # Data sources
        self._akshare: Optional[AkShareDataSource] = None
        self._baostock: Optional[BaostockDataSource] = None
        self._tushare: Optional[TushareDataSource] = None

        self._enable_akshare = enable_akshare
        self._enable_baostock = enable_baostock
        self._enable_tushare = enable_tushare

        # Collection statistics
        self._stats: Dict[str, Dict[str, Any]] = {}

    async def _init_sources(self):
        """Initialize data sources"""
        if self._enable_akshare:
            try:
                self._akshare = AkShareDataSource(name="akshare", priority=70)
                self._router.register_source(self._akshare, weight=0.7)
                print("[Collector] AkShare data source initialized")
            except Exception as e:
                print(f"[Collector] Failed to initialize AkShare: {e}")

        if self._enable_baostock:
            try:
                self._baostock = BaostockDataSource(name="baostock", priority=80)
                # Login required for Baostock
                login_success = await self._baostock.login()
                if login_success:
                    self._router.register_source(self._baostock, weight=0.5)
                    print("[Collector] Baostock data source initialized")
                else:
                    print("[Collector] Baostock login failed, skipping")
                    self._baostock = None
            except Exception as e:
                print(f"[Collector] Failed to initialize Baostock: {e}")

        if self._enable_tushare:
            try:
                self._tushare = TushareDataSource(name="tushare", priority=75)
                # Check if token is available
                if await self._tushare._ensure_initialized():
                    self._router.register_source(self._tushare, weight=0.6)
                    print("[Collector] Tushare data source initialized")
                else:
                    print("[Collector] Tushare token not available, skipping")
                    self._tushare = None
            except Exception as e:
                print(f"[Collector] Failed to initialize Tushare: {e}")

    def _get_popular_symbols(self) -> List[str]:
        """Get list of popular stock symbols to track"""
        return [
            "600000.SH", "600036.SH", "600519.SH",  # Shanghai
            "000001.SZ", "000002.SZ", "000858.SZ",  # Shenzhen
            "002415.SZ", "002594.SZ",               # SME
            "300059.SZ", "300750.SZ"                # ChiNext
        ]

    async def _collect_akshare(self):
        """Collect data from AkShare (1-minute interval)"""
        if not self._akshare:
            return

        task_name = "akshare_collect"
        task = self._tasks.get(task_name)
        if not task:
            task = CollectionTask(
                name=task_name,
                source=self._akshare,
                symbols=self._get_popular_symbols()
            )
            self._tasks[task_name] = task

        # Check circuit breaker
        if not task.circuit_breaker.can_execute():
            print(f"[Collector] AkShare circuit breaker is OPEN, skipping")
            return

        try:
            start_time = time.time()
            quotes = await self._akshare.get_quotes(task.symbols)
            elapsed = time.time() - start_time

            success_count = sum(1 for q in quotes.values() if q is not None)
            print(f"[Collector] AkShare: fetched {success_count}/{len(task.symbols)} stocks in {elapsed:.2f}s")

            # Record success
            task.circuit_breaker.record_success()
            task.last_success = datetime.utcnow()

            # Update stats
            self._stats["akshare"] = {
                "last_run": datetime.utcnow().isoformat(),
                "success_count": success_count,
                "elapsed_ms": elapsed * 1000,
                "status": "success"
            }

            # Persist to cache if available
            from .cache_service import get_cache_service
            cache_service = get_cache_service()
            if cache_service:
                for quote in quotes.values():
                    if quote:
                        await cache_service.update_quote(quote)

        except Exception as e:
            error_msg = str(e)
            print(f"[Collector] AkShare collection failed: {error_msg}")
            task.circuit_breaker.record_failure()
            task.last_error = error_msg
            self._stats["akshare"] = {
                "last_run": datetime.utcnow().isoformat(),
                "status": "error",
                "error": error_msg
            }

    async def _collect_baostock(self):
        """Collect data from Baostock (daily EOD)"""
        if not self._baostock:
            return

        task_name = "baostock_collect"
        task = self._tasks.get(task_name)
        if not task:
            task = CollectionTask(
                name=task_name,
                source=self._baostock,
                symbols=self._get_popular_symbols()
            )
            self._tasks[task_name] = task

        if not task.circuit_breaker.can_execute():
            print(f"[Collector] Baostock circuit breaker is OPEN, skipping")
            return

        try:
            start_time = time.time()

            # Collect quotes and fundamentals
            results = []
            for symbol in task.symbols:
                try:
                    quote = await self._baostock.get_quote(symbol)
                    if quote:
                        fundamentals = await self._baostock.get_fundamentals(symbol)
                        results.append({
                            "symbol": symbol,
                            "quote": quote,
                            "fundamentals": fundamentals
                        })
                except Exception as e:
                    print(f"[Collector] Baostock error for {symbol}: {e}")
                    continue

            elapsed = time.time() - start_time
            print(f"[Collector] Baostock: fetched {len(results)} stocks in {elapsed:.2f}s")

            task.circuit_breaker.record_success()
            task.last_success = datetime.utcnow()

            self._stats["baostock"] = {
                "last_run": datetime.utcnow().isoformat(),
                "success_count": len(results),
                "elapsed_ms": elapsed * 1000,
                "status": "success"
            }

        except Exception as e:
            error_msg = str(e)
            print(f"[Collector] Baostock collection failed: {error_msg}")
            task.circuit_breaker.record_failure()
            task.last_error = error_msg
            self._stats["baostock"] = {
                "last_run": datetime.utcnow().isoformat(),
                "status": "error",
                "error": error_msg
            }

    async def _collect_tushare(self):
        """Collect data from Tushare (daily EOD)"""
        if not self._tushare:
            return

        task_name = "tushare_collect"
        task = self._tasks.get(task_name)
        if not task:
            task = CollectionTask(
                name=task_name,
                source=self._tushare,
                symbols=self._get_popular_symbols()
            )
            self._tasks[task_name] = task

        if not task.circuit_breaker.can_execute():
            print(f"[Collector] Tushare circuit breaker is OPEN, skipping")
            return

        try:
            start_time = time.time()

            # Collect financial data
            results = []
            for symbol in task.symbols:
                try:
                    daily_basic = await self._tushare.get_daily_basic(symbol)
                    financials = await self._tushare.get_financial_data(symbol)
                    if daily_basic or financials:
                        results.append({
                            "symbol": symbol,
                            "daily_basic": daily_basic,
                            "financials": financials
                        })
                except Exception as e:
                    print(f"[Collector] Tushare error for {symbol}: {e}")
                    continue

            elapsed = time.time() - start_time
            print(f"[Collector] Tushare: fetched {len(results)} stocks in {elapsed:.2f}s")

            task.circuit_breaker.record_success()
            task.last_success = datetime.utcnow()

            self._stats["tushare"] = {
                "last_run": datetime.utcnow().isoformat(),
                "success_count": len(results),
                "elapsed_ms": elapsed * 1000,
                "status": "success"
            }

        except Exception as e:
            error_msg = str(e)
            print(f"[Collector] Tushare collection failed: {error_msg}")
            task.circuit_breaker.record_failure()
            task.last_error = error_msg
            self._stats["tushare"] = {
                "last_run": datetime.utcnow().isoformat(),
                "status": "error",
                "error": error_msg
            }

    async def _health_check_task(self):
        """Periodic health check for all sources"""
        try:
            health = await self._router.health_check()
            for name, status in health.items():
                if status.status == DataSourceStatus.UNAVAILABLE:
                    print(f"[Collector] Health check: {name} is UNAVAILABLE")
                elif status.status == DataSourceStatus.DEGRADED:
                    print(f"[Collector] Health check: {name} is DEGRADED")
        except Exception as e:
            print(f"[Collector] Health check failed: {e}")

    async def start(self):
        """Start the collector scheduler"""
        if self._running:
            return

        print("[Collector] Starting market data collector...")

        # Initialize data sources
        await self._init_sources()

        # Create scheduler
        self._scheduler = AsyncIOScheduler()

        # Schedule AkShare: every 1 minute during market hours
        # Market hours: 9:30-11:30, 13:00-15:00 (China time)
        if self._akshare:
            self._scheduler.add_job(
                self._collect_akshare,
                IntervalTrigger(minutes=1),
                id="akshare_collect",
                name="AkShare 1-minute collection",
                replace_existing=True
            )
            print("[Collector] Scheduled: AkShare every 1 minute")

        # Schedule Baostock: daily at 15:30 (after market close)
        if self._baostock:
            self._scheduler.add_job(
                self._collect_baostock,
                CronTrigger(hour=15, minute=30),
                id="baostock_collect",
                name="Baostock daily EOD collection",
                replace_existing=True
            )
            print("[Collector] Scheduled: Baostock daily at 15:30")

        # Schedule Tushare: daily at 15:30 (after market close)
        if self._tushare:
            self._scheduler.add_job(
                self._collect_tushare,
                CronTrigger(hour=15, minute=30),
                id="tushare_collect",
                name="Tushare daily EOD collection",
                replace_existing=True
            )
            print("[Collector] Scheduled: Tushare daily at 15:30")

        # Schedule health check: every 30 seconds
        self._scheduler.add_job(
            self._health_check_task,
            IntervalTrigger(seconds=30),
            id="health_check",
            name="Source health check",
            replace_existing=True
        )

        # Start scheduler
        self._scheduler.start()
        self._running = True
        print("[Collector] Market data collector started")

    async def stop(self):
        """Stop the collector scheduler"""
        if not self._running:
            return

        print("[Collector] Stopping market data collector...")

        if self._scheduler:
            self._scheduler.shutdown(wait=False)
            self._scheduler = None

        # Close data sources
        if self._akshare:
            await self._akshare.close()
        if self._baostock:
            await self._baostock.close()
        if self._tushare:
            await self._tushare.close()

        self._running = False
        print("[Collector] Market data collector stopped")

    def get_stats(self) -> Dict[str, Any]:
        """Get collection statistics"""
        return {
            "running": self._running,
            "stats": self._stats,
            "tasks": {
                name: {
                    "last_success": task.last_success.isoformat() if task.last_success else None,
                    "last_error": task.last_error,
                    "circuit_state": task.circuit_breaker.state.value,
                    "failures": task.circuit_breaker.failures
                }
                for name, task in self._tasks.items()
            }
        }

    async def manual_collect(self, source_name: str) -> Dict[str, Any]:
        """Manually trigger collection for a source"""
        if source_name == "akshare" and self._akshare:
            await self._collect_akshare()
            return {"status": "triggered", "source": source_name}
        elif source_name == "baostock" and self._baostock:
            await self._collect_baostock()
            return {"status": "triggered", "source": source_name}
        elif source_name == "tushare" and self._tushare:
            await self._collect_tushare()
            return {"status": "triggered", "source": source_name}
        else:
            return {"status": "error", "message": f"Source {source_name} not available"}


# Global instance
_collector: Optional[MarketDataCollector] = None


def get_collector() -> Optional[MarketDataCollector]:
    """Get global collector instance"""
    return _collector


def create_collector(
    router: Optional[DataSourceRouter] = None,
    db_session_factory=None,
    **kwargs
) -> MarketDataCollector:
    """Create and return a new collector instance"""
    global _collector
    _collector = MarketDataCollector(router, db_session_factory, **kwargs)
    return _collector
