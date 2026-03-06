"""
CSV数据源实现

Local模式使用本地CSV文件，无需网络依赖
CSV格式示例：
date,open,high,low,close,volume
2024-01-01,100.0,105.0,98.0,102.0,1000000

依据：DELIVERY_PLAN.md Local数据源定义
"""

import csv
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import List, Optional

from core.domain.models import StockData
from adapters.datasource.interface import DataSource


class CSVDataSource(DataSource):
    """
    CSV文件数据源
    
    数据存储在本地文件，适合Local模式离线使用
    """
    
    def __init__(self, data_dir: str = "data/stocks"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_csv_path(self, symbol: str) -> Path:
        """获取股票CSV文件路径"""
        return self.data_dir / f"{symbol}.csv"
    
    def get_stock_data(self, symbol: str) -> Optional[StockData]:
        """
        获取最新股票数据（CSV最后一行）
        """
        csv_path = self._get_csv_path(symbol)
        
        if not csv_path.exists():
            return None
        
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            
            if not rows:
                return None
            
            # 返回最后一行（最新数据）
            latest = rows[-1]
            
            return StockData(
                symbol=symbol,
                name=latest.get('name', symbol),
                price=Decimal(latest['close']),
                change_percent=Decimal(latest.get('change_percent', '0')),
                volume=int(latest.get('volume', '0')),
                ma5=Decimal(latest['ma5']) if 'ma5' in latest else None,
                ma10=Decimal(latest['ma10']) if 'ma10' in latest else None,
                ma20=Decimal(latest['ma20']) if 'ma20' in latest else None,
            )
    
    def get_historical_data(
        self, 
        symbol: str, 
        start_date: date, 
        end_date: date
    ) -> List[StockData]:
        """
        获取历史数据
        """
        csv_path = self._get_csv_path(symbol)
        
        if not csv_path.exists():
            return []
        
        result = []
        
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            for row in reader:
                row_date = datetime.strptime(row['date'], '%Y-%m-%d').date()
                
                if start_date <= row_date <= end_date:
                    result.append(StockData(
                        symbol=symbol,
                        name=row.get('name', symbol),
                        price=Decimal(row['close']),
                        change_percent=Decimal(row.get('change_percent', '0')),
                        volume=int(row.get('volume', '0'))
                    ))
        
        return result
    
    def is_trading_time(self) -> bool:
        """
        Local模式：总是返回True（离线数据随时可用）
        
        MVP/Full：需要实现真实交易时间判断
        """
        return True
    
    def list_available_symbols(self) -> List[str]:
        """
        列出所有可用的股票代码
        """
        symbols = []
        
        for csv_file in self.data_dir.glob("*.csv"):
            symbols.append(csv_file.stem)
        
        return sorted(symbols)
