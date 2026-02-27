"""
Tests for RelayCollector - 接力式采集器单元测试

TDD开发流程：
1. 编写测试（Red）
2. 实现代码（Green）
3. 重构优化（Refactor）

测试覆盖：
- 分段分配策略（带重叠）
- 接力补偿机制
- 覆盖率计算
- 失败处理
"""

import pytest
import asyncio
from typing import List, Dict, Any
from unittest.mock import Mock, AsyncMock, patch

from data_service.collectors.relay_collector import RelayCollector
from data_service.collectors.base import DataSourceError


class TestRelayCollector:
    """接力式采集器测试类"""

    @pytest.fixture
    def relay_collector(self):
        """创建RelayCollector实例"""
        return RelayCollector()

    @pytest.fixture
    def sample_stocks(self) -> List[str]:
        """测试用股票列表（500只简化版）"""
        stocks = []
        # 沪市股票
        for i in range(600000, 600250):
            stocks.append(f"{i}.SH")
        # 深市股票
        for i in range(1, 251):
            stocks.append(f"{i:06d}.SZ")
        return stocks

    # ========== 测试：分段分配策略 ==========

    def test_assign_with_overlap_basic(self, relay_collector, sample_stocks):
        """测试基础分段分配功能"""
        assignments = relay_collector.assign_with_overlap(sample_stocks)

        # 验证4个数据源都有分配
        assert "sina" in assignments
        assert "tencent" in assignments
        assert "eastmoney" in assignments
        assert "baostock" in assignments

        # 验证所有股票都被分配
        all_assigned = set()
        for source_stocks in assignments.values():
            all_assigned.update(source_stocks)

        assert len(all_assigned) == len(sample_stocks)
        assert all_assigned == set(sample_stocks)

    def test_assign_with_overlap_ratio(self, relay_collector, sample_stocks):
        """测试重叠度约为15%"""
        assignments = relay_collector.assign_with_overlap(sample_stocks)

        # 计算总分配量
        total_assigned = sum(len(stocks) for stocks in assignments.values())

        # 计算重叠度
        overlap_ratio = (total_assigned - len(sample_stocks)) / len(sample_stocks)

        # 验证重叠度在15%-25%之间（目标20%）
        assert 0.15 <= overlap_ratio <= 0.25, f"重叠度 {overlap_ratio:.2%} 不在目标范围内"

    def test_assign_with_overlap_distribution(self, relay_collector, sample_stocks):
        """测试分配比例符合预期"""
        assignments = relay_collector.assign_with_overlap(sample_stocks)

        n = len(sample_stocks)

        # 验证各源分配比例（允许±5%误差）
        sina_ratio = len(assignments["sina"]) / n
        tencent_ratio = len(assignments["tencent"]) / n
        eastmoney_ratio = len(assignments["eastmoney"]) / n
        baostock_ratio = len(assignments["baostock"]) / n

        assert 0.30 <= sina_ratio <= 0.40, f"新浪分配比例 {sina_ratio:.2%} 异常"
        assert 0.30 <= tencent_ratio <= 0.40, f"腾讯分配比例 {tencent_ratio:.2%} 异常"
        assert 0.25 <= eastmoney_ratio <= 0.35, f"东财分配比例 {eastmoney_ratio:.2%} 异常"
        assert 0.15 <= baostock_ratio <= 0.25, f"Baostock分配比例 {baostock_ratio:.2%} 异常"

    def test_assign_with_overlap_continuity(self, relay_collector, sample_stocks):
        """测试分配的连续性（便于批量采集）"""
        assignments = relay_collector.assign_with_overlap(sample_stocks)

        for source, stocks in assignments.items():
            # 验证每个源的分配是连续的（除了Baostock的回绕）
            if source != "baostock":
                indices = [sample_stocks.index(s) for s in stocks]
                # 检查是否连续（允许因为重叠导致的不完全连续）
                sorted_indices = sorted(indices)
                gaps = sum(1 for i in range(len(sorted_indices)-1)
                          if sorted_indices[i+1] - sorted_indices[i] > 1)
                # 最多允许2个断点（因为重叠）
                assert gaps <= 2, f"{source} 分配不连续，有 {gaps} 个断点"

    # ========== 测试：接力补偿机制 ==========

    @pytest.mark.asyncio
    async def test_compensation_collect_basic(self, relay_collector):
        """测试基础接力补偿功能"""
        # Mock数据源
        mock_sina = Mock()
        mock_sina.get_batch_quotes = AsyncMock(return_value={
            "000001.SZ": {"symbol": "000001.SZ", "price": 10.5},
            "000002.SZ": {"symbol": "000002.SZ", "price": 20.3}
        })

        relay_collector.sources = {"sina": mock_sina}

        failed_stocks = ["000001.SZ", "000002.SZ"]
        results = await relay_collector.compensation_collect(failed_stocks)

        # 验证补偿成功
        assert len(results) == 2
        assert "000001.SZ" in results
        assert "000002.SZ" in results

    @pytest.mark.asyncio
    async def test_compensation_collect_partial_failure(self, relay_collector):
        """测试部分失败的接力补偿"""
        # Mock：新浪成功，腾讯失败
        mock_sina = Mock()
        mock_sina.get_batch_quotes = AsyncMock(return_value={
            "000001.SZ": {"symbol": "000001.SZ", "price": 10.5}
        })

        mock_tencent = Mock()
        mock_tencent.get_batch_quotes = AsyncMock(side_effect=DataSourceError("Failed"))

        relay_collector.sources = {
            "sina": mock_sina,
            "tencent": mock_tencent
        }

        failed_stocks = ["000001.SZ", "000002.SZ"]
        results = await relay_collector.compensation_collect(failed_stocks)

        # 验证部分补偿成功
        assert "000001.SZ" in results
        assert results["000001.SZ"]["price"] == 10.5

    @pytest.mark.asyncio
    async def test_compensation_collect_all_sources_fail(self, relay_collector):
        """测试所有补偿源都失败的情况"""
        # Mock所有源都失败
        for name in ["sina", "tencent", "eastmoney"]:
            mock = Mock()
            mock.get_batch_quotes = AsyncMock(side_effect=DataSourceError("Failed"))
            relay_collector.sources[name] = mock

        failed_stocks = ["000001.SZ", "000002.SZ"]
        results = await relay_collector.compensation_collect(failed_stocks)

        # 验证返回空结果（不抛出异常）
        assert results == {}

    # ========== 测试：覆盖率计算 ==========

    def test_calculate_coverage_full(self, relay_collector, sample_stocks):
        """测试100%覆盖率计算"""
        results = {stock: {"symbol": stock, "price": 10.0} for stock in sample_stocks}

        coverage = relay_collector.calculate_coverage(results, sample_stocks)

        assert coverage == 1.0

    def test_calculate_coverage_partial(self, relay_collector, sample_stocks):
        """测试部分覆盖率计算"""
        # 只有80%的股票有数据
        results = {stock: {"symbol": stock, "price": 10.0}
                  for stock in sample_stocks[:400]}

        coverage = relay_collector.calculate_coverage(results, sample_stocks)

        assert coverage == 0.8

    def test_calculate_coverage_empty(self, relay_collector, sample_stocks):
        """测试空结果覆盖率"""
        results = {}

        coverage = relay_collector.calculate_coverage(results, sample_stocks)

        assert coverage == 0.0

    def test_calculate_coverage_with_none(self, relay_collector, sample_stocks):
        """测试包含None值的覆盖率计算"""
        results = {stock: None for stock in sample_stocks[:100]}
        results.update({stock: {"symbol": stock, "price": 10.0}
                       for stock in sample_stocks[100:400]})

        coverage = relay_collector.calculate_coverage(results, sample_stocks)

        assert coverage == 0.6  # 300/500

    # ========== 测试：识别失败股票 ==========

    def test_identify_failures_basic(self, relay_collector, sample_stocks):
        """测试基础失败识别"""
        results = {
            "000001.SZ": {"symbol": "000001.SZ", "price": 10.5},
            "000002.SZ": None,
            "000003.SZ": {"symbol": "000003.SZ", "price": 15.0},
            "000004.SZ": None
        }

        failed = relay_collector.identify_failures(results, list(results.keys()))

        assert len(failed) == 2
        assert "000002.SZ" in failed
        assert "000004.SZ" in failed

    def test_identify_failures_empty_result(self, relay_collector):
        """测试空结果识别"""
        stocks = ["000001.SZ", "000002.SZ"]
        results = {}

        failed = relay_collector.identify_failures(results, stocks)

        assert len(failed) == 2
        assert set(failed) == set(stocks)

    def test_identify_failures_no_failures(self, relay_collector, sample_stocks):
        """测试无失败情况"""
        results = {stock: {"symbol": stock, "price": 10.0}
                  for stock in sample_stocks[:10]}

        failed = relay_collector.identify_failures(results, sample_stocks[:10])

        assert len(failed) == 0

    # ========== 测试：批量分块 ==========

    def test_chunk_basic(self, relay_collector):
        """测试基础分块功能"""
        stocks = [f"{i:06d}.SZ" for i in range(1, 101)]

        chunks = relay_collector.chunk(stocks, 20)

        assert len(chunks) == 5
        assert len(chunks[0]) == 20
        assert len(chunks[-1]) == 20

    def test_chunk_with_remainder(self, relay_collector):
        """测试有余数的分块"""
        stocks = [f"{i:06d}.SZ" for i in range(1, 96)]

        chunks = relay_collector.chunk(stocks, 20)

        assert len(chunks) == 5
        assert len(chunks[0]) == 20
        assert len(chunks[-1]) == 15  # 余数

    def test_chunk_empty(self, relay_collector):
        """测试空列表分块"""
        chunks = relay_collector.chunk([], 20)

        assert chunks == []

    # ========== 测试：完整接力采集流程 ==========

    @pytest.mark.asyncio
    async def test_collect_with_relay_success(self, relay_collector, sample_stocks):
        """测试完整接力采集成功流程"""
        # Mock所有源都成功
        for name in ["sina", "tencent", "eastmoney", "baostock"]:
            mock = Mock()
            # 每个源返回自己分配的股票
            mock.get_batch_quotes = AsyncMock(side_effect=lambda stocks: {
                s: {"symbol": s, "price": 10.0} for s in stocks
            })
            relay_collector.sources[name] = mock

        results = await relay_collector.collect_with_relay(sample_stocks)

        # 验证覆盖率100%
        coverage = len(results) / len(sample_stocks)
        assert coverage == 1.0

    @pytest.mark.asyncio
    async def test_collect_with_relay_with_compensation(self, relay_collector, sample_stocks):
        """测试需要接力补偿的采集流程"""
        call_count = {"sina": 0, "tencent": 0}

        # Mock：新浪部分失败，腾讯用于补偿
        mock_sina = Mock()
        async def sina_side_effect(stocks):
            call_count["sina"] += 1
            # 返回80%成功
            return {s: {"symbol": s, "price": 10.0}
                   for s in stocks[:int(len(stocks)*0.8)]}

        mock_sina.get_batch_quotes = AsyncMock(side_effect=sina_side_effect)

        mock_tencent = Mock()
        async def tencent_side_effect(stocks):
            call_count["tencent"] += 1
            return {s: {"symbol": s, "price": 10.0} for s in stocks}

        mock_tencent.get_batch_quotes = AsyncMock(side_effect=tencent_side_effect)

        relay_collector.sources = {
            "sina": mock_sina,
            "tencent": mock_tencent,
            "eastmoney": Mock(),
            "baostock": Mock()
        }
        relay_collector.sources["eastmoney"].get_batch_quotes = AsyncMock(return_value={})
        relay_collector.sources["baostock"].get_batch_quotes = AsyncMock(return_value={})

        results = await relay_collector.collect_with_relay(sample_stocks)

        # 验证腾讯被调用了两次（第一轮+补偿）
        assert call_count["tencent"] >= 1

        # 验证最终覆盖率
        coverage = len(results) / len(sample_stocks)
        assert coverage >= 0.95  # 目标95%+

    @pytest.mark.asyncio
    async def test_collect_with_relay_all_fail(self, relay_collector, sample_stocks):
        """测试所有源都失败的极端情况"""
        for name in ["sina", "tencent", "eastmoney", "baostock"]:
            mock = Mock()
            mock.get_batch_quotes = AsyncMock(side_effect=DataSourceError("Failed"))
            relay_collector.sources[name] = mock

        results = await relay_collector.collect_with_relay(sample_stocks)

        # 验证返回空结果但不抛出异常
        assert results == {}


class TestRelayCollectorPerformance:
    """接力式采集器性能测试"""

    @pytest.fixture
    def relay_collector(self):
        return RelayCollector()

    def test_assign_performance_5000_stocks(self, relay_collector):
        """测试5000只股票分配性能"""
        stocks = [f"{i:06d}.SZ" for i in range(1, 2501)]
        stocks.extend([f"{i}.SH" for i in range(600000, 602500)])

        import time
        start = time.time()

        assignments = relay_collector.assign_with_overlap(stocks)

        elapsed = time.time() - start

        # 分配应在10ms内完成
        assert elapsed < 0.01, f"分配耗时 {elapsed*1000:.2f}ms，超过10ms"

        # 验证分配正确
        all_assigned = set()
        for source_stocks in assignments.values():
            all_assigned.update(source_stocks)
        assert len(all_assigned) == 5000


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
