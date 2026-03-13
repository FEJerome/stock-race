"""
上交所公告采集器 - SSE Announcement Collector

⚠️ 警告：当前上交所 API 不可用（返回 SOA service is null）
该数据源已被禁用，请勿在生产环境使用。

采集上海证券交易所的官方公告，包括：
- 定期报告
- 临时公告
- 业绩快报

API endpoints:
- http://query.sse.com.cn/commonSoaQuery.do - 上交所公告查询API（已失效）
"""
import asyncio
import aiohttp
import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Optional, List
from urllib.parse import quote

from .base import NewsSource, NewsItem, NewsSourceHealth, NewsSourceStatus


class SSEAnnouncementSource(NewsSource):
    """
    上海证券交易所公告采集器

    直接从上交所官网采集公告数据，包括定期报告、临时公告等。

    Usage:
        source = SSEAnnouncementSource()
        announcements = await source.fetch_news("600000.SH", limit=10)
    """

    # 上交所公告查询API（当前不可用）
    QUERY_URL = "http://query.sse.com.cn/commonSoaQuery.do"

    # ⚠️ API 已失效，返回 SOA service is null
    _API_DISABLED = True

    def __init__(self, priority: int = 55):
        """
        初始化上交所公告采集器

        Args:
            priority: 源优先级（越低越优先，默认55）
        """
        super().__init__(name="sse_announcement", priority=priority)
        self._session: Optional[aiohttp.ClientSession] = None
        if self._API_DISABLED:
            print("[SSEAnnouncementSource] Warning: SSE API is currently unavailable, source disabled")

    def _get_session(self) -> aiohttp.ClientSession:
        """获取或创建HTTP会话"""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Referer": "http://www.sse.com.cn/",
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                    "X-Requested-With": "XMLHttpRequest",
                }
            )
        return self._session

    def _normalize_symbol(self, symbol: str) -> str:
        """
        标准化股票代码为6位数字

        Args:
            symbol: 股票代码 (如 "600000.SH", "sh600000")

        Returns:
            6位数字代码
        """
        symbol = symbol.upper()

        if symbol.startswith("SH"):
            return symbol[2:]
        elif ".SH" in symbol:
            return symbol.split(".")[0]
        elif symbol.startswith("6"):
            return symbol

        # 如果不是上交所股票，返回空
        return symbol

    def _generate_id(self, url: str) -> str:
        """使用URL MD5生成唯一ID"""
        return hashlib.md5(url.encode("utf-8")).hexdigest()

    async def fetch_news(self, symbol: str, limit: int = 10) -> List[NewsItem]:
        """
        采集上交所公告

        Args:
            symbol: 股票代码 (如 "600000.SH")
            limit: 最大采集数量

        Returns:
            NewsItem列表（API 禁用时返回空列表）
        """
        # API 已禁用，直接返回空
        if self._API_DISABLED:
            return []

        code = self._normalize_symbol(symbol)

        # 只处理上交所股票（6开头）
        if not code.startswith("6"):
            return []

        try:
            session = self._get_session()

            # 上交所公告查询参数
            params = {
                "sqlId": "COMMON_SSE_SCP_GGJG_SCP_GGJGKHGS_C",
                "productId": code,
                "pageHelp.pageSize": str(limit),
                "pageHelp.pageNo": "1",
                "pageHelp.beginPage": "1",
                "pageHelp.endPage": "1",
                "pageHelp.cacheSize": "1",
                "_": str(int(datetime.now(timezone.utc).timestamp() * 1000)),
            }

            async with session.get(
                self.QUERY_URL,
                params=params,
                timeout=aiohttp.ClientTimeout(total=15)
            ) as resp:
                if resp.status != 200:
                    print(f"[SSEAnnouncementSource] HTTP {resp.status} for {symbol}")
                    return []

                text = await resp.text()
                return self._parse_response(text, symbol, limit)

        except asyncio.TimeoutError:
            print(f"[SSEAnnouncementSource] Timeout fetching announcements for {symbol}")
            return []
        except Exception as e:
            print(f"[SSEAnnouncementSource] Error fetching announcements for {symbol}: {e}")
            return []

    def _parse_response(self, text: str, symbol: str, limit: int) -> List[NewsItem]:
        """
        解析上交所公告API响应

        Args:
            text: JSON响应文本
            symbol: 股票代码
            limit: 最大返回数量

        Returns:
            NewsItem列表
        """
        items = []

        try:
            data = json.loads(text)
            announcements = data.get("pageHelp", {}).get("data", [])

            for ann in announcements[:limit]:
                try:
                    title = ann.get("title", "").strip()
                    if not title:
                        continue

                    # 清理HTML标签
                    title = re.sub(r"<[^>]+>", "", title)

                    # 构建公告链接
                    doc_id = ann.get("docId", "")
                    url = f"http://static.sse.com.cn/disclosure/listedinfo/announcement/c/{doc_id}.pdf"

                    # 解析发布时间
                    pub_date = ann.get("publishDate", "")
                    if pub_date:
                        # 格式: 2024-01-15 10:30:00
                        try:
                            publish_time = datetime.strptime(pub_date, "%Y-%m-%d %H:%M:%S")
                        except ValueError:
                            try:
                                publish_time = datetime.strptime(pub_date[:10], "%Y-%m-%d")
                            except ValueError:
                                publish_time = datetime.now(timezone.utc)
                    else:
                        publish_time = datetime.now(timezone.utc)

                    # 获取公告类型
                    ann_type = ann.get("bulletin_Type", "公告")

                    item = NewsItem(
                        id=self._generate_id(url),
                        symbol=symbol,
                        title=title[:100],
                        summary=f"[{ann_type}] {title}"[:300],
                        source="sse_announcement",
                        url=url,
                        publish_time=publish_time,
                        collected_at=datetime.now(timezone.utc)
                    )
                    items.append(item)

                except Exception as e:
                    print(f"[SSEAnnouncementSource] Error parsing announcement: {e}")
                    continue

        except json.JSONDecodeError as e:
            print(f"[SSEAnnouncementSource] JSON parse error: {e}")
        except Exception as e:
            print(f"[SSEAnnouncementSource] Parse error: {e}")

        return items

    async def fetch_by_keywords(self, keywords: List[str], limit: int = 10) -> List[NewsItem]:
        """
        按关键词搜索公告

        Args:
            keywords: 关键词列表
            limit: 最大数量

        Returns:
            NewsItem列表
        """
        # 上交所API暂不支持关键词搜索，返回空列表
        return []

    async def health_check(self) -> NewsSourceHealth:
        """检查数据源健康状态"""
        import time

        # API 已禁用，直接返回不可用状态
        if self._API_DISABLED:
            self._update_health(NewsSourceStatus.UNAVAILABLE, 0, False)
            return self._health

        start_time = time.time()

        # 使用浦发银行(600000)测试
        test_symbol = "600000"

        try:
            session = self._get_session()

            params = {
                "sqlId": "COMMON_SSE_SCP_GGJG_SCP_GGJGKHGS_C",
                "productId": test_symbol,
                "pageHelp.pageSize": "1",
                "pageHelp.pageNo": "1",
                "_": str(int(datetime.now(timezone.utc).timestamp() * 1000)),
            }

            async with session.get(
                self.QUERY_URL,
                params=params,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                latency_ms = (time.time() - start_time) * 1000

                if resp.status == 200:
                    text = await resp.text()
                    try:
                        data = json.loads(text)
                        if "pageHelp" in data:
                            self._update_health(NewsSourceStatus.HEALTHY, latency_ms, True)
                        else:
                            self._update_health(NewsSourceStatus.DEGRADED, latency_ms, False)
                    except json.JSONDecodeError:
                        self._update_health(NewsSourceStatus.DEGRADED, latency_ms, False)
                else:
                    self._update_health(NewsSourceStatus.UNAVAILABLE, latency_ms, False)

        except asyncio.TimeoutError:
            latency_ms = (time.time() - start_time) * 1000
            self._update_health(NewsSourceStatus.UNAVAILABLE, latency_ms, False)
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            print(f"[SSEAnnouncementSource] Health check error: {e}")
            self._update_health(NewsSourceStatus.UNAVAILABLE, latency_ms, False)

        return self._health

    async def close(self):
        """关闭HTTP会话"""
        if self._session and not self._session.closed:
            await self._session.close()
