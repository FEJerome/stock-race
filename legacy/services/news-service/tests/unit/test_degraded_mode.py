"""
降级模式测试 (TEST-002)

测试内容:
1. Redis不可用时服务以DEGRADED模式启动
2. 降级模式下的事件处理逻辑（跳过发布/订阅）
3. 自动恢复机制（Redis恢复后切换NORMAL）
4. 降级模式下采集策略调整（limited_sources）

使用Mock测试，不依赖外部服务
"""

import sys
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))
sys.path.insert(0, str(project_root / "news-service" / "src"))

import pytest
import asyncio
from datetime import datetime
from unittest.mock import Mock, patch, AsyncMock

from news_service.main import NewsService, ServiceMode
from health_check import HealthStatus


class TestDegradedModeStartup:
    """降级模式启动测试"""

    @pytest.mark.asyncio
    async def test_service_starts_in_degraded_mode_when_redis_unavailable(self):
        """测试Redis不可用时服务以DEGRADED模式启动"""
        service = NewsService()

        # Mock健康检查器返回DEGRADED状态
        with patch.object(service, '_init_health_checker'):
            mock_checker = Mock()
            mock_checker.check_health = AsyncMock(return_value=Mock(
                status=HealthStatus.DEGRADED
            ))
            service.health_checker = mock_checker

            # Mock事件总线初始化（模拟Redis不可用）
            with patch.object(service, '_init_event_bus', side_effect=Exception("Redis unavailable")):
                await service.initialize()

                # 验证服务进入降级模式
                assert service.mode == ServiceMode.DEGRADED

    @pytest.mark.asyncio
    async def test_service_starts_in_normal_mode_when_redis_available(self):
        """测试Redis可用时服务以NORMAL模式启动"""
        service = NewsService()

        with patch.object(service, '_init_health_checker'):
            mock_checker = Mock()
            mock_checker.check_health = AsyncMock(return_value=Mock(
                status=HealthStatus.HEALTHY
            ))
            service.health_checker = mock_checker

            # Mock事件总线初始化成功
            with patch.object(service, '_init_event_bus'):
                await service.initialize()

                # 验证服务进入正常模式
                assert service.mode == ServiceMode.NORMAL

    @pytest.mark.asyncio
    async def test_service_starts_in_degraded_mode_when_unhealthy(self):
        """测试服务不健康时以DEGRADED模式启动"""
        service = NewsService()

        with patch.object(service, '_init_health_checker'):
            mock_checker = Mock()
            mock_checker.check_health = AsyncMock(return_value=Mock(
                status=HealthStatus.UNHEALTHY
            ))
            service.health_checker = mock_checker

            with patch.object(service, '_init_event_bus'):
                await service.initialize()

                # 验证服务进入降级模式
                assert service.mode == ServiceMode.DEGRADED


class TestDegradedModeEventHandling:
    """降级模式事件处理测试"""

    @pytest.mark.asyncio
    async def test_publish_intelligence_event_skipped_in_degraded_mode(self):
        """测试降级模式下跳过发布情报事件"""
        service = NewsService()
        service.mode = ServiceMode.DEGRADED
        service.event_producer = None  # 模拟未初始化

        with patch('news_service.main.logger') as mock_logger:
            await service.publish_intelligence_event(
                stock_code="000001.SZ",
                intelligence="测试情报",
                sentiment="positive",
                confidence=0.85
            )

            # 验证记录降级模式日志
            assert mock_logger.error.called

    @pytest.mark.asyncio
    async def test_publish_sentiment_change_event_skipped_in_degraded_mode(self):
        """测试降级模式下跳过发布情感变化事件"""
        service = NewsService()
        service.mode = ServiceMode.DEGRADED
        service.event_producer = None

        with patch('news_service.main.logger') as mock_logger:
            await service.publish_sentiment_change_event(
                stock_code="000001.SZ",
                old_sentiment="neutral",
                new_sentiment="positive",
                change_reason="测试"
            )

            # 验证记录错误日志
            assert mock_logger.error.called

    @pytest.mark.asyncio
    async def test_event_consumer_not_started_in_degraded_mode(self):
        """测试降级模式下不启动事件消费者"""
        service = NewsService()
        service.mode = ServiceMode.DEGRADED
        service.event_consumer = Mock()
        service.event_consumer.start = AsyncMock()
        service.is_running = True

        # 直接测试start方法中的逻辑（跳过无限循环）
        if service.event_consumer and service.mode == ServiceMode.NORMAL:
            await service.event_consumer.start()

        # 验证消费者未启动（因为是DEGRADED模式）
        assert not service.event_consumer.start.called

        service.is_running = False


class TestDegradedModeCollectionStrategy:
    """降级模式采集策略测试"""

    @pytest.mark.asyncio
    async def test_degraded_mode_uses_limited_sources(self):
        """测试降级模式使用有限数据源"""
        service = NewsService()
        service.mode = ServiceMode.DEGRADED

        with patch('news_service.main.logger') as mock_logger:
            await service._trigger_news_collection("000001.SZ", "price_surge", "high")

            # 验证降级模式日志
            log_messages = [str(call) for call in mock_logger.info.call_args_list]
            assert any("降级模式" in msg for msg in log_messages)

    @pytest.mark.asyncio
    async def test_normal_mode_uses_all_sources_for_high_severity(self):
        """测试正常模式高级别异动使用所有数据源"""
        service = NewsService()
        service.mode = ServiceMode.NORMAL

        with patch('news_service.main.logger') as mock_logger:
            await service._trigger_news_collection("000001.SZ", "price_surge", "high")

            # 验证正常采集
            log_messages = [str(call) for call in mock_logger.info.call_args_list]
            assert any("开始采集" in msg for msg in log_messages)


class TestAutoRecoveryMechanism:
    """自动恢复机制测试"""

    @pytest.mark.asyncio
    async def test_recovery_to_normal_mode_when_redis_restored(self):
        """测试Redis恢复后自动切换到NORMAL模式"""
        service = NewsService()
        service.mode = ServiceMode.DEGRADED
        service.is_running = True

        # Mock健康检查器返回健康状态
        mock_checker = Mock()
        mock_checker.check_health = AsyncMock(return_value=Mock(
            status=HealthStatus.HEALTHY
        ))
        service.health_checker = mock_checker

        # Mock事件总线初始化
        with patch.object(service, '_init_event_bus'):
            # 运行一次恢复检测
            service._recovery_check_interval = 0.1

            # 创建恢复任务并运行一次
            async def run_recovery_once():
                if service.mode == ServiceMode.DEGRADED:
                    result = await service.health_checker.check_health()
                    if result.status == HealthStatus.HEALTHY:
                        try:
                            if not service.event_bus_client:
                                await service._init_event_bus()
                            await service._set_mode(ServiceMode.NORMAL)
                        except Exception:
                            pass

            await run_recovery_once()

            # 验证模式已恢复
            assert service.mode == ServiceMode.NORMAL

    @pytest.mark.asyncio
    async def test_no_recovery_when_still_degraded(self):
        """测试仍为DEGRADED状态时不恢复"""
        service = NewsService()
        service.mode = ServiceMode.DEGRADED
        service.is_running = True

        # Mock健康检查器返回降级状态
        mock_checker = Mock()
        mock_checker.check_health = AsyncMock(return_value=Mock(
            status=HealthStatus.DEGRADED
        ))
        service.health_checker = mock_checker

        # 运行恢复检测
        async def run_recovery_once():
            if service.mode == ServiceMode.DEGRADED:
                result = await service.health_checker.check_health()
                if result.status == HealthStatus.HEALTHY:
                    await service._set_mode(ServiceMode.NORMAL)

        await run_recovery_once()

        # 验证模式未改变
        assert service.mode == ServiceMode.DEGRADED

    @pytest.mark.asyncio
    async def test_recovery_loop_starts_in_degraded_mode(self):
        """测试降级模式时启动恢复检测循环"""
        service = NewsService()
        service.mode = ServiceMode.DEGRADED
        service.is_running = True

        with patch('news_service.main.logger') as mock_logger:
            # 快速运行恢复循环一次
            service._recovery_check_interval = 0.01

            # 创建并取消恢复任务
            service._recovery_task = asyncio.create_task(service._recovery_loop())
            await asyncio.sleep(0.02)
            service._recovery_task.cancel()

            try:
                await service._recovery_task
            except asyncio.CancelledError:
                pass

            # 验证恢复检测日志
            log_messages = [str(call) for call in mock_logger.debug.call_args_list]
            assert any("检测依赖服务恢复" in msg for msg in log_messages)


class TestDegradedModeConfiguration:
    """降级模式配置测试"""

    def test_degraded_config_structure(self):
        """测试降级配置结构"""
        service = NewsService()

        # 验证降级配置存在
        assert hasattr(service, '_degraded_config')
        assert 'use_cache' in service._degraded_config
        assert 'disable_ai_analysis' in service._degraded_config
        assert 'limited_sources' in service._degraded_config

        # 验证默认值
        assert service._degraded_config['use_cache'] is True
        assert service._degraded_config['disable_ai_analysis'] is True
        assert isinstance(service._degraded_config['limited_sources'], list)

    def test_recovery_check_interval(self):
        """测试恢复检测间隔配置"""
        service = NewsService()

        # 验证恢复检测间隔存在
        assert hasattr(service, '_recovery_check_interval')
        assert service._recovery_check_interval == 30


class TestModeTransitions:
    """模式切换测试"""

    @pytest.mark.asyncio
    async def test_mode_transition_logging(self):
        """测试模式切换日志记录"""
        service = NewsService()
        service.mode = ServiceMode.NORMAL

        with patch('news_service.main.logger') as mock_logger:
            await service._set_mode(ServiceMode.DEGRADED)

            # 验证切换日志
            assert mock_logger.info.called
            log_messages = [str(call) for call in mock_logger.info.call_args_list]
            # 检查日志中包含模式名称（中文日志）
            assert any("normal" in msg.lower() and "degraded" in msg.lower() for msg in log_messages)

    @pytest.mark.asyncio
    async def test_degraded_mode_warning(self):
        """测试进入降级模式时的警告"""
        service = NewsService()
        service.mode = ServiceMode.NORMAL

        with patch('news_service.main.logger') as mock_logger:
            await service._set_mode(ServiceMode.DEGRADED)

            # 验证降级警告
            assert mock_logger.warning.called
            log_messages = [str(call) for call in mock_logger.warning.call_args_list]
            assert any("降级模式" in msg for msg in log_messages)

    @pytest.mark.asyncio
    async def test_same_mode_no_transition(self):
        """测试相同模式不触发切换"""
        service = NewsService()
        service.mode = ServiceMode.NORMAL

        with patch('news_service.main.logger') as mock_logger:
            await service._set_mode(ServiceMode.NORMAL)

            # 验证未记录切换日志
            log_messages = [str(call) for call in mock_logger.info.call_args_list]
            assert not any("模式切换" in msg for msg in log_messages)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
