"""
Relay Collector - 接力式采集器

实现4源接力式混合采集方案的核心逻辑：
1. 分段分配：将5000只股票分配给4个数据源，带15%重叠
2. 并行采集：第一轮并行采集
3. 失败识别：识别采集失败的股票
4. 接力补偿：用其他源补偿失败的股票
5. 结果合并：合并所有采集结果

设计目标：
- 保证99%全量覆盖率
- 将系统冗余从200%降至125%
- 宁可降频，也不减覆盖
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional, Set
from datetime import datetime

from .base import DataSource, DataSourceError

logger = logging.getLogger(__name__)


class RelayCollector:
    """
    接力式采集器

    职责：
    1. 分段分配股票给各数据源（带重叠）
    2. 并行执行第一轮采集
    3. 识别失败股票
    4. 调度补偿采集
    5. 合并最终结果
    """

    def __init__(self):
        """初始化接力采集器"""
        self.sources: Dict[str, DataSource] = {}

        # 数据源能力配置
        self.source_configs = {
            "sina": {"batch_size": 50, "interval": 1.0, "success_rate": 0.96},
            "tencent": {"batch_size": 50, "interval": 1.0, "success_rate": 0.92},
            "eastmoney": {"batch_size": 20, "interval": 2.0, "success_rate": 1.0},
            "baostock": {"batch_size": 20, "interval": 5.0, "success_rate": 0.67}
        }

        # 分配权重（35% + 35% + 30% + 20% = 120%，20%重叠）
        self.assignment_weights = {
            "sina": 0.35,
            "tencent": 0.35,
            "eastmoney": 0.30,
            "baostock": 0.20
        }

        logger.info("RelayCollector initialized")

    def register_source(self, name: str, source: DataSource):
        """注册数据源"""
        self.sources[name] = source
        logger.debug(f"Registered data source: {name}")

    def assign_with_overlap(self, all_stocks: List[str]) -> Dict[str, List[str]]:
        """
        分段分配策略：带15%重叠

        目标：
        - 每只至少被1个源采集
        - 理想情况下被1.2个源覆盖（20%重叠）

        分配方案：
        - 新浪：0-40%（2000只）
        - 腾讯：30-70%（2000只），与前重叠10%
        - 东财：60-85%（1250只），与前重叠10%
        - Baostock：80-100% + 0-10%（1000只 + 500只回绕）

        Args:
            all_stocks: 全部股票列表

        Returns:
            各数据源的股票分配字典
        """
        if not all_stocks:
            return {}

        n = len(all_stocks)

        # 计算各源分配范围（带15%重叠）
        # 目标：125%总分配 = 100%覆盖 + 25%重叠
        # 分配方案：
        # - 新浪：0-35%（35%）
        # - 腾讯：30-65%（35%），与前重叠5%
        # - 东财：60-90%（30%），与前重叠5%
        # - Baostock：85-100% + 0-5%（20%回绕），与前重叠5%
        assignments = {
            "sina": all_stocks[0:int(n * 0.35)],
            "tencent": all_stocks[int(n * 0.30):int(n * 0.65)],
            "eastmoney": all_stocks[int(n * 0.60):int(n * 0.90)],
            "baostock": all_stocks[int(n * 0.85):] + all_stocks[:int(n * 0.05)]
        }

        # 记录分配统计
        total_assigned = sum(len(stocks) for stocks in assignments.values())
        overlap_ratio = (total_assigned - n) / n

        logger.info(f"Stock assignment completed: {n} stocks, "
                   f"total assignments: {total_assigned}, "
                   f"overlap ratio: {overlap_ratio:.1%}")

        return assignments

    async def collect_with_relay(self, stocks: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        接力式采集主流程

        流程：
        1. 分段分配
        2. 第一轮并行采集
        3. 识别失败
        4. 接力补偿
        5. 合并结果

        Args:
            stocks: 需要采集的股票列表

        Returns:
            采集结果字典 {symbol: quote_data}
        """
        if not stocks:
            return {}

        logger.info(f"Starting relay collection for {len(stocks)} stocks")
        start_time = datetime.now()

        # 第一步：分段分配
        assignments = self.assign_with_overlap(stocks)

        # 第二步：第一轮并行采集
        round1_results = await self._parallel_collect(assignments)

        # 第三步：识别失败
        failed_stocks = self.identify_failures(round1_results, stocks)

        # 第四步：接力补偿（如果有失败）
        if failed_stocks:
            logger.warning(f"Round 1: {len(failed_stocks)} stocks failed, "
                          f"starting compensation")
            compensation_results = await self.compensation_collect(failed_stocks)
        else:
            compensation_results = {}

        # 第五步：合并结果
        final_results = self._merge_results(round1_results, compensation_results)

        # 统计
        elapsed = (datetime.now() - start_time).total_seconds()
        coverage = self.calculate_coverage(final_results, stocks)

        logger.info(f"Relay collection completed: {len(final_results)}/{len(stocks)} "
                   f"({coverage:.1%} coverage) in {elapsed:.2f}s")

        return final_results

    async def _parallel_collect(self, assignments: Dict[str, List[str]]) -> Dict[str, Dict[str, Any]]:
        """
        并行采集各段

        Args:
            assignments: 各源的股票分配

        Returns:
            采集结果字典
        """
        tasks = []
        source_names = []

        for source_name, symbols in assignments.items():
            if not symbols or source_name not in self.sources:
                continue

            source = self.sources[source_name]
            task = self._collect_from_source_safe(source_name, source, symbols)
            tasks.append(task)
            source_names.append(source_name)

        if not tasks:
            return {}

        # 并行执行所有采集任务
        results_list = await asyncio.gather(*tasks, return_exceptions=True)

        # 合并结果
        all_results = {}
        for source_name, result in zip(source_names, results_list):
            if isinstance(result, Exception):
                logger.error(f"Source {source_name} failed: {result}")
                continue
            if result:
                all_results.update(result)
                logger.debug(f"Source {source_name} collected {len(result)} quotes")

        return all_results

    async def _collect_from_source_safe(self, source_name: str, source: DataSource,
                                        symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        安全地从单个源采集（带异常处理）

        Args:
            source_name: 数据源名称
            source: 数据源实例
            symbols: 股票列表

        Returns:
            采集结果
        """
        try:
            # 分批采集（避免单批次过大）
            batches = self.chunk(symbols, 50)
            all_quotes = {}

            for batch in batches:
                quotes = await source.get_batch_quotes(batch)
                if quotes:
                    all_quotes.update(quotes)

                # 遵守速率限制
                config = self.source_configs.get(source_name, {})
                interval = config.get("interval", 1.0)
                await asyncio.sleep(interval)

            return all_quotes

        except Exception as e:
            logger.warning(f"Source {source_name} failed to collect: {e}")
            return {}

    def identify_failures(self, results: Dict[str, Any], expected_stocks: List[str]) -> List[str]:
        """
        识别采集失败的股票

        Args:
            results: 采集结果
            expected_stocks: 期望采集的股票列表

        Returns:
            失败的股票列表
        """
        expected_set = set(expected_stocks)
        success_set = set()

        for symbol, data in results.items():
            # 数据有效：非None且包含价格
            if data is not None and isinstance(data, dict) and data.get("price", 0) > 0:
                success_set.add(symbol)

        failed = list(expected_set - success_set)

        if failed:
            logger.debug(f"Identified {len(failed)} failed stocks: {failed[:10]}...")

        return failed

    async def compensation_collect(self, failed_stocks: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        接力补偿：用备用源采集失败的股票

        策略：
        1. 优先用速度快的源（新浪、腾讯）
        2. 分批补偿，避免单批次过大
        3. 记录补偿成功率用于后续优化

        Args:
            failed_stocks: 需要补偿的股票列表

        Returns:
            补偿采集结果
        """
        if not failed_stocks:
            return {}

        logger.info(f"Starting compensation collection for {len(failed_stocks)} stocks")

        results = {}
        remaining = failed_stocks[:]

        # 补偿顺序：新浪 → 腾讯 → 东财（跳过Baostock，太慢）
        for source_name in ["sina", "tencent", "eastmoney"]:
            if not remaining or source_name not in self.sources:
                break

            source = self.sources[source_name]
            batch_size = self.source_configs[source_name]["batch_size"]

            # 分批补偿
            batches = self.chunk(remaining, batch_size)
            for batch in batches:
                try:
                    quotes = await source.get_batch_quotes(batch)
                    if quotes:
                        results.update(quotes)
                        # 从remaining中移除成功的
                        remaining = [s for s in remaining if s not in quotes]

                        logger.debug(f"Compensation: {source_name} collected "
                                   f"{len(quotes)} stocks, {len(remaining)} remaining")

                    # 遵守速率限制
                    await asyncio.sleep(self.source_configs[source_name]["interval"])

                except Exception as e:
                    logger.warning(f"Compensation failed for {source_name}: {e}")
                    continue

        if remaining:
            logger.warning(f"Compensation completed but {len(remaining)} stocks still failed")

        return results

    def calculate_coverage(self, results: Dict[str, Any], total_stocks: List[str]) -> float:
        """
        计算覆盖率

        Args:
            results: 采集结果
            total_stocks: 全部股票列表

        Returns:
            覆盖率（0.0-1.0）
        """
        if not total_stocks:
            return 0.0

        # 统计有效结果
        valid_count = 0
        for symbol, data in results.items():
            if data is not None and isinstance(data, dict) and data.get("price", 0) > 0:
                valid_count += 1

        return valid_count / len(total_stocks)

    def _merge_results(self, *result_dicts: Dict) -> Dict[str, Dict[str, Any]]:
        """
        合并多个结果字典

        策略：后覆盖前（补偿结果覆盖第一轮结果中的None）

        Args:
            *result_dicts: 多个结果字典

        Returns:
            合并后的结果
        """
        merged = {}

        for results in result_dicts:
            if not results:
                continue

            for symbol, data in results.items():
                # 只合并有效数据，或覆盖None值
                if data is not None and isinstance(data, dict):
                    if symbol not in merged or merged[symbol] is None:
                        merged[symbol] = data

        return merged

    @staticmethod
    def chunk(stocks: List[str], size: int) -> List[List[str]]:
        """
        将股票列表分块

        Args:
            stocks: 股票列表
            size: 每块大小

        Returns:
            分块后的列表
        """
        if not stocks or size <= 0:
            return []

        return [stocks[i:i + size] for i in range(0, len(stocks), size)]

    def get_stats(self) -> Dict[str, Any]:
        """获取采集器统计信息"""
        return {
            "registered_sources": list(self.sources.keys()),
            "assignment_weights": self.assignment_weights,
            "source_configs": self.source_configs
        }
