"""
微博热搜采集器

采集微博热搜榜单数据
"""

import aiohttp
import re
from typing import List, Dict, Any, Optional
from datetime import datetime

from news_service.collectors.base import BaseCollector
from news_service.models.news import SocialMediaPost, PlatformType, SentimentType


class WeiboHotCollector(BaseCollector):
    """
    微博热搜采集器

    采集微博热搜榜单，分析热点话题和股票提及
    """

    HOT_URL = "https://weibo.com/ajax/side/hotSearch"

    # 股票名称到代码的映射（简化版）
    STOCK_MAPPING = {
        "宁德时代": "300750.SZ",
        "茅台": "600519.SH",
        "贵州茅台": "600519.SH",
        "平安银行": "000001.SZ",
        "招商银行": "600036.SH",
        "比亚迪": "002594.SZ",
        "腾讯": "00700.HK",
        "阿里巴巴": "09988.HK",
        "A股": "SH000001",
    }

    # 情感词典（简化版）
    POSITIVE_WORDS = ["大涨", "涨停", "牛市", "突破", "创新高", "利好", "强劲"]
    NEGATIVE_WORDS = ["暴跌", "跌停", "熊市", "崩盘", "跌破", "利空", "恐慌"]

    def __init__(self):
        super().__init__(name="weibo_hot", priority=1)
        self.session: Optional[aiohttp.ClientSession] = None

    @property
    def source_name(self) -> str:
        return "weibo"

    async def _get_session(self) -> aiohttp.ClientSession:
        """获取或创建HTTP会话"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            )
        return self.session

    async def collect(self) -> List[Dict[str, Any]]:
        """
        采集微博热搜

        Returns:
            热搜数据列表
        """
        session = await self._get_session()

        try:
            await self._rate_limit(min_interval=5.0)  # 5秒间隔

            async with session.get(self.HOT_URL) as response:
                self._record_request(success=True)

                if response.status != 200:
                    raise Exception(f"API返回错误状态码: {response.status}")

                data = await response.json()
                return self._parse_hot_list(data)

        except Exception as e:
            self._record_request(success=False)
            raise Exception(f"采集微博热搜失败: {str(e)}")

    def _parse_hot_list(self, data: Dict) -> List[Dict[str, Any]]:
        """
        解析热搜列表

        Args:
            data: API响应数据

        Returns:
            解析后的热搜数据列表
        """
        hot_list = []

        realtime_list = data.get("data", {}).get("realtime", [])

        for item in realtime_list:
            hot_item = {
                "title": item.get("note", ""),
                "content": item.get("word", ""),
                "hot_rank": item.get("rank", 0),
                "hot_value": item.get("raw_hot", 0),
                "category": item.get("category", ""),
                "platform": "weibo",
                "mentioned_stocks": self._extract_stock_mentions(item.get("note", "")),
                "sentiment": self._analyze_sentiment(item),
                "published_at": datetime.now(),
            }
            hot_list.append(hot_item)

        return hot_list

    def _extract_stock_mentions(self, text: str) -> List[str]:
        """
        提取文本中提及的股票

        Args:
            text: 文本内容

        Returns:
            股票代码列表
        """
        mentioned = []

        for stock_name, stock_code in self.STOCK_MAPPING.items():
            if stock_name in text:
                mentioned.append(stock_code)

        return mentioned

    def _analyze_sentiment(self, item: Dict) -> Dict[str, Any]:
        """
        分析热搜情感

        Args:
            item: 热搜项

        Returns:
            情感分析结果
        """
        title = item.get("note", "")
        hot_value = item.get("raw_hot", 0)

        # 基于关键词的情感分析
        positive_score = sum(1 for word in self.POSITIVE_WORDS if word in title)
        negative_score = sum(1 for word in self.NEGATIVE_WORDS if word in title)

        # 计算情感分数 (-1.0 到 1.0)
        if positive_score > negative_score:
            score = min(0.3 + (positive_score - negative_score) * 0.2, 1.0)
            sentiment_type = "positive"
        elif negative_score > positive_score:
            score = max(-0.3 - (negative_score - positive_score) * 0.2, -1.0)
            sentiment_type = "negative"
        else:
            score = 0.0
            sentiment_type = "neutral"

        # 热度加权
        if hot_value > 1000000:  # 高热度话题
            score *= 1.2
            score = min(score, 1.0) if score > 0 else max(score, -1.0)

        return {
            "type": sentiment_type,
            "score": round(score, 2),
            "confidence": 0.6 if sentiment_type != "neutral" else 0.4,
        }

    def _calculate_engagement_score(self, item: Dict) -> int:
        """
        计算互动分数

        Args:
            item: 热搜项

        Returns:
            互动分数
        """
        # 微博使用hot_value作为主要互动指标
        return item.get("hot_value", 0)

    async def health_check(self) -> bool:
        """
        健康检查

        Returns:
            数据源是否可用
        """
        try:
            session = await self._get_session()
            async with session.get(self.HOT_URL, timeout=10) as response:
                return response.status == 200
        except Exception:
            return False

    async def close(self):
        """关闭采集器"""
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None
