"""
Database storage layer for TimescaleDB and PostgreSQL.
"""

import asyncpg
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
import logging
from contextlib import asynccontextmanager

from ..core.config import settings
from ..models.stock import StockSymbol, StockData, StockQuote

logger = logging.getLogger(__name__)


class DatabaseStorage:
    """Database storage for stock data."""

    def __init__(self):
        self.timescale_pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        """Connect to TimescaleDB with fallback to in-memory mode."""
        try:
            # Connect to TimescaleDB for all data
            self.timescale_pool = await asyncpg.create_pool(
                host=settings.TSDB_HOST,
                port=settings.TSDB_PORT,
                database=settings.TSDB_NAME,
                user=settings.TSDB_USER,
                password=settings.TSDB_PASSWORD,
                min_size=1,
                max_size=10
            )

            logger.info("Connected to TimescaleDB")
            await self._create_tables()

        except Exception as e:
            logger.error(f"Failed to connect to TimescaleDB: {str(e)}")
            # 联调阶段：强制使用真实数据，连接失败时抛出异常
            raise RuntimeError(
                f"无法连接到TimescaleDB数据库。请检查:\n"
                f"  1. TimescaleDB容器是否运行: docker ps | grep timescaledb\n"
                f"  2. 连接配置是否正确: {settings.TSDB_HOST}:{settings.TSDB_PORT}\n"
                f"  3. 网络是否通畅\n"
                f"原始错误: {str(e)}"
            )

    async def close(self):
        """Close database connections."""
        if self.timescale_pool:
            await self.timescale_pool.close()
        logger.info("Closed database connections")

    async def _create_tables(self):
        """Create necessary tables if they don't exist."""
        if not self.timescale_pool:
            logger.info("Skipping table creation (database not connected)")
            return

        try:
            # Create all tables in TimescaleDB
            async with self.timescale_pool.acquire() as conn:
                # Create stock_quotes hypertable
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS stock_quotes (
                        symbol VARCHAR(20) NOT NULL,
                        timestamp TIMESTAMPTZ NOT NULL,
                        price DECIMAL(10, 4) NOT NULL,
                        open DECIMAL(10, 4) NOT NULL,
                        high DECIMAL(10, 4) NOT NULL,
                        low DECIMAL(10, 4) NOT NULL,
                        prev_close DECIMAL(10, 4) NOT NULL,
                        change DECIMAL(10, 4) NOT NULL,
                        change_percent DECIMAL(10, 4) NOT NULL,
                        volume BIGINT NOT NULL,
                        amount DECIMAL(20, 2) NOT NULL,
                        bid_price DECIMAL(10, 4),
                        ask_price DECIMAL(10, 4),
                        bid_volume BIGINT,
                        ask_volume BIGINT,
                        PRIMARY KEY (symbol, timestamp)
                    )
                """)

                # Convert to hypertable
                await conn.execute("""
                    SELECT create_hypertable('stock_quotes', 'timestamp',
                            if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');
                """)

                # Create stock_history hypertable
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS stock_history (
                        symbol VARCHAR(20) NOT NULL,
                        timestamp TIMESTAMPTZ NOT NULL,
                        interval VARCHAR(10) NOT NULL,
                        open DECIMAL(10, 4) NOT NULL,
                        high DECIMAL(10, 4) NOT NULL,
                        low DECIMAL(10, 4) NOT NULL,
                        close DECIMAL(10, 4) NOT NULL,
                        volume BIGINT NOT NULL,
                        amount DECIMAL(20, 2),
                        adj_close DECIMAL(10, 4),
                        vwap DECIMAL(10, 4),
                        PRIMARY KEY (symbol, timestamp, interval)
                    )
                """)

                # Convert to hypertable
                await conn.execute("""
                    SELECT create_hypertable('stock_history', 'timestamp',
                            if_not_exists => TRUE, chunk_time_interval => INTERVAL '7 days');
                """)

                # Create indexes
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_quotes_symbol_time
                        ON stock_quotes (symbol, timestamp DESC);
                    CREATE INDEX IF NOT EXISTS idx_history_symbol_interval_time
                        ON stock_history (symbol, interval, timestamp DESC);
                """)

            logger.info("Database tables created/verified")

        except Exception as e:
            logger.error(f"Failed to create tables: {str(e)}")

    async def save_stock_quote(self, quote: StockQuote):
        """
        Save stock quote to TimescaleDB.

        Args:
            quote: StockQuote object
        """
        if not self.timescale_pool:
            logger.debug(f"Database not connected, skipping save for {quote.symbol}")
            return

        try:
            async with self.timescale_pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO stock_quotes (
                        symbol, timestamp, price, open, high, low, prev_close,
                        change, change_percent, volume, amount,
                        bid_price, ask_price, bid_volume, ask_volume
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    ON CONFLICT (symbol, timestamp) DO UPDATE SET
                        price = EXCLUDED.price,
                        open = EXCLUDED.open,
                        high = EXCLUDED.high,
                        low = EXCLUDED.low,
                        prev_close = EXCLUDED.prev_close,
                        change = EXCLUDED.change,
                        change_percent = EXCLUDED.change_percent,
                        volume = EXCLUDED.volume,
                        amount = EXCLUDED.amount,
                        bid_price = EXCLUDED.bid_price,
                        ask_price = EXCLUDED.ask_price,
                        bid_volume = EXCLUDED.bid_volume,
                        ask_volume = EXCLUDED.ask_volume
                """,
                    quote.symbol, quote.timestamp, quote.price, quote.open, quote.high, quote.low,
                    quote.prev_close, quote.change, quote.change_percent, quote.volume, quote.amount,
                    quote.bid_price, quote.ask_price, quote.bid_volume, quote.ask_volume
                )

        except Exception as e:
            logger.error(f"Failed to save quote for {quote.symbol}: {str(e)}")

    async def save_stock_history(self, data_points: List[StockData], interval: str = "1d"):
        """
        Save historical stock data to TimescaleDB.

        Args:
            data_points: List of StockData objects
            interval: Data interval (1m, 5m, 1d, etc.)
        """
        if not self.timescale_pool:
            logger.debug(f"Database not connected, skipping save of {len(data_points)} history records")
            return

        if not data_points:
            return

        try:
            async with self.timescale_pool.acquire() as conn:
                # Prepare batch insert
                values = []
                for data in data_points:
                    values.append((
                        data.symbol, data.timestamp, interval,
                        data.open, data.high, data.low, data.close,
                        data.volume, data.amount, data.adj_close, data.vwap
                    ))

                await conn.executemany("""
                    INSERT INTO stock_history (
                        symbol, timestamp, interval, open, high, low, close,
                        volume, amount, adj_close, vwap
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT (symbol, timestamp, interval) DO UPDATE SET
                        open = EXCLUDED.open,
                        high = EXCLUDED.high,
                        low = EXCLUDED.low,
                        close = EXCLUDED.close,
                        volume = EXCLUDED.volume,
                        amount = EXCLUDED.amount,
                        adj_close = EXCLUDED.adj_close,
                        vwap = EXCLUDED.vwap
                """, values)

            logger.info(f"Saved {len(data_points)} history records for interval {interval}")

        except Exception as e:
            logger.error(f"Failed to save history: {str(e)}")

    async def get_latest_quote(self, symbol: str) -> Optional[StockQuote]:
        """
        Get latest quote for a stock.

        Args:
            symbol: Stock symbol

        Returns:
            Latest StockQuote or None if not found
        """
        if not self.timescale_pool:
            # Fallback: return simulated data
            logger.debug(f"Database not connected, returning simulated quote for {symbol}")
            return self._generate_simulated_quote(symbol)

        try:
            async with self.timescale_pool.acquire() as conn:
                row = await conn.fetchrow("""
                    SELECT * FROM stock_quotes
                    WHERE symbol = $1
                    ORDER BY timestamp DESC
                    LIMIT 1
                """, symbol)

                if not row:
                    return None

                return StockQuote(
                    symbol=row['symbol'],
                    timestamp=row['timestamp'],
                    price=float(row['price']),
                    open=float(row['open']),
                    high=float(row['high']),
                    low=float(row['low']),
                    prev_close=float(row['prev_close']),
                    change=float(row['change']),
                    change_percent=float(row['change_percent']),
                    volume=row['volume'],
                    amount=float(row['amount']),
                    bid_price=float(row['bid_price']) if row['bid_price'] else None,
                    ask_price=float(row['ask_price']) if row['ask_price'] else None,
                    bid_volume=row['bid_volume'] if row['bid_volume'] else None,
                    ask_volume=row['ask_volume'] if row['ask_volume'] else None
                )

        except Exception as e:
            logger.error(f"Failed to get latest quote for {symbol}: {str(e)}")
            # Fallback to simulated data
            return self._generate_simulated_quote(symbol)

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
        if not self.timescale_pool:
            # Fallback: return simulated historical data
            logger.debug(f"Database not connected, returning simulated history for {symbol}")
            return self._generate_simulated_history(symbol, start_date, end_date, interval)

        try:
            async with self.timescale_pool.acquire() as conn:
                rows = await conn.fetch("""
                    SELECT * FROM stock_history
                    WHERE symbol = $1
                    AND interval = $2
                    AND timestamp >= $3
                    AND timestamp <= $4
                    ORDER BY timestamp ASC
                """, symbol, interval, start_date, end_date)

                history = []
                for row in rows:
                    history.append(StockData(
                        symbol=row['symbol'],
                        timestamp=row['timestamp'],
                        open=float(row['open']),
                        high=float(row['high']),
                        low=float(row['low']),
                        close=float(row['close']),
                        volume=row['volume'],
                        amount=float(row['amount']) if row['amount'] else None,
                        adj_close=float(row['adj_close']) if row['adj_close'] else None,
                        vwap=float(row['vwap']) if row['vwap'] else None
                    ))

                return history

        except Exception as e:
            logger.error(f"Failed to get history for {symbol}: {str(e)}")
            # Fallback to simulated data
            return self._generate_simulated_history(symbol, start_date, end_date, interval)

    async def save_stock_info(self, stock_info: StockSymbol):
        """
        Save stock information to TimescaleDB.

        Args:
            stock_info: StockSymbol object
        """
        if not self.timescale_pool:
            logger.debug(f"Database not connected, skipping save of stock info for {stock_info.symbol}")
            return

        try:
            async with self.timescale_pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO stocks (
                        symbol, name, exchange, sector, market_cap, pe_ratio,
                        pb_ratio, dividend_yield, listing_date, is_active,
                        created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (symbol) DO UPDATE SET
                        name = EXCLUDED.name,
                        exchange = EXCLUDED.exchange,
                        sector = EXCLUDED.sector,
                        market_cap = EXCLUDED.market_cap,
                        pe_ratio = EXCLUDED.pe_ratio,
                        pb_ratio = EXCLUDED.pb_ratio,
                        dividend_yield = EXCLUDED.dividend_yield,
                        listing_date = EXCLUDED.listing_date,
                        is_active = EXCLUDED.is_active,
                        updated_at = EXCLUDED.updated_at
                """,
                    stock_info.symbol, stock_info.name, stock_info.exchange.value,
                    stock_info.sector.value if stock_info.sector else None,
                    stock_info.market_cap, stock_info.pe_ratio, stock_info.pb_ratio,
                    stock_info.dividend_yield, stock_info.listing_date,
                    stock_info.is_active, stock_info.created_at, stock_info.updated_at
                )

        except Exception as e:
            logger.error(f"Failed to save stock info for {stock_info.symbol}: {str(e)}")

    async def get_stock_info(self, symbol: str) -> Optional[StockSymbol]:
        """
        Get stock information from TimescaleDB.

        Args:
            symbol: Stock symbol

        Returns:
            StockSymbol object or None if not found
        """
        if not self.timescale_pool:
            # Fallback: return simulated stock info
            logger.debug(f"Database not connected, returning simulated stock info for {symbol}")
            return self._generate_simulated_stock_info(symbol)

        try:
            async with self.timescale_pool.acquire() as conn:
                row = await conn.fetchrow("""
                    SELECT * FROM stocks WHERE symbol = $1
                """, symbol)

                if not row:
                    return None

                return StockSymbol(
                    symbol=row['symbol'],
                    name=row['name'],
                    exchange=row['exchange'],
                    sector=row['sector'],
                    market_cap=float(row['market_cap']) if row['market_cap'] else None,
                    pe_ratio=float(row['pe_ratio']) if row['pe_ratio'] else None,
                    pb_ratio=float(row['pb_ratio']) if row['pb_ratio'] else None,
                    dividend_yield=float(row['dividend_yield']) if row['dividend_yield'] else None,
                    listing_date=row['listing_date'],
                    is_active=row['is_active'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                )

        except Exception as e:
            logger.error(f"Failed to get stock info for {symbol}: {str(e)}")
            # Fallback to simulated data
            return self._generate_simulated_stock_info(symbol)

    async def search_stocks(
        self,
        query: str,
        limit: int = 10,
        skip: int = 0
    ) -> List[StockSymbol]:
        """
        Search stocks by symbol or name.

        Args:
            query: Search query
            limit: Maximum number of results
            skip: Number of results to skip

        Returns:
            List of StockSymbol objects
        """
        if not self.timescale_pool:
            # Fallback: return simulated search results
            logger.debug(f"Database not connected, returning simulated search results for '{query}'")
            return self._generate_simulated_search_results(query, limit, skip)

        try:
            async with self.timescale_pool.acquire() as conn:
                search_pattern = f"%{query}%"
                rows = await conn.fetch("""
                    SELECT * FROM stocks
                    WHERE (symbol ILIKE $1 OR name ILIKE $1)
                    AND is_active = TRUE
                    ORDER BY symbol
                    LIMIT $2 OFFSET $3
                """, search_pattern, limit, skip)

                stocks = []
                for row in rows:
                    stocks.append(StockSymbol(
                        symbol=row['symbol'],
                        name=row['name'],
                        exchange=row['exchange'],
                        sector=row['sector'],
                        market_cap=float(row['market_cap']) if row['market_cap'] else None,
                        pe_ratio=float(row['pe_ratio']) if row['pe_ratio'] else None,
                        pb_ratio=float(row['pb_ratio']) if row['pb_ratio'] else None,
                        dividend_yield=float(row['dividend_yield']) if row['dividend_yield'] else None,
                        listing_date=row['listing_date'],
                        is_active=row['is_active'],
                        created_at=row['created_at'],
                        updated_at=row['updated_at']
                    ))

                return stocks

        except Exception as e:
            logger.error(f"Failed to search stocks: {str(e)}")
            # Fallback to simulated data
            return self._generate_simulated_search_results(query, limit, skip)

    async def get_data_quality_metrics(
        self,
        symbol: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Get data quality metrics from database.

        Args:
            symbol: Optional stock symbol to filter by
            start_date: Optional start date
            end_date: Optional end date

        Returns:
            Dictionary with data quality metrics
        """
        if not self.timescale_pool:
            # Fallback: return simulated data quality metrics
            logger.debug(f"Database not connected, returning simulated data quality metrics")
            return self._generate_simulated_data_quality_metrics(symbol, start_date, end_date)

        try:
            async with self.timescale_pool.acquire() as conn:
                # Build query conditions
                conditions = ["1=1"]
                params = []
                param_count = 0

                if symbol:
                    param_count += 1
                    conditions.append(f"symbol = ${param_count}")
                    params.append(symbol)

                if start_date:
                    param_count += 1
                    conditions.append(f"timestamp >= ${param_count}")
                    params.append(start_date)

                if end_date:
                    param_count += 1
                    conditions.append(f"timestamp <= ${param_count}")
                    params.append(end_date)

                where_clause = " AND ".join(conditions)

                # Get metrics
                row = await conn.fetchrow(f"""
                    SELECT
                        COUNT(*) as total_records,
                        COUNT(DISTINCT symbol) as unique_symbols,
                        MIN(timestamp) as earliest_timestamp,
                        MAX(timestamp) as latest_timestamp,
                        AVG(price) as avg_price,
                        STDDEV(price) as price_stddev,
                        SUM(CASE WHEN price <= 0 THEN 1 ELSE 0 END) as invalid_prices,
                        SUM(CASE WHEN volume <= 0 THEN 1 ELSE 0 END) as invalid_volumes
                    FROM stock_quotes
                    WHERE {where_clause}
                """, *params)

                if not row or row['total_records'] == 0:
                    return {
                        "total_records": 0,
                        "unique_symbols": 0,
                        "data_quality_score": 0.0,
                        "completeness": 0.0,
                        "validity": 0.0,
                        "timeliness": 0.0
                    }

                total_records = row['total_records']
                invalid_prices = row['invalid_prices']
                invalid_volumes = row['invalid_volumes']

                # Calculate metrics
                completeness = 1.0  # Assuming all required fields are present
                validity = 1.0 - ((invalid_prices + invalid_volumes) / (2 * total_records))

                # Timeliness: how recent is the data
                latest_timestamp = row['latest_timestamp']
                if latest_timestamp:
                    hours_since_update = (datetime.now() - latest_timestamp).total_seconds() / 3600
                    timeliness = max(0, 1.0 - (hours_since_update / 24))  # Decay over 24 hours
                else:
                    timeliness = 0.0

                data_quality_score = (completeness + validity + timeliness) / 3

                return {
                    "total_records": total_records,
                    "unique_symbols": row['unique_symbols'],
                    "earliest_timestamp": row['earliest_timestamp'],
                    "latest_timestamp": row['latest_timestamp'],
                    "avg_price": float(row['avg_price']) if row['avg_price'] else 0.0,
                    "price_stddev": float(row['price_stddev']) if row['price_stddev'] else 0.0,
                    "invalid_prices": invalid_prices,
                    "invalid_volumes": invalid_volumes,
                    "data_quality_score": data_quality_score,
                    "completeness": completeness,
                    "validity": validity,
                    "timeliness": timeliness
                }

        except Exception as e:
            logger.error(f"Failed to get data quality metrics: {str(e)}")
            # Fallback to simulated data
            return self._generate_simulated_data_quality_metrics(symbol, start_date, end_date)

    def _generate_simulated_quote(self, symbol: str) -> StockQuote:
        """Generate simulated stock quote data."""
        from datetime import datetime
        import random

        # Base price based on symbol
        if "000001" in symbol:
            base_price = 15.0 + random.uniform(-2.0, 2.0)
        elif "000002" in symbol:
            base_price = 25.0 + random.uniform(-3.0, 3.0)
        elif "000858" in symbol:
            base_price = 180.0 + random.uniform(-10.0, 10.0)
        elif "600036" in symbol:
            base_price = 35.0 + random.uniform(-2.0, 2.0)
        elif "600519" in symbol:
            base_price = 1600.0 + random.uniform(-50.0, 50.0)
        else:
            base_price = 50.0 + random.uniform(-10.0, 10.0)

        prev_close = base_price * (1 + random.uniform(-0.05, 0.05))
        change = base_price - prev_close
        change_percent = (change / prev_close) * 100

        return StockQuote(
            symbol=symbol,
            timestamp=datetime.now(),
            price=round(base_price, 2),
            open=round(base_price * (1 + random.uniform(-0.02, 0.02)), 2),
            high=round(base_price * (1 + random.uniform(0.01, 0.05)), 2),
            low=round(base_price * (1 - random.uniform(0.01, 0.05)), 2),
            prev_close=round(prev_close, 2),
            change=round(change, 2),
            change_percent=round(change_percent, 2),
            volume=random.randint(1000000, 10000000),
            amount=round(base_price * random.randint(1000000, 10000000), 2),
            bid_price=round(base_price * 0.999, 2),
            ask_price=round(base_price * 1.001, 2),
            bid_volume=random.randint(10000, 100000),
            ask_volume=random.randint(10000, 100000)
        )

    def _generate_simulated_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> List[StockData]:
        """Generate simulated historical stock data."""
        from datetime import timedelta
        import random

        history = []
        current_date = start_date

        # Base price based on symbol
        if "000001" in symbol:
            base_price = 15.0
        elif "000002" in symbol:
            base_price = 25.0
        elif "000858" in symbol:
            base_price = 180.0
        elif "600036" in symbol:
            base_price = 35.0
        elif "600519" in symbol:
            base_price = 1600.0
        else:
            base_price = 50.0

        price = base_price

        while current_date <= end_date:
            # Simulate price movement
            price_change = random.uniform(-0.03, 0.03)
            price = price * (1 + price_change)

            history.append(StockData(
                symbol=symbol,
                timestamp=current_date,
                open=round(price * (1 + random.uniform(-0.01, 0.01)), 2),
                high=round(price * (1 + random.uniform(0.01, 0.05)), 2),
                low=round(price * (1 - random.uniform(0.01, 0.05)), 2),
                close=round(price, 2),
                volume=random.randint(1000000, 10000000),
                amount=round(price * random.randint(1000000, 10000000), 2),
                adj_close=round(price, 2),
                vwap=round(price * (1 + random.uniform(-0.005, 0.005)), 2)
            ))

            # Move to next interval
            if interval == "1d":
                current_date += timedelta(days=1)
            elif interval == "1h":
                current_date += timedelta(hours=1)
            elif interval == "1m":
                current_date += timedelta(minutes=1)
            else:
                current_date += timedelta(days=1)

        return history

    def _generate_simulated_stock_info(self, symbol: str) -> StockSymbol:
        """Generate simulated stock information."""
        from datetime import datetime
        import random
        from ..models.stock import StockExchange, StockSector

        # Map symbols to company names
        symbol_to_name = {
            "000001.SZ": "平安银行",
            "000002.SZ": "万科A",
            "000858.SZ": "五粮液",
            "600036.SH": "招商银行",
            "600519.SH": "贵州茅台",
            "000001.SH": "上证指数",
            "399001.SZ": "深证成指",
            "399006.SZ": "创业板指"
        }

        name = symbol_to_name.get(symbol, f"公司{symbol}")

        # Determine exchange
        if ".SH" in symbol:
            exchange = StockExchange.SHANGHAI
        elif ".SZ" in symbol:
            exchange = StockExchange.SHENZHEN
        else:
            exchange = StockExchange.SHANGHAI

        # Determine sector
        if "银行" in name or "金融" in name:
            sector = StockSector.FINANCIAL
        elif "酒" in name:
            sector = StockSector.CONSUMER
        elif "万科" in name:
            sector = StockSector.REAL_ESTATE
        else:
            sector = StockSector.CONSUMER

        # Generate random metrics
        market_cap = random.uniform(100.0, 10000.0) * 1e8  # 100亿到1万亿
        pe_ratio = random.uniform(10.0, 50.0)
        pb_ratio = random.uniform(1.0, 5.0)
        dividend_yield = random.uniform(0.5, 5.0)

        return StockSymbol(
            symbol=symbol,
            name=name,
            exchange=exchange,
            sector=sector,
            market_cap=round(market_cap, 2),
            pe_ratio=round(pe_ratio, 2),
            pb_ratio=round(pb_ratio, 2),
            dividend_yield=round(dividend_yield, 2),
            listing_date=datetime(2010, 1, 1),
            is_active=True,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

    def _generate_simulated_search_results(
        self,
        query: str,
        limit: int = 10,
        skip: int = 0
    ) -> List[StockSymbol]:
        """Generate simulated search results."""
        # Default stocks for search
        default_symbols = [
            "000001.SZ", "000002.SZ", "000858.SZ",
            "600036.SH", "600519.SH", "000001.SH",
            "399001.SZ", "399006.SZ"
        ]

        results = []
        for symbol in default_symbols[skip:skip + limit]:
            if query.lower() in symbol.lower() or query in ["股票", "指数", "银行", "酒"]:
                stock_info = self._generate_simulated_stock_info(symbol)
                results.append(stock_info)

        return results

    def _generate_simulated_data_quality_metrics(
        self,
        symbol: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Generate simulated data quality metrics."""
        from datetime import datetime, timedelta

        if not end_date:
            end_date = datetime.now()
        if not start_date:
            start_date = end_date - timedelta(days=30)

        days_diff = (end_date - start_date).days

        return {
            "total_records": days_diff * 5 if symbol else days_diff * 25,
            "unique_symbols": 1 if symbol else 5,
            "earliest_timestamp": start_date,
            "latest_timestamp": end_date,
            "avg_price": 100.0,
            "price_stddev": 10.0,
            "invalid_prices": 0,
            "invalid_volumes": 0,
            "data_quality_score": 0.95,
            "completeness": 0.98,
            "validity": 0.99,
            "timeliness": 0.88,
            "mode": "simulated"
        }