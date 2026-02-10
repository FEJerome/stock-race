"""
东方财富股吧采集器单元测试

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

from news_service.collectors.social.eastmoney_guba import EastMoneyGubaCollector


class TestEastMoneyGubaCollector:
    """东方财富股吧采集器测试"""

    @pytest.fixture
    def collector(self):
        """创建采集器实例"""
        return EastMoneyGubaCollector()

    @pytest.fixture
    def mock_post_response(self):
        """模拟东方财富股吧API响应"""
        return {
            "data": {
                "post_list": [
                    {
                        "post_id": "12345",
                        "post_title": "宁德时代明天能涨吗？",
                        "post_content": "大家怎么看宁德时代，我满仓了",
                        "user_name": "散户小王",
                        "post_time": "2026-02-10 09:30:00",
                        "read_count": 5000,
                        "comment_count": 100,
                        "like_count": 50,
                        "stock_code": "300750.SZ",
                        "stock_name": "宁德时代"
                    },
                    {
                        "post_id": "12346",
                        "post_title": "茅台是不是见顶了？",
                        "post_content": "感觉茅台涨不动了，要不要减仓",
                        "user_name": "价值投资者",
                        "post_time": "2026-02-10 09:25:00",
                        "read_count": 8000,
                        "comment_count": 200,
                        "like_count": 100,
                        "stock_code": "600519.SH",
                        "stock_name": "贵州茅台"
                    }
                ]
            }
        }

    def test_collector_initialization(self, collector):
        """测试采集器初始化"""
        assert collector.name == "eastmoney_guba"
        assert collector.priority == 2
        assert collector.source_name == "eastmoney_guba"

    @pytest.mark.asyncio
    async def test_parse_post_list(self, collector, mock_post_response):
        """测试解析帖子列表"""
        result = collector._parse_post_list(mock_post_response)

        assert len(result) == 2
        assert result[0]["title"] == "宁德时代明天能涨吗？"
        assert result[0]["platform"] == "eastmoney_guba"
        assert result[0]["author"] == "散户小王"
        assert "mentioned_stocks" in result[0]
        assert "sentiment" in result[0]

    @pytest.mark.asyncio
    async def test_extract_stock_mentions(self, collector):
        """测试提取股票提及"""
        text = "宁德时代和贵州茅台都是好股票"
        stocks = collector._extract_stock_mentions(text)

        assert "300750.SZ" in stocks
        assert "600519.SH" in stocks

    @pytest.mark.asyncio
    async def test_extract_sentiment_vote_bullish(self, collector):
        """测试提取看涨投票"""
        text = "看涨到500元！满仓干！突破新高"
        vote = collector._extract_sentiment_vote(text)

        assert vote == "bullish"

    @pytest.mark.asyncio
    async def test_extract_sentiment_vote_bearish(self, collector):
        """测试提取看跌投票"""
        text = "看跌！快跑！跌停！减仓避险"
        vote = collector._extract_sentiment_vote(text)

        assert vote == "bearish"

    @pytest.mark.asyncio
    async def test_extract_sentiment_vote_neutral(self, collector):
        """测试提取中性投票"""
        text = "观望中，等待方向明确"
        vote = collector._extract_sentiment_vote(text)

        assert vote == "neutral"

    def test_calculate_engagement_score(self, collector):
        """测试互动分数计算"""
        post_item = {
            "read_count": 10000,
            "comment_count": 500,
            "like_count": 200
        }

        score = collector._calculate_engagement_score(post_item)
        assert score > 0
        # 股吧权重: read * 0.1 + comment * 3 + like * 1
        expected = int(10000 * 0.1 + 500 * 3 + 200 * 1)
        assert score == expected

    def test_calculate_crowd_sentiment_index(self, collector):
        """测试计算散户情绪指数"""
        posts = [
            {"sentiment_vote": "bullish", "sentiment": {"score": 0.6}},
            {"sentiment_vote": "bullish", "sentiment": {"score": 0.7}},
            {"sentiment_vote": "bearish", "sentiment": {"score": -0.5}},
        ]

        index = collector._calculate_crowd_sentiment_index(posts)
        assert 0 <= index <= 100
        # 2看涨 1看跌，指数应该 > 50
        assert index > 50

    @pytest.mark.asyncio
    async def test_parse_datetime(self, collector):
        """测试日期时间解析"""
        dt_str = "2026-02-10 09:30:00"
        result = collector._parse_datetime(dt_str)

        assert isinstance(result, datetime)
        assert result.year == 2026
        assert result.month == 2
        assert result.day == 10

    @pytest.mark.asyncio
    async def test_health_check(self, collector):
        """测试健康检查"""
        assert hasattr(collector, 'health_check')
        assert callable(collector.health_check)


class TestEastMoneyGubaIntegration:
    """东方财富股吧集成测试（可选，需要网络）"""

    @pytest.mark.skip(reason="需要网络连接，仅在本地测试")
    @pytest.mark.asyncio
    async def test_real_api_call(self):
        """测试真实API调用"""
        collector = EastMoneyGubaCollector()

        try:
            result = await collector.collect()
            assert isinstance(result, list)
            if len(result) > 0:
                assert "title" in result[0]
                assert "author" in result[0]
        finally:
            await collector.close()
