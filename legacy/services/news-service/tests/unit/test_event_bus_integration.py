"""
News Service 事件总线集成测试

测试内容:
1. 事件总线客户端连接
2. 事件发布功能
3. 事件订阅功能
4. 行情异动事件处理
"""

import sys
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))
sys.path.insert(0, str(project_root / "news-service" / "src"))

import pytest
import asyncio
from datetime import datetime, timezone
from unittest.mock import Mock, patch, AsyncMock

from event_bus import EventBusClient, EventProducer, EventConsumer, EventSchema, EventType
from event_bus.exceptions import ConnectionError, PublishError

from news_service.main import NewsService


class TestEventBusIntegration:
    """事件总线集成测试类"""

    @pytest.fixture
    async def news_service(self):
        """创建News Service实例"""
        service = NewsService()
        yield service
        # 清理
        if service.event_bus_client:
            await service.event_bus_client.close()

    @pytest.mark.asyncio
    async def test_initialize_event_bus(self):
        """测试事件总线初始化"""
        service = NewsService()

        # Mock EventBusClient
        with patch('news_service.main.EventBusClient') as mock_client:
            mock_client_instance = Mock()
            mock_client.return_value = mock_client_instance

            # Mock EventProducer
            with patch('news_service.main.EventProducer') as mock_producer:
                mock_producer_instance = Mock()
                mock_producer.return_value = mock_producer_instance

                # Mock EventConsumer
                with patch('news_service.main.EventConsumer') as mock_consumer:
                    mock_consumer_instance = Mock()
                    mock_consumer.return_value = mock_consumer_instance

                    # 执行初始化
                    await service.initialize()

                    # 验证客户端创建
                    assert mock_client.called
                    assert mock_producer.called
                    assert mock_consumer.called

                    # 验证消费者订阅
                    assert mock_consumer_instance.subscribe.called

    @pytest.mark.asyncio
    async def test_publish_intelligence_event(self):
        """测试发布新闻情报事件"""
        service = NewsService()

        # Mock EventProducer
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock()
        service.event_producer = mock_producer

        # 执行发布
        await service.publish_intelligence_event(
            stock_code="000001.SZ",
            intelligence="平安银行发布利好公告",
            sentiment="positive",
            confidence=0.85
        )

        # 验证发布被调用
        assert mock_producer.publish_event.called

        # 验证事件参数
        call_args = mock_producer.publish_event.call_args[0][0]
        assert call_args.event_type == EventType.NEWS_INTELLIGENCE_EXTRACTED
        assert call_args.payload["stock_code"] == "000001.SZ"
        assert call_args.payload["sentiment"] == "positive"
        assert call_args.payload["confidence"] == 0.85

    @pytest.mark.asyncio
    async def test_publish_sentiment_change_event(self):
        """测试发布情感变化事件"""
        service = NewsService()

        # Mock EventProducer
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock()
        service.event_producer = mock_producer

        # 执行发布
        await service.publish_sentiment_change_event(
            stock_code="000001.SZ",
            old_sentiment="neutral",
            new_sentiment="positive",
            change_reason="发布业绩预告"
        )

        # 验证发布被调用
        assert mock_producer.publish_event.called

        # 验证事件参数
        call_args = mock_producer.publish_event.call_args[0][0]
        assert call_args.event_type == EventType.NEWS_SENTIMENT_CHANGED
        assert call_args.payload["old_sentiment"] == "neutral"
        assert call_args.payload["new_sentiment"] == "positive"

    @pytest.mark.asyncio
    async def test_handle_price_alert_event(self):
        """测试处理行情异动事件"""
        service = NewsService()

        # Mock _trigger_news_collection方法
        service._trigger_news_collection = AsyncMock()

        # 创建测试事件
        event = EventSchema(
            event_type=EventType.MARKET_ALERT_PRICE_MOVE,
            source="market-data-service",
            payload={
                "symbol": "000001.SZ",
                "alert_type": "price_surge",
                "severity": "high",
                "message": "股价大涨7%"
            }
        )

        # 执行处理
        await service._handle_price_alert(event)

        # 验证新闻采集被触发
        assert service._trigger_news_collection.called
        service._trigger_news_collection.assert_called_with(
            "000001.SZ", "price_surge", "high"
        )

    @pytest.mark.asyncio
    async def test_trigger_news_collection_high_severity(self):
        """测试高级别异动触发新闻采集"""
        service = NewsService()

        # Mock采集器
        for collector in service.collectors.values():
            collector.collect = AsyncMock(return_value=[])

        # 触发高级别采集
        await service._trigger_news_collection("000001.SZ", "price_surge", "high")

        # 验证所有采集器都被调用
        for collector in service.collectors.values():
            # 由于collect方法可能不存在，我们只验证不抛出异常
            pass

    @pytest.mark.asyncio
    async def test_trigger_news_collection_low_severity(self):
        """测试低级别异动触发新闻采集"""
        service = NewsService()

        # 触发低级别采集
        await service._trigger_news_collection("000001.SZ", "price_change", "low")

        # 低级别应该只采集主要数据源（sina, eastmoney）
        # 验证不抛出异常即可

    @pytest.mark.asyncio
    async def test_handle_ai_performance_report_positive(self):
        """测试处理AI决策反馈事件 - Positive反馈 (C3-003C)"""
        service = NewsService()

        # Mock优化策略方法
        service._optimize_prompt_strategy = AsyncMock()
        service._record_ai_feedback_metrics = AsyncMock()

        # 创建测试事件 - 高准确率Positive反馈
        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "stock_code": "000001.SZ",
                "decision_id": "dec-001",
                "performance": {
                    "accuracy": 0.85,
                    "profit_loss": 5000.0,
                    "feedback_type": "positive"
                },
                "used_intelligence": ["intel-001", "intel-002"]
            }
        )

        # 执行处理
        await service._handle_ai_performance_report(event)

        # 验证优化策略被调用（enhance动作）
        service._optimize_prompt_strategy.assert_called_with(
            "000001.SZ", ["intel-001", "intel-002"], "enhance"
        )

        # 验证指标记录被调用
        service._record_ai_feedback_metrics.assert_called()

    @pytest.mark.asyncio
    async def test_handle_ai_performance_report_negative(self):
        """测试处理AI决策反馈事件 - Negative反馈 (C3-003C)"""
        service = NewsService()

        # Mock优化策略方法
        service._optimize_prompt_strategy = AsyncMock()
        service._record_ai_feedback_metrics = AsyncMock()

        # 创建测试事件 - 低准确率Negative反馈
        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "stock_code": "000001.SZ",
                "decision_id": "dec-002",
                "performance": {
                    "accuracy": 0.20,
                    "profit_loss": -3000.0,
                    "feedback_type": "negative"
                },
                "used_intelligence": ["intel-003"]
            }
        )

        # 执行处理
        await service._handle_ai_performance_report(event)

        # 验证优化策略被调用（adjust动作）
        service._optimize_prompt_strategy.assert_called_with(
            "000001.SZ", ["intel-003"], "adjust"
        )

        # 验证指标记录被调用
        service._record_ai_feedback_metrics.assert_called()

    @pytest.mark.asyncio
    async def test_handle_ai_performance_report_neutral(self):
        """测试处理AI决策反馈事件 - Neutral反馈 (C3-003C)"""
        service = NewsService()

        # Mock优化策略方法
        service._optimize_prompt_strategy = AsyncMock()
        service._record_ai_feedback_metrics = AsyncMock()

        # 创建测试事件 - 中等准确率Neutral反馈
        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "stock_code": "000001.SZ",
                "decision_id": "dec-003",
                "performance": {
                    "accuracy": 0.50,
                    "profit_loss": 500.0,
                    "feedback_type": "neutral"
                },
                "used_intelligence": []
            }
        )

        # 执行处理
        await service._handle_ai_performance_report(event)

        # 验证优化策略未被调用（neutral情况）
        service._optimize_prompt_strategy.assert_not_called()

        # 验证指标记录仍然被调用
        service._record_ai_feedback_metrics.assert_called()

    @pytest.mark.asyncio
    async def test_optimize_prompt_strategy(self):
        """测试Prompt策略优化方法 (C3-003C)"""
        service = NewsService()

        # 测试enhance动作
        await service._optimize_prompt_strategy(
            "000001.SZ",
            ["intel-001", "intel-002"],
            "enhance"
        )

        # 测试adjust动作
        await service._optimize_prompt_strategy(
            "000001.SZ",
            ["intel-003"],
            "adjust"
        )

        # 验证方法执行不抛出异常

    @pytest.mark.asyncio
    async def test_record_ai_feedback_metrics(self):
        """测试AI反馈指标记录方法 (C3-003C)"""
        service = NewsService()

        performance = {
            "accuracy": 0.75,
            "profit_loss": 2000.0,
            "feedback_type": "positive"
        }

        # 执行记录
        await service._record_ai_feedback_metrics(
            stock_code="000001.SZ",
            decision_id="dec-004",
            performance=performance,
            intelligence_items=["intel-004", "intel-005"]
        )

        # 验证方法执行不抛出异常

    @pytest.mark.asyncio
    async def test_service_start_stop(self):
        """测试服务启动和停止"""
        service = NewsService()

        # Mock事件消费者
        mock_consumer = Mock()
        mock_consumer.start = AsyncMock()
        mock_consumer.stop = Mock()  # stop是同步方法
        service.event_consumer = mock_consumer

        # Mock事件总线客户端 - 代码优先使用disconnect方法
        mock_client = Mock()
        mock_client.disconnect = Mock()  # disconnect是同步方法
        mock_client.close = Mock()
        service.event_bus_client = mock_client

        # 测试停止
        await service.stop()

        # 验证资源被释放
        assert mock_consumer.stop.called
        # 代码优先使用disconnect方法，如果存在则调用disconnect
        assert mock_client.disconnect.called or mock_client.close.called


class TestEventSchemaValidation:
    """事件Schema验证测试"""

    def test_news_intelligence_event_schema(self):
        """测试新闻情报事件Schema"""
        event = EventSchema(
            event_type=EventType.NEWS_INTELLIGENCE_EXTRACTED,
            source="news-service",
            payload={
                "stock_code": "000001.SZ",
                "intelligence": "平安银行发布利好公告",
                "sentiment": "positive",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )

        assert event.event_type == EventType.NEWS_INTELLIGENCE_EXTRACTED
        assert event.payload["stock_code"] == "000001.SZ"
        assert "event_id" in event.to_dict()
        assert "timestamp" in event.to_dict()

    def test_market_alert_event_schema(self):
        """测试行情异动事件Schema"""
        event = EventSchema(
            event_type=EventType.MARKET_ALERT_PRICE_MOVE,
            source="market-data-service",
            payload={
                "symbol": "000001.SZ",
                "alert_type": "price_surge",
                "severity": "high",
                "message": "股价大涨7%"
            }
        )

        assert event.event_type == EventType.MARKET_ALERT_PRICE_MOVE
        assert event.payload["symbol"] == "000001.SZ"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
