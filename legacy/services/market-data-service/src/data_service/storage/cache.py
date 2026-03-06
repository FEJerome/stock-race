"""
Redis缓存模块 - 使用真实Redis连接
"""

import json
import pickle
from typing import Any, Optional, Dict, List
from datetime import datetime, timedelta
from loguru import logger

import redis.asyncio as redis


class RedisCache:
    """Redis缓存类，使用真实Redis连接"""

    def __init__(self, redis_url: str = "redis://localhost:6379/0"):
        """
        初始化Redis缓存

        Args:
            redis_url: Redis连接URL，格式: redis://host:port/db
        """
        self.redis_url = redis_url
        self.client: Optional[redis.Redis] = None
        self.is_connected = False
        self._use_memory_fallback = False
        self._memory_cache: Dict[str, Any] = {}
        self._memory_expiry: Dict[str, float] = {}
        logger.info(f"初始化Redis缓存: {redis_url}")

    async def connect(self):
        """连接Redis"""
        try:
            # 解析连接URL
            self.client = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=False,  # 我们自己处理编码/解码
            )

            # 测试连接
            await self.client.ping()
            self.is_connected = True
            self._use_memory_fallback = False
            logger.info(f"Redis连接成功: {self.redis_url}")
            return True

        except Exception as e:
            logger.warning(f"Redis连接失败，切换到内存缓存模式: {e}")
            self.is_connected = True
            self._use_memory_fallback = True
            self._memory_cache.clear()
            self._memory_expiry.clear()
            return True

    async def close(self):
        """关闭Redis连接"""
        try:
            if self.client:
                await self.client.close()
            logger.info("Redis连接已关闭")
        except Exception as e:
            logger.error(f"关闭Redis连接失败: {e}")
        finally:
            self.is_connected = False
            if self._use_memory_fallback:
                self._memory_cache.clear()
                self._memory_expiry.clear()

    def _is_expired(self, key: str) -> bool:
        """检查内存缓存中的键是否过期"""
        if key not in self._memory_expiry:
            return False
        expiry = self._memory_expiry[key]
        return expiry < datetime.now().timestamp()

    async def get(self, key: str) -> Optional[Any]:
        """获取缓存值"""
        if not self.is_connected:
            return None

        if self._use_memory_fallback:
            # 内存回退模式
            if key in self._memory_cache:
                if self._is_expired(key):
                    del self._memory_cache[key]
                    del self._memory_expiry[key]
                    return None
                return self._memory_cache[key]
            return None

        # Redis模式
        try:
            data = await self.client.get(key)
            if data:
                return pickle.loads(data)
        except Exception as e:
            logger.warning(f"获取Redis缓存失败 {key}: {e}")
        return None

    async def set(self, key: str, value: Any, expire: Optional[int] = None) -> bool:
        """设置缓存值"""
        if not self.is_connected:
            return False

        if self._use_memory_fallback:
            # 内存回退模式
            self._memory_cache[key] = value
            if expire:
                self._memory_expiry[key] = datetime.now().timestamp() + expire
            return True

        # Redis模式
        try:
            serialized = pickle.dumps(value)
            await self.client.set(key, serialized, ex=expire)
            return True
        except Exception as e:
            logger.warning(f"设置Redis缓存失败 {key}: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """删除缓存值"""
        if not self.is_connected:
            return False

        if self._use_memory_fallback:
            # 内存回退模式
            if key in self._memory_cache:
                del self._memory_cache[key]
            if key in self._memory_expiry:
                del self._memory_expiry[key]
            return True

        # Redis模式
        try:
            await self.client.delete(key)
            return True
        except Exception as e:
            logger.warning(f"删除Redis缓存失败 {key}: {e}")
            return False

    async def exists(self, key: str) -> bool:
        """检查键是否存在"""
        if not self.is_connected:
            return False

        if self._use_memory_fallback:
            # 内存回退模式
            if key in self._memory_cache:
                if self._is_expired(key):
                    del self._memory_cache[key]
                    del self._memory_expiry[key]
                    return False
                return True
            return False

        # Redis模式
        try:
            return await self.client.exists(key) > 0
        except Exception as e:
            logger.warning(f"检查Redis缓存键失败 {key}: {e}")
            return False

    async def clear_all(self) -> bool:
        """清除所有缓存"""
        if not self.is_connected:
            return False

        if self._use_memory_fallback:
            # 内存回退模式
            self._memory_cache.clear()
            self._memory_expiry.clear()
            logger.info("所有内存缓存已清除")
            return True

        # Redis模式
        try:
            # 只清除stock-race相关的键
            keys = await self.client.keys("stock:*")
            keys.extend(await self.client.keys("quote:*"))
            keys.extend(await self.client.keys("info:*"))
            keys.extend(await self.client.keys("market:*"))
            keys.extend(await self.client.keys("indicators:*"))
            if keys:
                await self.client.delete(*keys)
                logger.info(f"已清除 {len(keys)} 个Redis缓存键")
            return True
        except Exception as e:
            logger.warning(f"清除Redis缓存失败: {e}")
            return False

    async def health_check(self) -> Dict[str, Any]:
        """健康检查"""
        status = {
            "is_connected": self.is_connected,
            "use_memory_fallback": self._use_memory_fallback,
            "redis_url": self.redis_url
        }

        if self._use_memory_fallback:
            status["cache_type"] = "memory"
            status["cache_size"] = len(self._memory_cache)
        else:
            try:
                await self.client.ping()
                status["cache_type"] = "redis"
                info = await self.client.info()
                status["redis_version"] = info.get("redis_version", "unknown")
            except Exception as e:
                status["error"] = str(e)
                status["cache_type"] = "error"

        return status

    # 股票报价相关方法
    async def get_cached_quote_smart(self, symbol: str) -> Optional[Any]:
        """智能获取缓存的股票报价"""
        key = f"quote:{symbol}"
        cached_data = await self.get(key)
        if cached_data:
            try:
                # 尝试反序列化JSON数据
                from data_service.models.stock import StockQuote

                data = json.loads(cached_data) if isinstance(cached_data, str) else cached_data

                # 将字符串时间戳转换回datetime对象
                if isinstance(data, dict) and 'timestamp' in data:
                    timestamp = data['timestamp']
                    if isinstance(timestamp, str):
                        try:
                            data['timestamp'] = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                        except ValueError:
                            data['timestamp'] = datetime.now()

                # 创建StockQuote对象
                return StockQuote(**data) if isinstance(data, dict) else cached_data
            except Exception as e:
                logger.warning(f"反序列化缓存的报价失败 {symbol}: {e}")
                return None
        return None

    async def cache_stock_quote(self, quote: Any) -> bool:
        """缓存股票报价"""
        if hasattr(quote, 'symbol'):
            key = f"quote:{quote.symbol}"

            # 序列化对象
            if hasattr(quote, 'model_dump'):
                data = quote.model_dump()
            elif hasattr(quote, 'dict'):
                data = quote.dict()
            elif hasattr(quote, '__dict__'):
                data = quote.__dict__
            else:
                data = str(quote)

            # 处理datetime对象
            def json_serializer(obj):
                if isinstance(obj, datetime):
                    return obj.isoformat()
                return str(obj)

            serialized_data = json.dumps(data, default=json_serializer)
            return await self.set(key, serialized_data, expire=10)  # 10秒过期
        return False

    async def cache_stock_quote_smart(self, quote: Any) -> bool:
        """智能缓存股票报价"""
        return await self.cache_stock_quote(quote)

    async def get_batch_cached_quotes(self, symbols: List[str]) -> Dict[str, Any]:
        """批量获取缓存的股票报价"""
        results = {}
        for symbol in symbols:
            key = f"quote:{symbol}"
            cached = await self.get(key)
            if cached:
                results[symbol] = cached
        return results

    # 股票信息相关方法
    async def get_cached_stock_info(self, symbol: str) -> Optional[Any]:
        """获取缓存的股票信息"""
        key = f"info:{symbol}"
        return await self.get(key)

    async def cache_stock_info(self, info: Any) -> bool:
        """缓存股票信息"""
        if hasattr(info, 'symbol'):
            key = f"info:{info.symbol}"
            serialized_data = json.dumps(info.__dict__ if hasattr(info, '__dict__') else str(info))
            return await self.set(key, serialized_data, expire=3600)  # 1小时过期
        return False

    # 市场状态相关方法
    async def get_cached_market_status(self) -> Optional[Any]:
        """获取缓存的市场状态"""
        key = "market:status"
        return await self.get(key)

    async def cache_market_status(self, status: Any) -> bool:
        """缓存市场状态"""
        key = "market:status"
        serialized_data = json.dumps(status.__dict__ if hasattr(status, '__dict__') else str(status))
        return await self.set(key, serialized_data, expire=300)  # 5分钟过期

    # 市场指数相关方法
    async def get_cached_market_indices(self) -> Optional[Any]:
        """获取缓存的市场指数"""
        key = "market:indices"
        return await self.get(key)

    async def cache_market_indices(self, indices: Any) -> bool:
        """缓存市场指数"""
        key = "market:indices"
        serialized_data = json.dumps(indices.__dict__ if hasattr(indices, '__dict__') else str(indices))
        return await self.set(key, serialized_data, expire=300)  # 5分钟过期

    # 技术指标相关方法
    async def get_cached_technical_indicators(self, symbol: str) -> Optional[Any]:
        """获取缓存的技术指标"""
        key = f"indicators:{symbol}"
        return await self.get(key)

    async def cache_technical_indicators(self, symbol: str, indicators: Any) -> bool:
        """缓存技术指标"""
        key = f"indicators:{symbol}"
        serialized_data = json.dumps(indicators.__dict__ if hasattr(indicators, '__dict__') else str(indicators))
        return await self.set(key, serialized_data, expire=600)  # 10分钟过期


# 全局缓存实例
_cache_instance: Optional[RedisCache] = None


def get_redis_cache() -> RedisCache:
    """获取Redis缓存实例"""
    global _cache_instance
    if _cache_instance is None:
        import os
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        _cache_instance = RedisCache(redis_url=redis_url)
    return _cache_instance
