"""
布尔问答时序判断模块单元测试

测试覆盖:
1. 布尔问答映射正确性
2. 事件合并与极端值检测
3. Top3限制功能
4. 启发式分类回退
"""

import pytest
from datetime import datetime, timedelta
from typing import List

from services.event_analysis.temporal_analyzer import (
    BooleanTemporalAnalyzer,
    TemporalPatternClassifier,
    Event,
    EventIntensity,
    EventRelation,
)


class TestBooleanMapping:
    """测试布尔问答映射规则"""

    def setup_method(self):
        self.analyzer = BooleanTemporalAnalyzer(llm_adapter=None)

    def test_map_answers_before(self):
        """测试 (YES, NO) -> Before"""
        result = self.analyzer._map_answers("YES", "NO")
        assert result == "Before"

    def test_map_answers_after(self):
        """测试 (NO, YES) -> After"""
        result = self.analyzer._map_answers("NO", "YES")
        assert result == "After"

    def test_map_answers_equal(self):
        """测试 (NO, NO) -> Equal"""
        result = self.analyzer._map_answers("NO", "NO")
        assert result == "Equal"

    def test_map_answers_vague(self):
        """测试 (YES, YES) -> Vague"""
        result = self.analyzer._map_answers("YES", "YES")
        assert result == "Vague"

    def test_map_answers_case_insensitive(self):
        """测试大小写不敏感"""
        assert self.analyzer._map_answers("yes", "no") == "Before"
        assert self.analyzer._map_answers("Yes", "No") == "Before"
        assert self.analyzer._map_answers("YES ", " NO ") == "Before"

    def test_map_answers_invalid_defaults_to_vague(self):
        """测试无效输入默认返回Vague"""
        assert self.analyzer._map_answers("MAYBE", "YES") == "Vague"
        assert self.analyzer._map_answers("", "") == "Vague"


class TestConfidenceCalculation:
    """测试置信度计算"""

    def setup_method(self):
        self.analyzer = BooleanTemporalAnalyzer(llm_adapter=None)

    def test_confidence_equal(self):
        """测试Equal关系的高置信度"""
        confidence = self.analyzer._calculate_confidence("NO", "NO")
        assert confidence == 0.9

    def test_confidence_before_after(self):
        """测试Before/After关系的中等置信度"""
        assert self.analyzer._calculate_confidence("YES", "NO") == 0.75
        assert self.analyzer._calculate_confidence("NO", "YES") == 0.75

    def test_confidence_vague(self):
        """测试Vague关系的低置信度"""
        confidence = self.analyzer._calculate_confidence("YES", "YES")
        assert confidence == 0.5


class TestEventMerging:
    """测试事件合并功能"""

    def setup_method(self):
        self.analyzer = BooleanTemporalAnalyzer(llm_adapter=None)
        self.base_time = datetime(2024, 3, 15, 10, 0, 0)

    def create_event(
        self,
        event_id: str,
        event_type: str,
        description: str,
        strength: float,
        time_offset_minutes: int = 0
    ) -> Event:
        """辅助方法：创建测试事件"""
        return Event(
            id=event_id,
            event_type=event_type,
            description=description,
            intensity=EventIntensity(
                strength=strength,
                p_up=(1 + strength) / 2,
                p_down=(1 - strength) / 2,
                max_abs_strength=abs(strength),
                has_extreme_event=abs(strength) > 0.5
            ),
            publish_time=self.base_time + timedelta(minutes=time_offset_minutes),
            symbol="000001.SZ",
            sentiment="positive" if strength > 0 else "negative"
        )

    def test_merge_similar_events_same_type(self):
        """测试同类事件合并"""
        events = [
            self.create_event("e1", "高管减持", "高管A减持", -0.3, 0),
            self.create_event("e2", "高管减持", "高管B减持", -0.4, 30),
            self.create_event("e3", "业绩预告", "预增50%", 0.6, 60),
        ]

        merged = self.analyzer._merge_similar_events(events)

        # 应该合并为2个事件
        assert len(merged) == 2

        # 找到合并后的减持事件
        reduced_events = [e for e in merged if e.event_type == "高管减持"]
        assert len(reduced_events) == 1

        merged_event = reduced_events[0]
        assert merged_event.is_merged is True
        assert merged_event.merged_count == 2
        assert "多起高管减持事件" in merged_event.description
        assert "(共2起)" in merged_event.description

    def test_merge_preserves_extreme_event_flag(self):
        """测试合并保留极端事件标记"""
        events = [
            self.create_event("e1", "高管减持", "高管A减持", -0.3, 0),
            self.create_event("e2", "高管减持", "高管B大额减持", -0.8, 30),  # 极端事件
        ]

        merged = self.analyzer._merge_similar_events(events)
        reduced_events = [e for e in merged if e.event_type == "高管减持"]

        assert len(reduced_events) == 1
        merged_event = reduced_events[0]

        # 应该检测到极端事件
        assert merged_event.intensity.max_abs_strength == 0.8
        assert merged_event.intensity.has_extreme_event is True
        assert "[含极端事件]" in merged_event.description

    def test_merge_calculates_average_strength(self):
        """测试合并计算平均强度"""
        events = [
            self.create_event("e1", "减持", "减持1", -0.3, 0),
            self.create_event("e2", "减持", "减持2", -0.5, 30),
            self.create_event("e3", "减持", "减持3", -0.4, 60),
        ]

        merged = self.analyzer._merge_similar_events(events)
        merged_event = merged[0]

        # 平均强度: (-0.3 + -0.5 + -0.4) / 3 = -0.4
        assert abs(merged_event.intensity.strength - (-0.4)) < 0.01

    def test_no_merge_for_single_event(self):
        """测试单个事件不合并"""
        events = [
            self.create_event("e1", "业绩预告", "预增50%", 0.6, 0),
        ]

        merged = self.analyzer._merge_similar_events(events)

        assert len(merged) == 1
        assert merged[0].is_merged is False
        assert merged[0].merged_count == 1

    def test_merge_uses_earliest_time(self):
        """测试合并使用最早时间"""
        events = [
            self.create_event("e2", "减持", "减持2", -0.5, 30),
            self.create_event("e1", "减持", "减持1", -0.3, 0),
            self.create_event("e3", "减持", "减持3", -0.4, 60),
        ]

        merged = self.analyzer._merge_similar_events(events)
        merged_event = merged[0]

        # 应该使用最早的时间
        assert merged_event.publish_time == self.base_time


class TestTopEventSelection:
    """测试Top事件选择功能"""

    def setup_method(self):
        self.analyzer = BooleanTemporalAnalyzer(llm_adapter=None)
        self.base_time = datetime(2024, 3, 15, 10, 0, 0)

    def create_event(self, event_id: str, strength: float) -> Event:
        """辅助方法：创建测试事件"""
        return Event(
            id=event_id,
            event_type="test",
            description=f"Event {event_id}",
            intensity=EventIntensity(
                strength=strength,
                max_abs_strength=abs(strength),
                has_extreme_event=abs(strength) > 0.5
            ),
            publish_time=self.base_time,
            symbol="000001.SZ"
        )

    def test_select_top_events_by_absolute_strength(self):
        """测试按|S|排序选择Top事件"""
        events = [
            self.create_event("e1", 0.3),
            self.create_event("e2", -0.8),  # 最大|S|
            self.create_event("e3", 0.5),
            self.create_event("e4", -0.2),
            self.create_event("e5", 0.9),   # 最大|S|
        ]

        top3 = self.analyzer._select_top_events(events, limit=3)

        assert len(top3) == 3
        # 应该选中 |S| 最大的: e5(0.9), e2(0.8), e3(0.5)
        assert top3[0].id == "e5"
        assert top3[1].id == "e2"
        assert top3[2].id == "e3"

    def test_select_top_events_limit_3(self):
        """测试默认限制为3个事件"""
        events = [self.create_event(f"e{i}", i * 0.1) for i in range(1, 10)]

        top = self.analyzer._select_top_events(events)

        assert len(top) == 3  # 默认限制

    def test_select_top_events_empty_list(self):
        """测试空列表"""
        top = self.analyzer._select_top_events([], limit=3)
        assert len(top) == 0

    def test_select_top_events_less_than_limit(self):
        """测试事件数量少于限制"""
        events = [self.create_event("e1", 0.5)]

        top = self.analyzer._select_top_events(events, limit=3)

        assert len(top) == 1


class TestHeuristicClassification:
    """测试启发式分类回退"""

    def setup_method(self):
        self.analyzer = BooleanTemporalAnalyzer(llm_adapter=None)
        self.base_time = datetime(2024, 3, 15, 10, 0, 0)

    def create_event(self, event_id: str, time_offset_hours: int) -> Event:
        """辅助方法：创建测试事件"""
        return Event(
            id=event_id,
            event_type="test",
            description=f"Event {event_id}",
            intensity=EventIntensity(strength=0.5),
            publish_time=self.base_time + timedelta(hours=time_offset_hours),
            symbol="000001.SZ"
        )

    def test_heuristic_before(self):
        """测试A早于B -> Before"""
        event_a = self.create_event("a", 0)   # 10:00
        event_b = self.create_event("b", 2)   # 12:00

        relation = self.analyzer._heuristic_classify(event_a, event_b)

        assert relation.relation == "Before"
        assert relation.q1_answer == "YES"
        assert relation.q2_answer == "NO"
        assert relation.source == "date"

    def test_heuristic_after(self):
        """测试A晚于B -> After"""
        event_a = self.create_event("a", 2)   # 12:00
        event_b = self.create_event("b", 0)   # 10:00

        relation = self.analyzer._heuristic_classify(event_a, event_b)

        assert relation.relation == "After"
        assert relation.q1_answer == "NO"
        assert relation.q2_answer == "YES"

    def test_heuristic_equal(self):
        """测试同时发生 -> Equal"""
        event_a = self.create_event("a", 0)   # 10:00
        event_b = self.create_event("b", 0)   # 10:00 (相同时间)

        relation = self.analyzer._heuristic_classify(event_a, event_b)

        assert relation.relation == "Equal"
        assert relation.q1_answer == "NO"
        assert relation.q2_answer == "NO"

    def test_heuristic_within_one_hour(self):
        """测试1小时内视为同时"""
        event_a = self.create_event("a", 0)           # 10:00
        event_b = self.create_event("b", 0.5)         # 10:30 (30分钟)

        relation = self.analyzer._heuristic_classify(event_a, event_b)

        assert relation.relation == "Equal"


class TestBooleanResponseParsing:
    """测试布尔响应解析"""

    def setup_method(self):
        self.analyzer = BooleanTemporalAnalyzer(llm_adapter=None)

    def test_parse_standard_yes(self):
        """测试标准YES"""
        assert self.analyzer._parse_boolean_response("YES") == "YES"

    def test_parse_standard_no(self):
        """测试标准NO"""
        assert self.analyzer._parse_boolean_response("NO") == "NO"

    def test_parse_lowercase(self):
        """测试小写"""
        assert self.analyzer._parse_boolean_response("yes") == "YES"
        assert self.analyzer._parse_boolean_response("no") == "NO"

    def test_parse_with_whitespace(self):
        """测试带空白"""
        assert self.analyzer._parse_boolean_response("  YES  ") == "YES"
        assert self.analyzer._parse_boolean_response("NO\n") == "NO"

    def test_parse_with_extra_text(self):
        """测试带额外文本"""
        assert self.analyzer._parse_boolean_response("The answer is YES") == "YES"
        assert self.analyzer._parse_boolean_response("I think NO") == "NO"

    def test_parse_chinese(self):
        """测试中文回答"""
        assert self.analyzer._parse_boolean_response("是") == "YES"
        assert self.analyzer._parse_boolean_response("可能") == "YES"
        assert self.analyzer._parse_boolean_response("否") == "NO"

    def test_parse_empty_defaults_yes(self):
        """测试空响应默认YES"""
        assert self.analyzer._parse_boolean_response("") == "YES"
        assert self.analyzer._parse_boolean_response(None) == "YES"


class TestGroupByDate:
    """测试按日期分组"""

    def setup_method(self):
        self.analyzer = BooleanTemporalAnalyzer(llm_adapter=None)
        self.base_date = datetime(2024, 3, 15, 10, 0, 0)

    def create_event(self, event_id: str, day_offset: int, hour: int = 10) -> Event:
        """辅助方法：创建测试事件"""
        return Event(
            id=event_id,
            event_type="test",
            description=f"Event {event_id}",
            intensity=EventIntensity(strength=0.5),
            publish_time=self.base_date + timedelta(days=day_offset, hours=hour-10),
            symbol="000001.SZ"
        )

    def test_group_by_date(self):
        """测试按日期正确分组"""
        events = [
            self.create_event("e1", 0),   # 2024-03-15
            self.create_event("e2", 0),   # 2024-03-15
            self.create_event("e3", 1),   # 2024-03-16
            self.create_event("e4", 2),   # 2024-03-17
        ]

        groups = self.analyzer._group_by_date(events)

        assert len(groups) == 3
        assert len(groups["2024-03-15"]) == 2
        assert len(groups["2024-03-16"]) == 1
        assert len(groups["2024-03-17"]) == 1


class TestTemporalPatternClassifier:
    """测试时间模式分类器"""

    def create_event(self, event_id: str, sentiment: str) -> Event:
        """辅助方法：创建测试事件"""
        return Event(
            id=event_id,
            event_type="test",
            description=f"Event {event_id}",
            intensity=EventIntensity(strength=0.5),
            publish_time=datetime.now(),
            symbol="000001.SZ",
            sentiment=sentiment
        )

    def create_relation(self, a_id: str, b_id: str, rel: str) -> EventRelation:
        """辅助方法：创建测试关系"""
        return EventRelation(
            event_a_id=a_id,
            event_b_id=b_id,
            relation=rel,
            confidence=0.8,
            q1_answer="YES",
            q2_answer="NO"
        )

    def test_classify_cumulative_positive(self):
        """测试同向正向累积"""
        events = [
            self.create_event("e1", "positive"),
            self.create_event("e2", "positive"),
            self.create_event("e3", "positive"),
        ]

        pattern = TemporalPatternClassifier.classify_pattern(events, [])
        assert pattern == "Cumulative"

    def test_classify_cumulative_negative(self):
        """测试同向负向累积"""
        events = [
            self.create_event("e1", "negative"),
            self.create_event("e2", "negative"),
        ]

        pattern = TemporalPatternClassifier.classify_pattern(events, [])
        assert pattern == "Cumulative"

    def test_classify_conflict(self):
        """测试正负交替博弈"""
        events = [
            self.create_event("e1", "positive"),
            self.create_event("e2", "negative"),
            self.create_event("e3", "positive"),
        ]

        pattern = TemporalPatternClassifier.classify_pattern(events, [])
        assert pattern == "Conflict"

    def test_classify_reversal(self):
        """测试先负后正反转"""
        events = [
            self.create_event("e1", "negative"),
            self.create_event("e2", "positive"),
        ]
        relations = [
            self.create_relation("e1", "e2", "Before")
        ]

        pattern = TemporalPatternClassifier.classify_pattern(events, relations)
        assert pattern == "Reversal"


class TestAnalyzerStats:
    """测试分析器统计功能"""

    def test_get_stats(self):
        """测试获取统计信息"""
        analyzer = BooleanTemporalAnalyzer(llm_adapter=None)

        stats = analyzer.get_stats()

        assert "total_llm_calls" in stats
        assert "total_tokens" in stats
        assert "max_events_per_day" in stats
        assert "extreme_threshold" in stats
        assert stats["max_events_per_day"] == 3
        assert stats["extreme_threshold"] == 0.5

    def test_reset_stats(self):
        """测试重置统计"""
        analyzer = BooleanTemporalAnalyzer(llm_adapter=None)
        analyzer._total_calls = 10
        analyzer._total_tokens = 100

        analyzer.reset_stats()

        assert analyzer._total_calls == 0
        assert analyzer._total_tokens == 0


class TestIntegrationFlow:
    """集成流程测试"""

    def setup_method(self):
        self.analyzer = BooleanTemporalAnalyzer(llm_adapter=None)
        self.base_time = datetime(2024, 3, 15, 10, 0, 0)

    def create_event(
        self,
        event_id: str,
        event_type: str,
        strength: float,
        time_offset_hours: int = 0
    ) -> Event:
        """辅助方法：创建测试事件"""
        return Event(
            id=event_id,
            event_type=event_type,
            description=f"{event_type} event",
            intensity=EventIntensity(
                strength=strength,
                max_abs_strength=abs(strength),
                has_extreme_event=abs(strength) > 0.5
            ),
            publish_time=self.base_time + timedelta(hours=time_offset_hours),
            symbol="000001.SZ",
            sentiment="positive" if strength > 0 else "negative"
        )

    @pytest.mark.asyncio
    async def test_single_stock_single_day_max_3_events(self):
        """
        集成测试: 单股票单日最多3个事件

        场景: 同一天5个事件（3个减持 + 2个业绩预告）
        预期: 合并后最多3个，C(3,2)=3对关系
        """
        events = [
            # 3个减持事件（应合并为1个）
            self.create_event("r1", "高管减持", -0.3, 0),
            self.create_event("r2", "高管减持", -0.4, 1),
            self.create_event("r3", "高管减持", -0.35, 2),
            # 2个业绩预告（保持独立）
            self.create_event("f1", "业绩预告", 0.6, 3),
            self.create_event("f2", "业绩预告", 0.5, 4),
        ]

        relations = await self.analyzer.analyze_event_relations(events)

        # 合并后: 1个减持 + 2个预告 = 3个事件
        # C(3,2) = 3对关系
        assert len(relations) <= 3

    @pytest.mark.asyncio
    async def test_empty_events(self):
        """测试空事件列表"""
        relations = await self.analyzer.analyze_event_relations([])
        assert len(relations) == 0

    @pytest.mark.asyncio
    async def test_single_event(self):
        """测试单个事件"""
        events = [self.create_event("e1", "test", 0.5, 0)]
        relations = await self.analyzer.analyze_event_relations(events)
        assert len(relations) == 0

    @pytest.mark.asyncio
    async def test_different_dates_no_relations(self):
        """测试不同日期的事件不产生关系"""
        events = [
            self.create_event("e1", "test", 0.5, 0),      # 第1天
            self.create_event("e2", "test", 0.6, 24),    # 第2天
        ]

        relations = await self.analyzer.analyze_event_relations(events)

        # 不同日期的事件不会进行时序判断
        assert len(relations) == 0
