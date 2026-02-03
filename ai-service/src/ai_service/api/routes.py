"""
Main router for AI Service API.
"""

from fastapi import APIRouter

from .endpoints import decision, health

# Create main router
router = APIRouter()

# Include endpoint routers
router.include_router(health.router)
router.include_router(decision.router)

# You can add more routers here as needed
# router.include_router(analysis.router)
# router.include_router(models.router)
# router.include_router(admin.router)

# Optional: Add a root endpoint
@router.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "service": "Stock Race AI Service",
        "version": "0.1.0",
        "description": "AI-powered trading decision service for Stock Race platform",
        "endpoints": {
            "health": "/health",
            "decision": "/decision",
            "docs": "/docs",
            "redoc": "/redoc",
        },
    }