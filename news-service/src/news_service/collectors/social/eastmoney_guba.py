"""
东方财富股吧采集器

采集东方财富股吧帖子数据，分析散户情绪
"""

import aiohttp
import re
from typing import List, Dict, Any, Optional
from datetime import datetime

from news_service.collectors.base import BaseCollector


class EastMoneyGubaCollector(BaseCollector):
    """
    东方财富股吧采集器

    采集东方财富股吧帖子，分析散户情绪和股票提及
    """

    # 东方财富股吧API
    GUBA_URL = "https://guba.eastmoney.com/api/taobaolst"

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
    POSITIVE_WORDS = ["大涨", "涨停", "牛市", "突破", "创新高", "利好", "强劲", "反弹", "上涨", "增长", "盈利", "超预期", "看好", "买入", "推荐", "满仓"]
    NEGATIVE_WORDS = ["暴跌", "跌停", "熊市", "崩盘", "跌破", "利空", "恐慌", "下跌", "亏损", "暴雷", "减持", "看空", "卖出", "减仓", "快跑"]

    # 看涨/看跌关键词
    BULLISH_WORDS = ["涨停", "看好", "买入", "推荐", "满仓", "突破", "创新高", "大涨", "目标价"]
    BEARISH_WORDS = ["跌停", "看空", "卖出", "减仓", "快跑", "避险", "下跌", "跌破", "崩盘"]

    def __init__(self):
        super().__init__(name="eastmoney_guba", priority=2)
        self.session: Optional[aiohttp.ClientSession] = None

    @property
    def source_name(self) -> str:
        return "eastmoney_guba"

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
        采集东方财富股吧帖子

        Returns:
            帖子数据列表
        """
        session = await self._get_session()

        try:
            await self._rate_limit(min_interval=10.0)

            params = {
                "type": "1",  # 热帖
                "code": "",  # 全部股票
                "page": "1",
                "count": "20",
            }

            async with session.get(self.GUBA_URL, params=params) as response:
                self._record_request(success=True)

                if response.status != 200:
                    raise Exception(f"API返回错误状态码: {response.status}")

                data = await response.json()
                return self._parse_post_list(data)

        except Exception as e:
            self._record_request(success=False)
            raise Exception(f"采集东方财富股吧帖子失败: {str(e)}")

    def _parse_post_list(self, data: Dict) -> List[Dict[str, Any]]:
        """
        解析帖子列表

        Args:
            data: API响应数据

        Returns:
            解析后的帖子数据列表
        """
        post_list = []

        post_data = data.get("data", {}).get("post_list", [])

        for item in post_data:
            title = item.get("post_title", "")
            content = item.get("post_content", "")
            full_content = f"{title} {content}"

            post_item = {
                "id": str(item.get("post_id", "")),
                "title": title,
                "content": content,
                "platform": "eastmoney_guba",
                "author": item.get("user_name", ""),
                "mentioned_stocks": self._extract_stock_mentions(full_content),
                "sentiment_vote": self._extract_sentiment_vote(full_content),
                "sentiment": self._analyze_sentiment(item),
                "published_at": self._parse_datetime(item.get("post_time", "")),
                "collected_at": datetime.now(),
                "read_count": item.get("read_count", 0),
                "comment_count": item.get("comment_count", 0),
                "like_count": item.get("like_count", 0),
                "stock_code": item.get("stock_code", ""),
                "stock_name": item.get("stock_name", ""),
                "crowd_sentiment_index": 50,  # 默认中性
            }
            post_list.append(post_item)

        # 计算散户情绪指数
        if post_list:
            crowd_index = self._calculate_crowd_sentiment_index(post_list)
            for post in post_list:
                post["crowd_sentiment_index"] = crowd_index

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

    def _extract_sentiment_vote(self, text: str) -> str:
        """
        提取情绪投票（看涨/看跌/中性）

        Args:
            text: 文本内容

        Returns:
            投票类型
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
        title = item.get("post_title", "")
        content = item.get("post_content", "")
        full_content = f"{title} {content}"

        # 基于关键词的情感分析
        positive_score = sum(1 for word in self.POSITIVE_WORDS if word in full_content)
        negative_score = sum(1 for word in self.NEGATIVE_WORDS if word in full_content)

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
        # 股吧权重: read * 0.1 + comment * 3 + like * 1
        read_score = item.get("read_count", 0) * 0.1
        comment_score = item.get("comment_count", 0) * 3
        like_score = item.get("like_count", 0) * 1

        return int(read_score + comment_score + like_score)

    def _calculate_crowd_sentiment_index(self, posts: List[Dict]) -> int:
        """
        计算散户情绪指数 (0-100)

        Args:
            posts: 帖子列表

        Returns:
            散户情绪指数
        """
        if not posts:
            return 50

        bullish_count = sum(1 for post in posts if post.get("sentiment_vote") == "bullish")
        bearish_count = sum(1 for post in posts if post.get("sentiment_vote") == "bearish")
        total = len(posts)

        if total == 0:
            return 50

        # 计算情绪指数: 50 + (看涨比例 - 看跌比例) * 50
        bullish_ratio = bullish_count / total
        bearish_ratio = bearish_count / total

        index = int(50 + (bullish_ratio - bearish_ratio) * 50)
        return max(0, min(100, index))

    def _parse_datetime(self, dt_str: str) -> datetime:
        """
        解析日期时间字符串

        Args:
            dt_str: 日期时间字符串

        Returns:
            datetime对象
        """
        if not dt_str:
            return datetime.now()

        try:
            return datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
        except ValueError:
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
                "type": "1",
                "count": "1",
                "page": "1",
            }
            async with session.get(self.GUBA_URL, params=params, timeout=10) as response:
                return response.status == 200
        except Exception:
            return False

    async def close(self):
        """关闭采集器"""
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None
