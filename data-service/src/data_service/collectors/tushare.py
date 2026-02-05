"""
Tushare Pro data collector.

Tushare Pro is a professional financial data platform providing comprehensive
Chinese market data with high quality and reliability.

References:
- Official Website: https://tushare.pro
- API Documentation: https://tushare.pro/document/2
- Token Registration: https://tushare.pro/register
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import tushare as ts
import pandas as pd

from .base import DataSource, DataSourceError
from ..core.config import settings

logger = logging.getLogger(__name__)


class TushareCollector(DataSource):
    """Tushare Pro data collector."""

    def __init__(self):
        super().__init__(name="tushare", priority=1)  # Highest priority for quality data
        self.token = settings.TUSHARE_TOKEN
        self.pro_api = None
        self.initialized = False
        self.cache = {}
        self.cache_ttl = timedelta(seconds=30)  # Tushare data is high-quality but rate-limited

        if not self.token or self.token == "your-tushare-token-here":
            logger.warning("Tushare token not configured. Tushare collector will not work properly.")
            self.token = None

    async def _ensure_initialized(self):
        """Initialize Tushare Pro API."""
        if self.initialized:
            return

        if not self.token:
            raise DataSourceError("Tushare token not configured. Please set TUSHARE_TOKEN in environment variables.")

        loop = asyncio.get_event_loop()

        try:
            # Initialize Tushare Pro in thread pool
            await loop.run_in_executor(
                None,
                self._init_tushare
            )

            # Test connection with a simple query
            test_result = await loop.run_in_executor(
                None,
                self.pro_api.query,
                "trade_cal",
                exchange="SSE",
                start_date="20240101",
                end_date="20240101"
            )

            if test_result is None:
                raise DataSourceError("Tushare Pro initialization failed: No response from API")

            self.initialized = True
            logger.info("Tushare Pro initialized successfully")

        except Exception as e:
            raise DataSourceError(f"Failed to initialize Tushare Pro: {str(e)}")

    def _init_tushare(self):
        """Initialize Tushare Pro API (synchronous)."""
        ts.set_token(self.token)
        self.pro_api = ts.pro_api()

    async def get_stock_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Get real-time quote using Tushare Pro.

        Tushare Pro provides high-quality real-time data through multiple interfaces.

        Args:
            symbol: Stock symbol (e.g., "000001.SZ", "600036.SH")

        Returns:
            Dictionary with quote data
        """
        cache_key = f"quote_{symbol}"
        cached_data = self._get_cached(cache_key)
        if cached_data:
            return cached_data

        await self._ensure_initialized()

        # Convert symbol to Tushare format
        code, market = self._parse_symbol(symbol)
        ts_code = f"{code}.{market}"

        loop = asyncio.get_event_loop()

        try:
            # Try multiple Tushare interfaces in order of preference
            quote = await self._get_realtime_quote(ts_code, loop)

            if not quote:
                # Fallback to daily data
                quote = await self._get_daily_quote(ts_code, loop)

            if not quote:
                raise DataSourceError(f"No quote data available for {symbol}")

            # Cache the result
            self._set_cache(cache_key, quote)

            return quote

        except Exception as e:
            raise DataSourceError(f"Failed to get Tushare quote for {symbol}: {str(e)}")

    async def _get_realtime_quote(self, ts_code: str, loop: asyncio.AbstractEventLoop) -> Optional[Dict[str, Any]]:
        """Get real-time quote using Tushare's real-time interfaces."""
        try:
            # Try daily_bar接口获取当天数据
            today = datetime.now().strftime("%Y%m%d")

            df = await loop.run_in_executor(
                None,
                self.pro_api.daily,
                ts_code=ts_code,
                trade_date=today
            )

            if df is not None and not df.empty:
                row = df.iloc[0]

                # Get additional info for the stock
                info = await self._get_stock_basic_info(ts_code, loop)

                quote = {
                    "symbol": ts_code,
                    "name": info.get("name", ""),
                    "price": float(row["close"]),
                    "open": float(row["open"]),
                    "prev_close": float(row["pre_close"]),
                    "high": float(row["high"]),
                    "low": float(row["low"]),
                    "volume": int(row["vol"]),
                    "amount": float(row["amount"]),
                    "change": float(row["change"]),
                    "change_percent": float(row["pct_chg"]),
                    "timestamp": datetime.now(),
                    "trade_date": row["trade_date"],
                    "data_source": "tushare_daily"
                }

                return quote

        except Exception as e:
            logger.debug(f"Tushare daily bar failed for {ts_code}: {str(e)}")

        try:
            # Try 实时行情接口
            df = await loop.run_in_executor(
                None,
                ts.get_realtime_quotes,
                symbols=[ts_code]
            )

            if df is not None and not df.empty:
                row = df.iloc[0]

                quote = {
                    "symbol": ts_code,
                    "name": row["name"],
                    "price": float(row["price"]),
                    "open": float(row["open"]),
                    "prev_close": float(row["pre_close"]),
                    "high": float(row["high"]),
                    "low": float(row["low"]),
                    "volume": int(row["volume"]),
                    "amount": float(row["amount"]),
                    "bid_price": float(row["b1_p"]),
                    "ask_price": float(row["a1_p"]),
                    "bid_volume": int(row["b1_v"]),
                    "ask_volume": int(row["a1_v"]),
                    "timestamp": datetime.now(),
                    "time": row["time"],
                    "data_source": "tushare_realtime"
                }

                # Calculate change
                if quote["prev_close"] > 0:
                    quote["change"] = quote["price"] - quote["prev_close"]
                    quote["change_percent"] = (quote["change"] / quote["prev_close"]) * 100

                return quote

        except Exception as e:
            logger.debug(f"Tushare realtime quotes failed for {ts_code}: {str(e)}")

        return None

    async def _get_daily_quote(self, ts_code: str, loop: asyncio.AbstractEventLoop) -> Optional[Dict[str, Any]]:
        """Get quote from daily data (fallback)."""
        try:
            # Get latest available daily data
            end_date = datetime.now().strftime("%Y%m%d")
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y%m%d")

            df = await loop.run_in_executor(
                None,
                self.pro_api.daily,
                ts_code=ts_code,
                start_date=start_date,
                end_date=end_date
            )

            if df is not None and not df.empty:
                # Get the most recent trading day
                df_sorted = df.sort_values("trade_date", ascending=False)
                row = df_sorted.iloc[0]

                info = await self._get_stock_basic_info(ts_code, loop)

                quote = {
                    "symbol": ts_code,
                    "name": info.get("name", ""),
                    "price": float(row["close"]),
                    "open": float(row["open"]),
                    "prev_close": float(row["pre_close"]),
                    "high": float(row["high"]),
                    "low": float(row["low"]),
                    "volume": int(row["vol"]),
                    "amount": float(row["amount"]),
                    "change": float(row["change"]),
                    "change_percent": float(row["pct_chg"]),
                    "timestamp": datetime.now(),
                    "trade_date": row["trade_date"],
                    "data_source": "tushare_daily_fallback",
                    "note": "Latest available daily data (may not be real-time)"
                }

                return quote

        except Exception as e:
            logger.debug(f"Tushare daily fallback failed for {ts_code}: {str(e)}")

        return None

    async def get_stock_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> List[Dict[str, Any]]:
        """
        Get historical data using Tushare Pro.

        Tushare provides high-quality historical data with multiple frequencies.

        Args:
            symbol: Stock symbol
            start_date: Start date
            end_date: End date
            interval: Data interval (1d, 1w, 1M, 60m, 30m, 15m, 5m, 1m)

        Returns:
            List of historical data points
        """
        cache_key = f"history_{symbol}_{start_date.date()}_{end_date.date()}_{interval}"
        cached_data = self._get_cached(cache_key)
        if cached_data:
            return cached_data

        await self._ensure_initialized()

        # Convert symbol to Tushare format
        code, market = self._parse_symbol(symbol)
        ts_code = f"{code}.{market}"

        # Convert interval to Tushare parameters
        if interval == "1d":
            api_method = "daily"
            fields = "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount"
        elif interval == "1w":
            api_method = "weekly"
            fields = "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount"
        elif interval == "1M":
            api_method = "monthly"
            fields = "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount"
        elif interval.endswith("m"):
            # Minute data
            api_method = "stk_mins"
            fields = "ts_code,trade_time,open,high,low,close,vol,amount"
        else:
            raise DataSourceError(f"Unsupported interval for Tushare: {interval}")

        loop = asyncio.get_event_loop()

        try:
            if interval.endswith("m"):
                # Minute data handling
                freq = interval.replace("m", "")
                df = await loop.run_in_executor(
                    None,
                    self.pro_api.stk_mins,
                    ts_code=ts_code,
                    start_date=start_date.strftime("%Y-%m-%d %H:%M:%S"),
                    end_date=end_date.strftime("%Y-%m-%d %H:%M:%S"),
                    freq=freq
                )
            else:
                # Daily/Weekly/Monthly data
                df = await loop.run_in_executor(
                    None,
                    getattr(self.pro_api, api_method),
                    ts_code=ts_code,
                    start_date=start_date.strftime("%Y%m%d"),
                    end_date=end_date.strftime("%Y%m%d")
                )

            if df is None or df.empty:
                return []

            history = []
            for _, row in df.iterrows():
                try:
                    if interval.endswith("m"):
                        timestamp = datetime.strptime(row["trade_time"], "%Y-%m-%d %H:%M:%S")
                        history_point = {
                            "symbol": symbol,
                            "timestamp": timestamp,
                            "open": float(row["open"]),
                            "high": float(row["high"]),
                            "low": float(row["low"]),
                            "close": float(row["close"]),
                            "volume": int(row["vol"]),
                            "amount": float(row["amount"])
                        }
                    else:
                        timestamp = datetime.strptime(str(row["trade_date"]), "%Y%m%d")
                        history_point = {
                            "symbol": symbol,
                            "timestamp": timestamp,
                            "open": float(row["open"]),
                            "high": float(row["high"]),
                            "low": float(row["low"]),
                            "close": float(row["close"]),
                            "prev_close": float(row["pre_close"]),
                            "change": float(row["change"]),
                            "change_percent": float(row["pct_chg"]),
                            "volume": int(row["vol"]),
                            "amount": float(row["amount"])
                        }

                    history_point["data_source"] = f"tushare_{interval}"
                    history.append(history_point)

                except (KeyError, ValueError) as e:
                    logger.debug(f"Skipping invalid data point: {str(e)}")
                    continue

            # Cache the result
            self._set_cache(cache_key, history)

            return history

        except Exception as e:
            raise DataSourceError(f"Failed to get Tushare history for {symbol}: {str(e)}")

    async def get_stock_info(self, symbol: str) -> Dict[str, Any]:
        """
        Get comprehensive stock information using Tushare Pro.

        Args:
            symbol: Stock symbol

        Returns:
            Dictionary with stock information
        """
        cache_key = f"info_{symbol}"
        cached_data = self._get_cached(cache_key)
        if cached_data:
            return cached_data

        await self._ensure_initialized()

        code, market = self._parse_symbol(symbol)
        ts_code = f"{code}.{market}"

        loop = asyncio.get_event_loop()

        try:
            # Get basic stock information
            df = await loop.run_in_executor(
                None,
                self.pro_api.stock_basic,
                ts_code=ts_code,
                fields="ts_code,name,fullname,enname,market,list_date,act_name,area,industry"
            )

            if df is None or df.empty:
                raise DataSourceError(f"No information found for {symbol}")

            row = df.iloc[0]

            # Get additional financial data
            financial_data = await self._get_financial_data(ts_code, loop)

            # Get dividend data
            dividend_data = await self._get_dividend_data(ts_code, loop)

            info = {
                "symbol": symbol,
                "ts_code": ts_code,
                "name": row.get("name", ""),
                "full_name": row.get("fullname", ""),
                "english_name": row.get("enname", ""),
                "exchange": market,
                "listing_date": self._parse_date(row.get("list_date", "")),
                "area": row.get("area", ""),
                "industry": row.get("industry", ""),
                "market": row.get("market", ""),
                "act_name": row.get("act_name", ""),
                "data_source": "tushare",
                "timestamp": datetime.now()
            }

            # Add financial data if available
            if financial_data:
                info.update(financial_data)

            # Add dividend data if available
            if dividend_data:
                info["dividend_yield"] = dividend_data.get("dividend_yield")
                info["dividend_ratio"] = dividend_data.get("dividend_ratio")
                info["last_dividend_date"] = dividend_data.get("last_dividend_date")
                info["last_dividend_amount"] = dividend_data.get("last_dividend_amount")

            # Cache the result
            self._set_cache(cache_key, info)

            return info

        except Exception as e:
            logger.warning(f"Failed to get detailed info from Tushare for {symbol}: {str(e)}")
            return await self._get_basic_stock_info(symbol)

    async def get_batch_quotes(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Get real-time quotes for multiple stocks.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to quote data
        """
        results = {}

        # Convert symbols to Tushare format
        ts_codes = []
        symbol_map = {}
        for symbol in symbols:
            try:
                code, market = self._parse_symbol(symbol)
                ts_code = f"{code}.{market}"
                ts_codes.append(ts_code)
                symbol_map[ts_code] = symbol
            except Exception as e:
                logger.warning(f"Failed to parse symbol {symbol}: {str(e)}")

        if not ts_codes:
            return results

        await self._ensure_initialized()

        loop = asyncio.get_event_loop()

        try:
            # Try batch query using daily接口
            today = datetime.now().strftime("%Y%m%d")
            df = await loop.run_in_executor(
                None,
                self.pro_api.daily,
                ts_code=",".join(ts_codes),
                trade_date=today
            )

            if df is not None and not df.empty:
                # Group by ts_code and get latest
                for ts_code, group in df.groupby("ts_code"):
                    if ts_code not in symbol_map:
                        continue

                    symbol = symbol_map[ts_code]
                    row = group.iloc[0]  # Should only be one row per ts_code for today

                    results[symbol] = {
                        "symbol": symbol,
                        "price": float(row["close"]),
                        "open": float(row["open"]),
                        "prev_close": float(row["pre_close"]),
                        "high": float(row["high"]),
                        "low": float(row["low"]),
                        "volume": int(row["vol"]),
                        "amount": float(row["amount"]),
                        "change": float(row["change"]),
                        "change_percent": float(row["pct_chg"]),
                        "timestamp": datetime.now(),
                        "trade_date": row["trade_date"],
                        "data_source": "tushare_batch"
                    }

                return results

        except Exception as e:
            logger.debug(f"Tushare batch daily query failed: {str(e)}")

        # Fallback to individual queries for remaining symbols
        remaining_symbols = [s for s in symbols if s not in results]

        semaphore = asyncio.Semaphore(5)  # Limit concurrency due to rate limits

        async def process_symbol(symbol: str):
            async with semaphore:
                try:
                    results[symbol] = await self.get_stock_quote(symbol)
                except Exception as e:
                    logger.warning(f"Failed to get Tushare quote for {symbol}: {str(e)}")

        tasks = [process_symbol(symbol) for symbol in remaining_symbols]
        await asyncio.gather(*tasks, return_exceptions=True)

        return results

    async def _get_stock_basic_info(self, ts_code: str, loop: asyncio.AbstractEventLoop) -> Dict[str, Any]:
        """Get basic stock information."""
        try:
            df = await loop.run_in_executor(
                None,
                self.pro_api.stock_basic,
                ts_code=ts_code,
                fields="ts_code,name"
            )

            if df is not None and not df.empty:
                row = df.iloc[0]
                return {
                    "name": row.get("name", ""),
                    "ts_code": ts_code
                }
        except Exception as e:
            logger.debug(f"Failed to get basic info for {ts_code}: {str(e)}")

        return {"name": ts_code, "ts_code": ts_code}

    async def _get_financial_data(self, ts_code: str, loop: asyncio.AbstractEventLoop) -> Dict[str, Any]:
        """Get financial data for the stock."""
        try:
            # Get latest income statement and balance sheet
            end_date = datetime.now().strftime("%Y%m%d")
            start_date = (datetime.now() - timedelta(days=365)).strftime("%Y%m%d")

            # Get daily indicators (includes PE, PB, etc.)
            df = await loop.run_in_executor(
                None,
                self.pro_api.daily_basic,
                ts_code=ts_code,
                start_date=start_date,
                end_date=end_date
            )

            if df is not None and not df.empty:
                latest = df.iloc[-1]  # Most recent data

                financial_data = {
                    "pe_ratio": float(latest["pe"]) if latest["pe"] not in [None, ""] else None,
                    "pb_ratio": float(latest["pb"]) if latest["pb"] not in [None, ""] else None,
                    "ps_ratio": float(latest["ps"]) if latest["ps"] not in [None, ""] else None,
                    "total_share": float(latest["total_share"]) if latest["total_share"] not in [None, ""] else None,
                    "float_share": float(latest["float_share"]) if latest["float_share"] not in [None, ""] else None,
                    "free_share": float(latest["free_share"]) if latest["free_share"] not in [None, ""] else None,
                    "total_mv": float(latest["total_mv"]) if latest["total_mv"] not in [None, ""] else None,
                    "circ_mv": float(latest["circ_mv"]) if latest["circ_mv"] not in [None, ""] else None,
                    "turnover_rate": float(latest["turnover_rate"]) if latest["turnover_rate"] not in [None, ""] else None,
                    "volume_ratio": float(latest["volume_ratio"]) if latest["volume_ratio"] not in [None, ""] else None
                }

                return financial_data

        except Exception as e:
            logger.debug(f"Failed to get financial data for {ts_code}: {str(e)}")

        return {}

    async def _get_dividend_data(self, ts_code: str, loop: asyncio.AbstractEventLoop) -> Dict[str, Any]:
        """Get dividend data for the stock."""
        try:
            # Get dividend information
            df = await loop.run_in_executor(
                None,
                self.pro_api.dividend,
                ts_code=ts_code,
                fields="ts_code,div_proc,stk_div,stk_bo_rate,record_date"
            )

            if df is not None and not df.empty:
                # Get most recent dividend
                df_sorted = df.sort_values("record_date", ascending=False)
                latest = df_sorted.iloc[0]

                dividend_data = {
                    "last_dividend_date": self._parse_date(latest.get("record_date", "")),
                    "last_dividend_amount": float(latest["stk_div"]) if latest["stk_div"] not in [None, ""] else None,
                    "dividend_ratio": float(latest["stk_bo_rate"]) if latest["stk_bo_rate"] not in [None, ""] else None
                }

                # Calculate dividend yield if we have price data
                try:
                    quote = await self.get_stock_quote(ts_code)
                    if quote and quote.get("price") and dividend_data["last_dividend_amount"]:
                        dividend_data["dividend_yield"] = (
                            dividend_data["last_dividend_amount"] / quote["price"] * 100
                        )
                except Exception:
                    pass

                return dividend_data

        except Exception as e:
            logger.debug(f"Failed to get dividend data for {ts_code}: {str(e)}")

        return {}

    async def _get_basic_stock_info(self, symbol: str) -> Dict[str, Any]:
        """Get basic stock information as fallback."""
        try:
            quote = await self.get_stock_quote(symbol)
            return {
                "symbol": symbol,
                "name": quote.get("name", ""),
                "exchange": "SH" if symbol.endswith(".SH") else "SZ",
                "market_cap": quote.get("market_cap"),
                "pe_ratio": quote.get("pe_ratio"),
                "pb_ratio": quote.get("pb_ratio"),
                "timestamp": datetime.now(),
                "data_source": "tushare_fallback"
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

    def _parse_date(self, date_str: str) -> Optional[datetime]:
        """Parse date string to datetime object."""
        if not date_str:
            return None

        try:
            # Tushare dates are usually in YYYYMMDD format
            if len(date_str) == 8:
                return datetime.strptime(date_str, "%Y%m%d")
            else:
                return datetime.strptime(date_str, "%Y-%m-%d")
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