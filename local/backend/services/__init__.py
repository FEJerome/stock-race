"""
Services layer - 业务逻辑层

包含：
- EventWindowManager: 事件窗口管理器
- Window aggregation: 窗口特征聚合
"""

from .event_window_manager import EventWindowManager, WindowConfig
from .window_aggregation import (
    calculate_window_features,
    ema_weighted_average,
    calculate_logical_consistency,
    calculate_multi_window_features
)

__all__ = [
    "EventWindowManager",
    "WindowConfig",
    "calculate_window_features",
    "ema_weighted_average",
    "calculate_logical_consistency",
    "calculate_multi_window_features",
]
