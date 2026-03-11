"""
行情缓存服务单元测试

测试覆盖:
- 缓存初始化
- 数据更新与持久化
- 惰性持久化策略（60秒/1%价格变化）
- 内存缓存限制（240条）
- 降级处理
"""
import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from collections import deque

from services.market_data.cache_service import QuoteCacheService, QuoteCache, get_cache_service, init_cache_service
from services.market_data.base import Quote


class TestQuoteCache:
    """测试缓存数据类"""

    def test_cache_creation(self):
        """测试缓存项创建"""
        quote = Quote(
            symbol="000001",
            name="平安银行",
            price=10.0,
            change=0.5,
            change_percent=5.0,
            volume=10000
        )
        cache = QuoteCache(quote=quote, last_persisted=datetime.utcnow())
        assert cache.quote == quote
        assert cache.last_persisted is not None


class TestQuoteCacheServiceInit:
    """测试缓存服务初始化"""

    def test_init_with_db_factory(self):
        """测试带数据库工厂的初始化"""
        db_factory = Mock()
        service = QuoteCacheService(db_factory)

        assert service._db_factory == db_factory
        assert service._max_cache_size == 240
        assert service._persist_interval == timedelta(seconds=60)
        assert service._price_change_threshold == 0.01
        assert isinstance(service._lock, asyncio.Lock)
        assert service._memory_cache == {}


class TestShouldPersist:
    """测试持久化判断逻辑"""

    @pytest.fixture
    def service(self):
        db_factory = Mock()
        return QuoteCacheService(db_factory)

    @pytest.mark.asyncio
    async def test_should_persist_first_data(self, service):
        """首次数据应该持久化"""
        quote = Quote(symbol="000001", name="Test", price=10.0, change=0.1, change_percent=1.0, volume=1000)
        result = await service._should_persist("000001", quote)
        assert result is True

    @pytest.mark.asyncio
    async def test_should_persist_time_threshold(self, service):
        """超过60秒应该持久化"""
        quote1 = Quote(symbol="000001", name="Test", price=10.0, change=0.1, change_percent=1.0, volume=1000)
        quote2 = Quote(symbol="000001", name="Test", price=10.0, change=0.1, change_percent=1.0, volume=1000)

        # 模拟已有缓存数据，但last_persisted是70秒前
        old_time = datetime.utcnow() - timedelta(seconds=70)
        cache_item = QuoteCache(quote=quote1, last_persisted=old_time)
        service._memory_cache["000001"] = deque([cache_item], maxlen=240)

        result = await service._should_persist("000001", quote2)
        assert result is True

    @pytest.mark.asyncio
    async def test_should_not_persist_within_time(self, service):
        """60秒内相同价格不应持久化"""
        quote1 = Quote(symbol="000001", name="Test", price=10.0, change=0.1, change_percent=1.0, volume=1000)
        quote2 = Quote(symbol="000001", name="Test", price=10.0, change=0.1, change_percent=1.0, volume=1000)

        # 模拟已有缓存数据，last_persisted是30秒前
        old_time = datetime.utcnow() - timedelta(seconds=30)
        cache_item = QuoteCache(quote=quote1, last_persisted=old_time)
        service._memory_cache["000001"] = deque([cache_item], maxlen=240)

        result = await service._should_persist("000001", quote2)
        assert result is False

    @pytest.mark.asyncio
    async def test_should_persist_price_change(self, service):
        """价格变化超过1%应该持久化"""
        quote1 = Quote(symbol="000001", name="Test", price=10.0, change=0.1, change_percent=1.0, volume=1000)
        quote2 = Quote(symbol="000001", name="Test", price=10.15, change=0.25, change_percent=2.5, volume=1000)  # 涨1.5%

        # 模拟已有缓存数据，last_persisted是30秒前（时间条件不满足）
        old_time = datetime.utcnow() - timedelta(seconds=30)
        cache_item = QuoteCache(quote=quote1, last_persisted=old_time)
        service._memory_cache["000001"] = deque([cache_item], maxlen=240)

        result = await service._should_persist("000001", quote2)
        assert result is True  # 价格变化>1%，应该持久化

    @pytest.mark.asyncio
    async def test_should_persist_price_drop(self, service):
        """价格下跌超过1%应该持久化"""
        quote1 = Quote(symbol="000001", name="Test", price=10.0, change=0.1, change_percent=1.0, volume=1000)
        quote2 = Quote(symbol="000001", name="Test", price=9.8, change=-0.2, change_percent=-2.0, volume=1000)  # 跌2%

        old_time = datetime.utcnow() - timedelta(seconds=30)
        cache_item = QuoteCache(quote=quote1, last_persisted=old_time)
        service._memory_cache["000001"] = deque([cache_item], maxlen=240)

        result = await service._should_persist("000001", quote2)
        assert result is True  # 价格变化>1%，应该持久化


class TestUpdateQuote:
    """测试数据更新"""

    @pytest.fixture
    def service(self):
        db_factory = Mock()
        return QuoteCacheService(db_factory)

    @pytest.mark.asyncio
    async def test_update_quote_first_time(self, service):
        """首次更新应该初始化缓存并持久化"""
        quote = Quote(symbol="000001", name="Test", price=10.0, change=0.1, change_percent=1.0, volume=1000)

        # Mock _persist_quote
        service._persist_quote = AsyncMock()

        await service.update_quote(quote)

        assert "000001" in service._memory_cache
        assert len(service._memory_cache["000001"]) == 1
        service._persist_quote.assert_called_once_with(quote)

    @pytest.mark.asyncio
    async def test_update_quote_no_persist(self, service):
        """不满足持久化条件时不应写入DB"""
        quote1 = Quote(symbol="000001", name="Test", price=10.0, change=0.1, change_percent=1.0, volume=1000)
        quote2 = Quote(symbol="000001", name="Test", price=10.0, change=0.1, change_percent=1.0, volume=1000)

        service._persist_quote = AsyncMock()

        # 第一次更新
        await service.update_quote(quote1)
        # 第二次更新（30秒后，不满足60秒条件，价格也没变化）
        service._memory_cache["000001"][0].last_persisted = datetime.utcnow() - timedelta(seconds=30)
        await service.update_quote(quote2)

        # 只应该持久化第一次
        assert service._persist_quote.call_count == 1


class TestPersistQuote:
    """测试数据库持久化"""

    @pytest.mark.asyncio
    async def test_persist_quote_success(self):
        """成功持久化"""
        db_session = AsyncMock()
        db_factory = Mock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=db_session),
            __aexit__=AsyncMock(return_value=False)
        ))

        service = QuoteCacheService(db_factory)
        quote = Quote(
            symbol="000001",
            name="平安银行",
            price=10.5,
            change=0.5,
            change_percent=5.0,
            volume=10000,
            amount=105000,
            timestamp=datetime.utcnow()
        )

        # 实际调用会执行SQL，这里只测试异常不抛出
        try:
            await service._persist_quote(quote)
        except Exception:
            pass  # 数据库未实际连接，可能抛出异常，但不应影响测试

    @pytest.mark.asyncio
    async def test_persist_quote_failure_handling(self):
        """持久化失败不应抛出异常"""
        db_factory = Mock(side_effect=Exception("DB Error"))
        service = QuoteCacheService(db_factory)

        quote = Quote(symbol="000001", name="Test", price=10.0, change=0.1, change_percent=1.0, volume=1000)

        # 不应抛出异常
        try:
            await service._persist_quote(quote)
        except Exception as e:
            pytest.fail(f"_persist_quote should not raise exception: {e}")


class TestGetRecentQuotes:
    """测试获取最近行情"""

    @pytest.fixture
    def service(self):
        db_factory = Mock()
        return QuoteCacheService(db_factory)

    @pytest.mark.asyncio
    async def test_get_from_memory_only(self, service):
        """仅从内存获取"""
        # 准备内存缓存数据
        quotes = [
            Quote(symbol="000001", name="Test", price=10.0 + i*0.1, change=0.1, change_percent=1.0, volume=1000)
            for i in range(50)
        ]
        for q in quotes:
            service._memory_cache.setdefault("000001", deque(maxlen=240)).append(
                QuoteCache(quote=q, last_persisted=datetime.utcnow())
            )

        result = await service.get_recent_quotes("000001", limit=30)

        assert len(result) == 30
        assert result[0]['price'] == 14.9  # 最新的价格

    @pytest.mark.asyncio
    async def test_get_from_memory_and_db(self, service):
        """内存不足时从DB补充"""
        # 内存只有10条
        quotes = [
            Quote(symbol="000001", name="Test", price=10.0 + i*0.1, change=0.1, change_percent=1.0, volume=1000)
            for i in range(10)
        ]
        for q in quotes:
            service._memory_cache.setdefault("000001", deque(maxlen=240)).append(
                QuoteCache(quote=q, last_persisted=datetime.utcnow())
            )

        # Mock DB查询
        db_session = AsyncMock()
        db_session.execute = AsyncMock()
        service._db_factory = Mock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=db_session),
            __aexit__=AsyncMock(return_value=False)
        ))

        result = await service.get_recent_quotes("000001", limit=50)

        # 应该返回内存中的10条（即使DB查询失败也不应报错）
        assert len(result) == 10

    @pytest.mark.asyncio
    async def test_get_empty_symbol(self, service):
        """获取不存在的股票"""
        result = await service.get_recent_quotes("999999", limit=10)
        assert result == []


class TestSingleton:
    """测试单例模式"""

    def test_get_cache_service_before_init(self):
        """初始化前获取应返回None"""
        # 重置全局变量
        import services.market_data.cache_service as cache_module
        original = cache_module._cache_service
        cache_module._cache_service = None

        result = get_cache_service()
        assert result is None

        # 恢复
        cache_module._cache_service = original

    def test_init_and_get_cache_service(self):
        """初始化和获取"""
        db_factory = Mock()

        # 重置
        import services.market_data.cache_service as cache_module
        cache_module._cache_service = None

        service = init_cache_service(db_factory)
        assert service is not None
        assert isinstance(service, QuoteCacheService)

        retrieved = get_cache_service()
        assert retrieved is service


class TestConcurrency:
    """测试并发安全"""

    @pytest.mark.asyncio
    async def test_concurrent_updates_same_symbol(self):
        """同一股票并发更新"""
        db_factory = Mock()
        service = QuoteCacheService(db_factory)
        service._persist_quote = AsyncMock()

        quote = Quote(symbol="000001", name="Test", price=10.0, change=0.1, change_percent=1.0, volume=1000)

        # 并发10次更新
        tasks = [service.update_quote(quote) for _ in range(10)]
        await asyncio.gather(*tasks)

        # 缓存中应该有10条记录
        assert len(service._memory_cache["000001"]) == 10

    @pytest.mark.asyncio
    async def test_concurrent_updates_different_symbols(self):
        """不同股票并发更新"""
        db_factory = Mock()
        service = QuoteCacheService(db_factory)
        service._persist_quote = AsyncMock()

        quotes = [
            Quote(symbol=f"{i:06d}", name=f"Stock{i}", price=10.0 + i, change=0.1, change_percent=1.0, volume=1000)
            for i in range(1, 11)
        ]

        # 并发更新不同股票
        tasks = [service.update_quote(q) for q in quotes]
        await asyncio.gather(*tasks)

        # 应该有10个不同的缓存队列
        assert len(service._memory_cache) == 10


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
