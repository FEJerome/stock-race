"""
惰性缓存服务 - 行情数据本地存储

设计原则:
1. 内存优先: 最近数据存内存，快速读取
2. 惰性持久化: 不主动写入，只在满足条件时写库
3. 降级处理: 任何环节失败都不影响主流程
"""
from collections import deque
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass
import asyncio

from sqlalchemy import select, insert

from models.database import MarketQuoteModel
from .base import Quote


@dataclass
class QuoteCache:
    """内存中的行情缓存项"""
    quote: Quote
    last_persisted: Optional[datetime] = None


class QuoteCacheService:
    """
    行情缓存服务

    内存缓存: 每只股票最近 240 条 (~2小时, 按3秒/条)
    持久化策略: 60秒或价格变化>1%时写入 SQLite
    """

    def __init__(self, db_session_factory):
        self._db_factory = db_session_factory
        self._memory_cache: Dict[str, deque] = {}  # symbol -> deque of QuoteCache
        self._max_cache_size = 240  # 约2小时数据
        self._persist_interval = timedelta(seconds=60)  # 60秒强制写入
        self._price_change_threshold = 0.01  # 1%价格变化
        self._lock = asyncio.Lock()

    async def update_quote(self, quote: Quote) -> None:
        """
        WebSocket 推送时调用 - 更新缓存并触发惰性持久化

        这是核心入口方法，在 websocket.py 的 broadcast_market_data_task 中调用
        """
        symbol = quote.symbol

        async with self._lock:
            # 初始化该股票的缓存队列
            if symbol not in self._memory_cache:
                self._memory_cache[symbol] = deque(maxlen=self._max_cache_size)

            # 检查是否需要持久化
            should_persist = await self._should_persist(symbol, quote)

            # 创建缓存项
            cache_item = QuoteCache(
                quote=quote,
                last_persisted=self._memory_cache[symbol][-1].last_persisted
                if self._memory_cache[symbol] else None
            )

            # 写入内存缓存
            self._memory_cache[symbol].append(cache_item)

            # 惰性持久化
            if should_persist:
                await self._persist_quote(quote)
                cache_item.last_persisted = datetime.utcnow()

    async def _should_persist(self, symbol: str, new_quote: Quote) -> bool:
        """判断是否需要持久化"""
        if symbol not in self._memory_cache or not self._memory_cache[symbol]:
            return True  # 首次数据，必须写入

        last_cache = self._memory_cache[symbol][-1]
        last_persisted = last_cache.last_persisted

        # 条件1: 距离上次写入 >= 60秒
        if last_persisted is None:
            return True
        if datetime.utcnow() - last_persisted >= self._persist_interval:
            return True

        # 条件2: 价格变化 > 1%
        if last_cache.quote.price > 0:
            price_change = abs(new_quote.price - last_cache.quote.price) / last_cache.quote.price
            if price_change > self._price_change_threshold:
                return True

        return False

    async def _persist_quote(self, quote: Quote) -> None:
        """写入数据库"""
        try:
            async with self._db_factory() as session:
                # 使用 INSERT OR IGNORE 语义避免重复
                stmt = insert(MarketQuoteModel).values(
                    symbol=quote.symbol,
                    timestamp=quote.timestamp or datetime.utcnow(),
                    price=quote.price,
                    change=quote.change,
                    change_percent=quote.change_percent,
                    volume=quote.volume,
                    amount=quote.amount or 0
                ).prefix_with('OR IGNORE')  # SQLite 语法

                await session.execute(stmt)
                await session.commit()
        except Exception as e:
            # 持久化失败不影响主流程
            print(f"[CacheService] Persist failed for {quote.symbol}: {e}")

    async def get_recent_quotes(self, symbol: str, limit: int = 100) -> List[dict]:
        """
        获取最近行情（优先内存，不足则从 DB 补充）

        这是技术指标计算的主要数据源
        """
        result = []

        # 1. 从内存缓存获取
        async with self._lock:
            if symbol in self._memory_cache:
                memory_quotes = list(self._memory_cache[symbol])
                for cache_item in reversed(memory_quotes):  # 最新的在前
                    result.append({
                        'symbol': cache_item.quote.symbol,
                        'timestamp': cache_item.quote.timestamp,
                        'price': cache_item.quote.price,
                        'volume': cache_item.quote.volume,
                    })
                    if len(result) >= limit:
                        return result

        # 2. 内存不足，从数据库补充
        remaining = limit - len(result)
        if remaining > 0:
            try:
                async with self._db_factory() as session:
                    stmt = select(MarketQuoteModel).where(
                        MarketQuoteModel.symbol == symbol
                    ).order_by(MarketQuoteModel.timestamp.desc()).limit(remaining)

                    db_result = await session.execute(stmt)
                    db_quotes = db_result.scalars().all()

                    for q in db_quotes:
                        result.append({
                            'symbol': q.symbol,
                            'timestamp': q.timestamp,
                            'price': q.price,
                            'volume': q.volume,
                        })
            except Exception as e:
                print(f"[CacheService] DB query failed for {symbol}: {e}")

        return result


# 全局实例（单例模式）
_cache_service: Optional[QuoteCacheService] = None


def init_cache_service(db_session_factory):
    """初始化缓存服务（在 main.py 的 lifespan 中调用）"""
    global _cache_service
    _cache_service = QuoteCacheService(db_session_factory)
    return _cache_service


def get_cache_service() -> Optional[QuoteCacheService]:
    """获取缓存服务实例"""
    return _cache_service
