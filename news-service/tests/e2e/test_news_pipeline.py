"""
News Service E2E 测试脚本

测试完整的新闻采集→存储→分析→API提供流程
运行方式: pytest tests/e2e/test_news_pipeline.py -v
"""

import pytest
import asyncio
import asyncpg
import redis.asyncio as redis
from datetime import datetime, timedelta
from typing import List, Dict

# 被测服务
from news_service.main import app
from news_service.core.config import settings
from news_service.collectors.news.sina_finance import SinaFinanceCollector
from news_service.collectors.social.weibo_hot import WeiboHotCollector
from news_service.services.news_service import NewsService
from news_service.services.sentiment_service import SentimentService

# FastAPI TestClient
from fastapi.testclient import TestClient

client = TestClient(app)


@pytest.fixture(scope="module")
def event_loop():
    """创建事件循环"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
async def db_pool():
    """数据库连接池"""
    pool = await asyncpg.create_pool(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        database=settings.DB_NAME,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD
    )
    yield pool
    await pool.close()


@pytest.fixture(scope="module")
async def redis_client():
    """Redis客户端"""
    client = redis.from_url(settings.REDIS_URL)
    yield client
    await client.close()


class TestNewsCollectionPipeline:
    """测试新闻采集管道"""

    @pytest.mark.asyncio
    async def test_sina_finance_collection(self):
        """E2E-001: 测试新浪财经采集器能正常获取新闻"""
        collector = SinaFinanceCollector()

        # 执行采集
        news_list = await collector.collect()

        # 验证结果
        assert isinstance(news_list, list)
        assert len(news_list) > 0, "应该采集到新闻"

        # 验证数据结构
        first_news = news_list[0]
        assert "id" in first_news
        assert "title" in first_news
        assert "content" in first_news
        assert "source" in first_news
        assert first_news["source"] == "sina_finance"
        assert "published_at" in first_news

        await collector.close()

    @pytest.mark.asyncio
    async def test_weibo_hot_collection(self):
        """E2E-002: 测试微博热搜采集器能正常获取热点"""
        collector = WeiboHotCollector()

        # 执行采集
        hot_list = await collector.collect()

        # 验证结果
        assert isinstance(hot_list, list)
        assert len(hot_list) > 0, "应该采集到热搜"

        # 验证社交媒体特有字段
        first_hot = hot_list[0]
        assert "hot_rank" in first_hot
        assert "hot_value" in first_hot
        assert "platform" in first_hot
        assert first_hot["platform"] == "weibo"

        await collector.close()

    @pytest.mark.asyncio
    async def test_news_storage_to_database(self, db_pool):
        """E2E-003: 测试新闻能正常存储到数据库"""
        # 准备测试数据
        test_news = {
            "id": "test_e2e_001",
            "title": "E2E测试新闻",
            "content": "这是一条E2E测试新闻内容",
            "url": "https://test.example.com/news/001",
            "source": "test_source",
            "published_at": datetime.now(),
            "collected_at": datetime.now(),
            "category": "finance",
            "tags": ["test", "e2e"],
            "related_stocks": ["000001.SZ"],
            "sentiment_score": 0.5,
            "sentiment_type": "positive"
        }

        # 存储到数据库
        async with db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO news_articles (
                    id, title, content, url, source, published_at, collected_at,
                    category, tags, related_stocks, sentiment_score, sentiment_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (id) DO NOTHING
            """, *test_news.values())

            # 查询验证
            row = await conn.fetchrow(
                "SELECT * FROM news_articles WHERE id = $1",
                "test_e2e_001"
            )

            assert row is not None
            assert row["title"] == "E2E测试新闻"
            assert row["source"] == "test_source"

            # 清理测试数据
            await conn.execute(
                "DELETE FROM news_articles WHERE id = $1",
                "test_e2e_001"
            )


class TestSentimentAnalysisPipeline:
    """测试情感分析管道"""

    @pytest.mark.asyncio
    async def test_sentiment_analysis_service(self):
        """E2E-004: 测试情感分析服务能正常分析新闻情绪"""
        sentiment_service = SentimentService()

        # 测试正面新闻
        positive_news = {
            "title": "公司发布超预期财报，净利润增长200%",
            "content": "公司今日发布财报，业绩大幅增长，超出市场预期。"
        }

        result = await sentiment_service.analyze(positive_news)

        assert result is not None
        assert "overall" in result
        assert "score" in result
        assert result["score"] > 0  # 应该是正面

        # 测试负面新闻
        negative_news = {
            "title": "公司遭遇重大亏损，股价暴跌",
            "content": "公司公布业绩，出现巨额亏损，投资者信心受挫。"
        }

        result = await sentiment_service.analyze(negative_news)
        assert result["score"] < 0  # 应该是负面

    @pytest.mark.asyncio
    async def test_social_sentiment_analysis(self):
        """E2E-005: 测试社交媒体情绪分析"""
        sentiment_service = SentimentService()

        # 测试社交媒体帖子
        social_post = {
            "content": "这只股票要涨停了！大家快买！",
            "platform": "xueqiu",
            "engagement_score": 1000
        }

        result = await sentiment_service.analyze_social(social_post)

        assert "crowd_sentiment" in result
        assert "momentum" in result
        assert result["momentum"] in ["high", "medium", "low"]


class TestAPIEndpoints:
    """测试API端点"""

    def test_health_endpoint(self):
        """E2E-006: 测试健康检查端点"""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "service" in data

    def test_get_stock_news_api(self):
        """E2E-007: 测试获取股票新闻API"""
        # 注意: 此测试需要News Service已启动并连接数据库
        response = client.get(
            "/api/v1/news/stock/000001.SZ",
            headers={"X-API-Key": "stock-race-news-key"}
        )

        assert response.status_code == 200
        data = response.json()

        assert "stock_code" in data
        assert "news" in data
        assert "sentiment_summary" in data
        assert isinstance(data["news"], list)

    def test_get_market_sentiment_api(self):
        """E2E-008: 测试获取市场情绪API"""
        response = client.get(
            "/api/v1/sentiment/market",
            headers={"X-API-Key": "stock-race-news-key"}
        )

        assert response.status_code == 200
        data = response.json()

        assert "overall" in data
        assert "score" in data
        assert "fear_greed_index" in data
        assert "hot_topics" in data

    def test_api_authentication(self):
        """E2E-009: 测试API认证"""
        # 不带API Key的请求应该失败
        response = client.get("/api/v1/news/stock/000001.SZ")
        assert response.status_code == 401

        # 带错误API Key的请求应该失败
        response = client.get(
            "/api/v1/news/stock/000001.SZ",
            headers={"X-API-Key": "wrong-key"}
        )
        assert response.status_code == 401


class TestDataFlowIntegration:
    """测试数据流集成"""

    @pytest.mark.asyncio
    async def test_full_pipeline_from_collection_to_api(self, db_pool):
        """E2E-010: 测试完整流程: 采集→存储→分析→API查询"""
        # 1. 采集数据
        collector = SinaFinanceCollector()
        news_list = await collector.collect()
        await collector.close()

        assert len(news_list) > 0, "采集到新闻"

        # 2. 存储到数据库
        news_service = NewsService()
        stored_count = await news_service.store_news_batch(news_list)

        assert stored_count > 0, "存储成功"

        # 3. 执行情感分析
        sentiment_service = SentimentService()
        for news in news_list[:5]:  # 分析前5条
            sentiment = await sentiment_service.analyze(news)
            await news_service.update_sentiment(news["id"], sentiment)

        # 4. 通过API查询
        # 获取第一条新闻相关的股票
        first_news = news_list[0]
        related_stocks = first_news.get("related_stocks", [])

        if related_stocks:
            stock_code = related_stocks[0]
            response = client.get(
                f"/api/v1/news/stock/{stock_code}",
                headers={"X-API-Key": "stock-race-news-key"}
            )

            assert response.status_code == 200
            data = response.json()
            assert len(data["news"]) > 0

    @pytest.mark.asyncio
    async def test_sentiment_index_calculation(self, db_pool):
        """E2E-011: 测试市场情绪指数计算"""
        news_service = NewsService()

        # 计算市场情绪指数
        sentiment_index = await news_service.calculate_market_sentiment()

        assert sentiment_index is not None
        assert "overall" in sentiment_index
        assert "score" in sentiment_index
        assert "timestamp" in sentiment_index
        assert "source_breakdown" in sentiment_index

        # 验证分数范围
        assert -1.0 <= sentiment_index["score"] <= 1.0

        # 存储到数据库
        await news_service.store_sentiment_index(sentiment_index)

        # 验证存储成功
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM sentiment_index ORDER BY timestamp DESC LIMIT 1"
            )
            assert row is not None


class TestErrorHandlingAndFallback:
    """测试错误处理和降级机制"""

    @pytest.mark.asyncio
    async def test_collector_fallback_on_failure(self):
        """E2E-012: 测试采集器失败时的降级"""
        # 创建一个配置错误的主采集器
        primary_collector = SinaFinanceCollector()
        primary_collector.base_url = "https://invalid-url.com"  # 错误URL

        # 创建备用采集器
        backup_collector = WeiboHotCollector()

        # 主采集器应该失败
        try:
            await primary_collector.collect()
            assert False, "应该抛出异常"
        except Exception:
            pass  # 预期失败

        # 备用采集器应该成功
        result = await backup_collector.collect()
        assert len(result) > 0

        await primary_collector.close()
        await backup_collector.close()

    def test_api_fallback_when_service_unavailable(self):
        """E2E-013: 测试服务不可用时API降级"""
        # 模拟News Service不可用的情况
        # Backend应该返回空数据而不是500错误

        # 这个测试需要在Backend集成后执行
        # 这里只定义测试用例
        pass


class TestPerformance:
    """性能测试"""

    @pytest.mark.asyncio
    async def test_collection_performance(self):
        """E2E-014: 测试采集性能"""
        collector = SinaFinanceCollector()

        start_time = datetime.now()
        news_list = await collector.collect()
        end_time = datetime.now()

        duration = (end_time - start_time).total_seconds()

        # 采集应该在5秒内完成
        assert duration < 5.0, f"采集耗时过长: {duration}s"

        # 应该采集到足够的数据
        assert len(news_list) >= 10, "采集到的新闻数量不足"

        await collector.close()

    def test_api_response_time(self):
        """E2E-015: 测试API响应时间"""
        import time

        start_time = time.time()
        response = client.get(
            "/api/v1/sentiment/market",
            headers={"X-API-Key": "stock-race-news-key"}
        )
        end_time = time.time()

        duration = end_time - start_time

        assert response.status_code == 200
        assert duration < 1.0, f"API响应时间过长: {duration}s"


# 测试数据清理
@pytest.fixture(autouse=True)
async def cleanup_test_data(db_pool):
    """测试后清理数据"""
    yield

    # 清理测试数据
    async with db_pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM news_articles WHERE id LIKE 'test_%'"
        )
        await conn.execute(
            "DELETE FROM social_media_posts WHERE id LIKE 'test_%'"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
