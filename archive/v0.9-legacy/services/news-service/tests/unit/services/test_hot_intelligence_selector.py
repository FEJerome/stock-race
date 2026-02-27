"""
热情报筛选算法测试

测试 NS-D-001: 基于置信度>0.7、最近1小时筛选Top 100热情报
"""

import pytest
from datetime import datetime, timedelta
from typing import List, Dict, Any
from unittest.mock import AsyncMock, MagicMock, patch


class AsyncContextManagerMock:
    """异步上下文管理器 Mock"""
    def __init__(self, return_value):
        self.return_value = return_value

    async def __aenter__(self):
        return self.return_value

    async def __aexit__(self, *args):
        return False


@pytest.fixture
def sample_intelligence_data() -> List[Dict[str, Any]]:
    """示例情报数据"""
    now = datetime.now()
    return [
        {
            "id": 1,
            "stock_code": "000001.SZ",
            "stock_name": "平安银行",
            "sentiment_score": 0.75,
            "sentiment_type": "positive",
            "sentiment_confidence": 0.85,
            "summary": "平安银行发布年度业绩预告，净利润同比增长15%",
            "importance": 8,
            "is_breaking": True,
            "related_sectors": ["银行", "金融"],
            "related_industries": ["金融业"],
            "relevance_score": 0.92,
            "source": "sina_finance",
            "created_at": now - timedelta(minutes=30),
        },
        {
            "id": 2,
            "stock_code": "000002.SZ",
            "stock_name": "万科A",
            "sentiment_score": -0.45,
            "sentiment_type": "negative",
            "sentiment_confidence": 0.78,
            "summary": "房地产行业政策收紧，万科股价承压",
            "importance": 7,
            "is_breaking": False,
            "related_sectors": ["房地产", "地产"],
            "related_industries": ["房地产业"],
            "relevance_score": 0.88,
            "source": "eastmoney_news",
            "created_at": now - timedelta(minutes=45),
        },
        {
            "id": 3,
            "stock_code": "600519.SH",
            "stock_name": "贵州茅台",
            "sentiment_score": 0.32,
            "sentiment_type": "positive",
            "sentiment_confidence": 0.72,
            "summary": "白酒行业消费升级趋势明显，茅台需求稳定",
            "importance": 6,
            "is_breaking": False,
            "related_sectors": ["白酒", "消费"],
            "related_industries": ["消费品"],
            "relevance_score": 0.85,
            "source": "xueqiu",
            "created_at": now - timedelta(minutes=15),
        },
    ]


class TestHotIntelligenceSelector:
    """热情报筛选器测试类"""

    @pytest.mark.asyncio
    async def test_selector_initialization(self):
        """测试筛选器初始化"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        mock_pool = MagicMock()
        selector = HotIntelligenceSelector(db_pool=mock_pool)

        assert selector.db_pool == mock_pool
        assert selector.min_confidence == 0.7
        assert selector.time_window_hours == 1
        assert selector.max_results == 100

    @pytest.mark.asyncio
    async def test_selector_custom_config(self):
        """测试自定义配置初始化"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        mock_pool = MagicMock()
        selector = HotIntelligenceSelector(
            db_pool=mock_pool,
            min_confidence=0.8,
            time_window_hours=2,
            max_results=50
        )

        assert selector.min_confidence == 0.8
        assert selector.time_window_hours == 2
        assert selector.max_results == 50

    @pytest.mark.asyncio
    async def test_select_hot_intelligence_success(self, sample_intelligence_data):
        """测试成功筛选热情报"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        # 创建 mock
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = sample_intelligence_data

        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        selector = HotIntelligenceSelector(db_pool=mock_pool)
        result = await selector.select_hot_intelligence()

        # 验证结果
        assert len(result) == 3
        assert result[0]["stock_code"] == "000001.SZ"

        # 验证查询被调用
        mock_conn.fetch.assert_called_once()

    @pytest.mark.asyncio
    async def test_select_hot_intelligence_empty_result(self):
        """测试空结果处理"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []

        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        selector = HotIntelligenceSelector(db_pool=mock_pool)
        result = await selector.select_hot_intelligence()

        assert result == []

    @pytest.mark.asyncio
    async def test_get_coverage_stocks(self, sample_intelligence_data):
        """测试覆盖股票列表计算"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())

        # 直接使用筛选结果计算覆盖范围
        hot_intelligence = sample_intelligence_data
        coverage = selector._extract_coverage_stocks(hot_intelligence)

        # 验证覆盖的股票代码
        expected_stocks = ["000001.SZ", "000002.SZ", "600519.SH"]
        assert coverage == expected_stocks

    @pytest.mark.asyncio
    async def test_format_for_push(self, sample_intelligence_data):
        """测试推送格式转换"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())

        hot_intelligence = sample_intelligence_data[:2]
        formatted = selector._format_for_push(hot_intelligence)

        # 验证格式
        assert "intelligence" in formatted
        assert "coverage" in formatted
        assert "timestamp" in formatted
        assert isinstance(formatted["intelligence"], list)
        assert isinstance(formatted["coverage"], list)

        # 验证精简格式
        intel = formatted["intelligence"][0]
        assert "stock_code" in intel
        assert "summary" in intel
        assert "sentiment_confidence" in intel
        assert len(intel["summary"]) <= 100  # 摘要限制100字符

    @pytest.mark.asyncio
    async def test_truncate_summary(self):
        """测试摘要截断功能"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())

        # 短摘要不需要截断
        short_summary = "短摘要"
        assert selector._truncate_summary(short_summary) == "短摘要"

        # 长摘要需要截断
        long_summary = "A" * 200  # 200字符
        truncated = selector._truncate_summary(long_summary)
        assert len(truncated) <= 100
        assert truncated.endswith("...")

        # 空摘要处理
        assert selector._truncate_summary("") == ""
        assert selector._truncate_summary(None) == ""

    @pytest.mark.asyncio
    async def test_select_and_format_integration(self, sample_intelligence_data):
        """测试完整流程集成"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = sample_intelligence_data[:2]

        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        selector = HotIntelligenceSelector(db_pool=mock_pool)
        result = await selector.select_and_format_for_push()

        # 验证完整结果结构
        assert "intelligence" in result
        assert "coverage" in result
        assert "timestamp" in result
        assert len(result["intelligence"]) == 2
        assert all(len(i["summary"]) <= 100 for i in result["intelligence"])


class TestHotIntelligenceSelectorEdgeCases:
    """边界条件测试"""

    @pytest.mark.asyncio
    async def test_duplicate_stock_codes(self):
        """测试重复股票代码处理"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())

        now = datetime.now()
        duplicate_data = [
            {
                "id": 1,
                "stock_code": "000001.SZ",
                "sentiment_confidence": 0.9,
                "importance": 8,
                "created_at": now - timedelta(minutes=10),
            },
            {
                "id": 2,
                "stock_code": "000001.SZ",  # 相同股票
                "sentiment_confidence": 0.85,
                "importance": 7,
                "created_at": now - timedelta(minutes=20),
            },
        ]

        # coverage应该去重
        coverage = selector._extract_coverage_stocks(duplicate_data)
        assert len(coverage) == 1
        assert "000001.SZ" in coverage

    @pytest.mark.asyncio
    async def test_missing_optional_fields(self):
        """测试缺失可选字段处理"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())

        # 缺少部分字段的数据
        incomplete_data = [
            {
                "id": 1,
                "stock_code": "000001.SZ",
                "sentiment_confidence": 0.85,
                # 缺少 stock_name, summary 等字段
            }
        ]

        # 格式化不应该报错
        formatted = selector._format_for_push(incomplete_data)
        assert len(formatted["intelligence"]) == 1
        assert formatted["intelligence"][0]["stock_code"] == "000001.SZ"

    @pytest.mark.asyncio
    async def test_confidence_filtering(self):
        """测试置信度过滤逻辑"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []

        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        selector = HotIntelligenceSelector(db_pool=mock_pool, min_confidence=0.7)
        await selector.select_hot_intelligence()

        # 验证查询参数
        call_args = mock_conn.fetch.call_args
        assert call_args[0][1] == 0.7  # min_confidence 参数

    @pytest.mark.asyncio
    async def test_time_window_filtering(self):
        """测试时间窗口过滤"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []

        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        selector = HotIntelligenceSelector(db_pool=mock_pool, time_window_hours=2)
        await selector.select_hot_intelligence()

        # 验证时间窗口参数
        call_args = mock_conn.fetch.call_args
        time_boundary = call_args[0][2]  # 第三个参数是time_boundary
        now = datetime.now()

        # 时间边界应该在2小时左右
        time_diff = now - time_boundary
        assert timedelta(hours=1, minutes=59) < time_diff < timedelta(hours=2, minutes=1)
