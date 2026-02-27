"""
微博热搜采集器单元测试

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

from news_service.collectors.social.weibo_hot import WeiboHotCollector


class TestWeiboHotCollector:
    """微博热搜采集器测试"""

    @pytest.fixture
    def collector(self):
        """创建采集器实例"""
        return WeiboHotCollector()

    @pytest.fixture
    def mock_hot_list_response(self):
        """模拟微博热搜API响应"""
        return {
            "data": {
                "realtime": [
                    {
                        "note": "A股大涨",
                        "rank": 1,
                        "raw_hot": 5000000,
                        "category": "财经",
                        "word": "A股"
                    },
                    {
                        "note": "宁德时代发布新电池",
                        "rank": 2,
                        "raw_hot": 3000000,
                        "category": "财经",
                        "word": "宁德时代"
                    }
                ]
            }
        }

    def test_collector_initialization(self, collector):
        """测试采集器初始化"""
        assert collector.name == "weibo_hot"
        assert collector.priority == 1
        assert collector.source_name == "weibo"

    @pytest.mark.asyncio
    async def test_parse_hot_list(self, collector, mock_hot_list_response):
        """测试解析热搜列表"""
        result = collector._parse_hot_list(mock_hot_list_response)

        assert len(result) == 2
        assert result[0]["title"] == "A股大涨"
        assert result[0]["hot_rank"] == 1
        assert result[0]["hot_value"] == 5000000
        assert result[0]["platform"] == "weibo"

    @pytest.mark.asyncio
    async def test_extract_stock_mentions(self, collector):
        """测试提取股票提及"""
        text = "今天宁德时代大涨，茅台也不错，还有平安银行"
        stocks = collector._extract_stock_mentions(text)

        assert "300750.SZ" in stocks or "宁德时代" in stocks
        assert "600519.SH" in stocks or "茅台" in stocks
        assert "000001.SZ" in stocks or "平安银行" in stocks

    def test_calculate_engagement_score(self, collector):
        """测试互动分数计算"""
        hot_item = {
            "hot_value": 5000000,
            "read_count": 1000000,
            "comment_count": 50000
        }

        score = collector._calculate_engagement_score(hot_item)
        assert score > 0
        assert score == 5000000  # 微博使用hot_value作为主要指标

    @pytest.mark.asyncio
    async def test_analyze_sentiment_positive(self, collector):
        """测试正面情感分析"""
        hot_item = {
            "title": "A股大涨，牛市来了",
            "hot_value": 5000000
        }

        sentiment = collector._analyze_sentiment(hot_item)

        assert sentiment["type"] in ["positive", "negative", "neutral"]
        assert -1.0 <= sentiment["score"] <= 1.0

    @pytest.mark.asyncio
    async def test_analyze_sentiment_negative(self, collector):
        """测试负面情感分析"""
        hot_item = {
            "title": "股市暴跌，投资者恐慌",
            "hot_value": 3000000
        }

        sentiment = collector._analyze_sentiment(hot_item)

        assert sentiment["type"] in ["positive", "negative", "neutral"]
        assert -1.0 <= sentiment["score"] <= 1.0

    @pytest.mark.asyncio
    async def test_health_check(self, collector):
        """测试健康检查"""
        # 由于健康检查需要真实的网络请求，这里只测试方法存在
        # 实际健康检查测试在集成测试中完成
        assert hasattr(collector, 'health_check')
        assert callable(collector.health_check)


class TestWeiboHotIntegration:
    """微博热搜集成测试（可选，需要网络）"""

    @pytest.mark.skip(reason="需要网络连接，仅在本地测试")
    @pytest.mark.asyncio
    async def test_real_api_call(self):
        """测试真实API调用"""
        collector = WeiboHotCollector()

        try:
            result = await collector.collect()
            assert isinstance(result, list)
            if len(result) > 0:
                assert "title" in result[0]
                assert "hot_rank" in result[0]
        finally:
            await collector.close()
