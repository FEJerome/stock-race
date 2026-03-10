"""
CSV Data Source - Offline data for testing and backtesting

Loads market data from CSV files. Useful for:
- Offline development/testing
- Backtesting with historical data
- Fallback when online sources are unavailable
"""
import csv
import os
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path

from .base import DataSource, Quote, DataSourceHealth, DataSourceStatus


class CSVDataSource(DataSource):
    """
    CSV-based market data source

    CSV format expected:
        symbol,name,price,change,change_percent,volume,timestamp
        000001.SZ,平安银行,12.50,0.30,2.46,12345678,2026-03-09T10:30:00

    Usage:
        source = CSVDataSource("./data/market_data.csv")
        quote = await source.get_quote("000001.SZ")
    """

    def __init__(
        self,
        csv_path: str,
        name: str = "csv",
        priority: int = 200,
        auto_reload: bool = False
    ):
        """
        Initialize CSV data source

        Args:
            csv_path: Path to CSV file
            name: Source name
            priority: Data source priority (higher = lower priority)
            auto_reload: Whether to reload file on each request
        """
        super().__init__(name=name, priority=priority)
        self.csv_path = Path(csv_path)
        self.auto_reload = auto_reload
        self._data: Dict[str, Quote] = {}
        self._last_modified: float = 0
        self._loaded = False

    def _load_data(self) -> bool:
        """
        Load data from CSV file

        Returns:
            True if successful, False otherwise
        """
        try:
            if not self.csv_path.exists():
                # Create sample data file if not exists
                self._create_sample_file()

            # Check if file needs reload
            mtime = self.csv_path.stat().st_mtime
            if self._loaded and not self.auto_reload and mtime == self._last_modified:
                return True

            self._data = {}
            with open(self.csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    quote = self._parse_row(row)
                    if quote:
                        self._data[quote.symbol] = quote
                        quote.source = self.name

            self._last_modified = mtime
            self._loaded = True
            return True

        except Exception as e:
            print(f"[CSVDataSource] Error loading {self.csv_path}: {e}")
            return False

    def _parse_row(self, row: Dict[str, str]) -> Optional[Quote]:
        """Parse CSV row into Quote object"""
        try:
            # Handle timestamp
            timestamp = None
            ts_str = row.get('timestamp', '')
            if ts_str:
                try:
                    timestamp = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                except:
                    pass

            return Quote(
                symbol=row['symbol'],
                name=row.get('name', row['symbol']),
                price=float(row['price']),
                change=float(row.get('change', 0)),
                change_percent=float(row.get('change_percent', 0)),
                volume=int(row.get('volume', 0)),
                amount=float(row.get('amount', 0)) if row.get('amount') else None,
                open=float(row['open']) if row.get('open') else None,
                high=float(row['high']) if row.get('high') else None,
                low=float(row['low']) if row.get('low') else None,
                prev_close=float(row['prev_close']) if row.get('prev_close') else None,
                timestamp=timestamp or datetime.utcnow(),
                source=self.name
            )
        except (KeyError, ValueError) as e:
            print(f"[CSVDataSource] Error parsing row: {e}")
            return None

    def _create_sample_file(self):
        """Create a sample CSV file for testing"""
        self.csv_path.parent.mkdir(parents=True, exist_ok=True)

        sample_data = [
            ["symbol", "name", "price", "change", "change_percent", "volume",
             "amount", "open", "high", "low", "prev_close", "timestamp"],
            ["000001.SZ", "平安银行", "12.50", "0.30", "2.46", "12345678",
             "154320975", "12.20", "12.60", "12.15", "12.20",
             "2026-03-09T10:30:00"],
            ["000002.SZ", "万科A", "15.80", "-0.20", "-1.25", "8765432",
             "138493626", "16.00", "16.10", "15.70", "16.00",
             "2026-03-09T10:30:00"],
            ["000858.SZ", "五粮液", "168.50", "2.50", "1.51", "2345678",
             "395243730", "166.00", "169.00", "165.50", "166.00",
             "2026-03-09T10:30:00"],
            ["002415.SZ", "海康威视", "32.80", "0.45", "1.39", "4567890",
             "149826792", "32.35", "33.00", "32.20", "32.35",
             "2026-03-09T10:30:00"],
            ["002594.SZ", "比亚迪", "245.60", "5.20", "2.16", "3456789",
             "848983412", "240.40", "248.00", "239.50", "240.40",
             "2026-03-09T10:30:00"],
            ["600000.SH", "浦发银行", "9.85", "0.15", "1.55", "9876543",
             "97283929", "9.70", "9.90", "9.68", "9.70",
             "2026-03-09T10:30:00"],
            ["600519.SH", "贵州茅台", "1688.00", "12.00", "0.72", "876543",
             "1479609840", "1676.00", "1695.00", "1670.00", "1676.00",
             "2026-03-09T10:30:00"],
            ["600036.SH", "招商银行", "42.30", "0.80", "1.93", "6789012",
             "287175208", "41.50", "42.50", "41.40", "41.50",
             "2026-03-09T10:30:00"],
            ["300750.SZ", "宁德时代", "185.20", "-2.30", "-1.23", "2345678",
             "434421562", "187.50", "188.00", "184.00", "187.50",
             "2026-03-09T10:30:00"],
            ["300059.SZ", "东方财富", "18.60", "0.35", "1.92", "8765432",
             "163037035", "18.25", "18.80", "18.20", "18.25",
             "2026-03-09T10:30:00"],
        ]

        with open(self.csv_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(sample_data)

        print(f"[CSVDataSource] Created sample file: {self.csv_path}")

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """Get quote for a single stock"""
        # Use thread pool for file I/O
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(None, self._load_data)

        if not success:
            return None

        return self._data.get(symbol)

    async def get_quotes(self, symbols: List[str]) -> Dict[str, Optional[Quote]]:
        """Get quotes for multiple stocks"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._load_data)

        return {symbol: self._data.get(symbol) for symbol in symbols}

    async def get_all_stocks(self) -> List[Quote]:
        """Get all available quotes"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._load_data)

        return list(self._data.values())

    async def health_check(self) -> DataSourceHealth:
        """Check data source health"""
        start_time = asyncio.get_event_loop().time()

        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(None, self._load_data)

        latency_ms = (asyncio.get_event_loop().time() - start_time) * 1000

        if success:
            self._update_health(DataSourceStatus.HEALTHY, latency_ms, True)
        else:
            self._update_health(DataSourceStatus.UNAVAILABLE, latency_ms, False)

        return self._health

    def reload(self):
        """Force reload data from file"""
        self._loaded = False
        self._load_data()
