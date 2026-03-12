"""
Market Data Service - Data source adapters and router
"""
from .base import DataSource, Quote, MarketData, DataSourceHealth, DataSourceStatus
from .csv_source import CSVDataSource
from .sina_source import SinaDataSource
from .tencent_source import TencentDataSource
from .eastmoney_source import EastMoneyDataSource
from .akshare_source import AkShareDataSource
from .baostock_source import BaostockDataSource
from .tushare_source import TushareDataSource
from .router import DataSourceRouter, get_router
from .cache_service import QuoteCacheService, get_cache_service, init_cache_service
from .indicators import TechnicalIndicators, TechnicalIndicatorsResult
from .collector import MarketDataCollector, create_collector, get_collector, CircuitBreaker

__all__ = [
    'DataSource', 'Quote', 'MarketData', 'DataSourceHealth', 'DataSourceStatus',
    'CSVDataSource', 'SinaDataSource', 'TencentDataSource', 'EastMoneyDataSource',
    'AkShareDataSource', 'BaostockDataSource', 'TushareDataSource',
    'DataSourceRouter', 'get_router',
    'QuoteCacheService', 'get_cache_service', 'init_cache_service',
    'TechnicalIndicators', 'TechnicalIndicatorsResult',
    'MarketDataCollector', 'create_collector', 'get_collector', 'CircuitBreaker'
]
