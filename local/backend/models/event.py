"""
事件舆情系统 - ORM模型

Phase 1.4 事件舆情数据层 - 包4实现
参考文档：
- docs/research/B-1.4.3-event-extraction.md
- docs/research/B-1.4.9-window-management.md
- docs/modules/local/ARCHITECTURE.md §3.4
"""

from sqlalchemy import Column, String, Float, DateTime, Index, ForeignKey, Text, Integer
from sqlalchemy.orm import relationship
from datetime import datetime
from typing import Optional, List
from dataclasses import dataclass

from .database import Base


class Event(Base):
    """
    事件表 - 从新闻/文本中抽取的结构化事件

    对应论文中的事件三元组：触发词、主体、客体
    """
    __tablename__ = "events"

    id = Column(String, primary_key=True)  # UUID
    news_id = Column(String, nullable=True, index=True)  # 关联新闻ID
    stock_code = Column(String, nullable=False, index=True)  # 关联股票代码

    # 事件三元组（论文核心结构）
    trigger = Column(String, nullable=False)  # 事件触发词
    subject = Column(String, nullable=False)  # 事件主体
    object = Column(String, nullable=True)  # 事件客体（可为空）

    # 事件属性
    event_type = Column(String, nullable=False)  # 业绩/股权/治理/业务/政策
    intensity = Column(Float, nullable=False, default=0.0)  # 事件强度 0.0-1.0
    sentiment = Column(String, default="neutral")  # positive/negative/neutral

    # 时间戳
    timestamp = Column(DateTime, nullable=False)  # 事件发生时间（新闻发布时间）
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    relations_as_a = relationship(
        "EventRelation",
        foreign_keys="EventRelation.event_a_id",
        back_populates="event_a"
    )
    relations_as_b = relationship(
        "EventRelation",
        foreign_keys="EventRelation.event_b_id",
        back_populates="event_b"
    )

    __table_args__ = (
        Index('idx_events_stock_time', 'stock_code', 'timestamp'),
        Index('idx_events_news', 'news_id'),
        Index('idx_events_type', 'event_type'),
    )

    def __repr__(self) -> str:
        return f"<Event({self.id[:8]}: {self.subject}-{self.trigger}-{self.object or ''}, type={self.event_type})>"


class EventRelation(Base):
    """
    事件时序关系表 - 记录事件间的时间顺序关系

    对应论文中的四种时序关系：BEFORE/AFTER/EQUAL/VAGUE
    """
    __tablename__ = "event_relations"

    id = Column(String, primary_key=True)  # UUID
    event_a_id = Column(String, ForeignKey("events.id"), nullable=False, index=True)
    event_b_id = Column(String, ForeignKey("events.id"), nullable=False, index=True)

    # 时序关系类型
    relation = Column(String, nullable=False)  # BEFORE/AFTER/EQUAL/VAGUE

    # 来源信息
    news_id = Column(String, nullable=True)  # 关联新闻ID（可选）

    # 元数据
    confidence = Column(Float, default=0.8)  # 关系判断置信度
    source = Column(String, default="llm_boolean")  # date/position/llm_boolean

    # 原始问答结果（用于调试和验证）
    q1_answer = Column(String, nullable=True)  # 问题1回答: YES/NO (A在B之前？)
    q2_answer = Column(String, nullable=True)  # 问题2回答: YES/NO (B在A之前？)

    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    event_a = relationship(
        "Event",
        foreign_keys=[event_a_id],
        back_populates="relations_as_a"
    )
    event_b = relationship(
        "Event",
        foreign_keys=[event_b_id],
        back_populates="relations_as_b"
    )

    __table_args__ = (
        Index('idx_relations_pair', 'event_a_id', 'event_b_id', unique=True),
    )

    def __repr__(self) -> str:
        return f"<EventRelation({self.event_a_id[:8]} {self.relation} {self.event_b_id[:8]})>"


class EventWindow(Base):
    """
    事件窗口表 - 30天滚动窗口的聚合结果

    每个股票每天一条记录，存储该股票在当前30天窗口内的事件聚合特征
    """
    __tablename__ = "event_windows"

    id = Column(String, primary_key=True)  # UUID
    stock_code = Column(String, nullable=False, index=True)  # 股票代码

    # 窗口时间范围
    window_start = Column(DateTime, nullable=False)  # 窗口开始日期
    window_end = Column(DateTime, nullable=False)  # 窗口结束日期（通常是当天）

    # 窗口统计
    event_count = Column(Integer, default=0)  # 窗口内事件数

    # 聚合特征JSON（预留扩展性）
    features_json = Column(Text, nullable=True)  # JSON字符串存储扩展特征

    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_windows_stock_date', 'stock_code', 'window_end', unique=True),
    )

    def __repr__(self) -> str:
        return f"<EventWindow({self.stock_code}: {self.window_start.date()} ~ {self.window_end.date()}, {self.event_count} events)>"


# ==================== 数据类定义 ====================

@dataclass
class WindowFeatures:
    """
    窗口聚合特征数据类

    用于 EventWindowManager 和特征计算函数之间的数据传递
    """
    net_expectation: float  # 净预期值（基于事件强度加权）
    dominant_sentiment: str  # 主导情绪: bullish/bearish/neutral
    sentiment_score: float  # 情绪得分 [-1, 1]
    logical_consistency: float  # 逻辑一致性 [0, 1]

    # 可选扩展特征
    event_count: int = 0  # 窗口内事件数
    bullish_count: int = 0  # 看多事件数
    bearish_count: int = 0  # 看空事件数
    neutral_count: int = 0  # 中性事件数
    avg_intensity: float = 0.0  # 平均事件强度

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "net_expectation": self.net_expectation,
            "dominant_sentiment": self.dominant_sentiment,
            "sentiment_score": self.sentiment_score,
            "logical_consistency": self.logical_consistency,
            "event_count": self.event_count,
            "bullish_count": self.bullish_count,
            "bearish_count": self.bearish_count,
            "neutral_count": self.neutral_count,
            "avg_intensity": self.avg_intensity,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "WindowFeatures":
        """从字典创建"""
        return cls(
            net_expectation=data.get("net_expectation", 0.0),
            dominant_sentiment=data.get("dominant_sentiment", "neutral"),
            sentiment_score=data.get("sentiment_score", 0.0),
            logical_consistency=data.get("logical_consistency", 0.0),
            event_count=data.get("event_count", 0),
            bullish_count=data.get("bullish_count", 0),
            bearish_count=data.get("bearish_count", 0),
            neutral_count=data.get("neutral_count", 0),
            avg_intensity=data.get("avg_intensity", 0.0),
        )


# ==================== 事件类型枚举（字符串常量） ====================

class EventType:
    """事件类型常量"""
    PERFORMANCE = "业绩"  # 财报、业绩预告
    EQUITY = "股权"  # 股权变动、回购、增发
    GOVERNANCE = "治理"  # 管理层变动、董事会决议
    BUSINESS = "业务"  # 产品发布、合同签订
    POLICY = "政策"  # 行业政策、监管政策


class TemporalRelation:
    """时序关系常量"""
    BEFORE = "BEFORE"  # A在B之前
    AFTER = "AFTER"  # A在B之后
    EQUAL = "EQUAL"  # A和B同时
    VAGUE = "VAGUE"  # 时间关系不确定


class EventSentiment:
    """事件情绪常量"""
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
