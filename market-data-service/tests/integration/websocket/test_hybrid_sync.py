"""
Integration tests for WebSocket + HTTP hybrid synchronization.

Tests hybrid mode where:
- WebSocket: First connection sends full snapshot, then incremental updates
- HTTP: Fallback polling when WebSocket unavailable
"""

import pytest
import asyncio
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass, field
from datetime import datetime
import json


@dataclass
class QuoteSnapshot:
    """Full snapshot of quotes for initial sync."""
    symbols: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)
    total_count: int = 0


class HybridSyncManager:
    """
    Manager for WebSocket + HTTP hybrid synchronization.

    Features:
    - Automatic WebSocket connection with fallback to HTTP polling
    - Full snapshot on first WebSocket connection
    - Incremental updates via WebSocket
    - HTTP polling fallback when WebSocket fails
    """

    def __init__(self, ws_client, http_client, config=None):
        self.ws = ws_client
        self.http = http_client
        self.config = config if config is not None else {}

        self.mode = "disconnected"  # disconnected, websocket, http_polling
        self.subscribed_symbols: Set[str] = set()
        self.snapshot_received = False
        self.last_update_time: Optional[datetime] = None
        self.poll_interval = self.config.get("poll_interval_seconds", 5)
        self._polling_task: Optional[asyncio.Task] = None
        self._running = False

        # Statistics
        self.stats = {
            "ws_messages_received": 0,
            "http_polls": 0,
            "snapshot_count": 0,
            "delta_updates": 0,
            "mode_switches": 0
        }

    async def connect(self):
        """
        Connect using best available method.

        1. Try WebSocket first
        2. Fall back to HTTP polling if WebSocket fails
        """
        try:
            await self._connect_websocket()
        except Exception:
            await self._start_http_polling()

    async def _connect_websocket(self):
        """Connect via WebSocket."""
        await self.ws.connect()
        self.mode = "websocket"
        self.stats["mode_switches"] += 1

        # Subscribe to symbols if any
        if self.subscribed_symbols:
            await self.ws.send({
                "action": "subscribe",
                "symbols": list(self.subscribed_symbols)
            })

        # Start message handler
        asyncio.create_task(self._handle_ws_messages())

    async def _start_http_polling(self):
        """Start HTTP polling as fallback."""
        self.mode = "http_polling"
        self.stats["mode_switches"] += 1
        self._running = True
        self._polling_task = asyncio.create_task(self._poll_loop())

    async def _poll_loop(self):
        """HTTP polling loop."""
        while self._running:
            try:
                if self.subscribed_symbols:
                    data = await self.http.get_quotes(
                        list(self.subscribed_symbols)
                    )
                    await self._handle_http_data(data)
                    self.stats["http_polls"] += 1

                await asyncio.sleep(self.poll_interval)
            except Exception:
                await asyncio.sleep(self.poll_interval)

    async def _handle_ws_messages(self):
        """Handle incoming WebSocket messages."""
        try:
            async for message in self.ws.receive():
                self.stats["ws_messages_received"] += 1

                msg_type = message.get("type")

                if msg_type == "snapshot":
                    await self._handle_snapshot(message.get("data", {}))
                elif msg_type == "delta":
                    await self._handle_delta(message.get("data", {}))

        except Exception:
            # WebSocket failed, switch to HTTP
            if self.mode == "websocket":
                await self._start_http_polling()

    async def _handle_snapshot(self, data: Dict):
        """Handle full snapshot message."""
        self.snapshot_received = True
        self.stats["snapshot_count"] += 1
        self.last_update_time = datetime.now()

    async def _handle_delta(self, data: Dict):
        """Handle incremental update."""
        self.stats["delta_updates"] += 1
        self.last_update_time = datetime.now()

    async def _handle_http_data(self, data: Dict):
        """Handle HTTP polling data."""
        self.last_update_time = datetime.now()

    async def subscribe(self, symbols: List[str]):
        """Subscribe to symbols."""
        self.subscribed_symbols.update(symbols)

        if self.mode == "websocket":
            await self.ws.send({
                "action": "subscribe",
                "symbols": symbols
            })

    async def disconnect(self):
        """Disconnect and cleanup."""
        self._running = False

        if self._polling_task:
            self._polling_task.cancel()
            try:
                await self._polling_task
            except asyncio.CancelledError:
                pass

        if self.mode == "websocket":
            await self.ws.disconnect()

        self.mode = "disconnected"

    def get_mode(self) -> str:
        """Get current connection mode."""
        return self.mode

    def get_stats(self) -> Dict[str, Any]:
        """Get synchronization statistics."""
        return {
            **self.stats,
            "mode": self.mode,
            "subscribed_count": len(self.subscribed_symbols),
            "snapshot_received": self.snapshot_received
        }


class MockWebSocketClient:
    """Mock WebSocket client."""

    def __init__(self, should_fail=False):
        self.should_fail = should_fail
        self.connected = False
        self.messages = []
        self._receive_queue = asyncio.Queue()

    async def connect(self):
        if self.should_fail:
            raise Exception("WebSocket connection failed")
        self.connected = True

        # Queue a snapshot message
        await self._receive_queue.put({
            "type": "snapshot",
            "data": {
                "000001": {"price": 10.5, "change": 0.05},
                "600519": {"price": 150.0, "change": -1.2}
            }
        })

    async def disconnect(self):
        self.connected = False

    async def send(self, message: Dict):
        self.messages.append(message)

    async def receive(self):
        """Async generator for received messages."""
        while self.connected:
            try:
                message = await asyncio.wait_for(
                    self._receive_queue.get(),
                    timeout=0.1
                )
                yield message
            except asyncio.TimeoutError:
                continue

    async def send_delta(self, delta: Dict):
        """Simulate receiving a delta update."""
        await self._receive_queue.put({
            "type": "delta",
            "data": delta
        })


class MockHTTPClient:
    """Mock HTTP client."""

    def __init__(self):
        self.poll_count = 0

    async def get_quotes(self, symbols: List[str]) -> Dict:
        self.poll_count += 1
        return {
            symbol: {"price": 10.5, "change": 0.05}
            for symbol in symbols
        }


class TestHybridSync:
    """Test hybrid synchronization."""

    @pytest.fixture
    def ws_client(self):
        return MockWebSocketClient()

    @pytest.fixture
    def http_client(self):
        return MockHTTPClient()

    @pytest.fixture
    def sync_manager(self, ws_client, http_client):
        return HybridSyncManager(ws_client, http_client)

    @pytest.mark.asyncio
    async def test_websocket_connection(self, sync_manager):
        """Test WebSocket connection on startup."""
        await sync_manager.connect()

        assert sync_manager.get_mode() == "websocket"
        assert sync_manager.ws.connected is True

    @pytest.mark.asyncio
    async def test_http_fallback(self, ws_client, http_client):
        """Test HTTP fallback when WebSocket fails."""
        ws_client.should_fail = True
        manager = HybridSyncManager(ws_client, http_client)

        await manager.connect()

        assert manager.get_mode() == "http_polling"

    @pytest.mark.asyncio
    async def test_snapshot_received(self, sync_manager):
        """Test snapshot received on WebSocket connection."""
        await sync_manager.connect()
        await sync_manager.subscribe(["000001", "600519"])

        # Wait for snapshot
        await asyncio.sleep(0.2)

        assert sync_manager.snapshot_received is True
        assert sync_manager.stats["snapshot_count"] == 1

    @pytest.mark.asyncio
    async def test_delta_update(self, sync_manager):
        """Test delta update processing."""
        await sync_manager.connect()
        await sync_manager.subscribe(["000001"])

        # Wait for snapshot
        await asyncio.sleep(0.1)

        # Simulate delta update
        await sync_manager.ws.send_delta({
            "000001": {"price": 10.6, "change": 0.06}
        })

        await asyncio.sleep(0.1)

        assert sync_manager.stats["delta_updates"] == 1

    @pytest.mark.asyncio
    async def test_http_polling(self, sync_manager):
        """Test HTTP polling mode."""
        sync_manager.ws.should_fail = True
        await sync_manager.connect()
        await sync_manager.subscribe(["000001", "600519"])

        # Wait for polling
        await asyncio.sleep(0.3)

        assert sync_manager.stats["http_polls"] >= 1

    @pytest.mark.asyncio
    async def test_subscribe_in_polling_mode(self, ws_client, http_client):
        """Test subscribe works in polling mode."""
        ws_client.should_fail = True
        manager = HybridSyncManager(ws_client, http_client)

        await manager.connect()
        await manager.subscribe(["000001", "600519"])

        # Wait for polling
        await asyncio.sleep(0.3)

        assert "000001" in manager.subscribed_symbols
        assert "600519" in manager.subscribed_symbols

    @pytest.mark.asyncio
    async def test_mode_switching(self, sync_manager):
        """Test mode switching statistics."""
        assert sync_manager.stats["mode_switches"] == 0

        await sync_manager.connect()
        assert sync_manager.stats["mode_switches"] == 1

        # Simulate WebSocket failure by disconnecting
        sync_manager.ws.should_fail = True
        await sync_manager.ws._receive_queue.put(Exception("Connection lost"))

        await asyncio.sleep(0.2)

        # Should have switched to HTTP
        assert sync_manager.get_mode() == "http_polling"
        assert sync_manager.stats["mode_switches"] == 2


class TestHybridSyncEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_empty_subscription(self):
        """Test subscribing to empty symbol list."""
        ws = MockWebSocketClient()
        http = MockHTTPClient()
        manager = HybridSyncManager(ws, http)

        await manager.connect()
        await manager.subscribe([])

        assert len(manager.subscribed_symbols) == 0

    @pytest.mark.asyncio
    async def test_duplicate_subscription(self):
        """Test subscribing to same symbols multiple times."""
        ws = MockWebSocketClient()
        http = MockHTTPClient()
        manager = HybridSyncManager(ws, http)

        await manager.connect()
        await manager.subscribe(["000001"])
        await manager.subscribe(["000001", "600519"])

        assert len(manager.subscribed_symbols) == 2

    @pytest.mark.asyncio
    async def test_disconnect_cleanup(self):
        """Test proper cleanup on disconnect."""
        ws = MockWebSocketClient()
        http = MockHTTPClient()
        manager = HybridSyncManager(ws, http)

        await manager.connect()
        await manager.subscribe(["000001"])
        await manager.disconnect()

        assert manager.get_mode() == "disconnected"
        assert not manager._running

    @pytest.mark.asyncio
    async def test_stats_accuracy(self):
        """Test statistics are accurate."""
        ws = MockWebSocketClient()
        http = MockHTTPClient()
        manager = HybridSyncManager(ws, http)

        await manager.connect()
        await manager.subscribe(["000001"])
        await asyncio.sleep(0.2)

        stats = manager.get_stats()
        assert "ws_messages_received" in stats
        assert "snapshot_count" in stats
        assert stats["mode"] == "websocket"
