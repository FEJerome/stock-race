"""
Market Data Service - Data source adapters and router
"""
from .base import DataSource, Quote, MarketData, DataSourceHealth, DataSourceStatus
from .csv_source import CSVDataSource
from .sina_source import SinaDataSource
from .tencent_source import TencentDataSource
from .eastmoney_source import EastMoneyDataSource
from .router import DataSourceRouter, get_router

__all__ = [
    'DataSource', 'Quote', 'MarketData', 'DataSourceHealth', 'DataSourceStatus',
    'CSVDataSource', 'SinaDataSource', 'TencentDataSource', 'EastMoneyDataSource',
    'DataSourceRouter', 'get_router'
]
