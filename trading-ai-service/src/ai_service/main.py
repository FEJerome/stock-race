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
from .services.health_check_service import get_health_check_service, HealthCheckService
from .services.event_bus_manager import EventBusManager
from .services.event_handlers import EventHandlerManager

# Configure logging
setup_logging()

# Global service instances
event_bus: EventBusManager = None
event_handlers: EventHandlerManager = None
health_service: HealthCheckService = None
monitoring_task: asyncio.Task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.

    Implements service state machine:
    - INITIALIZING → check dependencies → DEGRADED/NORMAL
    - Automatic recovery when dependencies become available
    """
    global event_bus, event_handlers, health_service, monitoring_task

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
    health_service = get_health_check_service()
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

    # Start health monitoring (C1-TAI-003)
    try:
        monitoring_task = asyncio.create_task(
            health_service.start_monitoring(interval_seconds=30)
        )
        logger.info("🔄 Health monitoring started")
    except Exception as e:
        logger.error(f"❌ Failed to start health monitoring: {e}")

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

    # Stop monitoring
    if monitoring_task:
        monitoring_task.cancel()
        try:
            await monitoring_task
        except asyncio.CancelledError:
            pass

    # Stop event handlers
    if event_handlers:
        event_handlers.stop()

    # Close event bus
    if event_bus:
        await event_bus.close()

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

    Implements C1-TAI-001: Service health check endpoint
    Returns service mode and dependency status for load balancer health checks.
    """
    global health_service, event_bus, event_handlers

    # Get health check results
    health_results = await health_service.perform_health_check() if health_service else {
        "overall": "unknown",
        "checks": {}
    }

    # Build response
    status_code = "healthy"
    if health_service:
        if health_service.is_offline:
            status_code = "unhealthy"
        elif health_service.is_degraded:
            status_code = "degraded"

    # Get event handler stats if available
    handler_stats = {}
    if event_handlers:
        handler_stats = event_handlers.get_stats()

    return {
        "status": status_code,
        "service": "trading-ai-service",
        "version": "0.1.0",
        "mode": health_service.mode.value if health_service else "unknown",
        "checks": health_results.get("checks", {}),
        "event_handlers": handler_stats,
        "timestamp": health_results.get("timestamp"),
    }


@app.get("/api/v1/health/detailed")
async def detailed_health_check():
    """
    Detailed health check endpoint with full service status.

    For monitoring and debugging purposes.
    """
    global health_service, event_bus, event_handlers

    return {
        "service": "trading-ai-service",
        "version": "0.1.0",
        "health_service": health_service.get_status() if health_service else None,
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