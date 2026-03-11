"""
新闻服务模块

提供新闻采集、情绪分析和情报管理功能
"""
from .base import NewsSource, NewsItem, NewsSourceHealth, NewsSourceStatus
from .processor import NewsIntelligence, SentimentProcessor, DuplicateDetector
from .eastmoney_news import EastmoneyNewsSource
from .service import NewsService, get_news_service, get_news_service_async

__all__ = [
    # Base classes
    "NewsSource",
    "NewsItem",
    "NewsSourceHealth",
    "NewsSourceStatus",
    # Processor classes
    "NewsIntelligence",
    "SentimentProcessor",
    "DuplicateDetector",
    # News sources
    "EastmoneyNewsSource",
    # Service
    "NewsService",
    "get_news_service",
    "get_news_service_async",
]
