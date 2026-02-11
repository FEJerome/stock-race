"""
Event handlers for Trading AI Service.

Handles subscription to market data and news events from the event bus.
Caches received data for use in AI decision making.
"""

import sys
from pathlib import Path
from typing import Dict, Any, Optional, List, Union
from datetime import datetime
from loguru import logger

# Add event-bus SDK to path
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))

from .event_bus_manager import EventBusManager
from ..core.exceptions import ProviderError


class MarketDataHandler:
    """
    Handler for market data events.

    Subscribes to real-time market quotes and maintains a local cache
    for quick access during AI decision making.
    """

    def __init__(self):
        """Initialize the market data handler."""
        self._quote_cache: Dict[str, Dict[str, Any]] = {}
        self._event_bus = EventBusManager()

    async def start(self) -> None:
        """
        Start the handler and subscribe to market data events.

        Raises:
            ProviderError: If EventBusManager is not initialized.
        """
        if not self._event_bus.is_initialized:
            raise ProviderError(
                message="EventBusManager not initialized",
                error_code="EVENT_BUS_NOT_INITIALIZED"
            )

        try:
            from event_bus import EventType

            # Subscribe to real-time market quotes
            await self._event_bus.subscribe(
                EventType.MARKET_QUOTE_REALTIME.value,
                self._handle_market_quote
            )
            logger.info("📈 Subscribed to market:quote:realtime events")

        except Exception as e:
            logger.error(f"❌ Failed to start MarketDataHandler: {e}")
            raise

    async def _handle_market_quote(self, event_data: Dict[str, Any]) -> None:
        """
        Handle incoming market quote event.

        Args:
            event_data: Event payload containing symbol, price, change, volume, timestamp.
        """
        try:
            symbol = event_data.get("symbol")
            if not symbol:
                logger.warning("⚠️ Market quote event missing symbol")
                return

            # Validate required fields
            required_fields = ["price", "change", "volume", "timestamp"]
            for field in required_fields:
                if field not in event_data:
                    logger.warning(f"⚠️ Market quote event for {symbol} missing {field}")
                    return

            # Cache the quote data
            self._quote_cache[symbol] = {
                "price": float(event_data["price"]),
                "change": float(event_data["change"]),
                "change_percent": float(event_data.get("change_percent", 0)),
                "volume": int(event_data["volume"]),
                "timestamp": event_data["timestamp"],
                "high": float(event_data.get("high", 0)),
                "low": float(event_data.get("low", 0)),
                "open": float(event_data.get("open", 0)),
                "previous_close": float(event_data.get("previous_close", 0)),
                "received_at": datetime.utcnow().isoformat(),
            }

            logger.debug(f"📊 Cached quote for {symbol}: {event_data['price']}")

        except Exception as e:
            logger.error(f"❌ Error handling market quote event: {e}")

    def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Get cached quote data for a symbol.

        Args:
            symbol: Stock symbol (e.g., "000001.SZ")

        Returns:
            Quote data dict or None if not cached.
        """
        return self._quote_cache.get(symbol)

    def get_all_quotes(self) -> Dict[str, Dict[str, Any]]:
        """
        Get all cached quotes.

        Returns:
            Dictionary of symbol -> quote data.
        """
        return self._quote_cache.copy()

    def get_symbols(self) -> List[str]:
        """
        Get list of all cached symbols.

        Returns:
            List of stock symbols.
        """
        return list(self._quote_cache.keys())

    def clear_cache(self) -> None:
        """Clear all cached quote data."""
        self._quote_cache.clear()
        logger.info("🗑️ Market data cache cleared")

    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.

        Returns:
            Dictionary with cache statistics.
        """
        return {
            "total_symbols": len(self._quote_cache),
            "cached_symbols": list(self._quote_cache.keys()),
            "cache_size_bytes": sum(
                len(str(v)) for v in self._quote_cache.values()
            ),
        }


class NewsHandler:
    """
    Handler for news and intelligence events.

    Subscribes to news intelligence extracted events and maintains a local cache
    for sentiment analysis and decision making.
    """

    def __init__(self):
        """Initialize the news handler."""
        self._news_cache: Dict[str, Dict[str, Any]] = {}
        self._sentiment_cache: Dict[str, str] = {}
        self._event_bus = EventBusManager()

    async def start(self) -> None:
        """
        Start the handler and subscribe to news events.

        Raises:
            ProviderError: If EventBusManager is not initialized.
        """
        if not self._event_bus.is_initialized:
            raise ProviderError(
                message="EventBusManager not initialized",
                error_code="EVENT_BUS_NOT_INITIALIZED"
            )

        try:
            from event_bus import EventType

            # Subscribe to news intelligence events
            await self._event_bus.subscribe(
                EventType.NEWS_INTELLIGENCE_EXTRACTED.value,
                self._handle_news_intelligence
            )
            logger.info("📰 Subscribed to news:intelligence:extracted events")

        except Exception as e:
            logger.error(f"❌ Failed to start NewsHandler: {e}")
            raise

    async def _handle_news_intelligence(self, event_data: Dict[str, Any]) -> None:
        """
        Handle incoming news intelligence event.

        Args:
            event_data: Event payload containing stock_code, intelligence, sentiment, timestamp.
        """
        try:
            stock_codes = event_data.get("stock_code")
            if not stock_codes:
                logger.warning("⚠️ News intelligence event missing stock_code")
                return

            # Handle single stock code or list of codes
            if isinstance(stock_codes, str):
                stock_codes = [stock_codes]

            intelligence = event_data.get("intelligence", "")
            sentiment = event_data.get("sentiment", "neutral")
            timestamp = event_data.get("timestamp", datetime.utcnow().isoformat())

            # Cache for each stock code
            for code in stock_codes:
                self._news_cache[code] = {
                    "intelligence": intelligence,
                    "sentiment": sentiment,
                    "timestamp": timestamp,
                    "received_at": datetime.utcnow().isoformat(),
                    "source": event_data.get("source", "unknown"),
                }
                self._sentiment_cache[code] = sentiment

                logger.debug(f"📰 Cached news for {code}: {sentiment}")

        except Exception as e:
            logger.error(f"❌ Error handling news intelligence event: {e}")

    def get_news(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        Get cached news for a stock code.

        Args:
            stock_code: Stock code (e.g., "000001.SZ")

        Returns:
            News data dict or None if not cached.
        """
        return self._news_cache.get(stock_code)

    def get_sentiment(self, stock_code: str) -> Optional[str]:
        """
        Get cached sentiment for a stock code.

        Args:
            stock_code: Stock code (e.g., "000001.SZ")

        Returns:
            Sentiment string (positive/negative/neutral) or None.
        """
        return self._sentiment_cache.get(stock_code)

    def get_all_news(self) -> Dict[str, Dict[str, Any]]:
        """
        Get all cached news.

        Returns:
            Dictionary of stock_code -> news data.
        """
        return self._news_cache.copy()

    def get_sentiment_summary(self) -> Dict[str, int]:
        """
        Get summary of sentiment distribution.

        Returns:
            Dictionary with sentiment counts.
        """
        summary = {"positive": 0, "negative": 0, "neutral": 0}
        for sentiment in self._sentiment_cache.values():
            if sentiment in summary:
                summary[sentiment] += 1
        return summary

    def clear_cache(self) -> None:
        """Clear all cached news data."""
        self._news_cache.clear()
        self._sentiment_cache.clear()
        logger.info("🗑️ News cache cleared")

    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.

        Returns:
            Dictionary with cache statistics.
        """
        sentiment_dist = self.get_sentiment_summary()
        return {
            "total_news_items": len(self._news_cache),
            "cached_codes": list(self._news_cache.keys()),
            "sentiment_distribution": sentiment_dist,
            "cache_size_bytes": sum(
                len(str(v)) for v in self._news_cache.values()
            ),
        }


class EventHandlerManager:
    """
    Manager for all event handlers.

    Provides a unified interface to start/stop all handlers
    and access cached data.
    """

    def __init__(self):
        """Initialize the handler manager."""
        self._market_handler = MarketDataHandler()
        self._news_handler = NewsHandler()
        self._started = False

    async def start(self) -> None:
        """Start all event handlers."""
        try:
            await self._market_handler.start()
            await self._news_handler.start()
            self._started = True
            logger.info("✅ All event handlers started successfully")
        except Exception as e:
            logger.error(f"❌ Failed to start event handlers: {e}")
            raise

    def stop(self) -> None:
        """Stop all event handlers and clear caches."""
        self._market_handler.clear_cache()
        self._news_handler.clear_cache()
        self._started = False
        logger.info("✅ All event handlers stopped")

    @property
    def is_started(self) -> bool:
        """Check if handlers are started."""
        return self._started

    @property
    def market_handler(self) -> MarketDataHandler:
        """Get the market data handler."""
        return self._market_handler

    @property
    def news_handler(self) -> NewsHandler:
        """Get the news handler."""
        return self._news_handler

    def get_combined_data(self, symbol: str) -> Dict[str, Any]:
        """
        Get combined market and news data for a symbol.

        Args:
            symbol: Stock symbol (e.g., "000001.SZ")

        Returns:
            Dictionary with market quote and news data.
        """
        return {
            "symbol": symbol,
            "market_data": self._market_handler.get_quote(symbol),
            "news": self._news_handler.get_news(symbol),
            "sentiment": self._news_handler.get_sentiment(symbol),
            "timestamp": datetime.utcnow().isoformat(),
        }

    def get_all_data(self) -> Dict[str, Any]:
        """
        Get all cached data.

        Returns:
            Dictionary with all market quotes and news.
        """
        return {
            "market_quotes": self._market_handler.get_all_quotes(),
            "news": self._news_handler.get_all_news(),
            "sentiment_summary": self._news_handler.get_sentiment_summary(),
            "timestamp": datetime.utcnow().isoformat(),
        }

    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics for all handlers.

        Returns:
            Dictionary with handler statistics.
        """
        return {
            "started": self._started,
            "market_data": self._market_handler.get_cache_stats(),
            "news": self._news_handler.get_cache_stats(),
        }
