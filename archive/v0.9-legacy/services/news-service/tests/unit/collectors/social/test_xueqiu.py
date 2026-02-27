"""
雪球社区采集器单元测试

TDD流程:
1. 编写测试 (Red)
2. 运行测试确认失败
3. 实现最小代码 (Green)
4. 重构优化
"""

import pytest
import sys
from datetime import datetime
from unittest.mock import Mock, patch, AsyncMock

sys.path.insert(0, '/home/fe-jerome/projects/stock-race/worktrees/worktree-news-service/news-service/src')

from news_service.collectors.social.xueqiu import XueqiuCollector


class TestXueqiuCollector:
    """雪球社区采集器测试"""

    @pytest.fixture
    def collector(self):
        """创建采集器实例"""
        return XueqiuCollector()

    @pytest.fixture
    def mock_post_response(self):
        """模拟雪球社区API响应"""
        return {
            "list": [
                {
                    "id": 12345,
                    "title": "宁德时代深度分析：新能源龙头投资价值",
                    "description": "宁德时代作为全球动力电池龙头...",
                    "user": {
                        "screen_name": "价值投资达人",
                        "followers_count": 50000
                    },
                    "created_at": 1739152200000,  # 2026-02-10 09:30:00
                    "view_count": 50000,
                    "reply_count": 200,
                    "like_count": 1500,
                    "retweet_count": 300
                },
                {
                    "id": 12346,
                    "title": "茅台2026年投资策略",
                    "description": "茅台作为白酒龙头...",
                    "user": {
                        "screen_name": "基金经理小王",
                        "followers_count": 120000
                    },
                    "created_at": 1739151600000,
                    "view_count": 80000,
                    "reply_count": 500,
                    "like_count": 3000,
                    "retweet_count": 800
                }
            ]
        }

    def test_collector_initialization(self, collector):
        """测试采集器初始化"""
        assert collector.name == "xueqiu"
        assert collector.priority == 1
        assert collector.source_name == "xueqiu"

    @pytest.mark.asyncio
    async def test_parse_post_list(self, collector, mock_post_response):
        """测试解析帖子列表"""
        result = collector._parse_post_list(mock_post_response)

        assert len(result) == 2
        assert result[0]["title"] == "宁德时代深度分析：新能源龙头投资价值"
        assert result[0]["platform"] == "xueqiu"
        assert result[0]["author"] == "价值投资达人"
        assert result[0]["author_followers"] == 50000
        assert "mentioned_stocks" in result[0]
        assert "sentiment" in result[0]

    @pytest.mark.asyncio
    async def test_extract_stock_mentions(self, collector):
        """测试提取股票提及"""
        text = "宁德时代和贵州茅台都是好股票，平安银行也不错"
        stocks = collector._extract_stock_mentions(text)

        assert "300750.SZ" in stocks
        assert "600519.SH" in stocks
        assert "000001.SZ" in stocks

    @pytest.mark.asyncio
    async def test_extract_stock_sentiment_bullish(self, collector):
        """测试提取看涨情绪"""
        text = "这只股票要涨停了！强烈看好，目标价翻倍"
        sentiment = collector._extract_stock_sentiment(text)

        assert sentiment == "bullish"

    @pytest.mark.asyncio
    async def test_extract_stock_sentiment_bearish(self, collector):
        """测试提取看跌情绪"""
        text = "这只股票要跌停了，快跑，看空到历史低位"
        sentiment = collector._extract_stock_sentiment(text)

        assert sentiment == "bearish"

    @pytest.mark.asyncio
    async def test_extract_stock_sentiment_neutral(self, collector):
        """测试提取中性情绪"""
        text = "今天天气不错，股市一般"
        sentiment = collector._extract_stock_sentiment(text)

        assert sentiment == "neutral"

    def test_calculate_engagement_score(self, collector):
        """测试互动分数计算"""
        post_item = {
            "view_count": 10000,
            "reply_count": 500,
            "like_count": 1000,
            "retweet_count": 200
        }

        score = collector._calculate_engagement_score(post_item)
        assert score > 0
        # 雪球权重: view * 0.1 + reply * 2 + like * 1 + retweet * 3
        expected = int(10000 * 0.1 + 500 * 2 + 1000 * 1 + 200 * 3)
        assert score == expected

    def test_calculate_crowd_emotion_greed(self, collector):
        """测试群体情绪-贪婪"""
        posts = [
            {"sentiment": {"type": "positive", "score": 0.8}},
            {"sentiment": {"type": "positive", "score": 0.7}},
            {"sentiment": {"type": "positive", "score": 0.9}},
        ]

        emotion = collector._calculate_crowd_emotion(posts)
        assert emotion == "greed"

    def test_calculate_crowd_emotion_fear(self, collector):
        """测试群体情绪-恐惧"""
        posts = [
            {"sentiment": {"type": "negative", "score": -0.8}},
            {"sentiment": {"type": "negative", "score": -0.7}},
            {"sentiment": {"type": "negative", "score": -0.9}},
        ]

        emotion = collector._calculate_crowd_emotion(posts)
        assert emotion == "fear"

    def test_calculate_crowd_emotion_neutral(self, collector):
        """测试群体情绪-中性"""
        posts = [
            {"sentiment": {"type": "neutral", "score": 0.0}},
            {"sentiment": {"type": "neutral", "score": 0.1}},
        ]

        emotion = collector._calculate_crowd_emotion(posts)
        assert emotion == "neutral"

    @pytest.mark.asyncio
    async def test_parse_timestamp(self, collector):
        """测试时间戳解析"""
        timestamp = 1770687000000  # 2026-02-10 09:30:00
        result = collector._parse_timestamp(timestamp)

        assert isinstance(result, datetime)
        assert result.year == 2026
        assert result.month == 2
        assert result.day == 10

    @pytest.mark.asyncio
    async def test_health_check(self, collector):
        """测试健康检查"""
        assert hasattr(collector, 'health_check')
        assert callable(collector.health_check)


class TestXueqiuIntegration:
    """雪球社区集成测试（可选，需要网络）"""

    @pytest.mark.skip(reason="需要网络连接，仅在本地测试")
    @pytest.mark.asyncio
    async def test_real_api_call(self):
        """测试真实API调用"""
        collector = XueqiuCollector()

        try:
            result = await collector.collect()
            assert isinstance(result, list)
            if len(result) > 0:
                assert "title" in result[0]
                assert "author" in result[0]
        finally:
            await collector.close()
