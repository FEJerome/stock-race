"""
T-021: HistoryScheduler - 历史数据调度器

功能：
1. 定时触发日终历史数据采集任务
2. 支持 APScheduler 定时调度
3. 每日19:00自动采集全市场日K线
4. 任务状态管理和监控
5. 失败告警和成功通知

使用：
    scheduler = HistoryScheduler(collector, db_storage)
    await scheduler.start()  # 启动定时任务
    await scheduler.manual_collect(date=date(2026, 2, 13))  # 手动触发
"""

import asyncio
import logging
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any, Callable
from dataclasses import dataclass, field
from enum import Enum

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    APSCHEDULER_AVAILABLE = True
except ImportError:
    APSCHEDULER_AVAILABLE = False
    AsyncIOScheduler = None
    CronTrigger = None

from data_service.services.daily_history_collector import DailyHistoryCollector

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    """任务状态枚举"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class CollectionTask:
    """采集任务数据类"""
    trade_date: date
    status: TaskStatus
    total_stocks: int
    completed_stocks: int = 0
    failed_stocks: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


@dataclass
class ScheduleConfig:
    """调度配置"""
    daily_time: str = "19:00"
    timezone: str = "Asia/Shanghai"
    max_runtime_minutes: int = 60
    enable_daily: bool = True
    enable_integrity_check: bool = True


class HistoryScheduler:
    """
    历史数据调度器

    职责：
    1. 管理定时采集任务
    2. 触发日终批量采集
    3. 监控任务执行状态
    4. 发送告警通知
    """

    def __init__(
        self,
        collector: DailyHistoryCollector,
        db_storage: Optional[Any] = None,
        daily_collection_time: str = "19:00",
        enable_daily_collection: bool = True,
        enable_integrity_check: bool = True
    ):
        """
        初始化调度器

        Args:
            collector: 日终历史数据采集器
            db_storage: 数据库存储实例（可选）
            daily_collection_time: 每日采集时间，默认19:00
            enable_daily_collection: 是否启用每日自动采集
            enable_integrity_check: 是否启用完整性检查
        """
        self.collector = collector
        self.db_storage = db_storage
        self.daily_collection_time = daily_collection_time
        self.enable_daily_collection = enable_daily_collection
        self.enable_integrity_check = enable_integrity_check

        self.is_running = False
        self.current_task: Optional[CollectionTask] = None
        self.scheduler: Optional[Any] = None

        # 通知回调
        self.notification_callbacks: List[Callable] = []

        if not APSCHEDULER_AVAILABLE:
            logger.warning("APScheduler not available, scheduling features disabled")

        logger.info(f"HistoryScheduler initialized: daily_collection_time={daily_collection_time}")

    async def start(self):
        """启动调度器"""
        if not APSCHEDULER_AVAILABLE:
            logger.error("Cannot start scheduler: APScheduler not available")
            return False

        if self.is_running:
            logger.warning("Scheduler is already running")
            return True

        try:
            self.scheduler = AsyncIOScheduler()

            if self.enable_daily_collection:
                # 解析时间
                hour, minute = self.daily_collection_time.split(":")
                self.scheduler.add_job(
                    func=self._daily_collection_job,
                    trigger=CronTrigger(
                        hour=int(hour),
                        minute=int(minute),
                        timezone=self.get_schedule_config().timezone
                    ),
                    id="daily_collection",
                    name="Daily History Collection",
                    replace_existing=True
                )
                logger.info(f"Scheduled daily collection at {self.daily_collection_time}")

            self.scheduler.start()
            self.is_running = True

            logger.info("HistoryScheduler started")
            return True

        except Exception as e:
            logger.error(f"Failed to start scheduler: {e}")
            return False

    async def stop(self):
        """停止调度器"""
        if not self.is_running:
            return

        try:
            if self.scheduler:
                self.scheduler.shutdown(wait=True)
                self.scheduler = None

            self.is_running = False
            logger.info("HistoryScheduler stopped")

        except Exception as e:
            logger.error(f"Error stopping scheduler: {e}")

    async def _daily_collection_job(self):
        """每日采集任务入口"""
        today = date.today()

        # 检查是否是交易日
        if not self._is_trading_day(today):
            logger.info(f"Skipping collection for non-trading day: {today}")
            return

        logger.info(f"Starting daily collection job for {today}")

        # 获取全市场股票列表
        symbols = await self._get_all_stock_symbols()

        if not symbols:
            logger.error("No stock symbols available for collection")
            return

        # 执行采集
        await self.manual_collect(trade_date=today, symbols=symbols)

    async def manual_collect(
        self,
        trade_date: date,
        symbols: List[str],
        progress_callback: Optional[Callable[[int, int, int], None]] = None
    ) -> Dict[str, Any]:
        """
        手动触发采集

        Args:
            trade_date: 交易日期
            symbols: 股票代码列表
            progress_callback: 进度回调函数(completed, total, failed)

        Returns:
            采集结果字典
        """
        if not symbols:
            return {
                "success": False,
                "error": "No symbols provided",
                "trade_date": trade_date.isoformat()
            }

        # 创建任务
        task = self._create_collection_task(
            trade_date=trade_date,
            total_stocks=len(symbols)
        )
        self.current_task = task

        try:
            # 执行任务
            await self._execute_collection_task(
                task=task,
                symbols=symbols,
                progress_callback=progress_callback
            )

            # 发送成功通知
            await self._send_success_notification(task)

            return {
                "success": True,
                "trade_date": trade_date.isoformat(),
                "total_stocks": task.total_stocks,
                "completed_stocks": task.completed_stocks,
                "failed_stocks": task.failed_stocks,
                "status": task.status.value,
                "completion_rate": f"{(task.completed_stocks / task.total_stocks * 100):.2f}%"
            }

        except Exception as e:
            logger.error(f"Manual collection failed: {e}")
            task.status = TaskStatus.FAILED
            task.error_message = str(e)

            # 发送失败通知
            await self._send_failure_notification(task)

            return {
                "success": False,
                "error": str(e),
                "trade_date": trade_date.isoformat()
            }

        finally:
            self.current_task = None

    def _create_collection_task(self, trade_date: date, total_stocks: int) -> CollectionTask:
        """创建采集任务"""
        return CollectionTask(
            trade_date=trade_date,
            status=TaskStatus.PENDING,
            total_stocks=total_stocks,
            completed_stocks=0,
            failed_stocks=0
        )

    def _update_task_status(self, task: CollectionTask, status: TaskStatus):
        """更新任务状态"""
        task.status = status

        if status == TaskStatus.RUNNING and not task.started_at:
            task.started_at = datetime.now()
        elif status in [TaskStatus.COMPLETED, TaskStatus.FAILED] and not task.completed_at:
            task.completed_at = datetime.now()

    async def _execute_collection_task(
        self,
        task: CollectionTask,
        symbols: List[str],
        progress_callback: Optional[Callable[[int, int, int], None]] = None
    ):
        """执行采集任务"""
        self._update_task_status(task, TaskStatus.RUNNING)
        logger.info(f"Executing collection task for {task.trade_date}: {len(symbols)} stocks")

        try:
            # 调用采集器
            results = await self.collector.collect_all_stocks(
                symbols=symbols,
                trade_date=task.trade_date,
                progress_callback=progress_callback
            )

            # 统计结果
            task.completed_stocks = sum(1 for r in results if r.success)
            task.failed_stocks = sum(1 for r in results if not r.success)

            # 保存到数据库
            if self.db_storage:
                await self._save_task_to_db(task)

            # 更新状态
            self._update_task_status(task, TaskStatus.COMPLETED)
            if task.failed_stocks == 0:
                logger.info(f"Collection task completed: {task.completed_stocks}/{task.total_stocks}")
            else:
                logger.warning(f"Collection task completed with {task.failed_stocks} failures")

        except Exception as e:
            logger.error(f"Collection task failed: {e}")
            task.status = TaskStatus.FAILED
            task.error_message = str(e)

            if self.db_storage:
                await self._save_task_to_db(task)

    async def _save_task_to_db(self, task: CollectionTask):
        """保存任务到数据库"""
        if not self.db_storage:
            return

        try:
            task_data = {
                "trade_date": task.trade_date.isoformat(),
                "status": task.status.value,
                "total_stocks": task.total_stocks,
                "completed_stocks": task.completed_stocks,
                "failed_stocks": task.failed_stocks,
                "started_at": task.started_at.isoformat() if task.started_at else None,
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
                "error_message": task.error_message
            }

            await self.db_storage.save_collection_task(task_data)
        except Exception as e:
            logger.error(f"Failed to save task to database: {e}")

    async def _get_all_stock_symbols(self) -> List[str]:
        """获取全市场股票代码列表"""
        # TODO: 从数据库或配置获取全市场股票列表
        # 临时返回示例数据
        return [f"00000{i}.SZ" for i in range(1, 6)]  # 测试用

    def _is_trading_day(self, check_date: date) -> bool:
        """判断是否是交易日"""
        # 周一到周五是交易日
        return check_date.weekday() < 5

    async def _should_collect_on_date(self, check_date: date) -> bool:
        """判断该日期是否需要采集"""
        return self._is_trading_day(check_date)

    def get_schedule_config(self) -> ScheduleConfig:
        """获取调度配置"""
        return ScheduleConfig(
            daily_time=self.daily_collection_time,
            enable_daily=self.enable_daily_collection,
            enable_integrity_check=self.enable_integrity_check
        )

    def _validate_collection_time(self, time_str: str) -> bool:
        """验证采集时间格式"""
        try:
            hour, minute = time_str.split(":")
            h, m = int(hour), int(minute)
            return 0 <= h < 24 and 0 <= m < 60
        except (ValueError, AttributeError):
            return False

    def get_status(self) -> Dict[str, Any]:
        """获取调度器状态"""
        current_task_info = None
        if self.current_task:
            current_task_info = {
                "trade_date": self.current_task.trade_date.isoformat(),
                "status": self.current_task.status.value,
                "progress": f"{self.current_task.completed_stocks}/{self.current_task.total_stocks}"
            }

        return {
            "is_running": self.is_running,
            "current_task": current_task_info,
            "daily_collection_time": self.daily_collection_time,
            "enable_daily_collection": self.enable_daily_collection
        }

    async def get_collection_history(self, days: int = 7) -> List[Dict[str, Any]]:
        """获取采集历史"""
        if not self.db_storage:
            return []

        try:
            history = await self.db_storage.get_collection_history(days=days)
            return history
        except Exception as e:
            logger.error(f"Failed to get collection history: {e}")
            return []

    def register_notification_callback(self, callback: Callable):
        """注册通知回调"""
        self.notification_callbacks.append(callback)

    async def _send_failure_notification(self, task: CollectionTask):
        """发送失败通知"""
        message = f"History collection failed for {task.trade_date}: {task.error_message}"
        await self._notify(message, level="error")

    async def _send_success_notification(self, task: CollectionTask):
        """发送成功通知"""
        message = (
            f"History collection completed for {task.trade_date}: "
            f"{task.completed_stocks}/{task.total_stocks} stocks, "
            f"{task.failed_stocks} failed"
        )
        await self._notify(message, level="info")

    async def _notify(self, message: str, level: str = "info"):
        """发送通知"""
        logger.info(f"[{level.upper()}] {message}")

        for callback in self.notification_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(message, level)
                else:
                    callback(message, level)
            except Exception as e:
                logger.error(f"Notification callback failed: {e}")

    async def close(self):
        """关闭调度器"""
        await self.stop()
        if self.collector:
            await self.collector.close()
