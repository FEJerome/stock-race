"""
热情报批量推送测试

测试 NS-D-002: 每2分钟发布`news:hot_intelligence_update`事件
"""

import pytest
from datetime import datetime, timedelta
from typing import List, Dict, Any
from unittest.mock import AsyncMock, MagicMock, patch, call
import asyncio


class AsyncContextManagerMock:
    """异步上下文管理器 Mock"""
    def __init__(self, return_value):
        self.return_value = return_value

    async def __aenter__(self):
        return self.return_value

    async def __aexit__(self, *args):
        return False


@pytest.fixture
def sample_hot_intelligence() -> Dict[str, Any]:
    """示例热情报数据"""
    return {
        "intelligence": [
            {
                "stock_code": "000001.SZ",
                "stock_name": "平安银行",
                "summary": "平安银行发布年度业绩预告",
                "sentiment_type": "positive",
                "sentiment_confidence": 0.85,
                "importance": 8,
                "is_breaking": True,
                "created_at": datetime.now().isoformat(),
            },
            {
                "stock_code": "000002.SZ",
                "stock_name": "万科A",
                "summary": "房地产行业政策收紧",
                "sentiment_type": "negative",
                "sentiment_confidence": 0.78,
                "importance": 7,
                "is_breaking": False,
                "created_at": datetime.now().isoformat(),
            },
        ],
        "coverage": ["000001.SZ", "000002.SZ"],
        "timestamp": datetime.now().isoformat(),
    }


@pytest.fixture
def mock_event_producer():
    """模拟事件生产者"""
    producer = AsyncMock()
    producer.publish_event = AsyncMock(return_value=True)
    return producer


@pytest.fixture
def mock_selector():
    """模拟热情报筛选器"""
    selector = AsyncMock()
    return selector


class TestHotIntelligencePusher:
    """热情报推送器测试类"""

    @pytest.mark.asyncio
    async def test_pusher_initialization(self, mock_event_producer, mock_selector):
        """测试推送器初始化"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_event_producer,
            push_interval_minutes=2
        )

        assert pusher.selector == mock_selector
        assert pusher.event_producer == mock_event_producer
        assert pusher.push_interval_minutes == 2
        assert pusher.is_running is False

    @pytest.mark.asyncio
    async def test_pusher_default_config(self, mock_event_producer, mock_selector):
        """测试默认配置"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_event_producer
        )

        assert pusher.push_interval_minutes == 2  # 默认2分钟

    @pytest.mark.asyncio
    async def test_push_hot_intelligence_success(
        self, mock_event_producer, mock_selector, sample_hot_intelligence
    ):
        """测试成功推送热情报"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        # 设置模拟返回值
        mock_selector.select_and_format_for_push = AsyncMock(return_value=sample_hot_intelligence)

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_event_producer
        )

        result = await pusher.push_hot_intelligence()

        # 验证结果
        assert result is True

        # 验证筛选器被调用
        mock_selector.select_and_format_for_push.assert_called_once()

        # 验证事件被发布
        mock_event_producer.publish_event.assert_called_once()

        # 验证事件类型和payload
        call_args = mock_event_producer.publish_event.call_args
        event_type = call_args[0][0]
        payload = call_args[0][1]

        assert "news:hot_intelligence_update" in str(event_type)
        assert "intelligence" in payload
        assert "coverage" in payload
        assert "timestamp" in payload

    @pytest.mark.asyncio
    async def test_push_hot_intelligence_empty(self, mock_event_producer, mock_selector):
        """测试空热情报处理"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        # 设置空返回
        mock_selector.select_and_format_for_push = AsyncMock(
            return_value={"intelligence": [], "coverage": [], "timestamp": datetime.now().isoformat()}
        )

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_event_producer
        )

        result = await pusher.push_hot_intelligence()

        # 验证结果（空数据也应该发布事件，让消费方知道当前状态）
        assert result is True
        mock_event_producer.publish_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_push_hot_intelligence_selector_error(self, mock_event_producer, mock_selector):
        """测试筛选器错误处理"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        # 设置错误
        mock_selector.select_and_format_for_push = AsyncMock(
            side_effect=Exception("Database error")
        )

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_event_producer
        )

        result = await pusher.push_hot_intelligence()

        # 验证返回False表示失败
        assert result is False

        # 验证事件没有被发布
        mock_event_producer.publish_event.assert_not_called()

    @pytest.mark.asyncio
    async def test_push_hot_intelligence_publish_error(
        self, mock_event_producer, mock_selector, sample_hot_intelligence
    ):
        """测试发布错误处理"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector.select_and_format_for_push = AsyncMock(return_value=sample_hot_intelligence)
        mock_event_producer.publish_event = AsyncMock(side_effect=Exception("Redis error"))

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_event_producer
        )

        result = await pusher.push_hot_intelligence()

        # 验证返回False表示失败
        assert result is False

    @pytest.mark.asyncio
    async def test_start_stop(self, mock_event_producer, mock_selector):
        """测试启动和停止"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_event_producer,
            push_interval_minutes=1  # 1分钟间隔用于测试
        )

        # 模拟 _push_loop 方法
        pusher._push_loop = AsyncMock()

        # 启动
        await pusher.start()
        assert pusher.is_running is True

        # 停止
        await pusher.stop()
        assert pusher.is_running is False


class TestHotIntelligencePusherIntegration:
    """集成测试"""

    @pytest.mark.asyncio
    async def test_push_event_format(self, mock_event_producer, mock_selector):
        """测试推送事件格式"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        now = datetime.now()
        hot_data = {
            "intelligence": [
                {
                    "stock_code": "000001.SZ",
                    "stock_name": "平安银行",
                    "summary": "平安银行发布年度业绩预告，净利润同比增长15%",
                    "sentiment_type": "positive",
                    "sentiment_confidence": 0.85,
                    "importance": 8,
                    "is_breaking": True,
                    "created_at": now.isoformat(),
                }
            ],
            "coverage": ["000001.SZ"],
            "timestamp": now.isoformat(),
        }

        mock_selector.select_and_format_for_push = AsyncMock(return_value=hot_data)

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_event_producer
        )

        await pusher.push_hot_intelligence()

        # 验证事件格式
        call_args = mock_event_producer.publish_event.call_args
        payload = call_args[0][1]

        # 验证payload结构
        assert "intelligence" in payload
        assert "coverage" in payload
        assert "timestamp" in payload

        # 验证intelligence项结构
        intel = payload["intelligence"][0]
        assert "stock_code" in intel
        assert "stock_name" in intel
        assert "summary" in intel
        assert "sentiment_confidence" in intel

    @pytest.mark.asyncio
    async def test_multiple_push_calls(self, mock_event_producer, mock_selector):
        """测试多次推送调用"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        mock_selector.select_and_format_for_push = AsyncMock(
            side_effect=[
                {"intelligence": [{"stock_code": "000001.SZ"}], "coverage": ["000001.SZ"], "timestamp": datetime.now().isoformat()},
                {"intelligence": [{"stock_code": "000002.SZ"}], "coverage": ["000002.SZ"], "timestamp": datetime.now().isoformat()},
            ]
        )

        pusher = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_event_producer
        )

        # 第一次推送
        await pusher.push_hot_intelligence()
        assert mock_event_producer.publish_event.call_count == 1

        # 第二次推送
        await pusher.push_hot_intelligence()
        assert mock_event_producer.publish_event.call_count == 2

    @pytest.mark.asyncio
    async def test_push_with_different_intervals(self, mock_event_producer, mock_selector):
        """测试不同推送间隔配置"""
        from news_service.services.hot_intelligence_pusher import HotIntelligencePusher

        # 1分钟间隔
        pusher_1min = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_event_producer,
            push_interval_minutes=1
        )
        assert pusher_1min.push_interval_minutes == 1

        # 5分钟间隔
        pusher_5min = HotIntelligencePusher(
            selector=mock_selector,
            event_producer=mock_event_producer,
            push_interval_minutes=5
        )
        assert pusher_5min.push_interval_minutes == 5
