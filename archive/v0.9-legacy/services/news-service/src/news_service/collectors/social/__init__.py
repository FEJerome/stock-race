"""
社交媒体采集器模块
"""

from .weibo_hot import WeiboHotCollector
from .xueqiu import XueqiuCollector
from .eastmoney_guba import EastMoneyGubaCollector

__all__ = ["WeiboHotCollector", "XueqiuCollector", "EastMoneyGubaCollector"]
