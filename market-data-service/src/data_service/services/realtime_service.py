"""
Real-time data push service using WebSocket.
"""

import asyncio
import json
import logging
from typing import Dict, List, Set, Any, Optional
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect

from ..models.stock import RealtimeMessage
from ..storage.cache import RedisCache

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manage WebSocket connections."""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.connection_subscriptions: Dict[WebSocket, Set[str]] = {}

    async def connect(self, websocket: WebSocket, client_id: str = None):
        """
        Accept WebSocket connection.

        Args:
            websocket: WebSocket connection
            client_id: Optional client identifier
        """
        await websocket.accept()
        if client_id:
            if client_id not in self.active_connections:
                self.active_connections[client_id] = set()
            self.active_connections[client_id].add(websocket)
        self.connection_subscriptions[websocket] = set()
        logger.info(f"WebSocket connected: {client_id or 'anonymous'}")

    def disconnect(self, websocket: WebSocket, client_id: str = None):
        """
        Remove WebSocket connection.

        Args:
            websocket: WebSocket connection
            client_id: Optional client identifier
        """
        if client_id and client_id in self.active_connections:
            self.active_connections[client_id].discard(websocket)
            if not self.active_connections[client_id]:
                del self.active_connections[client_id]

        if websocket in self.connection_subscriptions:
            del self.connection_subscriptions[websocket]

        logger.info(f"WebSocket disconnected: {client_id or 'anonymous'}")

    def subscribe(self, websocket: WebSocket, symbols: List[str]):
        """
        Subscribe to stock symbols.

        Args:
            websocket: WebSocket connection
            symbols: List of stock symbols to subscribe to
        """
        if websocket in self.connection_subscriptions:
            self.connection_subscriptions[websocket].update(symbols)
            logger.debug(f"Subscribed {websocket} to symbols: {symbols}")

    def unsubscribe(self, websocket: WebSocket, symbols: List[str]):
        """
        Unsubscribe from stock symbols.

        Args:
            websocket: WebSocket connection
            symbols: List of stock symbols to unsubscribe from
        """
        if websocket in self.connection_subscriptions:
            for symbol in symbols:
                self.connection_subscriptions[websocket].discard(symbol)
            logger.debug(f"Unsubscribed {websocket} from symbols: {symbols}")

    def get_subscriptions(self, websocket: WebSocket) -> Set[str]:
        """
        Get subscriptions for a WebSocket connection.

        Args:
            websocket: WebSocket connection

        Returns:
            Set of subscribed symbols
        """
        return self.connection_subscriptions.get(websocket, set())

    async def send_personal_message(self, message: Dict[str, Any], websocket: WebSocket):
        """
        Send message to a specific WebSocket connection.

        Args:
            message: Message to send
            websocket: WebSocket connection
        """
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send personal message: {str(e)}")
            self.disconnect(websocket)

    async def broadcast_to_subscribers(self, symbol: str, message: Dict[str, Any]):
        """
        Broadcast message to all connections subscribed to a symbol.

        Args:
            symbol: Stock symbol
            message: Message to broadcast
        """
        disconnected = []

        for websocket, subscriptions in self.connection_subscriptions.items():
            if symbol in subscriptions:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Failed to broadcast to {websocket}: {str(e)}")
                    disconnected.append(websocket)

        # Clean up disconnected sockets
        for websocket in disconnected:
            self.disconnect(websocket)

    async def broadcast_to_all(self, message: Dict[str, Any]):
        """
        Broadcast message to all connected WebSocket clients.

        Args:
            message: Message to broadcast
        """
        disconnected = []

        for client_id, connections in self.active_connections.items():
            for websocket in connections:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Failed to broadcast to {client_id}: {str(e)}")
                    disconnected.append((client_id, websocket))

        # Clean up disconnected sockets
        for client_id, websocket in disconnected:
            self.disconnect(websocket, client_id)

    def get_connection_stats(self) -> Dict[str, Any]:
        """
        Get connection statistics.

        Returns:
            Dictionary with connection stats
        """
        total_connections = sum(len(conns) for conns in self.active_connections.values())
        total_subscriptions = sum(len(subs) for subs in self.connection_subscriptions.values())

        return {
            "total_connections": total_connections,
            "total_clients": len(self.active_connections),
            "total_subscriptions": total_subscriptions,
            "active_connections": {
                client_id: len(connections)
                for client_id, connections in self.active_connections.items()
            }
        }


class RealtimeService:
    """Real-time data service."""

    def __init__(self, redis_cache: RedisCache):
        self.connection_manager = ConnectionManager()
        self.redis_cache = redis_cache
        self.subscription_task: Optional[asyncio.Task] = None

    async def connect(self, websocket: WebSocket):
        """
        Handle WebSocket connection.

        Args:
            websocket: WebSocket connection
        """
        # Generate client ID from connection
        client_id = f"client_{id(websocket)}"
        await self.connection_manager.connect(websocket, client_id)

        # Send welcome message
        welcome_message = RealtimeMessage(
            type="connection",
            data={
                "client_id": client_id,
                "message": "Connected to real-time stock data service",
                "timestamp": datetime.now().isoformat()
            }
        )
        await self.connection_manager.send_personal_message(
            welcome_message.dict(),
            websocket
        )

    async def disconnect(self, websocket: WebSocket):
        """
        Handle WebSocket disconnection.

        Args:
            websocket: WebSocket connection
        """
        self.connection_manager.disconnect(websocket)

    async def handle_message(self, websocket: WebSocket, message: Dict[str, Any]):
        """
        Handle incoming WebSocket message.

        Args:
            websocket: WebSocket connection
            message: Incoming message
        """
        message_type = message.get("type")
        data = message.get("data", {})

        try:
            if message_type == "subscribe":
                await self._handle_subscribe(websocket, data)
            elif message_type == "unsubscribe":
                await self._handle_unsubscribe(websocket, data)
            elif message_type == "ping":
                await self._handle_ping(websocket)
            elif message_type == "get_subscriptions":
                await self._handle_get_subscriptions(websocket)
            elif message_type == "get_stats":
                await self._handle_get_stats(websocket)
            else:
                await self._send_error(websocket, f"Unknown message type: {message_type}")

        except Exception as e:
            logger.error(f"Failed to handle message: {str(e)}")
            await self._send_error(websocket, str(e))

    async def _handle_subscribe(self, websocket: WebSocket, data: Dict[str, Any]):
        """
        Handle subscription request.

        Args:
            websocket: WebSocket connection
            data: Subscription data
        """
        symbols = data.get("symbols", [])
        if not symbols:
            await self._send_error(websocket, "No symbols provided for subscription")
            return

        # Validate symbols
        valid_symbols = []
        for symbol in symbols:
            if isinstance(symbol, str) and symbol.strip():
                valid_symbols.append(symbol.strip())

        if not valid_symbols:
            await self._send_error(websocket, "No valid symbols provided")
            return

        # Subscribe to symbols
        self.connection_manager.subscribe(websocket, valid_symbols)

        # Send confirmation
        response = RealtimeMessage(
            type="subscription_confirmed",
            data={
                "symbols": valid_symbols,
                "message": f"Subscribed to {len(valid_symbols)} symbols",
                "timestamp": datetime.now().isoformat()
            }
        )
        await self.connection_manager.send_personal_message(response.dict(), websocket)

        # Send current data for subscribed symbols
        await self._send_current_data(websocket, valid_symbols)

    async def _handle_unsubscribe(self, websocket: WebSocket, data: Dict[str, Any]):
        """
        Handle unsubscribe request.

        Args:
            websocket: WebSocket connection
            data: Unsubscribe data
        """
        symbols = data.get("symbols", [])
        if not symbols:
            # Unsubscribe from all symbols
            current_subs = self.connection_manager.get_subscriptions(websocket)
            symbols = list(current_subs)

        # Unsubscribe from symbols
        self.connection_manager.unsubscribe(websocket, symbols)

        # Send confirmation
        response = RealtimeMessage(
            type="unsubscription_confirmed",
            data={
                "symbols": symbols,
                "message": f"Unsubscribed from {len(symbols)} symbols",
                "timestamp": datetime.now().isoformat()
            }
        )
        await self.connection_manager.send_personal_message(response.dict(), websocket)

    async def _handle_ping(self, websocket: WebSocket):
        """
        Handle ping request.

        Args:
            websocket: WebSocket connection
        """
        response = RealtimeMessage(
            type="pong",
            data={
                "timestamp": datetime.now().isoformat(),
                "message": "pong"
            }
        )
        await self.connection_manager.send_personal_message(response.dict(), websocket)

    async def _handle_get_subscriptions(self, websocket: WebSocket):
        """
        Handle get subscriptions request.

        Args:
            websocket: WebSocket connection
        """
        subscriptions = self.connection_manager.get_subscriptions(websocket)
        response = RealtimeMessage(
            type="subscriptions",
            data={
                "subscriptions": list(subscriptions),
                "count": len(subscriptions),
                "timestamp": datetime.now().isoformat()
            }
        )
        await self.connection_manager.send_personal_message(response.dict(), websocket)

    async def _handle_get_stats(self, websocket: WebSocket):
        """
        Handle get stats request.

        Args:
            websocket: WebSocket connection
        """
        stats = self.connection_manager.get_connection_stats()
        response = RealtimeMessage(
            type="stats",
            data={
                "connection_stats": stats,
                "timestamp": datetime.now().isoformat()
            }
        )
        await self.connection_manager.send_personal_message(response.dict(), websocket)

    async def _send_current_data(self, websocket: WebSocket, symbols: List[str]):
        """
        Send current data for subscribed symbols.

        Args:
            websocket: WebSocket connection
            symbols: List of stock symbols
        """
        for symbol in symbols:
            try:
                # Try to get from cache
                quote = await self.redis_cache.get_cached_quote(symbol)
                if quote:
                    message = RealtimeMessage(
                        type="quote_update",
                        data={
                            "symbol": symbol,
                            "quote": quote.dict(),
                            "timestamp": datetime.now().isoformat()
                        }
                    )
                    await self.connection_manager.send_personal_message(
                        message.dict(),
                        websocket
                    )
            except Exception as e:
                logger.error(f"Failed to send current data for {symbol}: {str(e)}")

    async def _send_error(self, websocket: WebSocket, error_message: str):
        """
        Send error message.

        Args:
            websocket: WebSocket connection
            error_message: Error message
        """
        response = RealtimeMessage(
            type="error",
            data={
                "message": error_message,
                "timestamp": datetime.now().isoformat()
            }
        )
        await self.connection_manager.send_personal_message(response.dict(), websocket)

    async def publish_quote_update(self, quote):
        """
        Publish quote update to subscribed clients.

        Args:
            quote: StockQuote object
        """
        message = RealtimeMessage(
            type="quote_update",
            data={
                "symbol": quote.symbol,
                "quote": quote.dict(),
                "timestamp": datetime.now().isoformat()
            }
        )

        # Broadcast to all subscribers of this symbol
        await self.connection_manager.broadcast_to_subscribers(
            quote.symbol,
            message.dict()
        )

    async def publish_market_update(self, update_type: str, data: Dict[str, Any]):
        """
        Publish market update to all connected clients.

        Args:
            update_type: Type of market update
            data: Update data
        """
        message = RealtimeMessage(
            type=f"market_{update_type}",
            data={
                **data,
                "timestamp": datetime.now().isoformat()
            }
        )

        # Broadcast to all connected clients
        await self.connection_manager.broadcast_to_all(message.dict())

    async def publish_system_message(self, message_type: str, data: Dict[str, Any]):
        """
        Publish system message to all connected clients.

        Args:
            message_type: Type of system message
            data: Message data
        """
        message = RealtimeMessage(
            type=f"system_{message_type}",
            data={
                **data,
                "timestamp": datetime.now().isoformat()
            }
        )

        # Broadcast to all connected clients
        await self.connection_manager.broadcast_to_all(message.dict())

    async def start_redis_subscription(self):
        """Start Redis subscription for real-time updates."""
        try:
            await self.redis_cache.subscribe_to_updates(self._handle_redis_update)
        except Exception as e:
            logger.error(f"Failed to start Redis subscription: {str(e)}")

    async def _handle_redis_update(self, message: Dict[str, Any]):
        """
        Handle Redis update message.

        Args:
            message: Redis update message
        """
        try:
            message_type = message.get("type")
            symbol = message.get("symbol")

            if message_type == "quote_update" and symbol:
                # Forward to WebSocket subscribers
                await self.connection_manager.broadcast_to_subscribers(symbol, message)

        except Exception as e:
            logger.error(f"Failed to handle Redis update: {str(e)}")

    def get_service_stats(self) -> Dict[str, Any]:
        """
        Get real-time service statistics.

        Returns:
            Dictionary with service stats
        """
        connection_stats = self.connection_manager.get_connection_stats()

        return {
            "realtime_service": {
                **connection_stats,
                "timestamp": datetime.now().isoformat()
            }
        }

    async def close(self):
        """Close real-time service."""
        if self.subscription_task:
            self.subscription_task.cancel()
            try:
                await self.subscription_task
            except asyncio.CancelledError:
                pass

        # Send disconnect message to all clients
        disconnect_message = RealtimeMessage(
            type="system_shutdown",
            data={
                "message": "Real-time service is shutting down",
                "timestamp": datetime.now().isoformat()
            }
        )

        await self.connection_manager.broadcast_to_all(disconnect_message.dict())
        logger.info("Real-time service closed")