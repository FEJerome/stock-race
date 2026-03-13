"""
Tests for window aggregation functions
"""
import pytest
from datetime import datetime, timedelta
from uuid import uuid4

from models.event import Event, EventSentiment, EventType, WindowFeatures
from services.window_aggregation import (
    ema_weighted_average,
    calculate_window_features,
    calculate_logical_consistency,
    calculate_sentiment_score,
    calculate_multi_window_features
)


class TestEMAWeightedAverage:
    """Tests for ema_weighted_average function"""

    def test_empty_list(self):
        """Test with empty list returns 0.0"""
        result = ema_weighted_average([], alpha=0.9)
        assert result == 0.0

    def test_single_value(self):
        """Test with single value returns that value"""
        result = ema_weighted_average([0.5], alpha=0.9)
        assert result == 0.5

    def test_ascending_values(self):
        """Test EMA with ascending values - final EMA should be higher"""
        values = [0.1, 0.2, 0.3, 0.4, 0.5]
        result = ema_weighted_average(values, alpha=0.9)
        # With high alpha (0.9), EMA should be close to latest value
        assert result > 0.4
        assert result <= 0.5

    def test_descending_values(self):
        """Test EMA with descending values - final EMA should be lower"""
        values = [0.5, 0.4, 0.3, 0.2, 0.1]
        result = ema_weighted_average(values, alpha=0.9)
        assert result < 0.2
        assert result >= 0.1

    def test_high_alpha_sensitivity(self):
        """Test that high alpha is more sensitive to recent values"""
        values = [0.1, 0.2, 0.3, 0.4, 0.5]
        high_alpha = ema_weighted_average(values, alpha=0.95)
        low_alpha = ema_weighted_average(values, alpha=0.5)
        # High alpha should be closer to 0.5 (latest value)
        assert high_alpha > low_alpha

    def test_alpha_clamping(self):
        """Test that alpha is clamped to [0, 1]"""
        values = [0.5, 0.6, 0.7]
        # Alpha > 1 should be treated as 1
        result_high = ema_weighted_average(values, alpha=1.5)
        # Alpha < 0 should be treated as 0
        result_low = ema_weighted_average(values, alpha=-0.5)
        # With alpha=1, EMA = last value
        assert result_high == 0.7
        # With alpha=0, EMA = first value
        assert result_low == 0.5


class TestCalculateSentimentScore:
    """Tests for calculate_sentiment_score function"""

    def test_positive_sentiment(self):
        """Test positive sentiment returns positive score"""
        event = Event(
            id=str(uuid4()),
            news_id=str(uuid4()),
            stock_code="000001.SZ",
            trigger="发布",
            subject="公司",
            object="财报",
            event_type=EventType.PERFORMANCE,
            intensity=0.8,
            sentiment=EventSentiment.POSITIVE,
            timestamp=datetime.utcnow()
        )
        result = calculate_sentiment_score(event)
        assert result == 0.8

    def test_negative_sentiment(self):
        """Test negative sentiment returns negative score"""
        event = Event(
            id=str(uuid4()),
            news_id=str(uuid4()),
            stock_code="000001.SZ",
            trigger="涉嫌",
            subject="公司",
            object="违规",
            event_type=EventType.GOVERNANCE,
            intensity=0.6,
            sentiment=EventSentiment.NEGATIVE,
            timestamp=datetime.utcnow()
        )
        result = calculate_sentiment_score(event)
        assert result == -0.6

    def test_neutral_sentiment(self):
        """Test neutral sentiment returns 0"""
        event = Event(
            id=str(uuid4()),
            news_id=str(uuid4()),
            stock_code="000001.SZ",
            trigger="公告",
            subject="公司",
            object=None,
            event_type=EventType.POLICY,
            intensity=0.5,
            sentiment=EventSentiment.NEUTRAL,
            timestamp=datetime.utcnow()
        )
        result = calculate_sentiment_score(event)
        assert result == 0.0


class TestCalculateLogicalConsistency:
    """Tests for calculate_logical_consistency function"""

    def test_empty_list(self):
        """Test with empty list returns 0.0"""
        result = calculate_logical_consistency([])
        assert result == 0.0

    def test_single_event(self):
        """Test with single event returns 1.0 (perfectly consistent)"""
        event = Event(
            id=str(uuid4()),
            news_id=str(uuid4()),
            stock_code="000001.SZ",
            trigger="发布",
            subject="公司",
            object="财报",
            event_type=EventType.PERFORMANCE,
            intensity=0.8,
            sentiment=EventSentiment.POSITIVE,
            timestamp=datetime.utcnow()
        )
        result = calculate_logical_consistency([event])
        assert result == 1.0

    def test_consistent_positive_events(self):
        """Test with multiple positive events - high consistency"""
        events = [
            Event(
                id=str(uuid4()),
                news_id=str(uuid4()),
                stock_code="000001.SZ",
                trigger="发布",
                subject="公司",
                object="财报",
                event_type=EventType.PERFORMANCE,
                intensity=0.8,
                sentiment=EventSentiment.POSITIVE,
                timestamp=datetime.utcnow() - timedelta(days=i)
            )
            for i in range(5)
        ]
        result = calculate_logical_consistency(events)
        assert result > 0.8  # Should be highly consistent

    def test_conflicting_events(self):
        """Test with conflicting events - low consistency"""
        events = [
            Event(
                id=str(uuid4()),
                news_id=str(uuid4()),
                stock_code="000001.SZ",
                trigger="利好",
                subject="公司",
                object="业绩",
                event_type=EventType.PERFORMANCE,
                intensity=0.9,
                sentiment=EventSentiment.POSITIVE,
                timestamp=datetime.utcnow()
            ),
            Event(
                id=str(uuid4()),
                news_id=str(uuid4()),
                stock_code="000001.SZ",
                trigger="违规",
                subject="公司",
                object="处罚",
                event_type=EventType.GOVERNANCE,
                intensity=0.9,
                sentiment=EventSentiment.NEGATIVE,
                timestamp=datetime.utcnow() - timedelta(days=1)
            ),
        ]
        result = calculate_logical_consistency(events)
        assert result < 0.5  # Should have low consistency due to conflict


class TestCalculateWindowFeatures:
    """Tests for calculate_window_features function"""

    def test_empty_events(self):
        """Test with empty events returns zeroed features"""
        result = calculate_window_features([])
        assert result.net_expectation == 0.0
        assert result.dominant_sentiment == "neutral"
        assert result.sentiment_score == 0.0
        assert result.logical_consistency == 0.0
        assert result.event_count == 0

    def test_bullish_dominant_sentiment(self):
        """Test dominant sentiment is bullish with positive events"""
        events = [
            Event(
                id=str(uuid4()),
                news_id=str(uuid4()),
                stock_code="000001.SZ",
                trigger="发布",
                subject="公司",
                object="财报",
                event_type=EventType.PERFORMANCE,
                intensity=0.9,
                sentiment=EventSentiment.POSITIVE,
                timestamp=datetime.utcnow() - timedelta(days=i)
            )
            for i in range(3)
        ]
        result = calculate_window_features(events)
        assert result.dominant_sentiment == "bullish"
        assert result.sentiment_score > 0
        assert result.bullish_count == 3

    def test_bearish_dominant_sentiment(self):
        """Test dominant sentiment is bearish with negative events"""
        events = [
            Event(
                id=str(uuid4()),
                news_id=str(uuid4()),
                stock_code="000001.SZ",
                trigger="违规",
                subject="公司",
                object="处罚",
                event_type=EventType.GOVERNANCE,
                intensity=0.8,
                sentiment=EventSentiment.NEGATIVE,
                timestamp=datetime.utcnow() - timedelta(days=i)
            )
            for i in range(3)
        ]
        result = calculate_window_features(events)
        assert result.dominant_sentiment == "bearish"
        assert result.sentiment_score < 0
        assert result.bearish_count == 3

    def test_neutral_dominant_sentiment(self):
        """Test dominant sentiment is neutral with mixed/neutral events"""
        now = datetime.utcnow()
        events = [
            Event(
                id=str(uuid4()),
                news_id=str(uuid4()),
                stock_code="000001.SZ",
                trigger="公告",
                subject="公司",
                object=None,
                event_type=EventType.POLICY,
                intensity=0.3,
                sentiment=EventSentiment.NEUTRAL,
                timestamp=now - timedelta(days=i)
            )
            for i in range(3)
        ]
        result = calculate_window_features(events)
        assert result.dominant_sentiment == "neutral"
        assert result.neutral_count == 3

    def test_event_counts(self):
        """Test event counts are correct"""
        now = datetime.utcnow()
        events = [
            Event(
                id=str(uuid4()),
                news_id=str(uuid4()),
                stock_code="000001.SZ",
                trigger="利好" + str(i),
                subject="公司",
                object="事件",
                event_type=EventType.BUSINESS,
                intensity=0.5 + i * 0.1,
                sentiment=[EventSentiment.POSITIVE, EventSentiment.NEGATIVE, EventSentiment.NEUTRAL][i % 3],
                timestamp=now - timedelta(days=i)
            )
            for i in range(6)
        ]
        result = calculate_window_features(events)
        assert result.event_count == 6
        assert result.bullish_count + result.bearish_count + result.neutral_count == 6


class TestCalculateMultiWindowFeatures:
    """Tests for calculate_multi_window_features function"""

    def test_multiple_windows(self):
        """Test calculation with multiple window sizes"""
        now = datetime.utcnow()
        # Create events spread across 30 days
        events = [
            Event(
                id=str(uuid4()),
                news_id=str(uuid4()),
                stock_code="000001.SZ",
                trigger="事件" + str(i),
                subject="公司",
                object=None,
                event_type=EventType.BUSINESS,
                intensity=0.5,
                sentiment=EventSentiment.POSITIVE,
                timestamp=now - timedelta(days=i * 5)
            )
            for i in range(7)
        ]

        result = calculate_multi_window_features(events, windows=[7, 15, 30])

        assert "7d" in result
        assert "15d" in result
        assert "30d" in result

        # 7d window should have fewer events
        assert result["7d"].event_count <= result["30d"].event_count


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
