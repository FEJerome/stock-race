"""
情报查询API路由

提供股票情报查询接口，包括：
1. 单只股票情报查询
2. 板块/行业/概念广度查询
3. 批量查询
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from datetime import datetime

# 创建路由
router = APIRouter(prefix="/api/v1/intelligence", tags=["intelligence"])


# 响应模型
class IntelligenceItem(BaseModel):
    """情报项模型"""
    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    sentiment_score: float = Field(..., description="情感分数", ge=-1.0, le=1.0)
    sentiment_type: str = Field(..., description="情感类型")
    summary: str = Field(..., description="情报摘要")
    importance: int = Field(..., description="重要性", ge=1, le=10)
    source: str = Field(..., description="数据来源")
    created_at: datetime = Field(..., description="创建时间")


class IntelligenceListResponse(BaseModel):
    """情报列表响应"""
    items: List[IntelligenceItem] = Field(default_factory=list)
    total: int = Field(..., description="总数")
    category: Optional[str] = Field(None, description="分类名称")
    category_type: Optional[str] = Field(None, description="分类类型")


class StockInCategory(BaseModel):
    """分类中的股票"""
    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    weight: float = Field(..., description="权重")
    is_primary: bool = Field(..., description="是否为主要分类")


class CategoryListResponse(BaseModel):
    """分类列表响应"""
    category_type: str = Field(..., description="分类类型")
    category_name: str = Field(..., description="分类名称")
    stocks: List[StockInCategory] = Field(default_factory=list)
    total: int = Field(..., description="股票数量")


# 模拟数据（实际应从数据库查询）
MOCK_INTELLIGENCE_DB = {
    "000001.SZ": [
        {
            "stock_code": "000001.SZ",
            "stock_name": "平安银行",
            "sentiment_score": 0.75,
            "sentiment_type": "positive",
            "summary": "平安银行发布年度业绩预告，净利润同比增长15%",
            "importance": 8,
            "source": "sina_finance",
            "created_at": datetime.now()
        }
    ],
    "600519.SH": [
        {
            "stock_code": "600519.SH",
            "stock_name": "贵州茅台",
            "sentiment_score": 0.32,
            "sentiment_type": "positive",
            "summary": "白酒行业消费升级趋势明显，茅台需求稳定",
            "importance": 6,
            "source": "xueqiu",
            "created_at": datetime.now()
        }
    ],
    "000002.SZ": [
        {
            "stock_code": "000002.SZ",
            "stock_name": "万科A",
            "sentiment_score": -0.45,
            "sentiment_type": "negative",
            "summary": "房地产行业政策收紧，万科股价承压",
            "importance": 7,
            "source": "eastmoney_news",
            "created_at": datetime.now()
        }
    ],
    "300750.SZ": [
        {
            "stock_code": "300750.SZ",
            "stock_name": "宁德时代",
            "sentiment_score": 0.68,
            "sentiment_type": "positive",
            "summary": "新能源车销量增长，锂电池需求旺盛",
            "importance": 9,
            "source": "sina_finance",
            "created_at": datetime.now()
        }
    ],
    "002594.SZ": [
        {
            "stock_code": "002594.SZ",
            "stock_name": "比亚迪",
            "sentiment_score": 0.55,
            "sentiment_type": "positive",
            "summary": "比亚迪新能源汽车销量创新高",
            "importance": 8,
            "source": "eastmoney_news",
            "created_at": datetime.now()
        }
    ],
    "601012.SH": [
        {
            "stock_code": "601012.SH",
            "stock_name": "隆基绿能",
            "sentiment_score": 0.42,
            "sentiment_type": "positive",
            "summary": "光伏产业政策利好，隆基订单饱满",
            "importance": 7,
            "source": "sina_finance",
            "created_at": datetime.now()
        }
    ],
    "000063.SZ": [
        {
            "stock_code": "000063.SZ",
            "stock_name": "中兴通讯",
            "sentiment_score": 0.35,
            "sentiment_type": "positive",
            "summary": "5G建设加速，中兴获大额订单",
            "importance": 7,
            "source": "eastmoney_news",
            "created_at": datetime.now()
        }
    ],
    "000858.SZ": [
        {
            "stock_code": "000858.SZ",
            "stock_name": "五粮液",
            "sentiment_score": 0.28,
            "sentiment_type": "positive",
            "summary": "白酒行业旺季来临，五粮液动销良好",
            "importance": 6,
            "source": "xueqiu",
            "created_at": datetime.now()
        }
    ],
    "002304.SZ": [
        {
            "stock_code": "002304.SZ",
            "stock_name": "洋河股份",
            "sentiment_score": 0.15,
            "sentiment_type": "positive",
            "summary": "洋河新品发布，市场反响积极",
            "importance": 5,
            "source": "sina_finance",
            "created_at": datetime.now()
        }
    ]
}

# 分类映射数据（应从数据库查询）
CATEGORY_STOCKS_MAP = {
    "sector": {
        "银行": ["000001.SZ", "600000.SH", "601398.SH", "601288.SH"],
        "房地产": ["000002.SZ", "600048.SH"],
        "白酒": ["600519.SH", "000858.SZ", "002304.SZ"],
        "新能源": ["300750.SZ", "002594.SZ", "601012.SH"],
        "通信设备": ["000063.SZ", "600498.SH"]
    },
    "industry": {
        "金融业": ["000001.SZ", "600000.SH", "601398.SH"],
        "房地产业": ["000002.SZ", "600048.SH"],
        "消费品": ["600519.SH", "000858.SZ"],
        "制造业": ["300750.SZ", "002594.SZ"],
        "通信业": ["000063.SZ"]
    },
    "concept": {
        "人工智能": ["000063.SZ", "600498.SH"],
        "锂电池": ["300750.SZ", "002594.SZ", "601012.SH"],
        "5G": ["000063.SZ", "600498.SH"],
        "新能源车": ["300750.SZ", "002594.SZ"],
        "新能源": ["300750.SZ", "002594.SZ", "601012.SH"],
        "白酒": ["600519.SH", "000858.SZ", "002304.SZ"]
    }
}


@router.get("/stock/{stock_code}", response_model=IntelligenceListResponse)
async def get_stock_intelligence(
    stock_code: str,
    limit: int = Query(default=10, ge=1, le=100, description="返回数量限制")
):
    """
    获取单只股票的情报

    Args:
        stock_code: 股票代码，如 000001.SZ
        limit: 返回数量限制

    Returns:
        该股票的情报列表
    """
    items = MOCK_INTELLIGENCE_DB.get(stock_code, [])

    if not items:
        # 如果无数据，返回空列表
        return IntelligenceListResponse(items=[], total=0)

    # 转换为模型
    intelligence_items = [IntelligenceItem(**item) for item in items[:limit]]

    return IntelligenceListResponse(
        items=intelligence_items,
        total=len(items)
    )


@router.get("/sector/{sector_name}", response_model=IntelligenceListResponse)
async def get_sector_intelligence(
    sector_name: str,
    limit: int = Query(default=20, ge=1, le=100, description="每只股票返回情报数量")
):
    """
    获取板块情报

    查询某板块下所有股票的情报汇总

    Args:
        sector_name: 板块名称，如 "银行", "新能源"
        limit: 每只股票返回情报数量

    Returns:
        该板块下所有股票的情报列表
    """
    stock_codes = CATEGORY_STOCKS_MAP["sector"].get(sector_name, [])

    if not stock_codes:
        raise HTTPException(status_code=404, detail=f"板块 '{sector_name}' 不存在")

    all_items = []
    for code in stock_codes:
        items = MOCK_INTELLIGENCE_DB.get(code, [])
        all_items.extend(items[:limit])

    # 按重要性排序
    all_items.sort(key=lambda x: x.get("importance", 0), reverse=True)

    intelligence_items = [IntelligenceItem(**item) for item in all_items]

    return IntelligenceListResponse(
        items=intelligence_items,
        total=len(all_items),
        category=sector_name,
        category_type="sector"
    )


@router.get("/industry/{industry_name}", response_model=IntelligenceListResponse)
async def get_industry_intelligence(
    industry_name: str,
    limit: int = Query(default=20, ge=1, le=100, description="每只股票返回情报数量")
):
    """
    获取行业情报

    查询某行业下所有股票的情报汇总

    Args:
        industry_name: 行业名称，如 "金融业", "制造业"
        limit: 每只股票返回情报数量

    Returns:
        该行业下所有股票的情报列表
    """
    stock_codes = CATEGORY_STOCKS_MAP["industry"].get(industry_name, [])

    if not stock_codes:
        raise HTTPException(status_code=404, detail=f"行业 '{industry_name}' 不存在")

    all_items = []
    for code in stock_codes:
        items = MOCK_INTELLIGENCE_DB.get(code, [])
        all_items.extend(items[:limit])

    # 按重要性排序
    all_items.sort(key=lambda x: x.get("importance", 0), reverse=True)

    intelligence_items = [IntelligenceItem(**item) for item in all_items]

    return IntelligenceListResponse(
        items=intelligence_items,
        total=len(all_items),
        category=industry_name,
        category_type="industry"
    )


@router.get("/concept/{concept_name}", response_model=IntelligenceListResponse)
async def get_concept_intelligence(
    concept_name: str,
    limit: int = Query(default=20, ge=1, le=100, description="每只股票返回情报数量")
):
    """
    获取概念情报

    查询某概念下所有股票的情报汇总

    Args:
        concept_name: 概念名称，如 "人工智能", "锂电池"
        limit: 每只股票返回情报数量

    Returns:
        该概念下所有股票的情报列表
    """
    stock_codes = CATEGORY_STOCKS_MAP["concept"].get(concept_name, [])

    if not stock_codes:
        raise HTTPException(status_code=404, detail=f"概念 '{concept_name}' 不存在")

    all_items = []
    for code in stock_codes:
        items = MOCK_INTELLIGENCE_DB.get(code, [])
        all_items.extend(items[:limit])

    # 按重要性排序
    all_items.sort(key=lambda x: x.get("importance", 0), reverse=True)

    intelligence_items = [IntelligenceItem(**item) for item in all_items]

    return IntelligenceListResponse(
        items=intelligence_items,
        total=len(all_items),
        category=concept_name,
        category_type="concept"
    )


@router.get("/batch", response_model=List[IntelligenceListResponse])
async def get_batch_intelligence(
    stock_codes: str = Query(..., description="股票代码列表，逗号分隔，如 '000001.SZ,600519.SH'"),
    limit: int = Query(default=10, ge=1, le=50, description="每只股票返回情报数量")
):
    """
    批量获取股票情报

    一次性查询多只股票的情报

    Args:
        stock_codes: 股票代码列表，逗号分隔
        limit: 每只股票返回情报数量

    Returns:
        各只股票的情报列表
    """
    codes = [code.strip() for code in stock_codes.split(",")]

    results = []
    for code in codes:
        items = MOCK_INTELLIGENCE_DB.get(code, [])
        intelligence_items = [IntelligenceItem(**item) for item in items[:limit]]

        results.append(IntelligenceListResponse(
            items=intelligence_items,
            total=len(items)
        ))

    return results


@router.get("/categories/{stock_code}", response_model=List[CategoryListResponse])
async def get_stock_categories(stock_code: str):
    """
    获取股票所属分类

    查询某只股票所属的所有板块、行业和概念

    Args:
        stock_code: 股票代码

    Returns:
        该股票所属的所有分类
    """
    results = []

    for category_type, categories in CATEGORY_STOCKS_MAP.items():
        for category_name, stocks in categories.items():
            if stock_code in stocks:
                # 找到股票在该分类中的信息
                stocks_in_category = [
                    StockInCategory(
                        stock_code=code,
                        stock_name=MOCK_INTELLIGENCE_DB.get(code, [{}])[0].get("stock_name"),
                        weight=1.0 if code == stock_code else 0.5,
                        is_primary=code == stock_code
                    )
                    for code in stocks
                ]

                results.append(CategoryListResponse(
                    category_type=category_type,
                    category_name=category_name,
                    stocks=stocks_in_category,
                    total=len(stocks)
                ))

    return results
