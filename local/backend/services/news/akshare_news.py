"""
基于 AKShare 的新闻/公告采集器

使用 AKShare 库获取可靠的财经新闻和公告数据。
AKShare 提供稳定的中国金融数据接口。
"""
import asyncio
import hashlib
import re
import sys
from datetime import datetime, timezone
from typing import Optional, List

from .base import NewsSource, NewsItem, NewsSourceHealth, NewsSourceStatus


def _safe_print(msg: str):
    """安全打印（处理Windows编码）"""
    try:
        print(msg)
    except UnicodeEncodeError:
        # Windows控制台编码问题
        print(msg.encode('utf-8', errors='ignore').decode('utf-8', errors='ignore'))


class AKShareNewsSource(NewsSource):
    """
    基于 AKShare 的新闻采集器

    使用 stock_news_em 获取东方财富个股新闻。

    Usage:
        source = AKShareNewsSource()
        news = await source.fetch_news("000001.SZ", limit=10)
    """

    def __init__(self, priority: int = 45):
        """
        初始化 AKShare 新闻采集器

        Args:
            priority: 源优先级（越低越优先，默认45）
        """
        super().__init__(name="akshare_news", priority=priority)

    def _normalize_symbol(self, symbol: str) -> str:
        """标准化股票代码为6位数字"""
        symbol = symbol.upper()
        if "." in symbol:
            return symbol.split(".")[0]
        return symbol

    def _generate_id(self, url: str) -> str:
        """使用URL MD5生成唯一ID"""
        return hashlib.md5(url.encode("utf-8")).hexdigest()

    async def fetch_news(self, symbol: str, limit: int = 10) -> List[NewsItem]:
        """
        采集新闻数据

        Args:
            symbol: 股票代码 (如 "000001.SZ")
            limit: 最大采集数量

        Returns:
            NewsItem列表
        """
        code = self._normalize_symbol(symbol)

        # 在后台线程中执行同步的 akshare 调用
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._fetch_news_sync, code, symbol, limit
        )

    def _fetch_news_sync(self, code: str, symbol: str, limit: int) -> List[NewsItem]:
        """同步方法：获取新闻数据"""
        items = []

        try:
            import akshare as ak

            # 使用 stock_news_em 获取东方财富新闻
            df = ak.stock_news_em(symbol=code)

            if df is None or df.empty:
                return items

            # 限制数量
            df = df.head(limit)

            for _, row in df.iterrows():
                try:
                    # 获取标题和内容
                    title = str(row.get("新闻标题", "")).strip()
                    content = str(row.get("新闻内容", "")).strip()

                    if not title:
                        continue

                    # 清理HTML标签
                    title = re.sub(r"<[^>]+>", "", title)
                    content = re.sub(r"<[^>]+>", "", content)

                    # 获取URL
                    url = str(row.get("新闻链接", ""))
                    if not url or url == "nan":
                        url = f"https://data.eastmoney.com/notices/detail/{code}.html"

                    # 解析发布时间
                    pub_time = str(row.get("发布时间", ""))
                    try:
                        # 格式: 2026-03-10 15:22:39
                        publish_time = datetime.strptime(pub_time, "%Y-%m-%d %H:%M:%S")
                    except ValueError:
                        publish_time = datetime.now(timezone.utc)

                    # 获取来源
                    source_name = str(row.get("文章来源", "东方财富"))

                    item = NewsItem(
                        id=self._generate_id(url),
                        symbol=symbol,
                        title=title[:100],
                        summary=content[:300] if content else title[:300],
                        source="akshare_news",
                        url=url,
                        publish_time=publish_time,
                        collected_at=datetime.now(timezone.utc)
                    )
                    items.append(item)

                except Exception:
                    continue

        except ImportError:
            _safe_print("[AKShareNewsSource] akshare not installed")
        except Exception as e:
            _safe_print(f"[AKShareNewsSource] Error fetching news: {e}")

        return items

    async def fetch_by_keywords(self, keywords: List[str], limit: int = 10) -> List[NewsItem]:
        """按关键词搜索"""
        return []

    async def health_check(self) -> NewsSourceHealth:
        """检查数据源健康状态"""
        import time
        start_time = time.time()

        try:
            import akshare as ak
            # 简单测试：获取平安银行的新闻
            df = ak.stock_news_em(symbol="000001")
            latency_ms = (time.time() - start_time) * 1000

            if df is not None and len(df) > 0:
                self._update_health(NewsSourceStatus.HEALTHY, latency_ms, True)
            else:
                self._update_health(NewsSourceStatus.DEGRADED, latency_ms, False)
        except ImportError:
            latency_ms = (time.time() - start_time) * 1000
            self._update_health(NewsSourceStatus.UNAVAILABLE, latency_ms, False)
        except Exception:
            latency_ms = (time.time() - start_time) * 1000
            self._update_health(NewsSourceStatus.UNAVAILABLE, latency_ms, False)

        return self._health

    async def close(self):
        """关闭资源"""
        pass


class AKShareAnnouncementSource(NewsSource):
    """
    基于 AKShare 的公告采集器

    使用 stock_notice_report 获取公告数据。
    注意：此接口返回的是全市场公告，需要按股票代码过滤。
    """

    def __init__(self, priority: int = 46):
        super().__init__(name="akshare_announcement", priority=priority)

    def _normalize_symbol(self, symbol: str) -> str:
        """标准化股票代码"""
        symbol = symbol.upper()
        if "." in symbol:
            return symbol.split(".")[0]
        return symbol

    def _generate_id(self, url: str) -> str:
        """使用URL MD5生成唯一ID"""
        return hashlib.md5(url.encode("utf-8")).hexdigest()

    async def fetch_news(self, symbol: str, limit: int = 10) -> List[NewsItem]:
        """采集公告"""
        code = self._normalize_symbol(symbol)

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._fetch_announcements_sync, code, symbol, limit
        )

    def _fetch_announcements_sync(self, code: str, symbol: str, limit: int) -> List[NewsItem]:
        """同步获取公告"""
        items = []

        try:
            import akshare as ak

            # 使用 stock_news_em 获取新闻/公告混合数据
            # 注意：akshare 没有专门的个股公告接口，使用新闻接口代替
            df = ak.stock_news_em(symbol=code)

            if df is None or df.empty:
                return items

            # 限制数量
            df = df.head(limit)

            for _, row in df.iterrows():
                try:
                    title = str(row.get("新闻标题", "")).strip()
                    content = str(row.get("新闻内容", "")).strip()

                    if not title:
                        continue

                    # 清理HTML
                    title = re.sub(r"<[^>]+>", "", title)
                    content = re.sub(r"<[^>]+>", "", content)

                    # 获取URL
                    url = str(row.get("新闻链接", ""))
                    if not url or url == "nan":
                        url = f"https://data.eastmoney.com/notices/detail/{code}.html"

                    # 解析日期
                    pub_time = str(row.get("发布时间", ""))
                    try:
                        publish_time = datetime.strptime(pub_time, "%Y-%m-%d %H:%M:%S")
                    except ValueError:
                        publish_time = datetime.now(timezone.utc)

                    item = NewsItem(
                        id=self._generate_id(url),
                        symbol=symbol,
                        title=title[:100],
                        summary=content[:300] if content else title[:300],
                        source="akshare_announcement",
                        url=url,
                        publish_time=publish_time,
                        collected_at=datetime.now(timezone.utc)
                    )
                    items.append(item)

                except Exception:
                    continue

        except ImportError:
            _safe_print("[AKShareAnnouncementSource] akshare not installed")
        except Exception as e:
            _safe_print(f"[AKShareAnnouncementSource] Error: {e}")

        return items

    async def fetch_by_keywords(self, keywords: List[str], limit: int = 10) -> List[NewsItem]:
        return []

    async def health_check(self) -> NewsSourceHealth:
        import time
        start_time = time.time()

        try:
            import akshare as ak
            df = ak.stock_news_em(symbol="000001")
            latency_ms = (time.time() - start_time) * 1000

            if df is not None and len(df) > 0:
                self._update_health(NewsSourceStatus.HEALTHY, latency_ms, True)
            else:
                self._update_health(NewsSourceStatus.DEGRADED, latency_ms, False)
        except Exception:
            latency_ms = (time.time() - start_time) * 1000
            self._update_health(NewsSourceStatus.UNAVAILABLE, latency_ms, False)

        return self._health

    async def close(self):
        pass
