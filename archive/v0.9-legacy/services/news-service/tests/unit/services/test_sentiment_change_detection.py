"""
情感变化检测器单元测试

测试内容:
1. 情感变化检测逻辑
2. 变化事件触发
3. 置信度阈值控制
4. 批量更新
5. 统计信息
"""

import sys
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

import pytest
import asyncio
from datetime import datetime
from unittest.mock import Mock, AsyncMock

from news_service.services.sentiment_change_detector import (
    SentimentChangeDetector,
    SentimentRecord,
    SentimentChangeEvent
)


class TestSentimentChangeDetection:
    """情感变化检测测试"""

    @pytest.fixture
    def detector(self):
        """创建检测器实例"""
        return SentimentChangeDetector(confidence_threshold=0.7)

    @pytest.mark.asyncio
    async def test_first_sentiment_record_no_event(self):
        """测试首次情感记录不触发事件"""
        detector = SentimentChangeDetector()

        event = await detector.update_sentiment(
            stock_code="000001.SZ",
            sentiment="positive",
            confidence=0.85
        )

        # 首次记录不应触发事件
        assert event is None

        # 验证历史记录已保存
        history = detector.get_sentiment_history("000001.SZ")
        assert history is not None
        assert history.sentiment == "positive"
        assert history.confidence == 0.85

    @pytest.mark.asyncio
    async def test_sentiment_change_triggers_event(self):
        """测试情感变化触发事件"""
        detector = SentimentChangeDetector()

        # 首次记录
        await detector.update_sentiment(
            stock_code="000001.SZ",
            sentiment="neutral",
            confidence=0.8
        )

        # 情感变化
        event = await detector.update_sentiment(
            stock_code="000001.SZ",
            sentiment="positive",
            confidence=0.85
        )

        # 应触发变化事件
        assert event is not None
        assert event.stock_code == "000001.SZ"
        assert event.old_sentiment == "neutral"
        assert event.new_sentiment == "positive"
        assert event.change_reason is not None

    @pytest.mark.asyncio
    async def test_no_change_no_event(self):
        """测试情感未变化不触发事件"""
        detector = SentimentChangeDetector()

        # 首次记录
        await detector.update_sentiment(
            stock_code="000001.SZ",
            sentiment="positive",
            confidence=0.8
        )

        # 相同情感
        event = await detector.update_sentiment(
            stock_code="000001.SZ",
            sentiment="positive",
            confidence=0.9
        )

        # 不应触发事件
        assert event is None

    @pytest.mark.asyncio
    async def test_low_confidence_no_event(self):
        """测试低置信度不触发事件"""
        detector = SentimentChangeDetector(confidence_threshold=0.7)

        # 首次记录
        await detector.update_sentiment(
            stock_code="000001.SZ",
            sentiment="neutral",
            confidence=0.8
        )

        # 情感变化但置信度低
        event = await detector.update_sentiment(
            stock_code="000001.SZ",
            sentiment="positive",
            confidence=0.5  # 低于阈值0.7
        )

        # 不应触发事件
        assert event is None

    @pytest.mark.asyncio
    async def test_event_callback_triggered(self):
        """测试事件回调被正确触发"""
        callback_mock = AsyncMock()
        detector = SentimentChangeDetector(
            event_callback=callback_mock,
            confidence_threshold=0.7
        )

        # 首次记录
        await detector.update_sentiment(
            stock_code="000001.SZ",
            sentiment="neutral",
            confidence=0.8
        )

        # 情感变化
        await detector.update_sentiment(
            stock_code="000001.SZ",
            sentiment="positive",
            confidence=0.85
        )

        # 验证回调被调用
        assert callback_mock.called
        call_args = callback_mock.call_args[0][0]
        assert call_args.stock_code == "000001.SZ"
        assert call_args.old_sentiment == "neutral"
        assert call_args.new_sentiment == "positive"

    @pytest.mark.asyncio
    async def test_event_callback_sync_function(self):
        """测试同步回调函数"""
        callback_mock = Mock()
        detector = SentimentChangeDetector(
            event_callback=callback_mock,
            confidence_threshold=0.7
        )

        # 首次记录
        await detector.update_sentiment(
            stock_code="000001.SZ",
            sentiment="neutral",
            confidence=0.8
        )

        # 情感变化
        await detector.update_sentiment(
            stock_code="000001.SZ",
            sentiment="positive",
            confidence=0.85
        )

        # 验证回调被调用
        assert callback_mock.called

    @pytest.mark.asyncio
    async def test_batch_update(self):
        """测试批量更新"""
        detector = SentimentChangeDetector()

        # 首次批量记录（不触发事件）
        updates = [
            {"stock_code": "000001.SZ", "sentiment": "neutral", "confidence": 0.8},
            {"stock_code": "600519.SH", "sentiment": "positive", "confidence": 0.85},
        ]
        events = await detector.batch_update_sentiments(updates)
        assert len(events) == 0

        # 第二次批量更新（部分触发事件）
        updates = [
            {"stock_code": "000001.SZ", "sentiment": "positive", "confidence": 0.85},  # 变化
            {"stock_code": "600519.SH", "sentiment": "positive", "confidence": 0.9},   # 无变化
        ]
        events = await detector.batch_update_sentiments(updates)
        assert len(events) == 1
        assert events[0].stock_code == "000001.SZ"

    def test_get_all_sentiments(self):
        """测试获取所有情感记录"""
        detector = SentimentChangeDetector()

        # 添加一些记录
        asyncio.run(detector.update_sentiment("000001.SZ", "positive", 0.8))
        asyncio.run(detector.update_sentiment("600519.SH", "neutral", 0.75))

        # 获取所有记录
        all_sentiments = detector.get_all_sentiments()
        assert len(all_sentiments) == 2
        assert "000001.SZ" in all_sentiments
        assert "600519.SH" in all_sentiments

    def test_clear_history(self):
        """测试清除历史记录"""
        detector = SentimentChangeDetector()

        # 添加记录
        asyncio.run(detector.update_sentiment("000001.SZ", "positive", 0.8))

        # 清除特定股票
        detector.clear_history("000001.SZ")
        assert detector.get_sentiment_history("000001.SZ") is None

        # 重新添加
        asyncio.run(detector.update_sentiment("000001.SZ", "positive", 0.8))
        asyncio.run(detector.update_sentiment("600519.SH", "neutral", 0.75))

        # 清除所有
        detector.clear_history()
        assert len(detector.get_all_sentiments()) == 0

    def test_get_statistics(self):
        """测试获取统计信息"""
        detector = SentimentChangeDetector()

        # 空记录
        stats = detector.get_statistics()
        assert stats["total_stocks"] == 0
        assert stats["avg_confidence"] == 0.0

        # 添加记录
        asyncio.run(detector.update_sentiment("000001.SZ", "positive", 0.8))
        asyncio.run(detector.update_sentiment("600519.SH", "positive", 0.9))
        asyncio.run(detector.update_sentiment("300750.SZ", "negative", 0.75))

        stats = detector.get_statistics()
        assert stats["total_stocks"] == 3
        assert stats["sentiment_distribution"]["positive"] == 2
        assert stats["sentiment_distribution"]["negative"] == 1
        assert stats["avg_confidence"] == pytest.approx(0.82, abs=0.01)


class TestSentimentChangeReasonInference:
    """情感变化原因推断测试"""

    @pytest.fixture
    def detector(self):
        """创建检测器实例"""
        return SentimentChangeDetector()

    @pytest.mark.asyncio
    async def test_negative_to_positive_reason(self):
        """测试负面转正面原因推断"""
        detector = SentimentChangeDetector()

        await detector.update_sentiment("000001.SZ", "negative", 0.8)
        event = await detector.update_sentiment("000001.SZ", "positive", 0.85)

        assert "利好" in event.change_reason

    @pytest.mark.asyncio
    async def test_positive_to_negative_reason(self):
        """测试正面转负面原因推断"""
        detector = SentimentChangeDetector()

        await detector.update_sentiment("000001.SZ", "positive", 0.8)
        event = await detector.update_sentiment("000001.SZ", "negative", 0.85)

        assert "利空" in event.change_reason

    @pytest.mark.asyncio
    async def test_neutral_to_positive_reason(self):
        """测试中性转正面原因推断"""
        detector = SentimentChangeDetector()

        await detector.update_sentiment("000001.SZ", "neutral", 0.8)
        event = await detector.update_sentiment("000001.SZ", "positive", 0.85)

        assert "积极" in event.change_reason

    @pytest.mark.asyncio
    async def test_custom_reason(self):
        """测试自定义变化原因"""
        detector = SentimentChangeDetector()

        await detector.update_sentiment("000001.SZ", "neutral", 0.8)
        custom_reason = "发布业绩预增公告"
        event = await detector.update_sentiment(
            "000001.SZ",
            "positive",
            0.85,
            reason=custom_reason
        )

        assert event.change_reason == custom_reason


class TestSentimentChangeEventTypes:
    """情感变化事件类型测试"""

    @pytest.mark.asyncio
    async def test_all_sentiment_transitions(self):
        """测试所有情感转换组合"""
        detector = SentimentChangeDetector()

        sentiments = ["positive", "negative", "neutral"]

        for old in sentiments:
            for new in sentiments:
                if old != new:
                    # 清除历史
                    detector.clear_history("TEST.SZ")

                    # 首次记录
                    await detector.update_sentiment("TEST.SZ", old, 0.8)

                    # 变化
                    event = await detector.update_sentiment("TEST.SZ", new, 0.85)

                    assert event is not None
                    assert event.old_sentiment == old
                    assert event.new_sentiment == new
                    assert event.change_reason is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
