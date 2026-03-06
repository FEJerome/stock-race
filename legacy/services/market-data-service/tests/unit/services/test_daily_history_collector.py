"""
T-020: DailyHistoryCollector 单元测试

日终历史数据采集器测试，采用 TDD 模式开发。
测试覆盖：
- 单只股票日K线采集
- 批量股票采集
- 数据源故障切换
- 重试机制
- 数据完整性校验
- 错误处理
"""

import pytest
import asyncio
from datetime import datetime, date, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from typing import List, Dict, Any

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from data_service.services.daily_history_collector import (
    DailyHistoryCollector,
    CollectionResult,
    DataSourceError,
    DataValidationError
)


class TestDailyHistoryCollectorBasics:
    """DailyHistoryCollector 基础功能测试"""

    @pytest.fixture
    def collector(self):
        """创建采集器实例"""
        return DailyHistoryCollector(batch_size=100, batch_interval=0.1)

    @pytest.fixture
    def sample_daily_kline(self):
        """样本日K线数据"""
        return {
            "symbol": "000001.SZ",
            "timestamp": datetime(2026, 2, 13, 15, 0, 0),
            "interval": "1d",
            "open": 10.50,
            "high": 11.20,
            "low": 10.30,
            "close": 11.00,
            "volume": 1500000,
            "amount": 16500000.0,
            "adj_close": 11.00,
            "vwap": 10.85,
            "data_source": "baostock"
        }

    @pytest.fixture
    def mock_baostock_collector(self):
        """模拟 Baostock 采集器"""
        mock = AsyncMock()
        mock.get_stock_history = AsyncMock(return_value=[
            {
                "symbol": "000001.SZ",
                "timestamp": datetime(2026, 2, 13, 15, 0, 0),
                "interval": "1d",
                "open": 10.50,
                "high": 11.20,
                "low": 10.30,
                "close": 11.00,
                "volume": 1500000,
                "amount": 16500000.0,
                "adj_close": 11.00,
                "data_source": "baostock"
            }
        ])
        return mock

    @pytest.fixture
    def mock_tushare_collector(self):
        """模拟 Tushare 采集器"""
        mock = AsyncMock()
        mock.get_stock_history = AsyncMock(return_value=[
            {
                "symbol": "000001.SZ",
                "timestamp": datetime(2026, 2, 13, 15, 0, 0),
                "interval": "1d",
                "open": 10.50,
                "high": 11.20,
                "low": 10.30,
                "close": 11.00,
                "volume": 1500000,
                "amount": 16500000.0,
                "adj_close": 11.00,
                "data_source": "tushare"
            }
        ])
        return mock

    # ==========================================================================
    # 测试1: 初始化测试
    # ==========================================================================

    def test_collector_initialization(self):
        """测试采集器初始化"""
        collector = DailyHistoryCollector(batch_size=50, batch_interval=5.0)

        assert collector.batch_size == 50
        assert collector.batch_interval == 5.0
        assert collector.primary_source == "baostock"
        assert collector.max_retries == 3
        assert collector.retry_delay == 2.0

    def test_collector_default_values(self):
        """测试采集器默认值"""
        collector = DailyHistoryCollector()

        assert collector.batch_size == 100
        assert collector.batch_interval == 5.0
        assert collector.max_retries == 3

    # ==========================================================================
    # 测试2: 单只股票采集
    # ==========================================================================

    @pytest.mark.asyncio
    async def test_collect_single_stock_success(self, collector, mock_baostock_collector):
        """测试单只股票采集成功"""
        collector.baostock_collector = mock_baostock_collector

        result = await collector.collect_single_stock(
            symbol="000001.SZ",
            trade_date=date(2026, 2, 13)
        )

        assert result.success is True
        assert result.symbol == "000001.SZ"
        assert result.records_collected == 1
        assert result.data_source == "baostock"
        assert result.error is None

    @pytest.mark.asyncio
    async def test_collect_single_stock_no_data(self, collector, mock_baostock_collector):
        """测试单只股票无数据返回"""
        mock_baostock_collector.get_stock_history.return_value = []
        collector.baostock_collector = mock_baostock_collector

        result = await collector.collect_single_stock(
            symbol="000001.SZ",
            trade_date=date(2026, 2, 13)
        )

        assert result.success is False
        assert result.records_collected == 0
        # 错误信息会被重试机制覆盖，检查最终错误包含失败信息
        assert "failed" in result.error.lower() or "No data" in result.error

    @pytest.mark.asyncio
    async def test_collect_single_stock_exception(self, collector, mock_baostock_collector):
        """测试单只股票采集异常"""
        mock_baostock_collector.get_stock_history.side_effect = Exception("Network error")
        collector.baostock_collector = mock_baostock_collector

        result = await collector.collect_single_stock(
            symbol="000001.SZ",
            trade_date=date(2026, 2, 13)
        )

        assert result.success is False
        # 检查包含"failed"或原始错误信息
        assert "failed" in result.error.lower() or "Network error" in result.error

    # ==========================================================================
    # 测试3: 数据源故障切换
    # ==========================================================================

    @pytest.mark.asyncio
    async def test_datasource_fallback_to_tushare(self, collector, mock_baostock_collector, mock_tushare_collector):
        """测试 Baostock 失败时切换到 Tushare"""
        mock_baostock_collector.get_stock_history.side_effect = DataSourceError("Baostock failed")
        collector.baostock_collector = mock_baostock_collector
        collector.tushare_collector = mock_tushare_collector

        result = await collector.collect_single_stock(
            symbol="000001.SZ",
            trade_date=date(2026, 2, 13)
        )

        assert result.success is True
        assert result.data_source == "tushare"
        mock_tushare_collector.get_stock_history.assert_called_once()

    @pytest.mark.asyncio
    async def test_datasource_fallback_all_failed(self, collector, mock_baostock_collector, mock_tushare_collector):
        """测试所有数据源都失败"""
        mock_baostock_collector.get_stock_history.side_effect = DataSourceError("Baostock failed")
        mock_tushare_collector.get_stock_history.side_effect = DataSourceError("Tushare failed")
        collector.baostock_collector = mock_baostock_collector
        collector.tushare_collector = mock_tushare_collector

        result = await collector.collect_single_stock(
            symbol="000001.SZ",
            trade_date=date(2026, 2, 13)
        )

        assert result.success is False
        assert result.data_source is None
        assert "All datasources failed" in result.error

    # ==========================================================================
    # 测试4: 重试机制
    # ==========================================================================

    @pytest.mark.asyncio
    async def test_retry_mechanism_success_on_second_attempt(self, collector, mock_baostock_collector):
        """测试第二次重试成功"""
        mock_baostock_collector.get_stock_history.side_effect = [
            DataSourceError("First attempt failed"),
            [{
                "symbol": "000001.SZ",
                "timestamp": datetime(2026, 2, 13, 15, 0, 0),
                "interval": "1d",
                "open": 10.50,
                "high": 11.20,
                "low": 10.30,
                "close": 11.00,
                "volume": 1500000,
                "amount": 16500000.0,
                "data_source": "baostock"
            }]
        ]
        collector.baostock_collector = mock_baostock_collector

        result = await collector.collect_single_stock(
            symbol="000001.SZ",
            trade_date=date(2026, 2, 13)
        )

        assert result.success is True
        assert mock_baostock_collector.get_stock_history.call_count == 2

    @pytest.mark.asyncio
    async def test_retry_mechanism_exhausted(self, collector, mock_baostock_collector):
        """测试重试次数耗尽"""
        mock_baostock_collector.get_stock_history.side_effect = DataSourceError("Always fails")
        collector.baostock_collector = mock_baostock_collector
        collector.max_retries = 3

        result = await collector.collect_single_stock(
            symbol="000001.SZ",
            trade_date=date(2026, 2, 13)
        )

        assert result.success is False
        assert mock_baostock_collector.get_stock_history.call_count == 3

    # ==========================================================================
    # 测试5: 数据完整性校验
    # ==========================================================================

    def test_verify_data_integrity_valid(self, collector):
        """测试有效数据通过校验"""
        valid_data = {
            "symbol": "000001.SZ",
            "open": 10.50,
            "high": 11.20,
            "low": 10.30,
            "close": 11.00,
            "volume": 1500000
        }

        is_valid, error = collector.verify_data_integrity(valid_data)

        assert is_valid is True
        assert error is None

    def test_verify_data_integrity_high_low_logic(self, collector):
        """测试高开低收逻辑校验"""
        # 最高价 < 最低价（无效）
        invalid_data = {
            "symbol": "000001.SZ",
            "open": 10.50,
            "high": 10.00,  # 低于最低价
            "low": 11.00,
            "close": 11.00,
            "volume": 1500000
        }

        is_valid, error = collector.verify_data_integrity(invalid_data)

        assert is_valid is False
        assert "High price" in error

    def test_verify_data_integrity_negative_price(self, collector):
        """测试负价格校验"""
        invalid_data = {
            "symbol": "000001.SZ",
            "open": -10.50,
            "high": 11.20,
            "low": 10.30,
            "close": 11.00,
            "volume": 1500000
        }

        is_valid, error = collector.verify_data_integrity(invalid_data)

        assert is_valid is False
        assert "negative" in error.lower()

    def test_verify_data_integrity_zero_volume(self, collector):
        """测试成交量为0校验"""
        invalid_data = {
            "symbol": "000001.SZ",
            "open": 10.50,
            "high": 11.20,
            "low": 10.30,
            "close": 11.00,
            "volume": 0
        }

        is_valid, error = collector.verify_data_integrity(invalid_data)

        assert is_valid is False
        assert "volume" in error.lower()

    def test_verify_data_integrity_missing_fields(self, collector):
        """测试缺失字段校验"""
        incomplete_data = {
            "symbol": "000001.SZ",
            "open": 10.50,
            "close": 11.00
        }

        is_valid, error = collector.verify_data_integrity(incomplete_data)

        assert is_valid is False
        assert "Missing" in error

    # ==========================================================================
    # 测试6: 批量采集
    # ==========================================================================

    @pytest.mark.asyncio
    async def test_collect_batch_success(self, collector, mock_baostock_collector):
        """测试批量采集成功"""
        mock_baostock_collector.get_stock_history.return_value = [
            {
                "symbol": "000001.SZ",
                "timestamp": datetime(2026, 2, 13, 15, 0, 0),
                "interval": "1d",
                "open": 10.50,
                "high": 11.20,
                "low": 10.30,
                "close": 11.00,
                "volume": 1500000,
                "amount": 16500000.0,
                "data_source": "baostock"
            }
        ]
        collector.baostock_collector = mock_baostock_collector

        symbols = ["000001.SZ", "000002.SZ", "000003.SZ"]
        results = await collector.collect_batch(
            symbols=symbols,
            trade_date=date(2026, 2, 13)
        )

        assert len(results) == 3
        assert all(r.success for r in results)
        assert all(r.records_collected == 1 for r in results)

    @pytest.mark.asyncio
    async def test_collect_batch_with_partial_failure(self, collector, mock_baostock_collector):
        """测试批量采集部分失败"""
        # 为每个symbol返回不同的结果：第一个成功，第二个失败，第三个成功
        async def mock_get_history(symbol, start_date, end_date, interval):
            if symbol == "000001.SZ":
                return [{"symbol": symbol, "open": 10.50, "high": 11.20, "low": 10.30, "close": 11.00, "volume": 1500000}]
            elif symbol == "000002.SZ":
                raise DataSourceError("Failed for 000002.SZ")
            elif symbol == "000003.SZ":
                return [{"symbol": symbol, "open": 20.00, "high": 21.00, "low": 19.50, "close": 20.50, "volume": 2000000}]
            return []

        mock_baostock_collector.get_stock_history.side_effect = mock_get_history
        collector.baostock_collector = mock_baostock_collector

        symbols = ["000001.SZ", "000002.SZ", "000003.SZ"]
        results = await collector.collect_batch(
            symbols=symbols,
            trade_date=date(2026, 2, 13)
        )

        assert len(results) == 3
        assert results[0].success is True
        assert results[1].success is False  # 第二个失败
        assert results[2].success is True

    @pytest.mark.asyncio
    async def test_collect_batch_with_interval(self, collector, mock_baostock_collector):
        """测试批量采集批次间隔"""
        mock_baostock_collector.get_stock_history.return_value = [
            {"symbol": "000001.SZ", "open": 10.50, "high": 11.20, "low": 10.30, "close": 11.00, "volume": 1500000}
        ]
        collector.baostock_collector = mock_baostock_collector
        collector.batch_interval = 0.1  # 100ms间隔，测试用

        symbols = ["000001.SZ", "000002.SZ"]
        start_time = asyncio.get_event_loop().time()

        results = await collector.collect_batch(
            symbols=symbols,
            trade_date=date(2026, 2, 13)
        )

        end_time = asyncio.get_event_loop().time()

        # 验证有间隔延迟（至少100ms）
        assert end_time - start_time >= 0.1
        assert len(results) == 2

    # ==========================================================================
    # 测试7: 全市场采集
    # ==========================================================================

    @pytest.mark.asyncio
    async def test_collect_all_stocks(self, collector, mock_baostock_collector):
        """测试全市场采集"""
        mock_baostock_collector.get_stock_history.return_value = [
            {"symbol": "TEST", "open": 10.50, "high": 11.20, "low": 10.30, "close": 11.00, "volume": 1500000}
        ]
        collector.baostock_collector = mock_baostock_collector
        collector.batch_size = 2  # 小批次便于测试
        collector.batch_interval = 0.01

        symbols = [f"00000{i}.SZ" for i in range(1, 6)]  # 5只股票
        results = await collector.collect_all_stocks(
            symbols=symbols,
            trade_date=date(2026, 2, 13)
        )

        assert len(results) == 5
        assert collector.stats["total_processed"] == 5

    @pytest.mark.asyncio
    async def test_collect_all_stocks_progress_callback(self, collector, mock_baostock_collector):
        """测试全市场采集进度回调"""
        # 为每个symbol返回成功数据
        async def mock_get_history(symbol, start_date, end_date, interval):
            return [{"symbol": symbol, "open": 10.50, "high": 11.20, "low": 10.30, "close": 11.00, "volume": 1500000}]

        mock_baostock_collector.get_stock_history.side_effect = mock_get_history
        collector.baostock_collector = mock_baostock_collector
        collector.batch_size = 2
        collector.batch_interval = 0.01

        progress_updates = []

        async def progress_callback(completed, total, failed):
            progress_updates.append({"completed": completed, "total": total, "failed": failed})

        symbols = [f"00000{i}.SZ" for i in range(1, 5)]  # 4只股票
        results = await collector.collect_all_stocks(
            symbols=symbols,
            trade_date=date(2026, 2, 13),
            progress_callback=progress_callback
        )

        assert len(results) == 4
        # 由于collect_all_stocks调用collect_batch，而collect_batch内部调用progress_callback
        # 统计collect_batch调用progress_callback的次数，不是collect_all_stocks直接调用
        assert len(progress_updates) >= 4  # 每只股票的进度都应有回调

    # ==========================================================================
    # 测试8: 统计数据
    # ==========================================================================

    def test_get_stats_initial(self, collector):
        """测试初始统计数据"""
        stats = collector.get_stats()

        assert stats["total_processed"] == 0
        assert stats["total_success"] == 0
        assert stats["total_failed"] == 0
        assert stats["success_rate"] == 0.0

    @pytest.mark.asyncio
    async def test_get_stats_after_collection(self, collector, mock_baostock_collector):
        """测试采集后统计数据"""
        mock_baostock_collector.get_stock_history.return_value = [
            {"symbol": "TEST", "open": 10.50, "high": 11.20, "low": 10.30, "close": 11.00, "volume": 1500000}
        ]
        collector.baostock_collector = mock_baostock_collector

        # 2次成功，1次失败
        mock_baostock_collector.get_stock_history.side_effect = [
            [{"symbol": "000001.SZ", "open": 10.50, "high": 11.20, "low": 10.30, "close": 11.00, "volume": 1500000}],
            [{"symbol": "000002.SZ", "open": 20.00, "high": 21.00, "low": 19.50, "close": 20.50, "volume": 2000000}],
            DataSourceError("Failed")
        ]

        await collector.collect_batch(
            symbols=["000001.SZ", "000002.SZ", "000003.SZ"],
            trade_date=date(2026, 2, 13)
        )

        stats = collector.get_stats()

        assert stats["total_processed"] == 3
        assert stats["total_success"] == 2
        assert stats["total_failed"] == 1
        assert stats["success_rate"] == 2/3


class TestDailyHistoryCollectorEdgeCases:
    """DailyHistoryCollector 边界情况测试"""

    @pytest.fixture
    def collector(self):
        return DailyHistoryCollector()

    @pytest.fixture
    def mock_baostock_collector(self):
        """模拟 Baostock 采集器"""
        mock = AsyncMock()
        mock.get_stock_history = AsyncMock(return_value=[])
        return mock

    @pytest.mark.asyncio
    async def test_empty_symbol_list(self, collector):
        """测试空股票列表"""
        results = await collector.collect_all_stocks(
            symbols=[],
            trade_date=date(2026, 2, 13)
        )

        assert results == []

    @pytest.mark.asyncio
    async def test_weekend_trade_date(self, collector, mock_baostock_collector):
        """测试周末交易日"""
        collector.baostock_collector = mock_baostock_collector
        mock_baostock_collector.get_stock_history.return_value = []

        # 2026-02-14 是周六
        result = await collector.collect_single_stock(
            symbol="000001.SZ",
            trade_date=date(2026, 2, 14)
        )

        # 周末无交易数据，应返回失败
        assert result.success is False

    def test_verify_data_extreme_values(self, collector):
        """测试极端价格值"""
        extreme_data = {
            "symbol": "000001.SZ",
            "open": 999999.99,
            "high": 999999.99,
            "low": 999999.99,
            "close": 999999.99,
            "volume": 9999999999
        }

        is_valid, error = collector.verify_data_integrity(extreme_data)

        assert is_valid is True  # 极端值但逻辑正确，应通过

    def test_verify_data_same_prices(self, collector):
        """测试价格相同（一字板）"""
        same_price_data = {
            "symbol": "000001.SZ",
            "open": 10.50,
            "high": 10.50,
            "low": 10.50,
            "close": 10.50,
            "volume": 1500000
        }

        is_valid, error = collector.verify_data_integrity(same_price_data)

        assert is_valid is True  # 一字板是有效数据


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
