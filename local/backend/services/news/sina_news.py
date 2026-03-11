"""
Sina Finance News Source - News collection from Sina Finance

API endpoints:
- https://search-api.sina.com.cn/ - Sina search API for news
- Returns JSON with news data

Reference: local/backend/services/market_data/sina_source.py
"""
import asyncio
import aiohttp
import json
import re
from datetime import datetime
from typing import Optional, List

from .base import NewsSource, NewsItem, NewsSourceHealth, NewsSourceStatus


class SinaNewsSource(NewsSource):
    """
    Sina Finance news source

    Provides A-share company news via Sina Finance Search API.
    Supports Shanghai (sh) and Shenzhen (sz) exchanges.

    Usage:
        source = SinaNewsSource()
        news = await source.fetch_news("000001.SZ", limit=5)
    """

    BASE_URL = "https://search-api.sina.com.cn"

    def __init__(self, priority: int = 50):
        """
        Initialize Sina news source

        Args:
            priority: Source priority (lower = higher priority)
        """
        super().__init__(name="sina", priority=priority)
        self._session: Optional[aiohttp.ClientSession] = None

    def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session"""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "Referer": "http://finance.sina.com.cn",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            )
        return self._session


    def _convert_symbol_to_search(self, symbol: str) -> str:
        """
        Convert symbol to Sina search format

        Args:
            symbol: Stock symbol (e.g., "000001.SZ", "600000.SH")

        Returns:
            Sina search format: "sz000001", "sh600000"
        """
        symbol = symbol.upper()

        # Handle various formats
        if symbol.startswith("SH") and "." not in symbol:
            return f"sh{symbol[2:]}"
        elif symbol.startswith("SZ") and "." not in symbol:
            return f"sz{symbol[2:]}"
        elif ".SH" in symbol:
            return f"sh{symbol.split('.')[0]}"
        elif ".SZ" in symbol:
            return f"sz{symbol.split('.')[0]}"
        elif "." not in symbol:
            # Infer exchange from code
            if symbol.startswith(("60", "68")):
                return f"sh{symbol}"
            elif symbol.startswith(("00", "30")):
                return f"sz{symbol}"

        return symbol.lower()

    def _parse_time(self, time_str: str) -> datetime:
        """
        Parse time string to datetime

        Args:
            time_str: Time string (e.g., "2024-01-15 10:30:00" or "今天 10:30")

        Returns:
            datetime object
        """
        try:
            # Try standard format
            return datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            try:
                # Try date only format
                return datetime.strptime(time_str, "%Y-%m-%d")
            except ValueError:
                # Handle relative time like "今天", "昨天"
                today = datetime.utcnow()
                if "今天" in time_str:
                    time_part = time_str.replace("今天", "").strip()
                    try:
                        hour, minute = map(int, time_part.split(":"))
                        return today.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    except:
                        return today
                elif "昨天" in time_str:
                    yesterday = today.replace(day=today.day - 1)
                    time_part = time_str.replace("昨天", "").strip()
                    try:
                        hour, minute = map(int, time_part.split(":"))
                        return yesterday.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    except:
                        return yesterday
                else:
                    return today

    async def fetch_news(self, symbol: str, limit: int = 10) -> List[NewsItem]:
        """
        Fetch company news for a specific stock using Sina Search API

        Args:
            symbol: Stock symbol (e.g., "000001.SZ")
            limit: Maximum number of news items

        Returns:
            List of NewsItem objects
        """
        sina_symbol = self._convert_symbol_to_search(symbol)

        try:
            session = self._get_session()

            # Sina search API for news
            # API: https://search-api.sina.com.cn/?c=news&q={symbol}&page=1&num={limit}
            url = f"{self.BASE_URL}/"
            params = {
                "c": "news",
                "q": sina_symbol,
                "page": 1,
                "num": limit
            }

            async with session.get(
                url,
                params=params,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status != 200:
                    print(f"[SinaNewsSource] HTTP {resp.status} for {symbol}")
                    return []

                data = await resp.text()
                return self._parse_response(data, symbol, limit)

        except asyncio.TimeoutError:
            print(f"[SinaNewsSource] Timeout fetching news for {symbol}")
            return []
        except Exception as e:
            print(f"[SinaNewsSource] Error fetching news for {symbol}: {e}")
            return []

    def _parse_response(self, data: str, symbol: str, limit: int) -> List[NewsItem]:
        """
        Parse Sina search API response

        Args:
            data: JSON response string (may be wrapped in callback)
            symbol: Stock symbol
            limit: Maximum items to return

        Returns:
            List of NewsItem objects
        """
        items = []

        try:
            # Sina API may return JSONP format: callback({...})
            # Extract JSON from callback wrapper
            json_str = data
            if data.strip().startswith("(") and data.strip().endswith(")"):
                # Handle ({...}) format
                json_str = data.strip()[1:-1]
            elif "(" in data and data.strip().endswith(")"):
                # Handle callback({...}) format
                start = data.find("(") + 1
                end = data.rfind(")")
                json_str = data[start:end]

            result = json.loads(json_str)

            # Extract news list from response
            # Response format: {"result": {"list": [...]}}
            news_list = result.get("result", {}).get("list", [])

            for news in news_list[:limit]:
                try:
                    title = news.get("title", "").strip()
                    # Remove HTML tags from title
                    title = re.sub(r'<[^>]+>', '', title)

                    url = news.get("url", "")
                    if not url:
                        continue

                    # Parse publish time
                    time_str = news.get("datetime", "")
                    publish_time = self._parse_time(time_str) if time_str else datetime.utcnow()

                    # Get summary if available, otherwise use truncated title
                    summary = news.get("summary", "")
                    if not summary:
                        summary = title[:300]
                    else:
                        summary = re.sub(r'<[^>]+>', '', summary)
                        summary = summary[:300]

                    item = NewsItem(
                        id=self._generate_id(url),
                        symbol=symbol,
                        title=title[:100],  # Limit to 100 chars
                        summary=summary,
                        source="sina",
                        url=url,
                        publish_time=publish_time,
                        collected_at=datetime.utcnow()
                    )
                    items.append(item)

                except Exception as e:
                    print(f"[SinaNewsSource] Error parsing news item: {e}")
                    continue

        except json.JSONDecodeError as e:
            print(f"[SinaNewsSource] JSON parse error: {e}, data preview: {data[:200]}")
        except Exception as e:
            print(f"[SinaNewsSource] Parse error: {e}")

        return items

    async def fetch_by_keywords(self, keywords: List[str], limit: int = 10) -> List[NewsItem]:
        """
        Search news by keywords

        Args:
            keywords: List of keywords to search for
            limit: Maximum number of news items

        Returns:
            List of NewsItem objects
        """
        if not keywords:
            return []

        # Join keywords with space
        query = " ".join(keywords)

        try:
            session = self._get_session()

            url = f"{self.BASE_URL}/"
            params = {
                "c": "news",
                "q": query,
                "page": 1,
                "num": limit
            }

            async with session.get(
                url,
                params=params,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status != 200:
                    return []

                data = await resp.text()
                # Use generic symbol for keyword search
                return self._parse_response(data, "KEYWORD", limit)

        except Exception as e:
            print(f"[SinaNewsSource] Error fetching by keywords: {e}")
            return []

    async def health_check(self) -> NewsSourceHealth:
        """Check data source health"""
        import time
        start_time = time.time()

        # Test with a known stock (浦发银行)
        test_symbol = "sh600000"
        try:
            session = self._get_session()
            url = f"{self.BASE_URL}/"
            params = {
                "c": "news",
                "q": test_symbol,
                "page": 1,
                "num": 1
            }

            async with session.get(
                url,
                params=params,
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                latency_ms = (time.time() - start_time) * 1000

                if resp.status == 200:
                    data = await resp.text()
                    # Check if response contains valid data
                    if len(data) > 100 and ("result" in data or "list" in data):
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
            print(f"[SinaNewsSource] Health check error: {e}")
            self._update_health(NewsSourceStatus.UNAVAILABLE, latency_ms, False)

        return self._health

    async def close(self):
        """Close HTTP session"""
        if self._session and not self._session.closed:
            await self._session.close()
