#!/usr/bin/env python3
"""
Stock Race Enhanced Data Service Main Entry Point
"""

import asyncio
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from .api.routes import router as api_router_v1
from .api.enhanced_routes import router as api_router_v2
from .core.config import settings
from .core.database import init_db
from .core.redis import init_redis
from .services.enhanced_data_service import EnhancedDataService, DataSourceStrategy

# Configure logging
logging.basicConfig(level=logging.INFO)
logger.add("logs/enhanced_data_service.log", rotation="500 MB", retention="10 days")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    """
    # Startup
    logger.info("🚀 Starting Enhanced Data Service...")

    # Initialize databases
    await init_db()
    await init_redis()

    # Initialize enhanced service
    app.state.enhanced_service = EnhancedDataService(
        strategy=DataSourceStrategy.ADAPTIVE
    )
    await app.state.enhanced_service.initialize()

    logger.info("✅ Enhanced Data Service started successfully")
    yield

    # Shutdown
    logger.info("🛑 Shutting down Enhanced Data Service...")
    if hasattr(app.state, 'enhanced_service'):
        await app.state.enhanced_service.close()
    logger.info("✅ Enhanced Data Service shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Stock Race Enhanced Data Service",
    description="Enhanced Data Service with multi-source routing, segmentation, and advanced features",
    version="0.2.0",
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


@app.get("/")
async def root():
    """
    Root endpoint with service information.
    """
    return {
        "service": "stock-race-enhanced-data-service",
        "version": "0.2.0",
        "description": "Enhanced data service with multi-source routing and segmentation",
        "endpoints": {
            "v1": "/api/v1",
            "v2": "/api/v2",
            "health": "/health",
            "docs": "/docs",
            "redoc": "/redoc"
        },
        "features": [
            "Multi-source data collection (Sina, Tencent, EastMoney)",
            "Intelligent load balancing and failover",
            "Segmentation strategies for batch collection",
            "Adaptive source selection",
            "Comprehensive monitoring and metrics",
            "Enhanced data quality assessment"
        ]
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint.
    """
    return {
        "status": "healthy",
        "service": "enhanced-data-service",
        "version": "0.2.0",
        "timestamp": asyncio.get_event_loop().time()
    }


@app.get("/health/detailed")
async def detailed_health_check(request: Request):
    """
    Detailed health check with service status.
    """
    try:
        service = request.app.state.enhanced_service

        # Get router health
        router_health = await service.get_router_health()

        # Get monitoring metrics
        metrics = await service.get_monitoring_metrics()

        # Check market status
        is_market_hours = service.is_market_hours()
        next_collection = service.get_next_collection_time()

        return {
            "status": "healthy",
            "service": "enhanced-data-service",
            "timestamp": asyncio.get_event_loop().time(),
            "router": {
                "active_sources": router_health["performance"].get("active_sources", []),
                "total_sources": router_health["performance"].get("total_sources", 0),
                "success_rate": router_health["performance"].get("overall_success_rate", 0.0),
                "current_strategy": router_health["strategies"]["current"]
            },
            "monitoring": {
                "total_collections": metrics.total_collections,
                "successful_collections": metrics.successful_collections,
                "failed_collections": metrics.failed_collections,
                "success_rate": metrics.success_rate,
                "average_latency": metrics.average_latency
            },
            "market": {
                "is_open": is_market_hours,
                "next_collection": next_collection.isoformat() if next_collection else None
            },
            "cache": {
                "quote_ttl": service.cache_ttl["quote"],
                "history_ttl": service.cache_ttl["history"],
                "indices_ttl": service.cache_ttl["indices"]
            }
        }

    except Exception as e:
        logger.error(f"Detailed health check failed: {str(e)}")
        return {
            "status": "degraded",
            "service": "enhanced-data-service",
            "error": str(e),
            "timestamp": asyncio.get_event_loop().time()
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
app.include_router(api_router_v1, prefix="/api/v1")
app.include_router(api_router_v2, prefix="/api/v2")


def main():
    """
    Main entry point for the enhanced data service.
    """
    uvicorn.run(
        "data_service.enhanced_main:app",
        host=settings.HOST,
        port=settings.PORT + 1,  # Use different port than regular service
        reload=settings.DEBUG,
        log_level="info",
    )


if __name__ == "__main__":
    main()