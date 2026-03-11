"""
叙事摘要生成模块

将事件链转换为结构化叙事摘要，替代原始JSON图谱输出。
基于学术论文建议，提供三个关键数值：净预期强度、主导情绪、逻辑一致性。
"""
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Dict, Any
from enum import Enum


class TemporalPattern(str, Enum):
    """时间模式类型"""
    REVERSAL = "Reversal"      # 先负后正（先利空后利好）
    CUMULATIVE = "Cumulative"  # 同向事件连续
    CONFLICT = "Conflict"      # 正负交替
    COMPLEX = "Complex"        # 复杂模式


class Sentiment(str, Enum):
    """情绪类型"""
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


@dataclass
class Event:
    """事件数据模型"""
    id: str
    event_type: str
    description: str
    sentiment: str  # positive/negative/neutral
    intensity: float  # 事件强度 S = P_up - P_down
    publish_time: datetime
    p_up: Optional[float] = None
    p_down: Optional[float] = None
    is_merged: bool = False
    merged_count: int = 1


@dataclass
class EventRelation:
    """事件关系数据模型"""
    event_a_id: str
    event_b_id: str
    relation: str  # Before/After/Equal/Vague
    confidence: float


@dataclass
class ChainFeatures:
    """事件链特征"""
    net_expectation: float  # Fa值（净预期强度）
    dominant_sentiment: str  # positive/negative/neutral
    logical_consistency: float  # 0-1
    sentiment_volatility: float  # 情绪波动率


@dataclass
class EventChain:
    """事件链数据模型"""
    symbol: str
    window_start: datetime
    window_end: datetime
    events: List[Event]
    relations: List[EventRelation]
    features: ChainFeatures

    def get_event(self, event_id: str) -> Optional[Event]:
        """根据ID获取事件"""
        for event in self.events:
            if event.id == event_id:
                return event
        return None


@dataclass
class NarrativeSummary:
    """叙事摘要结果"""
    text: str  # 完整叙事文本
    symbol: str
    temporal_pattern: str
    net_expectation: float
    dominant_sentiment: str
    logical_consistency: float
    event_count: int


class EventNarrativeBuilder:
    """
    事件叙事摘要构建器

    将事件链转换为结构化叙事摘要，替代原始JSON图谱输出。
    输出格式严格遵循论文建议：
    【事件链摘要】股票{代码}近30天呈现{时间模式}：{事件序列描述}。
    净预期强度{Fa值}，主导情绪{dominant}，逻辑一致性{consistency}。

    关键设计原则：
    1. dominant_sentiment 必须从 net_expectation 推导，确保逻辑一致性
    2. 时间模式分类帮助AI快速理解整体格局
    3. 事件序列描述简洁明了，按时间顺序排列
    """

    # 时间模式描述映射
    PATTERN_DESCRIPTIONS = {
        TemporalPattern.REVERSAL: "先负后正的反转模式",
        TemporalPattern.CUMULATIVE: "同向事件连续发生的累积模式",
        TemporalPattern.CONFLICT: "正负事件交替的博弈模式",
        TemporalPattern.COMPLEX: "复杂多事件交织模式"
    }

    # 情绪阈值
    SENTIMENT_THRESHOLD = 0.3

    def build_narrative(self, event_chain: EventChain) -> NarrativeSummary:
        """
        构建叙事摘要

        Args:
            event_chain: 事件链数据

        Returns:
            NarrativeSummary: 结构化叙事摘要结果
        """
        symbol = event_chain.symbol

        # 分类时间模式
        pattern = self._classify_temporal_pattern(event_chain)
        pattern_desc = self.PATTERN_DESCRIPTIONS.get(pattern, "复杂模式")

        # 生成事件序列描述
        events_desc = self._describe_event_sequence(event_chain.events)

        # 获取关键数值
        net_fa = event_chain.features.net_expectation
        consistency = event_chain.features.logical_consistency

        # 从net_fa推导主导情绪，确保逻辑一致性
        dominant = self._derive_dominant_sentiment(net_fa)

        # 构建叙事文本
        narrative_text = (
            f"【事件链摘要】股票{symbol}近30天呈现{pattern_desc}："
            f"{events_desc}。"
            f"净预期强度{net_fa:+.2f}，主导情绪{dominant}，逻辑一致性{consistency:.0%}。"
        )

        return NarrativeSummary(
            text=narrative_text,
            symbol=symbol,
            temporal_pattern=pattern.value,
            net_expectation=net_fa,
            dominant_sentiment=dominant,
            logical_consistency=consistency,
            event_count=len(event_chain.events)
        )

    def _derive_dominant_sentiment(self, net_fa: float) -> str:
        """
        从净预期强度推导主导情绪

        关键设计：必须从net_expectation推导，确保逻辑一致性。
        避免dominant_sentiment与Fa值矛盾的情况。

        Args:
            net_fa: 净预期强度 (Fa值)

        Returns:
            str: dominant_sentiment (positive/negative/neutral)

        阈值规则：
            Fa > 0.3  → positive
            Fa < -0.3 → negative
            其他      → neutral
        """
        if net_fa > self.SENTIMENT_THRESHOLD:
            return Sentiment.POSITIVE.value
        elif net_fa < -self.SENTIMENT_THRESHOLD:
            return Sentiment.NEGATIVE.value
        else:
            return Sentiment.NEUTRAL.value

    def _classify_temporal_pattern(self, chain: EventChain) -> TemporalPattern:
        """
        分类时间模式

        识别三种主要模式：
        - Reversal（反转）: 先负后正（先利空后利好）
        - Cumulative（累积）: 同向事件连续发生
        - Conflict（博弈）: 正负事件交替且无明显先后顺序

        Args:
            chain: 事件链数据

        Returns:
            TemporalPattern: 时间模式类型
        """
        if not chain.events:
            return TemporalPattern.COMPLEX

        sentiments = [e.sentiment for e in chain.events]
        relations = chain.relations

        # 检查是否有明确的先后关系导致反转（先负后正）
        negative_first_positive_after = self._check_reversal_pattern(
            chain, sentiments, relations
        )
        if negative_first_positive_after:
            return TemporalPattern.REVERSAL

        # 检查同向累积（所有事件都是同一方向）
        if all(s == Sentiment.POSITIVE.value for s in sentiments):
            return TemporalPattern.CUMULATIVE
        if all(s == Sentiment.NEGATIVE.value for s in sentiments):
            return TemporalPattern.CUMULATIVE

        # 检查交替博弈（正负交替）
        if len(set(sentiments)) > 1:
            return TemporalPattern.CONFLICT

        return TemporalPattern.COMPLEX

    def _check_reversal_pattern(
        self,
        chain: EventChain,
        sentiments: List[str],
        relations: List[EventRelation]
    ) -> bool:
        """
        检查是否存在反转模式（先负后正）

        反转模式定义：
        - 最早的负事件在最新的正事件之前
        - 所有负事件都在所有正事件之前（或大部分负事件在前期，正事件在后期）
        - 不存在正事件在负事件之前的情况

        Args:
            chain: 事件链
            sentiments: 情绪列表
            relations: 事件关系列表

        Returns:
            bool: 是否存在反转模式
        """
        # 分离正负事件
        negative_events = []
        positive_events = []

        for i, sentiment in enumerate(sentiments):
            if sentiment == Sentiment.NEGATIVE.value:
                negative_events.append(chain.events[i])
            elif sentiment == Sentiment.POSITIVE.value:
                positive_events.append(chain.events[i])

        if not negative_events or not positive_events:
            return False

        # 获取时间边界
        earliest_negative = min(negative_events, key=lambda e: e.publish_time)
        latest_negative = max(negative_events, key=lambda e: e.publish_time)
        earliest_positive = min(positive_events, key=lambda e: e.publish_time)
        latest_positive = max(positive_events, key=lambda e: e.publish_time)

        # 反转模式：所有负事件都在所有正事件之前
        # 即：最晚的负事件 < 最早的正事件
        if latest_negative.publish_time < earliest_positive.publish_time:
            return True

        # 检查是否有明确的先后关系导致反转
        for rel in relations:
            if rel.relation not in ["Before", "After"]:
                continue

            event_a = chain.get_event(rel.event_a_id)
            event_b = chain.get_event(rel.event_b_id)

            if not event_a or not event_b:
                continue

            # 检查是否负事件在正事件之前
            if (event_a.sentiment == Sentiment.NEGATIVE.value and
                event_b.sentiment == Sentiment.POSITIVE.value):
                if rel.relation == "Before":
                    # 额外检查：确保没有正事件在负事件之前
                    if earliest_positive.publish_time >= latest_negative.publish_time:
                        return True

            # 检查是否正事件在负事件之后（等价于上面）
            if (event_a.sentiment == Sentiment.POSITIVE.value and
                event_b.sentiment == Sentiment.NEGATIVE.value):
                if rel.relation == "After":
                    # 额外检查：确保没有正事件在负事件之前
                    if earliest_positive.publish_time >= latest_negative.publish_time:
                        return True

        return False

    def _describe_event_sequence(self, events: List[Event]) -> str:
        """
        生成事件序列描述

        格式示例：
        - "预增(3.15,+0.45)→减持(3.18,-0.30)→回购(3.20,+0.60)"
        - "多起预增事件(共3起)[含极端事件](3.15,+0.50)"

        Args:
            events: 事件列表

        Returns:
            str: 事件序列描述
        """
        if not events:
            return "无事件"

        # 按时间排序
        sorted_events = sorted(events, key=lambda e: e.publish_time)

        event_descriptions = []
        for event in sorted_events:
            desc = self._format_single_event(event)
            event_descriptions.append(desc)

        return "→".join(event_descriptions)

    def _format_single_event(self, event: Event) -> str:
        """
        格式化单个事件描述

        Args:
            event: 事件数据

        Returns:
            str: 格式化后的事件描述
        """
        # 日期格式：MM.DD
        date_str = event.publish_time.strftime("%m.%d")

        # 强度符号：正数显示+，负数显示-
        intensity_str = f"{event.intensity:+.2f}"

        # 事件类型（如果是合并事件，显示合并信息）
        if event.is_merged and event.merged_count > 1:
            event_type = f"多起{event.event_type}事件(共{event.merged_count}起)"
            # 检查是否有极端事件标记
            if hasattr(event, 'has_extreme_event') and event.has_extreme_event:
                event_type += "[含极端事件]"
        else:
            # 简化事件类型名称
            event_type = self._simplify_event_type(event.event_type)

        return f"{event_type}({date_str},{intensity_str})"

    def _simplify_event_type(self, event_type: str) -> str:
        """
        简化事件类型名称

        Args:
            event_type: 原始事件类型

        Returns:
            str: 简化后的事件类型
        """
        # 常见事件类型映射
        type_mapping = {
            "预增": "预增",
            "预减": "预减",
            "业绩预增": "预增",
            "业绩预减": "预减",
            "增持": "增持",
            "减持": "减持",
            "回购": "回购",
            "分红": "分红",
            "配股": "配股",
            "定增": "定增",
            "并购": "并购",
            "重组": "重组",
            "股权激励": "激励",
            "重大合同": "合同",
            "诉讼": "诉讼",
            "违规": "违规",
            "高管变动": "高管变动",
            "股权质押": "质押",
            "解除质押": "解押",
            "停牌": "停牌",
            "复牌": "复牌",
        }

        for key, value in type_mapping.items():
            if key in event_type:
                return value

        # 如果没有匹配，返回前4个字符
        return event_type[:4] if len(event_type) > 4 else event_type


def build_narrative_summary(
    symbol: str,
    events: List[Dict[str, Any]],
    relations: List[Dict[str, Any]],
    net_expectation: float,
    logical_consistency: float,
    sentiment_volatility: float = 0.0
) -> str:
    """
    便捷函数：从原始数据构建叙事摘要

    Args:
        symbol: 股票代码
        events: 事件列表（字典格式）
        relations: 关系列表（字典格式）
        net_expectation: 净预期强度
        logical_consistency: 逻辑一致性
        sentiment_volatility: 情绪波动率

    Returns:
        str: 叙事摘要文本

    Example:
        >>> events = [
        ...     {"id": "e1", "event_type": "预增", "sentiment": "positive",
        ...      "intensity": 0.45, "publish_time": datetime(2026, 3, 15)},
        ...     {"id": "e2", "event_type": "减持", "sentiment": "negative",
        ...      "intensity": -0.30, "publish_time": datetime(2026, 3, 18)},
        ... ]
        >>> summary = build_narrative_summary(
        ...     symbol="000001",
        ...     events=events,
        ...     relations=[],
        ...     net_expectation=0.15,
        ...     logical_consistency=0.75
        ... )
    """
    # 转换事件数据
    event_objects = []
    for e in events:
        event_objects.append(Event(
            id=e.get("id", ""),
            event_type=e.get("event_type", ""),
            description=e.get("description", ""),
            sentiment=e.get("sentiment", "neutral"),
            intensity=e.get("intensity", 0.0),
            publish_time=e.get("publish_time", datetime.now()),
            p_up=e.get("p_up"),
            p_down=e.get("p_down"),
            is_merged=e.get("is_merged", False),
            merged_count=e.get("merged_count", 1)
        ))

    # 转换关系数据
    relation_objects = []
    for r in relations:
        relation_objects.append(EventRelation(
            event_a_id=r.get("event_a_id", ""),
            event_b_id=r.get("event_b_id", ""),
            relation=r.get("relation", "Vague"),
            confidence=r.get("confidence", 0.5)
        ))

    # 构建事件链
    chain = EventChain(
        symbol=symbol,
        window_start=datetime.now(),
        window_end=datetime.now(),
        events=event_objects,
        relations=relation_objects,
        features=ChainFeatures(
            net_expectation=net_expectation,
            dominant_sentiment="",  # 将由builder推导
            logical_consistency=logical_consistency,
            sentiment_volatility=sentiment_volatility
        )
    )

    # 构建叙事
    builder = EventNarrativeBuilder()
    summary = builder.build_narrative(chain)

    return summary.text
