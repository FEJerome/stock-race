"""
API routes for Data Service.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

from ..core.auth import get_current_user
from ..models.stock import StockSymbol, StockData, StockQuote, StockHistory
from ..services.data_service import DataService
from ..services.realtime_service import RealtimeService

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    Health check endpoint for data service.
    """
    return {
        "status": "healthy",
        "service": "data-service",
        "timestamp": datetime.now().isoformat(),
        "version": "0.1.0"
    }


@router.get("/stocks", response_model=List[StockSymbol])
async def get_stocks(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    exchange: Optional[str] = None,
    sector: Optional[str] = None,
    data_service: DataService = Depends()
):
    """
    Get list of available stocks.
    """
    try:
        stocks = await data_service.get_stocks(
            skip=skip,
            limit=limit,
            exchange=exchange,
            sector=sector
        )
        return stocks
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stocks/{symbol}/quote", response_model=StockQuote)
async def get_stock_quote(
    symbol: str,
    data_service: DataService = Depends()
):
    """
    Get real-time quote for a specific stock.
    """
    try:
        quote = await data_service.get_stock_quote(symbol)
        if not quote:
            raise HTTPException(status_code=404, detail=f"Stock {symbol} not found")
        return quote
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stocks/{symbol}/history", response_model=List[StockData])
async def get_stock_history(
    symbol: str,
    start_date: datetime = Query(datetime.now() - timedelta(days=30)),
    end_date: datetime = Query(datetime.now()),
    interval: str = Query("1d", pattern="^(1m|5m|15m|30m|1h|1d|1w|1M)$"),
    data_service: DataService = Depends()
):
    """
    Get historical data for a specific stock.
    """
    try:
        history = await data_service.get_stock_history(
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            interval=interval
        )
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stocks/batch/quotes", response_model=Dict[str, StockQuote])
async def get_batch_quotes(
    symbols: List[str] = Query(...),
    data_service: DataService = Depends()
):
    """
    Get real-time quotes for multiple stocks.
    """
    try:
        quotes = await data_service.get_batch_quotes(symbols)
        return quotes
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market/status")
async def get_market_status(
    data_service: DataService = Depends()
):
    """
    Get current market status (open/closed).
    """
    try:
        status = await data_service.get_market_status()
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market/indices")
async def get_market_indices(
    data_service: DataService = Depends()
):
    """
    Get major market indices.
    """
    try:
        indices = await data_service.get_market_indices()
        return indices
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/technical/{symbol}/indicators")
async def get_technical_indicators(
    symbol: str,
    indicators: List[str] = Query(["ma", "macd", "rsi", "bollinger"]),
    period: int = Query(20, ge=5, le=200),
    data_service: DataService = Depends()
):
    """
    Get technical indicators for a stock.
    """
    try:
        technical_data = await data_service.get_technical_indicators(
            symbol=symbol,
            indicators=indicators,
            period=period
        )
        return technical_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_stocks(
    query: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(10, ge=1, le=50),
    data_service: DataService = Depends()
):
    """
    Search stocks by symbol or name.
    """
    try:
        results = await data_service.search_stocks(query, limit)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/data/quality")
async def get_data_quality(
    symbol: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    data_service: DataService = Depends()
):
    """
    Get data quality metrics.
    """
    try:
        quality_metrics = await data_service.get_data_quality(
            symbol=symbol,
            start_date=start_date,
            end_date=end_date
        )
        return quality_metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# @router.websocket("/ws/realtime")
# async def websocket_realtime(
#     websocket: WebSocket,
#     realtime_service: RealtimeService = Depends()
# ):
#     """
#     WebSocket endpoint for real-time data.
#     """
#     await realtime_service.connect(websocket)
#     try:
#         while True:
#             data = await websocket.receive_json()
#             await realtime_service.handle_message(websocket, data)
#     except WebSocketDisconnect:
#         await realtime_service.disconnect(websocket)
#     except Exception as e:
#         await websocket.close(code=1011, reason=str(e))


@router.post("/collect/manual")
async def manual_collection(
    symbols: List[str],
    data_types: List[str] = ["quote", "history"],
    data_service: DataService = Depends(),
    current_user: Dict = Depends(get_current_user)
):
    """
    Trigger manual data collection (requires authentication).
    """
    try:
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")

        result = await data_service.manual_collection(symbols, data_types)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/monitoring/metrics")
async def get_monitoring_metrics(
    data_service: DataService = Depends(),
    current_user: Dict = Depends(get_current_user)
):
    """
    Get data collection monitoring metrics (requires authentication).
    """
    try:
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")

        metrics = await data_service.get_monitoring_metrics()
        return metrics
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/monitoring/data-sources")
async def get_data_sources_monitoring(
    data_service: DataService = Depends(),
    current_user: Dict = Depends(get_current_user)
):
    """
    Get detailed data sources monitoring information (requires authentication).
    """
    try:
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")

        # Get router statistics
        router_stats = data_service.data_router.get_router_stats()
        router_health = data_service.data_router.get_health_status()

        return {
            "timestamp": datetime.now().isoformat(),
            "router_health": router_health,
            "router_stats": router_stats,
            "collection_stats": data_service.collection_stats
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/monitoring/reset-stats")
async def reset_monitoring_stats(
    data_service: DataService = Depends(),
    current_user: Dict = Depends(get_current_user)
):
    """
    Reset monitoring statistics (requires authentication).
    """
    try:
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")

        # Reset router statistics
        data_service.data_router.reset_stats()

        # Reset collection stats
        data_service.collection_stats = {
            "total_collections": 0,
            "successful_collections": 0,
            "failed_collections": 0,
            "last_collection": None,
            "router_stats": {}
        }

        return {"message": "Monitoring statistics reset successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/monitoring/clear-cache")
async def clear_data_cache(
    data_service: DataService = Depends(),
    current_user: Dict = Depends(get_current_user)
):
    """
    Clear data cache (requires authentication).
    """
    try:
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")

        # Clear router cache
        data_service.data_router.clear_cache()

        # Clear Redis cache (if available)
        try:
            await data_service.redis_cache.clear_all()
        except Exception as e:
            logger.warning(f"Failed to clear Redis cache: {str(e)}")

        return {"message": "Data cache cleared successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))