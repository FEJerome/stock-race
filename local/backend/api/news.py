"""
News API Routes - News collection endpoints

Provides news intelligence for AI trading decisions.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db
from services.news.service import get_news_service
from models.schemas import ApiResponse

router = APIRouter(prefix="/api/news", tags=["news"])


@router.get("/{symbol}", response_model=ApiResponse)
async def get_news(
    symbol: str,
    limit: int = 10,
    db: AsyncSession = Depends(get_db)
):
    """
    Get latest intelligence for a stock

    - **symbol**: Stock symbol (e.g., 000001.SZ)
    - **limit**: Number of results (default 10)
    """
    service = get_news_service()

    # Return existing data from database
    intelligence = await service.get_intelligence(symbol, db, limit=limit)

    return ApiResponse(
        code=0,
        message="success",
        data={
            "symbol": symbol,
            "items": intelligence,
            "total": len(intelligence)
        }
    )


@router.post("/{symbol}/collect", response_model=ApiResponse)
async def collect_news(
    symbol: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually trigger news collection (for testing)

    - **symbol**: Stock symbol
    """
    service = get_news_service()

    try:
        intelligence = await service.collect_news(symbol, db, limit=10)
        return ApiResponse(
            code=0,
            message=f"Collected {len(intelligence)} news items",
            data={
                "symbol": symbol,
                "collected": len(intelligence)
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Collection failed: {str(e)}")


@router.get("/intelligence/{symbol}", response_model=ApiResponse)
async def get_intelligence_summary(
    symbol: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get aggregated intelligence summary (for AI use)

    Returns formatted summary string for AI decision making.
    """
    service = get_news_service()
    summary = await service.get_intelligence_summary(symbol, db)

    return ApiResponse(
        code=0,
        message="success",
        data={
            "symbol": symbol,
            "summary": summary,
            "has_data": summary is not None
        }
    )


@router.get("/health/sources", response_model=ApiResponse)
async def get_sources_health():
    """Get news source health status"""
    service = get_news_service()
    health = await service.health_check()

    return ApiResponse(
        code=0,
        message="success",
        data={
            source: {
                "status": h.status.value,
                "latency_ms": h.latency_ms,
                "last_success": h.last_success.isoformat() if h.last_success else None,
                "error_rate": h.error_rate
            }
            for source, h in health.items()
        }
    )
