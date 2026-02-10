"""
系统降级管理器

实现分层降级策略，当主数据源不可用时自动切换至备用源，
确保系统在各种故障情况下仍能维持核心功能。
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Any, Callable
from collections import deque

logger = logging.getLogger(__name__)


class DegradationLevel(Enum):
    """降级级别枚举"""
    NORMAL = 0      # 正常模式 - 使用新浪财经
    DEGRADED_L1 = 1 # 一级降级 - 腾讯+东方财富
    DEGRADED_L2 = 2 # 二级降级 - Baostock+AkShare
    DEGRADED_L3 = 3 # 三级降级 - Tushare
    CRITICAL = 4    # 极限降级 - 缓存+单股


@dataclass
class HealthStatus:
    """数据源健康状态"""
    source_name: str
    is_healthy: bool = True
    success_rate: float = 1.0
    avg_response_time: float = 0.0
    p95_response_time: float = 0.0
    error_count: int = 0
    last_check: datetime = field(default_factory=datetime.now)
    last_success: Optional[datetime] = None
    consecutive_failures: int = 0

    def update(self, success: bool, response_time: float):
        """更新健康状态"""
        self.last_check = datetime.now()

        if success:
            self.consecutive_failures = 0
            self.last_success = datetime.now()
        else:
            self.consecutive_failures += 1
            self.error_count += 1


@dataclass
class DegradationConfig:
    """降级配置"""
    enabled: bool = True
    auto_recovery: bool = True

    # 健康检查配置
    health_check_interval: int = 10  # 秒
    failure_threshold: int = 3       # 连续失败阈值
    response_time_threshold: float = 5.0  # 响应时间阈值(秒)

    # 恢复配置
    recovery_check_interval: int = 60   # 恢复检查间隔(秒)
    recovery_confirmation_samples: int = 3  # 恢复确认样本数

    # 各级别数据源配置
    level_sources: Dict[int, List[str]] = field(default_factory=lambda: {
        0: ["sina"],
        1: ["tencent", "eastmoney"],
        2: ["baostock", "akshare"],
        3: ["tushare"],
        4: ["cache"],
    })

    # 各级别批大小配置
    level_batch_sizes: Dict[int, int] = field(default_factory=lambda: {
        0: 100,
        1: 100,
        2: 100,
        3: 50,
        4: 10,
    })


class HealthChecker:
    """数据源健康检查器"""

    def __init__(self, config: DegradationConfig):
        self.config = config
        self.health_status: Dict[str, HealthStatus] = {}
        self.request_history: Dict[str, deque] = {}  # 滑动窗口历史
        self.history_window = 60  # 60秒窗口

    def register_source(self, source_name: str):
        """注册数据源"""
        self.health_status[source_name] = HealthStatus(source_name=source_name)
        self.request_history[source_name] = deque(maxlen=100)

    async def check_health(self, source_name: str) -> HealthStatus:
        """检查单个数据源健康状态"""
        if source_name not in self.health_status:
            self.register_source(source_name)

        status = self.health_status[source_name]

        # 计算滑动窗口内的成功率
        history = self.request_history.get(source_name, deque())
        recent_requests = [
            (success, ts) for success, ts, _ in history
            if (datetime.now() - ts).total_seconds() < self.history_window
        ]

        if recent_requests:
            success_count = sum(1 for success, _ in recent_requests if success)
            status.success_rate = success_count / len(recent_requests)

            # 计算平均响应时间
            response_times = [
                rt for success, _, rt in history
                if (datetime.now() - ts).total_seconds() < self.history_window
                for ts in [datetime.now()]  # 简化处理
            ]
            if response_times:
                status.avg_response_time = sum(response_times) / len(response_times)

        # 判断健康状态
        status.is_healthy = (
            status.success_rate >= 0.95 and
            status.consecutive_failures < self.config.failure_threshold and
            status.avg_response_time < self.config.response_time_threshold
        )

        return status

    async def check_all_sources(self) -> Dict[str, HealthStatus]:
        """检查所有数据源健康状态"""
        results = {}
        for source_name in self.health_status:
            results[source_name] = await self.check_health(source_name)
        return results

    def record_request(self, source_name: str, success: bool, response_time: float):
        """记录请求结果"""
        if source_name not in self.request_history:
            self.request_history[source_name] = deque(maxlen=100)

        self.request_history[source_name].append(
            (success, datetime.now(), response_time)
        )

        # 更新健康状态
        if source_name in self.health_status:
            self.health_status[source_name].update(success, response_time)


class DataMerger:
    """多源数据合并器"""

    # 数据源权重
    SOURCE_WEIGHTS = {
        "sina": 1.0,
        "tencent": 0.9,
        "eastmoney": 0.9,
        "tushare": 0.95,
        "baostock": 0.7,
        "akshare": 0.8,
    }

    async def merge_quotes(
        self,
        source_quotes: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        合并多个数据源的股票报价

        Args:
            source_quotes: {source_name: quote_data}

        Returns:
            合并后的报价数据
        """
        if not source_quotes:
            return {}

        # 提取所有价格
        prices = []
        timestamps = []
        sources = []

        for source_name, quote in source_quotes.items():
            if not quote or "price" not in quote:
                continue

            price = quote.get("price", 0)
            if price <= 0:
                continue

            # 检查是否为异常值
            if self._is_outlier(price, [q.get("price", 0) for q in source_quotes.values()]):
                logger.warning(f"价格异常值 detected from {source_name}: {price}")
                continue

            weight = self.SOURCE_WEIGHTS.get(source_name, 0.5)
            prices.append((price, weight))
            timestamps.append(quote.get("timestamp"))
            sources.append(source_name)

        if not prices:
            return {}

        # 加权平均价格
        total_weight = sum(w for _, w in prices)
        weighted_price = sum(p * w for p, w in prices) / total_weight

        # 取最新时间戳
        latest_timestamp = max(
            (ts for ts in timestamps if ts),
            default=datetime.now()
        )

        return {
            "price": weighted_price,
            "timestamp": latest_timestamp,
            "sources": sources,
            "confidence": min(total_weight, 1.0),
            "source_count": len(sources),
        }

    def _is_outlier(self, price: float, all_prices: List[float], threshold: float = 0.1) -> bool:
        """检测价格是否为异常值"""
        valid_prices = [p for p in all_prices if p > 0]
        if len(valid_prices) < 2:
            return False

        avg_price = sum(valid_prices) / len(valid_prices)
        if avg_price == 0:
            return False

        deviation = abs(price - avg_price) / avg_price
        return deviation > threshold


class DegradationManager:
    """
    系统降级管理器

    管理数据源的降级和恢复，确保系统在各种故障情况下维持运行。
    """

    def __init__(self, config: Optional[DegradationConfig] = None):
        self.config = config or DegradationConfig()
        self.current_level = DegradationLevel.NORMAL
        self.health_checker = HealthChecker(self.config)
        self.data_merger = DataMerger()

        # 事件回调
        self._on_degrade_callbacks: List[Callable] = []
        self._on_recover_callbacks: List[Callable] = []

        # 状态记录
        self.last_switch_time: Optional[datetime] = None
        self.switch_count = 0

        # 注册所有数据源
        for level, sources in self.config.level_sources.items():
            for source in sources:
                self.health_checker.register_source(source)

        logger.info(f"DegradationManager initialized, enabled={self.config.enabled}")

    def on_degrade(self, callback: Callable[[DegradationLevel, DegradationLevel], None]):
        """注册降级事件回调"""
        self._on_degrade_callbacks.append(callback)

    def on_recover(self, callback: Callable[[DegradationLevel, DegradationLevel], None]):
        """注册恢复事件回调"""
        self._on_recover_callbacks.append(callback)

    async def evaluate_and_switch(self) -> bool:
        """
        评估当前状态并执行必要的切换

        Returns:
            是否发生了切换
        """
        if not self.config.enabled:
            return False

        # 检查所有数据源健康状态
        health_status = await self.health_checker.check_all_sources()

        # 获取当前级别应该使用的数据源
        current_sources = self.config.level_sources.get(self.current_level.value, [])

        # 检查当前级别数据源是否健康
        if self.current_level == DegradationLevel.NORMAL:
            # 检查主源是否健康
            primary_source = current_sources[0] if current_sources else "sina"
            primary_status = health_status.get(primary_source)

            if primary_status and not primary_status.is_healthy:
                logger.warning(f"主源 {primary_source} 不健康，触发降级")
                await self._degrade_to(DegradationLevel.DEGRADED_L1)
                return True

        else:
            # 检查当前降级源是否健康
            all_unhealthy = all(
                not health_status.get(s, HealthStatus(s)).is_healthy
                for s in current_sources
            )

            if all_unhealthy:
                # 当前级别全部不可用，尝试进一步降级
                next_level = DegradationLevel(min(self.current_level.value + 1, 4))
                if next_level != self.current_level:
                    logger.warning(f"当前级别全部数据源不可用，降级至 {next_level.name}")
                    await self._degrade_to(next_level)
                    return True

            # 检查是否可以恢复
            if self.config.auto_recovery:
                can_recover = await self._check_recovery_possible()
                if can_recover and self.current_level.value > 0:
                    next_level = DegradationLevel(self.current_level.value - 1)
                    logger.info(f"条件满足，尝试恢复至 {next_level.name}")
                    await self._recover_to(next_level)
                    return True

        return False

    async def _degrade_to(self, target_level: DegradationLevel):
        """降级到指定级别"""
        if target_level == self.current_level:
            return

        old_level = self.current_level
        self.current_level = target_level
        self.last_switch_time = datetime.now()
        self.switch_count += 1

        logger.warning(
            f"系统降级: {old_level.name} -> {target_level.name}, "
            f"切换次数={self.switch_count}"
        )

        # 触发回调
        for callback in self._on_degrade_callbacks:
            try:
                await callback(old_level, target_level)
            except Exception as e:
                logger.error(f"降级回调执行失败: {e}")

    async def _recover_to(self, target_level: DegradationLevel):
        """恢复到指定级别"""
        if target_level == self.current_level:
            return

        old_level = self.current_level
        self.current_level = target_level
        self.last_switch_time = datetime.now()

        logger.info(f"系统恢复: {old_level.name} -> {target_level.name}")

        # 触发回调
        for callback in self._on_recover_callbacks:
            try:
                await callback(old_level, target_level)
            except Exception as e:
                logger.error(f"恢复回调执行失败: {e}")

    async def _check_recovery_possible(self) -> bool:
        """检查是否可以恢复"""
        # 获取上一级数据源
        prev_level_value = self.current_level.value - 1
        if prev_level_value < 0:
            return False

        prev_sources = self.config.level_sources.get(prev_level_value, [])
        if not prev_sources:
            return False

        # 检查上级数据源健康状态
        health_status = await self.health_checker.check_all_sources()

        healthy_count = sum(
            1 for s in prev_sources
            if health_status.get(s, HealthStatus(s)).is_healthy
        )

        # 至少50%的数据源健康
        return healthy_count >= len(prev_sources) / 2

    def get_current_sources(self) -> List[str]:
        """获取当前级别应该使用的数据源列表"""
        return self.config.level_sources.get(self.current_level.value, ["sina"])

    def get_ux_message(self) -> Optional[str]:
        """获取当前降级级别的用户提示信息"""
        messages = {
            DegradationLevel.NORMAL: None,
            DegradationLevel.DEGRADED_L1: "数据服务降级，可能存在短暂延迟",
            DegradationLevel.DEGRADED_L2: "数据服务降级，部分数据可能有延迟",
            DegradationLevel.DEGRADED_L3: "数据服务严重降级，仅核心功能可用",
            DegradationLevel.CRITICAL: "数据服务极度受限，仅显示缓存数据",
        }
        return messages.get(self.current_level)

    def get_refresh_interval(self) -> int:
        """获取当前级别的刷新间隔(秒)"""
        intervals = {
            DegradationLevel.NORMAL: 10,
            DegradationLevel.DEGRADED_L1: 15,
            DegradationLevel.DEGRADED_L2: 30,
            DegradationLevel.DEGRADED_L3: 60,
            DegradationLevel.CRITICAL: 300,
        }
        return intervals.get(self.current_level, 60)

    def get_status(self) -> Dict[str, Any]:
        """获取降级管理器状态"""
        return {
            "current_level": self.current_level.name,
            "current_level_value": self.current_level.value,
            "enabled": self.config.enabled,
            "auto_recovery": self.config.auto_recovery,
            "current_sources": self.get_current_sources(),
            "switch_count": self.switch_count,
            "last_switch_time": self.last_switch_time.isoformat() if self.last_switch_time else None,
            "ux_message": self.get_ux_message(),
            "refresh_interval": self.get_refresh_interval(),
        }


class DegradationMonitor:
    """降级监控器 - 持续监控并触发降级/恢复"""

    def __init__(self, manager: DegradationManager):
        self.manager = manager
        self.running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        """启动监控"""
        if self.running:
            return

        self.running = True
        self._task = asyncio.create_task(self._monitor_loop())
        logger.info("DegradationMonitor started")

    async def stop(self):
        """停止监控"""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("DegradationMonitor stopped")

    async def _monitor_loop(self):
        """监控循环"""
        while self.running:
            try:
                await self.manager.evaluate_and_switch()
                await asyncio.sleep(self.manager.config.health_check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"监控循环异常: {e}")
                await asyncio.sleep(5)


# 全局降级管理器实例
_degradation_manager: Optional[DegradationManager] = None


def get_degradation_manager() -> DegradationManager:
    """获取全局降级管理器实例"""
    global _degradation_manager
    if _degradation_manager is None:
        _degradation_manager = DegradationManager()
    return _degradation_manager


def set_degradation_manager(manager: DegradationManager):
    """设置全局降级管理器实例"""
    global _degradation_manager
    _degradation_manager = manager
