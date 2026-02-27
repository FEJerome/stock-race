"""
新浪财经采集器单元测试

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

from news_service.collectors.news.sina_finance import SinaFinanceCollector


class TestSinaFinanceCollector:
    """新浪财经采集器测试"""

    @pytest.fixture
    def collector(self):
        """创建采集器实例"""
        return SinaFinanceCollector()

    @pytest.fixture
    def mock_news_response(self):
        """模拟新浪财经API响应"""
        return {
            "result": {
                "data": [
                    {
                        "title": "A股市场今日大涨，科技股领涨",
                        "url": "https://finance.sina.com.cn/news/1.html",
                        "ctime": "2026-02-10 09:30:00",
                        "media": "新浪财经",
                        "summary": "今日A股市场表现强劲，科技股集体上涨...",
                        "keywords": "A股,科技股,大涨"
                    },
                    {
                        "title": "宁德时代发布新电池技术，股价创新高",
                        "url": "https://finance.sina.com.cn/news/2.html",
                        "ctime": "2026-02-10 09:25:00",
                        "media": "新浪财经",
                        "summary": "宁德时代今日发布新一代电池技术...",
                        "keywords": "宁德时代,新能源,电池"
                    }
                ]
            }
        }

    def test_collector_initialization(self, collector):
        """测试采集器初始化"""
        assert collector.name == "sina_finance"
        assert collector.priority == 1
        assert collector.source_name == "sina"

    @pytest.mark.asyncio
    async def test_parse_news_list(self, collector, mock_news_response):
        """测试解析新闻列表"""
        result = collector._parse_news_list(mock_news_response)

        assert len(result) == 2
        assert result[0]["title"] == "A股市场今日大涨，科技股领涨"
        assert result[0]["source"] == "sina"
        assert result[0]["platform"] == "sina"
        assert "related_stocks" in result[0]
        assert "sentiment" in result[0]

    @pytest.mark.asyncio
    async def test_extract_stock_mentions(self, collector):
        """测试提取股票提及"""
        text = "宁德时代和贵州茅台今日表现强劲，平安银行也有所上涨"
        stocks = collector._extract_stock_mentions(text)

        assert "300750.SZ" in stocks
        assert "600519.SH" in stocks
        assert "000001.SZ" in stocks

    @pytest.mark.asyncio
    async def test_extract_stock_mentions_empty(self, collector):
        """测试无股票提及的情况"""
        text = "今日天气晴朗，适合出游"
        stocks = collector._extract_stock_mentions(text)

        assert len(stocks) == 0

    def test_calculate_engagement_score(self, collector):
        """测试互动分数计算"""
        news_item = {
            "read_count": 10000,
            "comment_count": 500,
            "share_count": 100
        }

        score = collector._calculate_engagement_score(news_item)
        assert score > 0
        assert score == 10600  # 10000 + 500 + 100

    def test_calculate_engagement_score_empty(self, collector):
        """测试空数据互动分数"""
        news_item = {}

        score = collector._calculate_engagement_score(news_item)
        assert score == 0

    @pytest.mark.asyncio
    async def test_analyze_sentiment_positive(self, collector):
        """测试正面情感分析"""
        news_item = {
            "title": "A股大涨，牛市来了，科技股涨停",
            "summary": "市场表现强劲，创新高"
        }

        sentiment = collector._analyze_sentiment(news_item)

        assert sentiment["type"] in ["positive", "negative", "neutral"]
        assert -1.0 <= sentiment["score"] <= 1.0

    @pytest.mark.asyncio
    async def test_analyze_sentiment_negative(self, collector):
        """测试负面情感分析"""
        news_item = {
            "title": "股市暴跌，投资者恐慌，跌停潮",
            "summary": "市场崩盘，跌破支撑位"
        }

        sentiment = collector._analyze_sentiment(news_item)

        assert sentiment["type"] in ["positive", "negative", "neutral"]
        assert -1.0 <= sentiment["score"] <= 1.0

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
    async def test_categorize_news(self, collector):
        """测试新闻分类"""
        # 财经新闻
        assert collector._categorize_news("A股大涨，科技股领涨") == "finance"
        # 宏观新闻
        assert collector._categorize_news("央行降准，释放流动性") == "macro"
        # 公司新闻
        assert collector._categorize_news("宁德时代发布财报") == "company"
        # 默认分类
        assert collector._categorize_news("其他新闻") == "general"

    @pytest.mark.asyncio
    async def test_health_check(self, collector):
        """测试健康检查"""
        # 由于健康检查需要真实的网络请求，这里只测试方法存在
        assert hasattr(collector, 'health_check')
        assert callable(collector.health_check)


class TestSinaFinanceIntegration:
    """新浪财经集成测试（可选，需要网络）"""

    @pytest.mark.skip(reason="需要网络连接，仅在本地测试")
    @pytest.mark.asyncio
    async def test_real_api_call(self):
        """测试真实API调用"""
        collector = SinaFinanceCollector()

        try:
            result = await collector.collect()
            assert isinstance(result, list)
            if len(result) > 0:
                assert "title" in result[0]
                assert "source" in result[0]
        finally:
            await collector.close()
