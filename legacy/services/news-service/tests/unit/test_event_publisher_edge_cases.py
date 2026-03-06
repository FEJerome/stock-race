"""
News Service 事件发布边界情况测试

测试内容:
1. Redis断开时的降级处理
2. Payload序列化失败时的异常捕获
3. EventProducer未初始化时的优雅处理
4. 高频发布时的性能测试

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
import time
from datetime import datetime, timezone
from unittest.mock import Mock, patch, AsyncMock, MagicMock

from event_bus import EventBusClient, EventProducer, EventSchema, EventType
from event_bus.exceptions import ConnectionError, PublishError, SerializationError

from news_service.main import NewsService, ServiceMode


class TestEventPublisherErrorHandling:
    """事件发布错误处理测试"""

    @pytest.mark.asyncio
    async def test_publish_with_redis_connection_error(self):
        """测试Redis断开时publish_intelligence_event的降级处理"""
        service = NewsService()
        service.mode = ServiceMode.NORMAL

        # Mock EventProducer抛出ConnectionError
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock(
            side_effect=ConnectionError("Redis connection failed")
        )
        service.event_producer = mock_producer

        # 执行发布（不应抛出异常，应记录日志）
        with patch('news_service.main.logger') as mock_logger:
            await service.publish_intelligence_event(
                stock_code="000001.SZ",
                intelligence="测试情报",
                sentiment="positive",
                confidence=0.85
            )

            # 验证错误被记录
            assert mock_logger.error.called
            error_calls = [call for call in mock_logger.error.call_args_list
                          if "Redis" in str(call) or "发布情报事件失败" in str(call)]
            assert len(error_calls) > 0

    @pytest.mark.asyncio
    async def test_publish_with_serialization_error(self):
        """测试Payload序列化失败时的异常捕获"""
        service = NewsService()

        # Mock EventProducer抛出SerializationError
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock(
            side_effect=SerializationError("JSON serialization failed")
        )
        service.event_producer = mock_producer

        # 执行发布（不应抛出异常，应记录日志）
        with patch('news_service.main.logger') as mock_logger:
            await service.publish_intelligence_event(
                stock_code="000001.SZ",
                intelligence="测试情报",
                sentiment="positive",
                confidence=0.85
            )

            # 验证序列化错误被捕获并记录
            assert mock_logger.error.called

    @pytest.mark.asyncio
    async def test_publish_with_uninitialized_producer(self):
        """测试EventProducer未初始化时的优雅处理"""
        service = NewsService()
        service.event_producer = None  # 模拟未初始化

        # 执行发布（不应抛出异常，应记录日志）
        with patch('news_service.main.logger') as mock_logger:
            await service.publish_intelligence_event(
                stock_code="000001.SZ",
                intelligence="测试情报",
                sentiment="positive",
                confidence=0.85
            )

            # 验证错误被记录
            assert mock_logger.error.called

    @pytest.mark.asyncio
    async def test_publish_with_generic_exception(self):
        """测试发布时通用异常的捕获"""
        service = NewsService()

        # Mock EventProducer抛出通用异常
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock(
            side_effect=Exception("Unexpected error")
        )
        service.event_producer = mock_producer

        # 执行发布（不应抛出异常）
        with patch('news_service.main.logger') as mock_logger:
            await service.publish_intelligence_event(
                stock_code="000001.SZ",
                intelligence="测试情报",
                sentiment="positive",
                confidence=0.85
            )

            # 验证通用异常被捕获并记录
            assert mock_logger.error.called
            assert "发布情报事件时发生错误" in str(mock_logger.error.call_args)

    @pytest.mark.asyncio
    async def test_publish_sentiment_change_with_connection_error(self):
        """测试情感变化事件发布时的连接错误处理"""
        service = NewsService()

        # Mock EventProducer抛出ConnectionError
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock(
            side_effect=ConnectionError("Redis connection failed")
        )
        service.event_producer = mock_producer

        # 执行发布（不应抛出异常）
        with patch('news_service.main.logger') as mock_logger:
            await service.publish_sentiment_change_event(
                stock_code="000001.SZ",
                old_sentiment="neutral",
                new_sentiment="positive",
                change_reason="测试变化"
            )

            # 验证错误被记录
            assert mock_logger.error.called


class TestEventPublisherPerformance:
    """事件发布性能测试"""

    @pytest.mark.asyncio
    async def test_high_frequency_publish(self):
        """测试高频发布时的性能 (>100次/秒)"""
        service = NewsService()

        # Mock EventProducer
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock()
        service.event_producer = mock_producer

        # 测试参数
        publish_count = 150  # 发布150次

        # 记录开始时间
        start_time = time.time()

        # 执行高频发布
        tasks = []
        for i in range(publish_count):
            task = service.publish_intelligence_event(
                stock_code=f"00000{i%10}.SZ",
                intelligence=f"测试情报{i}",
                sentiment="positive",
                confidence=0.85
            )
            tasks.append(task)

        # 等待所有发布完成
        await asyncio.gather(*tasks)

        # 记录结束时间
        end_time = time.time()
        duration = end_time - start_time

        # 计算吞吐量
        throughput = publish_count / duration

        # 验证所有发布都被调用
        assert mock_producer.publish_event.call_count == publish_count

        # 验证吞吐量 > 100次/秒
        assert throughput > 100, f"吞吐量 {throughput:.2f} 次/秒 低于 100次/秒"

        print(f"\n高频发布测试: {publish_count}次发布，耗时 {duration:.2f}秒，"
              f"吞吐量 {throughput:.2f}次/秒")

    @pytest.mark.asyncio
    async def test_publish_with_large_payload(self):
        """测试大Payload发布时的处理"""
        service = NewsService()

        # Mock EventProducer
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock()
        service.event_producer = mock_producer

        # 创建大Payload（500字符）
        large_intelligence = "平安银行" * 100  # 400字符

        # 执行发布
        await service.publish_intelligence_event(
            stock_code="000001.SZ",
            intelligence=large_intelligence,
            sentiment="positive",
            confidence=0.85
        )

        # 验证发布成功
        assert mock_producer.publish_event.called

        # 验证Payload被正确传递
        call_args = mock_producer.publish_event.call_args[0][0]
        assert call_args.payload["intelligence"] == large_intelligence


class TestEventPublisherPayloadValidation:
    """事件发布Payload验证测试"""

    @pytest.mark.asyncio
    async def test_publish_with_invalid_sentiment(self):
        """测试无效情感值的处理"""
        service = NewsService()

        # Mock EventProducer
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock()
        service.event_producer = mock_producer

        # 使用无效的情感值（应该仍然发布，由消费者验证）
        await service.publish_intelligence_event(
            stock_code="000001.SZ",
            intelligence="测试情报",
            sentiment="invalid_sentiment",  # 无效值
            confidence=0.85
        )

        # 验证发布被调用（News Service不验证情感值，由消费者处理）
        assert mock_producer.publish_event.called

    @pytest.mark.asyncio
    async def test_publish_with_invalid_confidence(self):
        """测试无效置信度的处理"""
        service = NewsService()

        # Mock EventProducer
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock()
        service.event_producer = mock_producer

        # 使用无效的置信度（应该仍然发布）
        await service.publish_intelligence_event(
            stock_code="000001.SZ",
            intelligence="测试情报",
            sentiment="positive",
            confidence=1.5  # 超出0-1范围
        )

        # 验证发布被调用
        assert mock_producer.publish_event.called
        call_args = mock_producer.publish_event.call_args[0][0]
        assert call_args.payload["confidence"] == 1.5

    @pytest.mark.asyncio
    async def test_publish_with_special_characters(self):
        """测试特殊字符Payload的处理"""
        service = NewsService()

        # Mock EventProducer
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock()
        service.event_producer = mock_producer

        # 使用包含特殊字符的情报
        special_intelligence = "测试情报！@#$%^&*()_+{}|:<>?~`-=[]\\\\;',./\""

        await service.publish_intelligence_event(
            stock_code="000001.SZ",
            intelligence=special_intelligence,
            sentiment="positive",
            confidence=0.85
        )

        # 验证发布成功
        assert mock_producer.publish_event.called
        call_args = mock_producer.publish_event.call_args[0][0]
        assert call_args.payload["intelligence"] == special_intelligence

    @pytest.mark.asyncio
    async def test_publish_with_unicode_characters(self):
        """测试Unicode字符（中文、Emoji）Payload的处理"""
        service = NewsService()

        # Mock EventProducer
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock()
        service.event_producer = mock_producer

        # 使用包含Unicode字符的情报
        unicode_intelligence = "平安银行发布业绩预增公告📈🚀"

        await service.publish_intelligence_event(
            stock_code="000001.SZ",
            intelligence=unicode_intelligence,
            sentiment="positive",
            confidence=0.85
        )

        # 验证发布成功
        assert mock_producer.publish_event.called
        call_args = mock_producer.publish_event.call_args[0][0]
        assert call_args.payload["intelligence"] == unicode_intelligence


class TestEventPublisherConcurrency:
    """事件发布并发测试"""

    @pytest.mark.asyncio
    async def test_concurrent_publish_same_stock(self):
        """测试同一股票的并发发布"""
        service = NewsService()

        # Mock EventProducer
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock()
        service.event_producer = mock_producer

        # 并发发布同一股票的情报
        tasks = []
        for i in range(10):
            task = service.publish_intelligence_event(
                stock_code="000001.SZ",  # 同一股票
                intelligence=f"情报{i}",
                sentiment="positive",
                confidence=0.85
            )
            tasks.append(task)

        # 等待所有发布完成
        await asyncio.gather(*tasks)

        # 验证所有发布都被调用
        assert mock_producer.publish_event.call_count == 10

    @pytest.mark.asyncio
    async def test_concurrent_publish_different_stocks(self):
        """测试不同股票的并发发布"""
        service = NewsService()

        # Mock EventProducer
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock()
        service.event_producer = mock_producer

        # 并发发布不同股票的情报
        tasks = []
        stock_codes = ["000001.SZ", "600519.SH", "300750.SZ", "601318.SH"]
        for i in range(20):
            task = service.publish_intelligence_event(
                stock_code=stock_codes[i % len(stock_codes)],
                intelligence=f"情报{i}",
                sentiment="positive",
                confidence=0.85
            )
            tasks.append(task)

        # 等待所有发布完成
        await asyncio.gather(*tasks)

        # 验证所有发布都被调用
        assert mock_producer.publish_event.call_count == 20


class TestEventPublisherTimestamp:
    """事件发布时间戳测试"""

    @pytest.mark.asyncio
    async def test_publish_timestamp_format(self):
        """测试发布时间戳格式"""
        service = NewsService()

        # Mock EventProducer
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock()
        service.event_producer = mock_producer

        # 执行发布
        await service.publish_intelligence_event(
            stock_code="000001.SZ",
            intelligence="测试情报",
            sentiment="positive",
            confidence=0.85
        )

        # 验证时间戳格式
        call_args = mock_producer.publish_event.call_args[0][0]
        timestamp = call_args.payload["timestamp"]

        # 验证是有效的ISO 8601格式
        try:
            datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        except ValueError:
            pytest.fail(f"Invalid timestamp format: {timestamp}")

    @pytest.mark.asyncio
    async def test_publish_timestamp_timezone(self):
        """测试发布时间戳时区（应为UTC）"""
        service = NewsService()

        # Mock EventProducer
        mock_producer = Mock()
        mock_producer.publish_event = AsyncMock()
        service.event_producer = mock_producer

        # 记录发布前时间
        before_publish = datetime.now(timezone.utc)

        # 执行发布
        await service.publish_intelligence_event(
            stock_code="000001.SZ",
            intelligence="测试情报",
            sentiment="positive",
            confidence=0.85
        )

        # 记录发布后时间
        after_publish = datetime.now(timezone.utc)

        # 验证时间戳
        call_args = mock_producer.publish_event.call_args[0][0]
        timestamp_str = call_args.payload["timestamp"]
        event_timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))

        # 验证时间戳在合理范围内
        assert before_publish <= event_timestamp <= after_publish


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
