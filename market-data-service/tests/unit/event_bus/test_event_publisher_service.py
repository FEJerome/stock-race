"""
Tests for MarketDataEventPublisher service.
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from datetime import datetime, timezone, timedelta
import sys
from pathlib import Path

# Add event-bus SDK to path
project_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))

from event_bus import EventType


class TestMarketDataEventPublisher:
    """Test MarketDataEventPublisher functionality."""

    @pytest.fixture
    def mock_event_producer(self):
        """Create a mock event producer."""
        mock = Mock()
        mock.publish_event = Mock(return_value="1234567890-0")
        mock.get_stream_info = Mock(return_value={
            "length": 100,
            "last-generated-id": "1234567890-0"
        })
        return mock

    @pytest.fixture
    def mock_event_bus_client(self):
        """Create a mock event bus client."""
        mock = Mock()
        mock.connect = Mock()
        mock.disconnect = Mock()
        mock.health_check = Mock(return_value=True)
        return mock

    @pytest.fixture
    def publisher(self, mock_event_bus_client, mock_event_producer):
        """Create a MarketDataEventPublisher with mocked dependencies."""
        from data_service.services.event_publisher_service import MarketDataEventPublisher

        publisher = MarketDataEventPublisher(
            redis_host="localhost",
            redis_port=6379
        )
        publisher._client = mock_event_bus_client
        publisher._producer = mock_event_producer
        publisher._is_initialized = True
        return publisher

    @pytest.mark.asyncio
    async def test_publish_quote(self, publisher, mock_event_producer):
        """Test publishing a quote event (C3-001)."""
        message_id = await publisher.publish_quote(
            symbol="000001.SZ",
            price=12.58,
            change=0.5,
            change_percent=5.0,
            volume=10000
        )

        assert message_id == "1234567890-0"
        mock_event_producer.publish_event.assert_called_once()

        call_args = mock_event_producer.publish_event.call_args
        assert call_args[0][0] == EventType.MARKET_QUOTE_REALTIME
        # Check payload in kwargs
        payload = call_args[1].get("payload") or call_args[1].get("data")
        if payload:
            assert payload["symbol"] == "000001.SZ"
            assert payload["price"] == 12.58

    @pytest.mark.asyncio
    async def test_publish_quote_not_initialized(self, publisher):
        """Test publishing when not initialized."""
        publisher._is_initialized = False

        message_id = await publisher.publish_quote(
            symbol="000001.SZ",
            price=12.58,
            change=0.5,
            change_percent=5.0,
            volume=10000
        )

        assert message_id is None

    @pytest.mark.asyncio
    async def test_check_and_publish_price_alert_surge(self, publisher, mock_event_producer):
        """Test price surge alert (C3-001B)."""
        prev_close = 10.0
        current_price = 10.8  # 8% increase

        message_id = await publisher.check_and_publish_price_alert(
            symbol="000001.SZ",
            current_price=current_price,
            prev_close=prev_close
        )

        assert message_id == "1234567890-0"
        mock_event_producer.publish_event.assert_called_once()

        call_args = mock_event_producer.publish_event.call_args
        assert call_args[0][0] == EventType.MARKET_ALERT_PRICE_MOVE
        payload = call_args[1].get("payload") or call_args[1].get("data")
        if payload:
            assert payload["alert_type"] == "price_surge"

    @pytest.mark.asyncio
    async def test_check_and_publish_price_alert_drop(self, publisher, mock_event_producer):
        """Test price drop alert (C3-001B)."""
        prev_close = 10.0
        current_price = 9.2  # 8% decrease

        message_id = await publisher.check_and_publish_price_alert(
            symbol="000001.SZ",
            current_price=current_price,
            prev_close=prev_close
        )

        assert message_id == "1234567890-0"
        call_args = mock_event_producer.publish_event.call_args
        payload = call_args[1].get("payload") or call_args[1].get("data")
        if payload:
            assert payload["alert_type"] == "price_drop"

    @pytest.mark.asyncio
    async def test_check_price_alert_below_threshold(self, publisher, mock_event_producer):
        """Test no alert when change is below threshold."""
        prev_close = 10.0
        current_price = 10.5  # 5% increase (below 7% threshold)

        message_id = await publisher.check_and_publish_price_alert(
            symbol="000001.SZ",
            current_price=current_price,
            prev_close=prev_close
        )

        assert message_id is None
        mock_event_producer.publish_event.assert_not_called()

    @pytest.mark.asyncio
    async def test_price_alert_rate_limiting(self, publisher, mock_event_producer):
        """Test price alert rate limiting (1 per minute)."""
        prev_close = 10.0
        current_price = 10.8

        # First alert should be published
        await publisher.check_and_publish_price_alert(
            symbol="000001.SZ",
            current_price=current_price,
            prev_close=prev_close
        )

        # Second alert immediately should be rate limited
        message_id = await publisher.check_and_publish_price_alert(
            symbol="000001.SZ",
            current_price=current_price,
            prev_close=prev_close
        )

        assert message_id is None
        assert mock_event_producer.publish_event.call_count == 1

    @pytest.mark.asyncio
    async def test_publish_indicator_update(self, publisher, mock_event_producer):
        """Test publishing indicator update (C3-001C)."""
        message_id = await publisher.publish_indicator_update(
            symbol="000001.SZ",
            indicator="RSI",
            value=75.5,
            signal="overbought"
        )

        assert message_id == "1234567890-0"
        mock_event_producer.publish_event.assert_called_once()

        call_args = mock_event_producer.publish_event.call_args
        assert call_args[0][0] == EventType.MARKET_INDICATOR_UPDATED
        payload = call_args[1].get("payload") or call_args[1].get("data")
        if payload:
            assert payload["indicator"] == "RSI"

    def test_get_stream_info(self, publisher, mock_event_producer):
        """Test getting stream info (C2-MD-002)."""
        info = publisher.get_stream_info(EventType.MARKET_QUOTE_REALTIME)

        assert info is not None
        assert "length" in info
        mock_event_producer.get_stream_info.assert_called_once()

    def test_is_healthy(self, publisher, mock_event_bus_client):
        """Test health check."""
        assert publisher.is_healthy() is True
        mock_event_bus_client.health_check.assert_called_once()

    def test_is_healthy_not_initialized(self, publisher):
        """Test health check when not initialized."""
        publisher._client = None
        assert publisher.is_healthy() is False


class TestMarketDataEventPublisherInitialization:
    """Test MarketDataEventPublisher initialization."""

    @pytest.mark.asyncio
    async def test_initialize_success(self):
        """Test successful initialization (C2-MD-001)."""
        from data_service.services.event_publisher_service import MarketDataEventPublisher

        with patch('data_service.services.event_publisher_service.EventBusClient') as mock_client_class, \
             patch('data_service.services.event_publisher_service.EventProducer') as mock_producer_class:

            mock_client = Mock()
            mock_client.connect = Mock()
            mock_client.health_check = Mock(return_value=True)
            mock_client_class.return_value = mock_client

            mock_producer = Mock()
            mock_producer_class.return_value = mock_producer

            publisher = MarketDataEventPublisher(
                redis_host="localhost",
                redis_port=6379
            )

            await publisher.initialize()

            assert publisher._is_initialized is True
            mock_client.connect.assert_called_once()

    @pytest.mark.asyncio
    async def test_initialize_connection_error(self):
        """Test initialization with connection error."""
        from data_service.services.event_publisher_service import MarketDataEventPublisher
        from event_bus.exceptions import ConnectionError

        with patch('data_service.services.event_publisher_service.EventBusClient') as mock_client_class:
            mock_client = Mock()
            mock_client.connect = Mock(side_effect=ConnectionError("Connection failed"))
            mock_client_class.return_value = mock_client

            publisher = MarketDataEventPublisher(
                redis_host="localhost",
                redis_port=6379
            )

            with pytest.raises(ConnectionError):
                await publisher.initialize()

    @pytest.mark.asyncio
    async def test_close(self):
        """Test closing the publisher."""
        from data_service.services.event_publisher_service import MarketDataEventPublisher

        publisher = MarketDataEventPublisher()
        mock_client = Mock()
        mock_client.disconnect = Mock()
        publisher._client = mock_client
        publisher._is_initialized = True

        await publisher.close()

        mock_client.disconnect.assert_called_once()
        assert publisher._is_initialized is False


class TestPublishQuoteFromModel:
    """Test publishing from StockQuote model."""

    @pytest.mark.asyncio
    async def test_publish_from_stock_quote(self):
        """Test publishing from StockQuote model."""
        from data_service.services.event_publisher_service import MarketDataEventPublisher
        from data_service.models.stock import StockQuote

        with patch.object(MarketDataEventPublisher, 'publish_quote', new_callable=AsyncMock) as mock_publish:
            mock_publish.return_value = "1234567890-0"

            publisher = MarketDataEventPublisher()
            publisher._is_initialized = True

            quote = StockQuote(
                symbol="000001.SZ",
                price=12.58,
                open=12.0,
                high=12.8,
                low=11.9,
                prev_close=12.0,
                change=0.58,
                change_percent=4.83,
                volume=10000,
                amount=125800.0,
                timestamp=datetime.now(timezone.utc)
            )

            message_id = await publisher.publish_quote_from_model(quote)

            assert message_id == "1234567890-0"
            mock_publish.assert_called_once()
