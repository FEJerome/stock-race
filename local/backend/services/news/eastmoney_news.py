"""
EastMoney News Source - News collection from East Money

API endpoints:
- East Money Data Center API

Reference: local/backend/services/market_data/eastmoney_source.py
"""
import asyncio
import aiohttp
import hashlib
import re
from datetime import datetime
from typing import Optional, List

from .base import NewsSource, NewsItem, NewsSourceHealth, NewsSourceStatus


class EastmoneyNewsSource(NewsSource):
    """
    East Money (东方财富) news source

    Provides A-share company announcements via East Money platform.
    """

    DATA_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get"

    def __init__(self, priority: int = 60):
        super().__init__(name="eastmoney", priority=priority)
        self._session: Optional[aiohttp.ClientSession] = None

    def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            )
        return self._session

    def _generate_id(self, url: str) -> str:
        return hashlib.md5(url.encode()).hexdigest()

    def _normalize_symbol(self, symbol: str) -> str:
        return symbol.split('.')[0]

    async def fetch_news(self, symbol: str, limit: int = 10) -> List[NewsItem]:
        code = self._normalize_symbol(symbol)

        try:
            session = self._get_session()

            params = {
                "sortColumns": "NOTICEDATE",
                "sortTypes": "-1",
                "pageSize": str(limit),
                "pageNumber": "1",
                "reportName": "RPT_WEB_PUBLICNOTICE",
                "columns": "ALL",
                "filter": f'(SECURITYCODE="{code}")'
            }

            async with session.get(
                self.DATA_URL,
                params=params,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status != 200:
                    return []

                data = await resp.json()
                return self._parse_response(data, symbol, limit)

        except asyncio.TimeoutError:
            print(f"[EastmoneyNewsSource] Timeout fetching news for {symbol}")
            return []
        except Exception as e:
            print(f"[EastmoneyNewsSource] Error fetching news for {symbol}: {e}")
            return []

    def _parse_response(self, data: dict, symbol: str, limit: int) -> List[NewsItem]:
        items = []

        try:
            result = data.get('result', {})
            data_list = result.get('data', [])

            for item_data in data_list[:limit]:
                try:
                    art_code = item_data.get('ARTICLECODE', '')
                    notice_title = item_data.get('NOTICETITLE', '')
                    notice_date = item_data.get('NOTICEDATE', '')

                    if not art_code or not notice_title:
                        continue

                    url = f"https://data.eastmoney.com/notices/detail/{symbol.split('.')[0]}/{art_code}.html"

                    try:
                        publish_time = datetime.strptime(notice_date[:19], "%Y-%m-%d %H:%M:%S")
                    except (ValueError, IndexError):
                        publish_time = datetime.utcnow()

                    title = notice_title.strip()
                    title = re.sub(r'<[^>]+>', '', title)

                    item = NewsItem(
                        id=self._generate_id(url),
                        symbol=symbol,
                        title=title[:100],
                        summary=title[:300],
                        source="eastmoney",
                        url=url,
                        publish_time=publish_time,
                        collected_at=datetime.utcnow()
                    )
                    items.append(item)

                except Exception:
                    continue

        except Exception as e:
            print(f"[EastmoneyNewsSource] Parse error: {e}")

        return items

    async def fetch_by_keywords(self, keywords: List[str], limit: int = 10) -> List[NewsItem]:
        return []

    async def health_check(self) -> NewsSourceHealth:
        import time
        start_time = time.time()

        test_symbol = "000001"
        try:
            session = self._get_session()

            params = {
                "sortColumns": "NOTICEDATE",
                "sortTypes": "-1",
                "pageSize": "1",
                "pageNumber": "1",
                "reportName": "RPT_WEB_PUBLICNOTICE",
                "columns": "ALL",
                "filter": f'(SECURITYCODE="{test_symbol}")'
            }

            async with session.get(
                self.DATA_URL,
                params=params,
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                latency_ms = (time.time() - start_time) * 1000

                if resp.status == 200:
                    data = await resp.json()
                    result = data.get('result', {})
                    if result and 'data' in result:
                        self._update_health(NewsSourceStatus.HEALTHY, latency_ms, True)
                    else:
                        self._update_health(NewsSourceStatus.DEGRADED, latency_ms, False)
                else:
                    self._update_health(NewsSourceStatus.UNAVAILABLE, latency_ms, False)

        except asyncio.TimeoutError:
            latency_ms = (time.time() - start_time) * 1000
            self._update_health(NewsSourceStatus.UNAVAILABLE, latency_ms, False)
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            print(f"[EastmoneyNewsSource] Health check error: {e}")
            self._update_health(NewsSourceStatus.UNAVAILABLE, latency_ms, False)

        return self._health

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
