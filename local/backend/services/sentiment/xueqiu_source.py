"""
雪球网情绪数据源

采集雪球网个股讨论区帖子
API: https://xueqiu.com (需Cookie认证)
"""
import asyncio
import json
import re
from datetime import datetime
from typing import List, Optional
import aiohttp

from .base import SentimentSource, SentimentPost


class XueqiuSentimentSource(SentimentSource):
    """
    雪球网情绪数据源

    从雪球个股讨论区采集用户帖子
    """

    BASE_URL = "https://xueqiu.com"
    STOCK_PAGE_URL = "https://xueqiu.com/S/{symbol}"
    ARTICLE_API = "https://xueqiu.com/query/v1/symbol/search/status"

    # 情绪关键词词典
    POSITIVE_WORDS = [
        "涨", "涨", "涨停", "大涨", "暴涨", "涨涨涨", "起飞", "吃肉",
        "牛市", "看多", "买入", "加仓", "抄底", "反弹", "突破",
        "看好", "优质", "龙头", "利好", "增长", "爆发", "翻倍"
    ]

    NEGATIVE_WORDS = [
        "跌", "跌", "跌停", "大跌", "暴跌", "跌跌不休", "亏", "割肉",
        "熊市", "看空", "卖出", "减仓", "清仓", "跳水", "崩盘",
        "看衰", "垃圾", "跑路", "利空", "亏损", "套牢", "血亏"
    ]

    def __init__(self, priority: int = 50):
        super().__init__(name="xueqiu", priority=priority)
        self._session: Optional[aiohttp.ClientSession] = None
        self._cookie: Optional[str] = None

    def _get_session(self) -> aiohttp.ClientSession:
        """获取或创建HTTP会话"""
        if self._session is None or self._session.closed:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0",
                "Accept": "application/json, text/javascript, */*",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "Referer": "https://xueqiu.com/",
            }
            if self._cookie:
                headers["Cookie"] = self._cookie

            self._session = aiohttp.ClientSession(headers=headers)
        return self._session

    async def _get_cookie(self) -> bool:
        """获取访问Cookie"""
        try:
            session = self._get_session()
            async with session.get(self.BASE_URL, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    # 从响应头中提取Cookie
                    cookies = resp.headers.getall('Set-Cookie', [])
                    cookie_str = '; '.join([c.split(';')[0] for c in cookies])
                    if cookie_str:
                        self._cookie = cookie_str
                        # 更新会话头
                        self._session.headers.update({"Cookie": self._cookie})
                    return True
        except Exception as e:
            self._last_error = f"Failed to get cookie: {e}"
        return False

    def _convert_timestamp(self, timestamp_ms: int) -> datetime:
        """转换时间戳为datetime"""
        return datetime.fromtimestamp(timestamp_ms / 1000)

    async def fetch_posts(self, symbol: str, limit: int = 20) -> List[SentimentPost]:
        """
        获取雪球网个股讨论帖子

        Args:
            symbol: 股票代码 (如 "000001.SZ")
            limit: 最大获取数量

        Returns:
            帖子列表
        """
        code = self._extract_code(symbol)

        # 转换代码格式 (000001.SZ -> SH600000 或 SZ000001)
        if ".SH" in symbol:
            xueqiu_symbol = f"SH{code}"
        else:
            xueqiu_symbol = f"SZ{code}"

        try:
            session = self._get_session()

            # 首先访问股票页面获取Cookie
            if not self._cookie:
                await self._get_cookie()

            params = {
                "symbol": xueqiu_symbol,
                "count": min(limit, 20),
                "page": 1,
                "sort": "time",  # 按时间排序
                "comment": 0,
            }

            async with session.get(
                self.ARTICLE_API,
                params=params,
                timeout=aiohttp.ClientTimeout(total=15)
            ) as resp:
                if resp.status == 403:
                    # Cookie失效，重新获取
                    if await self._get_cookie():
                        return await self.fetch_posts(symbol, limit)
                    return []

                if resp.status != 200:
                    self._last_error = f"HTTP {resp.status}"
                    return []

                data = await resp.json()
                return self._parse_posts(data, symbol)

        except asyncio.TimeoutError:
            self._last_error = "Timeout"
            return []
        except Exception as e:
            self._last_error = str(e)
            return []

    def _parse_posts(self, data: dict, symbol: str) -> List[SentimentPost]:
        """解析API响应数据"""
        posts = []

        try:
            articles = data.get("data", {}).get("articles", [])

            for article in articles:
                try:
                    article_id = str(article.get("id", ""))
                    title = article.get("title", "").strip()
                    description = article.get("description", "").strip()
                    content = article.get("text", description)

                    if not article_id:
                        continue

                    # 构建URL
                    url = f"https://xueqiu.com/{article.get('user_id', '')}/{article_id}"

                    # 解析时间
                    created_at = article.get("created_at", 0)
                    publish_time = self._convert_timestamp(created_at) if created_at else datetime.utcnow()

                    # 获取用户信息
                    user = article.get("user", {})
                    author = user.get("screen_name", "匿名")

                    post = SentimentPost(
                        id=self._generate_id(url),
                        symbol=symbol,
                        title=title[:100] if title else content[:50] + "...",
                        content=content[:500],
                        author=author,
                        source="xueqiu",
                        url=url,
                        publish_time=publish_time,
                        likes=article.get("view_count", 0) // 10,  # 估算点赞数
                        comments=article.get("reply_count", 0),
                        views=article.get("view_count", 0),
                    )
                    posts.append(post)

                except Exception:
                    continue

        except Exception as e:
            self._last_error = f"Parse error: {e}"

        self._last_fetch_time = datetime.utcnow()
        return posts

    async def health_check(self) -> bool:
        """检查数据源健康状态"""
        try:
            session = self._get_session()
            async with session.get(
                self.BASE_URL,
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                return resp.status == 200
        except:
            return False

    async def close(self):
        """关闭HTTP会话"""
        if self._session and not self._session.closed:
            await self._session.close()

    def classify_sentiment(self, text: str) -> str:
        """
        简单情绪分类

        Args:
            text: 帖子文本

        Returns:
            "positive" | "negative" | "neutral"
        """
        text = text.lower()

        pos_count = sum(1 for word in self.POSITIVE_WORDS if word in text)
        neg_count = sum(1 for word in self.NEGATIVE_WORDS if word in text)

        if pos_count > neg_count:
            return "positive"
        elif neg_count > pos_count:
            return "negative"
        else:
            return "neutral"
