"""Unit tests for event handlers (market data and news)."""
import pytest
import sys
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from ai_service.services.event_handlers import MarketDataHandler, NewsHandler
from ai_service.services.event_bus_manager import EventBusManager
from ai_service.core.exceptions import ProviderError


class TestMarketDataHandler:
    """Test suite for MarketDataHandler."""

    def setup_method(self):
        """Reset singleton and create handler before each test."""
        EventBusManager._instance = None
        EventBusManager._initialized = False
        self.handler = MarketDataHandler()

    def test_init(self):
        """Test handler initialization."""
        assert self.handler is not None
        assert self.handler._quote_cache == {}
        assert self.handler._event_bus is not None

    @pytest.mark.asyncio
    async def test_start_not_initialized(self):
        """Test starting handler when event bus not initialized."""
        with pytest.raises(ProviderError, match="EventBusManager not initialized"):
            await self.handler.start()

    @pytest.mark.asyncio
    @patch("ai_service.services.event_handlers.EventBusManager")
    async def test_start_success(self, mock_manager_class):
        """Test successful handler start."""
        mock_manager = Mock()
        mock_manager.is_initialized = True
        mock_manager.subscribe = AsyncMock()
        mock_manager_class.return_value = mock_manager

        handler = MarketDataHandler()
        await handler.start()

        assert handler._event_bus is mock_manager
        mock_manager.subscribe.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_market_quote(self):
        """Test handling market quote event."""
        event_data = {
            "symbol": "000001.SZ",
            "price": 15.5,
            "change": 0.5,
            "volume": 1000000,
            "timestamp": datetime.utcnow().isoformat(),
        }

        await self.handler._handle_market_quote(event_data)

        assert "000001.SZ" in self.handler._quote_cache
        cached_data = self.handler._quote_cache["000001.SZ"]
        assert cached_data["price"] == 15.5
        assert cached_data["change"] == 0.5

    @pytest.mark.asyncio
    async def test_handle_market_quote_invalid_data(self):
        """Test handling invalid market quote event."""
        event_data = {
            "symbol": "INVALID",
            # Missing required fields
        }

        # Should not raise error, just log warning
        await self.handler._handle_market_quote(event_data)
        assert "INVALID" not in self.handler._quote_cache

    def test_get_quote_cached(self):
        """Test getting cached quote."""
        self.handler._quote_cache["000001.SZ"] = {
            "price": 15.5,
            "change": 0.5,
            "volume": 1000000,
            "timestamp": datetime.utcnow().isoformat(),
        }

        quote = self.handler.get_quote("000001.SZ")
        assert quote is not None
        assert quote["price"] == 15.5

    def test_get_quote_not_cached(self):
        """Test getting non-existent quote."""
        quote = self.handler.get_quote("999999.SZ")
        assert quote is None

    def test_get_all_quotes(self):
        """Test getting all cached quotes."""
        self.handler._quote_cache = {
            "000001.SZ": {"price": 15.5},
            "000002.SZ": {"price": 20.0},
        }

        quotes = self.handler.get_all_quotes()
        assert len(quotes) == 2
        assert "000001.SZ" in quotes
        assert "000002.SZ" in quotes

    def test_clear_cache(self):
        """Test clearing quote cache."""
        self.handler._quote_cache = {"000001.SZ": {"price": 15.5}}
        self.handler.clear_cache()
        assert self.handler._quote_cache == {}

    def test_get_cache_stats(self):
        """Test getting cache statistics."""
        self.handler._quote_cache = {
            "000001.SZ": {"price": 15.5, "timestamp": datetime.utcnow().isoformat()},
            "000002.SZ": {"price": 20.0, "timestamp": datetime.utcnow().isoformat()},
        }

        stats = self.handler.get_cache_stats()
        assert stats["total_symbols"] == 2
        assert stats["cached_symbols"] == ["000001.SZ", "000002.SZ"]


class TestNewsHandler:
    """Test suite for NewsHandler."""

    def setup_method(self):
        """Reset singleton and create handler before each test."""
        EventBusManager._instance = None
        EventBusManager._initialized = False
        self.handler = NewsHandler()

    def test_init(self):
        """Test handler initialization."""
        assert self.handler is not None
        assert self.handler._news_cache == {}
        assert self.handler._sentiment_cache == {}
        assert self.handler._event_bus is not None

    @pytest.mark.asyncio
    async def test_start_not_initialized(self):
        """Test starting handler when event bus not initialized."""
        with pytest.raises(ProviderError, match="EventBusManager not initialized"):
            await self.handler.start()

    @pytest.mark.asyncio
    @patch("ai_service.services.event_handlers.EventBusManager")
    async def test_start_success(self, mock_manager_class):
        """Test successful handler start."""
        mock_manager = Mock()
        mock_manager.is_initialized = True
        mock_manager.subscribe = AsyncMock()
        mock_manager_class.return_value = mock_manager

        handler = NewsHandler()
        await handler.start()

        assert handler._event_bus is mock_manager
        mock_manager.subscribe.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_news_intelligence(self):
        """Test handling news intelligence event."""
        event_data = {
            "stock_code": "000001.SZ",
            "intelligence": "公司发布利好公告",
            "sentiment": "positive",
            "timestamp": datetime.utcnow().isoformat(),
        }

        await self.handler._handle_news_intelligence(event_data)

        assert "000001.SZ" in self.handler._news_cache
        assert "000001.SZ" in self.handler._sentiment_cache
        assert self.handler._sentiment_cache["000001.SZ"] == "positive"

    @pytest.mark.asyncio
    async def test_handle_news_intelligence_list_format(self):
        """Test handling news with list of stock codes."""
        event_data = {
            "stock_code": ["000001.SZ", "000002.SZ"],
            "intelligence": "行业利好消息",
            "sentiment": "positive",
            "timestamp": datetime.utcnow().isoformat(),
        }

        await self.handler._handle_news_intelligence(event_data)

        assert "000001.SZ" in self.handler._news_cache
        assert "000002.SZ" in self.handler._news_cache

    def test_get_news_cached(self):
        """Test getting cached news."""
        self.handler._news_cache["000001.SZ"] = {
            "intelligence": "公司发布利好公告",
            "sentiment": "positive",
            "timestamp": datetime.utcnow().isoformat(),
        }

        news = self.handler.get_news("000001.SZ")
        assert news is not None
        assert news["intelligence"] == "公司发布利好公告"

    def test_get_news_not_cached(self):
        """Test getting non-existent news."""
        news = self.handler.get_news("999999.SZ")
        assert news is None

    def test_get_sentiment_cached(self):
        """Test getting cached sentiment."""
        self.handler._sentiment_cache["000001.SZ"] = "positive"

        sentiment = self.handler.get_sentiment("000001.SZ")
        assert sentiment == "positive"

    def test_get_sentiment_not_cached(self):
        """Test getting non-existent sentiment."""
        sentiment = self.handler.get_sentiment("999999.SZ")
        assert sentiment is None

    def test_get_all_news(self):
        """Test getting all cached news."""
        self.handler._news_cache = {
            "000001.SZ": {"intelligence": "利好"},
            "000002.SZ": {"intelligence": "中性"},
        }

        news = self.handler.get_all_news()
        assert len(news) == 2

    def test_clear_cache(self):
        """Test clearing news cache."""
        self.handler._news_cache = {"000001.SZ": {"intelligence": "利好"}}
        self.handler._sentiment_cache = {"000001.SZ": "positive"}
        self.handler.clear_cache()
        assert self.handler._news_cache == {}
        assert self.handler._sentiment_cache == {}

    def test_get_cache_stats(self):
        """Test getting cache statistics."""
        self.handler._news_cache = {
            "000001.SZ": {"intelligence": "利好"},
            "000002.SZ": {"intelligence": "中性"},
        }
        self.handler._sentiment_cache = {
            "000001.SZ": "positive",
            "000002.SZ": "neutral",
        }

        stats = self.handler.get_cache_stats()
        assert stats["total_news_items"] == 2
        assert stats["sentiment_distribution"]["positive"] == 1
        assert stats["sentiment_distribution"]["neutral"] == 1


class TestEventHandlersIntegration:
    """Integration tests for event handlers."""

    def setup_method(self):
        """Reset singleton before each test."""
        EventBusManager._instance = None
        EventBusManager._initialized = False

    @pytest.mark.asyncio
    @patch("ai_service.services.event_handlers.EventBusManager")
    async def test_handlers_work_together(self, mock_manager_class):
        """Test that both handlers can work together."""
        mock_manager = Mock()
        mock_manager.is_initialized = True
        mock_manager.subscribe = AsyncMock()
        mock_manager_class.return_value = mock_manager

        market_handler = MarketDataHandler()
        news_handler = NewsHandler()

        await market_handler.start()
        await news_handler.start()

        # Simulate receiving events
        await market_handler._handle_market_quote({
            "symbol": "000001.SZ",
            "price": 15.5,
            "change": 0.5,
            "volume": 1000000,
            "timestamp": datetime.utcnow().isoformat(),
        })

        await news_handler._handle_news_intelligence({
            "stock_code": "000001.SZ",
            "intelligence": "公司发布利好公告",
            "sentiment": "positive",
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Verify both caches have the data
        assert market_handler.get_quote("000001.SZ") is not None
        assert news_handler.get_news("000001.SZ") is not None
