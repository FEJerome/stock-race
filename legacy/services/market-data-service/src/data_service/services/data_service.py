"""
Main data service class coordinating data collection, processing, and storage.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from contextlib import asynccontextmanager

from ..collectors.router import DataSourceRouter
from ..collectors.base import DataSourceError
from ..processors.data_processor import DataProcessor
from ..storage.database import DatabaseStorage
from ..storage.cache import RedisCache, get_redis_cache
from ..models.stock import (
    StockSymbol, StockQuote, StockData, StockHistory,
    TechnicalIndicator, DataQualityMetrics, CollectionResult,
    MonitoringMetrics
)
from ..core.config import settings

logger = logging.getLogger(__name__)


class DataService:
    """Main data service coordinating all data operations."""

    def __init__(self):
        self.data_router = DataSourceRouter()
        self.data_processor = DataProcessor()
        self.database_storage = DatabaseStorage()
        self.redis_cache = get_redis_cache()
        self.is_initialized = False
        self.collection_stats = {
            "total_collections": 0,
            "successful_collections": 0,
            "failed_collections": 0,
            "last_collection": None,
            "router_stats": {}
        }

    async def initialize(self):
        """Initialize data service components with fallback support."""
        if self.is_initialized:
            return

        try:
            # Initialize data router
            await self.data_router.initialize()

            # Initialize storage with fallback support
            try:
                await self.database_storage.connect()
            except Exception as e:
                logger.warning(f"Database connection failed: {str(e)}")
                logger.info("Data service will operate in fallback mode with simulated data")

            try:
                await self.redis_cache.connect()
            except Exception as e:
                logger.warning(f"Redis connection failed: {str(e)}")
                logger.info("Data service will operate without Redis caching")

            self.is_initialized = True
            logger.info("Data service initialized successfully (with fallback support)")

        except Exception as e:
            logger.error(f"Failed to initialize data service: {str(e)}")
            # Even if initialization fails partially, mark as initialized to allow operation
            self.is_initialized = True
            logger.info("Data service initialized in degraded mode")

    async def close(self):
        """Close data service components."""
        try:
            # Close data router
            await self.data_router.close()

            # Close storage
            await self.database_storage.close()
            await self.redis_cache.close()

            self.is_initialized = False
            logger.info("Data service closed")

        except Exception as e:
            logger.error(f"Error closing data service: {str(e)}")

    async def get_stocks(
        self,
        skip: int = 0,
        limit: int = 100,
        exchange: Optional[str] = None,
        sector: Optional[str] = None
    ) -> List[StockSymbol]:
        """
        Get list of available stocks.

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            exchange: Filter by exchange
            sector: Filter by sector

        Returns:
            List of StockSymbol objects
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # For now, return default stocks
            # In production, this would query the database
            default_stocks = []

            for symbol in settings.DEFAULT_STOCK_SYMBOLS:
                stock_info = await self.get_stock_info(symbol)
                if stock_info:
                    default_stocks.append(stock_info)

            # Apply filters
            filtered_stocks = []
            for stock in default_stocks:
                if exchange and stock.exchange != exchange:
                    continue
                if sector and stock.sector != sector:
                    continue
                filtered_stocks.append(stock)

            # Apply pagination
            return filtered_stocks[skip:skip + limit]

        except Exception as e:
            logger.error(f"Failed to get stocks: {str(e)}")
            return []

    async def get_stock_quote(self, symbol: str) -> Optional[StockQuote]:
        """
        Get real-time quote for a stock.

        Args:
            symbol: Stock symbol

        Returns:
            StockQuote object or None if not found
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # First try smart cache
            cached_quote = await self.redis_cache.get_cached_quote_smart(symbol)
            if cached_quote:
                # Check if cache is fresh (less than 5 seconds old)
                cache_age = (datetime.now() - cached_quote.timestamp).total_seconds()
                if cache_age < 5:
                    return cached_quote

            # Try database
            db_quote = await self.database_storage.get_latest_quote(symbol)
            if db_quote:
                # Check if database quote is fresh (less than 30 seconds old)
                db_age = (datetime.now() - db_quote.timestamp).total_seconds()
                if db_age < 30:
                    # Update cache
                    await self.redis_cache.cache_stock_quote(db_quote)
                    return db_quote

            # Collect fresh data using data router
            raw_quote = await self.data_router.get_stock_quote(symbol)

            if not raw_quote:
                logger.warning(f"Failed to get quote for {symbol} from any source")
                return cached_quote or db_quote  # Return stale data if available

            # Process quote
            cleaned_quote = self.data_processor.clean_stock_quote(raw_quote)

            # Save to storage with smart caching
            await self.database_storage.save_stock_quote(cleaned_quote)
            await self.redis_cache.cache_stock_quote_smart(cleaned_quote)

            # Update collection stats
            self._update_collection_stats(success=True)

            return cleaned_quote

        except Exception as e:
            logger.error(f"Failed to get stock quote for {symbol}: {str(e)}")
            self._update_collection_stats(success=False)
            return None

    async def get_batch_quotes(self, symbols: List[str]) -> Dict[str, StockQuote]:
        """
        Get real-time quotes for multiple stocks.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to StockQuote
        """
        if not self.is_initialized:
            await self.initialize()

        quotes = {}

        try:
            # Try cache first
            cached_quotes = await self.redis_cache.get_batch_cached_quotes(symbols)

            # Identify symbols that need fresh data
            fresh_symbols = []
            for symbol in symbols:
                if symbol in cached_quotes:
                    quote = cached_quotes[symbol]
                    cache_age = (datetime.now() - quote.timestamp).total_seconds()
                    if cache_age < 5:  # Cache is fresh
                        quotes[symbol] = quote
                    else:
                        fresh_symbols.append(symbol)
                else:
                    fresh_symbols.append(symbol)

            # Collect fresh data for remaining symbols using data router
            if fresh_symbols:
                raw_quotes = await self.data_router.get_batch_quotes(fresh_symbols)

                for symbol, raw_quote in raw_quotes.items():
                    try:
                        cleaned_quote = self.data_processor.clean_stock_quote(raw_quote)
                        quotes[symbol] = cleaned_quote

                        # Save to storage
                        await self.database_storage.save_stock_quote(cleaned_quote)
                        await self.redis_cache.cache_stock_quote_smart(cleaned_quote)
                    except Exception as e:
                        logger.error(f"Failed to process quote for {symbol}: {str(e)}")
                        continue

            # Update collection stats
            successful = len([q for q in quotes.values() if q])
            self._update_collection_stats(success=successful > 0)

            return quotes

        except Exception as e:
            logger.error(f"Failed to get batch quotes: {str(e)}")
            self._update_collection_stats(success=False)
            return {}

    async def get_stock_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> List[StockData]:
        """
        Get historical data for a stock.

        Args:
            symbol: Stock symbol
            start_date: Start date
            end_date: End date
            interval: Data interval

        Returns:
            List of StockData objects
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # Try database first
            db_history = await self.database_storage.get_stock_history(
                symbol, start_date, end_date, interval
            )

            if db_history:
                # Check if we have enough data
                expected_days = (end_date - start_date).days
                if len(db_history) >= expected_days * 0.8:  # At least 80% coverage
                    return db_history

            # Collect fresh data using data router
            raw_history = await self.data_router.get_stock_history(
                symbol, start_date, end_date, interval
            )

            if not raw_history:
                logger.warning(f"No historical data found for {symbol}")
                return db_history or []

            # Process data
            cleaned_history = self.data_processor.clean_stock_data(raw_history)

            # Save to database
            await self.database_storage.save_stock_history(cleaned_history, interval)

            # Update collection stats
            self._update_collection_stats(success=True)

            return cleaned_history

        except Exception as e:
            logger.error(f"Failed to get stock history for {symbol}: {str(e)}")
            self._update_collection_stats(success=False)
            return []

    async def get_stock_info(self, symbol: str) -> Optional[StockSymbol]:
        """
        Get stock information.

        Args:
            symbol: Stock symbol

        Returns:
            StockSymbol object or None if not found
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # Try cache first
            cached_info = await self.redis_cache.get_cached_stock_info(symbol)
            if cached_info:
                return cached_info

            # Try database
            db_info = await self.database_storage.get_stock_info(symbol)
            if db_info:
                # Update cache
                await self.redis_cache.cache_stock_info(db_info)
                return db_info

            # Collect from data router
            raw_info = await self.data_router.get_stock_info(symbol)
            if raw_info:
                # Create StockSymbol object
                stock_info = StockSymbol(
                    symbol=symbol,
                    name=raw_info.get("name", ""),
                    exchange=raw_info.get("exchange", "SH"),
                    sector=raw_info.get("sector"),
                    market_cap=raw_info.get("market_cap"),
                    pe_ratio=raw_info.get("pe_ratio"),
                    pb_ratio=raw_info.get("pb_ratio"),
                    dividend_yield=raw_info.get("dividend_yield"),
                    listing_date=raw_info.get("listing_date"),
                    is_active=True
                )

                # Save to storage
                await self.database_storage.save_stock_info(stock_info)
                await self.redis_cache.cache_stock_info(stock_info)

                return stock_info

            return None

        except Exception as e:
            logger.error(f"Failed to get stock info for {symbol}: {str(e)}")
            return None

    async def get_market_status(self) -> Dict[str, Any]:
        """
        Get current market status.

        Returns:
            Dictionary with market status
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # Try cache first
            cached_status = await self.redis_cache.get_cached_market_status()
            if cached_status:
                return cached_status

            # Determine market status based on time
            now = datetime.now()
            market_open = datetime.now().replace(
                hour=settings.MARKET_OPEN_HOUR,
                minute=settings.MARKET_OPEN_MINUTE,
                second=0,
                microsecond=0
            )
            market_close = datetime.now().replace(
                hour=settings.MARKET_CLOSE_HOUR,
                minute=settings.MARKET_CLOSE_MINUTE,
                second=0,
                microsecond=0
            )

            is_market_open = market_open <= now <= market_close
            is_weekend = now.weekday() >= 5  # Saturday or Sunday

            status = {
                "is_open": is_market_open and not is_weekend,
                "next_open": self._calculate_next_market_open(now),
                "next_close": market_close if is_market_open else None,
                "current_time": now.isoformat(),
                "market_hours": {
                    "open": f"{settings.MARKET_OPEN_HOUR:02d}:{settings.MARKET_OPEN_MINUTE:02d}",
                    "close": f"{settings.MARKET_CLOSE_HOUR:02d}:{settings.MARKET_CLOSE_MINUTE:02d}"
                }
            }

            # Cache status
            await self.redis_cache.cache_market_status(status)

            return status

        except Exception as e:
            logger.error(f"Failed to get market status: {str(e)}")
            return {
                "is_open": False,
                "error": str(e),
                "current_time": datetime.now().isoformat()
            }

    async def get_market_indices(self) -> List[Dict[str, Any]]:
        """
        Get major market indices.

        Returns:
            List of market index dictionaries
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # Try cache first
            cached_indices = await self.redis_cache.get_cached_market_indices()
            if cached_indices:
                return cached_indices

            # Default Chinese market indices
            indices = [
                {
                    "symbol": "000001.SH",
                    "name": "上证指数",
                    "price": 0.0,
                    "change": 0.0,
                    "change_percent": 0.0,
                    "timestamp": datetime.now().isoformat()
                },
                {
                    "symbol": "399001.SZ",
                    "name": "深证成指",
                    "price": 0.0,
                    "change": 0.0,
                    "change_percent": 0.0,
                    "timestamp": datetime.now().isoformat()
                },
                {
                    "symbol": "399006.SZ",
                    "name": "创业板指",
                    "price": 0.0,
                    "change": 0.0,
                    "change_percent": 0.0,
                    "timestamp": datetime.now().isoformat()
                }
            ]

            # Try to get real data for indices
            for index in indices:
                try:
                    quote = await self.get_stock_quote(index["symbol"])
                    if quote:
                        index.update({
                            "price": quote.price,
                            "change": quote.change,
                            "change_percent": quote.change_percent,
                            "timestamp": quote.timestamp.isoformat()
                        })
                except Exception as e:
                    logger.debug(f"Failed to get index data for {index['symbol']}: {str(e)}")
                    continue

            # Cache indices
            await self.redis_cache.cache_market_indices(indices)

            return indices

        except Exception as e:
            logger.error(f"Failed to get market indices: {str(e)}")
            return []

    async def get_technical_indicators(
        self,
        symbol: str,
        indicators: List[str],
        period: int = 20
    ) -> Dict[str, Any]:
        """
        Get technical indicators for a stock.

        Args:
            symbol: Stock symbol
            indicators: List of indicator names
            period: Period for indicators

        Returns:
            Dictionary with technical indicators
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # Try cache first
            cached_indicators = await self.redis_cache.get_cached_technical_indicators(symbol)
            if cached_indicators:
                # Check if cache is fresh
                cache_timestamp = datetime.fromisoformat(cached_indicators.get("timestamp", ""))
                cache_age = (datetime.now() - cache_timestamp).total_seconds()
                if cache_age < 3600:  # 1 hour
                    return cached_indicators

            # Get historical data for calculation
            end_date = datetime.now()
            start_date = end_date - timedelta(days=period * 2)  # Get enough data

            historical_data = await self.get_stock_history(
                symbol, start_date, end_date, "1d"
            )

            if not historical_data:
                return {"error": "No historical data available"}

            # Calculate indicators
            calculated_indicators = self.data_processor.calculate_technical_indicators(
                historical_data, indicators
            )

            # Convert to serializable format
            result = {
                "symbol": symbol,
                "indicators": {},
                "timestamp": datetime.now().isoformat()
            }

            for name, indicator in calculated_indicators.items():
                result["indicators"][name] = {
                    "name": indicator.name,
                    "values": indicator.values,
                    "timestamps": [ts.isoformat() for ts in indicator.timestamps],
                    "parameters": indicator.parameters
                }

            # Cache results
            await self.redis_cache.cache_technical_indicators(symbol, result)

            return result

        except Exception as e:
            logger.error(f"Failed to get technical indicators for {symbol}: {str(e)}")
            return {"error": str(e)}

    async def search_stocks(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Search stocks by symbol or name.

        Args:
            query: Search query
            limit: Maximum number of results

        Returns:
            List of stock search results
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # Search in database
            stocks = await self.database_storage.search_stocks(query, limit)

            # Convert to search result format
            results = []
            for stock in stocks:
                # Try to get current price
                quote = await self.get_stock_quote(stock.symbol)

                results.append({
                    "symbol": stock.symbol,
                    "name": stock.name,
                    "exchange": stock.exchange,
                    "sector": stock.sector,
                    "current_price": quote.price if quote else None,
                    "change_percent": quote.change_percent if quote else None,
                    "market_cap": stock.market_cap
                })

            return results

        except Exception as e:
            logger.error(f"Failed to search stocks: {str(e)}")
            return []

    async def get_data_quality(
        self,
        symbol: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> DataQualityMetrics:
        """
        Get data quality metrics.

        Args:
            symbol: Optional stock symbol
            start_date: Optional start date
            end_date: Optional end date

        Returns:
            DataQualityMetrics object
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            # Get metrics from database
            metrics = await self.database_storage.get_data_quality_metrics(
                symbol, start_date, end_date
            )

            # Create DataQualityMetrics object
            if symbol:
                symbol_str = symbol
            else:
                symbol_str = "all"

            return DataQualityMetrics(
                symbol=symbol_str,
                completeness=metrics.get("completeness", 0.0),
                accuracy=0.9,  # Placeholder - would need validation logic
                timeliness=metrics.get("timeliness", 0.0),
                consistency=0.95,  # Placeholder
                total_records=metrics.get("total_records", 0),
                missing_records=0,  # Would need to calculate
                duplicate_records=0,  # Would need to calculate
                invalid_records=metrics.get("invalid_prices", 0) + metrics.get("invalid_volumes", 0),
                last_update=datetime.fromisoformat(metrics.get("latest_timestamp")) if metrics.get("latest_timestamp") else datetime.now()
            )

        except Exception as e:
            logger.error(f"Failed to get data quality metrics: {str(e)}")
            return DataQualityMetrics(
                symbol=symbol or "unknown",
                completeness=0.0,
                accuracy=0.0,
                timeliness=0.0,
                consistency=0.0,
                total_records=0,
                missing_records=0,
                duplicate_records=0,
                invalid_records=0,
                last_update=datetime.now()
            )

    async def manual_collection(
        self,
        symbols: List[str],
        data_types: List[str] = ["quote", "history"]
    ) -> List[CollectionResult]:
        """
        Trigger manual data collection.

        Args:
            symbols: List of stock symbols
            data_types: Types of data to collect

        Returns:
            List of collection results
        """
        if not self.is_initialized:
            await self.initialize()

        results = []

        for symbol in symbols:
            try:
                records_collected = 0

                if "quote" in data_types:
                    quote = await self.get_stock_quote(symbol)
                    if quote:
                        records_collected += 1

                if "history" in data_types:
                    # Collect last 30 days of daily data
                    end_date = datetime.now()
                    start_date = end_date - timedelta(days=30)
                    history = await self.get_stock_history(symbol, start_date, end_date, "1d")
                    if history:
                        records_collected += len(history)

                results.append(CollectionResult(
                    symbol=symbol,
                    data_type=",".join(data_types),
                    success=True,
                    records_collected=records_collected
                ))

            except Exception as e:
                results.append(CollectionResult(
                    symbol=symbol,
                    data_type=",".join(data_types),
                    success=False,
                    error=str(e)
                ))

        return results

    async def get_monitoring_metrics(self) -> MonitoringMetrics:
        """
        Get data collection monitoring metrics.

        Returns:
            MonitoringMetrics object
        """
        # Get router statistics
        router_stats = self.data_router.get_router_stats()
        router_health = self.data_router.get_health_status()

        total = self.collection_stats["total_collections"]
        successful = self.collection_stats["successful_collections"]
        failed = self.collection_stats["failed_collections"]

        success_rate = successful / total if total > 0 else 0.0

        # Calculate average latency from router stats
        avg_latency = router_stats.get("avg_response_time", 0.0)

        # Get active sources from router
        active_sources = []
        for source_name, source_stats in router_stats.get("data_sources", {}).items():
            if source_stats.get("is_available", False):
                active_sources.append(source_name)

        return MonitoringMetrics(
            total_collections=total,
            successful_collections=successful,
            failed_collections=failed,
            success_rate=success_rate,
            average_latency=avg_latency,
            last_collection=self.collection_stats["last_collection"],
            active_sources=active_sources,
            data_coverage=self._calculate_data_coverage(),
            router_health=router_health.get("status", "unknown"),
            router_success_rate=router_stats.get("success_rate", 0.0),
            healthy_sources_count=router_health.get("healthy_sources", 0),
            total_sources_count=router_health.get("total_sources", 0)
        )

    def _update_collection_stats(self, success: bool):
        """Update collection statistics."""
        self.collection_stats["total_collections"] += 1
        if success:
            self.collection_stats["successful_collections"] += 1
        else:
            self.collection_stats["failed_collections"] += 1
        self.collection_stats["last_collection"] = datetime.now()

    def _calculate_data_coverage(self) -> Dict[str, float]:
        """Calculate data coverage for default stocks."""
        coverage = {}
        total_stocks = len(settings.DEFAULT_STOCK_SYMBOLS)

        for symbol in settings.DEFAULT_STOCK_SYMBOLS:
            # Simple coverage calculation - would need actual data check
            coverage[symbol] = 0.8  # Placeholder

        return coverage

    def _calculate_next_market_open(self, current_time: datetime) -> Optional[datetime]:
        """Calculate next market open time."""
        # If market is open today, next open is tomorrow
        if current_time.weekday() < 5:  # Weekday
            next_open = current_time.replace(
                hour=settings.MARKET_OPEN_HOUR,
                minute=settings.MARKET_OPEN_MINUTE,
                second=0,
                microsecond=0
            )

            # If current time is after market close, next open is next weekday
            market_close = current_time.replace(
                hour=settings.MARKET_CLOSE_HOUR,
                minute=settings.MARKET_CLOSE_MINUTE,
                second=0,
                microsecond=0
            )

            if current_time > market_close:
                # Move to next weekday
                days_to_add = 1
                while (current_time + timedelta(days=days_to_add)).weekday() >= 5:
                    days_to_add += 1
                next_open = (current_time + timedelta(days=days_to_add)).replace(
                    hour=settings.MARKET_OPEN_HOUR,
                    minute=settings.MARKET_OPEN_MINUTE,
                    second=0,
                    microsecond=0
                )

            return next_open

        return None

    # Sector/Industry/Index methods (C6-004, C6-005, C6-006, C6-007, C6-008)

    async def get_sector_quotes(
        self,
        sector: str,
        skip: int = 0,
        limit: int = 50,
        sort_by: str = "market_cap",
        sort_order: str = "desc"
    ) -> Dict[str, StockQuote]:
        """
        Get real-time quotes for stocks in a specific sector (C6-004).

        Args:
            sector: Sector code (e.g., financial, technology)
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            sort_by: Field to sort by
            sort_order: Sort order (asc or desc)

        Returns:
            Dictionary of stock quotes keyed by symbol
        """
        # Try to get from cache first (C6-008)
        cache_key = f"sector:{sector}:quotes:{skip}:{limit}:{sort_by}:{sort_order}"
        try:
            cached = await self.redis_cache.get(cache_key)
            if cached:
                return cached
        except Exception:
            pass

        # Get symbols for this sector
        symbols = await self._get_sector_symbols(sector)

        # Apply pagination
        paginated_symbols = symbols[skip:skip + limit]

        # Get quotes for symbols
        quotes = {}
        for symbol in paginated_symbols:
            try:
                quote = await self.get_stock_quote(symbol)
                if quote:
                    quotes[symbol] = quote
            except Exception as e:
                logger.warning(f"Failed to get quote for {symbol}: {e}")

        # Sort results
        reverse = sort_order == "desc"
        if sort_by == "market_cap":
            sorted_quotes = dict(sorted(quotes.items(), key=lambda x: (x[1].market_cap or 0), reverse=reverse))
        elif sort_by == "price":
            sorted_quotes = dict(sorted(quotes.items(), key=lambda x: x[1].price, reverse=reverse))
        elif sort_by == "change_percent":
            sorted_quotes = dict(sorted(quotes.items(), key=lambda x: x[1].change_percent, reverse=reverse))
        elif sort_by == "volume":
            sorted_quotes = dict(sorted(quotes.items(), key=lambda x: x[1].volume, reverse=reverse))
        else:
            sorted_quotes = quotes

        # Cache for 5 minutes (C6-008)
        try:
            await self.redis_cache.set(cache_key, sorted_quotes, expire=300)
        except Exception:
            pass

        return sorted_quotes

    async def get_industry_quotes(
        self,
        industry: str,
        skip: int = 0,
        limit: int = 50,
        sort_by: str = "market_cap",
        sort_order: str = "desc"
    ) -> Dict[str, StockQuote]:
        """
        Get real-time quotes for stocks in a specific industry (C6-005).

        Args:
            industry: Industry code (e.g., banking, software)
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            sort_by: Field to sort by
            sort_order: Sort order (asc or desc)

        Returns:
            Dictionary of stock quotes keyed by symbol
        """
        # Try to get from cache first (C6-008)
        cache_key = f"industry:{industry}:quotes:{skip}:{limit}:{sort_by}:{sort_order}"
        try:
            cached = await self.redis_cache.get(cache_key)
            if cached:
                return cached
        except Exception:
            pass

        # Get symbols for this industry
        symbols = await self._get_industry_symbols(industry)

        # Apply pagination
        paginated_symbols = symbols[skip:skip + limit]

        # Get quotes for symbols
        quotes = {}
        for symbol in paginated_symbols:
            try:
                quote = await self.get_stock_quote(symbol)
                if quote:
                    quotes[symbol] = quote
            except Exception as e:
                logger.warning(f"Failed to get quote for {symbol}: {e}")

        # Sort results
        reverse = sort_order == "desc"
        if sort_by == "market_cap":
            sorted_quotes = dict(sorted(quotes.items(), key=lambda x: (x[1].market_cap or 0), reverse=reverse))
        elif sort_by == "price":
            sorted_quotes = dict(sorted(quotes.items(), key=lambda x: x[1].price, reverse=reverse))
        elif sort_by == "change_percent":
            sorted_quotes = dict(sorted(quotes.items(), key=lambda x: x[1].change_percent, reverse=reverse))
        elif sort_by == "volume":
            sorted_quotes = dict(sorted(quotes.items(), key=lambda x: x[1].volume, reverse=reverse))
        else:
            sorted_quotes = quotes

        # Cache for 5 minutes (C6-008)
        try:
            await self.redis_cache.set(cache_key, sorted_quotes, expire=300)
        except Exception:
            pass

        return sorted_quotes

    async def get_index_components(
        self,
        index: str,
        include_quotes: bool = True,
        skip: int = 0,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get component stocks for a specific market index (C6-006).

        Args:
            index: Index code (e.g., 000001.SH)
            include_quotes: Whether to include real-time quotes
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return

        Returns:
            List of component stock information
        """
        # Get symbols for this index
        symbols = await self._get_index_symbols(index)

        # Apply pagination
        paginated_symbols = symbols[skip:skip + limit]

        components = []
        for symbol in paginated_symbols:
            component = {"symbol": symbol}

            if include_quotes:
                try:
                    quote = await self.get_stock_quote(symbol)
                    if quote:
                        component["quote"] = quote
                except Exception as e:
                    logger.warning(f"Failed to get quote for {symbol}: {e}")

            # Get classification info
            classification = await self.get_stock_classification(symbol)
            if classification:
                component["classification"] = classification

            components.append(component)

        return components

    async def get_sector_list(self) -> List[Dict[str, Any]]:
        """
        Get list of available sectors (C6-007).

        Returns:
            List of sector information
        """
        sectors = [
            {"code": "financial", "name": "金融", "name_en": "Financial", "count": 150},
            {"code": "technology", "name": "科技", "name_en": "Technology", "count": 200},
            {"code": "consumer", "name": "消费", "name_en": "Consumer", "count": 180},
            {"code": "industrial", "name": "工业", "name_en": "Industrial", "count": 120},
            {"code": "healthcare", "name": "医疗", "name_en": "Healthcare", "count": 100},
            {"code": "energy", "name": "能源", "name_en": "Energy", "count": 80},
            {"code": "materials", "name": "材料", "name_en": "Materials", "count": 90},
            {"code": "utilities", "name": "公用事业", "name_en": "Utilities", "count": 60},
            {"code": "real_estate", "name": "房地产", "name_en": "Real Estate", "count": 70},
            {"code": "communication", "name": "通信", "name_en": "Communication", "count": 50}
        ]
        return sectors

    async def get_industry_list(self, sector: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get list of available industries (C6-007).

        Args:
            sector: Optional sector code to filter by

        Returns:
            List of industry information
        """
        industries = [
            {"code": "banking", "name": "银行", "name_en": "Banking", "sector": "financial", "count": 40},
            {"code": "insurance", "name": "保险", "name_en": "Insurance", "sector": "financial", "count": 30},
            {"code": "securities", "name": "证券", "name_en": "Securities", "sector": "financial", "count": 50},
            {"code": "software", "name": "软件", "name_en": "Software", "sector": "technology", "count": 80},
            {"code": "hardware", "name": "硬件", "name_en": "Hardware", "sector": "technology", "count": 60},
            {"code": "semiconductor", "name": "半导体", "name_en": "Semiconductor", "sector": "technology", "count": 60},
            {"code": "retail", "name": "零售", "name_en": "Retail", "sector": "consumer", "count": 70},
            {"code": "food", "name": "食品", "name_en": "Food & Beverage", "sector": "consumer", "count": 60},
            {"code": "automotive", "name": "汽车", "name_en": "Automotive", "sector": "industrial", "count": 50},
            {"code": "machinery", "name": "机械", "name_en": "Machinery", "sector": "industrial", "count": 40},
            {"code": "pharmaceutical", "name": "制药", "name_en": "Pharmaceutical", "sector": "healthcare", "count": 50},
            {"code": "medical_devices", "name": "医疗器械", "name_en": "Medical Devices", "sector": "healthcare", "count": 30},
            {"code": "oil_gas", "name": "石油天然气", "name_en": "Oil & Gas", "sector": "energy", "count": 40},
            {"code": "renewable", "name": "新能源", "name_en": "Renewable Energy", "sector": "energy", "count": 40},
            {"code": "chemicals", "name": "化工", "name_en": "Chemicals", "sector": "materials", "count": 50},
            {"code": "metals", "name": "金属", "name_en": "Metals & Mining", "sector": "materials", "count": 40},
            {"code": "power", "name": "电力", "name_en": "Power", "sector": "utilities", "count": 35},
            {"code": "water", "name": "水务", "name_en": "Water", "sector": "utilities", "count": 25},
            {"code": "real_estate_dev", "name": "房地产开发", "name_en": "Real Estate Development", "sector": "real_estate", "count": 50},
            {"code": "property_mgmt", "name": "物业管理", "name_en": "Property Management", "sector": "real_estate", "count": 20},
            {"code": "telecom", "name": "电信", "name_en": "Telecommunications", "sector": "communication", "count": 30},
            {"code": "media", "name": "传媒", "name_en": "Media", "sector": "communication", "count": 20}
        ]

        if sector:
            industries = [ind for ind in industries if ind["sector"] == sector]

        return industries

    async def get_stock_classification(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Get classification information for a stock (C6-007).

        Args:
            symbol: Stock symbol

        Returns:
            Classification information or None
        """
        # Mock classification data for common stocks
        classifications = {
            "000001.SZ": {"symbol": "000001.SZ", "sector": "financial", "industry": "banking", "concepts": ["fintech", "blue_chip"]},
            "000002.SZ": {"symbol": "000002.SZ", "sector": "real_estate", "industry": "real_estate_dev", "concepts": ["blue_chip", "dividend"]},
            "000063.SZ": {"symbol": "000063.SZ", "sector": "communication", "industry": "telecom", "concepts": ["5g", "blue_chip"]},
            "000100.SZ": {"symbol": "000100.SZ", "sector": "technology", "industry": "hardware", "concepts": ["iot", "smart_home"]},
            "000333.SZ": {"symbol": "000333.SZ", "sector": "consumer", "industry": "appliances", "concepts": ["white_goods", "blue_chip"]},
            "000568.SZ": {"symbol": "000568.SZ", "sector": "consumer", "industry": "food", "concepts": ["liquor", "blue_chip"]},
            "000651.SZ": {"symbol": "000651.SZ", "sector": "consumer", "industry": "appliances", "concepts": ["white_goods", "blue_chip"]},
            "000725.SZ": {"symbol": "000725.SZ", "sector": "technology", "industry": "hardware", "concepts": ["display", "oled"]},
            "000858.SZ": {"symbol": "000858.SZ", "sector": "consumer", "industry": "food", "concepts": ["liquor", "blue_chip"]},
            "002415.SZ": {"symbol": "002415.SZ", "sector": "technology", "industry": "hardware", "concepts": ["security", "ai"]},
            "600000.SH": {"symbol": "600000.SH", "sector": "financial", "industry": "banking", "concepts": ["blue_chip"]},
            "600009.SH": {"symbol": "600009.SH", "sector": "industrial", "industry": "transportation", "concepts": ["airport", "blue_chip"]},
            "600016.SH": {"symbol": "600016.SH", "sector": "financial", "industry": "banking", "concepts": [["fintech", "blue_chip"]]},
            "600028.SH": {"symbol": "600028.SH", "sector": "energy", "industry": "oil_gas", "concepts": ["blue_chip", "dividend"]},
            "600030.SH": {"symbol": "600030.SH", "sector": "financial", "industry": "securities", "concepts": ["blue_chip"]},
            "600031.SH": {"symbol": "600031.SH", "sector": "industrial", "industry": "machinery", "concepts": ["construction", "blue_chip"]},
            "600036.SH": {"symbol": "600036.SH", "sector": "financial", "industry": "banking", "concepts": ["fintech", "blue_chip"]},
            "600276.SH": {"symbol": "600276.SH", "sector": "healthcare", "industry": "pharmaceutical", "concepts": ["innovation", "blue_chip"]},
            "600519.SH": {"symbol": "600519.SH", "sector": "consumer", "industry": "food", "concepts": ["liquor", "blue_chip"]},
            "600585.SH": {"symbol": "600585.SH", "sector": "materials", "industry": "building", "concepts": [["cement", "blue_chip"]]},
            "600887.SH": {"symbol": "600887.SH", "sector": "consumer", "industry": "food", "concepts": ["dairy", "blue_chip"]},
        }

        return classifications.get(symbol)

    async def _get_sector_symbols(self, sector: str) -> List[str]:
        """Get symbols for a sector."""
        sector_symbols = {
            "financial": ["000001.SZ", "600000.SH", "600016.SH", "600036.SH", "600030.SH"],
            "technology": ["000100.SZ", "000725.SZ", "002415.SZ", "600031.SH"],
            "consumer": ["000333.SZ", "000568.SZ", "000651.SZ", "000858.SZ", "600519.SH", "600887.SH"],
            "industrial": ["600009.SH", "600031.SH"],
            "healthcare": ["600276.SH"],
            "energy": ["600028.SH"],
            "materials": ["600585.SH"],
            "real_estate": ["000002.SZ"],
            "communication": ["000063.SZ"],
        }
        return sector_symbols.get(sector, [])

    async def _get_industry_symbols(self, industry: str) -> List[str]:
        """Get symbols for an industry."""
        industry_symbols = {
            "banking": ["000001.SZ", "600000.SH", "600016.SH", "600036.SH"],
            "securities": ["600030.SH"],
            "hardware": ["000100.SZ", "000725.SZ", "002415.SZ"],
            "food": ["000568.SZ", "000858.SZ", "600519.SH", "600887.SH"],
            "appliances": ["000333.SZ", "000651.SZ"],
            "pharmaceutical": ["600276.SH"],
            "oil_gas": ["600028.SH"],
            "real_estate_dev": ["000002.SZ"],
            "telecom": ["000063.SZ"],
        }
        return industry_symbols.get(industry, [])

    async def _get_index_symbols(self, index: str) -> List[str]:
        """Get symbols for an index."""
        index_symbols = {
            "000001.SH": ["000001.SZ", "000002.SZ", "600000.SH", "600016.SH", "600028.SH", "600030.SH", "600036.SH", "600519.SH"],
            "399001.SZ": ["000001.SZ", "000002.SZ", "000063.SZ", "000100.SZ", "000333.SZ", "000568.SZ", "000651.SZ", "000725.SZ", "000858.SZ", "002415.SZ"],
            "000300.SH": ["000001.SZ", "000002.SZ", "000063.SZ", "000333.SZ", "000568.SZ", "000651.SZ", "000858.SZ", "600000.SH", "600016.SH", "600028.SH", "600030.SH", "600036.SH", "600276.SH", "600519.SH", "600585.SH", "600887.SH"],
        }
        return index_symbols.get(index, [])