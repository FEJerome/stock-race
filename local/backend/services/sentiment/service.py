"""
舆论情绪服务入口

统一封装情绪数据采集和分析
"""
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from .base import SentimentResult, SentimentSource
from .xueqiu_source import XueqiuSentimentSource
from .eastmoney_guba_source import EastmoneyGubaSource
from .processor import SentimentProcessor


class SentimentService:
    """
    舆论情绪服务

    整合多个数据源，提供统一的情绪指标获取接口
    """

    def __init__(self):
        self.sources: List[SentimentSource] = [
            XueqiuSentimentSource(priority=50),
            EastmoneyGubaSource(priority=60),
        ]
        self.processor = SentimentProcessor()
        self._cache: Dict[str, tuple] = {}  # symbol -> (result, timestamp)
        self._cache_ttl = timedelta(minutes=5)  # 缓存5分钟

    async def get_sentiment(self, symbol: str, force_refresh: bool = False) -> Optional[SentimentResult]:
        """
        获取股票情绪指标

        Args:
            symbol: 股票代码 (如 "000001.SZ")
            force_refresh: 强制刷新缓存

        Returns:
            SentimentResult 或 None
        """
        # 检查缓存
        if not force_refresh and symbol in self._cache:
            result, timestamp = self._cache[symbol]
            if datetime.utcnow() - timestamp < self._cache_ttl:
                return result

        # 从所有数据源采集帖子
        all_posts = []
        active_sources = []

        for source in self.sources:
            try:
                posts = await source.fetch_posts(symbol, limit=20)
                if posts:
                    all_posts.extend(posts)
                    active_sources.append(source.name)
            except Exception as e:
                print(f"[SentimentService] {source.name} fetch error: {e}")
                continue

        if not all_posts:
            return None

        # 分析情绪
        result = self.processor.analyze(all_posts)
        result.data_sources = active_sources

        # 更新缓存
        self._cache[symbol] = (result, datetime.utcnow())

        return result

    async def get_sentiment_batch(self, symbols: List[str]) -> Dict[str, SentimentResult]:
        """
        批量获取情绪指标

        Args:
            symbols: 股票代码列表

        Returns:
            symbol -> SentimentResult 字典
        """
        results = {}

        tasks = [self.get_sentiment(symbol) for symbol in symbols]
        completed = await asyncio.gather(*tasks, return_exceptions=True)

        for symbol, result in zip(symbols, completed):
            if isinstance(result, Exception):
                results[symbol] = None
            else:
                results[symbol] = result

        return results

    async def health_check(self) -> Dict[str, Any]:
        """
        检查所有数据源健康状态

        Returns:
            健康状态报告
        """
        report = {
            "timestamp": datetime.utcnow().isoformat(),
            "sources": {},
            "overall": "unknown",
        }

        healthy_count = 0
        for source in self.sources:
            try:
                is_healthy = await source.health_check()
                report["sources"][source.name] = "healthy" if is_healthy else "unavailable"
                if is_healthy:
                    healthy_count += 1
            except Exception as e:
                report["sources"][source.name] = f"error: {e}"

        if healthy_count == len(self.sources):
            report["overall"] = "healthy"
        elif healthy_count > 0:
            report["overall"] = "degraded"
        else:
            report["overall"] = "unavailable"

        return report

    def get_cache_stats(self) -> Dict[str, Any]:
        """获取缓存统计"""
        return {
            "cached_symbols": len(self._cache),
            "symbols": list(self._cache.keys()),
            "ttl_minutes": self._cache_ttl.total_seconds() / 60,
        }

    def clear_cache(self):
        """清除缓存"""
        self._cache.clear()

    async def close(self):
        """关闭所有数据源"""
        for source in self.sources:
            if hasattr(source, 'close'):
                await source.close()


# 全局服务实例
_sentiment_service: Optional[SentimentService] = None


def get_sentiment_service() -> SentimentService:
    """获取全局情绪服务实例"""
    global _sentiment_service
    if _sentiment_service is None:
        _sentiment_service = SentimentService()
    return _sentiment_service


async def get_sentiment(symbol: str) -> Optional[SentimentResult]:
    """
    快速获取股票情绪 (便捷函数)

    Args:
        symbol: 股票代码

    Returns:
        SentimentResult 或 None

    Example:
        >>> result = await get_sentiment("000001.SZ")
        >>> print(f"情绪分数: {result.score}")
    """
    service = get_sentiment_service()
    return await service.get_sentiment(symbol)
