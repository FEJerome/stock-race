"""
事件分析模块

基于学术论文的事件舆情系统增强实现：
1. 事件强度计算 (intensity_calculator.py) - 使用LLM预测涨跌概率
2. 布尔问答时序判断 (temporal_analyzer.py) - 将4分类转为2个二分类
3. 叙事摘要生成 (narrative_builder.py) - 结构化压缩替代原始JSON

核心数据模型：
- Event: 单个事件
- EventChain: 事件链（30天窗口内的事件集合）
- EventRelation: 事件间时序关系
- ChainFeatures: 事件链特征（Fa值、主导情绪、一致性等）
- NarrativeSummary: 叙事摘要结果
"""

# 从 temporal_analyzer 导入基础数据模型（事件、强度、关系）
from .temporal_analyzer import (
    BooleanTemporalAnalyzer,
    TemporalPatternClassifier,
    Event,
    EventIntensity,
    EventRelation,
)

try:
    from .intensity_calculator import EventIntensityCalculator
except ImportError:
    EventIntensityCalculator = None

try:
    from .narrative_builder import (
        EventNarrativeBuilder,
        EventChain,
        ChainFeatures,
        NarrativeSummary,
        TemporalPattern,
        Sentiment,
        build_narrative_summary,
    )
except ImportError:
    EventNarrativeBuilder = None
    EventChain = None
    ChainFeatures = None
    NarrativeSummary = None
    TemporalPattern = None
    Sentiment = None
    build_narrative_summary = None

try:
    from .window_manager import EventWindowManager, get_window_manager, WindowConfig
except ImportError:
    EventWindowManager = None
    get_window_manager = None
    WindowConfig = None

__all__ = [
    # 时序分析
    'BooleanTemporalAnalyzer',
    'TemporalPatternClassifier',
    # 基础数据模型
    'Event',
    'EventIntensity',
    'EventRelation',
    # 强度计算
    'EventIntensityCalculator',
    # 叙事生成
    'EventNarrativeBuilder',
    'EventChain',
    'ChainFeatures',
    'NarrativeSummary',
    'TemporalPattern',
    'Sentiment',
    'build_narrative_summary',
    # 窗口管理
    'EventWindowManager',
    'get_window_manager',
    'WindowConfig',
]
