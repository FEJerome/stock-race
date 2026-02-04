"""
简化版缓存模块，避免使用aioredis
"""

import json
import time
from typing import Any, Optional, Dict, List
from loguru import logger


class RedisCache:
    """简化版Redis缓存，实际使用内存缓存"""
    
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.cache: Dict[str, Any] = {}
        self.expiry: Dict[str, float] = {}
        self.is_connected = False
        logger.info(f"使用内存缓存模拟Redis: {redis_url}")

    async def connect(self):
        """连接Redis（实际上只是初始化内存缓存）"""
        self.is_connected = True
        logger.info("Redis缓存已连接（内存模式）")
        return True

    async def close(self):
        """关闭Redis连接"""
        self.cache.clear()
        self.expiry.clear()
        self.is_connected = False
        logger.info("Redis缓存已关闭")
    
    async def get(self, key: str) -> Optional[Any]:
        """获取缓存值"""
        if key in self.cache:
            expiry = self.expiry.get(key)
            if expiry and expiry < time.time():
                # 缓存已过期
                del self.cache[key]
                del self.expiry[key]
                return None
            return self.cache[key]
        return None
    
    async def set(self, key: str, value: Any, expire: Optional[int] = None) -> bool:
        """设置缓存值"""
        self.cache[key] = value
        if expire:
            self.expiry[key] = time.time() + expire
        return True
    
    async def delete(self, key: str) -> bool:
        """删除缓存值"""
        if key in self.cache:
            del self.cache[key]
        if key in self.expiry:
            del self.expiry[key]
        return True
    
    async def exists(self, key: str) -> bool:
        """检查键是否存在"""
        if key in self.cache:
            expiry = self.expiry.get(key)
            if expiry and expiry < time.time():
                # 缓存已过期
                del self.cache[key]
                del self.expiry[key]
                return False
            return True
        return False

    async def clear_all(self) -> bool:
        """清除所有缓存"""
        self.cache.clear()
        self.expiry.clear()
        logger.info("所有缓存已清除")
        return True

    # 股票报价相关方法
    async def get_cached_quote_smart(self, symbol: str) -> Optional[Any]:
        """智能获取缓存的股票报价"""
        key = f"quote:{symbol}"
        cached_data = await self.get(key)
        if cached_data:
            try:
                # 尝试反序列化JSON数据
                import json
                from datetime import datetime
                from data_service.models.stock import StockQuote

                data = json.loads(cached_data)

                # 将字符串时间戳转换回datetime对象
                if 'timestamp' in data and isinstance(data['timestamp'], str):
                    try:
                        data['timestamp'] = datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00'))
                    except ValueError:
                        data['timestamp'] = datetime.now()

                # 创建StockQuote对象
                return StockQuote(**data)
            except Exception as e:
                logger.warning(f"Failed to deserialize cached quote for {symbol}: {e}")
                return None
        return None

    async def cache_stock_quote(self, quote: Any) -> bool:
        """缓存股票报价"""
        if hasattr(quote, 'symbol'):
            key = f"quote:{quote.symbol}"
            # 序列化对象为JSON
            import json
            from datetime import datetime

            # 将对象转换为字典
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
            import json
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
        import json
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
        import json
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
        import json
        serialized_data = json.dumps(indicators.__dict__ if hasattr(indicators, '__dict__') else str(indicators))
        return await self.set(key, serialized_data, expire=600)  # 10分钟过期


# 全局缓存实例
_cache_instance: Optional[RedisCache] = None


def get_redis_cache() -> RedisCache:
    """获取Redis缓存实例"""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = RedisCache()
    return _cache_instance
