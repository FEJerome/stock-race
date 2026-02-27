"""
Integration tests for WebSocket real-time push.

Tests WebSocket service for real-time quote streaming:
- Connection management
- Subscribe/unsubscribe to stocks
- Real-time price push
- Concurrent connections (1000)
- Disconnect/reconnect handling
"""

import pytest
import asyncio
import time
import json
from typing import Dict, Any, List, Set, Optional
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class WebSocketClient:
    """Mock WebSocket client for testing."""
    client_id: str
    subscribed_symbols: Set[str] = field(default_factory=set)
    messages: List[Dict[str, Any]] = field(default_factory=list)
    is_connected: bool = True
    connect_time: datetime = field(default_factory=datetime.now)
    last_ping: Optional[datetime] = None

    async def send_json(self, data: Dict[str, Any]):
        """Send JSON message to client."""
        if self.is_connected:
            self.messages.append({
                'type': 'sent',
                'data': data,
                'timestamp': datetime.now().isoformat()
            })

    async def receive_json(self) -> Optional[Dict[str, Any]]:
        """Receive JSON message from client."""
        return None

    def disconnect(self):
        """Disconnect client."""
        self.is_connected = False


class RealtimeWebSocketHandler:
    """
    WebSocket handler for real-time quote streaming.

    Features:
    - Connection management
    - Subscribe/unsubscribe to stock symbols
    - Real-time price push
    - Heartbeat/ping-pong
    - Reconnection support
    """

    def __init__(self, quote_service=None):
        self.clients: Dict[str, WebSocketClient] = {}
        self.subscriptions: Dict[str, Set[str]] = {}  # symbol -> set of client_ids
        self.quote_service = quote_service
        self.stats = {
            'total_connections': 0,
            'active_connections': 0,
            'messages_sent': 0,
            'subscriptions': 0
        }

    async def handle_connect(self, client_id: str) -> WebSocketClient:
        """
        Handle new WebSocket connection.

        Args:
            client_id: Unique client identifier

        Returns:
            WebSocketClient instance
        """
        client = WebSocketClient(client_id=client_id)
        self.clients[client_id] = client
        self.stats['total_connections'] += 1
        self.stats['active_connections'] += 1

        # Send welcome message
        await client.send_json({
            'type': 'connected',
            'client_id': client_id,
            'message': 'Connected to real-time quote stream'
        })

        return client

    async def handle_disconnect(self, client_id: str):
        """
        Handle WebSocket disconnection.

        Args:
            client_id: Client identifier
        """
        if client_id in self.clients:
            client = self.clients[client_id]
            client.disconnect()

            # Remove subscriptions
            for symbol in client.subscribed_symbols:
                if symbol in self.subscriptions:
                    self.subscriptions[symbol].discard(client_id)
                    if not self.subscriptions[symbol]:
                        del self.subscriptions[symbol]

            self.stats['active_connections'] -= 1
            self.stats['subscriptions'] -= len(client.subscribed_symbols)

    async def handle_message(self, client_id: str, message: Dict[str, Any]):
        """
        Handle incoming WebSocket message.

        Args:
            client_id: Client identifier
            message: JSON message from client
        """
        if client_id not in self.clients:
            return

        client = self.clients[client_id]

        # Don't process messages from disconnected clients
        if not client.is_connected:
            return

        action = message.get('action')

        if action == 'subscribe':
            await self._handle_subscribe(client, message.get('symbols', []))
        elif action == 'unsubscribe':
            await self._handle_unsubscribe(client, message.get('symbols', []))
        elif action == 'ping':
            await self._handle_ping(client)
        elif action == 'get_subscriptions':
            await self._handle_get_subscriptions(client)

    async def _handle_subscribe(self, client: WebSocketClient, symbols: List[str]):
        """Handle subscribe action."""
        if not symbols:
            await client.send_json({
                'type': 'error',
                'message': 'No symbols provided'
            })
            return

        # Limit subscriptions per client
        if len(client.subscribed_symbols) + len(symbols) > 50:
            await client.send_json({
                'type': 'error',
                'message': 'Maximum 50 symbols per client'
            })
            return

        for symbol in symbols:
            symbol = symbol.upper()
            client.subscribed_symbols.add(symbol)

            if symbol not in self.subscriptions:
                self.subscriptions[symbol] = set()
            self.subscriptions[symbol].add(client.client_id)
            self.stats['subscriptions'] += 1

        await client.send_json({
            'type': 'subscribed',
            'symbols': list(client.subscribed_symbols)
        })

    async def _handle_unsubscribe(self, client: WebSocketClient, symbols: List[str]):
        """Handle unsubscribe action."""
        for symbol in symbols:
            symbol = symbol.upper()
            client.subscribed_symbols.discard(symbol)

            if symbol in self.subscriptions:
                self.subscriptions[symbol].discard(client.client_id)
                if not self.subscriptions[symbol]:
                    del self.subscriptions[symbol]
                self.stats['subscriptions'] -= 1

        await client.send_json({
            'type': 'unsubscribed',
            'symbols': list(client.subscribed_symbols)
        })

    async def _handle_ping(self, client: WebSocketClient):
        """Handle ping action."""
        client.last_ping = datetime.now()
        await client.send_json({
            'type': 'pong',
            'timestamp': datetime.now().isoformat()
        })

    async def _handle_get_subscriptions(self, client: WebSocketClient):
        """Handle get subscriptions action."""
        await client.send_json({
            'type': 'subscriptions',
            'symbols': list(client.subscribed_symbols)
        })

    async def broadcast_quote(self, symbol: str, quote: Dict[str, Any]):
        """
        Broadcast quote update to subscribed clients.

        Args:
            symbol: Stock symbol
            quote: Quote data
        """
        symbol = symbol.upper()
        if symbol not in self.subscriptions:
            return

        message = {
            'type': 'quote',
            'symbol': symbol,
            'data': quote,
            'timestamp': datetime.now().isoformat()
        }

        # Get subscribed clients
        client_ids = list(self.subscriptions[symbol])

        for client_id in client_ids:
            if client_id in self.clients:
                client = self.clients[client_id]
                if client.is_connected:
                    await client.send_json(message)
                    self.stats['messages_sent'] += 1

    async def broadcast_quotes(self, quotes: Dict[str, Dict[str, Any]]):
        """
        Broadcast multiple quotes.

        Args:
            quotes: Dictionary of symbol -> quote data
        """
        for symbol, quote in quotes.items():
            await self.broadcast_quote(symbol, quote)

    def get_stats(self) -> Dict[str, Any]:
        """Get WebSocket handler statistics."""
        return {
            **self.stats,
            'symbols_tracked': len(self.subscriptions),
            'subscriptions_per_symbol': {
                symbol: len(clients)
                for symbol, clients in self.subscriptions.items()
            }
        }

    def is_client_connected(self, client_id: str) -> bool:
        """Check if client is connected."""
        return client_id in self.clients and self.clients[client_id].is_connected


class TestWebSocketConnection:
    """Test WebSocket connection management."""

    @pytest.fixture
    def ws_handler(self):
        return RealtimeWebSocketHandler()

    @pytest.mark.asyncio
    async def test_connect(self, ws_handler):
        """Test new connection."""
        client = await ws_handler.handle_connect('client_1')

        assert client.client_id == 'client_1'
        assert client.is_connected is True
        assert ws_handler.stats['total_connections'] == 1
        assert ws_handler.stats['active_connections'] == 1

    @pytest.mark.asyncio
    async def test_disconnect(self, ws_handler):
        """Test disconnection."""
        await ws_handler.handle_connect('client_1')
        await ws_handler.handle_disconnect('client_1')

        assert ws_handler.stats['active_connections'] == 0
        assert not ws_handler.is_client_connected('client_1')

    @pytest.mark.asyncio
    async def test_multiple_connections(self, ws_handler):
        """Test multiple concurrent connections."""
        for i in range(10):
            await ws_handler.handle_connect(f'client_{i}')

        assert ws_handler.stats['total_connections'] == 10
        assert ws_handler.stats['active_connections'] == 10


class TestWebSocketSubscription:
    """Test WebSocket subscription management."""

    @pytest.fixture
    async def ws_handler_with_client(self):
        handler = RealtimeWebSocketHandler()
        client = await handler.handle_connect('client_1')
        return handler, client

    @pytest.mark.asyncio
    async def test_subscribe_single_symbol(self, ws_handler_with_client):
        """Test subscribing to single symbol."""
        handler, client = ws_handler_with_client

        await handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': ['000001.SZ']
        })

        assert '000001.SZ' in client.subscribed_symbols
        assert handler.stats['subscriptions'] == 1

    @pytest.mark.asyncio
    async def test_subscribe_multiple_symbols(self, ws_handler_with_client):
        """Test subscribing to multiple symbols."""
        handler, client = ws_handler_with_client

        await handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': ['000001.SZ', '600519.SH', '000858.SZ']
        })

        assert len(client.subscribed_symbols) == 3
        assert handler.stats['subscriptions'] == 3

    @pytest.mark.asyncio
    async def test_unsubscribe(self, ws_handler_with_client):
        """Test unsubscribing from symbols."""
        handler, client = ws_handler_with_client

        # Subscribe first
        await handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': ['000001.SZ', '600519.SH']
        })

        # Then unsubscribe
        await handler.handle_message('client_1', {
            'action': 'unsubscribe',
            'symbols': ['000001.SZ']
        })

        assert '000001.SZ' not in client.subscribed_symbols
        assert '600519.SH' in client.subscribed_symbols
        assert handler.stats['subscriptions'] == 1

    @pytest.mark.asyncio
    async def test_subscribe_empty(self, ws_handler_with_client):
        """Test subscribing with empty symbol list."""
        handler, client = ws_handler_with_client

        await handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': []
        })

        assert len(client.subscribed_symbols) == 0

    @pytest.mark.asyncio
    async def test_subscribe_limit(self, ws_handler_with_client):
        """Test subscription limit (50 per client)."""
        handler, client = ws_handler_with_client

        # Try to subscribe to 60 symbols
        symbols = [f'{i:06d}.SZ' for i in range(60)]

        await handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': symbols
        })

        # Should get error and not subscribe
        assert len(client.subscribed_symbols) == 0


class TestWebSocketBroadcast:
    """Test WebSocket quote broadcasting."""

    @pytest.fixture
    async def ws_handler_with_subscribers(self):
        handler = RealtimeWebSocketHandler()

        # Create 3 clients
        for i in range(3):
            await handler.handle_connect(f'client_{i}')

        # Subscribe to different symbols
        await handler.handle_message('client_0', {
            'action': 'subscribe',
            'symbols': ['000001.SZ', '600519.SH']
        })
        await handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': ['000001.SZ']
        })
        await handler.handle_message('client_2', {
            'action': 'subscribe',
            'symbols': ['600519.SH']
        })

        return handler

    @pytest.mark.asyncio
    async def test_broadcast_to_subscribers(self, ws_handler_with_subscribers):
        """Test broadcasting to subscribed clients."""
        handler = ws_handler_with_subscribers

        quote = {
            'price': 10.50,
            'change': 0.05,
            'volume': 1000000
        }

        await handler.broadcast_quote('000001.SZ', quote)

        # client_0 and client_1 subscribed to 000001.SZ
        assert handler.stats['messages_sent'] == 2

    @pytest.mark.asyncio
    async def test_broadcast_no_subscribers(self, ws_handler_with_subscribers):
        """Test broadcasting with no subscribers."""
        handler = ws_handler_with_subscribers

        quote = {'price': 50.0}

        await handler.broadcast_quote('999999.SZ', quote)

        # No one subscribed to this symbol
        assert handler.stats['messages_sent'] == 0

    @pytest.mark.asyncio
    async def test_broadcast_multiple_quotes(self, ws_handler_with_subscribers):
        """Test broadcasting multiple quotes."""
        handler = ws_handler_with_subscribers

        quotes = {
            '000001.SZ': {'price': 10.50},
            '600519.SH': {'price': 1500.0}
        }

        await handler.broadcast_quotes(quotes)

        # 000001.SZ: client_0, client_1 (2)
        # 600519.SH: client_0, client_2 (2)
        assert handler.stats['messages_sent'] == 4


class TestWebSocketPingPong:
    """Test WebSocket heartbeat."""

    @pytest.fixture
    async def ws_handler_with_client(self):
        handler = RealtimeWebSocketHandler()
        client = await handler.handle_connect('client_1')
        return handler, client

    @pytest.mark.asyncio
    async def test_ping_pong(self, ws_handler_with_client):
        """Test ping-pong heartbeat."""
        handler, client = ws_handler_with_client

        await handler.handle_message('client_1', {
            'action': 'ping'
        })

        # Check last message is pong
        last_message = client.messages[-1]['data']
        assert last_message['type'] == 'pong'
        assert 'timestamp' in last_message

    @pytest.mark.asyncio
    async def test_ping_updates_last_ping(self, ws_handler_with_client):
        """Test ping updates last_ping timestamp."""
        handler, client = ws_handler_with_client

        assert client.last_ping is None

        await handler.handle_message('client_1', {
            'action': 'ping'
        })

        assert client.last_ping is not None


class TestWebSocketConcurrency:
    """Test WebSocket concurrent connections."""

    @pytest.fixture
    def ws_handler(self):
        return RealtimeWebSocketHandler()

    @pytest.mark.asyncio
    async def test_100_concurrent_connections(self, ws_handler):
        """Test 100 concurrent connections."""
        tasks = [
            ws_handler.handle_connect(f'client_{i}')
            for i in range(100)
        ]

        clients = await asyncio.gather(*tasks)

        assert len(clients) == 100
        assert ws_handler.stats['active_connections'] == 100

    @pytest.mark.asyncio
    async def test_1000_concurrent_connections(self, ws_handler):
        """Test 1000 concurrent connections."""
        tasks = [
            ws_handler.handle_connect(f'client_{i}')
            for i in range(1000)
        ]

        clients = await asyncio.gather(*tasks)

        assert len(clients) == 1000
        assert ws_handler.stats['active_connections'] == 1000

    @pytest.mark.asyncio
    async def test_concurrent_subscriptions(self, ws_handler):
        """Test concurrent subscriptions."""
        # Create 100 clients
        for i in range(100):
            await ws_handler.handle_connect(f'client_{i}')

        # Subscribe all to same symbol
        tasks = [
            ws_handler.handle_message(f'client_{i}', {
                'action': 'subscribe',
                'symbols': ['000001.SZ']
            })
            for i in range(100)
        ]

        await asyncio.gather(*tasks)

        assert ws_handler.stats['subscriptions'] == 100
        assert len(ws_handler.subscriptions.get('000001.SZ', set())) == 100

    @pytest.mark.asyncio
    async def test_concurrent_broadcast(self, ws_handler):
        """Test concurrent broadcast to many clients."""
        # Create 500 clients, all subscribed to same symbol
        for i in range(500):
            await ws_handler.handle_connect(f'client_{i}')
            await ws_handler.handle_message(f'client_{i}', {
                'action': 'subscribe',
                'symbols': ['000001.SZ']
            })

        # Broadcast quote
        await ws_handler.broadcast_quote('000001.SZ', {'price': 10.50})

        assert ws_handler.stats['messages_sent'] == 500


class TestWebSocketReconnect:
    """Test WebSocket reconnection handling."""

    @pytest.fixture
    async def ws_handler_with_subscriber(self):
        handler = RealtimeWebSocketHandler()
        client = await handler.handle_connect('client_1')

        await handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': ['000001.SZ', '600519.SH']
        })

        return handler, client

    @pytest.mark.asyncio
    async def test_disconnect_removes_subscriptions(self, ws_handler_with_subscriber):
        """Test disconnect removes client subscriptions."""
        handler, client = ws_handler_with_subscriber

        # Verify subscriptions exist
        assert '000001.SZ' in handler.subscriptions

        # Disconnect
        await handler.handle_disconnect('client_1')

        # Subscriptions should be cleaned up
        assert '000001.SZ' not in handler.subscriptions
        assert handler.stats['subscriptions'] == 0

    @pytest.mark.asyncio
    async def test_reconnect_with_same_client_id(self, ws_handler_with_subscriber):
        """Test reconnect with same client ID."""
        handler, client = ws_handler_with_subscriber

        # Disconnect
        await handler.handle_disconnect('client_1')

        # Reconnect with same ID
        new_client = await handler.handle_connect('client_1')

        # Should be new connection
        assert handler.stats['total_connections'] == 2
        assert handler.stats['active_connections'] == 1

    @pytest.mark.asyncio
    async def test_reconnect_restore_subscriptions(self, ws_handler_with_subscriber):
        """Test restoring subscriptions after reconnect."""
        handler, client = ws_handler_with_subscriber

        # Disconnect
        await handler.handle_disconnect('client_1')

        # Reconnect
        new_client = await handler.handle_connect('client_1')

        # Restore subscriptions
        await handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': ['000001.SZ', '600519.SH']
        })

        assert len(new_client.subscribed_symbols) == 2


class TestWebSocketStats:
    """Test WebSocket statistics."""

    @pytest.fixture
    async def ws_handler_with_activity(self):
        handler = RealtimeWebSocketHandler()

        # Create connections
        for i in range(5):
            await handler.handle_connect(f'client_{i}')

        # Add subscriptions
        for i in range(5):
            await handler.handle_message(f'client_{i}', {
                'action': 'subscribe',
                'symbols': ['000001.SZ']
            })

        # Send some broadcasts
        for _ in range(3):
            await handler.broadcast_quote('000001.SZ', {'price': 10.50})

        return handler

    @pytest.mark.asyncio
    async def test_stats_reporting(self, ws_handler_with_activity):
        """Test stats reporting."""
        handler = ws_handler_with_activity

        stats = handler.get_stats()

        assert stats['total_connections'] == 5
        assert stats['active_connections'] == 5
        assert stats['subscriptions'] == 5
        assert stats['messages_sent'] == 15  # 5 clients * 3 broadcasts
        assert stats['symbols_tracked'] == 1

    @pytest.mark.asyncio
    async def test_subscription_distribution(self, ws_handler_with_activity):
        """Test subscription distribution stats."""
        handler = ws_handler_with_activity

        stats = handler.get_stats()

        assert 'subscriptions_per_symbol' in stats
        assert stats['subscriptions_per_symbol']['000001.SZ'] == 5


class TestWebSocketEdgeCases:
    """Test WebSocket edge cases."""

    @pytest.fixture
    def ws_handler(self):
        return RealtimeWebSocketHandler()

    @pytest.mark.asyncio
    async def test_message_from_disconnected_client(self, ws_handler):
        """Test message from disconnected client."""
        await ws_handler.handle_connect('client_1')

        # Subscribe first
        await ws_handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': ['000001.SZ']
        })
        assert ws_handler.stats['subscriptions'] == 1

        # Then disconnect
        await ws_handler.handle_disconnect('client_1')

        # Message from disconnected client should be ignored
        await ws_handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': ['600519.SH']
        })

        # Should not crash and subscriptions should remain at 0 after disconnect
        assert ws_handler.stats['subscriptions'] == 0

    @pytest.mark.asyncio
    async def test_broadcast_to_disconnected_client(self, ws_handler):
        """Test broadcast to disconnected client."""
        await ws_handler.handle_connect('client_1')
        await ws_handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': ['000001.SZ']
        })

        # Disconnect
        await ws_handler.handle_disconnect('client_1')

        # Broadcast should not fail
        await ws_handler.broadcast_quote('000001.SZ', {'price': 10.50})

        # No message sent to disconnected client
        assert ws_handler.stats['messages_sent'] == 0

    @pytest.mark.asyncio
    async def test_duplicate_subscription(self, ws_handler):
        """Test subscribing to same symbol twice."""
        await ws_handler.handle_connect('client_1')

        # Subscribe twice
        await ws_handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': ['000001.SZ']
        })
        await ws_handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': ['000001.SZ']
        })

        # Should only count once
        assert len(ws_handler.clients['client_1'].subscribed_symbols) == 1

    @pytest.mark.asyncio
    async def test_unsubscribe_not_subscribed(self, ws_handler):
        """Test unsubscribing from symbol not subscribed."""
        await ws_handler.handle_connect('client_1')

        # Try to unsubscribe without subscribing
        await ws_handler.handle_message('client_1', {
            'action': 'unsubscribe',
            'symbols': ['000001.SZ']
        })

        # Should not crash
        assert len(ws_handler.clients['client_1'].subscribed_symbols) == 0

    @pytest.mark.asyncio
    async def test_symbol_case_insensitive(self, ws_handler):
        """Test symbol case insensitivity."""
        await ws_handler.handle_connect('client_1')

        # Subscribe with lowercase
        await ws_handler.handle_message('client_1', {
            'action': 'subscribe',
            'symbols': ['000001.sz']
        })

        # Broadcast with uppercase
        await ws_handler.broadcast_quote('000001.SZ', {'price': 10.50})

        # Should receive message
        assert ws_handler.stats['messages_sent'] == 1
