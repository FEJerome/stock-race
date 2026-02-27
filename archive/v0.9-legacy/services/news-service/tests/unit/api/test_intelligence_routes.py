"""
情报查询API路由测试

测试内容:
1. 单只股票情报查询
2. 板块/行业/概念广度查询
3. 批量查询
4. 错误处理
"""

import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI

from news_service.api.intelligence_routes import router


# 创建测试应用
app = FastAPI()
app.include_router(router)
client = TestClient(app)


class TestStockIntelligenceQuery:
    """单只股票情报查询测试"""

    def test_get_stock_intelligence_success(self):
        """测试成功获取股票情报"""
        response = client.get("/api/v1/intelligence/stock/000001.SZ")
        assert response.status_code == 200

        data = response.json()
        assert "items" in data
        assert "total" in data

    def test_get_stock_intelligence_with_limit(self):
        """测试带限制参数的查询"""
        response = client.get("/api/v1/intelligence/stock/000001.SZ?limit=5")
        assert response.status_code == 200

        data = response.json()
        assert len(data["items"]) <= 5

    def test_get_stock_intelligence_not_found(self):
        """测试股票不存在的情况"""
        response = client.get("/api/v1/intelligence/stock/999999.SZ")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] == 0
        assert len(data["items"]) == 0


class TestSectorIntelligenceQuery:
    """板块情报查询测试"""

    def test_get_sector_intelligence_success(self):
        """测试成功获取板块情报"""
        response = client.get("/api/v1/intelligence/sector/银行")
        assert response.status_code == 200

        data = response.json()
        assert "items" in data
        assert "total" in data
        assert data["category"] == "银行"
        assert data["category_type"] == "sector"

    def test_get_sector_intelligence_not_found(self):
        """测试板块不存在的情况"""
        response = client.get("/api/v1/intelligence/sector/不存在的板块")
        assert response.status_code == 404


class TestIndustryIntelligenceQuery:
    """行业情报查询测试"""

    def test_get_industry_intelligence_success(self):
        """测试成功获取行业情报"""
        response = client.get("/api/v1/intelligence/industry/金融业")
        assert response.status_code == 200

        data = response.json()
        assert "items" in data
        assert data["category_type"] == "industry"

    def test_get_industry_intelligence_not_found(self):
        """测试行业不存在的情况"""
        response = client.get("/api/v1/intelligence/industry/不存在的行业")
        assert response.status_code == 404


class TestConceptIntelligenceQuery:
    """概念情报查询测试"""

    def test_get_concept_intelligence_success(self):
        """测试成功获取概念情报"""
        response = client.get("/api/v1/intelligence/concept/新能源")
        assert response.status_code == 200

        data = response.json()
        assert "items" in data
        assert data["category_type"] == "concept"

    def test_get_concept_intelligence_not_found(self):
        """测试概念不存在的情况"""
        response = client.get("/api/v1/intelligence/concept/不存在的概念")
        assert response.status_code == 404


class TestBatchIntelligenceQuery:
    """批量情报查询测试"""

    def test_get_batch_intelligence_success(self):
        """测试成功批量获取情报"""
        response = client.get("/api/v1/intelligence/batch?stock_codes=000001.SZ,600519.SH")
        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2

    def test_get_batch_intelligence_single_stock(self):
        """测试单只股票的批量查询"""
        response = client.get("/api/v1/intelligence/batch?stock_codes=000001.SZ")
        assert response.status_code == 200

        data = response.json()
        assert len(data) == 1


class TestStockCategoriesQuery:
    """股票分类查询测试"""

    def test_get_stock_categories_success(self):
        """测试成功获取股票分类"""
        response = client.get("/api/v1/intelligence/categories/000001.SZ")
        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)

        # 验证分类包含预期的类型
        category_types = [item["category_type"] for item in data]
        assert "sector" in category_types


class TestIntelligenceResponseFormat:
    """情报响应格式验证测试"""

    def test_intelligence_item_format(self):
        """测试情报项格式"""
        response = client.get("/api/v1/intelligence/stock/000001.SZ")
        assert response.status_code == 200

        data = response.json()
        if data["items"]:
            item = data["items"][0]
            assert "stock_code" in item
            assert "sentiment_score" in item
            assert "sentiment_type" in item
            assert "summary" in item
            assert "importance" in item
            assert "source" in item
            assert "created_at" in item

    def test_category_list_response_format(self):
        """测试分类列表响应格式"""
        response = client.get("/api/v1/intelligence/sector/新能源")
        assert response.status_code == 200

        data = response.json()
        assert "category" in data
        assert "category_type" in data
        assert "items" in data
        assert "total" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
