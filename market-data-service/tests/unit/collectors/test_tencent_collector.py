"""
Unit tests for Tencent Finance data collector.

Tests the TencentCollector implementation for fetching stock quotes,
historical data, and stock information from Tencent Finance API.
"""

import pytest
import re
from datetime import datetime
from unittest.mock import Mock, AsyncMock, patch

from data_service.collectors.tencent import TencentCollector
from data_service.collectors.base import DataSourceError


class TestTencentCollectorInitialization:
    """Test TencentCollector initialization."""

    def test_initialization(self):
        """Test TencentCollector initializes correctly."""
        collector = TencentCollector()
        assert collector.name == "tencent"
        assert collector.priority == 2
        assert collector.base_url == "http://qt.gtimg.cn"
        assert collector.history_url == "https://web.ifzq.gtimg.cn"


class TestTencentCollectorSymbolParsing:
    """Test TencentCollector symbol parsing."""

    @pytest.fixture
    def collector(self):
        return TencentCollector()

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


class TestTencentCollectorQuoteParsing:
    """Test TencentCollector quote response parsing."""

    @pytest.fixture
    def collector(self):
        return TencentCollector()

    @pytest.fixture
    def valid_tencent_response(self):
        """Return a valid Tencent API response."""
        # Fields: 0~1~2~3~4~5~6~7~8~9~10~11~12~13~14~15~16~17~18~19~20~21~22~23~24~25~26~27~28~29~30~31~32~33~34~35~36~37~38~39...
        # 0: 1 (unknown)
        # 1: name, 2: code, 3: price, 4: prev_close, 5: open, 6: volume
        # 7-28: bid/ask data (22 fields)
        # 29: recent_transaction
        # 30: date, 31: time
        # 32: change, 33: change_percent
        # 34: high, 35: low
        # 36: price_volume_ratio, 37: turnover_rate
        # 38: pe_ratio, 39: pb_ratio
        # Total: 40+ fields required
        return 'v_sz000001="1~平安银行~000001~10.50~10.40~10.30~1000000~500~600~10.49~500~10.48~600~10.47~700~10.46~800~10.45~900~10.51~600~10.52~700~10.53~800~10.54~900~10.55~1000~1000~20260210~143000~0.10~0.96~10.80~10.20~1.5~2.5~5.5~0.8";'

    @pytest.mark.asyncio
    async def test_get_stock_quote_success(self, collector, valid_tencent_response, mock_session):
        """Test successful stock quote fetch."""
        mock_session_obj = mock_session(response_text=valid_tencent_response, status=200)
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
        assert quote["change"] == 0.1
        assert quote["change_percent"] == 0.96
        assert quote["pe_ratio"] == 5.5
        assert quote["pb_ratio"] == 0.8

    @pytest.mark.asyncio
    async def test_get_stock_quote_empty_response(self, collector, mock_session):
        """Test handling empty response."""
        mock_session_obj = mock_session(response_text="", status=200)
        collector.session = mock_session_obj

        with pytest.raises(DataSourceError) as exc_info:
            await collector.get_stock_quote("000001.SZ")
        assert "Empty response" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_stock_quote_symbol_not_found(self, collector, mock_session):
        """Test handling symbol not found in response."""
        mock_session_obj = mock_session(response_text='v_sh999999=""', status=200)
        collector.session = mock_session_obj

        with pytest.raises(DataSourceError) as exc_info:
            await collector.get_stock_quote("000001.SZ")
        assert "not found in response" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_stock_quote_incomplete_data(self, collector, mock_session):
        """Test handling incomplete data."""
        mock_session_obj = mock_session(response_text='v_sz000001="1~平安银行~000001~10.50";', status=200)
        collector.session = mock_session_obj

        with pytest.raises(DataSourceError) as exc_info:
            await collector.get_stock_quote("000001.SZ")
        assert "Incomplete data" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_stock_quote_with_slashes(self, collector, mock_session):
        """Test handling data with slashes (e.g., '1524.96/0/0')."""
        response = 'v_sz000001="1~平安银行~000001~1524.96/0/0~10.40~10.30~1000000/0/0~500~600~10.49~500~10.48~600~10.47~700~10.46~800~10.45~900~10.51~600~10.52~700~10.53~800~10.54~900~10.55~1000~20260210~143000~0.10~0.96~10.80~10.20~1.5~2.5~5.5~0.8~10.50~10.40~0.10~0.96~1000000~10500000~10.49~10.51~0.10~0.96~0.0~0.0~0.0~0.0~0.0~0.0";'
        mock_session_obj = mock_session(response_text=response, status=200)
        collector.session = mock_session_obj

        quote = await collector.get_stock_quote("000001.SZ")
        assert quote["price"] == 1524.96
        assert quote["volume"] == 1000000


class TestTencentCollectorBatchQuotes:
    """Test TencentCollector batch quotes functionality."""

    @pytest.fixture
    def collector(self):
        return TencentCollector()

    @pytest.fixture
    def valid_batch_response(self):
        """Return a valid batch response."""
        return '''v_sz000001="1~平安银行~000001~10.50~10.40~10.30~1000000~500~600~10.49~500~10.48~600~10.47~700~10.46~800~10.45~900~10.51~600~10.52~700~10.53~800~10.54~900~10.55~1000~20260210~143000~0.10~0.96~10.80~10.20~1.5~2.5~5.5~0.8~10.50~10.40~0.10~0.96~1000000~10500000~10.49~10.51~0.10~0.96~0.0~0.0~0.0~0.0~0.0~0.0";
v_sh600519="1~贵州茅台~600519~1500.00~1490.00~1480.00~50000~100~200~1509.00~100~1508.00~200~1507.00~300~1506.00~400~1505.00~500~1511.00~600~1512.00~700~1513.00~800~1514.00~900~1515.00~1000~20260210~143000~20.00~1.34~1520.00~1480.00~1.5~2.5~25.0~5.0~1510.00~1490.00~20.00~1.34~50000~75500000~1509.00~1511.00~20.00~1.34~0.0~0.0~0.0~0.0~0.0~0.0";'''

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
        response = '''v_sz000001="1~平安银行~000001~10.50~10.40~10.30~1000000~500~600~10.49~500~10.48~600~10.47~700~10.46~800~10.45~900~10.51~600~10.52~700~10.53~800~10.54~900~10.55~1000~20260210~143000~0.10~0.96~10.80~10.20~1.5~2.5~5.5~0.8~10.50~10.40~0.10~0.96~1000000~10500000~10.49~10.51~0.10~0.96~0.0~0.0~0.0~0.0~0.0~0.0";
v_sh600519="1~贵州茅台";'''
        mock_session_obj = mock_session(response_text=response, status=200)
        collector.session = mock_session_obj

        quotes = await collector.get_batch_quotes(["000001.SZ", "600519.SH"])

        # Should return only valid quote
        assert len(quotes) == 1
        assert "000001.SZ" in quotes


class TestTencentCollectorHistory:
    """Test TencentCollector historical data functionality."""

    @pytest.fixture
    def collector(self):
        return TencentCollector()

    @pytest.fixture
    def valid_history_response(self):
        """Return valid historical data response."""
        return 'kline_dayqfq = {"data": {"sz000001": {"qfqday": [["2026-01-01", "10.00", "10.20", "10.50", "9.80", "1000000", "10200000"], ["2026-01-02", "10.20", "10.40", "10.60", "10.10", "1200000", "12480000"]]}}};'

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
        assert history[0]["high"] == 10.5
        assert history[0]["low"] == 9.8
        assert history[0]["volume"] == 1000000
        assert history[0]["amount"] == 10200000.0

    @pytest.mark.asyncio
    async def test_get_stock_history_unsupported_interval(self, collector):
        """Test historical data with unsupported interval."""
        start = datetime(2026, 1, 1)
        end = datetime(2026, 1, 31)

        with pytest.raises(DataSourceError) as exc_info:
            await collector.get_stock_history("000001.SZ", start, end, "1m")
        assert "doesn't support interval" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_stock_history_no_data(self, collector, mock_session):
        """Test historical data with no data returned."""
        response = 'kline_dayqfq = {"data": {"sz000001": {}}};'
        mock_session_obj = mock_session(response_text=response, status=200)
        collector.session = mock_session_obj

        start = datetime(2026, 1, 1)
        end = datetime(2026, 1, 31)

        with pytest.raises(DataSourceError) as exc_info:
            await collector.get_stock_history("000001.SZ", start, end, "1d")
        assert "No data for symbol" in str(exc_info.value)


class TestTencentCollectorStockInfo:
    """Test TencentCollector stock info functionality."""

    @pytest.fixture
    def collector(self):
        return TencentCollector()

    @pytest.fixture
    def valid_quote_response(self):
        """Return valid quote response for stock info test."""
        return 'v_sz000001="1~平安银行~000001~10.50~10.40~10.30~1000000~500~600~10.49~500~10.48~600~10.47~700~10.46~800~10.45~900~10.51~600~10.52~700~10.53~800~10.54~900~10.55~1000~1000~20260210~143000~0.10~0.96~10.80~10.20~1.5~2.5~5.5~0.8";'

    @pytest.mark.asyncio
    async def test_get_stock_info_success(self, collector, valid_quote_response, mock_session):
        """Test successful stock info fetch."""
        mock_session_obj = mock_session(response_text=valid_quote_response, status=200)
        collector.session = mock_session_obj

        info = await collector.get_stock_info("000001.SZ")

        assert info["symbol"] == "000001.SZ"
        assert info["name"] == "平安银行"
        assert info["exchange"] == "SZ"
        assert info["pe_ratio"] == 5.5
        assert info["pb_ratio"] == 0.8


class TestTencentCollectorDataFormat:
    """Test TencentCollector data format consistency."""

    @pytest.fixture
    def collector(self):
        return TencentCollector()

    @pytest.fixture
    def valid_tencent_response(self):
        return 'v_sz000001="1~平安银行~000001~10.50~10.40~10.30~1000000~500~600~10.49~500~10.48~600~10.47~700~10.46~800~10.45~900~10.51~600~10.52~700~10.53~800~10.54~900~10.55~1000~20260210~143000~0.10~0.96~10.80~10.20~1.5~2.5~5.5~0.8~10.50~10.40~0.10~0.96~1000000~10500000~10.49~10.51~0.10~0.96~0.0~0.0~0.0~0.0~0.0~0.0";'

    @pytest.mark.asyncio
    async def test_quote_data_format(self, collector, valid_tencent_response, mock_session):
        """Test quote data has consistent format."""
        mock_session_obj = mock_session(response_text=valid_tencent_response, status=200)
        collector.session = mock_session_obj

        quote = await collector.get_stock_quote("000001.SZ")

        # Check required fields (same as Sina for consistency)
        required_fields = [
            "symbol", "name", "price", "open", "high", "low",
            "prev_close", "volume", "change", "change_percent",
            "bid_price", "ask_price", "bid_volume", "ask_volume"
        ]
        for field in required_fields:
            assert field in quote, f"Missing field: {field}"

        # Check data types
        assert isinstance(quote["symbol"], str)
        assert isinstance(quote["name"], str)
        assert isinstance(quote["price"], float)
        assert isinstance(quote["volume"], int)

    @pytest.mark.asyncio
    async def test_history_data_format(self, collector, mock_session):
        """Test history data has consistent format."""
        response = 'kline_dayqfq = {"data": {"sz000001": {"qfqday": [["2026-01-01", "10.00", "10.20", "10.50", "9.80", "1000000", "10200000"]]}}};'
        mock_session_obj = mock_session(response_text=response, status=200)
        collector.session = mock_session_obj

        start = datetime(2026, 1, 1)
        end = datetime(2026, 1, 31)
        history = await collector.get_stock_history("000001.SZ", start, end, "1d")

        # Check required fields (same as Sina for consistency)
        required_fields = ["symbol", "timestamp", "open", "high", "low", "close", "volume"]
        for field in required_fields:
            assert field in history[0], f"Missing field: {field}"

        # Check data types
        assert isinstance(history[0]["symbol"], str)
        assert isinstance(history[0]["timestamp"], datetime)
        assert isinstance(history[0]["open"], float)
        assert isinstance(history[0]["volume"], int)
