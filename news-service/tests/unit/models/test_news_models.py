"""
新闻数据模型单元测试

TDD流程:
1. 编写测试 (Red)
2. 运行测试确认失败
3. 实现最小代码 (Green)
4. 重构优化
"""

import pytest
import sys
from datetime import datetime
from pydantic import ValidationError

# 添加src到路径
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/worktrees/worktree-news-service/news-service/src')

from news_service.models.news import (
    NewsArticle, SentimentResult, MarketImpact,
    SocialMediaPost, SentimentIndex, SentimentSummary
)


class TestNewsArticle:
    """新闻文章模型测试"""

    def test_create_valid_news_article(self):
        """测试创建有效的新闻文章"""
        # 准备
        data = {
            "id": "test_news_001",
            "title": "测试新闻标题",
            "content": "这是测试新闻的内容",
            "url": "https://test.example.com/news/001",
            "source": "sina_finance",
            "published_at": datetime.now(),
            "collected_at": datetime.now(),
            "category": "finance",
            "tags": ["test", "股票"],
            "related_stocks": ["000001.SZ", "600519.SH"],
            "related_sectors": ["金融", "白酒"],
            "sentiment_score": 0.5,
            "sentiment_type": "positive"
        }

        # 执行
        article = NewsArticle(**data)

        # 验证
        assert article.id == "test_news_001"
        assert article.title == "测试新闻标题"
        assert article.source == "sina_finance"
        assert article.sentiment_score == 0.5
        assert article.sentiment_type == "positive"

    def test_news_article_required_fields(self):
        """测试必填字段验证"""
        # 缺少必填字段应该抛出ValidationError
        with pytest.raises(ValidationError):
            NewsArticle(
                # 缺少 id, title, url, source, published_at
                content="测试内容"
            )

    def test_news_article_sentiment_score_range(self):
        """测试情感分数范围验证"""
        # 分数应该在 -1.0 到 1.0 之间
        with pytest.raises(ValidationError):
            NewsArticle(
                id="test_001",
                title="测试",
                url="https://test.com",
                source="test",
                published_at=datetime.now(),
                sentiment_score=2.0  # 超出范围
            )

    def test_news_article_id_generation(self):
        """测试ID自动生成"""
        # 如果没有提供ID，应该自动生成
        article = NewsArticle(
            title="测试新闻",
            url="https://test.com/unique",
            source="test",
            published_at=datetime.now()
        )

        assert article.id is not None
        assert len(article.id) == 32  # MD5 hash长度


class TestSentimentResult:
    """情感分析结果模型测试"""

    def test_create_valid_sentiment(self):
        """测试创建有效的情感结果"""
        sentiment = SentimentResult(
            overall="positive",
            score=0.75,
            confidence=0.85,
            analyzed_at=datetime.now(),
            analyzer="hybrid"
        )

        assert sentiment.overall == "positive"
        assert sentiment.score == 0.75
        assert sentiment.confidence == 0.85

    def test_sentiment_score_bounds(self):
        """测试情感分数边界"""
        # 有效边界值
        SentimentResult(overall="positive", score=1.0, confidence=1.0)
        SentimentResult(overall="negative", score=-1.0, confidence=0.0)
        SentimentResult(overall="neutral", score=0.0, confidence=0.5)

        # 无效边界值
        with pytest.raises(ValidationError):
            SentimentResult(overall="positive", score=1.5, confidence=0.5)

        with pytest.raises(ValidationError):
            SentimentResult(overall="positive", score=-1.5, confidence=0.5)

    def test_sentiment_type_enum(self):
        """测试情感类型枚举"""
        # 有效类型
        for sentiment_type in ["positive", "negative", "neutral"]:
            result = SentimentResult(
                overall=sentiment_type,
                score=0.5,
                confidence=0.8
            )
            assert result.overall == sentiment_type

        # 无效类型
        with pytest.raises(ValidationError):
            SentimentResult(overall="invalid", score=0.5, confidence=0.8)


class TestSocialMediaPost:
    """社交媒体帖子模型测试"""

    def test_create_valid_social_post(self):
        """测试创建有效的社交媒体帖子"""
        post = SocialMediaPost(
            id="test_social_001",
            platform="xueqiu",
            author="test_user",
            author_followers=10000,
            content="这只股票要涨停了！",
            read_count=5000,
            comment_count=100,
            like_count=200,
            forward_count=50,
            mentioned_stocks=["300750.SZ"],
            stock_sentiment={"300750.SZ": "看涨"},
            sentiment_score=0.8,
            sentiment_type="positive",
            crowd_emotion="greed",
            published_at=datetime.now(),
            collected_at=datetime.now()
        )

        assert post.platform == "xueqiu"
        assert post.author_followers == 10000
        assert post.engagement_score == 5350  # 5000 + 100 + 200 + 50

    def test_social_post_engagement_calculation(self):
        """测试互动分数计算"""
        post = SocialMediaPost(
            id="test_001",
            platform="weibo",
            author="user",
            content="测试内容",
            read_count=1000,
            comment_count=50,
            like_count=100,
            forward_count=20,
            published_at=datetime.now()
        )

        # 互动分数 = 阅读 + 评论 + 点赞 + 转发
        expected_score = 1000 + 50 + 100 + 20
        assert post.engagement_score == expected_score

    def test_social_post_platform_enum(self):
        """测试平台类型枚举"""
        valid_platforms = ["weibo", "xueqiu", "eastmoney_guba", "ths_guba"]

        for platform in valid_platforms:
            post = SocialMediaPost(
                id=f"test_{platform}",
                platform=platform,
                author="user",
                content="测试",
                published_at=datetime.now()
            )
            assert post.platform == platform


class TestSentimentIndex:
    """市场情绪指数模型测试"""

    def test_create_valid_sentiment_index(self):
        """测试创建有效的市场情绪指数"""
        index = SentimentIndex(
            timestamp=datetime.now(),
            overall="positive",
            score=0.65,
            fear_greed_index=75,
            crowd_attention="high",
            hot_topics=["新能源", "AI"],
            source_breakdown={
                "sina": {"positive": 10, "negative": 3}
            },
            stock_sentiment={
                "000001.SZ": 0.5,
                "600519.SH": 0.8
            }
        )

        assert index.overall == "positive"
        assert index.fear_greed_index == 75
        assert len(index.hot_topics) == 2

    def test_fear_greed_index_bounds(self):
        """测试恐惧贪婪指数范围"""
        # 有效范围 0-100
        SentimentIndex(
            timestamp=datetime.now(),
            overall="neutral",
            score=0.0,
            fear_greed_index=0
        )

        SentimentIndex(
            timestamp=datetime.now(),
            overall="neutral",
            score=0.0,
            fear_greed_index=100
        )

        # 无效范围
        with pytest.raises(ValidationError):
            SentimentIndex(
                timestamp=datetime.now(),
                overall="neutral",
                score=0.0,
                fear_greed_index=101
            )

        with pytest.raises(ValidationError):
            SentimentIndex(
                timestamp=datetime.now(),
                overall="neutral",
                score=0.0,
                fear_greed_index=-1
            )


class TestMarketImpact:
    """市场影响评估模型测试"""

    def test_create_valid_market_impact(self):
        """测试创建有效的市场影响评估"""
        impact = MarketImpact(
            severity="high",
            affected_sectors=[
                {"name": "新能源", "impact": "positive", "strength": "strong"}
            ],
            affected_stocks=["300750.SZ", "601012.SH"],
            time_horizon="short_term"
        )

        assert impact.severity == "high"
        assert len(impact.affected_stocks) == 2

    def test_severity_enum(self):
        """测试影响程度枚举"""
        valid_severities = ["high", "medium", "low"]

        for severity in valid_severities:
            impact = MarketImpact(
                severity=severity,
                affected_sectors=[],
                affected_stocks=[],
                time_horizon="short_term"
            )
            assert impact.severity == severity
