"""
Tests for data service.
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch

from src.data_service.models.stock import StockQuote, StockData, StockSymbol
from src.data_service.processors.data_processor import DataProcessor
from src.data_service.services.data_service import DataService
from src.data_service.collectors.base import DataSourceError


@pytest.fixture
def data_processor():
    """Create data processor fixture."""
    return DataProcessor()


@pytest.fixture
def data_service():
    """Create data service fixture."""
    return DataService()


@pytest.fixture
def sample_quote_data():
    """Create sample quote data."""
    return {
        "symbol": "000001.SZ",
        "price": 16.85,
        "open": 16.80,
        "high": 16.90,
        "low": 16.75,
        "prev_close": 16.78,
        "change": 0.07,
        "change_percent": 0.42,
        "volume": 1000000,
        "amount": 16850000.0,
        "bid_price": 16.84,
        "ask_price": 16.86,
        "bid_volume": 50000,
        "ask_volume": 60000,
        "timestamp": datetime.now()
    }


@pytest.fixture
def sample_history_data():
    """Create sample history data."""
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
            "close": 16.90,
            "volume": 1050000,
            "amount": 17745000.0
        }
    ]


class TestDataProcessor:
    """Test data processor."""

    def test_clean_stock_quote_valid(self, data_processor, sample_quote_data):
        """Test cleaning valid stock quote."""
        cleaned_quote = data_processor.clean_stock_quote(sample_quote_data)

        assert isinstance(cleaned_quote, StockQuote)
        assert cleaned_quote.symbol == "000001.SZ"
        assert cleaned_quote.price == 16.85
        assert cleaned_quote.change_percent == 0.42

    def test_clean_stock_quote_missing_fields(self, data_processor):
        """Test cleaning quote with missing fields."""
        raw_quote = {
            "symbol": "000001.SZ",
            "price": 16.85,
            "timestamp": datetime.now()
        }

        cleaned_quote = data_processor.clean_stock_quote(raw_quote)

        assert cleaned_quote.symbol == "000001.SZ"
        assert cleaned_quote.price == 16.85
        assert cleaned_quote.open == 16.85  # Should default to price
        assert cleaned_quote.high >= cleaned_quote.price
        assert cleaned_quote.low <= cleaned_quote.price

    def test_clean_stock_quote_invalid_price(self, data_processor):
        """Test cleaning quote with invalid price."""
        raw_quote = {
            "symbol": "000001.SZ",
            "price": -10.0,  # Invalid price
            "timestamp": datetime.now()
        }

        with pytest.raises(ValueError):
            data_processor.clean_stock_quote(raw_quote)

    def test_clean_stock_data(self, data_processor, sample_history_data):
        """Test cleaning historical data."""
        cleaned_data = data_processor.clean_stock_data(sample_history_data)

        assert len(cleaned_data) == 2
        assert all(isinstance(d, StockData) for d in cleaned_data)
        assert cleaned_data[0].symbol == "000001.SZ"
        assert cleaned_data[0].close == 16.80

    def test_clean_stock_data_invalid(self, data_processor):
        """Test cleaning invalid historical data."""
        invalid_data = [
            {
                "symbol": "000001.SZ",
                "timestamp": datetime.now(),
                "open": 0.0,  # Invalid price
                "high": 16.85,
                "low": 16.65,
                "close": 16.80,
                "volume": 950000
            }
        ]

        cleaned_data = data_processor.clean_stock_data(invalid_data)
        assert len(cleaned_data) == 0  # Should skip invalid data

    def test_detect_anomalies(self, data_processor, sample_quote_data):
        """Test anomaly detection."""
        quote = data_processor.clean_stock_quote(sample_quote_data)
        history = data_processor.clean_stock_data([
            {
                "symbol": "000001.SZ",
                "timestamp": datetime.now() - timedelta(hours=1),
                "open": 16.80,
                "high": 16.85,
                "low": 16.75,
                "close": 16.82,
                "volume": 1000000
            }
        ])

        anomalies = data_processor.detect_anomalies(quote, history)
        assert isinstance(anomalies, list)

    def test_calculate_technical_indicators(self, data_processor, sample_history_data):
        """Test technical indicator calculation."""
        cleaned_data = data_processor.clean_stock_data(sample_history_data * 10)  # Need more data

        indicators = data_processor.calculate_technical_indicators(
            cleaned_data,
            indicators=["ma", "rsi"]
        )

        assert "ma5" in indicators or "rsi" in indicators


class TestDataService:
    """Test data service."""

    @pytest.mark.asyncio
    async def test_initialize(self, data_service):
        """Test data service initialization."""
        # Mock the dependencies to avoid actual connections
        with patch.object(data_service.database_storage, 'connect', new_callable=AsyncMock):
            with patch.object(data_service.redis_cache, 'connect', new_callable=AsyncMock):
                await data_service.initialize()
                assert data_service.is_initialized

    @pytest.mark.asyncio
    async def test_get_stock_quote_cache_hit(self, data_service):
        """Test getting stock quote from cache."""
        # Mock cache to return a quote
        mock_quote = StockQuote(
            symbol="000001.SZ",
            price=16.85,
            open=16.80,
            high=16.90,
            low=16.75,
            prev_close=16.78,
            change=0.07,
            change_percent=0.42,
            volume=1000000,
            amount=16850000.0,
            timestamp=datetime.now()
        )

        with patch.object(data_service.redis_cache, 'get_cached_quote',
                         new_callable=AsyncMock, return_value=mock_quote):
            quote = await data_service.get_stock_quote("000001.SZ")
            assert quote == mock_quote

    @pytest.mark.asyncio
    async def test_get_stock_quote_data_source(self, data_service):
        """Test getting stock quote from data source."""
        # Mock cache to return None (cache miss)
        with patch.object(data_service.redis_cache, 'get_cached_quote',
                         new_callable=AsyncMock, return_value=None):
            # Mock database to return None
            with patch.object(data_service.database_storage, 'get_latest_quote',
                            new_callable=AsyncMock, return_value=None):
                # Mock data source to return quote
                mock_source = Mock()
                mock_source.name = "sina"
                mock_source.priority = 1
                mock_source.get_stock_quote = AsyncMock(return_value={
                    "symbol": "000001.SZ",
                    "price": 16.85,
                    "timestamp": datetime.now()
                })

                data_service.data_sources = [mock_source]

                # Mock storage save methods
                with patch.object(data_service.database_storage, 'save_stock_quote',
                                new_callable=AsyncMock):
                    with patch.object(data_service.redis_cache, 'cache_stock_quote',
                                    new_callable=AsyncMock):
                        quote = await data_service.get_stock_quote("000001.SZ")
                        assert quote.symbol == "000001.SZ"
                        assert quote.price == 16.85

    @pytest.mark.asyncio
    async def test_get_batch_quotes(self, data_service):
        """Test getting batch quotes."""
        symbols = ["000001.SZ", "600036.SH"]

        # Mock cache to return some quotes
        mock_quotes = {
            "000001.SZ": StockQuote(
                symbol="000001.SZ",
                price=16.85,
                timestamp=datetime.now()
            )
        }

        with patch.object(data_service.redis_cache, 'get_batch_cached_quotes',
                         new_callable=AsyncMock, return_value=mock_quotes):
            # Mock data source for remaining symbols
            mock_source = Mock()
            mock_source.name = "sina"
            mock_source.priority = 1
            mock_source.get_batch_quotes = AsyncMock(return_value={
                "600036.SH": {
                    "symbol": "600036.SH",
                    "price": 42.50,
                    "timestamp": datetime.now()
                }
            })

            data_service.data_sources = [mock_source]

            # Mock storage save methods
            with patch.object(data_service.database_storage, 'save_stock_quote',
                            new_callable=AsyncMock):
                with patch.object(data_service.redis_cache, 'cache_stock_quote',
                                new_callable=AsyncMock):
                    quotes = await data_service.get_batch_quotes(symbols)
                    assert len(quotes) == 2
                    assert "000001.SZ" in quotes
                    assert "600036.SH" in quotes

    @pytest.mark.asyncio
    async def test_get_stock_history(self, data_service):
        """Test getting stock history."""
        symbol = "000001.SZ"
        start_date = datetime.now() - timedelta(days=30)
        end_date = datetime.now()

        # Mock database to return history
        mock_history = [
            StockData(
                symbol=symbol,
                timestamp=datetime.now() - timedelta(days=1),
                open=16.80,
                high=16.90,
                low=16.75,
                close=16.85,
                volume=1000000
            )
        ]

        with patch.object(data_service.database_storage, 'get_stock_history',
                         new_callable=AsyncMock, return_value=mock_history):
            history = await data_service.get_stock_history(
                symbol, start_date, end_date, "1d"
            )
            assert len(history) == 1
            assert history[0].symbol == symbol

    @pytest.mark.asyncio
    async def test_get_market_status(self, data_service):
        """Test getting market status."""
        # Mock cache to return None
        with patch.object(data_service.redis_cache, 'get_cached_market_status',
                         new_callable=AsyncMock, return_value=None):
            status = await data_service.get_market_status()
            assert "is_open" in status
            assert "current_time" in status

    @pytest.mark.asyncio
    async def test_search_stocks(self, data_service):
        """Test searching stocks."""
        query = "平安"

        # Mock database search
        mock_stocks = [
            StockSymbol(
                symbol="000001.SZ",
                name="平安银行",
                exchange="SZ",
                is_active=True
            )
        ]

        with patch.object(data_service.database_storage, 'search_stocks',
                         new_callable=AsyncMock, return_value=mock_stocks):
            # Mock quote retrieval
            with patch.object(data_service, 'get_stock_quote',
                            new_callable=AsyncMock, return_value=None):
                results = await data_service.search_stocks(query, limit=10)
                assert len(results) == 1
                assert results[0]["symbol"] == "000001.SZ"
                assert "平安" in results[0]["name"]

    @pytest.mark.asyncio
    async def test_manual_collection(self, data_service):
        """Test manual data collection."""
        symbols = ["000001.SZ", "600036.SH"]

        # Mock quote and history retrieval
        with patch.object(data_service, 'get_stock_quote',
                         new_callable=AsyncMock, return_value=Mock()):
            with patch.object(data_service, 'get_stock_history',
                            new_callable=AsyncMock, return_value=[Mock(), Mock()]):
                results = await data_service.manual_collection(symbols, ["quote", "history"])
                assert len(results) == 2
                assert all(r.symbol in symbols for r in results)

    @pytest.mark.asyncio
    async def test_close(self, data_service):
        """Test closing data service."""
        # Mock close methods
        with patch.object(data_service.database_storage, 'close', new_callable=AsyncMock):
            with patch.object(data_service.redis_cache, 'close', new_callable=AsyncMock):
                await data_service.close()
                assert not data_service.is_initialized


class TestErrorHandling:
    """Test error handling."""

    @pytest.mark.asyncio
    async def test_data_source_error(self, data_service):
        """Test handling of data source errors."""
        # Mock all data sources to raise errors
        mock_source = Mock()
        mock_source.name = "sina"
        mock_source.priority = 1
        mock_source.get_stock_quote = AsyncMock(side_effect=DataSourceError("Test error"))

        data_service.data_sources = [mock_source]

        # Mock cache and database to return None
        with patch.object(data_service.redis_cache, 'get_cached_quote',
                         new_callable=AsyncMock, return_value=None):
            with patch.object(data_service.database_storage, 'get_latest_quote',
                            new_callable=AsyncMock, return_value=None):
                quote = await data_service.get_stock_quote("000001.SZ")
                assert quote is None

    @pytest.mark.asyncio
    async def test_storage_error(self, data_service):
        """Test handling of storage errors."""
        # Mock data source to return quote
        mock_source = Mock()
        mock_source.name = "sina"
        mock_source.priority = 1
        mock_source.get_stock_quote = AsyncMock(return_value={
            "symbol": "000001.SZ",
            "price": 16.85,
            "timestamp": datetime.now()
        })

        data_service.data_sources = [mock_source]

        # Mock cache and database to raise errors
        with patch.object(data_service.redis_cache, 'get_cached_quote',
                         new_callable=AsyncMock, return_value=None):
            with patch.object(data_service.database_storage, 'get_latest_quote',
                            new_callable=AsyncMock, return_value=None):
                # Mock storage save to raise error
                with patch.object(data_service.database_storage, 'save_stock_quote',
                                new_callable=AsyncMock, side_effect=Exception("Storage error")):
                    # Should still return the quote even if storage fails
                    quote = await data_service.get_stock_quote("000001.SZ")
                    assert quote is not None
                    assert quote.symbol == "000001.SZ"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])