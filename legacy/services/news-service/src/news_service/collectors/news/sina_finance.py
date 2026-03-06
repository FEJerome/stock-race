"""
新浪财经采集器

采集新浪财经新闻数据
"""

import aiohttp
import re
from typing import List, Dict, Any, Optional
from datetime import datetime

from news_service.collectors.base import BaseCollector


class SinaFinanceCollector(BaseCollector):
    """
    新浪财经采集器

    采集新浪财经新闻，分析股票提及和情感
    """

    # 新浪财经API
    NEWS_URL = "https://feed.mix.sina.com.cn/api/roll/get"

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
        "宁德时代": "300750.SZ",
        "中国平安": "601318.SH",
        "五粮液": "000858.SZ",
        "美的集团": "000333.SZ",
        "恒瑞医药": "600276.SH",
        "隆基绿能": "601012.SH",
    }

    # 情感词典
    POSITIVE_WORDS = ["大涨", "涨停", "牛市", "突破", "创新高", "利好", "强劲", "反弹", "上涨", "增长", "盈利", "超预期"]
    NEGATIVE_WORDS = ["暴跌", "跌停", "熊市", "崩盘", "跌破", "利空", "恐慌", "下跌", "亏损", "暴雷", "减持", "暴跌"]

    # 分类关键词
    CATEGORY_KEYWORDS = {
        "finance": ["A股", "股市", "股票", "证券", "基金", "理财", "银行", "保险"],
        "macro": ["央行", "降准", "降息", "GDP", "CPI", "通胀", "货币政策", "财政政策"],
        "company": ["财报", "业绩", "营收", "利润", "分红", "收购", "并购", "IPO"],
        "global": ["美股", "港股", "美联储", "全球经济", "国际贸易", "汇率"],
    }

    def __init__(self):
        super().__init__(name="sina_finance", priority=1)
        self.session: Optional[aiohttp.ClientSession] = None

    @property
    def source_name(self) -> str:
        return "sina"

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
        采集新浪财经新闻

        Returns:
            新闻数据列表
        """
        session = await self._get_session()

        try:
            await self._rate_limit(min_interval=5.0)

            params = {
                "pageid": "153",
                "lid": "2516",
                "num": "20",
                "versionNumber": "1.2.8",
                "page": "1",
                "encode": "utf-8"
            }

            async with session.get(self.NEWS_URL, params=params) as response:
                self._record_request(success=True)

                if response.status != 200:
                    raise Exception(f"API返回错误状态码: {response.status}")

                data = await response.json()
                return self._parse_news_list(data)

        except Exception as e:
            self._record_request(success=False)
            raise Exception(f"采集新浪财经新闻失败: {str(e)}")

    def _parse_news_list(self, data: Dict) -> List[Dict[str, Any]]:
        """
        解析新闻列表

        Args:
            data: API响应数据

        Returns:
            解析后的新闻数据列表
        """
        news_list = []

        result_data = data.get("result", {}).get("data", [])

        for item in result_data:
            title = item.get("title", "")
            summary = item.get("summary", "")
            content = f"{title} {summary}"

            news_item = {
                "title": title,
                "content": summary,
                "url": item.get("url", ""),
                "source": "sina",
                "platform": "sina",
                "category": self._categorize_news(content),
                "tags": item.get("keywords", "").split(",") if item.get("keywords") else [],
                "related_stocks": self._extract_stock_mentions(content),
                "sentiment": self._analyze_sentiment(item),
                "published_at": self._parse_datetime(item.get("ctime", "")),
                "collected_at": datetime.now(),
                "media": item.get("media", "新浪财经"),
                "read_count": item.get("read_count", 0),
                "comment_count": item.get("comment_count", 0),
                "share_count": item.get("share_count", 0),
            }
            news_list.append(news_item)

        return news_list

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

    def _analyze_sentiment(self, item: Dict) -> Dict[str, Any]:
        """
        分析新闻情感

        Args:
            item: 新闻项

        Returns:
            情感分析结果
        """
        title = item.get("title", "")
        summary = item.get("summary", "")
        content = f"{title} {summary}"

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
            item: 新闻项

        Returns:
            互动分数
        """
        return (
            item.get("read_count", 0) +
            item.get("comment_count", 0) +
            item.get("share_count", 0)
        )

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

    def _categorize_news(self, content: str) -> str:
        """
        对新闻进行分类

        Args:
            content: 新闻内容

        Returns:
            分类标签
        """
        # 不转换为小写，保持中文原样匹配

        for category, keywords in self.CATEGORY_KEYWORDS.items():
            for keyword in keywords:
                if keyword in content:
                    return category

        return "general"

    async def health_check(self) -> bool:
        """
        健康检查

        Returns:
            数据源是否可用
        """
        try:
            session = await self._get_session()
            params = {
                "pageid": "153",
                "lid": "2516",
                "num": "1",
                "encode": "utf-8"
            }
            async with session.get(self.NEWS_URL, params=params, timeout=10) as response:
                return response.status == 200
        except Exception:
            return False

    async def close(self):
        """关闭采集器"""
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None
