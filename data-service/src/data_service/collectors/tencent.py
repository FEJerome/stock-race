"""
Tencent Finance data collector.
"""

import re
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import aiohttp

from .base import DataSource, DataSourceError


class TencentCollector(DataSource):
    """Tencent Finance data collector."""

    def __init__(self):
        super().__init__(name="tencent", priority=2)
        self.base_url = "http://qt.gtimg.cn"
        self.history_url = "https://web.ifzq.gtimg.cn"

    async def get_stock_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Get real-time quote from Tencent Finance.

        Tencent API format: v_sh600036="1~浦发银行~600036~16.85~16.90~16.82~...";

        Returns:
            Dictionary with quote data
        """
        # Convert symbol format: 000001.SZ -> sz000001
        market, code = self._parse_symbol(symbol)
        tencent_symbol = f"{market.lower()}{code}"

        url = f"{self.base_url}/q={tencent_symbol}"
        headers = {
            "Referer": "http://gu.qq.com",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

        try:
            response = await self._make_request(url, headers=headers)
            text = response.get("text", "")

            if not text:
                raise DataSourceError("Empty response from Tencent")

            # Parse the response
            lines = text.strip().split("\n")
            for line in lines:
                if not line:
                    continue

                # Parse line: v_sh600036="1~浦发银行~600036~16.85~16.90~16.82~...";
                match = re.search(r'v_(\w+)="(.*?)";', line)
                if not match:
                    continue

                response_symbol = match.group(1)
                if response_symbol != tencent_symbol:
                    continue

                data_str = match.group(2)
                if not data_str:
                    raise DataSourceError(f"No data in response: {line[:100]}")

                fields = data_str.split("~")
                if len(fields) < 40:
                    raise DataSourceError(f"Incomplete data: {len(fields)} fields")

                # Helper function to safely extract first number from string
                def safe_float(value):
                    if not value or value == "":
                        return 0.0
                    try:
                        # Handle cases like "1524.96/0/0" by taking first part
                        if "/" in str(value):
                            value = str(value).split("/")[0]
                        return float(value)
                    except (ValueError, TypeError):
                        return 0.0

                def safe_int(value):
                    if not value or value == "":
                        return 0
                    try:
                        # Handle cases like "123/0/0" by taking first part
                        if "/" in str(value):
                            value = str(value).split("/")[0]
                        return int(float(value))
                    except (ValueError, TypeError):
                        return 0

                # Parse fields according to Tencent format
                quote = {
                    "symbol": symbol,
                    "name": fields[1],
                    "code": fields[2],
                    "price": safe_float(fields[3]),
                    "prev_close": safe_float(fields[4]),
                    "open": safe_float(fields[5]),
                    "volume": safe_int(fields[6]),
                    "bid_volume": safe_int(fields[7]),
                    "ask_volume": safe_int(fields[8]),
                    "bid_price_1": safe_float(fields[9]),
                    "bid_volume_1": safe_int(fields[10]),
                    "bid_price_2": safe_float(fields[11]),
                    "bid_volume_2": safe_int(fields[12]),
                    "bid_price_3": safe_float(fields[13]),
                    "bid_volume_3": safe_int(fields[14]),
                    "bid_price_4": safe_float(fields[15]),
                    "bid_volume_4": safe_int(fields[16]),
                    "bid_price_5": safe_float(fields[17]),
                    "bid_volume_5": safe_int(fields[18]),
                    "ask_price_1": safe_float(fields[19]),
                    "ask_volume_1": safe_int(fields[20]),
                    "ask_price_2": safe_float(fields[21]),
                    "ask_volume_2": safe_int(fields[22]),
                    "ask_price_3": safe_float(fields[23]),
                    "ask_volume_3": safe_int(fields[24]),
                    "ask_price_4": safe_float(fields[25]),
                    "ask_volume_4": safe_int(fields[26]),
                    "ask_price_5": safe_float(fields[27]),
                    "ask_volume_5": safe_int(fields[28]),
                    "recent_transaction": fields[29],
                    "timestamp": f"{fields[30]} {fields[31]}",
                    "change": safe_float(fields[32]),
                    "change_percent": safe_float(fields[33]),
                    "high": safe_float(fields[34]),
                    "low": safe_float(fields[35]),
                    "price_volume_ratio": safe_float(fields[36]),
                    "turnover_rate": safe_float(fields[37]),
                    "pe_ratio": safe_float(fields[38]),
                    "pb_ratio": safe_float(fields[39]),
                    "amount": safe_float(fields[37]) * safe_float(fields[3]),
                    "processed_timestamp": datetime.now()
                }

                # Simplify bid/ask data
                quote["bid_price"] = quote["bid_price_1"]
                quote["ask_price"] = quote["ask_price_1"]
                quote["bid_volume"] = quote["bid_volume_1"]
                quote["ask_volume"] = quote["ask_volume_1"]

                return quote

            raise DataSourceError(f"Symbol {symbol} not found in response")

        except Exception as e:
            raise DataSourceError(f"Failed to get Tencent quote for {symbol}: {str(e)}")

    async def get_stock_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> List[Dict[str, Any]]:
        """
        Get historical data from Tencent Finance.

        Args:
            symbol: Stock symbol
            start_date: Start date
            end_date: End date
            interval: Data interval (1d, 1w, 1M)

        Returns:
            List of historical data points
        """
        # Map interval to Tencent scale parameter
        scale_map = {
            "1d": 240,  # Daily
            "1w": 120,  # Weekly
            "1M": 20,   # Monthly
        }

        if interval not in scale_map:
            raise DataSourceError(f"Tencent doesn't support interval {interval}")

        market, code = self._parse_symbol(symbol)
        tencent_symbol = f"{market.lower()}{code}"

        # Convert dates to string format
        start_str = start_date.strftime("%Y%m%d")
        end_str = end_date.strftime("%Y%m%d")

        url = f"{self.history_url}/appstock/app/fqkline/get"
        params = {
            "param": f"{tencent_symbol},day,{start_str},{end_str},{scale_map[interval]},qfq",
            "_var": "kline_dayqfq",
            "r": "0.123456"  # Random number to avoid caching
        }

        try:
            response = await self._make_request(url, params=params)
            text = response.get("text", "")

            if not text:
                raise DataSourceError("Empty response from Tencent")

            # Parse JSONP response
            match = re.search(r'kline_dayqfq\s*=\s*({.*?});', text, re.DOTALL)
            if not match:
                raise DataSourceError(f"Invalid response format: {text[:200]}")

            json_str = match.group(1)
            data = json.loads(json_str)

            # Extract data from nested structure
            stock_data = data.get("data", {}).get(tencent_symbol, {})
            if not stock_data:
                raise DataSourceError(f"No data for symbol {symbol}")

            qfq_data = stock_data.get("qfqday", []) or stock_data.get("day", [])

            history = []
            for item in qfq_data:
                try:
                    # Tencent format: [date, open, close, high, low, volume, amount]
                    history_point = {
                        "symbol": symbol,
                        "timestamp": datetime.strptime(item[0], "%Y-%m-%d"),
                        "open": float(item[1]),
                        "close": float(item[2]),
                        "high": float(item[3]),
                        "low": float(item[4]),
                        "volume": int(item[5]),
                        "amount": float(item[6]) if len(item) > 6 else 0.0
                    }
                    history.append(history_point)
                except (IndexError, ValueError) as e:
                    continue  # Skip invalid data points

            return history

        except Exception as e:
            raise DataSourceError(f"Failed to get Tencent history for {symbol}: {str(e)}")

    async def get_stock_info(self, symbol: str) -> Dict[str, Any]:
        """
        Get stock information from Tencent Finance.

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
                "market_cap": None,  # Calculate from price and shares outstanding
                "pe_ratio": quote.get("pe_ratio"),
                "pb_ratio": quote.get("pb_ratio"),
                "dividend_yield": None,
                "listing_date": None
            }
        except Exception as e:
            raise DataSourceError(f"Failed to get Tencent info for {symbol}: {str(e)}")

    async def get_batch_quotes(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Get real-time quotes for multiple stocks.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to quote data
        """
        # Convert symbols to Tencent format
        tencent_symbols = []
        symbol_map = {}
        for symbol in symbols:
            market, code = self._parse_symbol(symbol)
            tencent_symbol = f"{market.lower()}{code}"
            tencent_symbols.append(tencent_symbol)
            symbol_map[tencent_symbol] = symbol

        # Tencent supports batch queries with comma-separated symbols
        url = f"{self.base_url}/q={','.join(tencent_symbols)}"
        headers = {
            "Referer": "http://gu.qq.com",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

        try:
            response = await self._make_request(url, headers=headers)
            text = response.get("text", "")

            if not text:
                raise DataSourceError("Empty response from Tencent")

            # Parse batch response
            quotes = {}
            lines = text.strip().split("\n")

            for line in lines:
                if not line:
                    continue

                # Parse line: v_sh600036="1~浦发银行~600036~16.85~...";
                match = re.search(r'v_(\w+)="(.*?)";', line)
                if not match:
                    continue

                tencent_symbol = match.group(1)
                data_str = match.group(2)

                if tencent_symbol not in symbol_map:
                    continue

                symbol = symbol_map[tencent_symbol]
                fields = data_str.split("~")

                if len(fields) < 40:
                    continue

                try:
                    quote = {
                        "symbol": symbol,
                        "name": fields[1],
                        "price": float(fields[3]) if fields[3] else 0.0,
                        "prev_close": float(fields[4]) if fields[4] else 0.0,
                        "open": float(fields[5]) if fields[5] else 0.0,
                        "volume": int(fields[6]) if fields[6] else 0,
                        "high": float(fields[34]) if fields[34] else 0.0,
                        "low": float(fields[35]) if fields[35] else 0.0,
                        "change": float(fields[32]) if fields[32] else 0.0,
                        "change_percent": float(fields[33]) if fields[33] else 0.0,
                        "pe_ratio": float(fields[38]) if fields[38] else 0.0,
                        "pb_ratio": float(fields[39]) if fields[39] else 0.0,
                        "amount": float(fields[37]) * float(fields[3]) if fields[37] and fields[3] else 0.0,
                        "timestamp": datetime.now()
                    }
                    quotes[symbol] = quote
                except (ValueError, IndexError):
                    continue  # Skip invalid quotes

            return quotes

        except Exception as e:
            raise DataSourceError(f"Failed to get batch quotes from Tencent: {str(e)}")

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