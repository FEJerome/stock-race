#!/usr/bin/env python3
"""
Stock Race Data Service Main Entry Point
"""

import asyncio
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from .api.routes import router as api_router
from .core.config import settings
from .core.database import init_db
from .core.redis import init_redis
from .services.data_collector import DataCollector
from .services.data_processor import DataProcessor
from .services.market_monitor import MarketMonitor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger.add("logs/data_service.log", rotation="500 MB", retention="10 days")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    """
    # Startup
    logger.info("🚀 Starting Data Service...")

    # Initialize databases
    await init_db()
    await init_redis()

    # Initialize services
    app.state.data_collector = DataCollector()
    app.state.data_processor = DataProcessor()
    app.state.market_monitor = MarketMonitor()

    # Start background tasks
    asyncio.create_task(app.state.market_monitor.start())

    logger.info("✅ Data Service started successfully")
    yield

    # Shutdown
    logger.info("🛑 Shutting down Data Service...")
    if hasattr(app.state, 'data_collector'):
        await app.state.data_collector.close()
    if hasattr(app.state, 'data_processor'):
        await app.state.data_processor.close()
    if hasattr(app.state, 'market_monitor'):
        await app.state.market_monitor.stop()
    logger.info("✅ Data Service shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Stock Race Data Service",
    description="Data Service for Stock Race Platform - Handles stock data collection, processing, and storage",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """
    Health check endpoint.
    """
    return {
        "status": "healthy",
        "service": "data-service",
        "version": "0.1.0",
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler.
    """
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


# Include API routes
app.include_router(api_router, prefix="/api/v1")


def main():
    """
    Main entry point for the data service.
    """
    uvicorn.run(
        "data_service.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info",
    )


if __name__ == "__main__":
    main()