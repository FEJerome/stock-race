"""
Sina Finance Data Source - Real-time market data from Sina Finance

API endpoints:
- http://hq.sinajs.cn/list=sh600000,sz000001
- Returns JavaScript variable with stock data
"""
import asyncio
import aiohttp
from datetime import datetime
from typing import Optional, List, Dict, Any

from .base import DataSource, Quote, DataSourceHealth, DataSourceStatus


class SinaDataSource(DataSource):
    """
    Sina Finance real-time data source

    Provides A-share market data via Sina Finance API.
    Supports Shanghai (sh) and Shenzhen (sz) exchanges.

    Usage:
        source = SinaDataSource()
        quote = await source.get_quote("sh600000")
    """

    BASE_URL = "http://hq.sinajs.cn"

    def __init__(self, name: str = "sina", priority: int = 50):
        """
        Initialize Sina data source

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
                    "Referer": "http://finance.sina.com.cn",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            )
        return self._session

    def _normalize_symbol(self, symbol: str) -> str:
        """
        Normalize symbol to Sina format

        Args:
            symbol: Stock symbol (e.g., "600000.SH", "000001.SZ")

        Returns:
            Sina format symbol (e.g., "sh600000", "sz000001")
        """
        symbol = symbol.upper()

        # Handle various formats
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

    def _parse_sina_data(self, symbol: str, data: str) -> Optional[Quote]:
        """
        Parse Sina response data

        Sina format:
        var hq_str_sh600000="浦发银行,9.850,9.700,9.850,10.000,9.680,9.850,9.860,9876543,97283929...";

        Fields:
        0: name, 1: open, 2: prev_close, 3: price, 4: high, 5: low,
        6: buy_price, 7: sell_price, 8: volume, 9: amount
        """
        try:
            # Extract data from JavaScript variable
            var_name = f"hq_str_{self._normalize_symbol(symbol)}"
            if var_name not in data:
                return None

            # Parse the value
            start = data.find('"') + 1
            end = data.rfind('"')
            if start <= 0 or end <= start:
                return None

            values = data[start:end].split(",")
            if len(values) < 10:
                return None

            name = values[0]
            open_price = float(values[1])
            prev_close = float(values[2])
            price = float(values[3])
            high = float(values[4])
            low = float(values[5])
            volume = int(values[8])

            change = price - prev_close
            change_percent = (change / prev_close) * 100 if prev_close > 0 else 0

            return Quote(
                symbol=symbol.upper(),
                name=name,
                price=price,
                change=change,
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
            print(f"[SinaDataSource] Parse error for {symbol}: {e}")
            return None

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """Get real-time quote for a single stock"""
        sina_symbol = self._normalize_symbol(symbol)

        try:
            session = self._get_session()
            url = f"{self.BASE_URL}/list={sina_symbol}"

            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status != 200:
                    return None

                data = await resp.text()
                return self._parse_sina_data(symbol, data)

        except asyncio.TimeoutError:
            print(f"[SinaDataSource] Timeout for {symbol}")
            return None
        except Exception as e:
            print(f"[SinaDataSource] Error fetching {symbol}: {e}")
            return None

    async def get_quotes(self, symbols: List[str]) -> Dict[str, Optional[Quote]]:
        """Get real-time quotes for multiple stocks"""
        if not symbols:
            return {}

        # Batch request (Sina supports multiple symbols)
        sina_symbols = [self._normalize_symbol(s) for s in symbols]
        symbol_map = {self._normalize_symbol(s): s for s in symbols}

        try:
            session = self._get_session()
            url = f"{self.BASE_URL}/list={','.join(sina_symbols)}"

            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return {s: None for s in symbols}

                data = await resp.text()

                # Parse each symbol
                results: Dict[str, Optional[Quote]] = {}
                for orig_symbol in symbols:
                    # Find the corresponding data in response
                    sina_sym = self._normalize_symbol(orig_symbol)
                    pattern = f'var hq_str_{sina_sym}="'
                    if pattern in data:
                        start = data.find(pattern)
                        end = data.find('";', start)
                        if end > start:
                            quote_data = data[start:end + 2]
                            results[orig_symbol] = self._parse_sina_data(orig_symbol, quote_data)
                        else:
                            results[orig_symbol] = None
                    else:
                        results[orig_symbol] = None

                return results

        except asyncio.TimeoutError:
            print(f"[SinaDataSource] Timeout for batch request")
            return {s: None for s in symbols}
        except Exception as e:
            print(f"[SinaDataSource] Error in batch fetch: {e}")
            return {s: None for s in symbols}

    async def get_all_stocks(self) -> List[Quote]:
        """
        Get quotes for popular stocks

        Note: Sina doesn't provide all stocks in one request.
        We fetch a predefined list of popular stocks.
        """
        popular_stocks = [
            "600000.SH", "600036.SH", "600519.SH",  # Shanghai
            "000001.SZ", "000002.SZ", "000858.SZ",  # Shenzhen
            "002415.SZ", "002594.SZ",               # SME
            "300059.SZ", "300750.SZ"                # ChiNext
        ]

        results = await self.get_quotes(popular_stocks)
        return [q for q in results.values() if q is not None]

    async def health_check(self) -> DataSourceHealth:
        """Check data source health"""
        import time
        start_time = time.time()

        # Test with a known stock
        test_symbol = "sh600000"
        try:
            session = self._get_session()
            url = f"{self.BASE_URL}/list={test_symbol}"

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
            print(f"[SinaDataSource] Health check error: {e}")
            self._update_health(DataSourceStatus.UNAVAILABLE, latency_ms, False)

        return self._health

    async def close(self):
        """Close the HTTP session"""
        if self._session and not self._session.closed:
            await self._session.close()
