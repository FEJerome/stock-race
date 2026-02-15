"""
Dynamic High Frequency Scheduler - 动态高频层调度器

实现基于系统健康状态的动态高频层采集策略：
1. 根据可用数据源数量动态调整高频层股票数量
2. 根据健康状态调整采集间隔
3. 状态变化时自动触发调整

健康状态与股票数量映射：
- 4源健康: 200只, 10秒间隔
- 3源健康: 150只, 10秒间隔
- 2源健康: 100只, 10秒间隔
- 1源健康: 50只, 15秒间隔
- 0源健康: 0只, 暂停高频层
"""

import logging
from enum import Enum
from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


class HealthStatus(Enum):
    """系统健康状态枚举"""
    EXCELLENT = "excellent"   # 4源可用
    GOOD = "good"            # 3源可用
    NORMAL = "normal"        # 2源可用
    POOR = "poor"            # 1源可用
    CRITICAL = "critical"    # 0源可用


@dataclass
class HighFreqConfig:
    """高频层配置"""
    base_count: int = 100           # 基础股票数量
    max_count: int = 200            # 最大股票数量
    min_count: int = 50             # 最小股票数量
    base_interval: int = 10         # 基础采集间隔(秒)
    degraded_interval: int = 15     # 降级采集间隔(秒)
    pause_threshold: int = 0        # 暂停阈值(源数量)


@dataclass
class DynamicConfig:
    """动态配置结果"""
    stock_count: int
    interval: int
    status: HealthStatus
    healthy_sources: int


class DynamicHighFreqScheduler:
    """
    动态高频层调度器

    职责：
    1. 监控数据源健康状态
    2. 根据健康状态计算高频层股票数量
    3. 根据健康状态确定采集间隔
    4. 检测状态变化并触发调整
    """

    # 健康状态配置映射
    HEALTH_CONFIG_MAP = {
        HealthStatus.EXCELLENT: {"stock_count": 200, "interval": 10},
        HealthStatus.GOOD: {"stock_count": 150, "interval": 10},
        HealthStatus.NORMAL: {"stock_count": 100, "interval": 10},
        HealthStatus.POOR: {"stock_count": 50, "interval": 15},
        HealthStatus.CRITICAL: {"stock_count": 0, "interval": -1},
    }

    def __init__(self, config: Optional[HighFreqConfig] = None):
        """
        初始化动态高频层调度器

        Args:
            config: 高频层配置，使用默认配置如果未提供
        """
        self.config = config or HighFreqConfig()
        self._last_source_count: int = 4  # 上次健康源数量
        self._last_status: HealthStatus = HealthStatus.EXCELLENT
        self._adjustment_count: int = 0   # 调整次数统计

        logger.info("DynamicHighFreqScheduler initialized")

    def _get_healthy_source_count(self) -> int:
        """
        获取健康数据源数量

        Returns:
            健康数据源数量
        """
        # 这里应该从健康监控服务获取实际数量
        # 暂时返回模拟值，实际集成时需要替换
        return self._last_source_count

    def _get_health_status(self, source_count: int) -> HealthStatus:
        """
        根据可用源数量确定健康状态

        Args:
            source_count: 健康数据源数量

        Returns:
            健康状态枚举
        """
        if source_count >= 4:
            return HealthStatus.EXCELLENT
        elif source_count == 3:
            return HealthStatus.GOOD
        elif source_count == 2:
            return HealthStatus.NORMAL
        elif source_count == 1:
            return HealthStatus.POOR
        else:
            return HealthStatus.CRITICAL

    def get_high_freq_stock_count(self) -> int:
        """
        获取当前高频层股票数量

        根据系统健康状态动态计算

        Returns:
            高频层股票数量
        """
        source_count = self._get_healthy_source_count()
        status = self._get_health_status(source_count)
        config = self.HEALTH_CONFIG_MAP[status]

        return config["stock_count"]

    def get_high_freq_interval(self) -> int:
        """
        获取高频层采集间隔

        根据系统健康状态动态计算

        Returns:
            采集间隔（秒），-1表示暂停高频层
        """
        source_count = self._get_healthy_source_count()
        status = self._get_health_status(source_count)
        config = self.HEALTH_CONFIG_MAP[status]

        return config["interval"]

    def get_current_config(self) -> DynamicConfig:
        """
        获取当前动态配置

        Returns:
            包含股票数量、间隔、状态等的完整配置
        """
        source_count = self._get_healthy_source_count()
        status = self._get_health_status(source_count)
        config = self.HEALTH_CONFIG_MAP[status]

        return DynamicConfig(
            stock_count=config["stock_count"],
            interval=config["interval"],
            status=status,
            healthy_sources=source_count
        )

    def should_adjust_high_freq_layer(self) -> bool:
        """
        判断是否需要调整高频层

        检测健康源数量是否发生变化

        Returns:
            是否需要调整
        """
        current_count = self._get_healthy_source_count()
        return current_count != self._last_source_count

    def get_adjustment_needed(self) -> bool:
        """
        获取调整需求（同should_adjust，保持一致性）

        Returns:
            是否需要调整
        """
        return self.should_adjust_high_freq_layer()

    def record_adjustment(self):
        """
        记录调整操作

        更新上次状态并增加调整计数
        """
        current_count = self._get_healthy_source_count()
        if current_count != self._last_source_count:
            old_status = self._last_status
            new_status = self._get_health_status(current_count)

            self._last_source_count = current_count
            self._last_status = new_status
            self._adjustment_count += 1

            logger.info(f"High freq layer adjusted: {old_status.value} -> {new_status.value}, "
                       f"stock_count={self.HEALTH_CONFIG_MAP[new_status]['stock_count']}")

    def get_stats(self) -> Dict[str, Any]:
        """
        获取调度器统计信息

        Returns:
            统计信息字典
        """
        config = self.get_current_config()

        return {
            "current_stock_count": config.stock_count,
            "current_interval": config.interval,
            "health_status": config.status.value,
            "healthy_sources": config.healthy_sources,
            "last_source_count": self._last_source_count,
            "adjustment_count": self._adjustment_count,
            "config": {
                "base_count": self.config.base_count,
                "max_count": self.config.max_count,
                "min_count": self.config.min_count,
            }
        }

    def update_source_count(self, count: int):
        """
        更新健康源数量（供外部调用）

        Args:
            count: 当前健康数据源数量
        """
        self._last_source_count = max(0, count)

    def force_adjustment(self, source_count: int) -> DynamicConfig:
        """
        强制调整（用于测试或手动干预）

        Args:
            source_count: 指定的健康源数量

        Returns:
            调整后的配置
        """
        self.update_source_count(source_count)
        self.record_adjustment()
        return self.get_current_config()
