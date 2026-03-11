"""
布尔问答时序判断模块

基于学术论文的布尔问答方法实现事件间时序关系判断。
将4分类问题转为2个二分类问题，提高准确率并降低成本。

核心特性:
1. 布尔问答映射: (YES,NO)->Before, (NO,YES)->After, (NO,NO)->Equal, (YES,YES)->Vague
2. 成本控制: 事件合并 + Top3限制，单股票单日最多3个事件 -> C(3,2)=3对 -> 6次LLM调用/天
3. 极端事件检测: 保留max_abs_strength，>0.5标记"[含极端事件]"
"""

import re
import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any
from collections import defaultdict
import asyncio


@dataclass
class EventIntensity:
    """事件强度数据模型"""
    strength: float  # S = P_up - P_down, 范围-1~+1
    p_up: float = 0.5  # 上涨概率
    p_down: float = 0.5  # 下跌概率
    max_abs_strength: float = 0.0  # 新增：检测极端值
    has_extreme_event: bool = False  # 新增：是否含极端事件
    source: str = "llm_option"  # 来源标识


@dataclass
class Event:
    """事件数据模型"""
    id: str
    event_type: str
    description: str
    intensity: EventIntensity
    publish_time: datetime
    symbol: str = ""
    sentiment: str = "neutral"  # positive/negative/neutral
    is_merged: bool = False
    merged_count: int = 1

    def __hash__(self):
        return hash(self.id)

    def __eq__(self, other):
        if not isinstance(other, Event):
            return False
        return self.id == other.id


@dataclass
class EventRelation:
    """事件关系数据模型"""
    event_a_id: str
    event_b_id: str
    relation: str  # Before/After/Equal/Vague
    confidence: float
    q1_answer: str  # YES/NO
    q2_answer: str  # YES/NO
    source: str = "llm_boolean"  # 关系判断来源
    created_at: datetime = field(default_factory=datetime.utcnow)


class BooleanTemporalAnalyzer:
    """
    基于论文表3的布尔问答时序判断器

    将4分类时序关系问题转化为2个二分类问题：
    - Q1: 事件A是否可能先于事件B发生？
    - Q2: 事件B是否可能先于事件A发生？

    关系映射规则:
    - (YES, NO)  -> Before  (A先于B)
    - (NO, YES)  -> After   (A后于B)
    - (NO, NO)   -> Equal   (同时发生)
    - (YES, YES) -> Vague   (时序模糊)

    成本控制策略:
    1. 事件合并: 同一类型事件合并为"多起XX事件"
    2. Top3限制: 按|S|排序取前3个重要事件
    3. 单股票单日最多3个事件 -> C(3,2)=3对 -> 6次LLM调用/天
    """

    # 论文表3的Prompt模板 - 问题1
    QUESTION_1_PROMPT = """你是一个时间关系分类器。

文本: {context}
事件A: {event_a}
事件B: {event_b}

问题: "根据事件发生时间顺序和逻辑关系，判断事件A是否可能先于事件B发生？"

要求: 仅回答"YES"或"NO"
"""

    # 论文表3的Prompt模板 - 问题2
    QUESTION_2_PROMPT = """你是一个时间关系分类器。

文本: {context}
事件A: {event_a}
事件B: {event_b}

问题: "根据事件发生时间顺序和逻辑关系，判断事件B是否可能先于事件A发生？"

要求: 仅回答"YES"或"NO"
"""

    # 极端事件阈值
    EXTREME_THRESHOLD = 0.5

    # 单股票单日事件上限
    MAX_EVENTS_PER_DAY = 3

    def __init__(self, llm_adapter: Optional[Any] = None):
        """
        初始化时序分析器

        Args:
            llm_adapter: AI适配器，用于调用LLM进行布尔问答
        """
        self.llm_adapter = llm_adapter
        self._total_calls = 0
        self._total_tokens = 0

    async def analyze_event_relations(
        self,
        events: List[Event],
        context: Optional[str] = None
    ) -> List[EventRelation]:
        """
        分析事件间的时序关系

        【修正2】增加事件去重合并机制，控制O(n^2)成本

        成本炸弹场景: 财报季同一天5个事件 -> C(5,2)=10对 -> 20次LLM调用
        1000只股票就是2万次/天

        解决方案:
        1. 单股票单日事件上限: 最多3个（按|P_up-P_down|排序）
        2. 同类事件合并: "高管A减持"+"高管B减持" -> "多起减持事件"
        3. 仅对聚合后的事件对进行时序判断

        Args:
            events: 事件列表
            context: 可选的上下文文本（新闻原文等）

        Returns:
            事件关系列表
        """
        if len(events) < 2:
            return []

        # Step 1: 按日期分组
        events_by_date = self._group_by_date(events)
        all_relations = []

        for date, daily_events in events_by_date.items():
            # Step 2: 同类合并
            merged_events = self._merge_similar_events(daily_events)

            # Step 3: 重要性排序，取Top3
            top_events = self._select_top_events(
                merged_events,
                limit=self.MAX_EVENTS_PER_DAY
            )

            # Step 4: 两两判断时序关系
            if len(top_events) >= 2:
                relations = await self._classify_pairs(top_events, context)
                all_relations.extend(relations)

        return all_relations

    def _group_by_date(self, events: List[Event]) -> Dict[str, List[Event]]:
        """
        按日期对事件进行分组

        Args:
            events: 事件列表

        Returns:
            按日期分组的字典 {date_str: [events]}
        """
        groups = defaultdict(list)
        for event in events:
            date_key = event.publish_time.strftime("%Y-%m-%d")
            groups[date_key].append(event)
        return dict(groups)

    def _merge_similar_events(self, events: List[Event]) -> List[Event]:
        """
        合并同类事件 - 【细节2】增强版，检测极端事件

        合并规则:
        - 同一类型的事件（如多个高管减持）
        - 合并后的强度取平均
        - 【细节2】保留max_abs_strength，检测极端值
        - 合并后的时间取最早的

        Args:
            events: 单日事件列表

        Returns:
            合并后的事件列表
        """
        by_type = defaultdict(list)
        for e in events:
            by_type[e.event_type].append(e)

        merged = []
        for event_type, type_events in by_type.items():
            if len(type_events) == 1:
                merged.append(type_events[0])
            else:
                # 【细节2】计算平均强度 + 检测极端值
                strengths = [e.intensity.strength for e in type_events]
                avg_strength = sum(strengths) / len(strengths)
                max_abs_strength = max(abs(s) for s in strengths)

                p_ups = [e.intensity.p_up for e in type_events]
                p_downs = [e.intensity.p_down for e in type_events]
                avg_p_up = sum(p_ups) / len(p_ups)
                avg_p_down = sum(p_downs) / len(p_downs)

                earliest_time = min(e.publish_time for e in type_events)

                # 【细节2】如果有极端事件，在描述中标记
                has_extreme = max_abs_strength > self.EXTREME_THRESHOLD
                desc_suffix = "[含极端事件]" if has_extreme else ""

                # 构建合并后的事件描述
                descriptions = [e.description for e in type_events[:3]]
                if len(type_events) > 3:
                    descriptions.append(f"...等共{len(type_events)}起")

                merged_event = Event(
                    id=f"merged_{event_type}_{earliest_time.strftime('%Y%m%d')}",
                    event_type=event_type,
                    description=f"多起{event_type}事件(共{len(type_events)}起){desc_suffix}",
                    intensity=EventIntensity(
                        strength=avg_strength,
                        p_up=avg_p_up,
                        p_down=avg_p_down,
                        max_abs_strength=max_abs_strength,
                        has_extreme_event=has_extreme,
                        source="merged"
                    ),
                    publish_time=earliest_time,
                    symbol=type_events[0].symbol,
                    sentiment=type_events[0].sentiment,
                    is_merged=True,
                    merged_count=len(type_events)
                )
                merged.append(merged_event)

        return merged

    def _select_top_events(
        self,
        events: List[Event],
        limit: int = 3
    ) -> List[Event]:
        """
        按|S|排序，选择最重要的事件

        Args:
            events: 事件列表
            limit: 最多选择数量

        Returns:
            Top N重要事件列表
        """
        return sorted(
            events,
            key=lambda e: abs(e.intensity.strength),
            reverse=True
        )[:limit]

    async def _classify_pairs(
        self,
        events: List[Event],
        context: Optional[str] = None
    ) -> List[EventRelation]:
        """
        对事件对进行两两时序关系分类

        Args:
            events: 事件列表（已限制数量）
            context: 可选的上下文文本

        Returns:
            事件关系列表
        """
        relations = []
        n = len(events)

        # 生成所有事件对 (i, j) 其中 i < j
        for i in range(n):
            for j in range(i + 1, n):
                event_a = events[i]
                event_b = events[j]

                relation = await self._classify_pair(event_a, event_b, context)
                if relation:
                    relations.append(relation)

        return relations

    async def _classify_pair(
        self,
        event_a: Event,
        event_b: Event,
        context: Optional[str] = None
    ) -> Optional[EventRelation]:
        """
        对单个事件对进行时序关系分类

        Args:
            event_a: 事件A
            event_b: 事件B
            context: 可选的上下文文本

        Returns:
            事件关系对象，如果分类失败则返回None
        """
        # 如果没有LLM适配器，使用基于时间的启发式规则
        if self.llm_adapter is None:
            return self._heuristic_classify(event_a, event_b)

        try:
            # 构建上下文
            ctx = context or self._build_context(event_a, event_b)

            # 并行调用两个问题的LLM
            q1_prompt = self.QUESTION_1_PROMPT.format(
                context=ctx,
                event_a=event_a.description,
                event_b=event_b.description
            )
            q2_prompt = self.QUESTION_2_PROMPT.format(
                context=ctx,
                event_a=event_a.description,
                event_b=event_b.description
            )

            # 调用LLM（串行或并行取决于适配器实现）
            q1_answer = await self._call_llm_boolean(q1_prompt)
            q2_answer = await self._call_llm_boolean(q2_prompt)

            # 映射到关系
            relation_type = self._map_answers(q1_answer, q2_answer)

            # 计算置信度
            confidence = self._calculate_confidence(q1_answer, q2_answer)

            self._total_calls += 2

            return EventRelation(
                event_a_id=event_a.id,
                event_b_id=event_b.id,
                relation=relation_type,
                confidence=confidence,
                q1_answer=q1_answer,
                q2_answer=q2_answer,
                source="llm_boolean"
            )

        except Exception as e:
            # 失败时回退到启发式规则
            return self._heuristic_classify(event_a, event_b)

    async def _call_llm_boolean(self, prompt: str) -> str:
        """
        调用LLM进行布尔问答

        Args:
            prompt: Prompt文本

        Returns:
            YES 或 NO
        """
        if self.llm_adapter is None:
            return "YES"

        # 这里假设llm_adapter有complete或类似方法
        # 实际实现需要根据具体的AIAdapter接口调整
        try:
            if hasattr(self.llm_adapter, 'complete'):
                response = await self.llm_adapter.complete(
                    prompt=prompt,
                    temperature=0.1
                )
            elif hasattr(self.llm_adapter, 'make_decision'):
                # 备用：使用同步调用
                response = self.llm_adapter.complete_sync(
                    prompt=prompt,
                    temperature=0.1
                )
            else:
                return "YES"

            return self._parse_boolean_response(response)
        except Exception:
            return "YES"

    def _parse_boolean_response(self, response: str) -> str:
        """
        解析LLM的布尔响应

        Args:
            response: LLM原始响应

        Returns:
            YES 或 NO
        """
        if not response:
            return "YES"

        # 清理响应
        cleaned = response.strip().upper()

        # 直接匹配
        if cleaned in ["YES", "NO"]:
            return cleaned

        # 提取第一个YES/NO
        if "YES" in cleaned:
            return "YES"
        if "NO" in cleaned:
            return "NO"

        # 中文匹配
        if "是" in response or "可能" in response:
            return "YES"
        if "否" in response or "不可能" in response:
            return "NO"

        # 默认YES
        return "YES"

    def _map_answers(self, q1: str, q2: str) -> str:
        """
        将两个布尔答案映射到时序关系

        论文表2的映射规则:
        - Q1=YES, Q2=NO  -> Before  (A先于B)
        - Q1=NO, Q2=YES  -> After   (A后于B)
        - Q1=NO, Q2=NO   -> Equal   (同时发生)
        - Q1=YES, Q2=YES -> Vague   (时序模糊)

        Args:
            q1: 问题1的答案 (YES/NO)
            q2: 问题2的答案 (YES/NO)

        Returns:
            时序关系字符串
        """
        answers = (q1.strip().upper(), q2.strip().upper())
        mapping = {
            ("YES", "NO"): "Before",
            ("NO", "YES"): "After",
            ("NO", "NO"): "Equal",
            ("YES", "YES"): "Vague"
        }
        return mapping.get(answers, "Vague")

    def _calculate_confidence(self, q1: str, q2: str) -> float:
        """
        计算关系判断的置信度

        - Equal (NO,NO): 高置信度，明确同时
        - Before/After (YES,NO 或 NO,YES): 中等置信度
        - Vague (YES,YES): 低置信度，时序模糊

        Args:
            q1: 问题1的答案
            q2: 问题2的答案

        Returns:
            置信度分数 0-1
        """
        answers = (q1.strip().upper(), q2.strip().upper())
        confidence_map = {
            ("NO", "NO"): 0.9,    # Equal: 明确同时
            ("YES", "NO"): 0.75,  # Before: 明确先后
            ("NO", "YES"): 0.75,  # After: 明确先后
            ("YES", "YES"): 0.5   # Vague: 时序模糊
        }
        return confidence_map.get(answers, 0.5)

    def _heuristic_classify(
        self,
        event_a: Event,
        event_b: Event
    ) -> EventRelation:
        """
        基于时间的启发式分类（LLM失败时的回退）

        Args:
            event_a: 事件A
            event_b: 事件B

        Returns:
            事件关系对象
        """
        time_diff = (event_a.publish_time - event_b.publish_time).total_seconds()

        if abs(time_diff) < 3600:  # 1小时内视为同时
            relation = "Equal"
            q1, q2 = "NO", "NO"
        elif time_diff < 0:  # A早于B
            relation = "Before"
            q1, q2 = "YES", "NO"
        else:  # A晚于B
            relation = "After"
            q1, q2 = "NO", "YES"

        return EventRelation(
            event_a_id=event_a.id,
            event_b_id=event_b.id,
            relation=relation,
            confidence=0.6,
            q1_answer=q1,
            q2_answer=q2,
            source="date"  # 基于日期判断
        )

    def _build_context(self, event_a: Event, event_b: Event) -> str:
        """
        构建事件上下文文本

        Args:
            event_a: 事件A
            event_b: 事件B

        Returns:
            上下文文本
        """
        return f"股票{event_a.symbol}相关新闻。事件A发生于{event_a.publish_time.strftime('%Y-%m-%d %H:%M')}，事件B发生于{event_b.publish_time.strftime('%Y-%m-%d %H:%M')}。"

    def get_stats(self) -> Dict[str, Any]:
        """
        获取分析器统计信息

        Returns:
            统计信息字典
        """
        return {
            "total_llm_calls": self._total_calls,
            "total_tokens": self._total_tokens,
            "max_events_per_day": self.MAX_EVENTS_PER_DAY,
            "extreme_threshold": self.EXTREME_THRESHOLD
        }

    def reset_stats(self):
        """重置统计信息"""
        self._total_calls = 0
        self._total_tokens = 0


class TemporalPatternClassifier:
    """
    时间模式分类器

    根据事件链的特征分类时间模式:
    - Reversal (反转): 先负后正，可能形成转折点
    - Cumulative (累积): 同向事件连续，趋势强化
    - Conflict (博弈): 正负交替，市场分歧较大
    """

    @staticmethod
    def classify_pattern(events: List[Event], relations: List[EventRelation]) -> str:
        """
        分类时间模式

        Args:
            events: 事件列表
            relations: 事件关系列表

        Returns:
            模式标签: Reversal/Cumulative/Conflict/Complex
        """
        if not events:
            return "Complex"

        sentiments = [e.sentiment for e in events]

        # 检查是否有明确的先后关系导致反转
        negative_first = False
        positive_after = False

        for rel in relations:
            if rel.relation in ["Before", "After"]:
                event_a = next((e for e in events if e.id == rel.event_a_id), None)
                event_b = next((e for e in events if e.id == rel.event_b_id), None)

                if event_a and event_b:
                    if event_a.sentiment == "negative" and event_b.sentiment == "positive":
                        if rel.relation == "Before":
                            negative_first = True
                            positive_after = True
                        else:
                            negative_first = True
                            positive_after = True

        if negative_first and positive_after:
            return "Reversal"

        # 检查同向累积
        if all(s == "positive" for s in sentiments) or all(s == "negative" for s in sentiments):
            return "Cumulative"

        # 检查交替博弈
        if len(set(sentiments)) > 1:
            return "Conflict"

        return "Complex"
