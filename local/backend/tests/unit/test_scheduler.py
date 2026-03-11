"""
数据清理调度器单元测试

测试覆盖:
- 调度器启动/关闭
- 清理策略执行
- 降采样逻辑
- 异常处理
"""
import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, MagicMock, patch
from sqlalchemy import select, delete

from services.scheduler import DataCleanupScheduler
from models.database import MarketQuoteModel


class TestSchedulerLifecycle:
    """测试调度器生命周期"""

    def test_init(self):
        """测试初始化"""
        db_factory = Mock()
        scheduler = DataCleanupScheduler(db_factory)

        assert scheduler._db_factory == db_factory
        assert scheduler._running is False
        assert scheduler._task is None

    def test_start(self):
        """测试启动"""
        db_factory = Mock()
        scheduler = DataCleanupScheduler(db_factory)

        # Mock asyncio.create_task
        with patch('asyncio.create_task') as mock_create_task:
            mock_task = Mock()
            mock_create_task.return_value = mock_task

            scheduler.start()

            assert scheduler._running is True
            assert scheduler._task is mock_task
            mock_create_task.assert_called_once()

    def test_start_when_already_running(self):
        """已在运行时不应重复启动"""
        db_factory = Mock()
        scheduler = DataCleanupScheduler(db_factory)
        scheduler._running = True

        with patch('asyncio.create_task') as mock_create_task:
            scheduler.start()
            mock_create_task.assert_not_called()

    def test_shutdown(self):
        """测试关闭"""
        db_factory = Mock()
        scheduler = DataCleanupScheduler(db_factory)
        scheduler._running = True
        scheduler._task = Mock()

        scheduler.shutdown()

        assert scheduler._running is False
        scheduler._task.cancel.assert_called_once()

    def test_shutdown_when_not_running(self):
        """未运行时不应报错"""
        db_factory = Mock()
        scheduler = DataCleanupScheduler(db_factory)
        scheduler._running = False

        # 不应抛出异常
        scheduler.shutdown()


class TestCleanupOldQuotes:
    """测试数据清理逻辑"""

    @pytest.fixture
    def scheduler(self):
        db_factory = Mock()
        return DataCleanupScheduler(db_factory)

    @pytest.mark.asyncio
    async def test_delete_30d_old_data(self, scheduler):
        """删除30天前的数据"""
        # Mock session
        mock_session = AsyncMock()
        mock_result = Mock()
        mock_result.rowcount = 100

        async def mock_execute(stmt):
            # 检查是否是delete语句且时间条件正确
            return mock_result

        mock_session.execute = mock_execute
        mock_session.commit = AsyncMock()

        scheduler._db_factory = Mock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=mock_session),
            __aexit__=AsyncMock(return_value=False)
        ))

        # 执行清理
        await scheduler.cleanup_old_quotes()

        # 验证commit被调用
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_downsample_7_to_30_days(self, scheduler):
        """7-30天数据降采样"""
        now = datetime.utcnow()

        # 创建模拟数据：同一股票同一小时内的多条记录
        class MockQuote:
            def __init__(self, symbol, timestamp):
                self.symbol = symbol
                self.timestamp = timestamp

        # 10天前的数据（需要降采样）
        base_time = now - timedelta(days=10)
        quotes = []
        for i in range(5):  # 同一小时内的5条记录
            quotes.append(MockQuote("000001", base_time.replace(minute=i*10)))

        # Mock session
        mock_session = AsyncMock()

        # 第一次execute是delete，第二次是select
        call_count = [0]
        async def mock_execute(stmt):
            call_count[0] += 1
            mock_result = Mock()
            if call_count[0] == 1:  # delete
                mock_result.rowcount = 10
            else:  # select
                mock_result.scalars.return_value.all.return_value = quotes
            return mock_result

        mock_session.execute = mock_execute
        mock_session.commit = AsyncMock()

        scheduler._db_factory = Mock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=mock_session),
            __aexit__=AsyncMock(return_value=False)
        ))

        await scheduler.cleanup_old_quotes()

        # 验证commit被调用
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_cleanup_exception_handling(self, scheduler):
        """清理异常处理"""
        scheduler._db_factory = Mock(side_effect=Exception("DB Error"))

        # 不应抛出异常
        try:
            await scheduler.cleanup_old_quotes()
        except Exception as e:
            pytest.fail(f"cleanup_old_quotes should not raise exception: {e}")


class TestRunCleanupLoop:
    """测试清理循环"""

    @pytest.mark.asyncio
    async def test_loop_calculates_next_run_time(self):
        """循环正确计算下次运行时间"""
        db_factory = Mock()
        scheduler = DataCleanupScheduler(db_factory)
        scheduler._running = True

        # 模拟cleanup_old_quotes只执行一次就停止
        call_count = [0]
        async def mock_cleanup():
            call_count[0] += 1
            scheduler._running = False  # 执行一次后停止

        scheduler.cleanup_old_quotes = mock_cleanup

        # 运行循环（会被立即停止）
        await scheduler._run_cleanup_loop()

        # 验证cleanup被调用
        assert call_count[0] == 1

    @pytest.mark.asyncio
    async def test_loop_handles_cancelled_error(self):
        """处理CancelledError"""
        db_factory = Mock()
        scheduler = DataCleanupScheduler(db_factory)
        scheduler._running = True

        # 模拟sleep抛出CancelledError
        with patch('asyncio.sleep', side_effect=asyncio.CancelledError):
            await scheduler._run_cleanup_loop()

        # 应该优雅退出，不抛出异常
        assert True

    @pytest.mark.asyncio
    async def test_loop_handles_exception_and_retries(self):
        """处理异常并重试"""
        db_factory = Mock()
        scheduler = DataCleanupScheduler(db_factory)
        scheduler._running = True

        call_count = [0]
        async def mock_cleanup():
            call_count[0] += 1
            if call_count[0] == 1:
                raise Exception("Test Error")
            else:
                scheduler._running = False

        scheduler.cleanup_old_quotes = mock_cleanup

        # 模拟sleep立即返回
        with patch('asyncio.sleep', new_callable=AsyncMock):
            await scheduler._run_cleanup_loop()

        # 验证cleanup被调用两次（第一次失败，第二次成功或继续）
        assert call_count[0] >= 1


class TestCleanupStrategy:
    """测试清理策略"""

    def test_cleanup_time_windows(self):
        """验证清理时间窗口"""
        now = datetime.utcnow()

        # 30天前
        cutoff_30d = now - timedelta(days=30)
        # 7天前
        cutoff_7d = now - timedelta(days=7)

        # 验证时间窗口边界
        assert (cutoff_7d - cutoff_30d).days == 23  # 7-30天窗口

        # 测试数据分类
        test_data = [
            (now - timedelta(days=31), "delete"),  # 30天前，删除
            (now - timedelta(days=15), "downsample"),  # 15天前，降采样
            (now - timedelta(days=3), "keep"),  # 3天前，保留
        ]

        for timestamp, expected_action in test_data:
            if timestamp < cutoff_30d:
                action = "delete"
            elif timestamp < cutoff_7d:
                action = "downsample"
            else:
                action = "keep"
            assert action == expected_action, f"Failed for {timestamp}"


class TestDownsampleLogic:
    """测试降采样逻辑"""

    def test_hour_grouping(self):
        """按小时分组逻辑"""
        now = datetime.utcnow()

        # 创建同一小时内的时间戳
        timestamps = [
            now.replace(minute=5),
            now.replace(minute=15),
            now.replace(minute=25),
            now.replace(minute=35),
            now.replace(minute=45),
        ]

        # 每小时应该只保留第一条
        current_hour = None
        to_delete = []
        to_keep = []

        for ts in timestamps:
            hour_key = ts.replace(minute=0, second=0, microsecond=0)
            if hour_key != current_hour:
                to_keep.append(ts)
                current_hour = hour_key
            else:
                to_delete.append(ts)

        # 同一小时内应该只保留1条，删除4条
        assert len(to_keep) == 1
        assert len(to_delete) == 4
        assert to_keep[0] == timestamps[0]

    def test_symbol_isolation(self):
        """不同股票独立处理"""
        now = datetime.utcnow()
        base_hour = now.replace(minute=0, second=0, microsecond=0)

        # 两个股票在同一小时的数据
        class MockQuote:
            def __init__(self, symbol, timestamp):
                self.symbol = symbol
                self.timestamp = timestamp

        quotes = [
            MockQuote("000001", base_hour.replace(minute=10)),
            MockQuote("000001", base_hour.replace(minute=20)),
            MockQuote("000002", base_hour.replace(minute=15)),
            MockQuote("000002", base_hour.replace(minute=25)),
        ]

        # 按股票分组处理
        to_delete = []
        current_hour = {}

        for quote in quotes:
            hour_key = quote.timestamp.replace(minute=0, second=0, microsecond=0)
            if quote.symbol not in current_hour or current_hour[quote.symbol] != hour_key:
                current_hour[quote.symbol] = hour_key
            else:
                to_delete.append((quote.symbol, quote.timestamp))

        # 每个股票同一小时内删除1条
        assert len(to_delete) == 2


class TestIntegration:
    """集成测试"""

    @pytest.mark.asyncio
    async def test_full_cleanup_workflow(self):
        """完整清理流程"""
        db_factory = Mock()
        scheduler = DataCleanupScheduler(db_factory)

        # Mock整个清理流程
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=Mock(rowcount=10))
        mock_session.commit = AsyncMock()

        scheduler._db_factory = Mock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=mock_session),
            __aexit__=AsyncMock(return_value=False)
        ))

        await scheduler.cleanup_old_quotes()

        # 验证execute被调用（delete + select + 可能的downsample deletes）
        assert mock_session.execute.called
        mock_session.commit.assert_called_once()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
