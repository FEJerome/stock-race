"""
Health check API endpoints for AI Service.
"""

import time
from datetime import datetime
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from loguru import logger

from ...core.security import require_api_key
from ...models.schemas import HealthResponse
from ...utils.cache import cache_manager
from ...utils.logger import get_logger

router = APIRouter(prefix="/health", tags=["health"])
api_logger = get_logger("api.health")

# Service startup time
_startup_time = time.time()


@router.get(
    "/",
    response_model=HealthResponse,
    summary="Service health check",
    description="Check the overall health status of the AI service.",
)
async def health_check():
    """Overall health check endpoint."""
    api_logger.info("Health check request")

    # Check cache connection
    cache_healthy = cache_manager.is_connected

    # Check database connection (placeholder - would check actual DB connection)
    db_healthy = True  # In real implementation, this would check DB connection

    # Determine overall status
    if cache_healthy and db_healthy:
        status = "healthy"
    elif not cache_healthy and db_healthy:
        status = "degraded"
        api_logger.warning("Cache connection unavailable")
    else:
        status = "unhealthy"
        api_logger.error("Service unhealthy")

    uptime_seconds = time.time() - _startup_time

    return HealthResponse(
        status=status,
        service="trading-ai-service",
        version="0.1.0",
        uptime_seconds=uptime_seconds,
        dependencies={
            "cache": "healthy" if cache_healthy else "unavailable",
            "database": "healthy" if db_healthy else "unavailable",
        },
    )


@router.get(
    "/detailed",
    summary="Detailed health check",
    description="Get detailed health information including component status.",
)
async def detailed_health_check(api_key: str = Depends(require_api_key)):
    """Detailed health check (requires API key)."""
    api_logger.info("Detailed health check request")

    # Component checks
    components = {}

    # Cache check
    try:
        cache_ping = await cache_manager.client.ping() if cache_manager.client else False
        components["cache"] = {
            "status": "healthy" if cache_ping else "unhealthy",
            "connected": cache_manager.is_connected,
            "url": cache_manager.redis_url if hasattr(cache_manager, 'redis_url') else "unknown",
        }
    except Exception as e:
        components["cache"] = {
            "status": "unhealthy",
            "error": str(e),
            "connected": False,
        }

    # Database check (placeholder)
    components["database"] = {
        "status": "healthy",  # Placeholder
        "connected": True,  # Placeholder
        "type": "postgresql",
    }

    # AI providers check
    components["ai_providers"] = {}
    from ...core.config import settings

    if settings.OPENAI_API_KEY:
        components["ai_providers"]["openai"] = {
            "configured": True,
            "api_key_present": bool(settings.OPENAI_API_KEY),
        }
    if settings.DEEPSEEK_API_KEY:
        components["ai_providers"]["deepseek"] = {
            "configured": True,
            "api_key_present": bool(settings.DEEPSEEK_API_KEY),
        }
    if settings.ANTHROPIC_API_KEY:
        components["ai_providers"]["claude"] = {
            "configured": True,
            "api_key_present": bool(settings.ANTHROPIC_API_KEY),
        }

    # Service metrics
    uptime_seconds = time.time() - _startup_time
    metrics = {
        "uptime_seconds": uptime_seconds,
        "startup_time": datetime.fromtimestamp(_startup_time).isoformat(),
        "current_time": datetime.now().isoformat(),
    }

    # Determine overall status
    unhealthy_components = [
        name for name, info in components.items()
        if info.get("status") == "unhealthy"
    ]

    if unhealthy_components:
        overall_status = "degraded"
        if "cache" in unhealthy_components and "database" in unhealthy_components:
            overall_status = "unhealthy"
    else:
        overall_status = "healthy"

    return {
        "status": overall_status,
        "service": "ai-service",
        "version": "0.1.0",
        "timestamp": datetime.now().isoformat(),
        "components": components,
        "metrics": metrics,
    }


@router.get(
    "/ready",
    summary="Readiness probe",
    description="Check if the service is ready to accept requests.",
)
async def readiness_probe():
    """Readiness probe for Kubernetes/container orchestration."""
    api_logger.debug("Readiness probe request")

    # Basic checks for readiness
    checks = {}

    # Cache connection
    checks["cache"] = cache_manager.is_connected

    # Database connection (placeholder)
    checks["database"] = True

    # All checks must pass
    is_ready = all(checks.values())

    if is_ready:
        return JSONResponse(
            status_code=200,
            content={"status": "ready"},
        )
    else:
        api_logger.warning(f"Service not ready: {checks}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "checks": checks,
            },
        )


@router.get(
    "/live",
    summary="Liveness probe",
    description="Check if the service is alive (basic process check).",
)
async def liveness_probe():
    """Liveness probe for Kubernetes/container orchestration."""
    api_logger.debug("Liveness probe request")

    # Simple check - if we can respond, we're alive
    return JSONResponse(
        status_code=200,
        content={"status": "alive"},
    )