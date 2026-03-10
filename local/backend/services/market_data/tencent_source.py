"""
Tencent Finance Data Source - Real-time market data from Tencent Finance

API endpoints:
- http://qt.gtimg.cn/q=sh600000,sz000001
- Returns pipe-separated stock data
"""
import asyncio
import aiohttp
from datetime import datetime
from typing import Optional, List, Dict, Any

from .base import DataSource, Quote, DataSourceHealth, DataSourceStatus


class TencentDataSource(DataSource):
    """
    Tencent Finance real-time data source

    Provides A-share market data via Tencent Finance API.
    Fast and stable, good as primary source.

    Usage:
        source = TencentDataSource()
        quote = await source.get_quote("sh600000")
    """

    BASE_URL = "http://qt.gtimg.cn"

    def __init__(self, name: str = "tencent", priority: int = 40):
        """
        Initialize Tencent data source

        Args:
            name: Source identifier
            priority: Data source priority (lower = higher priority)
        """
        super().__init__(name=name, priority=priority)
        self._session: Optional[aiohttp.ClientSession] = None

    def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session"""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "Referer": "http://stock.qq.com",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            )
        return self._session

    def _normalize_symbol(self, symbol: str) -> str:
        """
        Normalize symbol to Tencent format

        Args:
            symbol: Stock symbol (e.g., "600000.SH", "000001.SZ")

        Returns:
            Tencent format symbol (e.g., "sh600000", "sz000001")
        """
        symbol = symbol.upper()

        if symbol.startswith("SH"):
            return f"sh{symbol[2:]}"
        elif symbol.startswith("SZ"):
            return f"sz{symbol[2:]}"
        elif ".SH" in symbol:
            return f"sh{symbol.split('.')[0]}"
        elif ".SZ" in symbol:
            return f"sz{symbol.split('.')[0]}"
        elif symbol.startswith("60") or symbol.startswith("68"):
            return f"sh{symbol}"
        elif symbol.startswith("00") or symbol.startswith("30"):
            return f"sz{symbol}"

        return symbol

    def _parse_tencent_data(self, symbol: str, data: str) -> Optional[Quote]:
        """
        Parse Tencent response data

        Tencent format (pipe-separated):
        v_sh600000="1~浦发银行~600000~9.85~9.70~9.80~1234567~9876543...";

        Fields:
        0: ?, 1: name, 2: code, 3: price, 4: prev_close, 5: open,
        6: volume, 7: amount, ...
        """
        try:
            var_name = f"v_{self._normalize_symbol(symbol)}"
            if var_name not in data:
                return None

            # Extract value
            start = data.find('"') + 1
            end = data.rfind('"')
            if start <= 0 or end <= start:
                return None

            values = data[start:end].split("~")
            if len(values) < 45:
                return None

            name = values[1]
            price = float(values[3])
            prev_close = float(values[4])
            open_price = float(values[5])
            volume = int(values[6])
            high = float(values[33])
            low = float(values[34])

            change = price - prev_close
            change_percent = (change / prev_close) * 100 if prev_close > 0 else 0

            return Quote(
                symbol=symbol.upper(),
                name=name,
                price=price,
                change=round(change, 2),
                change_percent=round(change_percent, 2),
                volume=volume,
                open=open_price,
                high=high,
                low=low,
                prev_close=prev_close,
                timestamp=datetime.utcnow(),
                source=self.name
            )

        except (IndexError, ValueError) as e:
            print(f"[TencentDataSource] Parse error for {symbol}: {e}")
            return None

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """Get real-time quote for a single stock"""
        tencent_symbol = self._normalize_symbol(symbol)

        try:
            session = self._get_session()
            url = f"{self.BASE_URL}/q={tencent_symbol}"

            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status != 200:
                    return None

                data = await resp.text()
                return self._parse_tencent_data(symbol, data)

        except asyncio.TimeoutError:
            print(f"[TencentDataSource] Timeout for {symbol}")
            return None
        except Exception as e:
            print(f"[TencentDataSource] Error fetching {symbol}: {e}")
            return None

    async def get_quotes(self, symbols: List[str]) -> Dict[str, Optional[Quote]]:
        """Get real-time quotes for multiple stocks"""
        if not symbols:
            return {}

        tencent_symbols = [self._normalize_symbol(s) for s in symbols]

        try:
            session = self._get_session()
            url = f"{self.BASE_URL}/q={','.join(tencent_symbols)}"

            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return {s: None for s in symbols}

                data = await resp.text()

                results: Dict[str, Optional[Quote]] = {}
                for symbol in symbols:
                    tencent_sym = self._normalize_symbol(symbol)
                    pattern = f'v_{tencent_sym}="'

                    start = data.find(pattern)
                    if start >= 0:
                        end = data.find('";', start)
                        if end > start:
                            quote_data = data[start:end + 2]
                            results[symbol] = self._parse_tencent_data(symbol, quote_data)
                        else:
                            results[symbol] = None
                    else:
                        results[symbol] = None

                return results

        except asyncio.TimeoutError:
            print(f"[TencentDataSource] Timeout for batch request")
            return {s: None for s in symbols}
        except Exception as e:
            print(f"[TencentDataSource] Error in batch fetch: {e}")
            return {s: None for s in symbols}

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
            url = f"{self.BASE_URL}/q=sh600000"

            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                latency_ms = (time.time() - start_time) * 1000

                if resp.status == 200:
                    data = await resp.text()
                    if "浦发银行" in data or len(data) > 50:
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
            print(f"[TencentDataSource] Health check error: {e}")
            self._update_health(DataSourceStatus.UNAVAILABLE, latency_ms, False)

        return self._health

    async def close(self):
        """Close the HTTP session"""
        if self._session and not self._session.closed:
            await self._session.close()
