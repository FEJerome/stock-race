"""
AkShare data collector.

AkShare is an open-source financial data interface library for Python,
integrating multiple data sources for Chinese financial markets.

References:
- GitHub: https://github.com/akfamily/akshare
- Documentation: https://akshare.akfamily.xyz/
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import akshare as ak
import pandas as pd

from .base import DataSource, DataSourceError

logger = logging.getLogger(__name__)


class AkShareCollector(DataSource):
    """AkShare data collector."""

    def __init__(self):
        super().__init__(name="akshare", priority=2)  # Higher priority for real-time data
        self.cache = {}  # Simple in-memory cache
        self.cache_ttl = timedelta(seconds=10)  # Cache TTL for real-time data

    async def get_stock_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Get real-time quote using AkShare.

        AkShare provides multiple interfaces for real-time data:
        1. stock_zh_a_spot_em - East Money real-time data
        2. stock_zh_a_spot - Sina real-time data
        3. stock_zh_a_ticks - Tick data

        Args:
            symbol: Stock symbol (e.g., "000001.SZ", "600036.SH")

        Returns:
            Dictionary with quote data
        """
        cache_key = f"quote_{symbol}"
        cached_data = self._get_cached(cache_key)
        if cached_data:
            return cached_data

        # Convert symbol to AkShare format
        code, market = self._parse_symbol(symbol)

        try:
            # Try multiple AkShare interfaces with fallback
            quote = await self._get_quote_with_fallback(code, market)

            # Cache the result
            self._set_cache(cache_key, quote)

            return quote

        except Exception as e:
            raise DataSourceError(f"Failed to get AkShare quote for {symbol}: {str(e)}")

    async def _get_quote_with_fallback(self, code: str, market: str) -> Dict[str, Any]:
        """Try multiple AkShare interfaces with fallback."""
        methods = [
            self._get_quote_from_eastmoney,
            self._get_quote_from_sina,
            self._get_quote_legacy
        ]

        last_error = None
        for method in methods:
            try:
                return await method(code, market)
            except Exception as e:
                last_error = e
                logger.debug(f"AkShare method {method.__name__} failed: {str(e)}")
                continue

        raise DataSourceError(f"All AkShare methods failed: {str(last_error)}")

    async def _get_quote_from_eastmoney(self, code: str, market: str) -> Dict[str, Any]:
        """Get real-time quote from East Money via AkShare."""
        # Run in thread pool since AkShare is synchronous
        loop = asyncio.get_event_loop()

        try:
            # Get all A-share real-time quotes
            df = await loop.run_in_executor(
                None,
                ak.stock_zh_a_spot_em
            )

            # Find our stock
            stock_code = f"{code}.{market}"
            stock_row = df[df["代码"] == stock_code]

            if stock_row.empty:
                # Try without market suffix
                stock_row = df[df["代码"] == code]

            if stock_row.empty:
                raise DataSourceError(f"Stock {code}.{market} not found in AkShare data")

            row = stock_row.iloc[0]

            # Parse quote data
            quote = {
                "symbol": f"{code}.{market}",
                "name": str(row.get("名称", "")),
                "price": float(row.get("最新价", 0.0)),
                "open": float(row.get("今开", 0.0)),
                "prev_close": float(row.get("昨收", 0.0)),
                "high": float(row.get("最高", 0.0)),
                "low": float(row.get("最低", 0.0)),
                "volume": int(row.get("成交量", 0)),
                "amount": float(row.get("成交额", 0.0)),
                "change": float(row.get("涨跌额", 0.0)),
                "change_percent": float(row.get("涨跌幅", 0.0)),
                "amplitude": float(row.get("振幅", 0.0)),  # Price amplitude
                "turnover_rate": float(row.get("换手率", 0.0)),
                "pe_ratio": float(row.get("市盈率-动态", 0.0)),
                "pb_ratio": float(row.get("市净率", 0.0)),
                "market_cap": float(row.get("总市值", 0.0)),
                "circulating_market_cap": float(row.get("流通市值", 0.0)),
                "timestamp": datetime.now()
            }

            # Calculate bid/ask from 五档数据 if available
            try:
                # Try to get bid/ask data
                tick_df = await loop.run_in_executor(
                    None,
                    ak.stock_zh_a_tick_163,
                    symbol=f"{code}{market.lower()}",
                    trade_date=datetime.now().strftime("%Y%m%d")
                )

                if not tick_df.empty:
                    # Get latest tick
                    latest_tick = tick_df.iloc[-1]
                    quote.update({
                        "bid_price": float(latest_tick.get("买价", 0.0)),
                        "ask_price": float(latest_tick.get("卖价", 0.0)),
                        "bid_volume": int(latest_tick.get("买量", 0)),
                        "ask_volume": int(latest_tick.get("卖量", 0))
                    })
            except Exception:
                # Bid/ask data is optional
                pass

            return quote

        except Exception as e:
            raise DataSourceError(f"East Money interface failed: {str(e)}")

    async def _get_quote_from_sina(self, code: str, market: str) -> Dict[str, Any]:
        """Get real-time quote from Sina via AkShare."""
        loop = asyncio.get_event_loop()

        try:
            # Get all A-share real-time quotes from Sina
            df = await loop.run_in_executor(
                None,
                ak.stock_zh_a_spot
            )

            # Find our stock (Sina format: sh600036 or sz000001)
            sina_symbol = f"{market.lower()}{code}"
            stock_row = df[df["symbol"] == sina_symbol]

            if stock_row.empty:
                raise DataSourceError(f"Stock {sina_symbol} not found in Sina data")

            row = stock_row.iloc[0]

            quote = {
                "symbol": f"{code}.{market}",
                "name": str(row.get("name", "")),
                "price": float(row.get("trade", 0.0)),
                "open": float(row.get("open", 0.0)),
                "prev_close": float(row.get("settlement", 0.0)),
                "high": float(row.get("high", 0.0)),
                "low": float(row.get("low", 0.0)),
                "volume": int(row.get("volume", 0)),
                "amount": float(row.get("amount", 0.0)),
                "change": float(row.get("changeamount", 0.0)),
                "change_percent": float(row.get("changepercent", 0.0)),
                "timestamp": datetime.now()
            }

            # Parse bid/ask data
            for i in range(1, 6):
                quote[f"bid_price_{i}"] = float(row.get(f"bid{i}", 0.0))
                quote[f"bid_volume_{i}"] = int(row.get(f"bid{i}volume", 0))
                quote[f"ask_price_{i}"] = float(row.get(f"ask{i}", 0.0))
                quote[f"ask_volume_{i}"] = int(row.get(f"ask{i}volume", 0))

            # Set main bid/ask
            quote["bid_price"] = quote.get("bid_price_1", 0.0)
            quote["ask_price"] = quote.get("ask_price_1", 0.0)
            quote["bid_volume"] = quote.get("bid_volume_1", 0)
            quote["ask_volume"] = quote.get("ask_volume_1", 0)

            return quote

        except Exception as e:
            raise DataSourceError(f"Sina interface failed: {str(e)}")

    async def _get_quote_legacy(self, code: str, market: str) -> Dict[str, Any]:
        """Legacy method for getting quote data."""
        loop = asyncio.get_event_loop()

        try:
            # Use stock_zh_a_minute for near-real-time data
            df = await loop.run_in_executor(
                None,
                ak.stock_zh_a_minute,
                symbol=f"sh{code}" if market == "SH" else f"sz{code}",
                period="1",
                adjust="qfq"
            )

            if df.empty:
                raise DataSourceError("Empty response from AkShare")

            # Get latest minute data
            latest = df.iloc[-1]

            quote = {
                "symbol": f"{code}.{market}",
                "price": float(latest.get("price", 0.0)),
                "volume": int(latest.get("volume", 0)),
                "timestamp": datetime.now()
            }

            # Fill with basic info
            quote.update({
                "open": quote["price"],  # Fallback
                "prev_close": quote["price"],
                "high": quote["price"],
                "low": quote["price"],
                "change": 0.0,
                "change_percent": 0.0,
                "name": f"{code}.{market}"
            })

            return quote

        except Exception as e:
            raise DataSourceError(f"Legacy interface failed: {str(e)}")

    async def get_stock_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> List[Dict[str, Any]]:
        """
        Get historical data using AkShare.

        Args:
            symbol: Stock symbol
            start_date: Start date
            end_date: End date
            interval: Data interval (1m, 5m, 15m, 30m, 60m, 1d, 1w, 1M)

        Returns:
            List of historical data points
        """
        cache_key = f"history_{symbol}_{start_date.date()}_{end_date.date()}_{interval}"
        cached_data = self._get_cached(cache_key)
        if cached_data:
            return cached_data

        # Convert symbol to AkShare format
        code, market = self._parse_symbol(symbol)
        ak_symbol = f"{market.lower()}{code}"

        # Convert interval to AkShare parameter
        period_map = {
            "1m": "1",
            "5m": "5",
            "15m": "15",
            "30m": "30",
            "60m": "60",
            "1d": "daily",
            "1w": "weekly",
            "1M": "monthly"
        }

        ak_period = period_map.get(interval, "daily")

        loop = asyncio.get_event_loop()

        try:
            if interval.endswith("m"):
                # Minute data
                df = await loop.run_in_executor(
                    None,
                    ak.stock_zh_a_minute,
                    symbol=ak_symbol,
                    period=ak_period,
                    adjust="qfq",
                    start_date=start_date.strftime("%Y%m%d"),
                    end_date=end_date.strftime("%Y%m%d")
                )

                history = []
                for _, row in df.iterrows():
                    try:
                        history_point = {
                            "symbol": symbol,
                            "timestamp": datetime.strptime(row["day"], "%Y-%m-%d %H:%M:%S"),
                            "open": float(row.get("open", 0.0)),
                            "high": float(row.get("high", 0.0)),
                            "low": float(row.get("low", 0.0)),
                            "close": float(row.get("close", 0.0)),
                            "volume": int(row.get("volume", 0)),
                            "amount": float(row.get("amount", 0.0))
                        }
                        history.append(history_point)
                    except (KeyError, ValueError):
                        continue

            else:
                # Daily/Weekly/Monthly data
                if ak_period == "daily":
                    df = await loop.run_in_executor(
                        None,
                        ak.stock_zh_a_hist,
                        symbol=code,
                        period=ak_period,
                        start_date=start_date.strftime("%Y%m%d"),
                        end_date=end_date.strftime("%Y%m%d"),
                        adjust="qfq"
                    )
                else:
                    df = await loop.run_in_executor(
                        None,
                        ak.stock_zh_a_hist,
                        symbol=code,
                        period=ak_period,
                        start_date=start_date.strftime("%Y%m%d"),
                        end_date=end_date.strftime("%Y%m%d"),
                        adjust="qfq"
                    )

                history = []
                for _, row in df.iterrows():
                    try:
                        history_point = {
                            "symbol": symbol,
                            "timestamp": datetime.strptime(str(row["日期"]), "%Y-%m-%d"),
                            "open": float(row.get("开盘", 0.0)),
                            "high": float(row.get("最高", 0.0)),
                            "low": float(row.get("最低", 0.0)),
                            "close": float(row.get("收盘", 0.0)),
                            "volume": int(row.get("成交量", 0)),
                            "amount": float(row.get("成交额", 0.0)),
                            "amplitude": float(row.get("振幅", 0.0)),
                            "change_percent": float(row.get("涨跌幅", 0.0)),
                            "change_amount": float(row.get("涨跌额", 0.0)),
                            "turnover_rate": float(row.get("换手率", 0.0))
                        }
                        history.append(history_point)
                    except (KeyError, ValueError):
                        continue

            # Cache the result
            self._set_cache(cache_key, history)

            return history

        except Exception as e:
            raise DataSourceError(f"Failed to get AkShare history for {symbol}: {str(e)}")

    async def get_stock_info(self, symbol: str) -> Dict[str, Any]:
        """
        Get stock information using AkShare.

        Args:
            symbol: Stock symbol

        Returns:
            Dictionary with stock information
        """
        cache_key = f"info_{symbol}"
        cached_data = self._get_cached(cache_key)
        if cached_data:
            return cached_data

        code, market = self._parse_symbol(symbol)

        loop = asyncio.get_event_loop()

        try:
            # Get basic stock info
            df = await loop.run_in_executor(
                None,
                ak.stock_individual_info_em,
                symbol=f"{code}.{market}"
            )

            if df.empty:
                # Fallback to simple info
                return await self._get_basic_stock_info(symbol)

            # Convert DataFrame to dictionary
            info_dict = {}
            for _, row in df.iterrows():
                info_dict[row["item"]] = row["value"]

            # Parse financial metrics
            info = {
                "symbol": symbol,
                "name": info_dict.get("股票简称", ""),
                "full_name": info_dict.get("公司全称", ""),
                "english_name": info_dict.get("英文名称", ""),
                "exchange": market,
                "listing_date": self._parse_date(info_dict.get("上市时间", "")),
                "industry": info_dict.get("所属行业", ""),
                "province": info_dict.get("区域", ""),
                "city": info_dict.get("城市", ""),
                "website": info_dict.get("公司网址", ""),
                "business_scope": info_dict.get("经营范围", ""),
                "business_summary": info_dict.get("公司简介", ""),
                "market_cap": self._parse_float(info_dict.get("总市值", "0")),
                "circulating_market_cap": self._parse_float(info_dict.get("流通市值", "0")),
                "total_shares": self._parse_float(info_dict.get("总股本", "0")),
                "circulating_shares": self._parse_float(info_dict.get("流通股本", "0")),
                "pe_ratio": self._parse_float(info_dict.get("市盈率(动)", "0")),
                "pb_ratio": self._parse_float(info_dict.get("市净率", "0")),
                "dividend_yield": self._parse_float(info_dict.get("股息率", "0")),
                "roe": self._parse_float(info_dict.get("净资产收益率", "0")),
                "timestamp": datetime.now()
            }

            # Cache the result
            self._set_cache(cache_key, info)

            return info

        except Exception as e:
            logger.warning(f"Failed to get detailed info for {symbol}: {str(e)}")
            # Fallback to basic info
            return await self._get_basic_stock_info(symbol)

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
                "timestamp": datetime.now()
            }
        except Exception as e:
            raise DataSourceError(f"Failed to get basic info for {symbol}: {str(e)}")

    async def get_batch_quotes(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Get real-time quotes for multiple stocks.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to quote data
        """
        results = {}
        failed_symbols = []

        # Process symbols in smaller batches
        batch_size = 50  # AkShare can handle larger batches

        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]

            try:
                # Get all A-share quotes at once
                loop = asyncio.get_event_loop()
                df = await loop.run_in_executor(
                    None,
                    ak.stock_zh_a_spot_em
                )

                for symbol in batch:
                    try:
                        code, market = self._parse_symbol(symbol)
                        stock_code = f"{code}.{market}"

                        # Find stock in DataFrame
                        stock_row = df[df["代码"] == stock_code]
                        if stock_row.empty:
                            stock_row = df[df["代码"] == code]

                        if not stock_row.empty:
                            row = stock_row.iloc[0]
                            results[symbol] = {
                                "symbol": symbol,
                                "name": str(row.get("名称", "")),
                                "price": float(row.get("最新价", 0.0)),
                                "open": float(row.get("今开", 0.0)),
                                "prev_close": float(row.get("昨收", 0.0)),
                                "high": float(row.get("最高", 0.0)),
                                "low": float(row.get("最低", 0.0)),
                                "volume": int(row.get("成交量", 0)),
                                "amount": float(row.get("成交额", 0.0)),
                                "change": float(row.get("涨跌额", 0.0)),
                                "change_percent": float(row.get("涨跌幅", 0.0)),
                                "timestamp": datetime.now()
                            }
                        else:
                            failed_symbols.append(symbol)
                    except Exception as e:
                        logger.warning(f"Failed to process symbol {symbol}: {str(e)}")
                        failed_symbols.append(symbol)

            except Exception as e:
                logger.error(f"Batch request failed for symbols {batch}: {str(e)}")
                failed_symbols.extend(batch)

        # Retry failed symbols individually
        for symbol in failed_symbols:
            try:
                results[symbol] = await self.get_stock_quote(symbol)
            except Exception:
                logger.warning(f"Failed to get quote for {symbol} even with individual request")

        return results

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
            return datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            try:
                return datetime.strptime(date_str, "%Y/%m/%d")
            except ValueError:
                return None

    def _parse_float(self, value_str: str) -> Optional[float]:
        """Parse float string, handling Chinese numeric suffixes."""
        if not value_str:
            return None

        try:
            # Remove Chinese characters and commas
            cleaned = value_str.replace(",", "").replace("亿", "e8").replace("万", "e4")
            return float(cleaned)
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