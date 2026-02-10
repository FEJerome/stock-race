"""
Pytest configuration for market-data-service tests.
"""

import pytest
import asyncio
from datetime import datetime
from typing import List, Dict, Any
from unittest.mock import Mock, AsyncMock


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_quote_data():
    """Return mock quote data for testing."""
    return {
        "symbol": "000001.SZ",
        "name": "平安银行",
        "price": 10.50,
        "open": 10.30,
        "high": 10.80,
        "low": 10.20,
        "prev_close": 10.40,
        "volume": 1000000,
        "amount": 10500000.0,
        "change": 0.10,
        "change_percent": 0.96,
        "bid_price": 10.49,
        "ask_price": 10.51,
        "bid_volume": 500,
        "ask_volume": 600,
        "timestamp": datetime.now()
    }


@pytest.fixture
def mock_kline_data():
    """Return mock kline data for testing."""
    return [
        {
            "symbol": "000001.SZ",
            "timestamp": datetime(2026, 1, 1),
            "open": 10.0,
            "high": 10.5,
            "low": 9.8,
            "close": 10.2,
            "volume": 1000000,
            "amount": 10200000.0
        },
        {
            "symbol": "000001.SZ",
            "timestamp": datetime(2026, 1, 2),
            "open": 10.2,
            "high": 10.6,
            "low": 10.1,
            "close": 10.4,
            "volume": 1200000,
            "amount": 12480000.0
        }
    ]


@pytest.fixture
def mock_stock_info():
    """Return mock stock info for testing."""
    return {
        "symbol": "000001.SZ",
        "name": "平安银行",
        "exchange": "SZ",
        "market_cap": 2000000000.0,
        "pe_ratio": 5.5,
        "pb_ratio": 0.8,
        "dividend_yield": 0.03,
        "listing_date": "1991-04-03"
    }


@pytest.fixture
def mock_aiohttp_response():
    """Create a mock aiohttp response."""
    def _create_mock_response(text="", json_data=None, status=200, content_type="text/plain"):
        mock_response = Mock()
        mock_response.status = status
        mock_response.text = AsyncMock(return_value=text)
        mock_response.json = AsyncMock(return_value=json_data if json_data else {})
        mock_response.headers = {"Content-Type": content_type}
        return mock_response
    return _create_mock_response


@pytest.fixture
def mock_session(mock_aiohttp_response):
    """Create a mock aiohttp ClientSession."""
    def _create_mock_session(response_text="", response_json=None, status=200, content_type="text/plain"):
        mock_session = Mock()
        mock_response = mock_aiohttp_response(response_text, response_json, status, content_type)

        # Create an async context manager mock
        class AsyncContextManagerMock:
            async def __aenter__(self):
                return mock_response
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                return None

        def mock_request(*args, **kwargs):
            return AsyncContextManagerMock()

        mock_session.request = mock_request
        mock_session.close = AsyncMock()
        return mock_session
    return _create_mock_session
