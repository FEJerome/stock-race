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


@router.websocket("/ws/public/quotes")
async def websocket_public_quotes(
    websocket: WebSocket,
    realtime_service: RealtimeService = Depends()
):
    """
    Public WebSocket endpoint for real-time stock quotes (O6-001).

    No authentication required. Supports subscribing to stock symbols
    for real-time updates.

    Message types:
    - subscribe: {"type": "subscribe", "data": {"symbols": ["000001.SZ"]}}
    - unsubscribe: {"type": "unsubscribe", "data": {"symbols": ["000001.SZ"]}}
    - ping: {"type": "ping"}
    - get_subscriptions: {"type": "get_subscriptions"}
    - get_stats: {"type": "get_stats"}

    Subscription limit: 50 symbols per connection (O6-008)
    """
    await realtime_service.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await realtime_service.handle_message(websocket, data)
    except WebSocketDisconnect:
        await realtime_service.disconnect(websocket)
    except Exception as e:
        await websocket.close(code=1011, reason=str(e))


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


# Sector/Industry/Index API endpoints (C6-004, C6-005, C6-006, C6-008)

@router.get("/market/sector/{sector}/quotes")
async def get_sector_quotes(
    sector: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    sort_by: str = Query("market_cap", pattern="^(market_cap|price|change_percent|volume)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    data_service: DataService = Depends()
):
    """
    Get real-time quotes for stocks in a specific sector (C6-004).

    Args:
        sector: Sector code (e.g., financial, technology, consumer)
        skip: Number of records to skip (pagination)
        limit: Maximum number of records to return (1-100)
        sort_by: Field to sort by
        sort_order: Sort order (asc or desc)
    """
    try:
        quotes = await data_service.get_sector_quotes(
            sector=sector,
            skip=skip,
            limit=limit,
            sort_by=sort_by,
            sort_order=sort_order
        )
        return {
            "sector": sector,
            "quotes": quotes,
            "count": len(quotes),
            "skip": skip,
            "limit": limit,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market/industry/{industry}/quotes")
async def get_industry_quotes(
    industry: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    sort_by: str = Query("market_cap", pattern="^(market_cap|price|change_percent|volume)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    data_service: DataService = Depends()
):
    """
    Get real-time quotes for stocks in a specific industry (C6-005).

    Args:
        industry: Industry code (e.g., banking, software, retail)
        skip: Number of records to skip (pagination)
        limit: Maximum number of records to return (1-100)
        sort_by: Field to sort by
        sort_order: Sort order (asc or desc)
    """
    try:
        quotes = await data_service.get_industry_quotes(
            industry=industry,
            skip=skip,
            limit=limit,
            sort_by=sort_by,
            sort_order=sort_order
        )
        return {
            "industry": industry,
            "quotes": quotes,
            "count": len(quotes),
            "skip": skip,
            "limit": limit,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market/index/{index}/components")
async def get_index_components(
    index: str,
    include_quotes: bool = Query(True),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    data_service: DataService = Depends()
):
    """
    Get component stocks for a specific market index (C6-006).

    Args:
        index: Index code (e.g., 000001.SH for Shanghai Composite)
        include_quotes: Whether to include real-time quotes
        skip: Number of records to skip (pagination)
        limit: Maximum number of records to return (1-100)
    """
    try:
        components = await data_service.get_index_components(
            index=index,
            include_quotes=include_quotes,
            skip=skip,
            limit=limit
        )
        return {
            "index": index,
            "components": components,
            "count": len(components),
            "skip": skip,
            "limit": limit,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market/sectors")
async def get_sector_list(
    data_service: DataService = Depends()
):
    """
    Get list of available sectors (C6-007).
    """
    try:
        sectors = await data_service.get_sector_list()
        return {
            "sectors": sectors,
            "count": len(sectors),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market/industries")
async def get_industry_list(
    sector: Optional[str] = Query(None, description="Filter by sector code"),
    data_service: DataService = Depends()
):
    """
    Get list of available industries (C6-007).
    """
    try:
        industries = await data_service.get_industry_list(sector=sector)
        return {
            "industries": industries,
            "count": len(industries),
            "sector_filter": sector,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stocks/{symbol}/classification")
async def get_stock_classification(
    symbol: str,
    data_service: DataService = Depends()
):
    """
    Get classification information for a stock (C6-007).

    Returns sector, industry, and concept tags for the stock.
    """
    try:
        classification = await data_service.get_stock_classification(symbol)
        if not classification:
            raise HTTPException(status_code=404, detail=f"Classification not found for {symbol}")
        return classification
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# AI决策服务批量查询API
from ..models.ai_query import AIQueryRequest, AIQueryResponse
from ..services.ai_query_service import AIQueryService

@router.post("/ai/batch-query", response_model=AIQueryResponse)
async def ai_batch_query(
    request: AIQueryRequest,
    data_service: DataService = Depends()
):
    """
    AI决策服务智能批量行情查询API。

    专为AI决策优化的聚合查询接口，支持：
    - 多维度并集查询（板块+行业+概念+指数+个股）
    - 智能数据压缩和采样
    - 多级缓存机制
    - 批量并行查询

    ## 请求示例

    ```json
    {
        "scope": {
            "sectors": ["financial", "technology"],
            "industries": ["banking", "software"],
            "symbols": ["000001.SZ", "000002.SZ"]
        },
        "filter": {
            "min_market_cap": 100,
            "exclude_st": true,
            "exclude_suspended": true
        },
        "data_types": ["quote", "kline"],
        "time_range": "recent_1w",
        "info_density": "medium",
        "max_stocks": 200,
        "include_market_summary": true,
        "request_id": "ai_decision_001"
    }
    ```

    ## 信息密度级别

    - `ultra_low`: 极端压缩（3-5字段，10%采样）
    - `low`: 高度压缩（5-8字段，25%采样）
    - `medium`: 适中（8-12字段，50%采样）
    - `high`: 详细（12-18字段，75%采样）
    - `full`: 完整（所有字段，100%采样）
    """
    try:
        ai_service = AIQueryService(data_service, data_service.redis_cache)
        response = await ai_service.query(request)
        return response
    except Exception as e:
        logger.error(f"AI batch query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")
