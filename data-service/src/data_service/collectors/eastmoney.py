"""
East Money data collector.
"""

import asyncio
import re
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import aiohttp

from .base import DataSource, DataSourceError


class EastMoneyCollector(DataSource):
    """East Money data collector."""

    def __init__(self):
        super().__init__(name="eastmoney", priority=3)
        self.base_url = "https://push2.eastmoney.com"
        self.history_url = "https://push2his.eastmoney.com"

    async def get_stock_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Get real-time quote from East Money.

        East Money API returns JSON data.

        Returns:
            Dictionary with quote data
        """
        # Convert symbol format: 000001.SZ -> 0.000001 (SZ) or 1.600036 (SH)
        market, code = self._parse_symbol(symbol)
        eastmoney_code = f"{1 if market == 'SH' else 0}.{code}"

        url = f"{self.base_url}/api/qt/stock/get"
        params = {
            "invt": 2,
            "fltt": 2,
            "fields": "f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65,f66,f67,f68,f69,f70,f71,f72,f73,f74,f75,f76,f77,f78,f79,f80,f81,f82,f83,f84,f85,f86,f87,f88,f89,f90,f91,f92,f93,f94,f95,f96,f97,f98,f99,f100,f101,f102,f103,f104,f105,f106,f107,f108,f109,f110,f111,f112,f113,f114,f115,f116,f117,f118,f119,f120,f121,f122,f123,f124,f125,f126,f127,f128,f129,f130,f131,f132,f133,f134,f135,f136,f137,f138,f139,f140,f141,f142,f143,f144,f145,f146,f147,f148,f149,f150,f151,f152,f153,f154,f155,f156,f157,f158,f159,f160,f161,f162,f163,f164,f165,f166,f167,f168,f169,f170,f171,f172,f173,f174,f175,f176,f177,f178,f179,f180,f181,f182,f183,f184,f185,f186,f187,f188,f189,f190,f191,f192,f193,f194,f195,f196,f197,f198,f199,f200",
            "secid": eastmoney_code,
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
            "cb": "jQuery1830123456789012345678_1234567890123",
            "_": "1234567890123"  # Timestamp
        }

        headers = {
            "Referer": "https://quote.eastmoney.com",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

        try:
            response = await self._make_request(url, params=params, headers=headers)
            text = response.get("text", "")

            if not text:
                raise DataSourceError("Empty response from East Money")

            # Parse response - may be JSON or JSONP
            text = text.strip()
            if text.startswith('jQuery'):
                # JSONP format
                match = re.search(r'jQuery\d+_\d+\((.*?)\);', text, re.DOTALL)
                if not match:
                    raise DataSourceError(f"Invalid JSONP format: {text[:200]}")
                json_str = match.group(1)
                data = json.loads(json_str)
            else:
                # Pure JSON format
                data = json.loads(text)

            result = data.get("data", {})
            if not result:
                raise DataSourceError(f"No data for symbol {symbol}")

            # Helper function to safely convert to float
            def safe_float(value, divisor=1.0):
                if value is None or value == "":
                    return 0.0
                try:
                    return float(value) / divisor
                except (ValueError, TypeError):
                    return 0.0

            def safe_int(value):
                if value is None or value == "":
                    return 0
                try:
                    return int(float(value))
                except (ValueError, TypeError):
                    return 0

            # Map East Money field codes to meaningful names
            # Note: East Money returns prices directly (no need to divide by 10000)
            quote = {
                "symbol": symbol,
                "name": result.get("f14", ""),
                "code": result.get("f12", ""),
                "price": safe_float(result.get("f43")),
                "prev_close": safe_float(result.get("f60")),
                "open": safe_float(result.get("f46")),
                "high": safe_float(result.get("f44")),
                "low": safe_float(result.get("f45")),
                "volume": safe_int(result.get("f47")),
                "amount": safe_float(result.get("f48")),
                "bid_price_1": safe_float(result.get("f31")),
                "bid_volume_1": safe_int(result.get("f32")),
                "bid_price_2": safe_float(result.get("f33")),
                "bid_volume_2": safe_int(result.get("f34")),
                "bid_price_3": safe_float(result.get("f35")),
                "bid_volume_3": safe_int(result.get("f36")),
                "bid_price_4": safe_float(result.get("f37")),
                "bid_volume_4": safe_int(result.get("f38")),
                "bid_price_5": safe_float(result.get("f39")),
                "bid_volume_5": safe_int(result.get("f40")),
                "ask_price_1": safe_float(result.get("f19")),
                "ask_volume_1": safe_int(result.get("f20")),
                "ask_price_2": safe_float(result.get("f21")),
                "ask_volume_2": safe_int(result.get("f22")),
                "ask_price_3": safe_float(result.get("f23")),
                "ask_volume_3": safe_int(result.get("f24")),
                "ask_price_4": safe_float(result.get("f25")),
                "ask_volume_4": safe_int(result.get("f26")),
                "ask_price_5": safe_float(result.get("f27")),
                "ask_volume_5": safe_int(result.get("f28")),
                "change": safe_float(result.get("f169")),
                "change_percent": safe_float(result.get("f170")),
                "pe_ratio": safe_float(result.get("f162")),
                "pb_ratio": safe_float(result.get("f167")),
                "market_cap": safe_float(result.get("f116")),
                "circulating_market_cap": safe_float(result.get("f117")),
                "turnover_rate": safe_float(result.get("f168")),
                "timestamp": datetime.now()
            }

            # Simplify bid/ask data
            quote["bid_price"] = quote["bid_price_1"]
            quote["ask_price"] = quote["ask_price_1"]
            quote["bid_volume"] = quote["bid_volume_1"]
            quote["ask_volume"] = quote["ask_volume_1"]

            return quote

        except Exception as e:
            raise DataSourceError(f"Failed to get East Money quote for {symbol}: {str(e)}")

    async def get_stock_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> List[Dict[str, Any]]:
        """
        Get historical data from East Money.

        Args:
            symbol: Stock symbol
            start_date: Start date
            end_date: End date
            interval: Data interval (1d, 1w, 1M)

        Returns:
            List of historical data points
        """
        # Map interval to East Money klt parameter
        klt_map = {
            "1m": 1,
            "5m": 5,
            "15m": 15,
            "30m": 30,
            "1h": 60,
            "1d": 101,
            "1w": 102,
            "1M": 103,
        }

        if interval not in klt_map:
            raise DataSourceError(f"East Money doesn't support interval {interval}")

        market, code = self._parse_symbol(symbol)
        eastmoney_code = f"{1 if market == 'SH' else 0}.{code}"

        # Convert dates to string format
        start_str = start_date.strftime("%Y%m%d")
        end_str = end_date.strftime("%Y%m%d")

        url = f"{self.history_url}/api/qt/stock/kline/get"
        params = {
            "secid": eastmoney_code,
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
            "fields1": "f1,f2,f3,f4,f5,f6",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
            "klt": klt_map[interval],
            "fqt": 1,  # 1:前复权, 0:不复权
            "beg": start_str,
            "end": end_str,
            "_": "1234567890123"  # Timestamp
        }

        try:
            response = await self._make_request(url, params=params)
            text = response.get("text", "")

            if not text:
                raise DataSourceError("Empty response from East Money")

            # Parse JSON response
            data = json.loads(text)

            result = data.get("data", {})
            if not result:
                raise DataSourceError(f"No data for symbol {symbol}")

            klines = result.get("klines", [])

            history = []
            for kline_str in klines:
                try:
                    # East Money format: "2024-01-01,16.85,16.90,16.80,16.82,1000000,16850000,0.00,0.00,0.00,0.00"
                    fields = kline_str.split(",")
                    if len(fields) < 6:
                        continue

                    history_point = {
                        "symbol": symbol,
                        "timestamp": datetime.strptime(fields[0], "%Y-%m-%d"),
                        "open": float(fields[1]),
                        "close": float(fields[2]),
                        "high": float(fields[3]),
                        "low": float(fields[4]),
                        "volume": int(fields[5]),
                        "amount": float(fields[6]) if len(fields) > 6 else 0.0,
                        "amplitude": float(fields[7]) if len(fields) > 7 else 0.0,
                        "change_percent": float(fields[8]) if len(fields) > 8 else 0.0,
                        "change": float(fields[9]) if len(fields) > 9 else 0.0,
                        "turnover_rate": float(fields[10]) if len(fields) > 10 else 0.0
                    }
                    history.append(history_point)
                except (IndexError, ValueError) as e:
                    continue  # Skip invalid data points

            return history

        except Exception as e:
            raise DataSourceError(f"Failed to get East Money history for {symbol}: {str(e)}")

    async def get_stock_info(self, symbol: str) -> Dict[str, Any]:
        """
        Get stock information from East Money.

        Args:
            symbol: Stock symbol

        Returns:
            Dictionary with stock information
        """
        try:
            quote = await self.get_stock_quote(symbol)
            return {
                "symbol": symbol,
                "name": quote.get("name", ""),
                "exchange": "SH" if symbol.endswith(".SH") else "SZ",
                "market_cap": quote.get("market_cap"),
                "circulating_market_cap": quote.get("circulating_market_cap"),
                "pe_ratio": quote.get("pe_ratio"),
                "pb_ratio": quote.get("pb_ratio"),
                "dividend_yield": None,
                "listing_date": None,
                "turnover_rate": quote.get("turnover_rate")
            }
        except Exception as e:
            raise DataSourceError(f"Failed to get East Money info for {symbol}: {str(e)}")

    async def get_batch_quotes(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Get real-time quotes for multiple stocks.

        Note: East Money batch API seems to return empty responses.
        Using parallel single stock queries instead.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to quote data
        """
        results = {}
        failed_symbols = []

        # Process symbols in parallel with limited concurrency
        semaphore = asyncio.Semaphore(5)  # Limit concurrent requests

        async def process_symbol(symbol: str):
            async with semaphore:
                try:
                    quote = await self.get_stock_quote(symbol)
                    results[symbol] = quote
                except Exception as e:
                    logger.warning(f"Failed to get East Money quote for {symbol}: {str(e)}")
                    failed_symbols.append(symbol)

        # Create tasks for all symbols
        tasks = [process_symbol(symbol) for symbol in symbols]
        await asyncio.gather(*tasks, return_exceptions=True)

        return results

    def _parse_symbol(self, symbol: str) -> tuple[str, str]:
        """
        Parse stock symbol into market and code.

        Args:
            symbol: Stock symbol in format "000001.SZ" or "600036.SH"

        Returns:
            Tuple of (market, code)
        """
        if "." in symbol:
            code, market = symbol.split(".")
            return market, code
        else:
            # Default to Shanghai if no market specified
            if symbol.startswith("6"):
                return "SH", symbol
            else:
                return "SZ", symbol