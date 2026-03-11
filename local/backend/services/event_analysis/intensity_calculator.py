"""
事件强度计算模块

基于学术论文的事件强度计算方法，使用LLM预测涨跌概率替代主观规则映射。

关键设计决策:
1. 【修正1】论文中的Fa公式用于最终股票涨跌预测（3.2节），不是单个事件强度。
   单个事件用简单概率差 S = P_up - P_down，Fa只在事件链聚合后计算。

2. 【修正3】Prompt使用强制选项格式（A/B/C/D/E）替代JSON，避免解析脆弱性。

3. 健壮性解析：使用正则提取选项字母，支持多种回答格式。

4. 回退机制：关键词匹配兜底，确保系统稳定性。
"""

import re
import math
from dataclasses import dataclass
from typing import List, Optional, Tuple
from datetime import datetime

from services.ai_adapter.base import AIAdapter


@dataclass
class EventIntensity:
    """事件强度数据模型

    Attributes:
        strength: 事件强度，S = P_up - P_down，范围-0.75~+0.75
        p_up: 上涨概率
        p_down: 下跌概率
        source: 数据来源，如'llm_option'或'fallback'
        timestamp: 计算时间戳
    """
    strength: float
    p_up: float
    p_down: float
    source: str = 'llm_option'
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()


@dataclass
class Event:
    """事件数据模型（简化版，用于强度计算）"""
    id: str
    symbol: str
    event_type: str
    description: str
    publish_time: datetime
    intensity: Optional[EventIntensity] = None


class EventIntensityCalculator:
    """事件强度计算器

    使用LLM预测涨跌概率，客观量化事件对股价的潜在影响。

    核心方法:
        calculate_single_event: 计算单个事件强度
        calculate_chain_fa: 计算事件链聚合后的Fa值

    示例:
        >>> calculator = EventIntensityCalculator()
        >>> event = Event(id="1", symbol="000001", event_type="预增",
        ...               description="净利润预增80%", publish_time=datetime.now())
        >>> intensity = await calculator.calculate_single_event(event, ai_adapter)
        >>> print(f"强度: {intensity.strength:+.2f}, P_up: {intensity.p_up}")
    """

    # 【修正3】Prompt改为强制选项格式，避免JSON解析脆弱性
    INTENSITY_PROMPT = """分析以下财经事件对股价的潜在影响：

事件描述: {event_description}
股票: {symbol}

请判断该事件对股价的影响方向：
A. 强烈上涨(>5%)  B. 温和上涨(2-5%)  C. 横盘(-2~2%)  D. 温和下跌(-5~-2%)  E. 强烈下跌(<-5%)

请仅回答选项字母(A/B/C/D/E)："""

    # 选项到概率的映射
    # A=(0.85,0.10): 强烈上涨 - 高上涨概率，低下跌概率
    # B=(0.65,0.20): 温和上涨 - 中上涨概率，较低下跌概率
    # C=(0.45,0.45): 横盘 - 涨跌概率接近，方向不确定
    # D=(0.20,0.65): 温和下跌 - 较低上涨概率，中下跌概率
    # E=(0.10,0.85): 强烈下跌 - 低上涨概率，高下跌概率
    OPTION_PROBABILITY: dict[str, Tuple[float, float]] = {
        'A': (0.85, 0.10),  # 强烈上涨: P_up=0.85, P_down=0.10
        'B': (0.65, 0.20),  # 温和上涨: P_up=0.65, P_down=0.20
        'C': (0.45, 0.45),  # 横盘: P_up=0.45, P_down=0.45
        'D': (0.20, 0.65),  # 温和下跌: P_up=0.20, P_down=0.65
        'E': (0.10, 0.85),  # 强烈下跌: P_up=0.10, P_down=0.85
    }

    def __init__(self, temperature: float = 0.1):
        """初始化强度计算器

        Args:
            temperature: LLM温度参数，默认0.1保证输出稳定性
        """
        self.temperature = temperature

    async def calculate_single_event(
        self,
        event: Event,
        llm_adapter: AIAdapter
    ) -> EventIntensity:
        """计算单个事件强度

        通过LLM预测涨跌概率，计算事件强度 S = P_up - P_down。
        强度范围: -0.75 ~ +0.75

        Args:
            event: 事件对象
            llm_adapter: AI适配器，用于调用LLM

        Returns:
            EventIntensity: 事件强度数据

        Raises:
            ValueError: 当event或llm_adapter为None时
        """
        if event is None:
            raise ValueError("Event cannot be None")
        if llm_adapter is None:
            raise ValueError("LLM adapter cannot be None")

        # 构建Prompt
        prompt = self.INTENSITY_PROMPT.format(
            event_description=event.description,
            symbol=event.symbol
        )

        # 调用LLM获取响应
        # 注意：这里假设AIAdapter有complete方法或类似接口
        # 实际使用时需要根据具体的adapter接口调整
        try:
            response = await self._call_llm(llm_adapter, prompt)
        except Exception as e:
            # LLM调用失败时，使用回退机制
            return self._fallback_intensity(event, f"LLM调用失败: {e}")

        # 解析选项
        option = self._parse_option_robust(response)
        p_up, p_down = self.OPTION_PROBABILITY.get(option, (0.5, 0.5))

        # 单个事件强度 = 简单差值
        strength = p_up - p_down  # 范围-0.75~+0.75

        return EventIntensity(
            strength=strength,
            p_up=p_up,
            p_down=p_down,
            source='llm_option'
        )

    def calculate_chain_fa(self, events: List[EventIntensity]) -> float:
        """计算事件链聚合后的Fa值

        【修正1】Fa值只在事件链聚合后计算，不用于单个事件。

        论文公式应用于聚合后的综合预测概率：
        - 聚合P_up: 考虑时序关系的加权平均
        - 聚合P_down: 考虑时序关系的加权平均
        - Fa = logit(P_up_agg) - logit(P_down_agg)

        TODO(Local版本当前简化): 仅使用指数加权平均，未利用时序关系(Before/After)
        调整概率。论文中是通过拼接三元组到BERT实现的，如"先利空后利好"的反转
        应提高P_up。Full版本需引入时序关系权重调整。

        Args:
            events: 事件强度列表

        Returns:
            float: Fa值，范围-5~+5

        Raises:
            ValueError: 当events为None时
        """
        if events is None:
            raise ValueError("Events list cannot be None")

        if not events:
            return 0.0

        # 指数加权平均 (λ=0.05，对应30天半衰期约14天)
        lambda_decay = 0.05
        weights = [math.exp(-lambda_decay * i) for i in range(len(events))]
        total_weight = sum(weights)

        agg_p_up = sum(e.p_up * w for e, w in zip(events, weights)) / total_weight
        agg_p_down = sum(e.p_down * w for e, w in zip(events, weights)) / total_weight

        # 应用论文Fa公式
        return self._fa_formula(agg_p_up, agg_p_down)

    def _fa_formula(self, p_up: float, p_down: float) -> float:
        """论文3.2节Fa公式

        Fa = logit(P_up) - logit(P_down)
           = log(P_up/(1-P_up)) - log(P_down/(1-P_down))

        该公式将概率转换为log-odds空间，放大概率差异。

        Args:
            p_up: 聚合上涨概率
            p_down: 聚合下跌概率

        Returns:
            float: Fa值，裁剪到-5~+5范围
        """
        # 避免极端值导致数值溢出
        p_up = max(0.01, min(0.99, p_up))
        p_down = max(0.01, min(0.99, p_down))

        # 计算logit
        logit_up = math.log(p_up / (1 - p_up))
        logit_down = math.log(p_down / (1 - p_down))

        fa = logit_up - logit_down

        # 裁剪到合理范围，防止极端值
        return max(-5.0, min(5.0, fa))

    def _parse_option_robust(self, response: str) -> str:
        """健壮性选项解析

        处理LLM可能返回的各种格式：
        - "A" (标准格式)
        - "A. 强烈上涨" (带描述)
        - "答案是A" (带中文前缀)
        - "我选择选项A" (复杂句式)
        - "A、B、C..." (带中文标点)

        使用正则提取第一个[A-E]字母，如果失败则使用关键词匹配回退。

        Args:
            response: LLM原始响应字符串

        Returns:
            str: 选项字母A-E，解析失败返回'C'(默认横盘)
        """
        if not response:
            return 'C'  # 默认横盘

        # 清理响应文本
        cleaned = response.strip()

        # 提取第一个A-E字母（不区分大小写）
        match = re.search(r'[A-E]', cleaned.upper())
        if match:
            return match.group(0)

        # 回退：关键词匹配
        return self._keyword_fallback(response)

    def _keyword_fallback(self, response: str) -> str:
        """关键词匹配回退机制

        当正则提取失败时，使用关键词匹配推断选项。

        匹配规则:
            - 包含"强"和"涨" → A (强烈上涨)
            - 包含"温和"和"涨" → B (温和上涨)
            - 包含"横盘"或"震荡" → C (横盘)
            - 包含"温和"和"跌" → D (温和下跌)
            - 包含"强"和"跌" → E (强烈下跌)

        Args:
            response: LLM原始响应字符串

        Returns:
            str: 推断的选项字母，无法推断返回'C'
        """
        if not response:
            return 'C'

        lower = response.lower()

        # 强烈上涨
        if ('强' in lower or '大幅' in lower or '剧烈' in lower) and \
           ('涨' in lower or '升' in lower or '上' in lower):
            return 'A'

        # 温和上涨
        if ('温和' in lower or '小幅' in lower or '略微' in lower) and \
           ('涨' in lower or '升' in lower or '上' in lower):
            return 'B'

        # 横盘
        if '横盘' in lower or '震荡' in lower or '盘整' in lower or \
           '平稳' in lower or '中性' in lower:
            return 'C'

        # 温和下跌
        if ('温和' in lower or '小幅' in lower or '略微' in lower) and \
           ('跌' in lower or '降' in lower or '下' in lower or '跌' in lower):
            return 'D'

        # 强烈下跌
        if ('强' in lower or '大幅' in lower or '剧烈' in lower) and \
           ('跌' in lower or '降' in lower or '下' in lower or '跌' in lower):
            return 'E'

        # 默认横盘
        return 'C'

    async def _call_llm(self, llm_adapter: AIAdapter, prompt: str) -> str:
        """调用LLM获取响应

        TODO: 当前为占位实现，需要根据实际的AIAdapter接口调整。
        可能需要添加complete/chat等方法到基类或检查具体实现。

        Args:
            llm_adapter: AI适配器
            prompt: 提示词

        Returns:
            str: LLM响应文本

        Raises:
            NotImplementedError: 如果适配器不支持直接文本完成
        """
        # 检查适配器是否有complete方法
        if hasattr(llm_adapter, 'complete'):
            return await llm_adapter.complete(prompt, temperature=self.temperature)

        # 检查适配器是否有chat方法
        if hasattr(llm_adapter, 'chat'):
            messages = [{"role": "user", "content": prompt}]
            return await llm_adapter.chat(messages, temperature=self.temperature)

        # 如果没有直接方法，抛出异常
        raise NotImplementedError(
            f"AIAdapter {type(llm_adapter).__name__} does not support "
            "direct text completion. Please implement complete() or chat() method."
        )

    def _fallback_intensity(
        self,
        event: Event,
        reason: str = "Unknown"
    ) -> EventIntensity:
        """生成回退事件强度

        当LLM调用失败时，返回中性强度作为安全回退。

        Args:
            event: 事件对象
            reason: 回退原因

        Returns:
            EventIntensity: 中性强度(0, 0.5, 0.5)
        """
        return EventIntensity(
            strength=0.0,
            p_up=0.5,
            p_down=0.5,
            source=f'fallback:{reason}'
        )

    def batch_calculate(
        self,
        events: List[Event],
        llm_adapter: AIAdapter
    ) -> List[EventIntensity]:
        """批量计算事件强度

        为多个事件计算强度，保持调用顺序。

        Args:
            events: 事件列表
            llm_adapter: AI适配器

        Returns:
            List[EventIntensity]: 事件强度列表，与输入顺序一致
        """
        # TODO: 实现批量调用优化，如并行处理或批处理API
        # 当前简单实现为逐个调用
        results = []
        for event in events:
            try:
                intensity = self.calculate_single_event(event, llm_adapter)
                results.append(intensity)
            except Exception as e:
                # 单个事件失败不影响其他事件
                results.append(self._fallback_intensity(event, str(e)))
        return results
