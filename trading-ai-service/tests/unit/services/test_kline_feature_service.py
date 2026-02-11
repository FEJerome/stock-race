"""Unit tests for K-line feature extraction service."""
import pytest
from datetime import datetime, timedelta
from ai_service.services.kline_feature_service import (
    KlineFeatureService, KlineData, KlinePattern, TrendDirection
)

@pytest.fixture
def kline_service():
    return KlineFeatureService()

@pytest.fixture
def sample_klines():
    base_time = datetime.now()
    return [
        KlineData(timestamp=base_time - timedelta(minutes=5), open=100.0, high=105.0, low=99.0, close=104.0, volume=10000),
        KlineData(timestamp=base_time - timedelta(minutes=4), open=104.0, high=106.0, low=103.0, close=105.0, volume=12000),
        KlineData(timestamp=base_time - timedelta(minutes=3), open=105.0, high=105.5, low=100.0, close=101.0, volume=15000),
        KlineData(timestamp=base_time - timedelta(minutes=2), open=101.0, high=102.0, low=98.0, close=99.0, volume=8000),
        KlineData(timestamp=base_time - timedelta(minutes=1), open=99.0, high=103.0, low=98.5, close=102.0, volume=11000),
    ]

class TestKlineFeatureService:
    def test_init(self, kline_service):
        assert kline_service is not None

    def test_detect_patterns(self, kline_service, sample_klines):
        patterns = kline_service.detect_patterns(sample_klines)
        assert isinstance(patterns, list)

    def test_analyze_trend(self, kline_service, sample_klines):
        trend = kline_service.analyze_trend(sample_klines)
        assert trend.direction in [TrendDirection.UP, TrendDirection.DOWN, TrendDirection.SIDEWAYS]
        assert 0 <= trend.strength <= 1

    def test_find_support_resistance(self, kline_service, sample_klines):
        levels = kline_service.find_support_resistance(sample_klines)
        assert isinstance(levels, list)

    def test_calculate_volatility(self, kline_service, sample_klines):
        volatility = kline_service.calculate_volatility(sample_klines)
        assert volatility >= 0

    def test_generate_natural_language_description(self, kline_service, sample_klines):
        description = kline_service.generate_natural_language_description(sample_klines)
        assert isinstance(description, str)
        assert len(description) > 0

    def test_extract_features(self, kline_service, sample_klines):
        features = kline_service.extract_features(sample_klines)
        assert isinstance(features, dict)
        assert "patterns" in features
        assert "trend" in features
