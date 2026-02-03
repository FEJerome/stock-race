"""
East Money data collector.
"""

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

            # Parse JSONP response
            match = re.search(r'jQuery\d+_\d+\((.*?)\);', text, re.DOTALL)
            if not match:
                raise DataSourceError(f"Invalid response format: {text[:200]}")

            json_str = match.group(1)
            data = json.loads(json_str)

            result = data.get("data", {})
            if not result:
                raise DataSourceError(f"No data for symbol {symbol}")

            # Map East Money field codes to meaningful names
            quote = {
                "symbol": symbol,
                "name": result.get("f14", ""),
                "code": result.get("f12", ""),
                "price": result.get("f43", 0.0) / 10000 if result.get("f43") else 0.0,
                "prev_close": result.get("f60", 0.0) / 10000 if result.get("f60") else 0.0,
                "open": result.get("f46", 0.0) / 10000 if result.get("f46") else 0.0,
                "high": result.get("f44", 0.0) / 10000 if result.get("f44") else 0.0,
                "low": result.get("f45", 0.0) / 10000 if result.get("f45") else 0.0,
                "volume": result.get("f47", 0),
                "amount": result.get("f48", 0.0) / 10000 if result.get("f48") else 0.0,
                "bid_price_1": result.get("f9", 0.0) / 10000 if result.get("f9") else 0.0,
                "bid_volume_1": result.get("f10", 0),
                "bid_price_2": result.get("f11", 0.0) / 10000 if result.get("f11") else 0.0,
                "bid_volume_2": result.get("f12", 0),
                "bid_price_3": result.get("f13", 0.0) / 10000 if result.get("f13") else 0.0,
                "bid_volume_3": result.get("f14", 0),
                "bid_price_4": result.get("f15", 0.0) / 10000 if result.get("f15") else 0.0,
                "bid_volume_4": result.get("f16", 0),
                "bid_price_5": result.get("f17", 0.0) / 10000 if result.get("f17") else 0.0,
                "bid_volume_5": result.get("f18", 0),
                "ask_price_1": result.get("f19", 0.0) / 10000 if result.get("f19") else 0.0,
                "ask_volume_1": result.get("f20", 0),
                "ask_price_2": result.get("f21", 0.0) / 10000 if result.get("f21") else 0.0,
                "ask_volume_2": result.get("f22", 0),
                "ask_price_3": result.get("f23", 0.0) / 10000 if result.get("f23") else 0.0,
                "ask_volume_3": result.get("f24", 0),
                "ask_price_4": result.get("f25", 0.0) / 10000 if result.get("f25") else 0.0,
                "ask_volume_4": result.get("f26", 0),
                "ask_price_5": result.get("f27", 0.0) / 10000 if result.get("f27") else 0.0,
                "ask_volume_5": result.get("f28", 0),
                "change": result.get("f169", 0.0) / 10000 if result.get("f169") else 0.0,
                "change_percent": result.get("f170", 0.0),
                "pe_ratio": result.get("f162", 0.0),
                "pb_ratio": result.get("f167", 0.0),
                "market_cap": result.get("f116", 0.0),
                "circulating_market_cap": result.get("f117", 0.0),
                "turnover_rate": result.get("f168", 0.0),
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

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to quote data
        """
        # Convert symbols to East Money format
        eastmoney_codes = []
        symbol_map = {}
        for symbol in symbols:
            market, code = self._parse_symbol(symbol)
            eastmoney_code = f"{1 if market == 'SH' else 0}.{code}"
            eastmoney_codes.append(eastmoney_code)
            symbol_map[eastmoney_code] = symbol

        # East Money supports batch queries
        url = f"{self.base_url}/api/qt/ulist.np/get"
        params = {
            "fields": "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f15,f16,f17,f18,f19,f20,f21,f22,f23,f24,f25,f26,f27,f28,f29,f30,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f41,f42,f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65,f66,f67,f68,f69,f70,f71,f72,f73,f74,f75,f76,f77,f78,f79,f80,f81,f82,f83,f84,f85,f86,f87,f88,f89,f90,f91,f92,f93,f94,f95,f96,f97,f98,f99,f100,f101,f102,f103,f104,f105,f106,f107,f108,f109,f110,f111,f112,f113,f114,f115,f116,f117,f118,f119,f120,f121,f122,f123,f124,f125,f126,f127,f128,f129,f130,f131,f132,f133,f134,f135,f136,f137,f138,f139,f140,f141,f142,f143,f144,f145,f146,f147,f148,f149,f150,f151,f152,f153,f154,f155,f156,f157,f158,f159,f160,f161,f162,f163,f164,f165,f166,f167,f168,f169,f170,f171,f172,f173,f174,f175,f176,f177,f178,f179,f180,f181,f182,f183,f184,f185,f186,f187,f188,f189,f190,f191,f192,f193,f194,f195,f196,f197,f198,f199,f200",
            "secids": ",".join(eastmoney_codes),
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

            # Parse JSONP response
            match = re.search(r'jQuery\d+_\d+\((.*?)\);', text, re.DOTALL)
            if not match:
                raise DataSourceError(f"Invalid response format: {text[:200]}")

            json_str = match.group(1)
            data = json.loads(json_str)

            result = data.get("data", {}).get("diff", [])
            if not result:
                raise DataSourceError("No data in batch response")

            quotes = {}
            for item in result:
                eastmoney_code = item.get("f12", "")
                if eastmoney_code not in symbol_map:
                    continue

                symbol = symbol_map[eastmoney_code]
                try:
                    quote = {
                        "symbol": symbol,
                        "name": item.get("f14", ""),
                        "price": item.get("f2", 0.0) / 10000 if item.get("f2") else 0.0,
                        "prev_close": item.get("f18", 0.0) / 10000 if item.get("f18") else 0.0,
                        "open": item.get("f17", 0.0) / 10000 if item.get("f17") else 0.0,
                        "high": item.get("f15", 0.0) / 10000 if item.get("f15") else 0.0,
                        "low": item.get("f16", 0.0) / 10000 if item.get("f16") else 0.0,
                        "volume": item.get("f5", 0),
                        "amount": item.get("f6", 0.0) / 10000 if item.get("f6") else 0.0,
                        "change": item.get("f4", 0.0) / 10000 if item.get("f4") else 0.0,
                        "change_percent": item.get("f3", 0.0),
                        "pe_ratio": item.get("f9", 0.0),
                        "pb_ratio": item.get("f23", 0.0),
                        "market_cap": item.get("f20", 0.0),
                        "circulating_market_cap": item.get("f21", 0.0),
                        "turnover_rate": item.get("f8", 0.0),
                        "timestamp": datetime.now()
                    }
                    quotes[symbol] = quote
                except (ValueError, KeyError):
                    continue  # Skip invalid quotes

            return quotes

        except Exception as e:
            raise DataSourceError(f"Failed to get batch quotes from East Money: {str(e)}")

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