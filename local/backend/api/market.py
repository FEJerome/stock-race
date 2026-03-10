"""
Market Data API Routes

Provides endpoints for real-time market data and quotes.
"""
from fastapi import APIRouter, HTTPException, status
from typing import List, Optional
from datetime import datetime

from services.market_data import (
    get_router, CSVDataSource, SinaDataSource,
    TencentDataSource, EastMoneyDataSource
)
from models.schemas import ApiResponse, QuoteResponse

router = APIRouter(prefix="/api/market", tags=["market"])

# Data source instances
_csv_source = None
_sina_source = None
_tencent_source = None
_eastmoney_source = None


def _init_sources():
    """Initialize all data sources"""
    global _csv_source, _sina_source, _tencent_source, _eastmoney_source

    data_router = get_router()

    # CSV source (fallback)
    if _csv_source is None:
        import os
        csv_path = os.getenv("MARKET_DATA_CSV", "./data/market_data.csv")
        _csv_source = CSVDataSource(csv_path, name="csv_sample", priority=200)
        data_router.register_source(_csv_source, weight=0.5)

    # Online sources (if network available)
    if _tencent_source is None:
        try:
            _tencent_source = TencentDataSource(name="tencent", priority=40)
            data_router.register_source(_tencent_source, weight=1.0)
        except Exception as e:
            print(f"[MarketAPI] Failed to init Tencent source: {e}")

    if _sina_source is None:
        try:
            _sina_source = SinaDataSource(name="sina", priority=50)
            data_router.register_source(_sina_source, weight=0.9)
        except Exception as e:
            print(f"[MarketAPI] Failed to init Sina source: {e}")

    if _eastmoney_source is None:
        try:
            _eastmoney_source = EastMoneyDataSource(name="eastmoney", priority=60)
            data_router.register_source(_eastmoney_source, weight=0.8)
        except Exception as e:
            print(f"[MarketAPI] Failed to init EastMoney source: {e}")

    return _csv_source


@router.get("/quotes", response_model=ApiResponse)
async def get_quotes(symbols: Optional[str] = None):
    """
    Get real-time quotes for stocks

    - **symbols**: Comma-separated list of stock symbols (e.g., "000001.SZ,000002.SZ")
                   If not provided, returns all available stocks
    """
    _init_sources()
    data_router = get_router()

    if symbols:
        symbol_list = [s.strip() for s in symbols.split(",")]
        results = await data_router.get_quotes(symbol_list)

        items = []
        for symbol, data in results.items():
            items.append({
                "symbol": data.symbol,
                "name": data.name,
                "price": data.price,
                "change": data.change,
                "change_percent": data.change_percent,
                "volume": data.volume,
                "sources": data.sources,
                "confidence": data.confidence,
                "timestamp": data.timestamp.isoformat()
            })
    else:
        # Get all stocks
        source = _csv_source
        quotes = await source.get_all_stocks()

        items = []
        for quote in quotes:
            items.append({
                "symbol": quote.symbol,
                "name": quote.name,
                "price": quote.price,
                "change": quote.change,
                "change_percent": quote.change_percent,
                "volume": quote.volume,
                "sources": [quote.source] if quote.source else ["csv"],
                "confidence": 1.0,
                "timestamp": quote.timestamp.isoformat() if quote.timestamp else datetime.utcnow().isoformat()
            })

    return ApiResponse(
        code=0,
        message="success",
        data={
            "items": items,
            "total": len(items)
        }
    )


@router.get("/quotes/{symbol}", response_model=ApiResponse)
async def get_quote(symbol: str):
    """
    Get real-time quote for a single stock

    - **symbol**: Stock symbol (e.g., "000001.SZ")
    """
    _init_sources()
    data_router = get_router()

    quote = await data_router.get_quote(symbol)

    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Quote not found for symbol: {symbol}"
        )

    return ApiResponse(
        code=0,
        message="success",
        data={
            "symbol": quote.symbol,
            "name": quote.name,
            "price": quote.price,
            "change": quote.change,
            "change_percent": quote.change_percent,
            "volume": quote.volume,
            "open": quote.open,
            "high": quote.high,
            "low": quote.low,
            "prev_close": quote.prev_close,
            "timestamp": quote.timestamp.isoformat() if quote.timestamp else datetime.utcnow().isoformat(),
            "source": quote.source
        }
    )


@router.get("/health", response_model=ApiResponse)
async def get_market_health():
    """Get health status of all data sources"""
    _init_sources()
    data_router = get_router()

    health = await data_router.health_check()

    return ApiResponse(
        code=0,
        message="success",
        data={
            "sources": {
                name: {
                    "status": h.status.value,
                    "latency_ms": h.latency_ms,
                    "last_success": h.last_success.isoformat() if h.last_success else None,
                    "error_rate": h.error_rate,
                    "weight": h.weight
                }
                for name, h in health.items()
            }
        }
    )


@router.get("/sources", response_model=ApiResponse)
async def get_sources():
    """Get list of registered data sources"""
    _init_sources()
    data_router = get_router()

    stats = data_router.get_source_stats()

    return ApiResponse(
        code=0,
        message="success",
        data={
            "sources": [
                {
                    "name": name,
                    "priority": info["priority"],
                    "weight": info["weight"],
                    "health": info["health"].status.value if info["health"] else "unknown"
                }
                for name, info in stats.items()
            ]
        }
    )
