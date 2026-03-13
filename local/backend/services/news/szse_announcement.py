"""
深交所公告采集器 - SZSE Announcement Collector

采集深圳证券交易所的官方公告，包括：
- 主板公告
- 创业板公告
- 定期报告
- 临时公告

API endpoints:
- http://www.szse.cn/api/disc/announcement/annList - 深交所公告列表API
"""
import asyncio
import aiohttp
import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from .base import NewsSource, NewsItem, NewsSourceHealth, NewsSourceStatus


class SZSEAnnouncementSource(NewsSource):
    """
    深圳证券交易所公告采集器

    直接从深交所官网采集公告数据。

    Usage:
        source = SZSEAnnouncementSource()
        announcements = await source.fetch_news("000001.SZ", limit=10)
    """

    # 深交所公告列表API
    ANN_LIST_URL = "http://www.szse.cn/api/disc/announcement/annList"

    def __init__(self, priority: int = 56):
        """
        初始化深交所公告采集器

        Args:
            priority: 源优先级（越低越优先，默认56）
        """
        super().__init__(name="szse_announcement", priority=priority)
        self._session: Optional[aiohttp.ClientSession] = None

    def _get_session(self) -> aiohttp.ClientSession:
        """获取或创建HTTP会话"""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Referer": "http://www.szse.cn/",
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                    "X-Requested-With": "XMLHttpRequest",
                    "Content-Type": "application/json",
                }
            )
        return self._session

    def _normalize_symbol(self, symbol: str) -> str:
        """
        标准化股票代码为6位数字

        Args:
            symbol: 股票代码 (如 "000001.SZ", "sz000001")

        Returns:
            6位数字代码
        """
        symbol = symbol.upper()

        if symbol.startswith("SZ"):
            return symbol[2:]
        elif ".SZ" in symbol:
            return symbol.split(".")[0]
        elif symbol.startswith(("0", "3")):
            return symbol

        return symbol

    def _is_szse_stock(self, code: str) -> bool:
        """
        判断是否为深交所股票

        Args:
            code: 6位数字代码

        Returns:
            是否为深交所股票
        """
        # 深交所主板: 000xxx
        # 深交所中小板(已合并): 002xxx
        # 深交所创业板: 300xxx, 301xxx
        return bool(re.match(r'^(000|001|002|003|300|301|302)', code))

    def _generate_id(self, url: str) -> str:
        """使用URL MD5生成唯一ID"""
        return hashlib.md5(url.encode("utf-8")).hexdigest()

    def _build_request_body(self, code: str, page_size: int) -> Dict[str, Any]:
        """
        构建深交所API请求体

        Args:
            code: 6位数字股票代码
            page_size: 每页数量

        Returns:
            请求体字典
        """
        # 深交所公告类型映射
        # 类别编码: categoryId_jzll=定期报告, categoryId_jjgg=决议公告, categoryId_yjdbg=业绩预告
        category_codes = [
            "category_ndbg_szsh",  # 年度报告
            "category_bndbg_szsh",  # 半年度报告
            "category_jdbg_szsh",  # 季度报告
            "category_yjdbg_szsh",  # 业绩预告
            "category_qtzdsx_szsh",  # 其他重大事项
        ]

        return {
            "seDate": ["", ""],
            "stock": [code],
            "channelCode": ["szse_main", "szse_cyb"],  # 主板和创业板
            "pageSize": str(page_size),
            "pageNum": "1",
        }

    async def fetch_news(self, symbol: str, limit: int = 10) -> List[NewsItem]:
        """
        采集深交所公告

        Args:
            symbol: 股票代码 (如 "000001.SZ")
            limit: 最大采集数量

        Returns:
            NewsItem列表
        """
        code = self._normalize_symbol(symbol)

        # 只处理深交所股票
        if not self._is_szse_stock(code):
            return []

        try:
            session = self._get_session()

            # 构建请求体
            body = self._build_request_body(code, limit)

            async with session.post(
                self.ANN_LIST_URL,
                json=body,
                timeout=aiohttp.ClientTimeout(total=15)
            ) as resp:
                if resp.status != 200:
                    print(f"[SZSEAnnouncementSource] HTTP {resp.status} for {symbol}")
                    return []

                text = await resp.text()
                return self._parse_response(text, symbol, limit)

        except asyncio.TimeoutError:
            print(f"[SZSEAnnouncementSource] Timeout fetching announcements for {symbol}")
            return []
        except Exception as e:
            print(f"[SZSEAnnouncementSource] Error fetching announcements for {symbol}: {e}")
            return []

    def _parse_response(self, text: str, symbol: str, limit: int) -> List[NewsItem]:
        """
        解析深交所公告API响应

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
            announcements = data.get("data", [])

            for ann in announcements[:limit]:
                try:
                    title = ann.get("title", "").strip()
                    if not title:
                        continue

                    # 清理HTML标签
                    title = re.sub(r"<[^>]+>", "", title)

                    # 获取公告路径
                    adjunct_url = ann.get("adjunctUrl", "")
                    if adjunct_url:
                        url = f"http://disc.static.szse.cn/disc/disk01/finalpage/{adjunct_url}"
                    else:
                        # 如果没有附件URL，使用公告详情页
                        ann_id = ann.get("id", "")
                        url = f"http://www.szse.cn/disclosure/listed/bulletinDetail/index.html?id={ann_id}"

                    # 解析发布时间
                    pub_date = ann.get("publishTime", "")
                    if pub_date:
                        # 格式可能是时间戳或字符串
                        try:
                            # 尝试解析时间戳(毫秒)
                            timestamp = int(pub_date) / 1000
                            publish_time = datetime.fromtimestamp(timestamp)
                        except (ValueError, TypeError):
                            try:
                                # 尝试解析日期字符串
                                publish_time = datetime.strptime(pub_date, "%Y-%m-%d %H:%M:%S")
                            except ValueError:
                                try:
                                    publish_time = datetime.strptime(pub_date[:10], "%Y-%m-%d")
                                except ValueError:
                                    publish_time = datetime.now(timezone.utc)
                    else:
                        publish_time = datetime.now(timezone.utc)

                    # 获取公告类型
                    ann_type = ann.get("announcementTypeName", "公告")

                    item = NewsItem(
                        id=self._generate_id(url),
                        symbol=symbol,
                        title=title[:100],
                        summary=f"[{ann_type}] {title}"[:300],
                        source="szse_announcement",
                        url=url,
                        publish_time=publish_time,
                        collected_at=datetime.now(timezone.utc)
                    )
                    items.append(item)

                except Exception as e:
                    print(f"[SZSEAnnouncementSource] Error parsing announcement: {e}")
                    continue

        except json.JSONDecodeError as e:
            print(f"[SZSEAnnouncementSource] JSON parse error: {e}")
        except Exception as e:
            print(f"[SZSEAnnouncementSource] Parse error: {e}")

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
        # 深交所API暂不支持关键词搜索，返回空列表
        return []

    async def health_check(self) -> NewsSourceHealth:
        """检查数据源健康状态"""
        import time

        start_time = time.time()

        # 使用平安银行(000001)测试
        test_symbol = "000001"

        try:
            session = self._get_session()

            body = self._build_request_body(test_symbol, 1)

            async with session.post(
                self.ANN_LIST_URL,
                json=body,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                latency_ms = (time.time() - start_time) * 1000

                if resp.status == 200:
                    text = await resp.text()
                    try:
                        data = json.loads(text)
                        if "data" in data:
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
            print(f"[SZSEAnnouncementSource] Health check error: {e}")
            self._update_health(NewsSourceStatus.UNAVAILABLE, latency_ms, False)

        return self._health

    async def close(self):
        """关闭HTTP会话"""
        if self._session and not self._session.closed:
            await self._session.close()
