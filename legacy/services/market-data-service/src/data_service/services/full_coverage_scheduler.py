"""
Full Coverage Scheduler - 全量优先调度器

实现全量优先的采集调度策略：
1. 动态降级：根据可用源数量调整采集间隔
2. 时段感知：交易时段/收盘后/晚间采用不同策略
3. 覆盖率保证：宁可降频，也不减覆盖

降级级别：
- Normal: 4源可用，60秒间隔，目标99%覆盖
- Degraded-1: 3源可用，90秒间隔，目标95%覆盖
- Degraded-2: 2源可用，120秒间隔，目标90%覆盖
- Critical: 1源可用，180秒间隔，目标70%覆盖
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, time

from ..collectors.relay_collector import RelayCollector

logger = logging.getLogger(__name__)


class FullCoverageScheduler:
    """
    全量优先调度器

    职责：
    1. 检查可用数据源数量
    2. 确定降级级别
    3. 动态调整采集间隔
    4. 确保覆盖率目标
    """

    # 降级配置
    DEGRADATION_CONFIGS = {
        "normal": {
            "interval": 60,
            "target_coverage": 0.99,
            "description": "正常级别 - 4源可用"
        },
        "degraded_1": {
            "interval": 90,
            "target_coverage": 0.95,
            "description": "降级1级 - 3源可用"
        },
        "degraded_2": {
            "interval": 120,
            "target_coverage": 0.90,
            "description": "降级2级 - 2源可用"
        },
        "critical": {
            "interval": 180,
            "target_coverage": 0.70,
            "description": "临界级别 - 1源可用"
        }
    }

    # 时段配置
    TIME_CONFIGS = {
        "trading": {
            "high_freq_enabled": True,
            "high_freq_interval": 10,
            "full_layer_interval": 60,
            "enabled_sources": ["sina", "tencent", "eastmoney", "baostock"]
        },
        "closing": {
            "high_freq_enabled": True,
            "high_freq_interval": 30,
            "full_layer_interval": 60,
            "enabled_sources": ["sina", "tencent", "eastmoney"]  # Baostock禁用
        },
        "after_hours": {
            "high_freq_enabled": False,
            "full_layer_interval": 120,
            "enabled_sources": ["sina", "tencent", "eastmoney"]  # Baostock禁用
        },
        "night": {
            "high_freq_enabled": False,
            "full_layer_interval": 300,
            "enabled_sources": ["sina", "tencent"]  # 仅基础源
        }
    }

    def __init__(self):
        """初始化调度器"""
        self.relay_collector = RelayCollector()
        self.current_level = "normal"
        self.last_collection_time = None

        logger.info("FullCoverageScheduler initialized")

    def get_degradation_level(self, healthy_sources: List[str]) -> str:
        """
        根据可用源数量确定降级级别

        Args:
            healthy_sources: 健康的数据源列表

        Returns:
            降级级别字符串
        """
        source_count = len(healthy_sources)

        if source_count >= 4:
            return "normal"
        elif source_count == 3:
            return "degraded_1"
        elif source_count == 2:
            return "degraded_2"
        else:
            return "critical"

    def get_interval(self, level: str) -> int:
        """
        获取指定级别的采集间隔

        Args:
            level: 降级级别

        Returns:
            采集间隔（秒）
        """
        config = self.DEGRADATION_CONFIGS.get(level)
        if config:
            return config["interval"]
        return self.DEGRADATION_CONFIGS["normal"]["interval"]

    def get_target_coverage(self, level: str) -> float:
        """
        获取指定级别的目标覆盖率

        Args:
            level: 降级级别

        Returns:
            目标覆盖率（0.0-1.0）
        """
        config = self.DEGRADATION_CONFIGS.get(level)
        if config:
            return config["target_coverage"]
        return self.DEGRADATION_CONFIGS["normal"]["target_coverage"]

    def redistribute_for_coverage(self, stocks: List[str],
                                  healthy_sources: List[str]) -> Dict[str, List[str]]:
        """
        为覆盖率重新分配股票

        当源减少时，增加每个源的采集量（带重叠），而不是减少覆盖范围

        Args:
            stocks: 全部股票列表
            healthy_sources: 健康的数据源列表

        Returns:
            重新分配的结果
        """
        if not healthy_sources:
            return {}

        n = len(stocks)
        m = len(healthy_sources)

        # 计算每源分配量（带30%重叠，确保2源时每源60%）
        per_source = int(n * 1.3 / m)
        overlap = int(n * 0.15)  # 15%重叠

        assignments = {}
        start = 0

        for i, source in enumerate(healthy_sources):
            if i == len(healthy_sources) - 1:
                # 最后一个源负责到结尾
                assignments[source] = stocks[start:]
            else:
                end = min(start + per_source, n)
                assignments[source] = stocks[start:end]
                start = end - overlap

        logger.info(f"Redistributed {n} stocks to {m} sources "
                   f"with {overlap} overlap per segment")

        return assignments

    def is_trading_hours(self) -> bool:
        """
        判断当前是否为交易时段

        Returns:
            是否为交易时段
        """
        now = datetime.now().time()

        # 上午：9:30-11:30
        morning_start = time(9, 30)
        morning_end = time(11, 30)

        # 下午：13:00-15:00
        afternoon_start = time(13, 0)
        afternoon_end = time(15, 0)

        return (morning_start <= now <= morning_end) or \
               (afternoon_start <= now <= afternoon_end)

    def get_current_mode(self) -> str:
        """
        获取当前时段模式

        Returns:
            时段模式字符串
        """
        now = datetime.now().time()

        # 交易时段
        if self.is_trading_hours():
            return "trading"

        # 收盘过渡期（15:00-15:05）
        if time(15, 0) <= now <= time(15, 5):
            return "closing"

        # 收盘后（15:05-19:00）
        if time(15, 5) < now <= time(19, 0):
            return "after_hours"

        # 晚间时段（19:00-09:15）
        return "night"

    def get_collection_config(self, mode: str) -> Dict[str, Any]:
        """
        获取指定时段的采集配置

        Args:
            mode: 时段模式

        Returns:
            采集配置字典
        """
        return self.TIME_CONFIGS.get(mode, self.TIME_CONFIGS["trading"])

    def is_coverage_acceptable(self, coverage: float, level: str) -> bool:
        """
        判断覆盖率是否达标

        Args:
            coverage: 实际覆盖率
            level: 降级级别

        Returns:
            是否达标
        """
        target = self.get_target_coverage(level)
        return coverage >= target

    def should_emergency_collect(self, coverage: float, level: str) -> bool:
        """
        判断是否需要紧急补采

        Args:
            coverage: 实际覆盖率
            level: 降级级别

        Returns:
            是否需要补采
        """
        target = self.get_target_coverage(level)
        return coverage < target

    async def collect_full_layer(self, stocks: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        执行全量层采集

        流程：
        1. 检查可用源数量
        2. 确定降级级别
        3. 执行接力采集
        4. 检查覆盖率
        5. 必要时补采

        Args:
            stocks: 全部股票列表

        Returns:
            采集结果
        """
        if not stocks:
            return {}

        # 获取健康源
        healthy_sources = list(self.relay_collector.sources.keys())

        # 确定降级级别
        level = self.get_degradation_level(healthy_sources)
        self.current_level = level

        logger.info(f"Starting full layer collection: {len(stocks)} stocks, "
                   f"level={level}, sources={len(healthy_sources)}")

        # 执行接力采集
        results = await self.relay_collector.collect_with_relay(stocks)

        # 检查覆盖率
        coverage = self.relay_collector.calculate_coverage(results, stocks)

        # 如果需要，执行补采
        if self.should_emergency_collect(coverage, level):
            logger.warning(f"Coverage {coverage:.1%} below target {self.get_target_coverage(level):.1%}, "
                          f"starting emergency collection")

            missing_stocks = self._find_missing_stocks(results, stocks)
            retry_results = await self.relay_collector.compensation_collect(missing_stocks)
            results.update(retry_results)

            # 重新计算覆盖率
            coverage = self.relay_collector.calculate_coverage(results, stocks)

        self.last_collection_time = datetime.now()

        logger.info(f"Full layer collection completed: {len(results)}/{len(stocks)} "
                   f"({coverage:.1%} coverage)")

        return results

    def _find_missing_stocks(self, results: Dict, expected: List[str]) -> List[str]:
        """
        找出缺失的股票

        Args:
            results: 采集结果
            expected: 期望的股票列表

        Returns:
            缺失的股票列表
        """
        expected_set = set(expected)
        result_set = set()

        for symbol, data in results.items():
            if data is not None and isinstance(data, dict) and data.get("price", 0) > 0:
                result_set.add(symbol)

        return list(expected_set - result_set)

    def get_stats(self) -> Dict[str, Any]:
        """获取调度器统计信息"""
        return {
            "current_level": self.current_level,
            "last_collection_time": self.last_collection_time.isoformat() if self.last_collection_time else None,
            "degradation_config": self.DEGRADATION_CONFIGS.get(self.current_level),
            "current_mode": self.get_current_mode()
        }
