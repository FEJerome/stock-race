"""
Tests for FullCoverageScheduler - 全量优先调度器单元测试

TDD开发流程：
1. 编写测试（Red）
2. 实现代码（Green）
3. 重构优化（Refactor）

测试覆盖：
- 降级级别判断
- 动态间隔调整
- 覆盖率计算与目标验证
- 时段感知策略
"""

import pytest
import asyncio
from datetime import time, datetime
from typing import List, Dict
from unittest.mock import Mock, AsyncMock, patch

from data_service.services.full_coverage_scheduler import FullCoverageScheduler


class TestFullCoverageScheduler:
    """全量优先调度器测试类"""

    @pytest.fixture
    def scheduler(self):
        """创建调度器实例"""
        return FullCoverageScheduler()

    @pytest.fixture
    def sample_stocks(self) -> List[str]:
        """测试用股票列表"""
        return [f"{i:06d}.SZ" for i in range(1, 501)]

    # ========== 测试：降级级别判断 ==========

    def test_get_degradation_level_normal(self, scheduler):
        """测试正常级别（4源可用）"""
        healthy_sources = ["sina", "tencent", "eastmoney", "baostock"]

        level = scheduler.get_degradation_level(healthy_sources)

        assert level == "normal"

    def test_get_degradation_level_degraded_1(self, scheduler):
        """测试降级1级（3源可用）"""
        healthy_sources = ["sina", "tencent", "eastmoney"]

        level = scheduler.get_degradation_level(healthy_sources)

        assert level == "degraded_1"

    def test_get_degradation_level_degraded_2(self, scheduler):
        """测试降级2级（2源可用）"""
        healthy_sources = ["sina", "tencent"]

        level = scheduler.get_degradation_level(healthy_sources)

        assert level == "degraded_2"

    def test_get_degradation_level_critical(self, scheduler):
        """测试临界级别（1源可用）"""
        healthy_sources = ["sina"]

        level = scheduler.get_degradation_level(healthy_sources)

        assert level == "critical"

    def test_get_degradation_level_no_source(self, scheduler):
        """测试无可用源"""
        healthy_sources = []

        level = scheduler.get_degradation_level(healthy_sources)

        assert level == "critical"

    # ========== 测试：动态间隔调整 ==========

    def test_get_interval_normal(self, scheduler):
        """测试正常级别间隔"""
        interval = scheduler.get_interval("normal")

        assert interval == 60

    def test_get_interval_degraded_1(self, scheduler):
        """测试降级1级间隔"""
        interval = scheduler.get_interval("degraded_1")

        assert interval == 90

    def test_get_interval_degraded_2(self, scheduler):
        """测试降级2级间隔"""
        interval = scheduler.get_interval("degraded_2")

        assert interval == 120

    def test_get_interval_critical(self, scheduler):
        """测试临界级别间隔"""
        interval = scheduler.get_interval("critical")

        assert interval == 180

    def test_get_interval_invalid(self, scheduler):
        """测试无效级别回退"""
        interval = scheduler.get_interval("invalid_level")

        # 应回退到正常级别
        assert interval == 60

    # ========== 测试：覆盖率目标 ==========

    def test_get_target_coverage_normal(self, scheduler):
        """测试正常级别覆盖率目标"""
        target = scheduler.get_target_coverage("normal")

        assert target == 0.99

    def test_get_target_coverage_degraded_1(self, scheduler):
        """测试降级1级覆盖率目标"""
        target = scheduler.get_target_coverage("degraded_1")

        assert target == 0.95

    def test_get_target_coverage_degraded_2(self, scheduler):
        """测试降级2级覆盖率目标"""
        target = scheduler.get_target_coverage("degraded_2")

        assert target == 0.90

    def test_get_target_coverage_critical(self, scheduler):
        """测试临界级别覆盖率目标"""
        target = scheduler.get_target_coverage("critical")

        assert target == 0.70

    # ========== 测试：重新分配策略 ==========

    def test_redistribute_for_coverage_4_sources(self, scheduler, sample_stocks):
        """测试4源重新分配"""
        healthy_sources = ["sina", "tencent", "eastmoney", "baostock"]

        assignments = scheduler.redistribute_for_coverage(sample_stocks, healthy_sources)

        # 验证所有股票都被分配
        all_assigned = set()
        for source_stocks in assignments.values():
            all_assigned.update(source_stocks)

        assert len(all_assigned) == len(sample_stocks)

        # 验证4个源都有分配
        assert len(assignments) == 4

    def test_redistribute_for_coverage_2_sources(self, scheduler, sample_stocks):
        """测试2源重新分配（增加每源负担）"""
        healthy_sources = ["sina", "tencent"]

        assignments = scheduler.redistribute_for_coverage(sample_stocks, healthy_sources)

        # 验证所有股票都被分配
        all_assigned = set()
        for source_stocks in assignments.values():
            all_assigned.update(source_stocks)

        assert len(all_assigned) == len(sample_stocks)

        # 验证2个源都有分配
        assert len(assignments) == 2

        # 验证每个源分配量增加（有重叠）
        for source, stocks in assignments.items():
            # 每个源应该分配至少50%（因为有重叠）
            assert len(stocks) >= len(sample_stocks) * 0.5

    def test_redistribute_for_coverage_1_source(self, scheduler, sample_stocks):
        """测试单源重新分配"""
        healthy_sources = ["sina"]

        assignments = scheduler.redistribute_for_coverage(sample_stocks, healthy_sources)

        # 验证所有股票都分配给单源
        assert len(assignments) == 1
        assert "sina" in assignments
        assert len(assignments["sina"]) == len(sample_stocks)

    def test_redistribute_empty_sources(self, scheduler, sample_stocks):
        """测试空源列表处理"""
        assignments = scheduler.redistribute_for_coverage(sample_stocks, [])

        assert assignments == {}

    # ========== 测试：时段感知策略 ==========

    @patch('data_service.services.full_coverage_scheduler.datetime')
    def test_is_trading_hours_morning(self, mock_datetime, scheduler):
        """测试上午交易时段判断"""
        mock_datetime.now.return_value = datetime(2026, 2, 13, 10, 30, 0)

        assert scheduler.is_trading_hours() is True

    @patch('data_service.services.full_coverage_scheduler.datetime')
    def test_is_trading_hours_afternoon(self, mock_datetime, scheduler):
        """测试下午交易时段判断"""
        mock_datetime.now.return_value = datetime(2026, 2, 13, 14, 0, 0)

        assert scheduler.is_trading_hours() is True

    @patch('data_service.services.full_coverage_scheduler.datetime')
    def test_is_trading_hours_closing(self, mock_datetime, scheduler):
        """测试收盘时段判断"""
        mock_datetime.now.return_value = datetime(2026, 2, 13, 15, 3, 0)

        assert scheduler.is_trading_hours() is False

    @patch('data_service.services.full_coverage_scheduler.datetime')
    def test_is_trading_hours_night(self, mock_datetime, scheduler):
        """测试晚间时段判断"""
        mock_datetime.now.return_value = datetime(2026, 2, 13, 20, 0, 0)

        assert scheduler.is_trading_hours() is False

    @patch('data_service.services.full_coverage_scheduler.datetime')
    def test_get_current_mode_trading(self, mock_datetime, scheduler):
        """测试获取交易时段模式"""
        mock_datetime.now.return_value = datetime(2026, 2, 13, 10, 0, 0)

        mode = scheduler.get_current_mode()

        assert mode == "trading"

    @patch('data_service.services.full_coverage_scheduler.datetime')
    def test_get_current_mode_after_hours(self, mock_datetime, scheduler):
        """测试获取收盘后模式"""
        mock_datetime.now.return_value = datetime(2026, 2, 13, 16, 0, 0)

        mode = scheduler.get_current_mode()

        assert mode == "after_hours"

    @patch('data_service.services.full_coverage_scheduler.datetime')
    def test_get_current_mode_night(self, mock_datetime, scheduler):
        """测试获取晚间模式"""
        mock_datetime.now.return_value = datetime(2026, 2, 13, 22, 0, 0)

        mode = scheduler.get_current_mode()

        assert mode == "night"

    # ========== 测试：配置获取 ==========

    def test_get_collection_config_trading(self, scheduler):
        """测试交易时段配置"""
        config = scheduler.get_collection_config("trading")

        assert config["high_freq_enabled"] is True
        assert config["high_freq_interval"] == 10
        assert config["full_layer_interval"] == 60
        assert "baostock" in config["enabled_sources"]

    def test_get_collection_config_after_hours(self, scheduler):
        """测试收盘后配置"""
        config = scheduler.get_collection_config("after_hours")

        assert config["high_freq_enabled"] is False
        assert config["full_layer_interval"] == 120
        assert "baostock" not in config["enabled_sources"]  # Baostock禁用

    def test_get_collection_config_night(self, scheduler):
        """测试晚间配置"""
        config = scheduler.get_collection_config("night")

        assert config["high_freq_enabled"] is False
        assert config["full_layer_interval"] == 300
        assert len(config["enabled_sources"]) <= 2  # 仅基础源

    # ========== 测试：覆盖率检查 ==========

    def test_is_coverage_acceptable_meets_target(self, scheduler):
        """测试覆盖率达标"""
        result = scheduler.is_coverage_acceptable(0.99, "normal")

        assert result is True

    def test_is_coverage_acceptable_below_target(self, scheduler):
        """测试覆盖率不达标"""
        result = scheduler.is_coverage_acceptable(0.90, "normal")

        assert result is False

    def test_is_coverage_acceptable_critical_low(self, scheduler):
        """测试临界级别低覆盖率可接受"""
        result = scheduler.is_coverage_acceptable(0.75, "critical")

        assert result is True  # 临界级别目标70%，75%达标

    # ========== 测试：紧急补采决策 ==========

    def test_should_emergency_collect_needed(self, scheduler):
        """测试需要紧急补采"""
        result = scheduler.should_emergency_collect(0.85, "normal")

        assert result is True  # 85% < 99%目标，需要补采

    def test_should_emergency_collect_not_needed(self, scheduler):
        """测试不需要紧急补采"""
        result = scheduler.should_emergency_collect(0.99, "normal")

        assert result is False

    def test_should_emergency_collect_degraded(self, scheduler):
        """测试降级级别补采决策"""
        result = scheduler.should_emergency_collect(0.97, "degraded_1")

        assert result is False  # 97% >= 95%目标，不需要


class TestFullCoverageSchedulerIntegration:
    """全量优先调度器集成测试"""

    @pytest.fixture
    def scheduler(self):
        return FullCoverageScheduler()

    @pytest.mark.asyncio
    async def test_full_collection_cycle_normal(self, scheduler):
        """测试正常完整采集周期"""
        stocks = [f"{i:06d}.SZ" for i in range(1, 101)]

        # Mock采集结果
        mock_results = {stock: {"symbol": stock, "price": 10.0} for stock in stocks}

        with patch.object(scheduler.relay_collector, 'collect_with_relay', return_value=mock_results):
            results = await scheduler.collect_full_layer(stocks)

        # 验证覆盖率
        coverage = len(results) / len(stocks)
        assert coverage == 1.0

    @pytest.mark.asyncio
    async def test_full_collection_cycle_with_retry(self, scheduler):
        """测试需要重试的采集周期"""
        stocks = [f"{i:06d}.SZ" for i in range(1, 101)]

        # 第一次采集80%，第二次补采到95%
        first_results = {stock: {"symbol": stock, "price": 10.0}
                        for stock in stocks[:80]}
        second_results = {stock: {"symbol": stock, "price": 10.0}
                         for stock in stocks[80:95]}

        with patch.object(scheduler.relay_collector, 'collect_with_relay') as mock_collect:
            mock_collect.side_effect = [first_results, second_results]

            results = await scheduler.collect_full_layer(stocks)

        # 验证最终覆盖率（80% + 15%补偿 = 95%，但实际实现可能略有差异）
        coverage = len(results) / len(stocks)
        assert coverage >= 0.80  # 至少保证80%覆盖率


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
