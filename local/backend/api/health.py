"""
Health check endpoint
"""
from datetime import datetime
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "code": 0,
        "data": {
            "status": "ok",
            "version": "0.1.0",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    }
