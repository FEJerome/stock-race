"""
新闻数据模型定义

包含新闻文章、社交媒体帖子、情感分析结果等模型
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field, field_validator
import hashlib


class SentimentType(str, Enum):
    """情感类型枚举"""
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


class ImpactLevel(str, Enum):
    """影响程度枚举"""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class NewsCategory(str, Enum):
    """新闻分类枚举"""
    FINANCE = "finance"
    MACRO = "macro"
    COMPANY = "company"
    GLOBAL = "global"
    POLICY = "policy"


class PlatformType(str, Enum):
    """社交媒体平台类型"""
    WEIBO = "weibo"
    XUEQIU = "xueqiu"
    EASTMONEY_GUBA = "eastmoney_guba"
    THS_GUBA = "ths_guba"


class SentimentResult(BaseModel):
    """情感分析结果"""
    overall: SentimentType
    score: float = Field(..., ge=-1.0, le=1.0, description="情感分数，-1.0到1.0")
    confidence: float = Field(default=0.5, ge=0.0, le=1.0, description="置信度")
    analyzed_at: datetime = Field(default_factory=datetime.now)
    analyzer: str = Field(default="rule", description="分析器类型: rule/ai/hybrid")


class MarketImpact(BaseModel):
    """市场影响评估"""
    severity: ImpactLevel
    affected_sectors: List[Dict[str, Any]] = Field(default_factory=list)
    affected_stocks: List[str] = Field(default_factory=list)
    time_horizon: str = Field(default="short_term", description="影响时间范围")


class NewsArticle(BaseModel):
    """新闻文章模型"""
    id: str = Field(default="")
    title: str = Field(..., min_length=1, max_length=500)
    content: Optional[str] = None
    summary: Optional[str] = None
    url: str = Field(..., min_length=1, max_length=1000)
    source: str = Field(..., min_length=1, max_length=50)
    published_at: datetime
    collected_at: datetime = Field(default_factory=datetime.now)
    category: Optional[NewsCategory] = None
    tags: List[str] = Field(default_factory=list)
    related_stocks: List[str] = Field(default_factory=list)
    related_sectors: List[str] = Field(default_factory=list)
    sentiment_score: Optional[float] = Field(None, ge=-1.0, le=1.0)
    sentiment_type: Optional[SentimentType] = None
    sentiment: Optional[SentimentResult] = None
    market_impact: Optional[MarketImpact] = None

    def model_post_init(self, __context) -> None:
        """模型初始化后生成ID"""
        if not self.id:
            self.id = hashlib.md5(f"{self.url}:{self.title}".encode()).hexdigest()


class SocialMediaPost(BaseModel):
    """社交媒体帖子模型"""
    id: str = Field(default="")
    platform: PlatformType
    author: str = Field(..., min_length=1, max_length=100)
    author_followers: int = Field(default=0, ge=0)
    content: str
    title: Optional[str] = Field(None, max_length=500)
    read_count: int = Field(default=0, ge=0)
    comment_count: int = Field(default=0, ge=0)
    like_count: int = Field(default=0, ge=0)
    forward_count: int = Field(default=0, ge=0)
    mentioned_stocks: List[str] = Field(default_factory=list)
    stock_sentiment: Optional[Dict[str, str]] = None
    sentiment_score: Optional[float] = Field(None, ge=-1.0, le=1.0)
    sentiment_type: Optional[SentimentType] = None
    sentiment: Optional[SentimentResult] = None
    crowd_emotion: Optional[str] = None
    published_at: datetime
    collected_at: datetime = Field(default_factory=datetime.now)

    @property
    def engagement_score(self) -> int:
        """计算互动分数"""
        return self.read_count + self.comment_count + self.like_count + self.forward_count

    def model_post_init(self, __context) -> None:
        """模型初始化后生成ID"""
        if not self.id:
            content_hash = self.content[:100] if self.content else ""
            self.id = hashlib.md5(f"{self.platform}:{content_hash}".encode()).hexdigest()


class SentimentSummary(BaseModel):
    """情感摘要"""
    overall: SentimentType
    score: float = Field(..., ge=-1.0, le=1.0)
    positive_count: int = Field(default=0, ge=0)
    negative_count: int = Field(default=0, ge=0)
    neutral_count: int = Field(default=0, ge=0)
    latest_update: datetime = Field(default_factory=datetime.now)


class SentimentIndex(BaseModel):
    """市场情绪指数"""
    timestamp: datetime
    overall: SentimentType
    score: float = Field(..., ge=-1.0, le=1.0)
    fear_greed_index: Optional[int] = Field(None, ge=0, le=100, description="恐惧贪婪指数0-100")
    crowd_attention: Optional[str] = None
    hot_topics: List[str] = Field(default_factory=list)
    source_breakdown: Optional[Dict[str, Dict]] = None
    stock_sentiment: Optional[Dict[str, float]] = None


class NewsListResponse(BaseModel):
    """新闻列表响应"""
    items: List[NewsArticle] = Field(default_factory=list)
    total: int = Field(default=0, ge=0)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1)


class StockNewsResponse(BaseModel):
    """股票新闻响应"""
    stock_code: str
    news: List[NewsArticle] = Field(default_factory=list)
    sentiment_summary: Optional[SentimentSummary] = None


class StockSentimentResponse(BaseModel):
    """股票情感响应"""
    stock_code: str
    sentiment: SentimentSummary
    recent_news_count: int = Field(default=0, ge=0)
    social_mentions: int = Field(default=0, ge=0)
