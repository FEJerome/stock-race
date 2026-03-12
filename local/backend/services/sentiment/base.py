"""
舆论情绪采集基础接口

定义情绪数据源的标准接口和数据模型
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Dict, Any, Optional
import hashlib


class SentimentLevel(Enum):
    """情绪等级"""
    VERY_POSITIVE = "very_positive"    # 非常积极 (>0.6)
    POSITIVE = "positive"               # 积极 (0.2 ~ 0.6)
    NEUTRAL = "neutral"                 # 中性 (-0.2 ~ 0.2)
    NEGATIVE = "negative"               # 消极 (-0.6 ~ -0.2)
    VERY_NEGATIVE = "very_negative"     # 非常消极 (<-0.6)


@dataclass
class SentimentPost:
    """
    社区帖子数据

    从雪球、东方财富股吧等平台采集的用户发帖
    """
    id: str                             # 帖子唯一ID (URL MD5)
    symbol: str                         # 股票代码
    title: str                          # 帖子标题
    content: str                        # 帖子内容
    author: str                         # 作者
    source: str                         # 来源: xueqiu/eastmoney_guba
    url: str                            # 原始链接
    publish_time: datetime              # 发布时间
    likes: int = 0                      # 点赞数
    comments: int = 0                   # 评论数
    views: int = 0                      # 浏览数
    collected_at: datetime = field(default_factory=datetime.utcnow)

    def __post_init__(self):
        """确保ID已生成"""
        if not self.id:
            self.id = hashlib.md5(self.url.encode('utf-8')).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "symbol": self.symbol,
            "title": self.title,
            "content": self.content[:200] + "..." if len(self.content) > 200 else self.content,
            "author": self.author,
            "source": self.source,
            "url": self.url,
            "publish_time": self.publish_time.isoformat() if self.publish_time else None,
            "likes": self.likes,
            "comments": self.comments,
            "views": self.views,
        }


@dataclass
class SentimentResult:
    """
    情绪分析结果

    综合多个帖子的情绪指标
    """
    symbol: str                         # 股票代码
    score: float                        # 情绪分数 (-1 ~ +1)
    level: SentimentLevel               # 情绪等级
    confidence: float                   # 置信度 (0-1)
    post_count: int                     # 分析帖子数
    positive_ratio: float               # 积极帖子比例
    negative_ratio: float               # 消极帖子比例
    neutral_ratio: float                # 中性帖子比例
    hot_topics: List[str]               # 热门话题/关键词
    sample_posts: List[Dict]            # 样本帖子
    data_sources: List[str]             # 数据来源
    generated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "symbol": self.symbol,
            "score": round(self.score, 3),
            "level": self.level.value,
            "level_text": self._get_level_text(),
            "confidence": round(self.confidence, 3),
            "post_count": self.post_count,
            "positive_ratio": round(self.positive_ratio, 3),
            "negative_ratio": round(self.negative_ratio, 3),
            "neutral_ratio": round(self.neutral_ratio, 3),
            "hot_topics": self.hot_topics[:5],
            "sample_posts": self.sample_posts[:3],
            "data_sources": self.data_sources,
            "generated_at": self.generated_at.isoformat(),
        }

    def _get_level_text(self) -> str:
        """获取情绪等级中文描述"""
        level_map = {
            SentimentLevel.VERY_POSITIVE: "极度看好",
            SentimentLevel.POSITIVE: "看好",
            SentimentLevel.NEUTRAL: "观望",
            SentimentLevel.NEGATIVE: "看空",
            SentimentLevel.VERY_NEGATIVE: "极度看空",
        }
        return level_map.get(self.level, "未知")

    @property
    def is_bullish(self) -> bool:
        """是否看涨情绪"""
        return self.score > 0.2

    @property
    def is_bearish(self) -> bool:
        """是否看跌情绪"""
        return self.score < -0.2


class SentimentSource(ABC):
    """
    情绪数据源抽象基类

    所有社区数据源必须继承此类
    """

    def __init__(self, name: str, priority: int = 100):
        """
        初始化数据源

        Args:
            name: 数据源名称
            priority: 优先级 (数值越小优先级越高)
        """
        self.name = name
        self.priority = priority
        self._last_error: Optional[str] = None
        self._last_fetch_time: Optional[datetime] = None

    @abstractmethod
    async def fetch_posts(self, symbol: str, limit: int = 20) -> List[SentimentPost]:
        """
        获取股票相关帖子

        Args:
            symbol: 股票代码 (如 "000001.SZ")
            limit: 最大获取数量

        Returns:
            帖子列表
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        检查数据源健康状态

        Returns:
            True if healthy
        """
        pass

    def _generate_id(self, url: str) -> str:
        """从URL生成唯一ID"""
        return hashlib.md5(url.encode('utf-8')).hexdigest()

    def _normalize_symbol(self, symbol: str) -> str:
        """
        标准化股票代码

        Args:
            symbol: 股票代码 (如 "000001.SZ", "sz000001")

        Returns:
            标准化格式 (如 "000001.SZ")
        """
        symbol = symbol.upper()

        if symbol.startswith("SH") and "." not in symbol:
            return f"{symbol[2:]}.SH"
        elif symbol.startswith("SZ") and "." not in symbol:
            return f"{symbol[2:]}.SZ"
        elif "." not in symbol:
            if symbol.startswith("6"):
                return f"{symbol}.SH"
            else:
                return f"{symbol}.SZ"

        return symbol

    def _extract_code(self, symbol: str) -> str:
        """提取纯数字代码"""
        return symbol.split(".")[0]

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(name={self.name}, priority={self.priority})"
