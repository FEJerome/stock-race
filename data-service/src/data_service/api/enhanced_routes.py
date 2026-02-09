"""
Enhanced API routes for data service with multi-source routing capabilities.
"""

import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from ..services.enhanced_data_service import EnhancedDataService, DataSourceStrategy
from ..models.stock import (
    StockQuote, StockData, StockSymbol, DataQualityMetrics,
    CollectionResult, MonitoringMetrics
)

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/v2", tags=["enhanced-data"])

# Global service instance
_enhanced_service: Optional[EnhancedDataService] = None


async def get_enhanced_service() -> EnhancedDataService:
    """Get or create enhanced data service instance."""
    global _enhanced_service
    if _enhanced_service is None:
        _enhanced_service = EnhancedDataService(strategy=DataSourceStrategy.ADAPTIVE)
        await _enhanced_service.initialize()
    return _enhanced_service


# Request/Response models
class BatchQuoteRequest(BaseModel):
    symbols: List[str] = Field(..., description="List of stock symbols")
    segmentation_strategy: str = Field(
        default="by_exchange",
        description="Segmentation strategy: by_exchange, by_first_letter, round_robin"
    )
    use_cache: bool = Field(default=True, description="Whether to use cached data")


class ManualCollectionRequest(BaseModel):
    symbols: List[str] = Field(..., description="List of stock symbols")
    data_types: List[str] = Field(
        default=["quote", "history"],
        description="Types of data to collect: quote, history"
    )
    segmentation_strategy: str = Field(
        default="by_exchange",
        description="Segmentation strategy for batch collection"
    )


class RouterHealthResponse(BaseModel):
    source_health: Dict[str, Any]
    performance: Dict[str, Any]
    strategies: Dict[str, Any]


class StrategyRotationResponse(BaseModel):
    success: bool
    new_strategy: str
    previous_strategy: str


class SourceResetResponse(BaseModel):
    success: bool
    source: str
    is_active: bool


@router.get("/health", summary="Get enhanced service health")
async def get_enhanced_health(
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> Dict[str, Any]:
    """Get enhanced data service health status."""
    try:
        # Get router health
        router_health = await service.get_router_health()

        # Get monitoring metrics
        metrics = await service.get_monitoring_metrics()

        # Get market status
        is_market_hours = service.is_market_hours()
        next_collection = service.get_next_collection_time()

        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "service": "enhanced-data-service",
            "router": {
                "active_sources": router_health["performance"].get("active_sources", []),
                "total_sources": router_health["performance"].get("total_sources", 0),
                "success_rate": router_health["performance"].get("overall_success_rate", 0.0),
                "current_strategy": router_health["strategies"]["current"]
            },
            "monitoring": {
                "total_collections": metrics.total_collections,
                "success_rate": metrics.success_rate,
                "average_latency": metrics.average_latency,
                "data_coverage": len(metrics.data_coverage)
            },
            "market": {
                "is_open": is_market_hours,
                "next_collection": next_collection.isoformat() if next_collection else None
            }
        }

    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")


@router.get("/stocks/{symbol}/quote", response_model=StockQuote, summary="Get stock quote with enhanced routing")
async def get_enhanced_stock_quote(
    symbol: str,
    use_cache: bool = Query(default=True, description="Use cached data"),
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> StockQuote:
    """Get real-time stock quote with multi-source routing and failover."""
    try:
        quote = await service.get_stock_quote(symbol, use_cache=use_cache)
        if not quote:
            raise HTTPException(status_code=404, detail=f"Quote not found for symbol: {symbol}")

        return quote

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get quote for {symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get quote: {str(e)}")


@router.post("/stocks/quotes/batch", summary="Get batch quotes with segmentation")
async def get_enhanced_batch_quotes(
    request: BatchQuoteRequest,
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> Dict[str, StockQuote]:
    """Get real-time quotes for multiple stocks with segmentation strategies."""
    try:
        quotes = await service.get_batch_quotes(
            symbols=request.symbols,
            segmentation_strategy=request.segmentation_strategy,
            use_cache=request.use_cache
        )

        return quotes

    except Exception as e:
        logger.error(f"Failed to get batch quotes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get batch quotes: {str(e)}")


@router.get("/stocks/{symbol}/history", response_model=List[StockData], summary="Get stock history")
async def get_enhanced_stock_history(
    symbol: str,
    start_date: datetime = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: datetime = Query(..., description="End date (YYYY-MM-DD)"),
    interval: str = Query(default="1d", description="Data interval: 1d, 1w, 1M"),
    use_cache: bool = Query(default=True, description="Use cached data"),
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> List[StockData]:
    """Get historical stock data with multi-source fallback."""
    try:
        history = await service.get_stock_history(
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            interval=interval,
            use_cache=use_cache
        )

        if not history:
            raise HTTPException(status_code=404, detail=f"No historical data found for {symbol}")

        return history

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get history for {symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get history: {str(e)}")


@router.get("/market/indices", summary="Get market indices")
async def get_enhanced_market_indices(
    use_cache: bool = Query(default=True, description="Use cached data"),
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> List[Dict[str, Any]]:
    """Get major market indices with enhanced data collection."""
    try:
        indices = await service.get_market_indices(use_cache=use_cache)
        return indices

    except Exception as e:
        logger.error(f"Failed to get market indices: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get market indices: {str(e)}")


@router.get("/stocks/{symbol}/quality", response_model=DataQualityMetrics, summary="Get data quality metrics")
async def get_enhanced_data_quality(
    symbol: str,
    start_date: Optional[datetime] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[datetime] = Query(None, description="End date (YYYY-MM-DD)"),
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> DataQualityMetrics:
    """Get enhanced data quality metrics for a stock."""
    try:
        quality = await service.get_data_quality(
            symbol=symbol,
            start_date=start_date,
            end_date=end_date
        )

        return quality

    except Exception as e:
        logger.error(f"Failed to get data quality for {symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get data quality: {str(e)}")


@router.get("/monitoring", response_model=MonitoringMetrics, summary="Get monitoring metrics")
async def get_enhanced_monitoring_metrics(
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> MonitoringMetrics:
    """Get enhanced monitoring metrics for data collection."""
    try:
        metrics = await service.get_monitoring_metrics()
        return metrics

    except Exception as e:
        logger.error(f"Failed to get monitoring metrics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get monitoring metrics: {str(e)}")


@router.post("/collection/manual", response_model=List[CollectionResult], summary="Trigger manual collection")
async def trigger_enhanced_manual_collection(
    request: ManualCollectionRequest,
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> List[CollectionResult]:
    """Trigger enhanced manual data collection with segmentation."""
    try:
        results = await service.manual_collection(
            symbols=request.symbols,
            data_types=request.data_types,
            segmentation_strategy=request.segmentation_strategy
        )

        return results

    except Exception as e:
        logger.error(f"Failed to trigger manual collection: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to trigger manual collection: {str(e)}")


@router.get("/router/health", response_model=RouterHealthResponse, summary="Get router health")
async def get_router_health(
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> RouterHealthResponse:
    """Get data source router health information."""
    try:
        health = await service.get_router_health()
        return RouterHealthResponse(**health)

    except Exception as e:
        logger.error(f"Failed to get router health: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get router health: {str(e)}")


@router.post("/router/strategy/rotate", response_model=StrategyRotationResponse, summary="Rotate strategy")
async def rotate_strategy(
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> StrategyRotationResponse:
    """Rotate to next data source strategy."""
    try:
        # Get current strategy
        health = await service.get_router_health()
        previous_strategy = health["strategies"]["current"]

        # Rotate strategy
        result = await service.rotate_strategy()

        return StrategyRotationResponse(
            success=True,
            new_strategy=result.get("new_strategy", "unknown"),
            previous_strategy=previous_strategy
        )

    except Exception as e:
        logger.error(f"Failed to rotate strategy: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to rotate strategy: {str(e)}")


@router.post("/router/source/{source_name}/reset", response_model=SourceResetResponse, summary="Reset data source")
async def reset_source(
    source_name: str,
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> SourceResetResponse:
    """Reset a data source (clear errors and reactivate)."""
    try:
        result = await service.reset_source(source_name)

        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])

        return SourceResetResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reset source {source_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to reset source: {str(e)}")


@router.get("/market/status", summary="Get market status")
async def get_market_status(
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> Dict[str, Any]:
    """Get current market status and next collection time."""
    try:
        is_open = service.is_market_hours()
        next_collection = service.get_next_collection_time()

        return {
            "is_open": is_open,
            "next_collection": next_collection.isoformat() if next_collection else None,
            "current_time": datetime.now().isoformat(),
            "recommended_interval": "10s" if is_open else "5m"
        }

    except Exception as e:
        logger.error(f"Failed to get market status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get market status: {str(e)}")


@router.get("/segmentation/strategies", summary="Get available segmentation strategies")
async def get_segmentation_strategies(
    service: EnhancedDataService = Depends(get_enhanced_service)
) -> Dict[str, Any]:
    """Get available segmentation strategies and their statistics."""
    try:
        metrics = await service.get_monitoring_metrics()
        segmentation_stats = metrics.segmentation_stats

        return {
            "available_strategies": list(segmentation_stats.keys()),
            "statistics": segmentation_stats,
            "recommendation": _recommend_strategy(segmentation_stats)
        }

    except Exception as e:
        logger.error(f"Failed to get segmentation strategies: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get segmentation strategies: {str(e)}")


def _recommend_strategy(segmentation_stats: Dict[str, Any]) -> str:
    """Recommend best segmentation strategy based on statistics."""
    if not segmentation_stats:
        return "by_exchange"

    # Find strategy with highest success rate and usage
    best_strategy = "by_exchange"
    best_score = 0.0

    for strategy, stats in segmentation_stats.items():
        if stats["uses"] == 0:
            continue

        # Score based on success rate and usage
        score = stats["success_rate"] * min(stats["uses"], 10) / 10

        if score > best_score:
            best_score = score
            best_strategy = strategy

    return best_strategy


@router.on_event("startup")
async def startup_event():
    """Initialize enhanced service on startup."""
    try:
        service = await get_enhanced_service()
        logger.info("Enhanced data service initialized on startup")
    except Exception as e:
        logger.error(f"Failed to initialize enhanced service on startup: {str(e)}")


@router.on_event("shutdown")
async def shutdown_event():
    """Close enhanced service on shutdown."""
    global _enhanced_service
    if _enhanced_service:
        try:
            await _enhanced_service.close()
            logger.info("Enhanced data service closed on shutdown")
        except Exception as e:
            logger.error(f"Failed to close enhanced service on shutdown: {str(e)}")
        finally:
            _enhanced_service = None