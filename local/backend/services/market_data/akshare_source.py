"""
AkShare Data Source - Historical and real-time market data from AkShare

AkShare is a popular Chinese financial data library that provides:
- Historical K-line data
- Real-time quotes
- Stock list and basic information

Note: AkShare uses synchronous HTTP requests, so we run them in thread pool.
"""
import asyncio
import akshare as ak
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from concurrent.futures import ThreadPoolExecutor

from .base import DataSource, Quote, DataSourceHealth, DataSourceStatus


class AkShareDataSource(DataSource):
    """
    AkShare data source for historical and real-time market data

    Provides A-share market data via AkShare library.
    Best suited for historical data and batch operations.
    Priority: 70 (lower than real-time sources)

    Usage:
        source = AkShareDataSource()
        quote = await source.get_quote("000001.SZ")
        # Or get historical data
        hist = await source.get_historical_data("000001.SZ", period="1min", days=7)
    """

    def __init__(self, name: str = "akshare", priority: int = 70):
        """
        Initialize AkShare data source

        Args:
            name: Source identifier
            priority: Data source priority (higher = lower priority for real-time)
        """
        super().__init__(name=name, priority=priority)
        self._executor = ThreadPoolExecutor(max_workers=4)
        self._stock_list_cache: Optional[List[Dict]] = None
        self._stock_list_cache_time: Optional[datetime] = None
        self._cache_ttl = timedelta(hours=1)

    def _normalize_symbol(self, symbol: str) -> str:
        """
        Normalize symbol to AkShare format

        Args:
            symbol: Stock symbol (e.g., "600000.SH", "000001.SZ")

        Returns:
            AkShare format symbol (e.g., "sh600000", "sz000001")
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

    def _to_standard_symbol(self, akshare_symbol: str) -> str:
        """Convert AkShare symbol to standard format"""
        akshare_symbol = akshare_symbol.lower()
        if akshare_symbol.startswith("sh"):
            return f"{akshare_symbol[2:]}.SH"
        elif akshare_symbol.startswith("sz"):
            return f"{akshare_symbol[2:]}.SZ"
        return akshare_symbol

    def _run_in_thread(self, func, *args, **kwargs):
        """Run synchronous AkShare function in thread pool"""
        loop = asyncio.get_event_loop()
        return loop.run_in_executor(self._executor, lambda: func(*args, **kwargs))

    async def _get_stock_list(self) -> List[Dict]:
        """Get stock list with caching"""
        if (self._stock_list_cache is not None and
            self._stock_list_cache_time is not None and
            datetime.utcnow() - self._stock_list_cache_time < self._cache_ttl):
            return self._stock_list_cache

        try:
            # Get Shanghai stocks
            sh_df = await self._run_in_thread(ak.stock_sh_a_spot_em)
            sh_stocks = []
            if sh_df is not None and not sh_df.empty:
                for _, row in sh_df.iterrows():
                    sh_stocks.append({
                        "symbol": f"{row['代码']}.SH",
                        "name": row["名称"],
                        "price": float(row.get("最新价", 0)) if pd_notna(row.get("最新价")) else 0,
                        "change": float(row.get("涨跌额", 0)) if pd_notna(row.get("涨跌额")) else 0,
                        "change_percent": float(row.get("涨跌幅", 0)) if pd_notna(row.get("涨跌幅")) else 0,
                        "volume": int(row.get("成交量", 0)) if pd_notna(row.get("成交量")) else 0,
                        "amount": float(row.get("成交额", 0)) if pd_notna(row.get("成交额")) else 0,
                        "open": float(row.get("开盘价", 0)) if pd_notna(row.get("开盘价")) else 0,
                        "high": float(row.get("最高价", 0)) if pd_notna(row.get("最高价")) else 0,
                        "low": float(row.get("最低价", 0)) if pd_notna(row.get("最低价")) else 0,
                        "prev_close": float(row.get("昨收", 0)) if pd_notna(row.get("昨收")) else 0,
                    })

            # Get Shenzhen stocks
            sz_df = await self._run_in_thread(ak.stock_sz_a_spot_em)
            sz_stocks = []
            if sz_df is not None and not sz_df.empty:
                for _, row in sz_df.iterrows():
                    sz_stocks.append({
                        "symbol": f"{row['代码']}.SZ",
                        "name": row["名称"],
                        "price": float(row.get("最新价", 0)) if pd_notna(row.get("最新价")) else 0,
                        "change": float(row.get("涨跌额", 0)) if pd_notna(row.get("涨跌额")) else 0,
                        "change_percent": float(row.get("涨跌幅", 0)) if pd_notna(row.get("涨跌幅")) else 0,
                        "volume": int(row.get("成交量", 0)) if pd_notna(row.get("成交量")) else 0,
                        "amount": float(row.get("成交额", 0)) if pd_notna(row.get("成交额")) else 0,
                        "open": float(row.get("开盘价", 0)) if pd_notna(row.get("开盘价")) else 0,
                        "high": float(row.get("最高价", 0)) if pd_notna(row.get("最高价")) else 0,
                        "low": float(row.get("最低价", 0)) if pd_notna(row.get("最低价")) else 0,
                        "prev_close": float(row.get("昨收", 0)) if pd_notna(row.get("昨收")) else 0,
                    })

            self._stock_list_cache = sh_stocks + sz_stocks
            self._stock_list_cache_time = datetime.utcnow()
            return self._stock_list_cache

        except Exception as e:
            print(f"[AkShareDataSource] Error fetching stock list: {e}")
            return []

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """
        Get real-time quote for a single stock

        Note: AkShare is better suited for batch operations.
        For single quotes, consider using real-time sources like Sina/Tencent.
        """
        try:
            stocks = await self._get_stock_list()
            symbol_upper = symbol.upper()

            for stock in stocks:
                if stock["symbol"] == symbol_upper:
                    return Quote(
                        symbol=stock["symbol"],
                        name=stock["name"],
                        price=stock["price"],
                        change=stock["change"],
                        change_percent=stock["change_percent"],
                        volume=stock["volume"],
                        amount=stock["amount"],
                        open=stock["open"],
                        high=stock["high"],
                        low=stock["low"],
                        prev_close=stock["prev_close"],
                        timestamp=datetime.utcnow(),
                        source=self.name
                    )

            return None

        except Exception as e:
            print(f"[AkShareDataSource] Error fetching quote for {symbol}: {e}")
            return None

    async def get_quotes(self, symbols: List[str]) -> Dict[str, Optional[Quote]]:
        """
        Get real-time quotes for multiple stocks

        This is more efficient than get_quote for multiple symbols
        as AkShare provides batch stock data.
        """
        try:
            stocks = await self._get_stock_list()
            symbol_set = set(s.upper() for s in symbols)
            results: Dict[str, Optional[Quote]] = {s: None for s in symbols}

            for stock in stocks:
                if stock["symbol"] in symbol_set:
                    quote = Quote(
                        symbol=stock["symbol"],
                        name=stock["name"],
                        price=stock["price"],
                        change=stock["change"],
                        change_percent=stock["change_percent"],
                        volume=stock["volume"],
                        amount=stock["amount"],
                        open=stock["open"],
                        high=stock["high"],
                        low=stock["low"],
                        prev_close=stock["prev_close"],
                        timestamp=datetime.utcnow(),
                        source=self.name
                    )
                    # Find original symbol case
                    for orig_symbol in symbols:
                        if orig_symbol.upper() == stock["symbol"]:
                            results[orig_symbol] = quote
                            break

            return results

        except Exception as e:
            print(f"[AkShareDataSource] Error fetching quotes: {e}")
            return {s: None for s in symbols}

    async def get_all_stocks(self) -> List[Quote]:
        """Get quotes for all available stocks"""
        try:
            stocks = await self._get_stock_list()
            return [
                Quote(
                    symbol=stock["symbol"],
                    name=stock["name"],
                    price=stock["price"],
                    change=stock["change"],
                    change_percent=stock["change_percent"],
                    volume=stock["volume"],
                    amount=stock["amount"],
                    open=stock["open"],
                    high=stock["high"],
                    low=stock["low"],
                    prev_close=stock["prev_close"],
                    timestamp=datetime.utcnow(),
                    source=self.name
                )
                for stock in stocks
                if stock["price"] > 0  # Filter out suspended stocks
            ]
        except Exception as e:
            print(f"[AkShareDataSource] Error fetching all stocks: {e}")
            return []

    async def get_historical_data(
        self,
        symbol: str,
        period: str = "daily",
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get historical K-line data

        Args:
            symbol: Stock symbol (e.g., "000001.SZ")
            period: K-line period - "daily", "weekly", "monthly", or "1min"
            days: Number of days to fetch

        Returns:
            List of OHLCV data points
        """
        try:
            code = symbol.split('.')[0]
            end_date = datetime.now().strftime("%Y%m%d")
            start_date = (datetime.now() - timedelta(days=days)).strftime("%Y%m%d")

            if period == "1min":
                # For minute data, use stock_zh_a_hist_min_em
                ak_symbol = self._normalize_symbol(symbol)
                df = await self._run_in_thread(
                    ak.stock_zh_a_hist_min_em,
                    symbol=ak_symbol,
                    period="1",
                    adjust="qfq"
                )
            else:
                # For daily/weekly/monthly data
                df = await self._run_in_thread(
                    ak.stock_zh_a_hist,
                    symbol=code,
                    period=period,
                    start_date=start_date,
                    end_date=end_date,
                    adjust="qfq"
                )

            if df is None or df.empty:
                return []

            # Convert to list of dicts
            result = []
            for _, row in df.iterrows():
                result.append({
                    "date": str(row.get("日期", row.get("时间", ""))),
                    "open": float(row.get("开盘", row.get("开盘", 0))),
                    "high": float(row.get("最高", row.get("最高", 0))),
                    "low": float(row.get("最低", row.get("最低", 0))),
                    "close": float(row.get("收盘", row.get("收盘", 0))),
                    "volume": int(row.get("成交量", row.get("成交量", 0))),
                    "amount": float(row.get("成交额", row.get("成交额", 0))),
                })

            return result

        except Exception as e:
            print(f"[AkShareDataSource] Error fetching historical data for {symbol}: {e}")
            return []

    async def health_check(self) -> DataSourceHealth:
        """Check data source health"""
        import time
        start_time = time.time()

        try:
            # Test by fetching a small amount of data
            df = await self._run_in_thread(ak.stock_zh_a_spot_em)
            latency_ms = (time.time() - start_time) * 1000

            if df is not None and not df.empty:
                self._update_health(DataSourceStatus.HEALTHY, latency_ms, True)
            else:
                self._update_health(DataSourceStatus.DEGRADED, latency_ms, False)

        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            print(f"[AkShareDataSource] Health check error: {e}")
            self._update_health(DataSourceStatus.UNAVAILABLE, latency_ms, False)

        return self._health

    async def close(self):
        """Close resources"""
        self._executor.shutdown(wait=False)


def pd_notna(value):
    """Helper to check if pandas value is not NA"""
    if value is None:
        return False
    try:
        import pandas as pd
        return pd.notna(value)
    except ImportError:
        return True
