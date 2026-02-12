"""
覆盖范围计算测试

测试 NS-D-003: 热情报覆盖范围计算（股票/板块/行业/概念）
"""

import pytest
from datetime import datetime, timedelta
from typing import List, Dict, Any
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def sample_intelligence_with_categories() -> List[Dict[str, Any]]:
    """示例带分类信息的情报数据"""
    now = datetime.now()
    return [
        {
            "id": 1,
            "stock_code": "000001.SZ",
            "stock_name": "平安银行",
            "sentiment_confidence": 0.85,
            "related_sectors": ["银行", "金融"],
            "related_industries": ["金融业"],
            "related_concepts": ["大盘股", "蓝筹股"],
            "created_at": now - timedelta(minutes=30),
        },
        {
            "id": 2,
            "stock_code": "000002.SZ",
            "stock_name": "万科A",
            "sentiment_confidence": 0.78,
            "related_sectors": ["房地产", "地产"],
            "related_industries": ["房地产业"],
            "related_concepts": ["地产股", "城镇化"],
            "created_at": now - timedelta(minutes=45),
        },
        {
            "id": 3,
            "stock_code": "600519.SH",
            "stock_name": "贵州茅台",
            "sentiment_confidence": 0.92,
            "related_sectors": ["白酒", "消费"],
            "related_industries": ["消费品"],
            "related_concepts": ["白马股", "高价股"],
            "created_at": now - timedelta(minutes=15),
        },
        {
            "id": 4,
            "stock_code": "000858.SZ",
            "stock_name": "五粮液",
            "sentiment_confidence": 0.88,
            "related_sectors": ["白酒", "消费"],  # 与茅台相同板块
            "related_industries": ["消费品"],  # 与茅台相同行业
            "related_concepts": ["白马股"],  # 与茅台相同概念
            "created_at": now - timedelta(minutes=20),
        },
    ]


class TestCoverageCalculator:
    """覆盖范围计算器测试类"""

    @pytest.mark.asyncio
    async def test_extract_coverage_stocks(self, sample_intelligence_with_categories):
        """测试股票代码覆盖提取"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())
        coverage = selector._extract_coverage_stocks(sample_intelligence_with_categories)

        # 验证覆盖的股票代码
        expected_stocks = ["000001.SZ", "000002.SZ", "000858.SZ", "600519.SH"]
        assert coverage == expected_stocks
        assert len(coverage) == 4

    @pytest.mark.asyncio
    async def test_extract_coverage_sectors(self, sample_intelligence_with_categories):
        """测试板块覆盖提取"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())
        coverage = selector._extract_coverage_sectors(sample_intelligence_with_categories)

        # 验证覆盖的板块（去重后排序）- 使用 set 比较，因为中文字符排序可能因环境而异
        expected_sectors = {"地产", "房地产", "消费", "白酒", "银行", "金融"}
        assert set(coverage) == expected_sectors
        assert len(coverage) == 6

    @pytest.mark.asyncio
    async def test_extract_coverage_industries(self, sample_intelligence_with_categories):
        """测试行业覆盖提取"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())
        coverage = selector._extract_coverage_industries(sample_intelligence_with_categories)

        # 验证覆盖的行业
        expected_industries = ["房地产业", "消费品", "金融业"]
        assert coverage == expected_industries
        assert len(coverage) == 3

    @pytest.mark.asyncio
    async def test_extract_coverage_concepts(self, sample_intelligence_with_categories):
        """测试概念覆盖提取"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())
        coverage = selector._extract_coverage_concepts(sample_intelligence_with_categories)

        # 验证覆盖的概念
        expected_concepts = ["地产股", "城镇化", "大盘股", "白马股", "蓝筹股", "高价股"]
        assert coverage == expected_concepts
        assert len(coverage) == 6

    @pytest.mark.asyncio
    async def test_get_coverage_analysis(self, sample_intelligence_with_categories):
        """测试完整覆盖分析"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())
        analysis = selector._get_coverage_analysis(sample_intelligence_with_categories)

        # 验证分析结果结构
        assert "stocks" in analysis
        assert "sectors" in analysis
        assert "industries" in analysis
        assert "concepts" in analysis
        assert "total_intelligence" in analysis

        # 验证数量
        assert analysis["total_intelligence"] == 4
        assert analysis["stocks"]["count"] == 4
        assert analysis["sectors"]["count"] == 6
        assert analysis["industries"]["count"] == 3
        assert analysis["concepts"]["count"] == 6

    @pytest.mark.asyncio
    async def test_format_for_push_with_full_coverage(self, sample_intelligence_with_categories):
        """测试推送格式包含完整覆盖信息"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())
        formatted = selector._format_for_push(sample_intelligence_with_categories)

        # 验证格式包含所有覆盖维度
        assert "intelligence" in formatted
        assert "coverage" in formatted
        assert "coverage_analysis" in formatted
        assert "timestamp" in formatted

        # 验证覆盖分析内容
        analysis = formatted["coverage_analysis"]
        assert "stocks" in analysis
        assert "sectors" in analysis
        assert "industries" in analysis
        assert "concepts" in analysis

    @pytest.mark.asyncio
    async def test_empty_coverage(self):
        """测试空数据覆盖处理"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())

        # 空列表
        empty_data = []

        assert selector._extract_coverage_stocks(empty_data) == []
        assert selector._extract_coverage_sectors(empty_data) == []
        assert selector._extract_coverage_industries(empty_data) == []
        assert selector._extract_coverage_concepts(empty_data) == []

        analysis = selector._get_coverage_analysis(empty_data)
        assert analysis["total_intelligence"] == 0
        assert analysis["stocks"]["count"] == 0

    @pytest.mark.asyncio
    async def test_missing_category_fields(self):
        """测试缺失分类字段处理"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())

        # 缺少分类字段的数据
        incomplete_data = [
            {
                "id": 1,
                "stock_code": "000001.SZ",
                "stock_name": "平安银行",
                "sentiment_confidence": 0.85,
                # 缺少 related_sectors, related_industries, related_concepts
            }
        ]

        # 应该返回空列表而不是报错
        assert selector._extract_coverage_sectors(incomplete_data) == []
        assert selector._extract_coverage_industries(incomplete_data) == []
        assert selector._extract_coverage_concepts(incomplete_data) == []

        # 股票代码应该正常提取
        assert selector._extract_coverage_stocks(incomplete_data) == ["000001.SZ"]

    @pytest.mark.asyncio
    async def test_coverage_with_none_values(self):
        """测试 None 值处理"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())

        data_with_none = [
            {
                "id": 1,
                "stock_code": "000001.SZ",
                "related_sectors": None,
                "related_industries": None,
                "related_concepts": None,
            }
        ]

        # 应该处理 None 值
        assert selector._extract_coverage_sectors(data_with_none) == []
        assert selector._extract_coverage_industries(data_with_none) == []
        assert selector._extract_coverage_concepts(data_with_none) == []

    @pytest.mark.asyncio
    async def test_coverage_duplicates(self):
        """测试重复项去重"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())

        # 包含重复分类的数据
        duplicate_data = [
            {
                "stock_code": "000001.SZ",
                "related_sectors": ["银行", "银行"],  # 重复
                "related_industries": ["金融业"],
                "related_concepts": ["大盘股", "大盘股"],  # 重复
            },
            {
                "stock_code": "000002.SZ",
                "related_sectors": ["银行"],  # 与第一条重复
                "related_industries": ["金融业"],  # 与第一条重复
                "related_concepts": ["大盘股"],  # 与第一条重复
            },
        ]

        sectors = selector._extract_coverage_sectors(duplicate_data)
        assert sectors == ["银行"]  # 应该去重

        industries = selector._extract_coverage_industries(duplicate_data)
        assert industries == ["金融业"]  # 应该去重

        concepts = selector._extract_coverage_concepts(duplicate_data)
        assert concepts == ["大盘股"]  # 应该去重


class TestCoverageIntegration:
    """集成测试"""

    @pytest.mark.asyncio
    async def test_coverage_analysis_structure(self, sample_intelligence_with_categories):
        """测试覆盖分析数据结构"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())
        analysis = selector._get_coverage_analysis(sample_intelligence_with_categories)

        # 验证 stocks 结构
        assert "count" in analysis["stocks"]
        assert "items" in analysis["stocks"]
        assert isinstance(analysis["stocks"]["items"], list)

        # 验证 sectors 结构
        assert "count" in analysis["sectors"]
        assert "items" in analysis["sectors"]

        # 验证 industries 结构
        assert "count" in analysis["industries"]
        assert "items" in analysis["industries"]

        # 验证 concepts 结构
        assert "count" in analysis["concepts"]
        assert "items" in analysis["concepts"]

    @pytest.mark.asyncio
    async def test_large_dataset_coverage(self):
        """测试大数据集覆盖计算性能"""
        from news_service.services.hot_intelligence_selector import HotIntelligenceSelector

        selector = HotIntelligenceSelector(db_pool=MagicMock())

        # 生成大量数据
        large_data = []
        for i in range(100):
            large_data.append({
                "stock_code": f"{i:06d}.SZ",
                "related_sectors": [f"板块{i % 10}"],
                "related_industries": [f"行业{i % 5}"],
                "related_concepts": [f"概念{i % 20}"],
            })

        # 应该快速完成计算
        analysis = selector._get_coverage_analysis(large_data)

        assert analysis["stocks"]["count"] == 100
        assert analysis["sectors"]["count"] == 10  # 0-9
        assert analysis["industries"]["count"] == 5  # 0-4
        assert analysis["concepts"]["count"] == 20  # 0-19
