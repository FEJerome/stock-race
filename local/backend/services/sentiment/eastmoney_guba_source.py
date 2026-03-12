"""
东方财富股吧情绪数据源

采集东方财富网股吧帖子
API: 东方财富股吧讨论区
"""
import asyncio
import json
import re
from datetime import datetime
from typing import List, Optional
import aiohttp

from .base import SentimentSource, SentimentPost


class EastmoneyGubaSource(SentimentSource):
    """
    东方财富股吧数据源

    从东方财富网股吧讨论区采集用户帖子
    """

    BASE_URL = "https://guba.eastmoney.com"
    LIST_API = "https://guba.eastmoney.com/api/taobaolst"

    # 情绪关键词词典
    POSITIVE_WORDS = [
        "涨", "涨", "涨停", "大涨", "暴涨", "起飞", "吃肉", "挣钱", "赚钱",
        "牛市", "看多", "买入", "加仓", "抄底", "反弹", "突破", "创新高",
        "看好", "优质", "龙头", "利好", "增长", "爆发", "翻倍", "冲", "稳了"
    ]

    NEGATIVE_WORDS = [
        "跌", "跌", "跌停", "大跌", "暴跌", "亏", "割肉", "被套", "完",
        "熊市", "看空", "卖出", "减仓", "清仓", "跳水", "崩盘", "创新低",
        "看衰", "垃圾", "跑路", "利空", "亏损", "套牢", "血亏", "骗", "坑"
    ]

    def __init__(self, priority: int = 60):
        super().__init__(name="eastmoney_guba", priority=priority)
        self._session: Optional[aiohttp.ClientSession] = None

    def _get_session(self) -> aiohttp.ClientSession:
        """获取或创建HTTP会话"""
        if self._session is None or self._session.closed:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json, text/html, */*",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Referer": "https://guba.eastmoney.com/",
            }
            self._session = aiohttp.ClientSession(headers=headers)
        return self._session

    def _convert_time(self, time_str: str) -> datetime:
        """转换时间字符串为datetime"""
        try:
            # 格式: "2024-03-12 10:30:00" 或 "03-12 10:30"
            if len(time_str) == 16:  # MM-DD HH:MM
                year = datetime.now().year
                time_str = f"{year}-{time_str}"
                return datetime.strptime(time_str, "%Y-%m-%d %H:%M")
            elif len(time_str) == 19:  # YYYY-MM-DD HH:MM:SS
                return datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
        except:
            pass
        return datetime.utcnow()

    async def fetch_posts(self, symbol: str, limit: int = 20) -> List[SentimentPost]:
        """
        获取东方财富股吧帖子

        Args:
            symbol: 股票代码 (如 "000001.SZ")
            limit: 最大获取数量

        Returns:
            帖子列表
        """
        code = self._extract_code(symbol)

        # 判断市场
        if ".SH" in symbol or code.startswith("6"):
            market = "sh"
        else:
            market = "sz"

        try:
            session = self._get_session()

            # 东方财富股吧列表页
            guba_url = f"{self.BASE_URL}/{market}{code}.html"

            async with session.get(
                guba_url,
                timeout=aiohttp.ClientTimeout(total=15)
            ) as resp:
                if resp.status != 200:
                    self._last_error = f"HTTP {resp.status}"
                    return []

                html = await resp.text()
                return self._parse_html(html, symbol, limit)

        except asyncio.TimeoutError:
            self._last_error = "Timeout"
            return []
        except Exception as e:
            self._last_error = str(e)
            return []

    def _parse_html(self, html: str, symbol: str, limit: int) -> List[SentimentPost]:
        """解析股吧HTML页面"""
        posts = []

        try:
            # 提取帖子列表
            # 东方财富股吧列表项模式
            pattern = r'<div[^>]*class="articleh[^"]*"[^>]*>.*?<span[^>]*class="l6[^"]*"[^>]*>(.*?)</span>.*?<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>.*?<span[^>]*class="l1[^"]*"[^>]*>(\d+)</span>.*?<span[^>]*class="l2[^"]*"[^>]*>(\d+)</span>.*?<span[^>]*class="l5[^"]*"[^>]*>(.*?)</span>.*?</div>'
            matches = re.findall(pattern, html, re.DOTALL)

            for i, match in enumerate(matches[:limit]):
                try:
                    author = re.sub(r'<[^>]+>', '', match[0]).strip()
                    href = match[1].strip()
                    title = re.sub(r'<[^>]+>', '', match[2]).strip()
                    views = int(match[3]) if match[3].isdigit() else 0
                    comments = int(match[4]) if match[4].isdigit() else 0
                    time_str = re.sub(r'<[^>]+>', '', match[5]).strip()

                    # 构建完整URL
                    if href.startswith("http"):
                        url = href
                    else:
                        url = self.BASE_URL + href

                    post_id = self._generate_id(url)

                    post = SentimentPost(
                        id=post_id,
                        symbol=symbol,
                        title=title[:100],
                        content=title[:200],  # 列表页只有标题
                        author=author or "匿名",
                        source="eastmoney_guba",
                        url=url,
                        publish_time=self._convert_time(time_str),
                        likes=views // 20,  # 估算
                        comments=comments,
                        views=views,
                    )
                    posts.append(post)

                except Exception:
                    continue

            # 如果没匹配到，尝试简单模式
            if not posts:
                posts = self._parse_simple(html, symbol, limit)

        except Exception as e:
            self._last_error = f"Parse error: {e}"

        self._last_fetch_time = datetime.utcnow()
        return posts

    def _parse_simple(self, html: str, symbol: str, limit: int) -> List[SentimentPost]:
        """简单解析模式"""
        posts = []

        try:
            # 查找所有帖子链接
            pattern = r'<a[^>]*href="(/news[^"]*)"[^>]*>([^<]+)</a>'
            matches = re.findall(pattern, html)

            seen = set()
            for href, title in matches[:limit]:
                if href in seen:
                    continue
                seen.add(href)

                url = self.BASE_URL + href if not href.startswith("http") else href
                post_id = self._generate_id(url)

                post = SentimentPost(
                    id=post_id,
                    symbol=symbol,
                    title=title[:100].strip(),
                    content=title[:200].strip(),
                    author="股吧用户",
                    source="eastmoney_guba",
                    url=url,
                    publish_time=datetime.utcnow(),
                    likes=0,
                    comments=0,
                    views=0,
                )
                posts.append(post)

        except Exception:
            pass

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
