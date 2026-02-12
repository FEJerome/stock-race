"""
Sina Finance data collector.
"""

import re
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import aiohttp

from .base import DataSource, DataSourceError


class SinaCollector(DataSource):
    """Sina Finance data collector."""

    def __init__(self):
        super().__init__(name="sina", priority=1)
        self.base_url = "http://hq.sinajs.cn"
        self.history_url = "https://quotes.sina.cn/cn/api/json_v2.php"

    async def get_stock_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Get real-time quote from Sina Finance.

        Sina API format: var hq_str_sh600036="浦发银行,16.850,16.900,16.820,16.950,16.800,...";

        Returns:
            Dictionary with quote data
        """
        # Convert symbol format: 000001.SZ -> sz000001
        market, code = self._parse_symbol(symbol)
        sina_symbol = f"{market.lower()}{code}"

        url = f"{self.base_url}/list={sina_symbol}"
        headers = {
            "Referer": "http://finance.sina.com.cn",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

        try:
            response = await self._make_request(url, headers=headers)
            text = response.get("text", "")

            if not text:
                raise DataSourceError("Empty response from Sina")

            # Parse the response
            match = re.search(r'="(.*?)"', text)
            if not match:
                raise DataSourceError(f"Invalid response format: {text[:100]}")

            data_str = match.group(1)
            if not data_str:
                raise DataSourceError(f"No data in response: {text[:100]}")

            fields = data_str.split(",")
            if len(fields) < 32:
                raise DataSourceError(f"Incomplete data: {len(fields)} fields")

            # Parse fields according to Sina format
            quote = {
                "symbol": symbol,
                "name": fields[0],
                "open": float(fields[1]) if fields[1] else 0.0,
                "prev_close": float(fields[2]) if fields[2] else 0.0,
                "price": float(fields[3]) if fields[3] else 0.0,
                "high": float(fields[4]) if fields[4] else 0.0,
                "low": float(fields[5]) if fields[5] else 0.0,
                "bid_price": float(fields[6]) if fields[6] else 0.0,
                "ask_price": float(fields[7]) if fields[7] else 0.0,
                "volume": int(fields[8]) if fields[8] else 0,
                "amount": float(fields[9]) if fields[9] else 0.0,
                "bid_volume_1": int(fields[10]) if fields[10] else 0,
                "bid_price_1": float(fields[11]) if fields[11] else 0.0,
                "bid_volume_2": int(fields[12]) if fields[12] else 0,
                "bid_price_2": float(fields[13]) if fields[13] else 0.0,
                "bid_volume_3": int(fields[14]) if fields[14] else 0,
                "bid_price_3": float(fields[15]) if fields[15] else 0.0,
                "bid_volume_4": int(fields[16]) if fields[16] else 0,
                "bid_price_4": float(fields[17]) if fields[17] else 0.0,
                "bid_volume_5": int(fields[18]) if fields[18] else 0,
                "bid_price_5": float(fields[19]) if fields[19] else 0.0,
                "ask_volume_1": int(fields[20]) if fields[20] else 0,
                "ask_price_1": float(fields[21]) if fields[21] else 0.0,
                "ask_volume_2": int(fields[22]) if fields[22] else 0,
                "ask_price_2": float(fields[23]) if fields[23] else 0.0,
                "ask_volume_3": int(fields[24]) if fields[24] else 0,
                "ask_price_3": float(fields[25]) if fields[25] else 0.0,
                "ask_volume_4": int(fields[26]) if fields[26] else 0,
                "ask_price_4": float(fields[27]) if fields[27] else 0.0,
                "ask_volume_5": int(fields[28]) if fields[28] else 0,
                "ask_price_5": float(fields[29]) if fields[29] else 0.0,
                "date": fields[30],
                "time": fields[31],
                "timestamp": datetime.now()
            }

            # Calculate change
            if quote["prev_close"] > 0:
                quote["change"] = quote["price"] - quote["prev_close"]
                quote["change_percent"] = (quote["change"] / quote["prev_close"]) * 100
            else:
                quote["change"] = 0.0
                quote["change_percent"] = 0.0

            # Simplify bid/ask data
            quote["bid_price"] = quote["bid_price_1"]
            quote["ask_price"] = quote["ask_price_1"]
            quote["bid_volume"] = quote["bid_volume_1"]
            quote["ask_volume"] = quote["ask_volume_1"]

            return quote

        except Exception as e:
            raise DataSourceError(f"Failed to get Sina quote for {symbol}: {str(e)}")

    async def get_stock_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> List[Dict[str, Any]]:
        """
        Get historical data from Sina Finance.

        Args:
            symbol: Stock symbol
            start_date: Start date
            end_date: End date
            interval: Data interval (1d, 1w, 1M)

        Returns:
            List of historical data points
        """
        # Sina only provides daily data through this API
        if interval != "1d":
            raise DataSourceError(f"Sina only supports daily interval, got {interval}")

        market, code = self._parse_symbol(symbol)
        sina_symbol = f"{market.lower()}{code}"

        # Convert dates to string format
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")

        url = f"{self.history_url}/CN_MarketDataService.getKLineData"
        params = {
            "symbol": sina_symbol,
            "scale": 240,  # Daily data
            "ma": "no",    # No moving average
            "datalen": 1000,  # Max data points
            "begin_date": start_str,
            "end_date": end_str
        }

        try:
            response = await self._make_request(url, params=params)

            # Sina returns JSON array directly
            if isinstance(response, list):
                data = response
            else:
                # Try to parse as JSON string
                data = json.loads(response.get("text", "[]"))

            history = []
            for item in data:
                try:
                    history_point = {
                        "symbol": symbol,
                        "timestamp": datetime.strptime(item["day"], "%Y-%m-%d"),
                        "open": float(item["open"]),
                        "high": float(item["high"]),
                        "low": float(item["low"]),
                        "close": float(item["close"]),
                        "volume": int(item["volume"]),
                        "amount": float(item.get("amount", 0))
                    }
                    history.append(history_point)
                except (KeyError, ValueError) as e:
                    continue  # Skip invalid data points

            return history

        except Exception as e:
            raise DataSourceError(f"Failed to get Sina history for {symbol}: {str(e)}")

    async def get_stock_info(self, symbol: str) -> Dict[str, Any]:
        """
        Get stock information from Sina Finance.

        Args:
            symbol: Stock symbol

        Returns:
            Dictionary with stock information
        """
        # For now, return basic info from quote
        try:
            quote = await self.get_stock_quote(symbol)
            return {
                "symbol": symbol,
                "name": quote.get("name", ""),
                "exchange": "SH" if symbol.endswith(".SH") else "SZ",
                "market_cap": None,  # Sina doesn't provide this in real-time
                "pe_ratio": None,
                "pb_ratio": None,
                "dividend_yield": None,
                "listing_date": None
            }
        except Exception as e:
            raise DataSourceError(f"Failed to get Sina info for {symbol}: {str(e)}")

    async def get_batch_quotes(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Get real-time quotes for multiple stocks.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to quote data
        """
        # Convert symbols to Sina format
        sina_symbols = []
        symbol_map = {}
        for symbol in symbols:
            market, code = self._parse_symbol(symbol)
            sina_symbol = f"{market.lower()}{code}"
            sina_symbols.append(sina_symbol)
            symbol_map[sina_symbol] = symbol

        # Sina supports batch queries with comma-separated symbols
        url = f"{self.base_url}/list={','.join(sina_symbols)}"
        headers = {
            "Referer": "http://finance.sina.com.cn",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

        try:
            response = await self._make_request(url, headers=headers)
            text = response.get("text", "")

            if not text:
                raise DataSourceError("Empty response from Sina")

            # Parse batch response
            quotes = {}
            lines = text.strip().split("\n")

            for line in lines:
                if not line:
                    continue

                # Parse each line: var hq_str_sz000001="平安银行,16.85,...";
                match = re.search(r'var hq_str_(\w+)=["\'](.*?)["\'];', line)
                if not match:
                    continue

                sina_symbol = match.group(1)
                data_str = match.group(2)

                if sina_symbol not in symbol_map:
                    continue

                symbol = symbol_map[sina_symbol]
                fields = data_str.split(",")

                if len(fields) < 32:
                    continue

                try:
                    quote = {
                        "symbol": symbol,
                        "name": fields[0],
                        "open": float(fields[1]) if fields[1] else 0.0,
                        "prev_close": float(fields[2]) if fields[2] else 0.0,
                        "price": float(fields[3]) if fields[3] else 0.0,
                        "high": float(fields[4]) if fields[4] else 0.0,
                        "low": float(fields[5]) if fields[5] else 0.0,
                        "volume": int(fields[8]) if fields[8] else 0,
                        "amount": float(fields[9]) if fields[9] else 0.0,
                        "timestamp": datetime.now()
                    }

                    if quote["prev_close"] > 0:
                        quote["change"] = quote["price"] - quote["prev_close"]
                        quote["change_percent"] = (quote["change"] / quote["prev_close"]) * 100
                    else:
                        quote["change"] = 0.0
                        quote["change_percent"] = 0.0

                    quotes[symbol] = quote
                except (ValueError, IndexError):
                    continue  # Skip invalid quotes

            return quotes

        except Exception as e:
            raise DataSourceError(f"Failed to get batch quotes from Sina: {str(e)}")

    def _parse_symbol(self, symbol: str) -> tuple[str, str]:
        """
        Parse stock symbol into market and code.

        Args:
            symbol: Stock symbol in format "000001.SZ" or "600036.SH"

        Returns:
            Tuple of (market, code)
        """
        # Clean the symbol
        symbol = symbol.strip()
        if not symbol:
            raise ValueError("Empty symbol")

        if "." in symbol:
            # Split by dots
            parts = symbol.split(".")

            # Remove empty parts
            parts = [p for p in parts if p]

            if not parts:
                raise ValueError(f"Invalid symbol format: {symbol}")

            # Try to find SZ or SH in the parts (case-insensitive)
            market_idx = -1
            for i, part in enumerate(parts):
                if part.upper() in ["SZ", "SH"]:
                    market_idx = i
                    break

            if market_idx >= 0:
                # Found market code
                market = parts[market_idx].upper()
                # Code is all parts before the market code (joined with dot if needed)
                code_parts = parts[:market_idx]
                code = ".".join(code_parts) if code_parts else ""

                # If no code (e.g., ".SZ"), try to get it from context
                if not code:
                    # This is an invalid format, but we'll use a default
                    code = "000001" if market == "SZ" else "600036"

                return market, code
            else:
                # No market code found, use heuristic
                # Join all parts as code
                code = "".join(parts)
                # Determine market based on first character
                if code and code[0] == '6':
                    return "SH", code
                else:
                    return "SZ", code
        else:
            # No dots, use heuristic
            if symbol.startswith("6"):
                return "SH", symbol
            else:
                return "SZ", symbol