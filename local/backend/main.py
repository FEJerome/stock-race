"""
Local AI Trading Platform - FastAPI Backend Entry Point

Usage:
    python main.py              # Start server and open browser
    python main.py --headless   # Start server only
"""

import argparse
import webbrowser
import threading
import time
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from api.health import router as health_router
from api.agents import router as agents_router
from api.market import router as market_router
from api.trading import router as trading_router
from api.strategy import router as strategy_router
from api.decision import router as decision_router
from api.websocket import router as websocket_router, broadcast_market_data_task
from api.settings import router as settings_router
from models.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    print("[START] Local AI Trading Platform starting...")
    await init_db()
    print("[DB] Database initialized")

    # Start WebSocket background tasks
    import asyncio
    asyncio.create_task(broadcast_market_data_task())
    print("[WS] Market data broadcaster started")

    yield

    # Shutdown
    print("[STOP] Server shutting down...")


def create_app() -> FastAPI:
    """Create FastAPI application"""
    app = FastAPI(
        title="Local AI Trading Platform",
        description="AI-powered virtual stock trading platform for local use",
        version="0.1.0",
        lifespan=lifespan
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:5174"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(health_router, tags=["health"])
    app.include_router(agents_router)
    app.include_router(market_router)
    app.include_router(trading_router)
    app.include_router(strategy_router)
    app.include_router(decision_router)
    app.include_router(websocket_router)
    app.include_router(settings_router)

    return app


def open_browser(delay: float = 2.0):
    """Open browser after delay"""
    time.sleep(delay)
    url = "http://localhost:8000"
    print(f"[BROWSER] Opening browser: {url}")
    webbrowser.open(url)


def main():
    parser = argparse.ArgumentParser(description="Local AI Trading Platform")
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Start server without opening browser"
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host to bind (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to bind (default: 8000)"
    )
    args = parser.parse_args()

    # Create app
    app = create_app()

    # Open browser in background thread (unless headless)
    if not args.headless:
        browser_thread = threading.Thread(target=open_browser, daemon=True)
        browser_thread.start()

    # Start server
    print(f"[SERVER] Running at http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop")

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info"
    )


if __name__ == "__main__":
    main()
