"""
雪球社区采集器

采集雪球社区热帖数据，分析投资者情绪
"""

import aiohttp
import re
from typing import List, Dict, Any, Optional
from datetime import datetime

from news_service.collectors.base import BaseCollector


class XueqiuCollector(BaseCollector):
    """
    雪球社区采集器

    采集雪球社区热帖，分析投资者情绪和股票提及
    """

    # 雪球API
    HOT_POSTS_URL = "https://xueqiu.com/query/v1/symbol/search/status.json"

    # 股票名称到代码的映射
    STOCK_MAPPING = {
        "宁德时代": "300750.SZ",
        "贵州茅台": "600519.SH",
        "茅台": "600519.SH",
        "平安银行": "000001.SZ",
        "招商银行": "600036.SH",
        "比亚迪": "002594.SZ",
        "腾讯": "00700.HK",
        "阿里巴巴": "09988.HK",
        "A股": "SH000001",
        "上证指数": "SH000001",
        "深证成指": "SZ399001",
        "创业板指": "SZ399006",
        "中国平安": "601318.SH",
        "五粮液": "000858.SZ",
        "美的集团": "000333.SZ",
        "恒瑞医药": "600276.SH",
        "隆基绿能": "601012.SH",
        "中信证券": "600030.SH",
        "东方财富": "300059.SZ",
    }

    # 情感词典
    POSITIVE_WORDS = ["大涨", "涨停", "牛市", "突破", "创新高", "利好", "强劲", "反弹", "上涨", "增长", "盈利", "超预期", "看好", "买入", "推荐"]
    NEGATIVE_WORDS = ["暴跌", "跌停", "熊市", "崩盘", "跌破", "利空", "恐慌", "下跌", "亏损", "暴雷", "减持", "看空", "卖出", "避雷", "风险"]

    # 看涨/看跌关键词
    BULLISH_WORDS = ["涨停", "看好", "买入", "推荐", "目标价", "翻倍", "大涨", "突破", "创新高"]
    BEARISH_WORDS = ["跌停", "看空", "卖出", "减持", "避雷", "快跑", "下跌", "跌破", "崩盘"]

    def __init__(self):
        super().__init__(name="xueqiu", priority=1)
        self.session: Optional[aiohttp.ClientSession] = None

    @property
    def source_name(self) -> str:
        return "xueqiu"

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
        采集雪球社区热帖

        Returns:
            帖子数据列表
        """
        session = await self._get_session()

        try:
            await self._rate_limit(min_interval=10.0)

            params = {
                "count": "20",
                "page": "1",
                "sort": "time",  # 按时间排序
            }

            async with session.get(self.HOT_POSTS_URL, params=params) as response:
                self._record_request(success=True)

                if response.status != 200:
                    raise Exception(f"API返回错误状态码: {response.status}")

                data = await response.json()
                return self._parse_post_list(data)

        except Exception as e:
            self._record_request(success=False)
            raise Exception(f"采集雪球社区帖子失败: {str(e)}")

    def _parse_post_list(self, data: Dict) -> List[Dict[str, Any]]:
        """
        解析帖子列表

        Args:
            data: API响应数据

        Returns:
            解析后的帖子数据列表
        """
        post_list = []

        post_data = data.get("list", [])

        for item in post_data:
            title = item.get("title", "")
            description = item.get("description", "")
            content = f"{title} {description}"

            user = item.get("user", {})

            post_item = {
                "id": str(item.get("id", "")),
                "title": title,
                "content": description,
                "platform": "xueqiu",
                "author": user.get("screen_name", ""),
                "author_followers": user.get("followers_count", 0),
                "mentioned_stocks": self._extract_stock_mentions(content),
                "stock_sentiment": self._extract_stock_sentiment(content),
                "sentiment": self._analyze_sentiment(item),
                "published_at": self._parse_timestamp(item.get("created_at", 0)),
                "collected_at": datetime.now(),
                "read_count": item.get("view_count", 0),
                "comment_count": item.get("reply_count", 0),
                "like_count": item.get("like_count", 0),
                "forward_count": item.get("retweet_count", 0),
                "crowd_emotion": "neutral",
            }
            post_list.append(post_item)

        # 计算群体情绪
        if post_list:
            crowd_emotion = self._calculate_crowd_emotion(post_list)
            for post in post_list:
                post["crowd_emotion"] = crowd_emotion

        return post_list

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

        # 去重
        return list(set(mentioned))

    def _extract_stock_sentiment(self, text: str) -> str:
        """
        提取股票情绪（看涨/看跌/中性）

        Args:
            text: 文本内容

        Returns:
            情绪类型
        """
        bullish_score = sum(1 for word in self.BULLISH_WORDS if word in text)
        bearish_score = sum(1 for word in self.BEARISH_WORDS if word in text)

        if bullish_score > bearish_score:
            return "bullish"
        elif bearish_score > bullish_score:
            return "bearish"
        else:
            return "neutral"

    def _analyze_sentiment(self, item: Dict) -> Dict[str, Any]:
        """
        分析帖子情感

        Args:
            item: 帖子项

        Returns:
            情感分析结果
        """
        title = item.get("title", "")
        description = item.get("description", "")
        content = f"{title} {description}"

        # 基于关键词的情感分析
        positive_score = sum(1 for word in self.POSITIVE_WORDS if word in content)
        negative_score = sum(1 for word in self.NEGATIVE_WORDS if word in content)

        # 计算情感分数 (-1.0 到 1.0)
        if positive_score > negative_score:
            score = min(0.3 + (positive_score - negative_score) * 0.15, 1.0)
            sentiment_type = "positive"
        elif negative_score > positive_score:
            score = max(-0.3 - (negative_score - positive_score) * 0.15, -1.0)
            sentiment_type = "negative"
        else:
            score = 0.0
            sentiment_type = "neutral"

        return {
            "type": sentiment_type,
            "score": round(score, 2),
            "confidence": 0.6 if sentiment_type != "neutral" else 0.4,
        }

    def _calculate_engagement_score(self, item: Dict) -> int:
        """
        计算互动分数

        Args:
            item: 帖子项

        Returns:
            互动分数
        """
        # 雪球权重: view * 0.1 + reply * 2 + like * 1 + retweet * 3
        view_score = item.get("view_count", 0) * 0.1
        reply_score = item.get("reply_count", 0) * 2
        like_score = item.get("like_count", 0) * 1
        retweet_score = item.get("retweet_count", 0) * 3

        return int(view_score + reply_score + like_score + retweet_score)

    def _calculate_crowd_emotion(self, posts: List[Dict]) -> str:
        """
        计算群体情绪

        Args:
            posts: 帖子列表

        Returns:
            群体情绪类型
        """
        if not posts:
            return "neutral"

        total_score = sum(post.get("sentiment", {}).get("score", 0) for post in posts)
        avg_score = total_score / len(posts)

        if avg_score > 0.3:
            return "greed"
        elif avg_score < -0.3:
            return "fear"
        else:
            return "neutral"

    def _parse_timestamp(self, timestamp: int) -> datetime:
        """
        解析时间戳

        Args:
            timestamp: 毫秒时间戳

        Returns:
            datetime对象
        """
        if not timestamp:
            return datetime.now()

        try:
            # 雪球使用毫秒时间戳
            return datetime.fromtimestamp(timestamp / 1000)
        except (ValueError, OSError):
            return datetime.now()

    async def health_check(self) -> bool:
        """
        健康检查

        Returns:
            数据源是否可用
        """
        try:
            session = await self._get_session()
            params = {
                "count": "1",
                "page": "1",
            }
            async with session.get(self.HOT_POSTS_URL, params=params, timeout=10) as response:
                return response.status == 200
        except Exception:
            return False

    async def close(self):
        """关闭采集器"""
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None
