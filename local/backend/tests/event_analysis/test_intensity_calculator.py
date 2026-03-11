"""
事件强度计算模块单元测试

测试覆盖:
- Fa公式计算正确性
- 选项解析健壮性
- 边界条件处理
"""

import pytest
import math
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from services.event_analysis.intensity_calculator import (
    EventIntensityCalculator,
    EventIntensity,
    Event
)


class TestFaFormula:
    """测试Fa公式计算"""

    def setup_method(self):
        self.calculator = EventIntensityCalculator()

    def test_fa_calculation_standard_case(self):
        """测试标准情况: P_up=0.7, P_down=0.3 -> Fa~1.69"""
        fa = self.calculator._fa_formula(0.7, 0.3)

        # Fa = log(0.7/0.3) - log(0.3/0.7) = log(2.333) - log(0.428) = 0.847 - (-0.847) = 1.694
        assert 1.65 < fa < 1.75, f"Expected Fa ~ 1.69, got {fa}"

    def test_fa_calculation_symmetric_case(self):
        """测试对称情况: P_up=0.5, P_down=0.5 -> Fa=0"""
        fa = self.calculator._fa_formula(0.5, 0.5)
        assert abs(fa) < 0.001, f"Expected Fa = 0, got {fa}"

    def test_fa_calculation_extreme_positive(self):
        """测试极端正向: P_up=0.99, P_down=0.01"""
        fa = self.calculator._fa_formula(0.99, 0.01)
        assert fa > 4.0, f"Expected large positive Fa, got {fa}"
        assert fa <= 5.0, f"Fa should be clipped to 5.0, got {fa}"

    def test_fa_calculation_extreme_negative(self):
        """测试极端负向: P_up=0.01, P_down=0.99"""
        fa = self.calculator._fa_formula(0.01, 0.99)
        assert fa < -4.0, f"Expected large negative Fa, got {fa}"
        assert fa >= -5.0, f"Fa should be clipped to -5.0, got {fa}"

    def test_fa_calculation_clipping(self):
        """测试Fa值裁剪到-5~+5范围"""
        # 极端值应该被裁剪
        fa_positive = self.calculator._fa_formula(0.999, 0.001)
        assert fa_positive == 5.0, f"Expected clipped to 5.0, got {fa_positive}"

        fa_negative = self.calculator._fa_formula(0.001, 0.999)
        assert fa_negative == -5.0, f"Expected clipped to -5.0, got {fa_negative}"

    def test_fa_calculation_known_values(self):
        """测试已知值对应关系"""
        test_cases = [
            # (p_up, p_down, expected_sign, description)
            (0.85, 0.10, 1, "Option A: strong up"),
            (0.65, 0.20, 1, "Option B: mild up"),
            (0.45, 0.45, 0, "Option C: neutral"),
            (0.20, 0.65, -1, "Option D: mild down"),
            (0.10, 0.85, -1, "Option E: strong down"),
        ]

        for p_up, p_down, expected_sign, desc in test_cases:
            fa = self.calculator._fa_formula(p_up, p_down)
            if expected_sign > 0:
                assert fa > 0, f"{desc}: Expected positive Fa, got {fa}"
            elif expected_sign < 0:
                assert fa < 0, f"{desc}: Expected negative Fa, got {fa}"
            else:
                assert abs(fa) < 0.1, f"{desc}: Expected near-zero Fa, got {fa}"


class TestOptionParsing:
    """测试选项解析健壮性"""

    def setup_method(self):
        self.calculator = EventIntensityCalculator()

    def test_parse_standard_option(self):
        """测试标准格式: A/B/C/D/E"""
        assert self.calculator._parse_option_robust("A") == "A"
        assert self.calculator._parse_option_robust("B") == "B"
        assert self.calculator._parse_option_robust("C") == "C"
        assert self.calculator._parse_option_robust("D") == "D"
        assert self.calculator._parse_option_robust("E") == "E"

    def test_parse_with_description(self):
        """测试带描述的格式: A.强烈上涨"""
        assert self.calculator._parse_option_robust("A.强烈上涨") == "A"
        assert self.calculator._parse_option_robust("B. 温和上涨") == "B"
        assert self.calculator._parse_option_robust("C.横盘震荡") == "C"

    def test_parse_with_chinese_prefix(self):
        """测试带中文前缀"""
        assert self.calculator._parse_option_robust("答案是A") == "A"
        assert self.calculator._parse_option_robust("我选择B选项") == "B"
        assert self.calculator._parse_option_robust("正确答案是C") == "C"

    def test_parse_complex_sentence(self):
        """测试复杂句式"""
        assert self.calculator._parse_option_robust("我认为应该选择A") == "A"
        assert self.calculator._parse_option_robust("根据分析，答案是B") == "B"
        assert self.calculator._parse_option_robust("推荐选择：C") == "C"

    def test_parse_lowercase(self):
        """测试小写字母"""
        assert self.calculator._parse_option_robust("a") == "A"
        assert self.calculator._parse_option_robust("b") == "B"
        assert self.calculator._parse_option_robust("答案是c") == "C"

    def test_parse_empty_response(self):
        """测试空响应"""
        assert self.calculator._parse_option_robust("") == "C"
        assert self.calculator._parse_option_robust(None) == "C"

    def test_parse_keyword_fallback_up(self):
        """测试关键词回退 - 上涨"""
        assert self.calculator._parse_option_robust("强烈上涨") == "A"
        assert self.calculator._parse_option_robust("股价将大幅上涨") == "A"
        assert self.calculator._parse_option_robust("温和上涨") == "B"
        assert self.calculator._parse_option_robust("小幅上升") == "B"

    def test_parse_keyword_fallback_down(self):
        """测试关键词回退 - 下跌"""
        assert self.calculator._parse_option_robust("强烈下跌") == "E"
        assert self.calculator._parse_option_robust("股价将大幅下跌") == "E"
        assert self.calculator._parse_option_robust("温和下跌") == "D"
        assert self.calculator._parse_option_robust("小幅下降") == "D"

    def test_parse_keyword_fallback_neutral(self):
        """测试关键词回退 - 横盘"""
        assert self.calculator._parse_option_robust("横盘震荡") == "C"
        assert self.calculator._parse_option_robust("维持震荡盘整") == "C"
        assert self.calculator._parse_option_robust("走势平稳") == "C"


class TestChainFaCalculation:
    """测试事件链Fa计算"""

    def setup_method(self):
        self.calculator = EventIntensityCalculator()

    def test_empty_events(self):
        """测试空事件列表"""
        fa = self.calculator.calculate_chain_fa([])
        assert fa == 0.0

    def test_single_event(self):
        """测试单个事件"""
        events = [EventIntensity(strength=0.35, p_up=0.65, p_down=0.30)]
        fa = self.calculator.calculate_chain_fa(events)
        # 单个事件，加权平均后就是其本身
        expected_fa = self.calculator._fa_formula(0.65, 0.30)
        assert abs(fa - expected_fa) < 0.001

    def test_multiple_events_weighted(self):
        """测试多个事件的加权平均"""
        events = [
            EventIntensity(strength=0.35, p_up=0.65, p_down=0.30),  # 最近，权重高
            EventIntensity(strength=-0.45, p_up=0.20, p_down=0.65),  # 较旧，权重低
        ]
        fa = self.calculator.calculate_chain_fa(events)

        # 手动计算验证
        lambda_decay = 0.05
        weights = [1.0, math.exp(-lambda_decay)]  # [1.0, ~0.95]
        total_weight = sum(weights)

        agg_p_up = (0.65 * weights[0] + 0.20 * weights[1]) / total_weight
        agg_p_down = (0.30 * weights[0] + 0.65 * weights[1]) / total_weight
        expected_fa = self.calculator._fa_formula(agg_p_up, agg_p_down)

        assert abs(fa - expected_fa) < 0.001

    def test_chain_fa_range(self):
        """测试事件链Fa值范围"""
        events = [
            EventIntensity(strength=0.75, p_up=0.85, p_down=0.10),
            EventIntensity(strength=0.75, p_up=0.85, p_down=0.10),
            EventIntensity(strength=0.75, p_up=0.85, p_down=0.10),
        ]
        fa = self.calculator.calculate_chain_fa(events)
        assert -5.0 <= fa <= 5.0


class TestOptionProbabilityMapping:
    """测试选项概率映射"""

    def setup_method(self):
        self.calculator = EventIntensityCalculator()

    def test_option_a_mapping(self):
        """测试选项A概率映射"""
        p_up, p_down = self.calculator.OPTION_PROBABILITY['A']
        assert p_up == 0.85
        assert p_down == 0.10
        assert p_up - p_down == 0.75  # 最大强度

    def test_option_b_mapping(self):
        """测试选项B概率映射"""
        p_up, p_down = self.calculator.OPTION_PROBABILITY['B']
        assert p_up == 0.65
        assert p_down == 0.20
        assert p_up - p_down == 0.45

    def test_option_c_mapping(self):
        """测试选项C概率映射"""
        p_up, p_down = self.calculator.OPTION_PROBABILITY['C']
        assert p_up == 0.45
        assert p_down == 0.45
        assert p_up - p_down == 0.0  # 中性

    def test_option_d_mapping(self):
        """测试选项D概率映射"""
        p_up, p_down = self.calculator.OPTION_PROBABILITY['D']
        assert p_up == 0.20
        assert p_down == 0.65
        assert p_up - p_down == -0.45

    def test_option_e_mapping(self):
        """测试选项E概率映射"""
        p_up, p_down = self.calculator.OPTION_PROBABILITY['E']
        assert p_up == 0.10
        assert p_down == 0.85
        assert p_up - p_down == -0.75  # 最小强度


class TestEventIntensityDataclass:
    """测试EventIntensity数据类"""

    def test_default_timestamp(self):
        """测试默认时间戳"""
        before = datetime.utcnow()
        intensity = EventIntensity(strength=0.5, p_up=0.7, p_down=0.2)
        after = datetime.utcnow()

        assert before <= intensity.timestamp <= after

    def test_explicit_timestamp(self):
        """测试显式时间戳"""
        ts = datetime(2024, 1, 1, 12, 0, 0)
        intensity = EventIntensity(
            strength=0.5, p_up=0.7, p_down=0.2, timestamp=ts
        )
        assert intensity.timestamp == ts


class TestErrorHandling:
    """测试错误处理"""

    def setup_method(self):
        self.calculator = EventIntensityCalculator()

    def test_calculate_chain_fa_none_input(self):
        """测试None输入处理"""
        with pytest.raises(ValueError, match="Events list cannot be None"):
            self.calculator.calculate_chain_fa(None)

    @pytest.mark.asyncio
    async def test_calculate_single_event_none_event(self):
        """测试None事件处理"""
        mock_adapter = MagicMock()
        with pytest.raises(ValueError, match="Event cannot be None"):
            await self.calculator.calculate_single_event(None, mock_adapter)

    @pytest.mark.asyncio
    async def test_calculate_single_event_none_adapter(self):
        """测试None适配器处理"""
        event = Event(
            id="1",
            symbol="000001",
            event_type="test",
            description="test",
            publish_time=datetime.now()
        )
        with pytest.raises(ValueError, match="LLM adapter cannot be None"):
            await self.calculator.calculate_single_event(event, None)


class TestKeywordFallback:
    """测试关键词回退机制"""

    def setup_method(self):
        self.calculator = EventIntensityCalculator()

    def test_strong_up_variations(self):
        """测试强烈上涨的各种表述"""
        variations = [
            "预计股价将大幅上涨",
            "强烈看涨",
            "股价有望大幅攀升",
            "剧烈上涨预期",
        ]
        for text in variations:
            result = self.calculator._keyword_fallback(text)
            assert result == "A", f"Failed for: {text}"

    def test_mild_up_variations(self):
        """测试温和上涨的各种表述"""
        variations = [
            "预计小幅上涨",
            "温和看涨",
            "略微上升",
        ]
        for text in variations:
            result = self.calculator._keyword_fallback(text)
            assert result == "B", f"Failed for: {text}"

    def test_neutral_variations(self):
        """测试中性的各种表述"""
        variations = [
            "预计横盘震荡",
            "维持盘整",
            "走势平稳",
            "中性预期",
        ]
        for text in variations:
            result = self.calculator._keyword_fallback(text)
            assert result == "C", f"Failed for: {text}"

    def test_mild_down_variations(self):
        """测试温和下跌的各种表述"""
        variations = [
            "预计小幅下跌",
            "温和看跌",
            "略微下降",
        ]
        for text in variations:
            result = self.calculator._keyword_fallback(text)
            assert result == "D", f"Failed for: {text}"

    def test_strong_down_variations(self):
        """测试强烈下跌的各种表述"""
        variations = [
            "预计股价将大幅下跌",
            "强烈看跌",
            "股价可能剧烈下跌",
            "大幅下挫预期",
        ]
        for text in variations:
            result = self.calculator._keyword_fallback(text)
            assert result == "E", f"Failed for: {text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
