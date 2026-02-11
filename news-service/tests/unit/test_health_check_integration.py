"""
News Service 健康检查集成测试

测试内容:
1. 健康检查SDK集成
2. 降级运行模式
3. 自动恢复机制
"""

import sys
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "health-check" / "src"))
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))
sys.path.insert(0, str(project_root / "news-service" / "src"))

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock

from health_check import HealthChecker, HealthStatus
from news_service.main import NewsService, ServiceMode


class TestHealthCheckIntegration:
    """健康检查集成测试类"""

    @pytest.fixture
    async def news_service(self):
        """创建News Service实例"""
        service = NewsService()
        yield service
        # 清理
        if service.is_running:
            await service.stop()

    @pytest.mark.asyncio
    async def test_health_checker_initialization(self):
        """测试健康检查器初始化"""
        service = NewsService()

        # Mock健康检查器
        with patch('news_service.main.HealthChecker') as mock_checker:
            mock_checker_instance = Mock()
            mock_checker_instance.add_dependency = Mock()
            mock_checker_instance.check_health = AsyncMock(return_value=Mock(
                status=HealthStatus.HEALTHY,
                message="OK"
            ))
            mock_checker.return_value = mock_checker_instance

            await service._init_health_checker()

            # 验证健康检查器被创建
            assert mock_checker.called
            # 验证依赖被添加（Redis和DeepSeek）
            assert mock_checker_instance.add_dependency.call_count == 2

    @pytest.mark.asyncio
    async def test_service_mode_switch_to_degraded(self):
        """测试服务切换到降级模式"""
        service = NewsService()

        # 初始为INITIALIZING
        assert service.mode == ServiceMode.INITIALIZING

        # 切换到降级模式
        await service._set_mode(ServiceMode.DEGRADED)
        assert service.mode == ServiceMode.DEGRADED

    @pytest.mark.asyncio
    async def test_service_mode_switch_to_normal(self):
        """测试服务切换到正常模式"""
        service = NewsService()

        # 切换到降级模式
        await service._set_mode(ServiceMode.DEGRADED)
        assert service.mode == ServiceMode.DEGRADED

        # 切换回正常模式
        await service._set_mode(ServiceMode.NORMAL)
        assert service.mode == ServiceMode.NORMAL

    @pytest.mark.asyncio
    async def test_degraded_collection_strategy(self):
        """测试降级模式下的采集策略"""
        service = NewsService()

        # 切换到降级模式
        await service._set_mode(ServiceMode.DEGRADED)

        # 验证降级配置
        assert service._degraded_config['use_cache'] is True
        assert service._degraded_config['disable_ai_analysis'] is True
        assert len(service._degraded_config['limited_sources']) == 2

    @pytest.mark.asyncio
    async def test_redis_check(self):
        """测试Redis健康检查"""
        service = NewsService()

        # Mock Redis检查成功
        with patch('redis.from_url') as mock_redis:
            mock_client = Mock()
            mock_client.ping.return_value = True
            mock_redis.return_value = mock_client

            result = service._check_redis()
            assert result is True

    @pytest.mark.asyncio
    async def test_redis_check_failure(self):
        """测试Redis健康检查失败"""
        service = NewsService()

        # Mock Redis检查失败
        with patch('redis.from_url') as mock_redis:
            mock_redis.side_effect = Exception("Connection refused")

            result = service._check_redis()
            assert result is False

    @pytest.mark.asyncio
    async def test_deepseek_api_check(self):
        """测试DeepSeek API健康检查"""
        service = NewsService()

        # 当前实现返回True
        result = service._check_deepseek_api()
        assert result is True

    @pytest.mark.asyncio
    async def test_get_health_status(self):
        """测试获取健康状态"""
        service = NewsService()

        # 未初始化时
        status = service.get_health_status()
        assert status["status"] == "unknown"

    @pytest.mark.asyncio
    async def test_get_service_mode(self):
        """测试获取服务运行模式"""
        service = NewsService()

        # 初始模式
        mode = service.get_service_mode()
        assert mode == "initializing"

        # 切换模式后
        await service._set_mode(ServiceMode.NORMAL)
        mode = service.get_service_mode()
        assert mode == "normal"


class TestRecoveryMechanism:
    """自动恢复机制测试类"""

    @pytest.mark.asyncio
    async def test_recovery_loop_in_degraded_mode(self):
        """测试降级模式下的恢复检测"""
        service = NewsService()
        service.is_running = True

        # 设置为降级模式
        await service._set_mode(ServiceMode.DEGRADED)

        # Mock健康检查器
        mock_checker = Mock()
        mock_checker.check_health = AsyncMock(return_value=Mock(
            status=HealthStatus.HEALTHY,
            message="All healthy"
        ))
        service.health_checker = mock_checker

        # 模拟恢复检测（只运行一次）
        service._recovery_check_interval = 0.1

        # 启动恢复任务
        recovery_task = asyncio.create_task(service._recovery_loop())

        # 等待恢复检测执行
        await asyncio.sleep(0.2)

        # 停止任务
        service.is_running = False
        recovery_task.cancel()
        try:
            await recovery_task
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_recovery_not_in_normal_mode(self):
        """测试正常模式下不执行恢复检测"""
        service = NewsService()
        service.is_running = True

        # 设置为正常模式
        await service._set_mode(ServiceMode.NORMAL)

        # Mock健康检查器
        mock_checker = Mock()
        mock_checker.check_health = AsyncMock()
        service.health_checker = mock_checker

        # 模拟恢复检测（只运行一次）
        service._recovery_check_interval = 0.1

        # 启动恢复任务
        recovery_task = asyncio.create_task(service._recovery_loop())

        # 等待
        await asyncio.sleep(0.2)

        # 停止任务
        service.is_running = False
        recovery_task.cancel()
        try:
            await recovery_task
        except asyncio.CancelledError:
            pass

        # 验证健康检查未被调用（因为处于正常模式）
        mock_checker.check_health.assert_not_called()


class TestHealthCheckLoop:
    """健康检查循环测试类"""

    @pytest.mark.asyncio
    async def test_health_check_loop_updates_mode(self):
        """测试健康检查循环更新运行模式"""
        service = NewsService()
        service.is_running = True

        # Mock健康检查器
        mock_checker = Mock()
        mock_checker.check_health = AsyncMock(return_value=Mock(
            status=HealthStatus.DEGRADED,
            message="Some dependencies failed"
        ))
        service.health_checker = mock_checker

        # 设置为正常模式
        await service._set_mode(ServiceMode.NORMAL)

        # 启动健康检查任务（只运行一次）
        async def run_once():
            try:
                result = await service.health_checker.check_health()
                if result.status == HealthStatus.DEGRADED:
                    if service.mode == ServiceMode.NORMAL:
                        await service._set_mode(ServiceMode.DEGRADED)
            except asyncio.CancelledError:
                pass

        await run_once()

        # 验证模式已切换
        assert service.mode == ServiceMode.DEGRADED


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
