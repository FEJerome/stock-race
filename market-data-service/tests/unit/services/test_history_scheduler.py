"""
T-021: HistoryScheduler 单元测试

历史数据调度器测试，采用 TDD 模式开发。
测试覆盖：
- 定时任务调度
- 任务触发逻辑
- 并发控制
- 错误通知
- 手动触发
- 状态监控
"""

import pytest
import asyncio
from datetime import datetime, date, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from typing import List, Dict, Any

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from data_service.services.history_scheduler import (
    HistoryScheduler,
    ScheduleConfig,
    TaskStatus,
    CollectionTask
)


class TestHistorySchedulerBasics:
    """HistoryScheduler 基础功能测试"""

    @pytest.fixture
    def mock_collector(self):
        """模拟 DailyHistoryCollector"""
        mock = AsyncMock()
        mock.collect_all_stocks = AsyncMock(return_value=[])
        mock.get_stats = Mock(return_value={
            "total_processed": 100,
            "total_success": 98,
            "total_failed": 2,
            "success_rate": 0.98
        })
        mock.close = AsyncMock()
        return mock

    @pytest.fixture
    def mock_db_storage(self):
        """模拟数据库存储"""
        mock = AsyncMock()
        mock.save_collection_task = AsyncMock()
        mock.get_collection_task = AsyncMock(return_value=None)
        mock.update_collection_task = AsyncMock()
        return mock

    @pytest.fixture
    def scheduler(self, mock_collector, mock_db_storage):
        """创建调度器实例"""
        return HistoryScheduler(
            collector=mock_collector,
            db_storage=mock_db_storage
        )

    # ==========================================================================
    # 测试1: 初始化测试
    # ==========================================================================

    def test_scheduler_initialization(self, mock_collector, mock_db_storage):
        """测试调度器初始化"""
        scheduler = HistoryScheduler(
            collector=mock_collector,
            db_storage=mock_db_storage,
            daily_collection_time="19:00"
        )

        assert scheduler.collector == mock_collector
        assert scheduler.db_storage == mock_db_storage
        assert scheduler.daily_collection_time == "19:00"
        assert scheduler.is_running is False
        assert scheduler.current_task is None

    def test_scheduler_default_values(self, mock_collector, mock_db_storage):
        """测试调度器默认值"""
        scheduler = HistoryScheduler(
            collector=mock_collector,
            db_storage=mock_db_storage
        )

        assert scheduler.daily_collection_time == "19:00"
        assert scheduler.enable_daily_collection is True
        assert scheduler.enable_integrity_check is True

    # ==========================================================================
    # 测试2: 任务创建和状态管理
    # ==========================================================================

    def test_create_collection_task(self, scheduler):
        """测试创建采集任务"""
        task = scheduler._create_collection_task(
            trade_date=date(2026, 2, 13),
            total_stocks=5300
        )

        assert task.trade_date == date(2026, 2, 13)
        assert task.status == TaskStatus.PENDING
        assert task.total_stocks == 5300
        assert task.completed_stocks == 0
        assert task.failed_stocks == 0
        assert task.started_at is None
        assert task.completed_at is None

    def test_update_task_status(self, scheduler):
        """测试更新任务状态"""
        task = scheduler._create_collection_task(
            trade_date=date(2026, 2, 13),
            total_stocks=5300
        )

        # 更新为运行中
        scheduler._update_task_status(task, TaskStatus.RUNNING)
        assert task.status == TaskStatus.RUNNING
        assert task.started_at is not None

        # 更新为完成
        scheduler._update_task_status(task, TaskStatus.COMPLETED)
        assert task.status == TaskStatus.COMPLETED
        assert task.completed_at is not None

    # ==========================================================================
    # 测试3: 定时任务配置
    # ==========================================================================

    def test_schedule_config(self, scheduler):
        """测试定时配置"""
        config = scheduler.get_schedule_config()

        assert isinstance(config, ScheduleConfig)
        assert config.daily_time == "19:00"
        assert config.timezone == "Asia/Shanghai"
        assert config.max_runtime_minutes == 60

    def test_validate_collection_time(self, scheduler):
        """测试采集时间验证"""
        # 有效时间
        assert scheduler._validate_collection_time("19:00") is True
        assert scheduler._validate_collection_time("09:30") is True
        assert scheduler._validate_collection_time("23:59") is True

        # 无效时间
        assert scheduler._validate_collection_time("25:00") is False
        assert scheduler._validate_collection_time("19:70") is False
        assert scheduler._validate_collection_time("invalid") is False

    # ==========================================================================
    # 测试4: 手动触发采集
    # ==========================================================================

    @pytest.mark.asyncio
    async def test_manual_trigger_collection(self, scheduler, mock_collector):
        """测试手动触发采集"""
        mock_collector.collect_all_stocks.return_value = [
            Mock(success=True, symbol=f"00000{i}.SZ", records_collected=1)
            for i in range(1, 6)
        ]

        result = await scheduler.manual_collect(
            trade_date=date(2026, 2, 13),
            symbols=[f"00000{i}.SZ" for i in range(1, 6)]
        )

        assert result["success"] is True
        assert result["trade_date"] == "2026-02-13"
        assert result["total_stocks"] == 5
        assert result["status"] == "completed"
        mock_collector.collect_all_stocks.assert_called_once()

    @pytest.mark.asyncio
    async def test_manual_trigger_with_progress_callback(self, scheduler, mock_collector):
        """测试手动触发带进度回调"""
        progress_updates = []

        async def progress_callback(completed, total, failed):
            progress_updates.append({"completed": completed, "total": total, "failed": failed})

        # Mock collect_all_stocks to call the progress callback
        async def mock_collect_all_stocks(symbols, trade_date, progress_callback=None):
            # Simulate progress updates
            if progress_callback:
                for i, _ in enumerate(symbols):
                    await progress_callback(i + 1, len(symbols), 0)
            return [
                Mock(success=True, symbol=f"00000{i}.SZ", records_collected=1)
                for i in range(1, len(symbols) + 1)
            ]

        mock_collector.collect_all_stocks.side_effect = mock_collect_all_stocks

        result = await scheduler.manual_collect(
            trade_date=date(2026, 2, 13),
            symbols=[f"00000{i}.SZ" for i in range(1, 4)],
            progress_callback=progress_callback
        )

        assert result["success"] is True
        assert len(progress_updates) > 0

    # ==========================================================================
    # 测试5: 任务执行流程
    # ==========================================================================

    @pytest.mark.asyncio
    async def test_execute_collection_task(self, scheduler, mock_collector, mock_db_storage):
        """测试执行任务采集"""
        mock_collector.collect_all_stocks.return_value = [
            Mock(success=True, symbol=f"00000{i}.SZ", records_collected=1, data_source="baostock")
            for i in range(1, 101)
        ]

        task = scheduler._create_collection_task(
            trade_date=date(2026, 2, 13),
            total_stocks=100
        )

        await scheduler._execute_collection_task(
            task=task,
            symbols=[f"00000{i}.SZ" for i in range(1, 101)]
        )

        assert task.status == TaskStatus.COMPLETED
        assert task.completed_stocks == 100
        assert task.failed_stocks == 0
        mock_db_storage.save_collection_task.assert_called()

    @pytest.mark.asyncio
    async def test_execute_collection_task_with_failures(self, scheduler, mock_collector, mock_db_storage):
        """测试执行任务有部分失败"""
        results = []
        for i in range(1, 101):
            mock_result = Mock()
            mock_result.symbol = f"00000{i}.SZ"
            if i <= 95:
                mock_result.success = True
                mock_result.records_collected = 1
            else:
                mock_result.success = False
                mock_result.records_collected = 0
                mock_result.error = "Failed"
            results.append(mock_result)

        mock_collector.collect_all_stocks.return_value = results

        task = scheduler._create_collection_task(
            trade_date=date(2026, 2, 13),
            total_stocks=100
        )

        await scheduler._execute_collection_task(
            task=task,
            symbols=[f"00000{i}.SZ" for i in range(1, 101)]
        )

        assert task.status == TaskStatus.COMPLETED
        assert task.completed_stocks == 95
        assert task.failed_stocks == 5

    # ==========================================================================
    # 测试6: 错误处理
    # ==========================================================================

    @pytest.mark.asyncio
    async def test_execute_collection_task_exception(self, scheduler, mock_collector, mock_db_storage):
        """测试执行任务异常"""
        mock_collector.collect_all_stocks.side_effect = Exception("Collector error")

        task = scheduler._create_collection_task(
            trade_date=date(2026, 2, 13),
            total_stocks=100
        )

        await scheduler._execute_collection_task(
            task=task,
            symbols=[f"00000{i}.SZ" for i in range(1, 101)]
        )

        assert task.status == TaskStatus.FAILED
        assert "Collector error" in task.error_message

    # ==========================================================================
    # 测试7: 状态监控
    # ==========================================================================

    def test_get_scheduler_status_idle(self, scheduler):
        """测试获取调度器状态 - 空闲"""
        status = scheduler.get_status()

        assert status["is_running"] is False
        assert status["current_task"] is None
        assert status["daily_collection_time"] == "19:00"

    def test_get_scheduler_status_running(self, scheduler):
        """测试获取调度器状态 - 运行中"""
        scheduler.is_running = True
        scheduler.current_task = scheduler._create_collection_task(
            trade_date=date(2026, 2, 13),
            total_stocks=5300
        )

        status = scheduler.get_status()

        assert status["is_running"] is True
        assert status["current_task"] is not None
        assert status["current_task"]["trade_date"] == "2026-02-13"

    @pytest.mark.asyncio
    async def test_get_collection_history(self, scheduler, mock_db_storage):
        """测试获取采集历史"""
        mock_db_storage.get_collection_history = AsyncMock(return_value=[
            {
                "id": 1,
                "trade_date": "2026-02-13",
                "status": "completed",
                "total_stocks": 5300,
                "completed_stocks": 5280,
                "failed_stocks": 20,
                "completion_rate": "99.62%"
            }
        ])

        history = await scheduler.get_collection_history(days=7)

        assert len(history) == 1
        assert history[0]["status"] == "completed"
        mock_db_storage.get_collection_history.assert_called_once_with(days=7)

    # ==========================================================================
    # 测试8: 通知机制
    # ==========================================================================

    @pytest.mark.asyncio
    async def test_failure_notification(self, scheduler):
        """测试失败通知"""
        notifications = []

        async def mock_notify(message, level="error"):
            notifications.append({"message": message, "level": level})

        # Register callback for notification
        scheduler.register_notification_callback(mock_notify)

        task = scheduler._create_collection_task(
            trade_date=date(2026, 2, 13),
            total_stocks=100
        )
        task.status = TaskStatus.FAILED
        task.error_message = "Collection failed"

        await scheduler._send_failure_notification(task)

        assert len(notifications) == 1
        assert notifications[0]["level"] == "error"
        assert "Collection failed" in notifications[0]["message"]

    @pytest.mark.asyncio
    async def test_success_notification(self, scheduler):
        """测试成功通知"""
        notifications = []

        async def mock_notify(message, level="info"):
            notifications.append({"message": message, "level": level})

        # Register callback for notification
        scheduler.register_notification_callback(mock_notify)

        task = scheduler._create_collection_task(
            trade_date=date(2026, 2, 13),
            total_stocks=100
        )
        task.status = TaskStatus.COMPLETED
        task.completed_stocks = 100
        task.failed_stocks = 0

        await scheduler._send_success_notification(task)

        assert len(notifications) == 1
        assert notifications[0]["level"] == "info"


class TestHistorySchedulerEdgeCases:
    """HistoryScheduler 边界情况测试"""

    @pytest.fixture
    def scheduler(self):
        mock_collector = AsyncMock()
        mock_db = AsyncMock()
        return HistoryScheduler(collector=mock_collector, db_storage=mock_db)

    def test_is_trading_day(self, scheduler):
        """测试交易日判断"""
        # 周一到周五是交易日
        assert scheduler._is_trading_day(date(2026, 2, 9)) is True   # 周一
        assert scheduler._is_trading_day(date(2026, 2, 13)) is True  # 周五

        # 周末不是交易日
        assert scheduler._is_trading_day(date(2026, 2, 14)) is False  # 周六
        assert scheduler._is_trading_day(date(2026, 2, 15)) is False  # 周日

    @pytest.mark.asyncio
    async def test_skip_weekend_collection(self, scheduler):
        """测试跳过周末采集"""
        # 2026-02-14 是周六
        should_collect = await scheduler._should_collect_on_date(date(2026, 2, 14))

        assert should_collect is False

    @pytest.mark.asyncio
    async def test_manual_collect_empty_symbols(self, scheduler):
        """测试手动触发空股票列表"""
        result = await scheduler.manual_collect(
            trade_date=date(2026, 2, 13),
            symbols=[]
        )

        assert result["success"] is False
        assert "No symbols" in result["error"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
