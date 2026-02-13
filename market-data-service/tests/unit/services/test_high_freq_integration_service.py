"""
T-019: HighFreqIntegrationService 单元测试

测试 HighFreqIntegrationService 的完整功能
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timedelta

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from data_service.services.high_freq_integration import (
    HighFreqIntegrationService,
    IntegrationConfig,
    AdjustmentResult
)
from data_service.services.dynamic_high_freq_scheduler import HealthStatus


class TestHighFreqIntegrationService:
    """高频层集成服务测试类"""

    @pytest.fixture
    def config(self):
        """创建测试配置"""
        return IntegrationConfig(
            backend_url="http://localhost:3001",
            api_endpoint="/api/v1/public/hot-stocks",
            cache_ttl=60,
            request_timeout=5,
            max_retries=2,
            retry_delay=0.1
        )

    @pytest.fixture
    def service(self, config):
        """创建集成服务实例"""
        return HighFreqIntegrationService(config=config)

    @pytest.fixture
    def sample_backend_response(self):
        """样本 Backend 响应"""
        return {
            "success": True,
            "data": {
                "stocks": [
                    {"symbol": "000001.SZ", "weight": 85.5},
                    {"symbol": "600519.SH", "weight": 72.3},
                    {"symbol": "000858.SZ", "weight": 68.0},
                ],
                "totalCount": 3,
                "updatedAt": datetime.now().isoformat(),
                "nextUpdateIn": 60
            }
        }

    # ==========================================================================
    # 服务初始化测试
    # ==========================================================================

    def test_service_initialization(self, service):
        """测试服务初始化"""
        assert service.scheduler is not None
        assert service.selector is not None
        assert service.config is not None
        assert service._running is False

    def test_service_custom_config(self):
        """测试自定义配置"""
        custom_config = IntegrationConfig(
            backend_url="http://test:3000",
            cache_ttl=120
        )
        service = HighFreqIntegrationService(config=custom_config)

        assert service.config.backend_url == "http://test:3000"
        assert service.config.cache_ttl == 120

    # ==========================================================================
    # 缓存管理测试
    # ==========================================================================

    def test_cache_update_and_validation(self, service):
        """测试缓存更新和验证"""
        stocks = [{"symbol": "000001.SZ", "weight": 80.0}]

        # 初始缓存无效
        assert service._is_cache_valid() is False

        # 更新缓存
        service._update_cache(stocks)

        # 缓存有效
        assert service._is_cache_valid() is True
        assert service._cached_stocks == stocks

    def test_cache_expiration(self, service):
        """测试缓存过期"""
        service.config.cache_ttl = 0  # 立即过期
        stocks = [{"symbol": "000001.SZ", "weight": 80.0}]

        service._update_cache(stocks)

        # 缓存应该过期
        assert service._is_cache_valid() is False

    # ==========================================================================
    # 降级策略测试
    # ==========================================================================

    def test_fallback_stocks_generation(self, service):
        """测试默认股票列表生成"""
        fallback = service._get_fallback_stocks(5)

        assert len(fallback) == 5
        assert all("symbol" in s for s in fallback)
        assert all("weight" in s for s in fallback)
        assert all(s["weight"] == 50.0 for s in fallback)

    def test_fallback_stocks_limit(self, service):
        """测试默认股票列表限制"""
        fallback = service._get_fallback_stocks(100)

        # 默认列表只有20只股票
        assert len(fallback) == 20

    @pytest.mark.asyncio
    async def test_backend_failure_uses_cache(self, service, sample_backend_response):
        """测试 Backend 失败时使用缓存"""
        # 先填充缓存
        service._update_cache(sample_backend_response["data"]["stocks"])

        # 模拟 Backend 失败
        with patch.object(service, '_fetch_hot_stocks_from_backend', side_effect=ConnectionError()):
            stocks, source = await service._get_hot_stocks_with_fallback(3)

            assert len(stocks) == 3
            assert source == "cache"

    @pytest.mark.asyncio
    async def test_backend_and_cache_failure_uses_fallback(self, service):
        """测试 Backend 和缓存都失败时使用默认列表"""
        # 确保缓存无效
        service._cache_valid = False

        with patch.object(service, '_fetch_hot_stocks_from_backend', side_effect=ConnectionError()):
            stocks, source = await service._get_hot_stocks_with_fallback(5)

            assert len(stocks) == 5
            assert source == "fallback"

    # ==========================================================================
    # 调整逻辑测试
    # ==========================================================================

    @pytest.mark.asyncio
    async def test_adjust_high_freq_layer_excellent(self, service, sample_backend_response):
        """测试调整到 Excellent 状态"""
        # 先设置一个不同的初始状态
        service.scheduler.force_adjustment(2)

        with patch.object(service, '_fetch_hot_stocks_from_backend', return_value=sample_backend_response):
            result = await service.adjust_high_freq_layer(source_count=4, force=True)

            assert result.success is True
            assert result.new_config.status == HealthStatus.EXCELLENT
            assert result.new_config.stock_count == 200
            assert result.source == "backend"

    @pytest.mark.asyncio
    async def test_adjust_high_freq_layer_critical(self, service):
        """测试调整到 Critical 状态"""
        # 先设置一个不同的初始状态，然后强制调整到 0
        service.scheduler.force_adjustment(4)
        result = await service.adjust_high_freq_layer(source_count=0, force=True)

        assert result.success is True
        assert result.new_config.status == HealthStatus.CRITICAL
        assert result.new_config.stock_count == 0
        assert len(result.selected_stocks) == 0

    @pytest.mark.asyncio
    async def test_adjust_high_freq_layer_no_change(self, service):
        """测试无需调整的情况"""
        # 先调整一次
        await service.adjust_high_freq_layer(source_count=4, force=True)

        # 再次调整（相同状态）
        result = await service.adjust_high_freq_layer(source_count=4, force=False)

        assert result.source == "unchanged"

    @pytest.mark.asyncio
    async def test_manual_adjustment(self, service, sample_backend_response):
        """测试手动调整"""
        with patch.object(service, '_fetch_hot_stocks_from_backend', return_value=sample_backend_response):
            result = await service.manual_adjust(source_count=2)

            assert result.success is True
            assert result.new_config.status == HealthStatus.NORMAL
            assert result.new_config.stock_count == 100

    # ==========================================================================
    # 状态监控测试
    # ==========================================================================

    def test_status_callback_registration(self, service):
        """测试状态回调注册"""
        callback_called = False

        def test_callback(old_config, new_config, stocks):
            nonlocal callback_called
            callback_called = True

        service.register_status_change_callback(test_callback)

        assert len(service._status_change_callbacks) == 1

    def test_status_callback_notification(self, service):
        """测试状态回调通知"""
        received_data = {}

        def test_callback(old_config, new_config, stocks):
            received_data['old'] = old_config
            received_data['new'] = new_config
            received_data['stocks'] = stocks

        service.register_status_change_callback(test_callback)

        # 手动触发通知
        from data_service.services.dynamic_high_freq_scheduler import DynamicConfig
        old = DynamicConfig(stock_count=200, interval=10, status=HealthStatus.EXCELLENT, healthy_sources=4)
        new = DynamicConfig(stock_count=100, interval=10, status=HealthStatus.NORMAL, healthy_sources=2)

        service._notify_status_change(old, new, ["000001.SZ"])

        assert received_data['old'] == old
        assert received_data['new'] == new
        assert received_data['stocks'] == ["000001.SZ"]

    # ==========================================================================
    # 状态查询测试
    # ==========================================================================

    def test_get_current_status(self, service):
        """测试获取当前状态"""
        status = service.get_current_status()

        assert "scheduler" in status
        assert "last_selection" in status
        assert "cache_valid" in status

    @pytest.mark.asyncio
    async def test_get_current_status_after_adjustment(self, service, sample_backend_response):
        """测试调整后获取状态"""
        # 先设置一个不同的初始状态
        service.scheduler.force_adjustment(2)

        with patch.object(service, '_fetch_hot_stocks_from_backend', return_value=sample_backend_response):
            await service.adjust_high_freq_layer(source_count=4, force=True)

            status = service.get_current_status()

            assert status["last_adjustment"] is not None
            assert status["last_adjustment"]["success"] is True

    # ==========================================================================
    # 监控循环测试
    # ==========================================================================

    @pytest.mark.asyncio
    async def test_monitoring_start_stop(self, service):
        """测试监控启动和停止"""
        # 启动监控（非阻塞）
        monitor_task = asyncio.create_task(service.start_monitoring(check_interval=0.1))

        # 等待一小段时间
        await asyncio.sleep(0.2)

        # 停止监控
        service.stop_monitoring()

        # 等待任务完成
        try:
            await asyncio.wait_for(monitor_task, timeout=0.5)
        except asyncio.TimeoutError:
            monitor_task.cancel()

        assert service._running is False

    # ==========================================================================
    # 边界情况测试
    # ==========================================================================

    @pytest.mark.asyncio
    async def test_empty_backend_response(self, service):
        """测试 Backend 返回空列表"""
        empty_response = {"success": True, "data": {"stocks": [], "totalCount": 0}}

        with patch.object(service, '_fetch_hot_stocks_from_backend', return_value=empty_response):
            with patch.object(service, '_is_cache_valid', return_value=False):
                stocks, source = await service._get_hot_stocks_with_fallback(5)

                # 空响应时应该使用 fallback
                assert source == "fallback"

    @pytest.mark.asyncio
    async def test_backend_cache_not_ready(self, service):
        """测试 Backend 缓存未就绪"""
        not_ready_response = {"success": False, "error": {"code": "CACHE_NOT_READY"}}

        with patch.object(service, '_fetch_hot_stocks_from_backend', return_value=not_ready_response):
            with patch.object(service, '_is_cache_valid', return_value=False):
                stocks, source = await service._get_hot_stocks_with_fallback(5)

                assert source == "fallback"

    @pytest.mark.asyncio
    async def test_retry_mechanism(self, service, sample_backend_response):
        """测试重试机制"""
        call_count = 0

        async def mock_fetch(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise ConnectionError("Network error")
            return sample_backend_response

        with patch.object(service, '_fetch_hot_stocks_from_backend', side_effect=mock_fetch):
            stocks, source = await service._get_hot_stocks_with_fallback(3)

            assert call_count == 2  # 第一次失败，第二次成功
            assert source == "backend"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
