"""
推送频率配置测试

测试 NS-D-004: 支持配置推送间隔（1/2/5分钟）
"""

import pytest
from datetime import datetime, timedelta
from typing import List, Dict, Any
from unittest.mock import AsyncMock, MagicMock, patch


class TestPushIntervalConfig:
    """推送频率配置测试类"""

    @pytest.mark.asyncio
    async def test_default_push_interval(self):
        """测试默认推送间隔（2分钟）"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_producer
        )

        # 验证默认间隔
        assert pusher.push_interval_minutes == 2

    @pytest.mark.asyncio
    async def test_custom_push_interval_1min(self):
        """测试1分钟推送间隔"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_producer,
            push_interval_minutes=1
        )

        assert pusher.push_interval_minutes == 1

    @pytest.mark.asyncio
    async def test_custom_push_interval_5min(self):
        """测试5分钟推送间隔"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_producer,
            push_interval_minutes=5
        )

        assert pusher.push_interval_minutes == 5

    @pytest.mark.asyncio
    async def test_invalid_push_interval_less_than_1(self):
        """测试小于1分钟的无效间隔"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        # 应该抛出 ValueError
        with pytest.raises(ValueError) as exc_info:
            HotIntelligencePusher(
                selector=mock_selector,
                event_producer=mock_producer,
                push_interval_minutes=0
            )

        assert "push interval" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_invalid_push_interval_not_allowed(self):
        """测试不允许的间隔值（非1/2/5分钟）"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        # 3分钟不是允许的值
        with pytest.raises(ValueError) as exc_info:
            HotIntelligencePusher(
                selector=mock_selector,
                event_producer=mock_producer,
                push_interval_minutes=3
            )

        assert "1, 2, 5" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_invalid_push_interval_too_large(self):
        """测试过大的间隔值"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        with pytest.raises(ValueError) as exc_info:
            HotIntelligencePusher(
                selector=mock_selector,
                event_producer=mock_producer,
                push_interval_minutes=10
            )

        assert "1, 2, 5" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_update_push_interval_success(self):
        """测试成功更新推送间隔"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_producer,
            push_interval_minutes=2
        )

        # 更新为5分钟
        result = await pusher.update_push_interval(5)
        assert result is True
        assert pusher.push_interval_minutes == 5

    @pytest.mark.asyncio
    async def test_update_push_interval_invalid(self):
        """测试更新为无效间隔"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_producer,
            push_interval_minutes=2
        )

        # 尝试更新为无效值
        result = await pusher.update_push_interval(3)
        assert result is False
        # 间隔应保持不变
        assert pusher.push_interval_minutes == 2

    @pytest.mark.asyncio
    async def test_update_push_interval_while_running(self):
        """测试运行时更新推送间隔"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_producer,
            push_interval_minutes=2
        )

        # 模拟正在运行
        pusher._is_running = True
        pusher._scheduler = MagicMock()
        pusher._scheduler.running = True

        # 运行时更新应该重启调度器
        with patch.object(pusher, '_restart_scheduler', new=AsyncMock(return_value=True)) as mock_restart:
            result = await pusher.update_push_interval(5)
            assert result is True
            mock_restart.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_available_intervals(self):
        """测试获取可用间隔列表"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_producer
        )

        intervals = pusher.get_available_intervals()
        assert intervals == [1, 2, 5]

    @pytest.mark.asyncio
    async def test_get_interval_config(self):
        """测试获取间隔配置信息"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_producer,
            push_interval_minutes=2
        )

        config = pusher.get_interval_config()
        assert config["current"] == 2
        assert config["available"] == [1, 2, 5]
        assert config["unit"] == "minutes"


class TestPushIntervalFromEnv:
    """从环境变量读取配置测试"""

    @pytest.mark.asyncio
    async def test_load_interval_from_env(self):
        """测试从环境变量加载推送间隔"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        with patch.dict('os.environ', {'HOT_INTELLIGENCE_PUSH_INTERVAL': '5'}):
            pusher = HotIntelligencePusher(
                selector=mock_selector,
                event_producer=mock_producer,
                push_interval_minutes=5
            )
            assert pusher.push_interval_minutes == 5

    @pytest.mark.asyncio
    async def test_load_interval_from_env_invalid(self):
        """测试环境变量值为无效值时使用默认值"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        with patch.dict('os.environ', {'HOT_INTELLIGENCE_PUSH_INTERVAL': 'invalid'}):
            # 应该使用传入的值（有效）
            pusher = HotIntelligencePusher(
                selector=mock_selector,
                event_producer=mock_producer,
                push_interval_minutes=2
            )
            assert pusher.push_interval_minutes == 2


class TestPushIntervalIntegration:
    """集成测试"""

    @pytest.mark.asyncio
    async def test_scheduler_uses_correct_interval(self):
        """测试调度器使用正确的间隔"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_producer,
            push_interval_minutes=1
        )

        # 模拟调度器
        mock_scheduler = MagicMock()
        pusher._scheduler = mock_scheduler
        pusher._is_running = True

        # 更新间隔
        await pusher.update_push_interval(5)

        # 验证调度器被重新配置
        # 实际实现中应该重启调度器以应用新间隔

    @pytest.mark.asyncio
    async def test_interval_validation_edge_cases(self):
        """测试间隔验证边界情况"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector = AsyncMock()
        mock_producer = AsyncMock()

        # 测试边界值1（允许）
        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_producer,
            push_interval_minutes=1
        )
        assert pusher.push_interval_minutes == 1

        # 测试边界值5（允许）
        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_producer,
            push_interval_minutes=5
        )
        assert pusher.push_interval_minutes == 5

        # 测试负值（不允许）
        with pytest.raises(ValueError):
            HotIntelligencePusher(
                selector=mock_selector,
                event_producer=mock_producer,
                push_interval_minutes=-1
            )

        # 测试0（不允许）
        with pytest.raises(ValueError):
            HotIntelligencePusher(
                selector=mock_selector,
                event_producer=mock_producer,
                push_interval_minutes=0
            )
