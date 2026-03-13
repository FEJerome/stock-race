"""
窗口特征聚合 - 事件窗口特征计算

Phase 1.4 事件舆情数据层 - 包4核心实现
功能：
1. EMA加权平均计算
2. 窗口特征聚合（净预期值、主导情绪、逻辑一致性）

参考文档：
- docs/research/B-1.4.9-window-management.md
- docs/modules/local/ARCHITECTURE.md §3.4
"""

from typing import List
from datetime import datetime

from models.event import Event, WindowFeatures, EventSentiment


def ema_weighted_average(values: List[float], alpha: float = 0.9) -> float:
    """
    指数加权移动平均（EMA）

    公式：EMA_t = alpha * value_t + (1 - alpha) * EMA_{t-1}

    参数说明：
    - alpha: 平滑因子，范围 (0, 1)
    - alpha = 0.9 对应约20日半衰期（建议从0.9开始实验）
    - alpha越大，对新数据越敏感

    Args:
        values: 数值列表（时间顺序：旧 -> 新）
        alpha: 平滑因子（默认0.9）

    Returns:
        EMA值

    Example:
        >>> values = [0.1, 0.2, 0.3, 0.4, 0.5]
        >>> ema_weighted_average(values, alpha=0.9)
        0.4459...
    """
    if not values:
        return 0.0

    if len(values) == 1:
        return values[0]

    # 确保alpha在有效范围
    alpha = max(0.0, min(1.0, alpha))

    # 初始化EMA为第一个值
    ema = values[0]

    # 迭代计算EMA
    for value in values[1:]:
        ema = alpha * value + (1 - alpha) * ema

    return ema


def calculate_sentiment_score(event: Event) -> float:
    """
    计算单个事件的情绪得分

    规则：
    - positive: +intensity
    - negative: -intensity
    - neutral: 0

    Args:
        event: 事件对象

    Returns:
        情绪得分 [-1, 1]
    """
    intensity = event.intensity or 0.0

    if event.sentiment == EventSentiment.POSITIVE:
        return intensity
    elif event.sentiment == EventSentiment.NEGATIVE:
        return -intensity
    else:  # neutral
        return 0.0


def calculate_logical_consistency(events: List[Event]) -> float:
    """
    计算事件的逻辑一致性得分

    逻辑一致性衡量事件间是否存在矛盾：
    - 同一股票的事件应该有一致的看多/看空倾向
    - 如果同时存在强看多和强看空事件，一致性降低

    计算方法：
    1. 计算所有事件的平均情绪得分
    2. 计算每个事件与平均值的偏离度
    3. 一致性 = 1 - 归一化标准差

    Args:
        events: 事件列表

    Returns:
        逻辑一致性得分 [0, 1]，1表示完全一致
    """
    if not events:
        return 0.0

    if len(events) == 1:
        return 1.0  # 单个事件默认一致

    # 计算情绪得分列表
    sentiment_scores = [calculate_sentiment_score(e) for e in events]

    # 计算平均值
    mean_score = sum(sentiment_scores) / len(sentiment_scores)

    # 计算方差
    variance = sum((s - mean_score) ** 2 for s in sentiment_scores) / len(sentiment_scores)
    std_dev = variance ** 0.5

    # 将标准差映射到一致性得分
    # 最大可能标准差约为1（当得分从-1到+1分布时）
    # 因此一致性 = 1 - std_dev（归一化）
    consistency = max(0.0, 1.0 - std_dev)

    return consistency


def calculate_window_features(
    events: List[Event],
    alpha: float = 0.9
) -> WindowFeatures:
    """
    计算窗口特征

    根据窗口内的事件列表，计算聚合特征：
    - net_expectation: 净预期值（基于事件强度加权）
    - dominant_sentiment: 主导情绪（bullish/bearish/neutral）
    - sentiment_score: 情绪得分 [-1, 1]
    - logical_consistency: 逻辑一致性 [0, 1]

    算法说明：
    1. 净预期值使用EMA加权，更近的事件权重更高
    2. 主导情绪基于看多/看空事件的数量和强度
    3. 情绪得分是加权平均的情绪值
    4. 逻辑一致性衡量事件间是否存在矛盾

    Args:
        events: 窗口内的事件列表（按时间升序排列）
        alpha: EMA平滑因子（默认0.9）

    Returns:
        WindowFeatures对象

    Example:
        >>> events = [event1, event2, event3]  # 按时间排序
        >>> features = calculate_window_features(events, alpha=0.9)
        >>> print(features.dominant_sentiment)
        'bullish'
    """
    if not events:
        return WindowFeatures(
            net_expectation=0.0,
            dominant_sentiment="neutral",
            sentiment_score=0.0,
            logical_consistency=0.0,
            event_count=0
        )

    # 按时间排序（旧 -> 新）
    sorted_events = sorted(events, key=lambda e: e.timestamp)

    # 计算每个事件的情绪得分
    sentiment_scores = [calculate_sentiment_score(e) for e in sorted_events]

    # 计算净预期值（EMA加权）
    net_expectation = ema_weighted_average(sentiment_scores, alpha)

    # 计算平均事件强度
    intensities = [e.intensity or 0.0 for e in sorted_events]
    avg_intensity = sum(intensities) / len(intensities)

    # 统计各情绪类型事件数
    bullish_count = sum(1 for e in sorted_events if e.sentiment == EventSentiment.POSITIVE)
    bearish_count = sum(1 for e in sorted_events if e.sentiment == EventSentiment.NEGATIVE)
    neutral_count = sum(1 for e in sorted_events if e.sentiment == EventSentiment.NEUTRAL)

    # 计算主导情绪
    # 策略：基于加权情绪得分判断
    if net_expectation > 0.1:
        dominant_sentiment = "bullish"
    elif net_expectation < -0.1:
        dominant_sentiment = "bearish"
    else:
        dominant_sentiment = "neutral"

    # 情绪得分（净预期值的归一化版本）
    sentiment_score = max(-1.0, min(1.0, net_expectation))

    # 计算逻辑一致性
    logical_consistency = calculate_logical_consistency(sorted_events)

    return WindowFeatures(
        net_expectation=net_expectation,
        dominant_sentiment=dominant_sentiment,
        sentiment_score=sentiment_score,
        logical_consistency=logical_consistency,
        event_count=len(events),
        bullish_count=bullish_count,
        bearish_count=bearish_count,
        neutral_count=neutral_count,
        avg_intensity=avg_intensity
    )


def calculate_multi_window_features(
    events: List[Event],
    windows: List[int] = [7, 15, 30]
) -> dict:
    """
    计算多窗口特征

    计算不同时间窗口（如7天、15天、30天）的特征，
    用于多尺度分析。

    Args:
        events: 事件列表
        windows: 窗口天数列表（默认[7, 15, 30]）

    Returns:
        字典，键为窗口天数，值为WindowFeatures
    """
    from datetime import timedelta

    now = datetime.utcnow()
    result = {}

    for window_days in windows:
        cutoff = now - timedelta(days=window_days)
        window_events = [e for e in events if e.timestamp >= cutoff]

        # 为不同窗口调整alpha（短窗口用更大的alpha更敏感）
        adjusted_alpha = 0.9 if window_days >= 30 else 0.95

        features = calculate_window_features(window_events, adjusted_alpha)
        result[f"{window_days}d"] = features

    return result
