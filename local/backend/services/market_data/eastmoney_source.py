"""
East Money Data Source - Real-time market data from East Money

API endpoints:
- http://push2.eastmoney.com/api/qt/stock/get?secid=1.600000
- Returns JSON stock data

East Money provides comprehensive market data with good reliability.
"""
import asyncio
import aiohttp
import json
from datetime import datetime
from typing import Optional, List, Dict, Any

from .base import DataSource, Quote, DataSourceHealth, DataSourceStatus


class EastMoneyDataSource(DataSource):
    """
    East Money real-time data source

    Provides A-share market data via East Money API.
    Comprehensive data with good reliability.

    Usage:
        source = EastMoneyDataSource()
        quote = await source.get_quote("600000.SH")
    """

    BASE_URL = "http://push2.eastmoney.com/api/qt/stock/get"

    def __init__(self, name: str = "eastmoney", priority: int = 60):
        super().__init__(name=name, priority=priority)
        self._session: Optional[aiohttp.ClientSession] = None

    def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "Referer": "http://quote.eastmoney.com",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            )
        return self._session

    def _normalize_symbol(self, symbol: str) -> tuple[str, str]:
        """
        Normalize symbol to East Money format

        Returns:
            Tuple of (secid, original_symbol)
            secid format: "1.600000" for Shanghai, "0.000001" for Shenzhen
        """
        symbol = symbol.upper()

        # Extract code
        if ".SH" in symbol:
            code = symbol.split('.')[0]
            return f"1.{code}", symbol
        elif ".SZ" in symbol:
            code = symbol.split('.')[0]
            return f"0.{code}", symbol
        elif symbol.startswith("SH"):
            return f"1.{symbol[2:]}", symbol
        elif symbol.startswith("SZ"):
            return f"0.{symbol[2:]}", symbol
        elif symbol.startswith("60") or symbol.startswith("68"):
            return f"1.{symbol}", f"{symbol}.SH"
        elif symbol.startswith("00") or symbol.startswith("30"):
            return f"0.{symbol}", f"{symbol}.SZ"

        return f"0.{symbol}", symbol

    def _parse_eastmoney_data(self, symbol: str, data: Dict) -> Optional[Quote]:
        """Parse East Money JSON response"""
        try:
            if "data" not in data or not data["data"]:
                return None

            d = data["data"]

            name = d.get("f58", "")
            price = float(d.get("f43", 0)) / 100  # Price is in cents
            prev_close = float(d.get("f60", 0)) / 100
            open_price = float(d.get("f46", 0)) / 100
            high = float(d.get("f44", 0)) / 100
            low = float(d.get("f45", 0)) / 100
            volume = int(d.get("f47", 0))

            change = price - prev_close
            change_percent = (change / prev_close) * 100 if prev_close > 0 else 0

            return Quote(
                symbol=symbol.upper(),
                name=name,
                price=round(price, 2),
                change=round(change, 2),
                change_percent=round(change_percent, 2),
                volume=volume,
                open=round(open_price, 2),
                high=round(high, 2),
                low=round(low, 2),
                prev_close=round(prev_close, 2),
                timestamp=datetime.utcnow(),
                source=self.name
            )

        except (KeyError, ValueError, TypeError) as e:
            print(f"[EastMoneyDataSource] Parse error for {symbol}: {e}")
            return None

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """Get real-time quote for a single stock"""
        secid, orig_symbol = self._normalize_symbol(symbol)

        try:
            session = self._get_session()
            params = {
                "secid": secid,
                "fields": "f58,f43,f57,f60,f46,f44,f45,f47,f48,f170"
            }

            async with session.get(self.BASE_URL, params=params,
                                   timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status != 200:
                    return None

                data = await resp.json()
                return self._parse_eastmoney_data(orig_symbol, data)

        except asyncio.TimeoutError:
            print(f"[EastMoneyDataSource] Timeout for {symbol}")
            return None
        except Exception as e:
            print(f"[EastMoneyDataSource] Error fetching {symbol}: {e}")
            return None

    async def get_quotes(self, symbols: List[str]) -> Dict[str, Optional[Quote]]:
        """Get real-time quotes for multiple stocks (sequential)"""
        results: Dict[str, Optional[Quote]] = {}
        for symbol in symbols:
            results[symbol] = await self.get_quote(symbol)
        return results

    async def get_all_stocks(self) -> List[Quote]:
        """Get quotes for popular stocks"""
        popular_stocks = [
            "600000.SH", "600036.SH", "600519.SH",
            "000001.SZ", "000002.SZ", "000858.SZ",
            "002415.SZ", "002594.SZ",
            "300059.SZ", "300750.SZ"
        ]

        results = await self.get_quotes(popular_stocks)
        return [q for q in results.values() if q is not None]

    async def health_check(self) -> DataSourceHealth:
        """Check data source health"""
        import time
        start_time = time.time()

        try:
            session = self._get_session()
            params = {"secid": "1.600000", "fields": "f58"}

            async with session.get(self.BASE_URL, params=params,
                                   timeout=aiohttp.ClientTimeout(total=5)) as resp:
                latency_ms = (time.time() - start_time) * 1000

                if resp.status == 200:
                    data = await resp.json()
                    if data.get("data"):
                        self._update_health(DataSourceStatus.HEALTHY, latency_ms, True)
                    else:
                        self._update_health(DataSourceStatus.DEGRADED, latency_ms, False)
                else:
                    self._update_health(DataSourceStatus.UNAVAILABLE, latency_ms, False)

        except asyncio.TimeoutError:
            latency_ms = (time.time() - start_time) * 1000
            self._update_health(DataSourceStatus.UNAVAILABLE, latency_ms, False)
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            print(f"[EastMoneyDataSource] Health check error: {e}")
            self._update_health(DataSourceStatus.UNAVAILABLE, latency_ms, False)

        return self._health

    async def close(self):
        """Close the HTTP session"""
        if self._session and not self._session.closed:
            await self._session.close()
