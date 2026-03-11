"""
叙事摘要生成模块单元测试

测试范围：
1. 时间模式分类 (_classify_temporal_pattern)
2. 主导情绪推导 (_derive_dominant_sentiment)
3. 叙事摘要格式 (build_narrative)
4. 事件序列描述生成 (_describe_event_sequence)
"""
import pytest
import sys
from pathlib import Path
from datetime import datetime, timedelta

# Add backend to path
backend_path = Path(__file__).parent.parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from services.event_analysis.narrative_builder import (
    EventNarrativeBuilder,
    EventChain,
    Event,
    EventRelation,
    ChainFeatures,
    TemporalPattern,
    Sentiment,
    build_narrative_summary,
)


class TestDeriveDominantSentiment:
    """测试主导情绪推导逻辑"""

    def test_positive_when_fa_above_threshold(self):
        """Fa > 0.3 时应返回 positive"""
        builder = EventNarrativeBuilder()
        assert builder._derive_dominant_sentiment(0.31) == Sentiment.POSITIVE.value
        assert builder._derive_dominant_sentiment(0.5) == Sentiment.POSITIVE.value
        assert builder._derive_dominant_sentiment(1.0) == Sentiment.POSITIVE.value

    def test_negative_when_fa_below_negative_threshold(self):
        """Fa < -0.3 时应返回 negative"""
        builder = EventNarrativeBuilder()
        assert builder._derive_dominant_sentiment(-0.31) == Sentiment.NEGATIVE.value
        assert builder._derive_dominant_sentiment(-0.5) == Sentiment.NEGATIVE.value
        assert builder._derive_dominant_sentiment(-1.0) == Sentiment.NEGATIVE.value

    def test_neutral_when_fa_within_threshold(self):
        """-0.3 <= Fa <= 0.3 时应返回 neutral"""
        builder = EventNarrativeBuilder()
        assert builder._derive_dominant_sentiment(0.0) == Sentiment.NEUTRAL.value
        assert builder._derive_dominant_sentiment(0.3) == Sentiment.NEUTRAL.value
        assert builder._derive_dominant_sentiment(-0.3) == Sentiment.NEUTRAL.value
        assert builder._derive_dominant_sentiment(0.15) == Sentiment.NEUTRAL.value
        assert builder._derive_dominant_sentiment(-0.15) == Sentiment.NEUTRAL.value

    def test_boundary_values(self):
        """测试边界值"""
        builder = EventNarrativeBuilder()
        assert builder._derive_dominant_sentiment(0.3000001) == Sentiment.POSITIVE.value
        assert builder._derive_dominant_sentiment(-0.3000001) == Sentiment.NEGATIVE.value


class TestClassifyTemporalPattern:
    """测试时间模式分类"""

    def create_event_chain(self, events_data, relations_data=None):
        """辅助函数：创建事件链"""
        base_time = datetime(2026, 3, 1)
        events = []
        for i, data in enumerate(events_data):
            events.append(Event(
                id=f"e{i}",
                event_type=data.get("type", "测试事件"),
                description=data.get("desc", ""),
                sentiment=data.get("sentiment", "neutral"),
                intensity=data.get("intensity", 0.0),
                publish_time=base_time + timedelta(days=data.get("day", i))
            ))

        relations = []
        if relations_data:
            for r in relations_data:
                relations.append(EventRelation(
                    event_a_id=r.get("a", ""),
                    event_b_id=r.get("b", ""),
                    relation=r.get("relation", "Vague"),
                    confidence=r.get("confidence", 0.8)
                ))

        return EventChain(
            symbol="000001",
            window_start=base_time,
            window_end=base_time + timedelta(days=30),
            events=events,
            relations=relations,
            features=ChainFeatures(
                net_expectation=0.0,
                dominant_sentiment="neutral",
                logical_consistency=0.8,
                sentiment_volatility=0.2
            )
        )

    def test_cumulative_positive_pattern(self):
        """测试同向正向累积模式"""
        builder = EventNarrativeBuilder()
        chain = self.create_event_chain([
            {"type": "预增", "sentiment": "positive", "intensity": 0.5, "day": 1},
            {"type": "增持", "sentiment": "positive", "intensity": 0.4, "day": 5},
            {"type": "回购", "sentiment": "positive", "intensity": 0.6, "day": 10},
        ])
        pattern = builder._classify_temporal_pattern(chain)
        assert pattern == TemporalPattern.CUMULATIVE

    def test_cumulative_negative_pattern(self):
        """测试同向负向累积模式"""
        builder = EventNarrativeBuilder()
        chain = self.create_event_chain([
            {"type": "预减", "sentiment": "negative", "intensity": -0.5, "day": 1},
            {"type": "减持", "sentiment": "negative", "intensity": -0.4, "day": 5},
            {"type": "诉讼", "sentiment": "negative", "intensity": -0.6, "day": 10},
        ])
        pattern = builder._classify_temporal_pattern(chain)
        assert pattern == TemporalPattern.CUMULATIVE

    def test_reversal_pattern_with_relation(self):
        """测试反转模式（有明确关系）"""
        builder = EventNarrativeBuilder()
        chain = self.create_event_chain(
            [
                {"type": "预减", "sentiment": "negative", "intensity": -0.5, "day": 1},
                {"type": "预增", "sentiment": "positive", "intensity": 0.6, "day": 10},
            ],
            [{"a": "e0", "b": "e1", "relation": "Before"}]
        )
        pattern = builder._classify_temporal_pattern(chain)
        assert pattern == TemporalPattern.REVERSAL

    def test_reversal_pattern_by_time(self):
        """测试反转模式（按时间推断）"""
        builder = EventNarrativeBuilder()
        chain = self.create_event_chain([
            {"type": "预减", "sentiment": "negative", "intensity": -0.5, "day": 1},
            {"type": "预增", "sentiment": "positive", "intensity": 0.6, "day": 20},
        ])
        pattern = builder._classify_temporal_pattern(chain)
        assert pattern == TemporalPattern.REVERSAL

    def test_conflict_pattern(self):
        """测试博弈模式（正负交替）"""
        builder = EventNarrativeBuilder()
        chain = self.create_event_chain([
            {"type": "预增", "sentiment": "positive", "intensity": 0.5, "day": 1},
            {"type": "减持", "sentiment": "negative", "intensity": -0.4, "day": 5},
            {"type": "预增", "sentiment": "positive", "intensity": 0.6, "day": 10},
        ])
        pattern = builder._classify_temporal_pattern(chain)
        assert pattern == TemporalPattern.CONFLICT

    def test_empty_events(self):
        """测试空事件列表"""
        builder = EventNarrativeBuilder()
        chain = self.create_event_chain([])
        pattern = builder._classify_temporal_pattern(chain)
        assert pattern == TemporalPattern.COMPLEX


class TestDescribeEventSequence:
    """测试事件序列描述生成"""

    def test_single_event(self):
        """测试单个事件描述"""
        builder = EventNarrativeBuilder()
        events = [
            Event(
                id="e1",
                event_type="预增",
                description="业绩预增80%",
                sentiment="positive",
                intensity=0.45,
                publish_time=datetime(2026, 3, 15)
            )
        ]
        desc = builder._describe_event_sequence(events)
        assert "预增" in desc
        assert "03.15" in desc
        assert "+0.45" in desc

    def test_multiple_events_sorted(self):
        """测试多个事件按时间排序"""
        builder = EventNarrativeBuilder()
        events = [
            Event(
                id="e2",
                event_type="减持",
                description="高管减持",
                sentiment="negative",
                intensity=-0.30,
                publish_time=datetime(2026, 3, 18)
            ),
            Event(
                id="e1",
                event_type="预增",
                description="业绩预增",
                sentiment="positive",
                intensity=0.45,
                publish_time=datetime(2026, 3, 15)
            ),
        ]
        desc = builder._describe_event_sequence(events)
        # 应该按时间排序：预增在前，减持在后
        yuzeng_pos = desc.find("预增")
        jianchi_pos = desc.find("减持")
        assert yuzeng_pos < jianchi_pos

    def test_merged_event(self):
        """测试合并事件描述"""
        builder = EventNarrativeBuilder()
        events = [
            Event(
                id="e1",
                event_type="预增",
                description="多起预增事件",
                sentiment="positive",
                intensity=0.50,
                publish_time=datetime(2026, 3, 15),
                is_merged=True,
                merged_count=3
            )
        ]
        desc = builder._describe_event_sequence(events)
        assert "多起预增事件" in desc
        assert "共3起" in desc

    def test_empty_events(self):
        """测试空事件列表"""
        builder = EventNarrativeBuilder()
        desc = builder._describe_event_sequence([])
        assert desc == "无事件"


class TestBuildNarrative:
    """测试叙事摘要构建"""

    def test_narrative_format(self):
        """测试叙事摘要格式符合预期"""
        builder = EventNarrativeBuilder()
        base_time = datetime(2026, 3, 1)

        chain = EventChain(
            symbol="000001",
            window_start=base_time,
            window_end=base_time + timedelta(days=30),
            events=[
                Event(
                    id="e1",
                    event_type="预增",
                    description="业绩预增",
                    sentiment="positive",
                    intensity=0.45,
                    publish_time=datetime(2026, 3, 15)
                ),
                Event(
                    id="e2",
                    event_type="减持",
                    description="高管减持",
                    sentiment="negative",
                    intensity=-0.30,
                    publish_time=datetime(2026, 3, 18)
                ),
            ],
            relations=[],
            features=ChainFeatures(
                net_expectation=0.15,
                dominant_sentiment="",  # 将被推导
                logical_consistency=0.75,
                sentiment_volatility=0.2
            )
        )

        summary = builder.build_narrative(chain)

        # 验证格式
        assert "【事件链摘要】" in summary.text
        assert "股票000001" in summary.text
        assert "近30天呈现" in summary.text
        assert "净预期强度+0.15" in summary.text
        assert "主导情绪" in summary.text
        assert "逻辑一致性75%" in summary.text

    def test_dominant_sentiment_consistency(self):
        """测试主导情绪与Fa值同向"""
        builder = EventNarrativeBuilder()
        base_time = datetime(2026, 3, 1)

        test_cases = [
            (0.5, "positive"),
            (-0.5, "negative"),
            (0.0, "neutral"),
        ]

        for fa, expected_sentiment in test_cases:
            chain = EventChain(
                symbol="000001",
                window_start=base_time,
                window_end=base_time + timedelta(days=30),
                events=[],
                relations=[],
                features=ChainFeatures(
                    net_expectation=fa,
                    dominant_sentiment="",  # 将被推导
                    logical_consistency=0.8,
                    sentiment_volatility=0.2
                )
            )

            summary = builder.build_narrative(chain)
            assert summary.dominant_sentiment == expected_sentiment
            assert summary.net_expectation == fa

    def test_narrative_summary_object(self):
        """测试返回的NarrativeSummary对象"""
        builder = EventNarrativeBuilder()
        base_time = datetime(2026, 3, 1)

        chain = EventChain(
            symbol="000001",
            window_start=base_time,
            window_end=base_time + timedelta(days=30),
            events=[
                Event(
                    id="e1",
                    event_type="预增",
                    description="业绩预增",
                    sentiment="positive",
                    intensity=0.45,
                    publish_time=datetime(2026, 3, 15)
                ),
            ],
            relations=[],
            features=ChainFeatures(
                net_expectation=0.45,
                dominant_sentiment="",
                logical_consistency=0.80,
                sentiment_volatility=0.1
            )
        )

        summary = builder.build_narrative(chain)

        assert summary.symbol == "000001"
        assert summary.net_expectation == 0.45
        assert summary.dominant_sentiment == "positive"
        assert summary.logical_consistency == 0.80
        assert summary.event_count == 1


class TestBuildNarrativeSummaryConvenience:
    """测试便捷函数 build_narrative_summary"""

    def test_convenience_function(self):
        """测试便捷函数正常工作"""
        events = [
            {"id": "e1", "event_type": "预增", "sentiment": "positive",
             "intensity": 0.45, "publish_time": datetime(2026, 3, 15)},
            {"id": "e2", "event_type": "减持", "sentiment": "negative",
             "intensity": -0.30, "publish_time": datetime(2026, 3, 18)},
        ]

        summary_text = build_narrative_summary(
            symbol="000001",
            events=events,
            relations=[],
            net_expectation=0.15,
            logical_consistency=0.75
        )

        assert "【事件链摘要】" in summary_text
        assert "股票000001" in summary_text
        assert "预增" in summary_text
        assert "减持" in summary_text


class TestEventTypeSimplification:
    """测试事件类型名称简化"""

    def test_common_type_mapping(self):
        """测试常见事件类型映射"""
        builder = EventNarrativeBuilder()

        test_cases = [
            ("业绩预增", "预增"),
            ("业绩预减", "预减"),
            ("高管增持", "增持"),
            ("高管减持", "减持"),
            ("股份回购", "回购"),
            ("现金分红", "分红"),
            ("重大合同", "合同"),
            ("法律诉讼", "诉讼"),
        ]

        for original, expected in test_cases:
            result = builder._simplify_event_type(original)
            assert result == expected, f"Failed for {original}: got {result}, expected {expected}"

    def test_long_type_truncation(self):
        """测试长类型名称截断"""
        builder = EventNarrativeBuilder()
        long_type = "这是一个非常长的事件类型名称"
        result = builder._simplify_event_type(long_type)
        assert len(result) <= 4


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
