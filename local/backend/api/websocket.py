"""
WebSocket API - Real-time market data and notifications

Provides WebSocket endpoints for:
- Real-time market quotes
- Trade notifications
- Agent status updates
"""
import asyncio
import json
from typing import Dict, Set, Optional
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db, AgentModel
from services.market_data import get_router, get_cache_service
from services.market_data.base import Quote
from services.trading_service import TradingService

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    """
    WebSocket Connection Manager

    Manages active WebSocket connections and handles:
    - Client subscription to channels
    - Broadcasting messages to subscribed clients
    - Connection lifecycle
    """

    def __init__(self):
        # Map: agent_id -> Set of WebSocket connections
        self.agent_connections: Dict[str, Set[WebSocket]] = {}
        # Map: symbol -> Set of WebSocket connections (market data subscribers)
        self.market_subscribers: Dict[str, Set[WebSocket]] = {}
        # Global connections (for broadcasts)
        self.global_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket, agent_id: Optional[str] = None):
        """Accept new WebSocket connection"""
        await websocket.accept()

        if agent_id:
            if agent_id not in self.agent_connections:
                self.agent_connections[agent_id] = set()
            self.agent_connections[agent_id].add(websocket)

        self.global_connections.add(websocket)

    def disconnect(self, websocket: WebSocket, agent_id: Optional[str] = None):
        """Remove disconnected WebSocket"""
        if agent_id and agent_id in self.agent_connections:
            self.agent_connections[agent_id].discard(websocket)
            if not self.agent_connections[agent_id]:
                del self.agent_connections[agent_id]

        self.global_connections.discard(websocket)

        # Remove from market subscribers
        for symbol, subscribers in self.market_subscribers.items():
            subscribers.discard(websocket)

    def subscribe_market(self, websocket: WebSocket, symbol: str):
        """Subscribe to market data for a symbol"""
        if symbol not in self.market_subscribers:
            self.market_subscribers[symbol] = set()
        self.market_subscribers[symbol].add(websocket)

    def unsubscribe_market(self, websocket: WebSocket, symbol: str):
        """Unsubscribe from market data"""
        if symbol in self.market_subscribers:
            self.market_subscribers[symbol].discard(websocket)

    async def send_to_agent(self, agent_id: str, message: dict):
        """Send message to all connections for an agent"""
        if agent_id not in self.agent_connections:
            return

        disconnected = []
        for connection in self.agent_connections[agent_id]:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)

        # Clean up disconnected
        for conn in disconnected:
            self.disconnect(conn, agent_id)

    async def broadcast_market_data(self, symbol: str, quote: Quote):
        """Broadcast market data to all subscribers"""
        if symbol not in self.market_subscribers:
            return

        message = {
            "type": "market_data",
            "symbol": symbol,
            "data": {
                "price": quote.price,
                "change": quote.change,
                "change_percent": quote.change_percent,
                "volume": quote.volume,
                "timestamp": quote.timestamp.isoformat() if hasattr(quote, 'timestamp') else datetime.utcnow().isoformat()
            }
        }

        disconnected = []
        for connection in self.market_subscribers[symbol]:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)

        # Clean up disconnected
        for conn in disconnected:
            self.disconnect(conn)
            for s, subs in self.market_subscribers.items():
                subs.discard(conn)

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        disconnected = []
        for connection in self.global_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)

        # Clean up disconnected
        for conn in disconnected:
            self.disconnect(conn)


# Global connection manager
manager = ConnectionManager()


@router.websocket("/ws/market")
async def market_websocket(websocket: WebSocket):
    """
    WebSocket for real-time market data

    Client messages:
    - {"action": "subscribe", "symbols": ["000001", "000002"]}
    - {"action": "unsubscribe", "symbols": ["000001"]}

    Server messages:
    - {"type": "market_data", "symbol": "000001", "data": {...}}
    - {"type": "error", "message": "..."}
    """
    await manager.connect(websocket)

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
                action = message.get("action")
                symbols = message.get("symbols", [])

                if action == "subscribe":
                    for symbol in symbols:
                        manager.subscribe_market(websocket, symbol)
                    await websocket.send_json({
                        "type": "subscribed",
                        "symbols": symbols
                    })

                elif action == "unsubscribe":
                    for symbol in symbols:
                        manager.unsubscribe_market(websocket, symbol)
                    await websocket.send_json({
                        "type": "unsubscribed",
                        "symbols": symbols
                    })

                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown action: {action}"
                    })

            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid JSON"
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.websocket("/ws/agents/{agent_id}")
async def agent_websocket(websocket: WebSocket, agent_id: str, db: AsyncSession = Depends(get_db)):
    """
    WebSocket for agent-specific updates

    Notifications:
    - Trade executed
    - Position updated
    - AI decision made
    - Level promotion
    """
    # Verify agent exists
    trading_service = TradingService()
    agent = await trading_service.get_agent(db, agent_id)

    if not agent:
        await websocket.close(code=4004, reason="Agent not found")
        return

    await manager.connect(websocket, agent_id)

    try:
        # Send initial state
        portfolio = await trading_service.get_portfolio_summary(db, agent_id)
        await websocket.send_json({
            "type": "connected",
            "agent_id": agent_id,
            "data": {
                "portfolio": portfolio
            }
        })

        while True:
            # Keep connection alive, handle ping/pong
            data = await websocket.receive_text()
            message = json.loads(data)

            if message.get("action") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(websocket, agent_id)


# Background task for broadcasting market data
async def broadcast_market_data_task():
    """
    Background task to periodically broadcast market data

    Runs continuously, fetching latest quotes and broadcasting
    to subscribed WebSocket clients.
    """
    from services.market_data import get_router
    router = get_router()

    while True:
        try:
            # Get all subscribed symbols
            symbols = list(manager.market_subscribers.keys())

            if symbols:
                # Fetch latest quotes
                quotes = await router.get_quotes(symbols)
                cache_service = get_cache_service()  # 获取缓存服务

                # Broadcast each quote
                for symbol, market_data in quotes.items():
                    if symbol in manager.market_subscribers:
                        # Convert MarketData to Quote format
                        quote = Quote(
                            symbol=market_data.symbol,
                            name=market_data.name,
                            price=market_data.price,
                            change=market_data.change,
                            change_percent=market_data.change_percent,
                            volume=market_data.volume,
                            timestamp=market_data.timestamp
                        )

                        # 新增：更新缓存（失败不影响广播）
                        if cache_service:
                            try:
                                await cache_service.update_quote(quote)
                            except Exception as e:
                                print(f"[WebSocket] Cache update failed for {symbol}: {e}")

                        # 原有：广播到 WebSocket
                        await manager.broadcast_market_data(symbol, quote)

            # Update every 3 seconds
            await asyncio.sleep(3)

        except Exception as e:
            print(f"[WebSocket] Market broadcast error: {e}")
            await asyncio.sleep(5)


async def notify_trade_executed(agent_id: str, trade_data: dict):
    """Notify clients when a trade is executed"""
    await manager.send_to_agent(agent_id, {
        "type": "trade_executed",
        "data": trade_data
    })


async def notify_decision_made(agent_id: str, decision_data: dict):
    """Notify clients when AI makes a decision"""
    await manager.send_to_agent(agent_id, {
        "type": "decision_made",
        "data": decision_data
    })


async def notify_level_changed(agent_id: str, new_level: str):
    """Notify clients when agent level changes"""
    await manager.send_to_agent(agent_id, {
        "type": "level_changed",
        "data": {"new_level": new_level}
    })
