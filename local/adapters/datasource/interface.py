"""
数据源适配器接口

依据：DELIVERY_PLAN.md 
- Local: CSV文件
- MVP: 新浪财经API
- Full: 多源实时行情
"""

from abc import ABC, abstractmethod
from datetime import date
from typing import List, Optional

from core.domain.models import StockData


class DataSource(ABC):
    """
    数据源抽象接口
    
    开闭原则：新增数据源只需实现此接口
    """
    
    @abstractmethod
    def get_stock_data(self, symbol: str) -> Optional[StockData]:
        """
        获取单只股票当前数据
        
        Args:
            symbol: 股票代码，如 "sh000001"
        
        Returns:
            StockData对象，如无数据返回None
        """
        pass
    
    @abstractmethod
    def get_historical_data(
        self, 
        symbol: str, 
        start_date: date, 
        end_date: date
    ) -> List[StockData]:
        """
        获取历史数据
        
        Args:
            symbol: 股票代码
            start_date: 开始日期
            end_date: 结束日期
        
        Returns:
            StockData列表
        """
        pass
    
    @abstractmethod
    def is_trading_time(self) -> bool:
        """
        判断当前是否为交易时间
        
        Returns:
            是否在A股交易时间内
        """
        pass
