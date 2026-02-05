#!/usr/bin/env python3
"""
Stock Race AI Service Main Entry Point
"""

import asyncio
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from .core.config import settings
from .core.database import init_db
from .core.redis import init_redis
from .utils.logger import setup_logging
from .api.routes import router as api_router

# Configure logging
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    """
    # Startup
    logger.info("🚀 Starting AI Service...")

    # Initialize databases
    try:
        await init_db()
    except Exception as e:
        logger.warning(f"⚠️ Database initialization failed: {e}. Continuing without database...")
    await init_redis()

    # Initialize services (will be implemented later)
    # app.state.ai_manager = AIManager()
    # app.state.trading_engine = TradingEngine()

    logger.info("✅ AI Service started successfully")
    yield

    # Shutdown
    logger.info("🛑 Shutting down AI Service...")
    # if hasattr(app.state, 'ai_manager'):
    #     await app.state.ai_manager.close()
    # if hasattr(app.state, 'trading_engine'):
    #     await app.state.trading_engine.close()
    logger.info("✅ AI Service shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Stock Race AI Service",
    description="AI Service for Stock Race Platform - Handles AI model integration and trading decisions",
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
        "service": "ai-service",
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
    Main entry point for the AI service.
    """
    uvicorn.run(
        "ai_service.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info",
    )


if __name__ == "__main__":
    main()