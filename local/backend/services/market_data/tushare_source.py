"""
Tushare Data Source - Financial data from Tushare Pro API

Tushare provides comprehensive financial data:
- Stock basic information
- Daily/quarterly financial reports
- Balance sheet, income statement, cash flow
- Shareholder data, institutional holdings

Requires Tushare Pro token (get from https://tushare.pro)
"""
import os
import asyncio
import tushare as ts
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from concurrent.futures import ThreadPoolExecutor

from .base import DataSource, Quote, DataSourceHealth, DataSourceStatus


class TushareDataSource(DataSource):
    """
    Tushare Pro data source for financial data

    Provides comprehensive A-share financial data via Tushare Pro API.
    Requires a valid Tushare Pro token.
    Best suited for daily financial data collection.
    Priority: 75 (used for fundamental analysis)

    Usage:
        # From environment variable TUSHARE_TOKEN
        source = TushareDataSource()

        # Or with explicit token
        source = TushareDataSource(token="your_token_here")

        quote = await source.get_quote("000001.SZ")
        financials = await source.get_financial_data("000001.SZ")
    """

    def __init__(self, name: str = "tushare", priority: int = 75, token: Optional[str] = None):
        """
        Initialize Tushare data source

        Args:
            name: Source identifier
            priority: Data source priority
            token: Tushare Pro token (or set TUSHARE_TOKEN env var)
        """
        super().__init__(name=name, priority=priority)
        self._token = token or os.getenv("TUSHARE_TOKEN")
        self._executor = ThreadPoolExecutor(max_workers=4)
        self._pro = None
        self._initialized = False
        self._stock_list_cache: Optional[List[Dict]] = None
        self._stock_list_cache_time: Optional[datetime] = None
        self._cache_ttl = timedelta(hours=6)

    def _initialize(self):
        """Initialize Tushare Pro API"""
        if self._initialized:
            return True

        if not self._token:
            print("[TushareDataSource] No token provided. Set TUSHARE_TOKEN env var or pass token parameter.")
            return False

        try:
            ts.set_token(self._token)
            self._pro = ts.pro_api()
            self._initialized = True
            return True
        except Exception as e:
            print(f"[TushareDataSource] Initialization error: {e}")
            return False

    def _run_in_thread(self, func, *args, **kwargs):
        """Run synchronous Tushare function in thread pool"""
        loop = asyncio.get_event_loop()
        return loop.run_in_executor(self._executor, lambda: func(*args, **kwargs))

    def _normalize_symbol(self, symbol: str) -> str:
        """
        Normalize symbol to Tushare format

        Args:
            symbol: Stock symbol (e.g., "600000.SH", "000001.SZ")

        Returns:
            Tushare format (e.g., "600000.SH", "000001.SZ")
        """
        symbol = symbol.upper()

        if symbol.startswith("SH"):
            return f"{symbol[2:]}.SH"
        elif symbol.startswith("SZ"):
            return f"{symbol[2:]}.SZ"
        elif "." not in symbol:
            # Add exchange suffix
            if symbol.startswith("60") or symbol.startswith("68"):
                return f"{symbol}.SH"
            elif symbol.startswith("00") or symbol.startswith("30") or symbol.startswith("39"):
                return f"{symbol}.SZ"

        return symbol

    def _to_ts_code(self, symbol: str) -> str:
        """Convert symbol to Tushare ts_code format"""
        normalized = self._normalize_symbol(symbol)
        return normalized  # Tushare uses same format: CODE.EXCHANGE

    def _from_ts_code(self, ts_code: str) -> str:
        """Convert Tushare ts_code to standard symbol"""
        return ts_code.upper()

    async def _ensure_initialized(self) -> bool:
        """Ensure Tushare is initialized"""
        if not self._initialized:
            # Run initialization in thread to be async-safe
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self._executor, self._initialize)
        return True

    async def get_stock_list(self) -> List[Dict]:
        """
        Get all A-share stock list

        Returns:
            List of stock info dicts with symbol, name, industry, etc.
        """
        if not await self._ensure_initialized():
            return []

        if (self._stock_list_cache is not None and
            self._stock_list_cache_time is not None and
            datetime.utcnow() - self._stock_list_cache_time < self._cache_ttl):
            return self._stock_list_cache

        try:
            df = await self._run_in_thread(self._pro.stock_basic, exchange='', list_status='L')

            if df is None or df.empty:
                return []

            stocks = []
            for _, row in df.iterrows():
                stocks.append({
                    "symbol": self._from_ts_code(row["ts_code"]),
                    "name": row["name"],
                    "industry": row.get("industry", ""),
                    "market": row.get("market", ""),
                    "list_date": row.get("list_date", ""),
                })

            self._stock_list_cache = stocks
            self._stock_list_cache_time = datetime.utcnow()
            print(f"[TushareDataSource] Loaded {len(stocks)} stocks")
            return stocks

        except Exception as e:
            print(f"[TushareDataSource] Error fetching stock list: {e}")
            return []

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """
        Get daily quote for a single stock

        Note: Tushare provides daily data, not real-time.
        For real-time quotes, use other sources.
        """
        if not await self._ensure_initialized():
            return None

        try:
            ts_code = self._to_ts_code(symbol)
            today = datetime.now().strftime("%Y%m%d")

            df = await self._run_in_thread(
                self._pro.daily,
                ts_code=ts_code,
                trade_date=today
            )

            if df is None or df.empty:
                # Try previous trading day
                df = await self._run_in_thread(
                    self._pro.daily,
                    ts_code=ts_code,
                    limit=1
                )

            if df is None or df.empty:
                return None

            row = df.iloc[0]

            # Get stock name from cache
            stock_name = symbol
            stocks = await self.get_stock_list()
            for s in stocks:
                if s["symbol"] == self._normalize_symbol(symbol):
                    stock_name = s["name"]
                    break

            price = float(row["close"])
            prev_close = float(row["pre_close"])
            change = price - prev_close
            change_percent = (change / prev_close) * 100 if prev_close else 0

            return Quote(
                symbol=self._normalize_symbol(symbol),
                name=stock_name,
                price=round(price, 2),
                change=round(change, 2),
                change_percent=round(change_percent, 2),
                volume=int(row["vol"]) if "vol" in row else 0,
                amount=float(row["amount"]) if "amount" in row else None,
                open=float(row["open"]) if "open" in row else None,
                high=float(row["high"]) if "high" in row else None,
                low=float(row["low"]) if "low" in row else None,
                prev_close=round(prev_close, 2),
                timestamp=datetime.utcnow(),
                source=self.name
            )

        except Exception as e:
            print(f"[TushareDataSource] Error fetching quote for {symbol}: {e}")
            return None

    async def get_quotes(self, symbols: List[str]) -> Dict[str, Optional[Quote]]:
        """Get quotes for multiple stocks"""
        results: Dict[str, Optional[Quote]] = {}
        for symbol in symbols:
            results[symbol] = await self.get_quote(symbol)
        return results

    async def get_all_stocks(self) -> List[Quote]:
        """
        Get all stock quotes

        Note: Limited to popular stocks to avoid API rate limits
        """
        popular_codes = [
            "600000.SH", "600036.SH", "600519.SH",
            "000001.SZ", "000002.SZ", "000858.SZ",
            "002415.SZ", "002594.SZ",
            "300059.SZ", "300750.SZ"
        ]

        results = await self.get_quotes(popular_codes)
        return [q for q in results.values() if q is not None]

    async def get_financial_data(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Get financial data for a stock

        Returns:
            Dict with revenue, profit, EPS, and other financial metrics
        """
        if not await self._ensure_initialized():
            return None

        try:
            ts_code = self._to_ts_code(symbol)

            # Get income data (latest quarter)
            income_df = await self._run_in_thread(
                self._pro.income,
                ts_code=ts_code,
                limit=1
            )

            # Get balance sheet
            balance_df = await self._run_in_thread(
                self._pro.balancesheet,
                ts_code=ts_code,
                limit=1
            )

            # Get cash flow
            cashflow_df = await self._run_in_thread(
                self._pro.cashflow,
                ts_code=ts_code,
                limit=1
            )

            # Get financial indicators
            fina_df = await self._run_in_thread(
                self._pro.fina_indicator,
                ts_code=ts_code,
                limit=1
            )

            result = {
                "symbol": self._normalize_symbol(symbol),
                "income": {},
                "balance": {},
                "cashflow": {},
                "indicators": {}
            }

            if income_df is not None and not income_df.empty:
                row = income_df.iloc[0]
                result["income"] = {
                    "total_revenue": float(row.get("total_revenue", 0)) if pd_notna(row.get("total_revenue")) else None,
                    "operate_profit": float(row.get("operate_profit", 0)) if pd_notna(row.get("operate_profit")) else None,
                    "net_income": float(row.get("n_income", 0)) if pd_notna(row.get("n_income")) else None,
                    "basic_eps": float(row.get("basic_eps", 0)) if pd_notna(row.get("basic_eps")) else None,
                }

            if balance_df is not None and not balance_df.empty:
                row = balance_df.iloc[0]
                result["balance"] = {
                    "total_assets": float(row.get("total_assets", 0)) if pd_notna(row.get("total_assets")) else None,
                    "total_liabilities": float(row.get("total_liab", 0)) if pd_notna(row.get("total_liab")) else None,
                    "equity": float(row.get("total_hldr_eqy_exc_min_int", 0)) if pd_notna(row.get("total_hldr_eqy_exc_min_int")) else None,
                }

            if cashflow_df is not None and not cashflow_df.empty:
                row = cashflow_df.iloc[0]
                result["cashflow"] = {
                    "operating_cash_flow": float(row.get("n_cashflow_act", 0)) if pd_notna(row.get("n_cashflow_act")) else None,
                    "investing_cash_flow": float(row.get("n_cashflow_inv_act", 0)) if pd_notna(row.get("n_cashflow_inv_act")) else None,
                    "financing_cash_flow": float(row.get("n_cash_flows_fnc_act", 0)) if pd_notna(row.get("n_cash_flows_fnc_act")) else None,
                }

            if fina_df is not None and not fina_df.empty:
                row = fina_df.iloc[0]
                result["indicators"] = {
                    "roe": float(row.get("roe", 0)) if pd_notna(row.get("roe")) else None,
                    "gross_margin": float(row.get("grossprofit_margin", 0)) if pd_notna(row.get("grossprofit_margin")) else None,
                    "net_margin": float(row.get("netprofit_margin", 0)) if pd_notna(row.get("netprofit_margin")) else None,
                    "debt_ratio": float(row.get("debt_to_assets", 0)) if pd_notna(row.get("debt_to_assets")) else None,
                }

            return result

        except Exception as e:
            print(f"[TushareDataSource] Error fetching financial data for {symbol}: {e}")
            return None

    async def get_historical_data(
        self,
        symbol: str,
        days: int = 30,
        freq: str = "D"
    ) -> List[Dict[str, Any]]:
        """
        Get historical K-line data

        Args:
            symbol: Stock symbol
            days: Number of days to fetch
            freq: "D" (daily), "W" (weekly), "M" (monthly)
        """
        if not await self._ensure_initialized():
            return []

        try:
            ts_code = self._to_ts_code(symbol)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days * 2)  # Get more to account for weekends

            df = await self._run_in_thread(
                self._pro.daily,
                ts_code=ts_code,
                start_date=start_date.strftime("%Y%m%d"),
                end_date=end_date.strftime("%Y%m%d")
            )

            if df is None or df.empty:
                return []

            result = []
            for _, row in df.iterrows():
                result.append({
                    "date": row["trade_date"],
                    "open": float(row["open"]),
                    "high": float(row["high"]),
                    "low": float(row["low"]),
                    "close": float(row["close"]),
                    "volume": int(row["vol"]),
                    "amount": float(row["amount"]) if "amount" in row else 0,
                })

            return result[:days]  # Return requested number of days

        except Exception as e:
            print(f"[TushareDataSource] Error fetching historical data for {symbol}: {e}")
            return []

    async def get_daily_basic(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Get daily basic indicators (PE, PB, turnover, etc.)

        Returns:
            Dict with valuation and trading indicators
        """
        if not await self._ensure_initialized():
            return None

        try:
            ts_code = self._to_ts_code(symbol)
            today = datetime.now().strftime("%Y%m%d")

            df = await self._run_in_thread(
                self._pro.daily_basic,
                ts_code=ts_code,
                trade_date=today
            )

            if df is None or df.empty:
                # Try previous day
                df = await self._run_in_thread(
                    self._pro.daily_basic,
                    ts_code=ts_code,
                    limit=1
                )

            if df is None or df.empty:
                return None

            row = df.iloc[0]
            return {
                "symbol": self._normalize_symbol(symbol),
                "trade_date": row.get("trade_date", ""),
                "close": float(row["close"]) if pd_notna(row.get("close")) else None,
                "turnover_rate": float(row["turnover_rate"]) if pd_notna(row.get("turnover_rate")) else None,
                "turnover_rate_f": float(row["turnover_rate_f"]) if pd_notna(row.get("turnover_rate_f")) else None,
                "volume_ratio": float(row["volume_ratio"]) if pd_notna(row.get("volume_ratio")) else None,
                "pe": float(row["pe"]) if pd_notna(row.get("pe")) else None,
                "pe_ttm": float(row["pe_ttm"]) if pd_notna(row.get("pe_ttm")) else None,
                "pb": float(row["pb"]) if pd_notna(row.get("pb")) else None,
                "ps": float(row["ps"]) if pd_notna(row.get("ps")) else None,
                "ps_ttm": float(row["ps_ttm"]) if pd_notna(row.get("ps_ttm")) else None,
                "total_share": float(row["total_share"]) if pd_notna(row.get("total_share")) else None,
                "float_share": float(row["float_share"]) if pd_notna(row.get("float_share")) else None,
                "total_mv": float(row["total_mv"]) if pd_notna(row.get("total_mv")) else None,
                "circ_mv": float(row["circ_mv"]) if pd_notna(row.get("circ_mv")) else None,
            }

        except Exception as e:
            print(f"[TushareDataSource] Error fetching daily basic for {symbol}: {e}")
            return None

    async def health_check(self) -> DataSourceHealth:
        """Check data source health"""
        import time
        start_time = time.time()

        if not self._token:
            return DataSourceHealth(
                source_name=self.name,
                status=DataSourceStatus.UNAVAILABLE,
                latency_ms=0,
                last_success=None,
                error_rate=1.0,
                weight=0
            )

        try:
            if not await self._ensure_initialized():
                latency_ms = (time.time() - start_time) * 1000
                self._update_health(DataSourceStatus.UNAVAILABLE, latency_ms, False)
                return self._health

            # Test by querying a known stock
            df = await self._run_in_thread(
                self._pro.daily,
                ts_code="000001.SZ",
                limit=1
            )

            latency_ms = (time.time() - start_time) * 1000

            if df is not None and not df.empty:
                self._update_health(DataSourceStatus.HEALTHY, latency_ms, True)
            else:
                self._update_health(DataSourceStatus.DEGRADED, latency_ms, False)

        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            print(f"[TushareDataSource] Health check error: {e}")
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
