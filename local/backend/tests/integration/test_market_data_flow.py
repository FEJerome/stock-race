"""
市场数据流集成测试

测试完整数据流:
WebSocket接收数据 -> 缓存更新 -> 指标计算 -> AI决策
"""
import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch

from services.market_data.cache_service import QuoteCacheService, init_cache_service
from services.market_data.indicators import TechnicalIndicators
from services.market_data.base import Quote


class TestMarketDataFlow:
    """测试完整市场数据流"""

    @pytest.fixture
    async def cache_service(self):
        """创建真实缓存服务实例"""
        # Mock DB factory
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock()
        mock_session.commit = AsyncMock()

        db_factory = Mock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=mock_session),
            __aexit__=AsyncMock(return_value=False)
        ))

        service = QuoteCacheService(db_factory)
        init_cache_service(db_factory)
        yield service

    @pytest.mark.asyncio
    async def test_quote_to_indicators_flow(self, cache_service):
        """测试从行情到指标的完整流程"""
        # 1. 模拟WebSocket推送数据
        symbols = ["000001", "000002", "000003"]

        for i in range(50):  # 推送50次数据
            for symbol in symbols:
                quote = Quote(
                    symbol=symbol,
                    name=f"Stock{symbol}",
                    price=10.0 + i * 0.01,
                    change=0.01,
                    change_percent=0.1,
                    volume=10000 + i * 100,
                    timestamp=datetime.utcnow()
                )
                await cache_service.update_quote(quote)

            await asyncio.sleep(0.001)  # 微小延迟模拟真实场景

        # 2. 计算技术指标
        indicators = TechnicalIndicators(cache_service)

        for symbol in symbols:
            result = await indicators.calculate(symbol)

            # 验证指标计算结果
            assert result is not None
            assert result.ma5 is not None
            assert result.trend in ['up', 'down', 'sideways', 'unknown']

    @pytest.mark.asyncio
    async def test_cache_persistence_trigger(self, cache_service):
        """测试缓存持久化触发条件"""
        quote1 = Quote(
            symbol="000001",
            name="Test",
            price=10.0,
            change=0.0,
            change_percent=0.0,
            volume=1000,
            timestamp=datetime.utcnow()
        )

        # Mock _persist_quote 来统计调用次数
        persist_calls = []
        async def mock_persist(quote):
            persist_calls.append(quote)
        cache_service._persist_quote = mock_persist

        # 第一次更新 - 应该触发持久化（首次）
        await cache_service.update_quote(quote1)
        assert len(persist_calls) == 1

        # 第二次更新 - 相同价格，不触发（假设时间间隔短）
        quote2 = Quote(
            symbol="000001",
            name="Test",
            price=10.0,
            change=0.0,
            change_percent=0.0,
            volume=1000,
            timestamp=datetime.utcnow()
        )
        # 修改last_persisted使其在30秒前
        cache_service._memory_cache["000001"][-1].last_persisted = datetime.utcnow() - timedelta(seconds=30)
        await cache_service.update_quote(quote2)
        # 时间不足60秒且价格无变化，不应持久化
        assert len(persist_calls) == 1

        # 第三次更新 - 价格变化超过1%
        quote3 = Quote(
            symbol="000001",
            name="Test",
            price=10.15,  # 涨1.5%
            change=0.15,
            change_percent=1.5,
            volume=1000,
            timestamp=datetime.utcnow()
        )
        await cache_service.update_quote(quote3)
        # 价格变化超过1%，应该持久化
        assert len(persist_calls) == 2


class TestPerformance:
    """性能测试"""

    @pytest.mark.asyncio
    async def test_high_frequency_updates(self):
        """高频率更新性能测试"""
        db_factory = Mock()
        service = QuoteCacheService(db_factory)
        service._persist_quote = AsyncMock()  # 跳过DB写入

        start_time = asyncio.get_event_loop().time()

        # 1000次更新
        for i in range(1000):
            quote = Quote(
                symbol="000001",
                name="Test",
                price=10.0 + i * 0.001,
                change=0.001,
                change_percent=0.01,
                volume=1000 + i
            )
            await service.update_quote(quote)

        end_time = asyncio.get_event_loop().time()
        duration = end_time - start_time

        # 应该在1秒内完成
        assert duration < 1.0
        assert len(service._memory_cache["000001"]) == 240  # 最大值限制

    @pytest.mark.asyncio
    async def test_indicator_calculation_performance(self):
        """指标计算性能"""
        db_factory = Mock()
        cache = QuoteCacheService(db_factory)

        # 准备100条数据
        quotes = [
            {
                'symbol': '000001',
                'timestamp': datetime.utcnow(),
                'price': 10.0 + i * 0.01,
                'volume': 10000
            }
            for i in range(100)
        ]
        cache.get_recent_quotes = AsyncMock(return_value=quotes)

        indicators = TechnicalIndicators(cache)

        start_time = asyncio.get_event_loop().time()
        result = await indicators.calculate('000001')
        end_time = asyncio.get_event_loop().time()

        duration = end_time - start_time
        # 应该在10ms内完成
        assert duration < 0.01
        assert result.ma5 is not None


class TestEdgeCases:
    """边界条件测试"""

    @pytest.mark.asyncio
    async def test_empty_cache_indicator_calculation(self):
        """空缓存时指标计算"""
        db_factory = Mock()
        cache = QuoteCacheService(db_factory)
        cache.get_recent_quotes = AsyncMock(return_value=[])

        indicators = TechnicalIndicators(cache)
        result = await indicators.calculate('000001')

        assert result.ma5 is None
        assert result.trend == "unknown"

    @pytest.mark.asyncio
    async def test_single_quote_indicator(self):
        """单条数据时指标计算"""
        db_factory = Mock()
        cache = QuoteCacheService(db_factory)
        cache.get_recent_quotes = AsyncMock(return_value=[{
            'symbol': '000001',
            'timestamp': datetime.utcnow(),
            'price': 10.0,
            'volume': 1000
        }])

        indicators = TechnicalIndicators(cache)
        result = await indicators.calculate('000001')

        # 数据不足，MA应为None
        assert result.ma5 is None
        assert result.ma10 is None
        assert result.ma20 is None

    @pytest.mark.asyncio
    async def test_volatile_price_changes(self):
        """剧烈价格变化测试"""
        db_factory = Mock()
        cache = QuoteCacheService(db_factory)
        cache._persist_quote = AsyncMock()

        prices = [10.0, 10.5, 9.5, 11.0, 8.5]  # 剧烈波动

        for price in prices:
            quote = Quote(
                symbol="000001",
                name="Test",
                price=price,
                change=price - 10.0,
                change_percent=(price - 10.0) / 10.0 * 100,
                volume=1000
            )
            await cache.update_quote(quote)

        # 验证缓存中有数据
        assert len(cache._memory_cache["000001"]) == 5


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
