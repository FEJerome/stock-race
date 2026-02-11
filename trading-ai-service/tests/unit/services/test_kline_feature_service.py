"""
Unit tests for K-line feature extraction service.
"""

import pytest
from datetime import datetime, timedelta
from typing import List, Dict, Any

from ai_service.services.kline_feature_service import (
    KlineFeatureService,
    KlineData,
    KlinePattern,
    TrendDirection,
    SupportResistanceLevel,
)


@pytest.fixture
def kline_service():
    """Create a K-line feature service instance."""
    return KlineFeatureService()


@pytest.fixture
def sample_klines() -> List[KlineData]:
    """Create sample K-line data for testing."""
    base_time = datetime.now()
    return [
        KlineData(
            timestamp=base_time - timedelta(minutes=5),
            open=100.0,
            high=105.0,
            low=99.0,
            close=104.0,
            volume=10000,
        ),
        KlineData(
            timestamp=base_time - timedelta(minutes=4),
            open=104.0,
            high=106.0,
            low=103.0,
            close=105.0,
            volume=12000,
        ),
        KlineData(
            timestamp=base_time - timedelta(minutes=3),
            open=105.0,
            high=105.5,
            low=100.0,
            close=101.0,
            volume=15000,
        ),
        KlineData(
            timestamp=base_time - timedelta(minutes=2),
            open=101.0,
            high=102.0,
            low=98.0,
            close=99.0,
            volume=8000,
        ),
        KlineData(
            timestamp=base_time - timedelta(minutes=1),
            open=99.0,
            high=103.0,
            low=98.5,
            close=102.0,
            volume=11000,
        ),
    ]


@pytest.fixture
def hammer_kline() -> KlineData:
    """Create a hammer pattern K-line.
    Hammer: small body at top (10-30% range), long lower shadow (>50%), little upper shadow (<10%)
    Total range = 10, body = 2 (20%), lower shadow = 8 (80%), upper shadow = 0 (0%)
    """
    return KlineData(
        timestamp=datetime.now(),
        open=100.0,
        high=102.0,  # No upper shadow (high = max(open, close))
        low=92.0,    # Long lower shadow (8 out of 10 = 80%)
        close=102.0, # Body = 2, ratio = 2/10 = 20% (between 0.1 and 0.3)
        volume=10000,
    )


@pytest.fixture
def doji_kline() -> KlineData:
    """Create a doji pattern K-line."""
    return KlineData(
        timestamp=datetime.now(),
        open=100.0,
        high=101.0,
        low=99.0,
        close=100.1,
        volume=5000,
    )


class TestKlineFeatureService:
    """Test suite for K-line feature service."""

    def test_init(self, kline_service):
        """Test service initialization."""
        assert kline_service is not None

    def test_detect_hammer_pattern(self, kline_service, hammer_kline):
        """Test hammer pattern detection."""
        pattern = kline_service._detect_single_candle_pattern(hammer_kline)
        assert pattern == KlinePattern.HAMMER

    def test_detect_doji_pattern(self, kline_service, doji_kline):
        """Test doji pattern detection."""
        pattern = kline_service._detect_single_candle_pattern(doji_kline)
        assert pattern == KlinePattern.DOJI

    def test_detect_bullish_engulfing(self, kline_service):
        """Test bullish engulfing pattern detection."""
        prev = KlineData(
            timestamp=datetime.now() - timedelta(minutes=2),
            open=105.0,
            high=106.0,
            low=104.0,
            close=104.5,
            volume=5000,
        )
        curr = KlineData(
            timestamp=datetime.now() - timedelta(minutes=1),
            open=104.0,
            high=107.0,
            low=103.0,
            close=106.5,
            volume=10000,
        )
        pattern = kline_service._detect_two_candle_pattern(prev, curr)
        assert pattern == KlinePattern.ENGULFING_BULLISH

    def test_detect_bearish_engulfing(self, kline_service):
        """Test bearish engulfing pattern detection."""
        prev = KlineData(
            timestamp=datetime.now() - timedelta(minutes=2),
            open=104.0,
            high=105.0,
            low=103.0,
            close=104.5,
            volume=5000,
        )
        curr = KlineData(
            timestamp=datetime.now() - timedelta(minutes=1),
            open=105.0,
            high=106.0,
            low=102.0,
            close=102.5,
            volume=10000,
        )
        pattern = kline_service._detect_two_candle_pattern(prev, curr)
        assert pattern == KlinePattern.ENGULFING_BEARISH

    def test_analyze_trend_up(self, kline_service, sample_klines):
        """Test uptrend detection."""
        # Modify data to show clear uptrend
        for i, kline in enumerate(sample_klines):
            kline.close = 100.0 + i * 2  # Increasing prices

        trend = kline_service.analyze_trend(sample_klines)
        assert trend.direction == TrendDirection.UP
        assert trend.strength > 0

    def test_analyze_trend_down(self, kline_service, sample_klines):
        """Test downtrend detection."""
        # Modify data to show clear downtrend
        for i, kline in enumerate(sample_klines):
            kline.close = 110.0 - i * 3  # Decreasing prices

        trend = kline_service.analyze_trend(sample_klines)
        assert trend.direction == TrendDirection.DOWN
        assert trend.strength > 0

    def test_analyze_trend_sideways(self, kline_service, sample_klines):
        """Test sideways trend detection."""
        # Modify data to show sideways movement
        for kline in sample_klines:
            kline.close = 100.0 + (kline.close - 100.0) * 0.1  # Small variations

        trend = kline_service.analyze_trend(sample_klines)
        assert trend.direction == TrendDirection.SIDEWAYS

    def test_find_support_resistance(self, kline_service):
        """Test support and resistance level detection."""
        # Create klines with clear local maxima/minima
        base_time = datetime.now()
        klines = [
            KlineData(timestamp=base_time - timedelta(minutes=6), open=100, high=105, low=99, close=104, volume=1000),
            KlineData(timestamp=base_time - timedelta(minutes=5), open=104, high=106, low=103, close=105, volume=1000),
            KlineData(timestamp=base_time - timedelta(minutes=4), open=105, high=107, low=104, close=106, volume=1000),  # Local max
            KlineData(timestamp=base_time - timedelta(minutes=3), open=106, high=106, low=100, close=101, volume=1000),
            KlineData(timestamp=base_time - timedelta(minutes=2), open=101, high=102, low=97, close=98, volume=1000),   # Local min
            KlineData(timestamp=base_time - timedelta(minutes=1), open=98, high=103, low=97, close=102, volume=1000),
        ]
        levels = kline_service.find_support_resistance(klines)

        assert isinstance(levels, list)
        for level in levels:
            assert isinstance(level, SupportResistanceLevel)
            assert level.price > 0
            assert level.strength > 0
            assert level.type in ["support", "resistance"]

    def test_calculate_volatility(self, kline_service, sample_klines):
        """Test volatility calculation."""
        volatility = kline_service.calculate_volatility(sample_klines)

        assert volatility >= 0
        assert isinstance(volatility, float)

    def test_generate_natural_language_description(self, kline_service, sample_klines):
        """Test natural language description generation."""
        description = kline_service.generate_natural_language_description(sample_klines)

        assert isinstance(description, str)
        assert len(description) > 0
        # Should contain trend information
        assert any(word in description.lower() for word in ["上涨", "下跌", "震荡", "up", "down", "sideways"])

    def test_extract_features(self, kline_service, sample_klines):
        """Test comprehensive feature extraction."""
        features = kline_service.extract_features(sample_klines)

        assert isinstance(features, dict)
        assert "patterns" in features
        assert "trend" in features
        assert "support_resistance" in features
        assert "volatility" in features
        assert "natural_language_description" in features

    def test_empty_klines(self, kline_service):
        """Test handling of empty K-line data."""
        with pytest.raises(ValueError, match="empty"):
            kline_service.extract_features([])

    def test_insufficient_data_for_pattern(self, kline_service):
        """Test handling of insufficient data for pattern detection."""
        single_kline = [
            KlineData(
                timestamp=datetime.now(),
                open=100.0,
                high=105.0,
                low=99.0,
                close=104.0,
                volume=10000,
            )
        ]

        # Should not raise error, but return limited results
        features = kline_service.extract_features(single_kline)
        assert isinstance(features, dict)

    def test_calculate_price_change(self, kline_service, sample_klines):
        """Test price change calculation."""
        change = kline_service.calculate_price_change(sample_klines)

        assert isinstance(change, dict)
        assert "absolute_change" in change
        assert "percentage_change" in change
        assert "start_price" in change
        assert "end_price" in change

    def test_detect_volume_anomaly(self, kline_service, sample_klines):
        """Test volume anomaly detection."""
        # Add a volume spike
        sample_klines[-1].volume = 50000  # Much higher than average

        volume_analysis = kline_service.analyze_volume(sample_klines)

        assert isinstance(volume_analysis, dict)
        assert "volume_spikes" in volume_analysis
        assert len(volume_analysis["volume_spikes"]) > 0

    def test_get_trading_signals(self, kline_service, sample_klines):
        """Test trading signal generation."""
        signals = kline_service.get_trading_signals(sample_klines)

        assert isinstance(signals, list)
        for signal in signals:
            assert "type" in signal
            assert "confidence" in signal
            assert "reason" in signal
