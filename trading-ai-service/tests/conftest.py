"""
Pytest configuration and fixtures for AI Service tests.
"""

import asyncio
import pytest
import pytest_asyncio
from typing import Dict, Any, AsyncGenerator
from unittest.mock import AsyncMock, Mock, MagicMock

from fastapi.testclient import TestClient

from ai_service.main import app
from ai_service.core.config import Settings
from ai_service.utils.cache import CacheManager


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def test_settings() -> Settings:
    """Test settings fixture."""
    return Settings(
        HOST="0.0.0.0",
        PORT=8000,
        DEBUG=True,
        CORS_ORIGINS=["http://localhost:3000"],
        DB_HOST="localhost",
        DB_PORT=5432,
        DB_NAME="test_stock_race",
        DB_USER="test_user",
        DB_PASSWORD="test_password",
        REDIS_URL="redis://localhost:6379",
        OPENAI_API_KEY="test-openai-key",
        DEEPSEEK_API_KEY="test-deepseek-key",
        ANTHROPIC_API_KEY="test-anthropic-key",
        RATE_LIMIT_REQUESTS=100,
        RATE_LIMIT_PERIOD=60,
        MAX_POSITION_SIZE=100000.0,
        MIN_TRADE_AMOUNT=1000.0,
        DEFAULT_TRADING_FEE=0.001,
        BACKEND_URL="http://localhost:3001",
        DATA_SERVICE_URL="http://localhost:8001",
        LOG_LEVEL="INFO",
        LOG_FILE="logs/test_ai_service.log",
        DEFAULT_MODEL="gpt-3.5-turbo",
        DEFAULT_TEMPERATURE=0.7,
        DEFAULT_MAX_TOKENS=2000,
    )


@pytest.fixture
def mock_cache_manager() -> CacheManager:
    """Mock cache manager fixture."""
    cache_manager = CacheManager("redis://localhost:6379")
    cache_manager.client = AsyncMock()
    cache_manager.is_connected = True

    # Mock methods
    cache_manager.get = AsyncMock(return_value=None)
    cache_manager.set = AsyncMock(return_value=True)
    cache_manager.delete = AsyncMock(return_value=True)
    cache_manager.exists = AsyncMock(return_value=False)

    return cache_manager


@pytest.fixture
def sample_stock_data() -> Dict[str, Any]:
    """Sample stock data fixture."""
    return {
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "current_price": 175.25,
        "open_price": 174.50,
        "high_price": 176.80,
        "low_price": 173.20,
        "volume": 50000000,
        "change": 0.75,
        "change_percent": 0.43,
        "market_cap": 2750000000000.00,
        "pe_ratio": 28.5,
        "dividend_yield": 0.0055,
        "ma_5": 174.80,
        "ma_20": 172.50,
        "ma_60": 168.75,
        "rsi": 58.5,
        "macd": 0.25,
        "bollinger_upper": 178.20,
        "bollinger_lower": 170.80,
    }


@pytest.fixture
def sample_position() -> Dict[str, Any]:
    """Sample position fixture."""
    return {
        "symbol": "AAPL",
        "quantity": 100,
        "avg_cost": 170.50,
        "current_price": 175.25,
        "market_value": 17525.00,
        "unrealized_pnl": 475.00,
        "unrealized_pnl_percent": 2.79,
    }


@pytest.fixture
def sample_account_info() -> Dict[str, Any]:
    """Sample account info fixture."""
    return {
        "account_id": "acc_123456",
        "user_id": "user_789",
        "total_balance": 50000.00,
        "available_cash": 32475.00,
        "total_market_value": 17525.00,
        "total_unrealized_pnl": 475.00,
        "total_unrealized_pnl_percent": 2.79,
        "risk_tolerance": "medium",
        "trading_strategy": "growth",
    }


@pytest.fixture
def sample_decision_request(
    sample_account_info: Dict[str, Any],
    sample_position: Dict[str, Any],
    sample_stock_data: Dict[str, Any],
) -> Dict[str, Any]:
    """Sample decision request fixture."""
    return {
        "account_info": sample_account_info,
        "positions": [sample_position],
        "stock_data": [sample_stock_data],
        "market_conditions": {
            "market_trend": "bullish",
            "volatility": "medium",
        },
        "constraints": {
            "max_position_size": 100000.0,
            "min_trade_amount": 1000.0,
        },
        "ai_provider": "openai",
        "model_name": "gpt-3.5-turbo",
        "temperature": 0.7,
        "max_tokens": 2000,
        "include_technical_analysis": True,
        "include_fundamental_analysis": True,
        "include_risk_assessment": True,
    }


@pytest.fixture
def sample_ai_response() -> str:
    """Sample AI response fixture."""
    return """{
        "action": "buy",
        "symbol": "AAPL",
        "quantity": 50,
        "price_target": 185.00,
        "stop_loss": 168.00,
        "reasoning": "Apple shows strong technical indicators with RSI at 58.5 suggesting room for growth. The stock is trading above its 20-day and 60-day moving averages, indicating bullish momentum. Fundamentally, the P/E ratio of 28.5 is reasonable for a growth stock of this caliber.",
        "technical_analysis": "Price above key moving averages, RSI neutral, MACD positive, Bollinger Bands show normal volatility.",
        "fundamental_analysis": "Strong market position, reasonable valuation, healthy dividend yield.",
        "risk_assessment": "Market risk medium, company-specific risk low, liquidity risk low.",
        "confidence_score": 0.75,
        "risk_level": "medium",
        "expected_return": 5.6,
        "time_horizon": "1-3 months"
    }"""


@pytest.fixture
def test_client() -> TestClient:
    """Test client fixture."""
    return TestClient(app)


@pytest_asyncio.fixture
async def mock_openai_adapter():
    """Mock OpenAI adapter fixture."""
    adapter = AsyncMock()
    adapter.provider = "openai"
    adapter.default_model = "gpt-3.5-turbo"
    adapter.is_initialized = True

    # Mock generate method
    adapter.generate = AsyncMock()

    return adapter


@pytest_asyncio.fixture
async def mock_deepseek_adapter():
    """Mock DeepSeek adapter fixture."""
    adapter = AsyncMock()
    adapter.provider = "deepseek"
    adapter.default_model = "deepseek-chat"
    adapter.is_initialized = True

    # Mock generate method
    adapter.generate = AsyncMock()

    return adapter


class AsyncContextManagerMock:
    """Mock for async context managers."""

    def __init__(self, return_value=None):
        self.return_value = return_value

    async def __aenter__(self):
        return self.return_value

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


# Test markers
def pytest_configure(config):
    """Configure pytest markers."""
    config.addinivalue_line(
        "markers",
        "integration: mark test as integration test (requires external services)"
    )
    config.addinivalue_line(
        "markers",
        "slow: mark test as slow running"
    )
    config.addinivalue_line(
        "markers",
        "unit: mark test as unit test"
    )