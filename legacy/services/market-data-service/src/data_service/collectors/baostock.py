"""
Baostock data collector.

Baostock is an open-source financial data library for Chinese markets,
providing free access to historical stock data.

References:
- Official Website: http://baostock.com
- GitHub: https://github.com/microsoft/baostock
- API Documentation: http://baostock.com/baostock/index.php/A股K线数据
"""

import asyncio
import functools
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import baostock as bs
import pandas as pd

from .base import DataSource, DataSourceError

logger = logging.getLogger(__name__)


class BaostockCollector(DataSource):
    """Baostock data collector."""

    def __init__(self):
        super().__init__(name="baostock", priority=3)  # Priority for historical data
        self.connected = False
        self.login_attempts = 0
        self.max_login_attempts = 3
        self.cache = {}
        self.cache_ttl = timedelta(hours=1)  # Historical data can be cached longer

    async def _ensure_connected(self):
        """Ensure Baostock connection is established."""
        if self.connected:
            return

        loop = asyncio.get_event_loop()

        for attempt in range(self.max_login_attempts):
            try:
                # Run Baostock login in thread pool
                result = await loop.run_in_executor(
                    None,
                    bs.login
                )

                if result.error_code == "0":
                    self.connected = True
                    logger.info("Baostock connected successfully")
                    return
                else:
                    error_msg = result.error_msg
                    logger.warning(f"Baostock login failed (attempt {attempt + 1}): {error_msg}")

                    if attempt < self.max_login_attempts - 1:
                        await asyncio.sleep(1)  # Wait before retry

            except Exception as e:
                logger.warning(f"Baostock login exception (attempt {attempt + 1}): {str(e)}")
                if attempt < self.max_login_attempts - 1:
                    await asyncio.sleep(1)

        raise DataSourceError("Failed to connect to Baostock after multiple attempts")

    async def get_stock_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Get real-time quote using Baostock.

        Note: Baostock primarily provides historical data, not real-time quotes.
        This method gets the latest available daily data.

        Args:
            symbol: Stock symbol (e.g., "000001.SZ", "600036.SH")

        Returns:
            Dictionary with quote data (based on latest historical data)
        """
        cache_key = f"quote_{symbol}"
        cached_data = self._get_cached(cache_key)
        if cached_data:
            return cached_data

        await self._ensure_connected()

        # Convert symbol to Baostock format
        code, market = self._parse_symbol(symbol)
        bs_code = f"{market.lower()}.{code}"

        loop = asyncio.get_event_loop()

        try:
            # Get latest daily data (last trading day)
            end_date = datetime.now().strftime("%Y-%m-%d")
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

            # Query daily data - use functools.partial for keyword arguments
            result = await loop.run_in_executor(
                None,
                functools.partial(
                    bs.query_history_k_data_plus,
                    code=bs_code,
                    fields="date,code,open,high,low,close,preclose,volume,amount,turn,pctChg",
                    start_date=start_date,
                    end_date=end_date,
                    frequency="d",
                    adjustflag="3"  # 3=后复权
                )
            )

            if result.error_code != "0":
                raise DataSourceError(f"Baostock query failed: {result.error_msg}")

            # Convert to DataFrame
            df = await loop.run_in_executor(
                None,
                lambda: result.get_data()
            )

            if df.empty:
                raise DataSourceError(f"No data available for {symbol}")

            # Get latest data point
            latest = df.iloc[-1]

            # Calculate change from previous close
            close_price = float(latest["close"])
            prev_close = float(latest["preclose"])

            change = close_price - prev_close
            change_percent = (change / prev_close * 100) if prev_close != 0 else 0.0

            # Get additional info for the stock
            info = await self._get_stock_basic_info(bs_code, loop)

            quote = {
                "symbol": symbol,
                "name": info.get("name", ""),
                "price": close_price,
                "open": float(latest["open"]),
                "prev_close": prev_close,
                "high": float(latest["high"]),
                "low": float(latest["low"]),
                "volume": int(latest["volume"]),
                "amount": float(latest["amount"]),
                "change": change,
                "change_percent": change_percent,
                "turnover_rate": float(latest.get("turn", 0.0)),
                "pct_change": float(latest.get("pctChg", 0.0)),  # Baostock's percentage change
                "timestamp": datetime.now(),
                "data_date": latest["date"],  # The actual date of this data
                "note": "Baostock provides historical data, not real-time quotes. This is the latest available daily data."
            }

            # Cache the result
            self._set_cache(cache_key, quote)

            return quote

        except Exception as e:
            raise DataSourceError(f"Failed to get Baostock quote for {symbol}: {str(e)}")

    async def get_stock_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> List[Dict[str, Any]]:
        """
        Get historical data using Baostock.

        Baostock excels at historical data with multiple frequencies:
        - d: daily
        - w: weekly
        - m: monthly
        - 5: 5 minutes
        - 15: 15 minutes
        - 30: 30 minutes
        - 60: 60 minutes

        Args:
            symbol: Stock symbol
            start_date: Start date
            end_date: End date
            interval: Data interval (1d, 1w, 1M, 5m, 15m, 30m, 60m)

        Returns:
            List of historical data points
        """
        cache_key = f"history_{symbol}_{start_date.date()}_{end_date.date()}_{interval}"
        cached_data = self._get_cached(cache_key)
        if cached_data:
            return cached_data

        await self._ensure_connected()

        # Convert symbol to Baostock format
        code, market = self._parse_symbol(symbol)
        bs_code = f"{market.lower()}.{code}"

        # Convert interval to Baostock frequency
        frequency_map = {
            "1d": "d",
            "1w": "w",
            "1M": "m",
            "5m": "5",
            "15m": "15",
            "30m": "30",
            "60m": "60"
        }

        frequency = frequency_map.get(interval, "d")
        adjustflag = "3"  # 3=后复权 (recommended for historical analysis)

        # Baostock fields
        fields = "date,time,code,open,high,low,close,volume,amount,adjustflag"
        if frequency in ["d", "w", "m"]:
            fields = "date,code,open,high,low,close,preclose,volume,amount,turn,pctChg"

        loop = asyncio.get_event_loop()

        try:
            # Query historical data - use functools.partial for keyword arguments
            result = await loop.run_in_executor(
                None,
                functools.partial(
                    bs.query_history_k_data_plus,
                    code=bs_code,
                    fields=fields,
                    start_date=start_date.strftime("%Y-%m-%d"),
                    end_date=end_date.strftime("%Y-%m-%d"),
                    frequency=frequency,
                    adjustflag=adjustflag
                )
            )

            if result.error_code != "0":
                raise DataSourceError(f"Baostock history query failed: {result.error_msg}")

            # Convert to DataFrame
            df = await loop.run_in_executor(
                None,
                lambda: result.get_data()
            )

            if df.empty:
                return []

            history = []
            for _, row in df.iterrows():
                try:
                    history_point = {
                        "symbol": symbol,
                        "timestamp": self._parse_baostock_timestamp(row, frequency),
                        "open": float(row.get("open", 0.0)),
                        "high": float(row.get("high", 0.0)),
                        "low": float(row.get("low", 0.0)),
                        "close": float(row.get("close", 0.0)),
                        "volume": int(row.get("volume", 0)),
                        "amount": float(row.get("amount", 0.0)),
                        "data_source": "baostock"
                    }

                    # Add additional fields for daily/weekly/monthly data
                    if frequency in ["d", "w", "m"]:
                        history_point.update({
                            "prev_close": float(row.get("preclose", 0.0)),
                            "turnover_rate": float(row.get("turn", 0.0)),
                            "pct_change": float(row.get("pctChg", 0.0))
                        })

                    history.append(history_point)
                except (KeyError, ValueError) as e:
                    logger.debug(f"Skipping invalid data point: {str(e)}")
                    continue

            # Cache the result
            self._set_cache(cache_key, history)

            return history

        except Exception as e:
            raise DataSourceError(f"Failed to get Baostock history for {symbol}: {str(e)}")

    async def get_stock_info(self, symbol: str) -> Dict[str, Any]:
        """
        Get stock information using Baostock.

        Args:
            symbol: Stock symbol

        Returns:
            Dictionary with stock information
        """
        cache_key = f"info_{symbol}"
        cached_data = self._get_cached(cache_key)
        if cached_data:
            return cached_data

        await self._ensure_connected()

        code, market = self._parse_symbol(symbol)
        bs_code = f"{market.lower()}.{code}"

        loop = asyncio.get_event_loop()

        try:
            # Query stock basic information - use functools.partial for keyword arguments
            result = await loop.run_in_executor(
                None,
                functools.partial(bs.query_stock_basic, code=bs_code)
            )

            if result.error_code != "0":
                raise DataSourceError(f"Baostock info query failed: {result.error_msg}")

            df = await loop.run_in_executor(
                None,
                lambda: result.get_data()
            )

            if df.empty:
                # Fallback to basic info
                return await self._get_basic_stock_info(symbol)

            row = df.iloc[0]

            # Get additional data for metrics
            pe_ratio, pb_ratio = await self._get_stock_valuation(bs_code, loop)

            info = {
                "symbol": symbol,
                "code": code,
                "name": row.get("code_name", ""),
                "ipo_date": self._parse_date(row.get("ipoDate", "")),
                "outstanding_share": self._parse_float(row.get("outstanding", "0")),
                "circulating_share": self._parse_float(row.get("circulatingShare", "0")),
                "circulating_cap": self._parse_float(row.get("circulatingCap", "0")),
                "market_cap": self._parse_float(row.get("marketCap", "0")),
                "exchange": market,
                "type": row.get("type", ""),
                "status": row.get("status", ""),
                "pe_ratio": pe_ratio,
                "pb_ratio": pb_ratio,
                "industry": None,  # Baostock doesn't provide industry in basic info
                "area": None,
                "timestamp": datetime.now(),
                "data_source": "baostock"
            }

            # Cache the result
            self._set_cache(cache_key, info)

            return info

        except Exception as e:
            logger.warning(f"Failed to get detailed info from Baostock for {symbol}: {str(e)}")
            return await self._get_basic_stock_info(symbol)

    async def get_batch_quotes(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Get quotes for multiple stocks.

        Note: Baostock doesn't have a true batch API, so we query individually.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to quote data
        """
        results = {}

        # Process symbols in parallel with limited concurrency
        semaphore = asyncio.Semaphore(10)  # Limit concurrent requests

        async def process_symbol(symbol: str):
            async with semaphore:
                try:
                    results[symbol] = await self.get_stock_quote(symbol)
                except Exception as e:
                    logger.warning(f"Failed to get Baostock quote for {symbol}: {str(e)}")

        # Create tasks for all symbols
        tasks = [process_symbol(symbol) for symbol in symbols]
        await asyncio.gather(*tasks, return_exceptions=True)

        return results

    async def _get_stock_basic_info(self, bs_code: str, loop: asyncio.AbstractEventLoop) -> Dict[str, Any]:
        """Get basic stock information."""
        try:
            result = await loop.run_in_executor(
                None,
                functools.partial(bs.query_stock_basic, code=bs_code)
            )

            if result.error_code == "0":
                df = result.get_data()
                if not df.empty:
                    row = df.iloc[0]
                    return {
                        "name": row.get("code_name", ""),
                        "ipo_date": row.get("ipoDate", ""),
                        "outstanding": row.get("outstanding", "0"),
                        "circulating_share": row.get("circulatingShare", "0")
                    }
        except Exception as e:
            logger.debug(f"Failed to get basic info for {bs_code}: {str(e)}")

        return {"name": bs_code}

    async def _get_stock_valuation(self, bs_code: str, loop: asyncio.AbstractEventLoop) -> tuple[Optional[float], Optional[float]]:
        """Get stock valuation ratios (PE, PB)."""
        try:
            # Query valuation data for current date
            today = datetime.now().strftime("%Y-%m-%d")
            result = await loop.run_in_executor(
                None,
                functools.partial(
                    bs.query_history_k_data_plus,
                    code=bs_code,
                    fields="peTTM,pbMRQ",  # PE ratio (TTM), PB ratio (MRQ)
                    start_date=today,
                    end_date=today,
                    frequency="d",
                    adjustflag="3"
                )
            )

            if result.error_code == "0":
                df = result.get_data()
                if not df.empty:
                    row = df.iloc[0]
                    pe = float(row["peTTM"]) if row["peTTM"] not in ["", None] else None
                    pb = float(row["pbMRQ"]) if row["pbMRQ"] not in ["", None] else None
                    return pe, pb
        except Exception as e:
            logger.debug(f"Failed to get valuation for {bs_code}: {str(e)}")

        return None, None

    async def _get_basic_stock_info(self, symbol: str) -> Dict[str, Any]:
        """Get basic stock information as fallback."""
        try:
            quote = await self.get_stock_quote(symbol)
            return {
                "symbol": symbol,
                "name": quote.get("name", ""),
                "exchange": "SH" if symbol.endswith(".SH") else "SZ",
                "market_cap": quote.get("market_cap"),
                "timestamp": datetime.now(),
                "data_source": "baostock",
                "note": "Basic info derived from quote data"
            }
        except Exception as e:
            raise DataSourceError(f"Failed to get basic info for {symbol}: {str(e)}")

    def _parse_symbol(self, symbol: str) -> tuple[str, str]:
        """
        Parse stock symbol into code and market.

        Args:
            symbol: Stock symbol in format "000001.SZ" or "600036.SH"

        Returns:
            Tuple of (code, market)
        """
        if "." in symbol:
            code, market = symbol.split(".")
            return code, market
        else:
            # Default market based on code
            if symbol.startswith("6"):
                return symbol, "SH"
            else:
                return symbol, "SZ"

    def _parse_baostock_timestamp(self, row: pd.Series, frequency: str) -> datetime:
        """Parse timestamp from Baostock data."""
        try:
            if frequency in ["5", "15", "30", "60"]:
                # Minute data has both date and time
                date_str = row["date"]
                time_str = row.get("time", "00:00:00")
                return datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M:%S")
            else:
                # Daily/weekly/monthly data has only date
                date_str = row["date"]
                return datetime.strptime(date_str, "%Y-%m-%d")
        except (KeyError, ValueError):
            return datetime.now()

    def _parse_date(self, date_str: str) -> Optional[datetime]:
        """Parse date string to datetime object."""
        if not date_str:
            return None

        try:
            return datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            return None

    def _parse_float(self, value_str: str) -> Optional[float]:
        """Parse float string."""
        if not value_str:
            return None

        try:
            return float(value_str)
        except ValueError:
            return None

    def _get_cached(self, key: str) -> Optional[Any]:
        """Get data from cache."""
        if key in self.cache:
            data, timestamp = self.cache[key]
            if datetime.now() - timestamp < self.cache_ttl:
                return data
            else:
                del self.cache[key]
        return None

    def _set_cache(self, key: str, data: Any):
        """Set data in cache."""
        self.cache[key] = (data, datetime.now())

        # Clean old cache entries
        self._clean_cache()

    def _clean_cache(self):
        """Clean expired cache entries."""
        current_time = datetime.now()
        expired_keys = [
            key for key, (_, timestamp) in self.cache.items()
            if current_time - timestamp >= self.cache_ttl
        ]
        for key in expired_keys:
            del self.cache[key]

    async def close(self):
        """Close Baostock connection."""
        if self.connected:
            loop = asyncio.get_event_loop()
            try:
                await loop.run_in_executor(None, bs.logout)
                self.connected = False
                logger.info("Baostock disconnected")
            except Exception as e:
                logger.error(f"Failed to logout from Baostock: {str(e)}")

        await super().close()