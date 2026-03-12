"""
舆论情绪采集服务

从雪球、东方财富股吧等社区采集用户情绪数据
提供情绪指标计算（-1 到 +1）
"""
from .base import SentimentSource, SentimentPost, SentimentResult, SentimentLevel
from .xueqiu_source import XueqiuSentimentSource
from .eastmoney_guba_source import EastmoneyGubaSource
from .processor import SentimentProcessor
from .service import SentimentService, get_sentiment_service

__all__ = [
    # Base classes
    "SentimentSource",
    "SentimentPost",
    "SentimentResult",
    "SentimentLevel",
    # Sources
    "XueqiuSentimentSource",
    "EastmoneyGubaSource",
    # Processor
    "SentimentProcessor",
    # Service
    "SentimentService",
    "get_sentiment_service",
]
