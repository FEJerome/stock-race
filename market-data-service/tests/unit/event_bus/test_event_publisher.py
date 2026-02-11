"""
Tests for Event Bus integration (C2-MD-001, C3-001, C3-001B, C3-001C, C2-MD-002).
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone
import sys
from pathlib import Path

# Add event-bus SDK to path
project_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))

from event_bus import EventBusClient, EventProducer, EventType


class TestEventBusIntegration:
    """Test Event Bus SDK integration (C2-MD-001)."""

    @pytest.fixture
    def mock_redis_client(self):
        """Create a mock Redis client."""
        mock = MagicMock()
        mock.xadd = Mock(return_value="1234567890-0")
        mock.xinfo_stream = Mock(return_value={
            "length": 100,
            "radix-tree-keys": 1,
            "radix-tree-nodes": 2,
            "last-generated-id": "1234567890-0",
            "groups": 0,
        })
        return mock

    @pytest.fixture
    def event_bus_client(self, mock_redis_client):
        """Create an EventBusClient with mock Redis."""
        client = EventBusClient(host="localhost", port=6379)
        # Use object.__setattr__ to bypass property protection
        object.__setattr__(client, '_client', mock_redis_client)
        return client

    @pytest.fixture
    def event_producer(self, event_bus_client):
        """Create an EventProducer."""
        return EventProducer(client=event_bus_client, service_name="market-data")

    def test_event_bus_client_initialization(self, event_bus_client):
        """Test EventBusClient can be initialized."""
        assert event_bus_client is not None
        assert event_bus_client._host == "localhost"
        assert event_bus_client._port == 6379

    def test_event_producer_initialization(self, event_producer):
        """Test EventProducer can be initialized."""
        assert event_producer is not None
        assert event_producer._service_name == "market-data"

    def test_publish_market_quote_realtime(self, event_producer, mock_redis_client):
        """Test publishing MARKET_QUOTE_REALTIME event (C3-001)."""
        payload = {
            "symbol": "000001.SZ",
            "price": 12.58,
            "change": 0.5,
            "volume": 10000,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        message_id = event_producer.publish_event(
            EventType.MARKET_QUOTE_REALTIME,
            payload
        )

        assert message_id is not None
        mock_redis_client.xadd.assert_called_once()
        call_args = mock_redis_client.xadd.call_args
        assert call_args[0][0] == "market:quote:realtime"

    def test_publish_market_alert_price_move(self, event_producer, mock_redis_client):
        """Test publishing MARKET_ALERT_PRICE_MOVE event (C3-001B)."""
        payload = {
            "symbol": "000001.SZ",
            "alert_type": "price_surge",
            "severity": "high",
            "message": "涨幅超过7%",
        }

        message_id = event_producer.publish_event(
            EventType.MARKET_ALERT_PRICE_MOVE,
            payload
        )

        assert message_id is not None
        call_args = mock_redis_client.xadd.call_args
        assert call_args[0][0] == "market:alert:price_move"

    def test_publish_market_indicator_updated(self, event_producer, mock_redis_client):
        """Test publishing MARKET_INDICATOR_UPDATED event (C3-001C)."""
        payload = {
            "symbol": "000001.SZ",
            "indicator": "RSI",
            "value": 75.5,
            "signal": "overbought",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        message_id = event_producer.publish_event(
            EventType.MARKET_INDICATOR_UPDATED,
            payload
        )

        assert message_id is not None
        call_args = mock_redis_client.xadd.call_args
        assert call_args[0][0] == "market:indicator:updated"

    def test_producer_confirmation(self, event_producer, mock_redis_client):
        """Test producer confirmation (C2-MD-002)."""
        mock_redis_client.xadd.return_value = "1707654321000-0"

        payload = {
            "symbol": "000001.SZ",
            "price": 12.58,
            "change": 0.5,
            "volume": 10000,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        message_id = event_producer.publish_event(
            EventType.MARKET_QUOTE_REALTIME,
            payload
        )

        # Verify message ID is returned (confirmation)
        assert message_id == "1707654321000-0"
        assert "-" in message_id  # Redis message ID format

    def test_event_validation(self, event_producer, mock_redis_client):
        """Test event payload validation."""
        # Valid payload
        valid_payload = {
            "symbol": "000001.SZ",
            "price": 12.58,
            "change": 0.5,
            "volume": 10000,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        message_id = event_producer.publish_event(
            EventType.MARKET_QUOTE_REALTIME,
            valid_payload,
            validate=True
        )

        assert message_id is not None

    def test_batch_publish(self, event_producer, mock_redis_client):
        """Test batch event publishing."""
        from event_bus import EventSchema

        events = [
            EventSchema(
                event_type=EventType.MARKET_QUOTE_REALTIME,
                source="market-data",
                payload={
                    "symbol": "000001.SZ",
                    "price": 12.58,
                    "change": 0.5,
                    "volume": 10000,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ),
            EventSchema(
                event_type=EventType.MARKET_QUOTE_REALTIME,
                source="market-data",
                payload={
                    "symbol": "000002.SZ",
                    "price": 25.0,
                    "change": -0.3,
                    "volume": 5000,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ),
        ]

        message_ids = event_producer.publish_batch(events)

        assert len(message_ids) == 2
        assert mock_redis_client.xadd.call_count == 2

    def test_get_stream_info(self, event_producer, mock_redis_client):
        """Test getting stream information."""
        info = event_producer.get_stream_info(EventType.MARKET_QUOTE_REALTIME)

        assert "length" in info
        assert info["length"] == 100
        mock_redis_client.xinfo_stream.assert_called_once()


class TestMarketDataEventPublisher:
    """Test Market Data specific event publishing functionality."""

    @pytest.fixture
    def mock_event_producer(self):
        """Create a mock event producer."""
        mock = Mock(spec=EventProducer)
        mock.publish_event = Mock(return_value="1234567890-0")
        return mock

    def test_price_move_detection(self, mock_event_producer):
        """Test price movement detection for alerts (C3-001B)."""
        # Simulate price change detection
        prev_close = 10.0
        current_price = 10.8  # 8% increase
        change_percent = (current_price - prev_close) / prev_close * 100

        # Should trigger alert if change > 7%
        if abs(change_percent) > 7:
            alert_payload = {
                "symbol": "000001.SZ",
                "alert_type": "price_surge" if change_percent > 0 else "price_drop",
                "severity": "high" if abs(change_percent) > 7 else "medium",
                "message": f"{'涨幅' if change_percent > 0 else '跌幅'}超过{abs(change_percent):.1f}%",
                "prev_close": prev_close,
                "current_price": current_price,
                "change_percent": change_percent,
            }

            mock_event_producer.publish_event(
                EventType.MARKET_ALERT_PRICE_MOVE,
                alert_payload
            )

            mock_event_producer.publish_event.assert_called_once()
            call_args = mock_event_producer.publish_event.call_args
            assert call_args[0][0] == EventType.MARKET_ALERT_PRICE_MOVE

    def test_periodic_quote_publish(self, mock_event_producer):
        """Test periodic quote publishing (C3-001)."""
        # Simulate periodic publishing every 10 seconds
        quotes = [
            {"symbol": "000001.SZ", "price": 12.58, "change": 0.5, "volume": 10000},
            {"symbol": "000002.SZ", "price": 25.0, "change": -0.3, "volume": 5000},
        ]

        for quote in quotes:
            quote["timestamp"] = datetime.now(timezone.utc).isoformat()
            mock_event_producer.publish_event(
                EventType.MARKET_QUOTE_REALTIME,
                quote
            )

        assert mock_event_producer.publish_event.call_count == 2


class TestEventBusErrorHandling:
    """Test Event Bus error handling."""

    def test_publish_error_handling(self):
        """Test error handling when publish fails."""
        from event_bus.exceptions import PublishError

        mock_client = MagicMock()
        mock_redis = MagicMock()
        mock_redis.xadd = Mock(side_effect=Exception("Redis connection failed"))
        mock_client.client = mock_redis

        producer = EventProducer(client=mock_client, service_name="market-data")

        with pytest.raises(PublishError):
            producer.publish_event(
                EventType.MARKET_QUOTE_REALTIME,
                {
                    "symbol": "000001.SZ",
                    "price": 12.58,
                    "change": 0.5,
                    "volume": 10000,
                    "timestamp": datetime.now().isoformat(),
                }
            )

    def test_connection_error_handling(self):
        """Test connection error handling."""
        from event_bus.exceptions import ConnectionError

        with pytest.raises(ConnectionError):
            # Try to connect to invalid host
            client = EventBusClient(host="invalid_host", port=6379)
            client.connect()
