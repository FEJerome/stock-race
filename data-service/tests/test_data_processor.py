"""
Tests for DataProcessor.
"""

import pytest
import statistics
from datetime import datetime, timedelta
from unittest.mock import Mock

from src.data_service.processors.data_processor import DataProcessor
from src.data_service.models.stock import StockQuote, StockData


class TestDataProcessor:
    """Tests for DataProcessor class."""

    @pytest.fixture
    def processor(self):
        """Create a DataProcessor instance."""
        return DataProcessor()

    @pytest.fixture
    def sample_quote_dict(self):
        """Create a sample quote dictionary."""
        return {
            "symbol": "000001.SZ",
            "name": "平安银行",
            "price": 16.85,
            "prev_close": 16.80,
            "open": 16.82,
            "high": 16.90,
            "low": 16.75,
            "volume": 1000000,
            "amount": 16850000.0,
            "bid_price": 16.84,
            "ask_price": 16.86,
            "bid_volume": 50000,
            "ask_volume": 60000,
            "timestamp": datetime.now()
        }

    @pytest.fixture
    def sample_quote(self, sample_quote_dict):
        """Create a sample StockQuote object."""
        return StockQuote(**sample_quote_dict)

    @pytest.fixture
    def sample_history_data(self):
        """Create sample historical data."""
        return [
            {
                "symbol": "000001.SZ",
                "timestamp": datetime.now() - timedelta(days=2),
                "open": 16.70,
                "high": 16.85,
                "low": 16.65,
                "close": 16.80,
                "volume": 950000,
                "amount": 15960000.0
            },
            {
                "symbol": "000001.SZ",
                "timestamp": datetime.now() - timedelta(days=1),
                "open": 16.82,
                "high": 16.95,
                "low": 16.78,
                "close": 16.85,
                "volume": 1050000,
                "amount": 17692500.0
            }
        ]

    def test_initialization(self, processor):
        """Test DataProcessor initialization."""
        assert processor.validation_rules is not None
        assert "price_range" in processor.validation_rules
        assert "volume_min" in processor.validation_rules
        assert "change_percent_max" in processor.validation_rules
        assert "timestamp_max_diff" in processor.validation_rules
        assert "price_consistency_threshold" in processor.validation_rules
        assert "volume_consistency_threshold" in processor.validation_rules
        assert "min_data_points_for_validation" in processor.validation_rules
        assert "z_score_threshold" in processor.validation_rules

    def test_clean_stock_quote_valid(self, processor, sample_quote_dict):
        """Test cleaning valid stock quote."""
        cleaned_quote = processor.clean_stock_quote(sample_quote_dict)

        assert isinstance(cleaned_quote, StockQuote)
        assert cleaned_quote.symbol == "000001.SZ"
        assert cleaned_quote.price == 16.85
        assert cleaned_quote.prev_close == 16.80
        assert cleaned_quote.open == 16.82
        assert cleaned_quote.high == 16.90
        assert cleaned_quote.low == 16.75
        assert cleaned_quote.volume == 1000000
        assert cleaned_quote.amount == 16850000.0
        assert cleaned_quote.change == 0.05  # 16.85 - 16.80
        assert pytest.approx(cleaned_quote.change_percent) == 0.2976  # (0.05 / 16.80) * 100

    def test_clean_stock_quote_missing_fields(self, processor):
        """Test cleaning quote with missing fields."""
        incomplete_quote = {
            "symbol": "000001.SZ",
            "price": 16.85,
            "timestamp": datetime.now()
        }

        cleaned_quote = processor.clean_stock_quote(incomplete_quote)

        assert cleaned_quote.symbol == "000001.SZ"
        assert cleaned_quote.price == 16.85
        assert cleaned_quote.prev_close == 16.85  # Should default to price
        assert cleaned_quote.open == 16.85  # Should default to price
        assert cleaned_quote.high >= cleaned_quote.price
        assert cleaned_quote.low <= cleaned_quote.price
        assert cleaned_quote.change == 0.0
        assert cleaned_quote.change_percent == 0.0

    def test_clean_stock_quote_invalid_price(self, processor):
        """Test cleaning quote with invalid price."""
        invalid_quote = {
            "symbol": "000001.SZ",
            "price": -10.0,  # Invalid negative price
            "prev_close": 16.80,
            "open": 16.82,
            "timestamp": datetime.now()
        }

        cleaned_quote = processor.clean_stock_quote(invalid_quote)

        # Should use prev_close when price is invalid
        assert cleaned_quote.price == 16.80
        assert cleaned_quote.prev_close == 16.80

    def test_clean_stock_quote_string_timestamp(self, processor):
        """Test cleaning quote with string timestamp."""
        quote_with_string_time = {
            "symbol": "000001.SZ",
            "price": 16.85,
            "timestamp": "2024-01-01T10:30:00"
        }

        cleaned_quote = processor.clean_stock_quote(quote_with_string_time)

        assert isinstance(cleaned_quote.timestamp, datetime)
        assert cleaned_quote.timestamp.year == 2024
        assert cleaned_quote.timestamp.month == 1
        assert cleaned_quote.timestamp.day == 1

    def test_clean_stock_data(self, processor, sample_history_data):
        """Test cleaning historical data."""
        cleaned_data = processor.clean_stock_data(sample_history_data)

        assert len(cleaned_data) == 2
        assert all(isinstance(item, StockData) for item in cleaned_data)
        assert cleaned_data[0].symbol == "000001.SZ"
        assert cleaned_data[0].close == 16.80
        assert cleaned_data[1].close == 16.85

        # Should be sorted by timestamp
        assert cleaned_data[0].timestamp < cleaned_data[1].timestamp

    def test_clean_stock_data_invalid_points(self, processor):
        """Test cleaning historical data with invalid points."""
        mixed_data = [
            {
                "symbol": "000001.SZ",
                "timestamp": datetime.now() - timedelta(days=2),
                "open": 16.70,
                "high": 16.85,
                "low": 16.65,
                "close": 16.80,
                "volume": 950000
            },
            {
                "symbol": "000001.SZ",
                "timestamp": "invalid",  # Invalid timestamp
                "open": 16.82,
                "high": 16.95,
                "low": 16.78,
                "close": 16.85,
                "volume": 1050000
            },
            {
                "symbol": "000001.SZ",
                "timestamp": datetime.now() - timedelta(days=1),
                "open": 0.0,  # Invalid price
                "high": 16.95,
                "low": 16.78,
                "close": 16.85,
                "volume": 1050000
            }
        ]

        cleaned_data = processor.clean_stock_data(mixed_data)

        # Should only keep the valid data point
        assert len(cleaned_data) == 1
        assert cleaned_data[0].close == 16.80

    def test_merge_quotes_from_sources(self, processor):
        """Test merging quotes from multiple sources."""
        quotes_by_source = {
            "sina": {
                "symbol": "000001.SZ",
                "price": 16.85,
                "volume": 1000000,
                "timestamp": datetime.now() - timedelta(seconds=10)
            },
            "tencent": {
                "symbol": "000001.SZ",
                "price": 16.86,
                "volume": 1050000,
                "timestamp": datetime.now() - timedelta(seconds=5)
            },
            "eastmoney": {
                "symbol": "000001.SZ",
                "price": 16.84,
                "volume": 980000,
                "timestamp": datetime.now()
            }
        }

        merged_quote = processor.merge_quotes_from_sources(quotes_by_source)

        assert isinstance(merged_quote, StockQuote)
        assert merged_quote.symbol == "000001.SZ"
        assert merged_quote.price == 16.85  # Median of [16.84, 16.85, 16.86]
        assert merged_quote.volume == 1000000  # Median of volumes
        # Timestamp should be the latest
        assert merged_quote.timestamp == quotes_by_source["eastmoney"]["timestamp"]

    def test_merge_quotes_single_source(self, processor):
        """Test merging quotes with single source."""
        quotes_by_source = {
            "sina": {
                "symbol": "000001.SZ",
                "price": 16.85,
                "prev_close": 16.80,
                "timestamp": datetime.now()
            }
        }

        merged_quote = processor.merge_quotes_from_sources(quotes_by_source)

        assert merged_quote.price == 16.85
        assert merged_quote.change == 0.05  # 16.85 - 16.80

    def test_detect_anomalies_normal(self, processor, sample_quote):
        """Test anomaly detection with normal data."""
        historical_data = [
            StockData(
                symbol="000001.SZ",
                timestamp=datetime.now() - timedelta(days=i),
                open=16.0 + i * 0.1,
                high=16.5 + i * 0.1,
                low=15.5 + i * 0.1,
                close=16.0 + i * 0.1,
                volume=1000000
            )
            for i in range(10)
        ]

        anomalies = processor.detect_anomalies(sample_quote, historical_data)

        # Normal data should have no anomalies
        assert len(anomalies) == 0

    def test_detect_anomalies_extreme_price(self, processor):
        """Test anomaly detection with extreme price."""
        quote = StockQuote(
            symbol="000001.SZ",
            price=100000.0,  # Extremely high price
            prev_close=16.80,
            open=16.82,
            high=16.90,
            low=16.75,
            volume=1000000,
            amount=16850000.0,
            timestamp=datetime.now()
        )

        anomalies = processor.detect_anomalies(quote, [])

        assert len(anomalies) > 0
        assert "outside valid range" in anomalies[0]

    def test_detect_anomalies_stale_data(self, processor):
        """Test anomaly detection with stale data."""
        stale_quote = StockQuote(
            symbol="000001.SZ",
            price=16.85,
            prev_close=16.80,
            open=16.82,
            high=16.90,
            low=16.75,
            volume=1000000,
            amount=16850000.0,
            timestamp=datetime.now() - timedelta(hours=2)  # 2 hours old
        )

        anomalies = processor.detect_anomalies(stale_quote, [])

        assert len(anomalies) > 0
        assert "seconds old" in anomalies[0]

    def test_validate_quote_consistency(self, processor, sample_quote):
        """Test quote consistency validation."""
        recent_quotes = [
            StockQuote(
                symbol="000001.SZ",
                price=16.80 + i * 0.01,
                prev_close=16.80,
                open=16.82,
                high=16.90,
                low=16.75,
                volume=1000000 + i * 10000,
                amount=16800000.0 + i * 100000,
                timestamp=datetime.now() - timedelta(minutes=10 - i)
            )
            for i in range(5)
        ]

        result = processor.validate_quote_consistency(sample_quote, recent_quotes)

        assert "is_consistent" in result
        assert "warnings" in result
        assert "errors" in result
        assert "metrics" in result

        # Normal data should be consistent
        assert result["is_consistent"] is True
        assert len(result["errors"]) == 0

    def test_validate_quote_consistency_outlier(self, processor):
        """Test quote consistency validation with outlier."""
        recent_quotes = [
            StockQuote(
                symbol="000001.SZ",
                price=16.80,
                prev_close=16.80,
                open=16.82,
                high=16.90,
                low=16.75,
                volume=1000000,
                amount=16800000.0,
                timestamp=datetime.now() - timedelta(minutes=10 - i)
            )
            for i in range(5)
        ]

        # Create an outlier quote
        outlier_quote = StockQuote(
            symbol="000001.SZ",
            price=50.0,  # Extreme outlier
            prev_close=16.80,
            open=16.82,
            high=16.90,
            low=16.75,
            volume=1000000,
            amount=16850000.0,
            timestamp=datetime.now()
        )

        result = processor.validate_quote_consistency(outlier_quote, recent_quotes)

        assert result["is_consistent"] is False
        assert len(result["errors"]) > 0
        assert "z-score" in result["errors"][0]

    def test_cross_validate_sources(self, processor):
        """Test cross-validation of multiple sources."""
        quotes_by_source = {
            "sina": {
                "symbol": "000001.SZ",
                "price": 16.85,
                "volume": 1000000,
                "timestamp": datetime.now()
            },
            "tencent": {
                "symbol": "000001.SZ",
                "price": 16.86,
                "volume": 1050000,
                "timestamp": datetime.now()
            },
            "eastmoney": {
                "symbol": "000001.SZ",
                "price": 16.84,
                "volume": 980000,
                "timestamp": datetime.now()
            }
        }

        result = processor.cross_validate_sources(quotes_by_source)

        assert result["is_consistent"] is True
        assert result["source_agreement"] == 1.0  # All sources valid
        assert result["consensus_price"] == 16.85  # Median price
        assert result["consensus_volume"] == 1000000  # Median volume
        assert len(result["source_details"]) == 3

    def test_cross_validate_sources_discrepancy(self, processor):
        """Test cross-validation with source discrepancies."""
        quotes_by_source = {
            "sina": {
                "symbol": "000001.SZ",
                "price": 16.85,
                "volume": 1000000
            },
            "tencent": {
                "symbol": "000001.SZ",
                "price": 20.00,  # Large discrepancy
                "volume": 1050000
            },
            "eastmoney": {
                "symbol": "000001.SZ",
                "price": 16.84,
                "volume": 980000
            }
        }

        result = processor.cross_validate_sources(quotes_by_source)

        # Large price discrepancy should be detected
        assert result["is_consistent"] is False
        assert len(result["discrepancies"]) > 0
        assert "coefficient of variation" in result["discrepancies"][0]

    def test_clean_and_validate_batch(self, processor):
        """Test batch cleaning and validation."""
        batch_quotes = {
            "000001.SZ": {
                "symbol": "000001.SZ",
                "price": 16.85,
                "prev_close": 16.80,
                "volume": 1000000,
                "timestamp": datetime.now()
            },
            "600036.SH": {
                "symbol": "600036.SH",
                "price": 42.50,
                "prev_close": 42.30,
                "volume": 500000,
                "timestamp": datetime.now()
            }
        }

        cleaned_quotes = processor.clean_and_validate_batch(batch_quotes)

        assert len(cleaned_quotes) == 2
        assert "000001.SZ" in cleaned_quotes
        assert "600036.SH" in cleaned_quotes
        assert isinstance(cleaned_quotes["000001.SZ"], StockQuote)
        assert isinstance(cleaned_quotes["600036.SH"], StockQuote)

    def test_calculate_technical_indicators(self, processor):
        """Test technical indicators calculation."""
        # Create sample historical data
        historical_data = []
        base_price = 100.0
        for i in range(50):  # Need enough data for indicators
            price = base_price + i * 0.5 + (i % 3 - 1) * 0.2  # Some variation
            historical_data.append(
                StockData(
                    symbol="000001.SZ",
                    timestamp=datetime.now() - timedelta(days=50 - i),
                    open=price - 0.5,
                    high=price + 0.5,
                    low=price - 0.5,
                    close=price,
                    volume=1000000 + i * 10000
                )
            )

        indicators = processor.calculate_technical_indicators(
            historical_data,
            indicators=["ma", "rsi", "bollinger"]
        )

        assert "ma5" in indicators
        assert "ma10" in indicators
        assert "ma20" in indicators
        assert "rsi" in indicators
        assert "bollinger_upper" in indicators
        assert "bollinger_middle" in indicators
        assert "bollinger_lower" in indicators

        # Check that indicators have values
        assert len(indicators["ma20"].values) > 0
        assert indicators["ma20"].name == "MA20"
        assert indicators["ma20"].parameters == {"period": 20}

    def test_calculate_technical_indicators_insufficient_data(self, processor):
        """Test technical indicators with insufficient data."""
        # Create minimal historical data
        historical_data = [
            StockData(
                symbol="000001.SZ",
                timestamp=datetime.now() - timedelta(days=5 - i),
                open=16.0,
                high=16.5,
                low=15.5,
                close=16.0,
                volume=1000000
            )
            for i in range(5)  # Only 5 data points
        ]

        indicators = processor.calculate_technical_indicators(
            historical_data,
            indicators=["ma", "rsi"]
        )

        # With only 5 data points, only MA5 should be calculated
        assert "ma5" in indicators
        assert "ma10" not in indicators  # Need at least 10 data points
        assert "rsi" not in indicators  # Need at least 14 data points

    def test__validate_quote_valid(self, processor, sample_quote):
        """Test internal quote validation with valid data."""
        # Should not raise any exception
        processor._validate_quote(sample_quote)

    def test__validate_quote_invalid_price(self, processor):
        """Test internal quote validation with invalid price."""
        invalid_quote = StockQuote(
            symbol="000001.SZ",
            price=100000.0,  # Outside valid range
            prev_close=16.80,
            open=16.82,
            high=16.90,
            low=16.75,
            volume=1000000,
            amount=16850000.0,
            timestamp=datetime.now()
        )

        with pytest.raises(ValueError, match="outside valid range"):
            processor._validate_quote(invalid_quote)

    def test__validate_quote_invalid_high_low(self, processor):
        """Test internal quote validation with invalid high-low."""
        invalid_quote = StockQuote(
            symbol="000001.SZ",
            price=16.85,
            prev_close=16.80,
            open=16.82,
            high=16.75,  # High is less than low
            low=16.90,   # Low is greater than high
            volume=1000000,
            amount=16850000.0,
            timestamp=datetime.now()
        )

        with pytest.raises(ValueError, match="High.*is less than low"):
            processor._validate_quote(invalid_quote)

    def test__validate_quote_price_outside_range(self, processor):
        """Test internal quote validation with price outside high-low range."""
        invalid_quote = StockQuote(
            symbol="000001.SZ",
            price=20.0,  # Outside high-low range
            prev_close=16.80,
            open=16.82,
            high=16.90,
            low=16.75,
            volume=1000000,
            amount=16850000.0,
            timestamp=datetime.now()
        )

        with pytest.raises(ValueError, match="not within high-low range"):
            processor._validate_quote(invalid_quote)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])