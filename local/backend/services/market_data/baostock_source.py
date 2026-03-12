"""
Baostock Data Source - Fundamental data from Baostock

Baostock provides:
- Stock basic information
- Financial indicators (PE, PB, etc.)
- Profit and balance sheet data
- Daily K-line data

Note: Baostock is better suited for end-of-day data collection
as it updates after market close.
"""
import asyncio
import baostock as bs
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from concurrent.futures import ThreadPoolExecutor

from .base import DataSource, Quote, DataSourceHealth, DataSourceStatus


class BaostockDataSource(DataSource):
    """
    Baostock data source for fundamental and historical data

    Provides A-share fundamental data via Baostock library.
    Best suited for daily end-of-day data collection.
    Priority: 80 (lowest among all sources, used as fallback)

    Usage:
        source = BaostockDataSource()
        await source.login()  # Must login first
        quote = await source.get_quote("000001.SZ")
        fundamentals = await source.get_fundamentals("000001.SZ")
    """

    def __init__(self, name: str = "baostock", priority: int = 80):
        """
        Initialize Baostock data source

        Args:
            name: Source identifier
            priority: Data source priority (higher = lower priority)
        """
        super().__init__(name=name, priority=priority)
        self._executor = ThreadPoolExecutor(max_workers=2)
        self._logged_in = False
        self._stock_list_cache: Optional[List[Dict]] = None
        self._stock_list_cache_time: Optional[datetime] = None
        self._cache_ttl = timedelta(hours=6)  # Baostock data updates daily

    def _run_in_thread(self, func, *args, **kwargs):
        """Run synchronous Baostock function in thread pool"""
        loop = asyncio.get_event_loop()
        return loop.run_in_executor(self._executor, lambda: func(*args, **kwargs))

    async def login(self) -> bool:
        """
        Login to Baostock

        Must be called before using other methods.
        Returns True if login successful.
        """
        try:
            result = await self._run_in_thread(bs.login)
            if result.error_code == "0":
                self._logged_in = True
                print(f"[BaostockDataSource] Login successful")
                return True
            else:
                print(f"[BaostockDataSource] Login failed: {result.error_msg}")
                return False
        except Exception as e:
            print(f"[BaostockDataSource] Login error: {e}")
            return False

    async def logout(self):
        """Logout from Baostock"""
        if self._logged_in:
            try:
                await self._run_in_thread(bs.logout)
            except Exception as e:
                print(f"[BaostockDataSource] Logout error: {e}")
            finally:
                self._logged_in = False

    def _normalize_symbol(self, symbol: str) -> str:
        """
        Normalize symbol to Baostock format

        Args:
            symbol: Stock symbol (e.g., "600000.SH", "000001.SZ")

        Returns:
            Baostock format symbol (e.g., "sh.600000", "sz.000001")
        """
        symbol = symbol.upper()

        if symbol.startswith("SH"):
            return f"sh.{symbol[2:]}"
        elif symbol.startswith("SZ"):
            return f"sz.{symbol[2:]}"
        elif ".SH" in symbol:
            return f"sh.{symbol.split('.')[0]}"
        elif ".SZ" in symbol:
            return f"sz.{symbol.split('.')[0]}"
        elif symbol.startswith("60") or symbol.startswith("68"):
            return f"sh.{symbol}"
        elif symbol.startswith("00") or symbol.startswith("30"):
            return f"sz.{symbol}"

        return symbol

    def _to_standard_symbol(self, baostock_symbol: str) -> str:
        """Convert Baostock symbol to standard format"""
        parts = baostock_symbol.split(".")
        if len(parts) == 2:
            return f"{parts[1]}.{parts[0].upper()}"
        return baostock_symbol

    async def _ensure_login(self):
        """Ensure logged in before operations"""
        if not self._logged_in:
            await self.login()

    async def get_stock_list(self) -> List[Dict]:
        """
        Get all A-share stock list with basic info

        Returns:
            List of stock info dicts with symbol, name, industry, etc.
        """
        await self._ensure_login()

        if (self._stock_list_cache is not None and
            self._stock_list_cache_time is not None and
            datetime.utcnow() - self._stock_list_cache_time < self._cache_ttl):
            return self._stock_list_cache

        try:
            stocks = []
            page_num = 1
            page_size = 1000

            while True:
                result = await self._run_in_thread(
                    bs.query_all_stock,
                    day=datetime.now().strftime("%Y-%m-%d")
                )

                if result.error_code != "0":
                    print(f"[BaostockDataSource] Error fetching stock list: {result.error_msg}")
                    break

                while (result.error_code == "0") and result.next():
                    row_data = result.get_row_data()
                    if len(row_data) >= 3:
                        bs_symbol = row_data[0]
                        code_name = row_data[1]
                        stocks.append({
                            "symbol": self._to_standard_symbol(bs_symbol),
                            "name": code_name,
                        })

                # Baostock returns all at once, no pagination needed
                break

            self._stock_list_cache = stocks
            self._stock_list_cache_time = datetime.utcnow()
            print(f"[BaostockDataSource] Loaded {len(stocks)} stocks")
            return stocks

        except Exception as e:
            print(f"[BaostockDataSource] Error fetching stock list: {e}")
            return []

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """
        Get latest quote for a single stock

        Note: Baostock provides daily data, not real-time.
        For real-time quotes, use other sources.
        """
        await self._ensure_login()

        try:
            bs_symbol = self._normalize_symbol(symbol)
            today = datetime.now().strftime("%Y-%m-%d")

            result = await self._run_in_thread(
                bs.query_history_k_data_plus,
                code=bs_symbol,
                fields="date,open,high,low,close,preclose,volume,amount",
                start_date=today,
                end_date=today,
                frequency="d"
            )

            if result.error_code != "0":
                print(f"[BaostockDataSource] Error fetching quote: {result.error_msg}")
                return None

            while result.next():
                row = result.get_row_data()
                if len(row) >= 8:
                    price = float(row[4]) if row[4] else 0
                    prev_close = float(row[6]) if row[6] else 0
                    change = price - prev_close if price and prev_close else 0
                    change_percent = (change / prev_close) * 100 if prev_close else 0

                    # Get stock name from cache or stock list
                    stock_name = symbol
                    stocks = await self.get_stock_list()
                    for s in stocks:
                        if s["symbol"] == symbol.upper():
                            stock_name = s["name"]
                            break

                    return Quote(
                        symbol=symbol.upper(),
                        name=stock_name,
                        price=round(price, 2),
                        change=round(change, 2),
                        change_percent=round(change_percent, 2),
                        volume=int(float(row[5])) if row[5] else 0,
                        amount=float(row[7]) if row[7] else None,
                        open=float(row[1]) if row[1] else None,
                        high=float(row[2]) if row[2] else None,
                        low=float(row[3]) if row[3] else None,
                        prev_close=round(prev_close, 2) if prev_close else None,
                        timestamp=datetime.utcnow(),
                        source=self.name
                    )

            return None

        except Exception as e:
            print(f"[BaostockDataSource] Error fetching quote for {symbol}: {e}")
            return None

    async def get_quotes(self, symbols: List[str]) -> Dict[str, Optional[Quote]]:
        """
        Get quotes for multiple stocks

        Note: Baostock doesn't support batch queries efficiently,
        so we fetch sequentially.
        """
        results: Dict[str, Optional[Quote]] = {}
        for symbol in symbols:
            results[symbol] = await self.get_quote(symbol)
        return results

    async def get_all_stocks(self) -> List[Quote]:
        """
        Get all stock quotes

        Note: This can be slow as Baostock requires individual queries.
        Consider using other sources for real-time data.
        """
        stocks = await self.get_stock_list()
        # Limit to avoid overwhelming the API
        popular_codes = [
            "600000.SH", "600036.SH", "600519.SH",
            "000001.SZ", "000002.SZ", "000858.SZ",
            "002415.SZ", "002594.SZ",
            "300059.SZ", "300750.SZ"
        ]

        results = await self.get_quotes(popular_codes)
        return [q for q in results.values() if q is not None]

    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Get fundamental data for a stock

        Returns:
            Dict with PE, PB, PS, PCF, and other valuation metrics
        """
        await self._ensure_login()

        try:
            bs_symbol = self._normalize_symbol(symbol)

            # Query valuation metrics
            result = await self._run_in_thread(
                bs.query_history_k_data_plus,
                code=bs_symbol,
                fields="date,peTTM,pbMRQ,psTTM,pcfNcfTTM",
                start_date=datetime.now().strftime("%Y-%m-%d"),
                end_date=datetime.now().strftime("%Y-%m-%d"),
                frequency="d"
            )

            if result.error_code != "0":
                print(f"[BaostockDataSource] Error fetching fundamentals: {result.error_msg}")
                return None

            while result.next():
                row = result.get_row_data()
                if len(row) >= 5:
                    return {
                        "symbol": symbol.upper(),
                        "date": row[0],
                        "pe_ttm": float(row[1]) if row[1] else None,
                        "pb_mrq": float(row[2]) if row[2] else None,
                        "ps_ttm": float(row[3]) if row[3] else None,
                        "pcf_ncf_ttm": float(row[4]) if row[4] else None,
                    }

            return None

        except Exception as e:
            print(f"[BaostockDataSource] Error fetching fundamentals for {symbol}: {e}")
            return None

    async def get_profit_data(self, symbol: str, year: int, quarter: int) -> Optional[Dict[str, Any]]:
        """
        Get profit data for a specific quarter

        Args:
            symbol: Stock symbol
            year: Year (e.g., 2023)
            quarter: Quarter (1-4)
        """
        await self._ensure_login()

        try:
            bs_symbol = self._normalize_symbol(symbol)

            result = await self._run_in_thread(
                bs.query_profit_data,
                code=bs_symbol,
                year=year,
                quarter=quarter
            )

            if result.error_code != "0":
                print(f"[BaostockDataSource] Error fetching profit data: {result.error_msg}")
                return None

            while result.next():
                row = result.get_row_data()
                if len(row) >= 10:
                    return {
                        "symbol": symbol.upper(),
                        "year": year,
                        "quarter": quarter,
                        "net_profit": float(row[3]) if row[3] else None,
                        "net_profit_yoy": float(row[4]) if row[4] else None,
                        "total_profit": float(row[5]) if row[5] else None,
                        "total_profit_yoy": float(row[6]) if row[6] else None,
                        "revenue": float(row[7]) if row[7] else None,
                        "revenue_yoy": float(row[8]) if row[8] else None,
                    }

            return None

        except Exception as e:
            print(f"[BaostockDataSource] Error fetching profit data for {symbol}: {e}")
            return None

    async def get_historical_data(
        self,
        symbol: str,
        days: int = 30,
        frequency: str = "d"
    ) -> List[Dict[str, Any]]:
        """
        Get historical K-line data

        Args:
            symbol: Stock symbol
            days: Number of days to fetch
            frequency: "d" (daily), "w" (weekly), "m" (monthly)
        """
        await self._ensure_login()

        try:
            bs_symbol = self._normalize_symbol(symbol)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            result = await self._run_in_thread(
                bs.query_history_k_data_plus,
                code=bs_symbol,
                fields="date,open,high,low,close,preclose,volume,amount",
                start_date=start_date.strftime("%Y-%m-%d"),
                end_date=end_date.strftime("%Y-%m-%d"),
                frequency=frequency
            )

            if result.error_code != "0":
                print(f"[BaostockDataSource] Error fetching historical data: {result.error_msg}")
                return []

            data = []
            while result.next():
                row = result.get_row_data()
                if len(row) >= 8:
                    data.append({
                        "date": row[0],
                        "open": float(row[1]) if row[1] else 0,
                        "high": float(row[2]) if row[2] else 0,
                        "low": float(row[3]) if row[3] else 0,
                        "close": float(row[4]) if row[4] else 0,
                        "prev_close": float(row[5]) if row[5] else 0,
                        "volume": int(float(row[6])) if row[6] else 0,
                        "amount": float(row[7]) if row[7] else 0,
                    })

            return data

        except Exception as e:
            print(f"[BaostockDataSource] Error fetching historical data for {symbol}: {e}")
            return []

    async def health_check(self) -> DataSourceHealth:
        """Check data source health"""
        import time
        start_time = time.time()

        try:
            await self._ensure_login()

            # Test by querying a known stock
            result = await self._run_in_thread(
                bs.query_history_k_data_plus,
                code="sh.600000",
                fields="date,close",
                start_date=datetime.now().strftime("%Y-%m-%d"),
                end_date=datetime.now().strftime("%Y-%m-%d"),
                frequency="d"
            )

            latency_ms = (time.time() - start_time) * 1000

            if result.error_code == "0":
                self._update_health(DataSourceStatus.HEALTHY, latency_ms, True)
            else:
                self._update_health(DataSourceStatus.DEGRADED, latency_ms, False)

        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            print(f"[BaostockDataSource] Health check error: {e}")
            self._update_health(DataSourceStatus.UNAVAILABLE, latency_ms, False)

        return self._health

    async def close(self):
        """Close resources"""
        await self.logout()
        self._executor.shutdown(wait=False)
