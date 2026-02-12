"""
AI决策服务批量行情查询模型

专为AI决策优化的智能批量查询API数据模型
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Set
from pydantic import BaseModel, Field, field_validator, ConfigDict
from enum import Enum


class InfoDensity(str, Enum):
    """信息密度级别 - 控制数据采样率和字段数量"""
    ULTRA_LOW = "ultra_low"      # 极端压缩：每只股3-5个核心字段，采样率10%
    LOW = "low"                  # 高度压缩：每只股5-8个字段，采样率25%
    MEDIUM = "medium"            # 适中：每只股8-12个字段，采样率50%
    HIGH = "high"                # 详细：每只股12-18个字段，采样率75%
    FULL = "full"                # 完整：所有字段，100%数据


class TimeRangeStrategy(str, Enum):
    """时间范围策略 - AI根据决策场景选择"""
    REALTIME_ONLY = "realtime_only"           # 仅实时行情（决策）
    TODAY = "today"                          # 当日分时（日内交易）
    RECENT_3D = "recent_3d"                  # 近3日（短线）
    RECENT_1W = "recent_1w"                  # 近1周（波段）
    RECENT_1M = "recent_1m"                  # 近1月（趋势）
    RECENT_3M = "recent_3m"                  # 近3月（中期）
    RECENT_1Y = "recent_1y"                  # 近1年（长期）
    CUSTOM = "custom"                        # 自定义范围


class DataType(str, Enum):
    """数据类型 - AI需要的数据维度"""
    QUOTE = "quote"                          # 实时行情
    KLINE = "kline"                          # K线数据
    TECHNICAL = "technical"                  # 技术指标
    FUNDAMENTAL = "fundamental"              # 基本面数据
    MARKET_CAP = "market_cap"                # 市值数据
    VOLUME_PROFILE = "volume_profile"        # 成交量分布


class AIQueryScope(BaseModel):
    """
    查询范围定义 - 多维度并集

    所有维度取并集，例如：
    - sectors=["financial"] + industries=["banking"] + symbols=["000001.SZ"]
    - 返回金融板块所有股票 + 银行业所有股票 + 平安银行（去重）
    """
    sectors: Optional[List[str]] = Field(
        None,
        description="板块列表，如 ['financial', 'technology']"
    )
    industries: Optional[List[str]] = Field(
        None,
        description="行业列表，如 ['banking', 'software']"
    )
    concepts: Optional[List[str]] = Field(
        None,
        description="概念板块，如 ['fintech', 'new_energy']"
    )
    indices: Optional[List[str]] = Field(
        None,
        description="指数成分股，如 ['000001.SH', '000300.SH']"
    )
    symbols: Optional[List[str]] = Field(
        None,
        description="具体股票代码列表，如 ['000001.SZ', '000002.SZ']"
    )

    @field_validator('symbols')
    @classmethod
    def validate_symbols(cls, v):
        """验证股票代码格式"""
        if v:
            for symbol in v:
                if '.' not in symbol:
                    raise ValueError(f"Invalid symbol format: {symbol}, expected format: 000001.SZ")
        return v


class AIQueryFilter(BaseModel):
    """
    股票筛选条件 - 在并集结果中进一步过滤
    """
    min_market_cap: Optional[float] = Field(
        None,
        description="最小市值（亿元）"
    )
    max_market_cap: Optional[float] = Field(
        None,
        description="最大市值（亿元）"
    )
    min_price: Optional[float] = Field(
        None,
        ge=0,
        description="最小股价"
    )
    max_price: Optional[float] = Field(
        None,
        description="最大股价"
    )
    exclude_st: bool = Field(
        True,
        description="是否排除ST股票"
    )
    exclude_suspended: bool = Field(
        True,
        description="是否排除停牌股票"
    )
    min_listing_days: Optional[int] = Field(
        None,
        ge=0,
        description="最小上市天数（过滤次新股）"
    )
    active_only: bool = Field(
        True,
        description="仅返回活跃交易的股票"
    )


class AIQueryRequest(BaseModel):
    """
    AI决策服务批量行情查询请求

    示例请求：
    {
        "scope": {
            "sectors": ["financial", "technology"],
            "industries": ["banking"],
            "symbols": ["000001.SZ"]
        },
        "filter": {
            "min_market_cap": 100,
            "exclude_st": true
        },
        "data_types": ["quote", "kline", "technical"],
        "time_range": "recent_1w",
        "info_density": "medium",
        "max_stocks": 200,
        "request_id": "req_123456"
    }
    """
    scope: AIQueryScope = Field(
        ...,
        description="查询范围（多维度并集）"
    )
    filter: Optional[AIQueryFilter] = Field(
        default_factory=AIQueryFilter,
        description="筛选条件"
    )
    data_types: List[DataType] = Field(
        default=[DataType.QUOTE],
        description="需要的数据类型列表"
    )
    time_range: TimeRangeStrategy = Field(
        TimeRangeStrategy.REALTIME_ONLY,
        description="时间范围策略"
    )
    custom_start_date: Optional[datetime] = Field(
        None,
        description="自定义开始时间（time_range=custom时使用）"
    )
    custom_end_date: Optional[datetime] = Field(
        None,
        description="自定义结束时间（time_range=custom时使用）"
    )
    info_density: InfoDensity = Field(
        InfoDensity.MEDIUM,
        description="信息密度级别"
    )
    max_stocks: int = Field(
        100,
        ge=1,
        le=1000,
        description="最大返回股票数量（超限时按市值排序截取）"
    )
    priority_symbols: Optional[List[str]] = Field(
        None,
        description="优先保证的股票代码（即使超限也包含）"
    )
    include_market_summary: bool = Field(
        True,
        description="是否包含市场汇总统计"
    )
    request_id: Optional[str] = Field(
        None,
        description="请求ID（用于日志追踪和缓存）"
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "scope": {
                    "sectors": ["financial", "technology"],
                    "industries": ["banking", "software"],
                    "symbols": ["000001.SZ", "000002.SZ"]
                },
                "filter": {
                    "min_market_cap": 100,
                    "exclude_st": True,
                    "exclude_suspended": True
                },
                "data_types": ["quote", "kline"],
                "time_range": "recent_1w",
                "info_density": "medium",
                "max_stocks": 200,
                "include_market_summary": True,
                "request_id": "ai_decision_001"
            }
        }
    )


class StockCompactData(BaseModel):
    """
    股票压缩数据 - 根据信息密度动态调整字段

    字段选择策略：
    - ultra_low: symbol, price, change_percent, volume
    - low: + open, high, low, market_cap
    - medium: + pe_ratio, pb_ratio, turnover_rate
    - high: + kline_data(采样), technical_indicators
    - full: + full_kline, fundamental_data
    """
    symbol: str = Field(..., description="股票代码")
    name: Optional[str] = Field(None, description="股票名称")

    # 核心实时数据（ultra_low及以上）
    price: Optional[float] = Field(None, description="当前价格")
    change_percent: Optional[float] = Field(None, description="涨跌幅%")
    volume: Optional[int] = Field(None, description="成交量")

    # 扩展行情（low及以上）
    open: Optional[float] = Field(None, description="开盘价")
    high: Optional[float] = Field(None, description="最高价")
    low: Optional[float] = Field(None, description="最低价")
    prev_close: Optional[float] = Field(None, description="昨收")
    amount: Optional[float] = Field(None, description="成交额")
    market_cap: Optional[float] = Field(None, description="市值")

    # 估值数据（medium及以上）
    pe_ratio: Optional[float] = Field(None, description="市盈率")
    pb_ratio: Optional[float] = Field(None, description="市净率")
    turnover_rate: Optional[float] = Field(None, description="换手率%")

    # K线数据（根据info_density和time_range动态生成）
    kline_summary: Optional[Dict[str, Any]] = Field(
        None,
        description="K线摘要（采样后）"
    )

    # 技术指标（high及以上，或特定请求）
    technical: Optional[Dict[str, float]] = Field(
        None,
        description="技术指标: {rsi, macd, kdj, ma5, ma10, ma20}"
    )

    # 基本面数据（full或特定请求）
    fundamental: Optional[Dict[str, Any]] = Field(
        None,
        description="基本面数据"
    )

    # 数据质量标记
    data_quality: Optional[str] = Field(
        None,
        description="数据质量: real(实时), delayed(延时), cached(缓存), simulated(模拟)"
    )
    update_time: Optional[datetime] = Field(None, description="数据更新时间")


class MarketSummary(BaseModel):
    """市场汇总统计"""
    total_stocks: int = Field(..., description="股票总数")
    up_count: int = Field(..., description="上涨数量")
    down_count: int = Field(..., description="下跌数量")
    flat_count: int = Field(..., description="平盘数量")
    avg_change_percent: float = Field(..., description="平均涨跌幅")
    total_volume: float = Field(..., description="总成交量")
    total_amount: float = Field(..., description="总成交额")
    top_gainers: List[Dict[str, Any]] = Field(default_factory=list, description="涨幅前5")
    top_losers: List[Dict[str, Any]] = Field(default_factory=list, description="跌幅前5")
    sector_performance: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="板块表现"
    )


class AIQueryMetadata(BaseModel):
    """查询元数据 - 帮助AI理解数据特征"""
    request_id: str = Field(..., description="请求ID")
    query_time_ms: int = Field(..., description="查询耗时（毫秒）")
    data_scope: Dict[str, Any] = Field(..., description="实际查询范围")
    sampling_rate: float = Field(..., description="采样率")
    compression_ratio: float = Field(..., description="压缩比")
    cache_hit: bool = Field(..., description="是否命中缓存")
    data_timestamp: datetime = Field(..., description="数据时间戳")


class AIQueryResponse(BaseModel):
    """
    AI决策服务批量行情查询响应
    """
    success: bool = Field(..., description="是否成功")
    message: Optional[str] = Field(None, description="状态消息")
    request_id: str = Field(..., description="请求ID")

    # 核心数据
    stocks: List[StockCompactData] = Field(
        default_factory=list,
        description="股票数据列表（已压缩）"
    )
    stock_count: int = Field(..., description="实际返回股票数量")
    total_matched: int = Field(..., description="匹配条件的股票总数")

    # 市场汇总
    market_summary: Optional[MarketSummary] = Field(
        None,
        description="市场汇总统计"
    )

    # 元数据
    metadata: AIQueryMetadata = Field(..., description="查询元数据")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "request_id": "ai_decision_001",
                "stocks": [
                    {
                        "symbol": "000001.SZ",
                        "name": "平安银行",
                        "price": 10.5,
                        "change_percent": 2.5,
                        "volume": 1000000,
                        "market_cap": 2000.5,
                        "data_quality": "real"
                    }
                ],
                "stock_count": 150,
                "total_matched": 200,
                "market_summary": {
                    "total_stocks": 150,
                    "up_count": 80,
                    "down_count": 60,
                    "avg_change_percent": 1.2
                },
                "metadata": {
                    "query_time_ms": 320,
                    "sampling_rate": 0.5,
                    "compression_ratio": 0.3,
                    "cache_hit": False
                }
            }
        }
    )
