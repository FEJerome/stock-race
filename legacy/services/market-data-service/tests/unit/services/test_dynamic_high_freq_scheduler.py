"""
Tests for DynamicHighFreqScheduler - 动态高频层调度器单元测试

TDD开发流程：
1. 编写测试（Red）
2. 实现代码（Green）
3. 重构优化（Refactor）

测试覆盖：
- 动态股票数量计算
- 健康状态映射
- 采集间隔调整
- 边界条件处理
"""

import pytest
from datetime import datetime
from typing import List, Dict
from unittest.mock import Mock, patch

from data_service.services.dynamic_high_freq_scheduler import (
    DynamicHighFreqScheduler,
    HealthStatus,
    HighFreqConfig
)


class TestDynamicHighFreqScheduler:
    """动态高频层调度器测试类"""

    @pytest.fixture
    def scheduler(self):
        """创建调度器实例"""
        return DynamicHighFreqScheduler()

    @pytest.fixture
    def mock_health_monitor(self):
        """创建Mock健康监控器"""
        monitor = Mock()
        monitor.get_healthy_source_count = Mock(return_value=4)
        monitor.get_system_health_status = Mock(return_value="healthy")
        return monitor

    # ========== 测试：健康状态判断 ==========

    def test_health_status_excellent(self, scheduler):
        """测试优秀健康状态（4源）"""
        status = scheduler._get_health_status(4)
        assert status == HealthStatus.EXCELLENT

    def test_health_status_good(self, scheduler):
        """测试良好健康状态（3源）"""
        status = scheduler._get_health_status(3)
        assert status == HealthStatus.GOOD

    def test_health_status_normal(self, scheduler):
        """测试一般健康状态（2源）"""
        status = scheduler._get_health_status(2)
        assert status == HealthStatus.NORMAL

    def test_health_status_poor(self, scheduler):
        """测试较差健康状态（1源）"""
        status = scheduler._get_health_status(1)
        assert status == HealthStatus.POOR

    def test_health_status_critical(self, scheduler):
        """测试临界健康状态（0源）"""
        status = scheduler._get_health_status(0)
        assert status == HealthStatus.CRITICAL

    # ========== 测试：动态股票数量计算 ==========

    def test_get_stock_count_excellent(self, scheduler):
        """测试优秀状态返回200只"""
        with patch.object(scheduler, '_get_healthy_source_count', return_value=4):
            count = scheduler.get_high_freq_stock_count()
            assert count == 200

    def test_get_stock_count_good(self, scheduler):
        """测试良好状态返回150只"""
        with patch.object(scheduler, '_get_healthy_source_count', return_value=3):
            count = scheduler.get_high_freq_stock_count()
            assert count == 150

    def test_get_stock_count_normal(self, scheduler):
        """测试一般状态返回100只"""
        with patch.object(scheduler, '_get_healthy_source_count', return_value=2):
            count = scheduler.get_high_freq_stock_count()
            assert count == 100

    def test_get_stock_count_poor(self, scheduler):
        """测试较差状态返回50只"""
        with patch.object(scheduler, '_get_healthy_source_count', return_value=1):
            count = scheduler.get_high_freq_stock_count()
            assert count == 50

    def test_get_stock_count_critical(self, scheduler):
        """测试临界状态返回0只"""
        with patch.object(scheduler, '_get_healthy_source_count', return_value=0):
            count = scheduler.get_high_freq_stock_count()
            assert count == 0

    # ========== 测试：采集间隔计算 ==========

    def test_get_interval_excellent(self, scheduler):
        """测试优秀状态返回10秒"""
        with patch.object(scheduler, '_get_healthy_source_count', return_value=4):
            interval = scheduler.get_high_freq_interval()
            assert interval == 10

    def test_get_interval_normal(self, scheduler):
        """测试一般状态返回10秒"""
        with patch.object(scheduler, '_get_healthy_source_count', return_value=2):
            interval = scheduler.get_high_freq_interval()
            assert interval == 10

    def test_get_interval_poor(self, scheduler):
        """测试较差状态返回15秒"""
        with patch.object(scheduler, '_get_healthy_source_count', return_value=1):
            interval = scheduler.get_high_freq_interval()
            assert interval == 15

    def test_get_interval_critical(self, scheduler):
        """测试临界状态返回-1（暂停）"""
        with patch.object(scheduler, '_get_healthy_source_count', return_value=0):
            interval = scheduler.get_high_freq_interval()
            assert interval == -1

    # ========== 测试：配置获取 ==========

    def test_get_current_config_excellent(self, scheduler):
        """测试优秀状态配置"""
        with patch.object(scheduler, '_get_healthy_source_count', return_value=4):
            config = scheduler.get_current_config()
            assert config.stock_count == 200
            assert config.interval == 10
            assert config.status == HealthStatus.EXCELLENT

    def test_get_current_config_poor(self, scheduler):
        """测试较差状态配置"""
        with patch.object(scheduler, '_get_healthy_source_count', return_value=1):
            config = scheduler.get_current_config()
            assert config.stock_count == 50
            assert config.interval == 15
            assert config.status == HealthStatus.POOR

    # ========== 测试：状态变化检测 ==========

    def test_should_adjust_no_change(self, scheduler):
        """测试状态无变化时不调整"""
        scheduler._last_source_count = 4
        with patch.object(scheduler, '_get_healthy_source_count', return_value=4):
            should_adjust = scheduler.should_adjust_high_freq_layer()
            assert should_adjust is False

    def test_should_adjust_with_change(self, scheduler):
        """测试状态变化时需要调整"""
        scheduler._last_source_count = 4
        with patch.object(scheduler, '_get_healthy_source_count', return_value=2):
            should_adjust = scheduler.get_adjustment_needed()
            assert should_adjust is True

    # ========== 测试：边界条件 ==========

    def test_negative_source_count(self, scheduler):
        """测试负数源数量处理"""
        status = scheduler._get_health_status(-1)
        assert status == HealthStatus.CRITICAL

    def test_large_source_count(self, scheduler):
        """测试超过4源的情况"""
        status = scheduler._get_health_status(10)
        assert status == HealthStatus.EXCELLENT

    # ========== 测试：统计信息 ==========

    def test_get_stats(self, scheduler):
        """测试获取统计信息"""
        with patch.object(scheduler, '_get_healthy_source_count', return_value=3):
            stats = scheduler.get_stats()
            assert "current_stock_count" in stats
            assert "current_interval" in stats
            assert "health_status" in stats
            assert "healthy_sources" in stats


class TestHotStockSelector:
    """热股票选取器测试类"""

    @pytest.fixture
    def selector(self):
        """创建选取器实例"""
        from data_service.services.hot_stock_selector import HotStockSelector
        return HotStockSelector()

    @pytest.fixture
    def sample_hot_stocks(self):
        """测试用热股票列表"""
        return [
            {"symbol": "000001.SZ", "weight": 95.5},
            {"symbol": "600519.SH", "weight": 88.2},
            {"symbol": "000858.SZ", "weight": 72.1},
            {"symbol": "002594.SZ", "weight": 65.3},
            {"symbol": "300750.SZ", "weight": 58.9},
            {"symbol": "000333.SZ", "weight": 45.2},
            {"symbol": "600036.SH", "weight": 32.1},
            {"symbol": "000002.SZ", "weight": 15.8},
        ]

    # ========== 测试：权重排序选取 ==========

    def test_select_top_n_stocks(self, selector, sample_hot_stocks):
        """测试选取前N只权重最高的股票"""
        selected = selector.select_stocks_for_high_freq(sample_hot_stocks, 5)

        assert len(selected) == 5
        assert selected[0] == "000001.SZ"  # 权重最高
        assert selected[1] == "600519.SH"
        assert selected[4] == "300750.SZ"
        assert "000002.SZ" not in selected  # 权重最低，不应被选中

    def test_select_more_than_available(self, selector, sample_hot_stocks):
        """测试选取数量超过可用股票"""
        selected = selector.select_stocks_for_high_freq(sample_hot_stocks, 100)

        assert len(selected) == 8  # 只有8只股票
        assert selected[0] == "000001.SZ"
        assert selected[7] == "000002.SZ"

    def test_select_zero_stocks(self, selector, sample_hot_stocks):
        """测试选取0只股票"""
        selected = selector.select_stocks_for_high_freq(sample_hot_stocks, 0)

        assert len(selected) == 0

    def test_select_from_empty_list(self, selector):
        """测试从空列表选取"""
        selected = selector.select_stocks_for_high_freq([], 5)

        assert len(selected) == 0

    # ========== 测试：权重处理 ==========

    def test_handle_missing_weight(self, selector):
        """测试处理缺失权重的股票"""
        stocks = [
            {"symbol": "000001.SZ"},  # 缺失权重
            {"symbol": "600519.SH", "weight": 88.2},
        ]
        selected = selector.select_stocks_for_high_freq(stocks, 2)

        assert len(selected) == 2
        # 缺失权重的股票应该被赋予默认权重

    def test_handle_invalid_weight(self, selector):
        """测试处理无效权重值"""
        stocks = [
            {"symbol": "000001.SZ", "weight": 150.0},  # 超过100
            {"symbol": "600519.SH", "weight": -10.0},  # 负数
            {"symbol": "000858.SZ", "weight": 50.0},   # 正常
        ]
        selected = selector.select_stocks_for_high_freq(stocks, 3)

        assert len(selected) == 3
        # 无效权重应该被修正

    # ========== 测试：权重排序稳定性 ==========

    def test_stable_sort_same_weight(self, selector):
        """测试相同权重时的稳定性"""
        stocks = [
            {"symbol": "000001.SZ", "weight": 50.0},
            {"symbol": "600519.SH", "weight": 50.0},
            {"symbol": "000858.SZ", "weight": 50.0},
        ]
        selected = selector.select_stocks_for_high_freq(stocks, 3)

        assert len(selected) == 3
        # 相同权重时保持原始顺序


class TestHighFreqConfig:
    """高频配置测试类"""

    def test_default_config_values(self):
        """测试默认配置值"""
        config = HighFreqConfig()

        assert config.base_count == 100
        assert config.max_count == 200
        assert config.min_count == 50
        assert config.base_interval == 10
        assert config.degraded_interval == 15

    def test_custom_config_values(self):
        """测试自定义配置值"""
        config = HighFreqConfig(
            base_count=150,
            max_count=300,
            min_count=75
        )

        assert config.base_count == 150
        assert config.max_count == 300
        assert config.min_count == 75


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
