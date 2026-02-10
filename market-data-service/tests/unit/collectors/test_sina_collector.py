"""
Unit tests for Sina Finance data collector.

Tests the SinaCollector implementation for fetching stock quotes,
historical data, and stock information from Sina Finance API.
"""

import pytest
import re
from datetime import datetime
from unittest.mock import Mock, AsyncMock, patch

from data_service.collectors.sina import SinaCollector
from data_service.collectors.base import DataSourceError


class TestSinaCollectorInitialization:
    """Test SinaCollector initialization."""

    def test_initialization(self):
        """Test SinaCollector initializes correctly."""
        collector = SinaCollector()
        assert collector.name == "sina"
        assert collector.priority == 1
        assert collector.base_url == "http://hq.sinajs.cn"
        assert collector.history_url == "https://quotes.sina.cn/cn/api/json_v2.php"


class TestSinaCollectorSymbolParsing:
    """Test SinaCollector symbol parsing."""

    @pytest.fixture
    def collector(self):
        return SinaCollector()

    def test_parse_symbol_sz(self, collector):
        """Test parsing SZSE symbol."""
        market, code = collector._parse_symbol("000001.SZ")
        assert market == "SZ"
        assert code == "000001"

    def test_parse_symbol_sh(self, collector):
        """Test parsing SSE symbol."""
        market, code = collector._parse_symbol("600519.SH")
        assert market == "SH"
        assert code == "600519"

    def test_parse_symbol_no_suffix_sz(self, collector):
        """Test parsing symbol without suffix (SZ)."""
        market, code = collector._parse_symbol("000001")
        assert market == "SZ"
        assert code == "000001"

    def test_parse_symbol_no_suffix_sh(self, collector):
        """Test parsing symbol without suffix (SH)."""
        market, code = collector._parse_symbol("600519")
        assert market == "SH"
        assert code == "600519"

    def test_parse_symbol_empty(self, collector):
        """Test parsing empty symbol raises error."""
        with pytest.raises(ValueError):
            collector._parse_symbol("")

    def test_parse_symbol_whitespace(self, collector):
        """Test parsing whitespace-only symbol raises error."""
        with pytest.raises(ValueError):
            collector._parse_symbol("   ")


class TestSinaCollectorQuoteParsing:
    """Test SinaCollector quote response parsing."""

    @pytest.fixture
    def collector(self):
        return SinaCollector()

    @pytest.fixture
    def valid_sina_response(self):
        """Return a valid Sina API response."""
        return 'var hq_str_sz000001="平安银行,10.300,10.400,10.500,10.800,10.200,10.490,10.510,1000000,10500000.00,500,10.490,600,10.480,700,10.470,800,10.460,900,10.450,1000,10.510,1100,10.520,1200,10.530,1300,10.540,1400,10.550,2026-02-10,14:30:00,0.100,0.960,10.800,10.200,10.500,10500000.00,1000000,10.490,10.510,0.100,0.960";'

    @pytest.mark.asyncio
    async def test_get_stock_quote_success(self, collector, valid_sina_response, mock_session):
        """Test successful stock quote fetch."""
        mock_session_obj = mock_session(response_text=valid_sina_response, status=200)
        collector.session = mock_session_obj

        quote = await collector.get_stock_quote("000001.SZ")

        assert quote["symbol"] == "000001.SZ"
        assert quote["name"] == "平安银行"
        assert quote["price"] == 10.5
        assert quote["open"] == 10.3
        assert quote["high"] == 10.8
        assert quote["low"] == 10.2
        assert quote["prev_close"] == 10.4
        assert quote["volume"] == 1000000
        assert abs(quote["change"] - 0.1) < 0.001
        assert abs(quote["change_percent"] - 0.96) < 0.01

    @pytest.mark.asyncio
    async def test_get_stock_quote_empty_response(self, collector, mock_session):
        """Test handling empty response."""
        mock_session_obj = mock_session(response_text="", status=200)
        collector.session = mock_session_obj

        with pytest.raises(DataSourceError) as exc_info:
            await collector.get_stock_quote("000001.SZ")
        assert "Empty response" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_stock_quote_invalid_format(self, collector, mock_session):
        """Test handling invalid response format."""
        mock_session_obj = mock_session(response_text="invalid response", status=200)
        collector.session = mock_session_obj

        with pytest.raises(DataSourceError) as exc_info:
            await collector.get_stock_quote("000001.SZ")
        assert "Invalid response format" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_stock_quote_incomplete_data(self, collector, mock_session):
        """Test handling incomplete data."""
        mock_session_obj = mock_session(response_text='var hq_str_sz000001="平安银行,10.300";', status=200)
        collector.session = mock_session_obj

        with pytest.raises(DataSourceError) as exc_info:
            await collector.get_stock_quote("000001.SZ")
        assert "Incomplete data" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_stock_quote_zero_prev_close(self, collector, mock_session):
        """Test handling zero previous close (IPO day)."""
        response = 'var hq_str_sz000001="平安银行,10.300,0.000,10.500,10.800,10.200,10.490,10.510,1000000,10500000.00,500,10.490,600,10.480,700,10.470,800,10.460,900,10.450,1000,10.510,1100,10.520,1200,10.530,1300,10.540,1400,10.550,2026-02-10,14:30:00,0.100,0.960,10.800,10.200,10.500,10500000.00,1000000,10.490,10.510,0.100,0.960";'
        mock_session_obj = mock_session(response_text=response, status=200)
        collector.session = mock_session_obj

        quote = await collector.get_stock_quote("000001.SZ")
        assert quote["change"] == 0.0
        assert quote["change_percent"] == 0.0


class TestSinaCollectorBatchQuotes:
    """Test SinaCollector batch quotes functionality."""

    @pytest.fixture
    def collector(self):
        return SinaCollector()

    @pytest.fixture
    def valid_batch_response(self):
        """Return a valid batch response."""
        return '''var hq_str_sz000001="平安银行,10.300,10.400,10.500,10.800,10.200,10.490,10.510,1000000,10500000.00,500,10.490,600,10.480,700,10.470,800,10.460,900,10.450,1000,10.510,1100,10.520,1200,10.530,1300,10.540,1400,10.550,2026-02-10,14:30:00,0.100,0.960,10.800,10.200,10.500,10500000.00,1000000,10.490,10.510,0.100,0.960";
var hq_str_sh600519="贵州茅台,1500.000,1490.000,1510.000,1520.000,1480.000,1509.000,1511.000,50000,75500000.00,100,1509.000,200,1508.000,300,1507.000,400,1506.000,500,1505.000,600,1511.000,700,1512.000,800,1513.000,900,1514.000,1000,1515.000,2026-02-10,14:30:00,20.000,1.342,1520.000,1480.000,1510.000,75500000.00,50000,1509.000,1511.000,20.000,1.342";'''

    @pytest.mark.asyncio
    async def test_get_batch_quotes_success(self, collector, valid_batch_response, mock_session):
        """Test successful batch quotes fetch."""
        mock_session_obj = mock_session(response_text=valid_batch_response, status=200)
        collector.session = mock_session_obj

        quotes = await collector.get_batch_quotes(["000001.SZ", "600519.SH"])

        assert len(quotes) == 2
        assert "000001.SZ" in quotes
        assert "600519.SH" in quotes
        assert quotes["000001.SZ"]["name"] == "平安银行"
        assert quotes["600519.SH"]["name"] == "贵州茅台"

    @pytest.mark.asyncio
    async def test_get_batch_quotes_partial_failure(self, collector, mock_session):
        """Test batch quotes with some invalid data."""
        response = '''var hq_str_sz000001="平安银行,10.300,10.400,10.500,10.800,10.200,10.490,10.510,1000000,10500000.00,500,10.490,600,10.480,700,10.470,800,10.460,900,10.450,1000,10.510,1100,10.520,1200,10.530,1300,10.540,1400,10.550,2026-02-10,14:30:00,0.100,0.960,10.800,10.200,10.500,10500000.00,1000000,10.490,10.510,0.100,0.960";
var hq_str_sh600519="贵州茅台,10.300";'''
        mock_session_obj = mock_session(response_text=response, status=200)
        collector.session = mock_session_obj

        quotes = await collector.get_batch_quotes(["000001.SZ", "600519.SH"])

        # Should return only valid quote
        assert len(quotes) == 1
        assert "000001.SZ" in quotes

    @pytest.mark.asyncio
    async def test_get_batch_quotes_empty_response(self, collector, mock_session):
        """Test batch quotes with empty response."""
        mock_session_obj = mock_session(response_text="", status=200)
        collector.session = mock_session_obj

        with pytest.raises(DataSourceError) as exc_info:
            await collector.get_batch_quotes(["000001.SZ"])
        assert "Empty response" in str(exc_info.value)


class TestSinaCollectorHistory:
    """Test SinaCollector historical data functionality."""

    @pytest.fixture
    def collector(self):
        return SinaCollector()

    @pytest.fixture
    def valid_history_response(self):
        """Return valid historical data response."""
        return '[{"day": "2026-01-01", "open": "10.00", "high": "10.50", "low": "9.80", "close": "10.20", "volume": "1000000", "amount": "10200000"}, {"day": "2026-01-02", "open": "10.20", "high": "10.60", "low": "10.10", "close": "10.40", "volume": "1200000", "amount": "12480000"}]'

    @pytest.mark.asyncio
    async def test_get_stock_history_success(self, collector, valid_history_response, mock_session):
        """Test successful historical data fetch."""
        mock_session_obj = mock_session(response_text=valid_history_response, status=200)
        collector.session = mock_session_obj

        start = datetime(2026, 1, 1)
        end = datetime(2026, 1, 31)
        history = await collector.get_stock_history("000001.SZ", start, end, "1d")

        assert len(history) == 2
        assert history[0]["symbol"] == "000001.SZ"
        assert history[0]["open"] == 10.0
        assert history[0]["close"] == 10.2
        assert history[0]["volume"] == 1000000

    @pytest.mark.asyncio
    async def test_get_stock_history_unsupported_interval(self, collector):
        """Test historical data with unsupported interval."""
        start = datetime(2026, 1, 1)
        end = datetime(2026, 1, 31)

        with pytest.raises(DataSourceError) as exc_info:
            await collector.get_stock_history("000001.SZ", start, end, "1m")
        assert "only supports daily interval" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_stock_history_invalid_data(self, collector, mock_session):
        """Test historical data with invalid data points."""
        response = '[{"day": "2026-01-01", "open": "10.00", "high": "10.50", "low": "9.80", "close": "10.20", "volume": "1000000"}, {"day": "invalid", "open": "bad", "high": "data", "low": "here", "close": "xxx", "volume": "yyy"}]'
        mock_session_obj = mock_session(response_text=response, status=200)
        collector.session = mock_session_obj

        start = datetime(2026, 1, 1)
        end = datetime(2026, 1, 31)
        history = await collector.get_stock_history("000001.SZ", start, end, "1d")

        # Should skip invalid data point
        assert len(history) == 1


class TestSinaCollectorStockInfo:
    """Test SinaCollector stock info functionality."""

    @pytest.fixture
    def collector(self):
        return SinaCollector()

    @pytest.fixture
    def valid_quote_response(self):
        """Return valid quote response for stock info test."""
        return 'var hq_str_sz000001="平安银行,10.300,10.400,10.500,10.800,10.200,10.490,10.510,1000000,10500000.00,500,10.490,600,10.480,700,10.470,800,10.460,900,10.450,1000,10.510,1100,10.520,1200,10.530,1300,10.540,1400,10.550,2026-02-10,14:30:00,0.100,0.960,10.800,10.200,10.500,10500000.00,1000000,10.490,10.510,0.100,0.960";'

    @pytest.mark.asyncio
    async def test_get_stock_info_success(self, collector, valid_quote_response, mock_session):
        """Test successful stock info fetch."""
        mock_session_obj = mock_session(response_text=valid_quote_response, status=200)
        collector.session = mock_session_obj

        info = await collector.get_stock_info("000001.SZ")

        assert info["symbol"] == "000001.SZ"
        assert info["name"] == "平安银行"
        assert info["exchange"] == "SZ"


class TestSinaCollectorDataFormat:
    """Test SinaCollector data format consistency."""

    @pytest.fixture
    def collector(self):
        return SinaCollector()

    @pytest.fixture
    def valid_sina_response(self):
        return 'var hq_str_sz000001="平安银行,10.300,10.400,10.500,10.800,10.200,10.490,10.510,1000000,10500000.00,500,10.490,600,10.480,700,10.470,800,10.460,900,10.450,1000,10.510,1100,10.520,1200,10.530,1300,10.540,1400,10.550,2026-02-10,14:30:00,0.100,0.960,10.800,10.200,10.500,10500000.00,1000000,10.490,10.510,0.100,0.960";'

    @pytest.mark.asyncio
    async def test_quote_data_format(self, collector, valid_sina_response, mock_session):
        """Test quote data has consistent format."""
        mock_session_obj = mock_session(response_text=valid_sina_response, status=200)
        collector.session = mock_session_obj

        quote = await collector.get_stock_quote("000001.SZ")

        # Check required fields
        required_fields = [
            "symbol", "name", "price", "open", "high", "low",
            "prev_close", "volume", "change", "change_percent",
            "bid_price", "ask_price", "bid_volume", "ask_volume", "timestamp"
        ]
        for field in required_fields:
            assert field in quote, f"Missing field: {field}"

        # Check data types
        assert isinstance(quote["symbol"], str)
        assert isinstance(quote["name"], str)
        assert isinstance(quote["price"], float)
        assert isinstance(quote["volume"], int)
        assert isinstance(quote["timestamp"], datetime)

    @pytest.mark.asyncio
    async def test_history_data_format(self, collector, mock_session):
        """Test history data has consistent format."""
        response = '[{"day": "2026-01-01", "open": "10.00", "high": "10.50", "low": "9.80", "close": "10.20", "volume": "1000000"}]'
        mock_session_obj = mock_session(response_text=response, status=200)
        collector.session = mock_session_obj

        start = datetime(2026, 1, 1)
        end = datetime(2026, 1, 31)
        history = await collector.get_stock_history("000001.SZ", start, end, "1d")

        # Check required fields
        required_fields = ["symbol", "timestamp", "open", "high", "low", "close", "volume"]
        for field in required_fields:
            assert field in history[0], f"Missing field: {field}"

        # Check data types
        assert isinstance(history[0]["symbol"], str)
        assert isinstance(history[0]["timestamp"], datetime)
        assert isinstance(history[0]["open"], float)
        assert isinstance(history[0]["volume"], int)
