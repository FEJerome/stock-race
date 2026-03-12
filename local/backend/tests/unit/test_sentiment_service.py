"""
情绪服务单元测试

测试 SentimentService 的缓存逻辑、数据源管理和批量处理
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch

from services.sentiment.service import SentimentService, get_sentiment_service
from services.sentiment.base import SentimentPost, SentimentLevel


class MockSentimentSource:
    """模拟情绪数据源"""

    def __init__(self, name="mock", posts=None, healthy=True):
        self.name = name
        self.priority = 100
        self._posts = posts or []
        self._healthy = healthy

    async def fetch_posts(self, symbol, limit=20):
        return self._posts

    async def health_check(self):
        return self._healthy


class TestSentimentService:
    """SentimentService 测试类"""

    @pytest.fixture
    def service(self):
        """创建服务实例，使用模拟数据源"""
        svc = SentimentService()
        svc.sources = []  # 清空默认数据源
        return svc

    @pytest.fixture
    def sample_posts(self):
        """测试帖子数据"""
        return [
            SentimentPost(
                id="1",
                symbol="000001.SZ",
                title="涨停！",
                content="大涨",
                author="user1",
                source="mock",
                url="http://test.com/1",
                publish_time=datetime.now(),
            ),
            SentimentPost(
                id="2",
                symbol="000001.SZ",
                title="坏消息",
                content="跌停",
                author="user2",
                source="mock",
                url="http://test.com/2",
                publish_time=datetime.now(),
            ),
        ]

    @pytest.mark.asyncio
    async def test_get_sentiment_with_mock_source(self, service, sample_posts):
        """测试从模拟数据源获取情绪"""
        mock_source = MockSentimentSource("mock", sample_posts)
        service.sources = [mock_source]

        result = await service.get_sentiment("000001.SZ")

        assert result is not None
        assert result.symbol == "000001.SZ"
        assert result.post_count == 2
        assert "mock" in result.data_sources

    @pytest.mark.asyncio
    async def test_get_sentiment_cache_hit(self, service, sample_posts):
        """测试缓存命中"""
        mock_source = MockSentimentSource("mock", sample_posts)
        service.sources = [mock_source]

        # 第一次调用
        result1 = await service.get_sentiment("000001.SZ")

        # 修改数据源（模拟新数据）
        mock_source._posts = []

        # 第二次调用应该命中缓存
        result2 = await service.get_sentiment("000001.SZ")

        # 缓存命中应返回第一次的结果
        assert result2.post_count == result1.post_count

    @pytest.mark.asyncio
    async def test_get_sentiment_cache_miss(self, service, sample_posts):
        """测试缓存未命中（强制刷新）"""
        mock_source = MockSentimentSource("mock", sample_posts)
        service.sources = [mock_source]

        # 第一次调用
        result1 = await service.get_sentiment("000001.SZ")
        assert result1.post_count == 2

        # 修改数据源为空（新数据）
        mock_source._posts = []

        # 强制刷新
        result2 = await service.get_sentiment("000001.SZ", force_refresh=True)

        # 应该返回 None（数据源返回空列表时服务返回 None）
        assert result2 is None

    @pytest.mark.asyncio
    async def test_get_sentiment_cache_expired(self, service, sample_posts):
        """测试缓存过期"""
        mock_source = MockSentimentSource("mock", sample_posts)
        service.sources = [mock_source]

        # 第一次调用
        await service.get_sentiment("000001.SZ")

        # 修改缓存时间为过期
        result, _ = service._cache["000001.SZ"]
        expired_time = datetime.utcnow() - timedelta(minutes=10)
        service._cache["000001.SZ"] = (result, expired_time)

        # 修改数据源为空（新数据）
        mock_source._posts = []

        # 再次调用应该重新获取数据（空数据源返回 None）
        result2 = await service.get_sentiment("000001.SZ")
        assert result2 is None

    @pytest.mark.asyncio
    async def test_get_sentiment_no_posts(self, service):
        """测试无帖子数据时返回 None"""
        mock_source = MockSentimentSource("mock", [])
        service.sources = [mock_source]

        result = await service.get_sentiment("000001.SZ")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_sentiment_source_error(self, service, sample_posts):
        """测试数据源错误处理"""
        healthy_source = MockSentimentSource("healthy", sample_posts, healthy=True)

        # 创建一个会抛出异常的数据源
        error_source = Mock()
        error_source.name = "error"
        error_source.fetch_posts = AsyncMock(side_effect=Exception("Connection error"))
        error_source.health_check = AsyncMock(return_value=False)

        service.sources = [error_source, healthy_source]

        # 应该能正常返回健康数据源的结果
        result = await service.get_sentiment("000001.SZ")
        assert result is not None
        assert result.post_count == 2
        assert "healthy" in result.data_sources

    @pytest.mark.asyncio
    async def test_get_sentiment_batch(self, service):
        """测试批量获取情绪"""
        posts1 = [SentimentPost(
            id="1", symbol="000001.SZ", title="涨", content="大涨",
            author="u1", source="mock", url="http://t/1",
            publish_time=datetime.now()
        )]
        posts2 = [SentimentPost(
            id="2", symbol="000002.SZ", title="跌", content="大跌",
            author="u2", source="mock", url="http://t/2",
            publish_time=datetime.now()
        )]

        # 创建一个能根据 symbol 返回不同数据的数据源
        class MultiSymbolSource(MockSentimentSource):
            async def fetch_posts(self, symbol, limit=20):
                if symbol == "000001.SZ":
                    return posts1
                elif symbol == "000002.SZ":
                    return posts2
                return []

        service.sources = [MultiSymbolSource("multi")]

        results = await service.get_sentiment_batch(["000001.SZ", "000002.SZ"])

        assert len(results) == 2
        assert "000001.SZ" in results
        assert "000002.SZ" in results
        assert results["000001.SZ"].post_count == 1
        assert results["000002.SZ"].post_count == 1

    @pytest.mark.asyncio
    async def test_get_sentiment_batch_with_error(self, service):
        """测试批量获取时部分失败"""
        mock_source = MockSentimentSource("mock", [])
        service.sources = [mock_source]

        # 模拟一个 symbol 会出错的情况
        mock_source.fetch_posts = AsyncMock(side_effect=[
            [SentimentPost(
                id="1", symbol="000001.SZ", title="涨", content="大涨",
                author="u1", source="mock", url="http://t/1",
                publish_time=datetime.now()
            )],
            Exception("Error for second symbol"),
        ])

        results = await service.get_sentiment_batch(["000001.SZ", "000002.SZ"])

        assert results["000001.SZ"] is not None
        assert results["000002.SZ"] is None

    @pytest.mark.asyncio
    async def test_health_check_all_healthy(self, service):
        """测试健康检查 - 全部健康"""
        service.sources = [
            MockSentimentSource("source1", healthy=True),
            MockSentimentSource("source2", healthy=True),
        ]

        report = await service.health_check()

        assert report["overall"] == "healthy"
        assert report["sources"]["source1"] == "healthy"
        assert report["sources"]["source2"] == "healthy"

    @pytest.mark.asyncio
    async def test_health_check_partial_failure(self, service):
        """测试健康检查 - 部分失败"""
        service.sources = [
            MockSentimentSource("source1", healthy=True),
            MockSentimentSource("source2", healthy=False),
        ]

        report = await service.health_check()

        assert report["overall"] == "degraded"
        assert report["sources"]["source1"] == "healthy"
        assert report["sources"]["source2"] == "unavailable"

    @pytest.mark.asyncio
    async def test_health_check_all_failure(self, service):
        """测试健康检查 - 全部失败"""
        service.sources = [
            MockSentimentSource("source1", healthy=False),
            MockSentimentSource("source2", healthy=False),
        ]

        report = await service.health_check()

        assert report["overall"] == "unavailable"

    def test_get_cache_stats(self, service):
        """测试缓存统计"""
        # 初始状态
        stats = service.get_cache_stats()
        assert stats["cached_symbols"] == 0
        assert stats["ttl_minutes"] == 5

        # 添加缓存
        service._cache["000001.SZ"] = (None, datetime.utcnow())
        service._cache["000002.SZ"] = (None, datetime.utcnow())

        stats = service.get_cache_stats()
        assert stats["cached_symbols"] == 2
        assert "000001.SZ" in stats["symbols"]
        assert "000002.SZ" in stats["symbols"]

    def test_clear_cache(self, service):
        """测试清除缓存"""
        service._cache["000001.SZ"] = (None, datetime.utcnow())

        service.clear_cache()

        assert len(service._cache) == 0

    @pytest.mark.asyncio
    async def test_close(self, service):
        """测试关闭服务"""
        # 创建带有 close 方法的数据源
        source_with_close = MockSentimentSource("closeable")
        source_with_close.close = AsyncMock()

        service.sources = [source_with_close]

        await service.close()

        source_with_close.close.assert_called_once()


class TestGlobalService:
    """全局服务实例测试"""

    def test_get_sentiment_service_singleton(self):
        """测试全局服务是单例"""
        svc1 = get_sentiment_service()
        svc2 = get_sentiment_service()
        assert svc1 is svc2

    @pytest.mark.asyncio
    async def test_get_sentiment_convenience_function(self):
        """测试便捷函数 get_sentiment"""
        from services.sentiment.service import get_sentiment

        # 由于 get_sentiment 使用全局实例，我们只需要测试它能被调用
        # 实际的获取逻辑在 SentimentService.get_sentiment 中已测试
        # 这里主要确保函数存在且能返回协程
        coro = get_sentiment("000001.SZ")
        assert coro is not None
