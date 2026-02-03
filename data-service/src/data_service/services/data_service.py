"""
Main data service class coordinating data collection, processing, and storage.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from contextlib import asynccontextmanager

from ..collectors.sina import SinaCollector
from ..collectors.tencent import TencentCollector
from ..collectors.eastmoney import EastMoneyCollector
from ..collectors.base import DataSource, DataSourceError
from ..processors.data_processor import DataProcessor
from ..storage.database import DatabaseStorage
from ..storage.cache import RedisCache
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
        self.data_sources: List[DataSource] = []
        self.data_processor = DataProcessor()
        self.database_storage = DatabaseStorage()
        self.redis_cache = RedisCache()
        self.is_initialized = False
        self.collection_stats = {
            "total_collections": 0,
            "successful_collections": 0,
            "failed_collections": 0,
            "last_collection": None,
            "data_sources_status": {}
        }

    async def initialize(self):
        """Initialize data service components."""
        if self.is_initialized:
            return

        try:
            # Initialize data sources
            self.data_sources = [
                SinaCollector(),
                TencentCollector(),
                EastMoneyCollector()
            ]

            # Initialize storage
            await self.database_storage.connect()
            await self.redis_cache.connect()

            # Initialize data sources
            for source in self.data_sources:
                await source.__aenter__()
                self.collection_stats["data_sources_status"][source.name] = {
                    "priority": source.priority,
                    "request_count": 0,
                    "error_count": 0,
                    "is_healthy": True
                }

            self.is_initialized = True
            logger.info("Data service initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize data service: {str(e)}")
            raise

    async def close(self):
        """Close data service components."""
        try:
            # Close data sources
            for source in self.data_sources:
                try:
                    await source.close()
                except Exception as e:
                    logger.error(f"Failed to close data source {source.name}: {str(e)}")

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
            # First try cache
            cached_quote = await self.redis_cache.get_cached_quote(symbol)
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

            # Collect fresh data from data sources
            quotes_by_source = {}
            errors = []

            for source in sorted(self.data_sources, key=lambda x: x.priority):
                try:
                    raw_quote = await source.get_stock_quote(symbol)
                    if raw_quote:
                        quotes_by_source[source.name] = raw_quote
                        break  # Use first successful source for now
                except DataSourceError as e:
                    errors.append(f"{source.name}: {str(e)}")
                    continue

            if not quotes_by_source:
                logger.warning(f"Failed to get quote for {symbol} from any source: {errors}")
                return cached_quote or db_quote  # Return stale data if available

            # Process and merge quotes
            cleaned_quote = self.data_processor.clean_stock_quote(
                list(quotes_by_source.values())[0]  # Use first successful source
            )

            # Save to storage
            await self.database_storage.save_stock_quote(cleaned_quote)
            await self.redis_cache.cache_stock_quote(cleaned_quote)

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

            # Collect fresh data for remaining symbols
            if fresh_symbols:
                # Try batch collection from data sources
                for source in sorted(self.data_sources, key=lambda x: x.priority):
                    try:
                        raw_quotes = await source.get_batch_quotes(fresh_symbols)
                        if raw_quotes:
                            for symbol, raw_quote in raw_quotes.items():
                                try:
                                    cleaned_quote = self.data_processor.clean_stock_quote(raw_quote)
                                    quotes[symbol] = cleaned_quote

                                    # Save to storage
                                    await self.database_storage.save_stock_quote(cleaned_quote)
                                    await self.redis_cache.cache_stock_quote(cleaned_quote)
                                except Exception as e:
                                    logger.error(f"Failed to process quote for {symbol}: {str(e)}")
                                    continue

                            break  # Use first successful source

                    except DataSourceError as e:
                        logger.warning(f"Batch collection failed for {source.name}: {str(e)}")
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

            # Collect fresh data from data sources
            raw_history = []
            for source in sorted(self.data_sources, key=lambda x: x.priority):
                try:
                    raw_history = await source.get_stock_history(
                        symbol, start_date, end_date, interval
                    )
                    if raw_history:
                        break
                except DataSourceError as e:
                    logger.warning(f"History collection failed for {source.name}: {str(e)}")
                    continue

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

            # Collect from data sources
            for source in sorted(self.data_sources, key=lambda x: x.priority):
                try:
                    raw_info = await source.get_stock_info(symbol)
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

                except DataSourceError as e:
                    logger.warning(f"Info collection failed for {source.name}: {str(e)}")
                    continue

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
        total = self.collection_stats["total_collections"]
        successful = self.collection_stats["successful_collections"]
        failed = self.collection_stats["failed_collections"]

        success_rate = successful / total if total > 0 else 0.0

        return MonitoringMetrics(
            total_collections=total,
            successful_collections=successful,
            failed_collections=failed,
            success_rate=success_rate,
            average_latency=0.0,  # Would need to track latency
            last_collection=self.collection_stats["last_collection"],
            active_sources=list(self.collection_stats["data_sources_status"].keys()),
            data_coverage=self._calculate_data_coverage()
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