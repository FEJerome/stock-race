#!/usr/bin/env python3
"""
Stock Race AI Service Main Entry Point

Implements:
- C1-TAI-001: Health check SDK integration
- C1-TAI-002: Degraded operation mode
- C1-TAI-003: Auto-recovery mechanism
- C2-TAI-001: Event bus SDK integration
- C3-003: Market data and news event subscription
"""

import asyncio
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
from .services.health_service import get_health_service, TradingAIHealthService
from .services.event_bus_manager import EventBusManager
from .services.event_handlers import EventHandlerManager

# Configure logging
setup_logging()

# Global service instances
event_bus: EventBusManager = None
event_handlers: EventHandlerManager = None
health_service: TradingAIHealthService = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.

    Implements service state machine:
    - INITIALIZING → check dependencies → DEGRADED/NORMAL
    - Automatic recovery when dependencies become available
    """
    global event_bus, event_handlers, health_service

    # Startup
    logger.info("🚀 Starting AI Service...")

    # Initialize databases (non-critical)
    try:
        await init_db()
    except Exception as e:
        logger.warning(f"⚠️ Database initialization failed: {e}. Continuing without database...")

    # Initialize Redis (critical)
    try:
        await init_redis()
        logger.info("✅ Redis initialized")
    except Exception as e:
        logger.error(f"❌ Redis initialization failed: {e}")

    # Initialize health check service (C1-TAI-001)
    health_service = get_health_service()
    try:
        await health_service.initialize()
        logger.info(f"✅ Health check service initialized (mode: {health_service.mode.value})")
    except Exception as e:
        logger.error(f"❌ Health check service initialization failed: {e}")

    # Initialize event bus (C2-TAI-001)
    event_bus = EventBusManager()
    try:
        await event_bus.initialize()
        logger.info("✅ Event bus initialized")

        # Initialize event handlers (C3-003)
        event_handlers = EventHandlerManager()
        await event_handlers.start()
        logger.info("✅ Event handlers started")
    except Exception as e:
        logger.warning(f"⚠️ Event bus initialization failed: {e}. Service will run in degraded mode.")

    # Register callbacks for mode transitions (C1-TAI-002, C1-TAI-003)
    health_service.on_degradation(lambda: logger.warning(
        "⚠️ Service entered degraded mode. Limited functionality available."
    ))
    health_service.on_recovery(lambda: logger.info(
        "✅ Service recovered to normal mode. Full functionality restored."
    ))

    logger.info("✅ AI Service started successfully")
    yield

    # Shutdown
    logger.info("🛑 Shutting down AI Service...")

    # Stop event handlers
    if event_handlers:
        event_handlers.stop()

    # Close event bus
    if event_bus:
        await event_bus.close()

    # Stop health checker
    if health_service:
        health_service.checker.stop_periodic_checks()

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
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """
    Health check endpoint with comprehensive status.

    Implements C1-TAI-001: Service health check endpoint using Infra SDK
    Returns service mode and dependency status for load balancer health checks.
    """
    global health_service, event_bus, event_handlers

    # Get health check results from Infra SDK
    if health_service:
        result = await health_service.checker.check_health()
        health_dict = health_service.get_health_dict()
    else:
        health_dict = {
            "service": "trading-ai-service",
            "status": "unknown",
            "message": "Health service not initialized"
        }

    # Build response
    status_code = health_dict.get("status", "unknown")

    # Get event handler stats if available
    handler_stats = {}
    if event_handlers:
        handler_stats = event_handlers.get_stats()

    return {
        "status": status_code,
        "service": "trading-ai-service",
        "version": "0.1.0",
        "mode": health_service.mode.value if health_service else "unknown",
        "checks": health_dict.get("dependencies", {}),
        "event_handlers": handler_stats,
        "timestamp": health_dict.get("timestamp"),
    }


@app.get("/api/v1/health/detailed")
async def detailed_health_check():
    """
    Detailed health check endpoint with full service status.

    For monitoring and debugging purposes.
    """
    global health_service, event_bus, event_handlers

    # Get detailed health from Infra SDK
    health_dict = health_service.get_health_dict() if health_service else None

    return {
        "service": "trading-ai-service",
        "version": "0.1.0",
        "health_service": health_dict,
        "service_mode": health_service.mode.value if health_service else "unknown",
        "is_degraded": health_service.is_degraded if health_service else False,
        "event_bus": {
            "initialized": event_bus.is_initialized if event_bus else False,
            "healthy": await event_bus.health_check() if event_bus else False,
        } if event_bus else None,
        "event_handlers": event_handlers.get_stats() if event_handlers else None,
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