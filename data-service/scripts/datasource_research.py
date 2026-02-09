#!/usr/bin/env python3
"""
数据源特征采集研究脚本
============================

用于在交易日开盘时间对6个数据源进行综合测试，采集以下特征：
1. 延迟特性（响应时间、数据新鲜度）
2. 可靠性（成功率、错误类型）
3. 限制条件（频率限制、批量限制）
4. 数据质量（字段完整性、准确性）

运行方式:
    python datasource_research.py --duration 300 --output ./research_results

参数:
    --duration: 测试持续时间（秒），默认300秒（5分钟）
    --interval: 采样间隔（秒），默认10秒
    --symbols: 测试股票代码，默认使用预设列表
    --output: 输出目录

作者: Claude Code
日期: 2026-02-09
"""

import asyncio
import json
import logging
import argparse
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from pathlib import Path
import statistics

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class DataSourceMetrics:
    """单个数据源的采集指标"""
    source_name: str
    timestamp: str

    # 延迟指标
    response_time_ms: float
    data_freshness_seconds: float  # 数据时间戳与当前时间的差

    # 可靠性指标
    success: bool
    error_type: Optional[str]
    error_message: Optional[str]

    # 数据质量指标
    fields_present: List[str]
    fields_missing: List[str]
    price_valid: bool
    volume_valid: bool

    # 原始数据样本（用于验证一致性）
    price: Optional[float]
    volume: Optional[int]
    change_percent: Optional[float]


@dataclass
class TestResult:
    """测试结果汇总"""
    source_name: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    success_rate: float

    # 延迟统计
    avg_response_time_ms: float
    min_response_time_ms: float
    max_response_time_ms: float
    p95_response_time_ms: float
    p99_response_time_ms: float

    # 数据新鲜度
    avg_freshness_seconds: float
    max_freshness_seconds: float

    # 错误统计
    error_types: Dict[str, int]

    # 数据质量
    avg_field_completeness: float
    price_accuracy_score: float


class DataSourceResearcher:
    """数据源特征研究员"""

    # 测试股票列表（覆盖不同市场、不同市值）
    DEFAULT_TEST_SYMBOLS = [
        "000001.SZ",  # 平安银行 - 深市主板
        "000002.SZ",  # 万科A - 深市主板
        "000333.SZ",  # 美的集团 - 深市主板大盘
        "002415.SZ",  # 海康威视 - 深市中小板
        "300750.SZ",  # 宁德时代 - 深市创业板
        "600000.SH",  # 浦发银行 - 沪市主板
        "600036.SH",  # 招商银行 - 沪市主板大盘
        "600519.SH",  # 贵州茅台 - 沪市主板高价
        "688981.SH",  # 中芯国际 - 沪市科创板
        "601318.SH",  # 中国平安 - 沪市主板金融
    ]

    def __init__(self, duration_seconds: int = 300, interval_seconds: int = 10):
        self.duration = duration_seconds
        self.interval = interval_seconds
        self.symbols = self.DEFAULT_TEST_SYMBOLS
        self.results: Dict[str, List[DataSourceMetrics]] = {
            "sina": [],
            "tencent": [],
            "eastmoney": [],
            "akshare": [],
            "baostock": [],
            "tushare": []
        }
        self.start_time: Optional[datetime] = None

    async def run_research(self, output_dir: str):
        """运行完整的研究测试"""
        logger.info(f"开始数据源特征研究，持续时间: {self.duration}秒")
        logger.info(f"采样间隔: {self.interval}秒")
        logger.info(f"测试股票数: {len(self.symbols)}")

        self.start_time = datetime.now()
        end_time = self.start_time + timedelta(seconds=self.duration)

        iteration = 0

        while datetime.now() < end_time:
            iteration += 1
            logger.info(f"\n=== 第 {iteration} 轮采样 ===")

            # 对每只股票测试所有数据源
            for symbol in self.symbols:
                await self._test_symbol(symbol)
                # 数据源之间添加小延迟，避免同时请求
                await asyncio.sleep(0.5)

            # 等待下一轮
            elapsed = (datetime.now() - self.start_time).total_seconds()
            remaining = self.duration - elapsed

            if remaining > 0 and datetime.now() + timedelta(seconds=self.interval) < end_time:
                logger.info(f"等待下一轮采样... (剩余时间: {remaining:.0f}秒)")
                await asyncio.sleep(self.interval)

        # 生成报告
        await self._generate_report(output_dir)

    async def _test_symbol(self, symbol: str):
        """测试单个股票在所有数据源的表现"""
        # 这里我们需要导入实际的数据源类
        # 为了脚本独立性，这里使用模拟实现
        # 实际运行时应该导入: from data_service.collectors.xxx import XxxCollector

        tasks = [
            self._test_sina(symbol),
            self._test_tencent(symbol),
            self._test_eastmoney(symbol),
            self._test_akshare(symbol),
            self._test_baostock(symbol),
            self._test_tushare(symbol),
        ]

        await asyncio.gather(*tasks, return_exceptions=True)

    async def _test_sina(self, symbol: str):
        """测试新浪数据源"""
        await self._test_source("sina", symbol, self._fetch_sina)

    async def _test_tencent(self, symbol: str):
        """测试腾讯数据源"""
        await self._test_source("tencent", symbol, self._fetch_tencent)

    async def _test_eastmoney(self, symbol: str):
        """测试东方财富数据源"""
        await self._test_source("eastmoney", symbol, self._fetch_eastmoney)

    async def _test_akshare(self, symbol: str):
        """测试AkShare数据源"""
        await self._test_source("akshare", symbol, self._fetch_akshare)

    async def _test_baostock(self, symbol: str):
        """测试Baostock数据源"""
        await self._test_source("baostock", symbol, self._fetch_baostock)

    async def _test_tushare(self, symbol: str):
        """测试Tushare数据源"""
        await self._test_source("tushare", symbol, self._fetch_tushare)

    async def _test_source(self, source_name: str, symbol: str, fetch_func):
        """通用数据源测试方法"""
        start_time = time.time()

        try:
            # 设置超时
            data = await asyncio.wait_for(fetch_func(symbol), timeout=10.0)

            response_time = (time.time() - start_time) * 1000  # ms

            # 计算数据新鲜度
            data_timestamp = data.get("timestamp")
            if data_timestamp:
                if isinstance(data_timestamp, str):
                    data_timestamp = datetime.fromisoformat(data_timestamp)
                freshness = (datetime.now() - data_timestamp).total_seconds()
            else:
                freshness = 0

            # 检查字段完整性
            expected_fields = ["symbol", "name", "price", "open", "high", "low", "volume", "change_percent"]
            present_fields = [f for f in expected_fields if f in data and data[f] is not None]
            missing_fields = [f for f in expected_fields if f not in data or data[f] is None]

            # 验证数据有效性
            price_valid = data.get("price", 0) > 0
            volume_valid = data.get("volume", 0) > 0

            metric = DataSourceMetrics(
                source_name=source_name,
                timestamp=datetime.now().isoformat(),
                response_time_ms=response_time,
                data_freshness_seconds=freshness,
                success=True,
                error_type=None,
                error_message=None,
                fields_present=present_fields,
                fields_missing=missing_fields,
                price_valid=price_valid,
                volume_valid=volume_valid,
                price=data.get("price"),
                volume=data.get("volume"),
                change_percent=data.get("change_percent")
            )

        except asyncio.TimeoutError:
            metric = self._create_error_metric(source_name, "TIMEOUT", "Request timeout after 10s")
        except Exception as e:
            metric = self._create_error_metric(source_name, type(e).__name__, str(e))

        self.results[source_name].append(metric)

    def _create_error_metric(self, source_name: str, error_type: str, error_message: str) -> DataSourceMetrics:
        """创建错误指标"""
        return DataSourceMetrics(
            source_name=source_name,
            timestamp=datetime.now().isoformat(),
            response_time_ms=0,
            data_freshness_seconds=0,
            success=False,
            error_type=error_type,
            error_message=error_message,
            fields_present=[],
            fields_missing=[],
            price_valid=False,
            volume_valid=False,
            price=None,
            volume=None,
            change_percent=None
        )

    # ============ 实际数据获取方法（需要根据实际情况实现） ============

    async def _fetch_sina(self, symbol: str) -> Dict[str, Any]:
        """从新浪获取数据"""
        # TODO: 实现实际的新浪数据获取
        # from data_service.collectors.sina import SinaCollector
        # collector = SinaCollector()
        # return await collector.get_stock_quote(symbol)
        raise NotImplementedError("需要实现实际的数据获取逻辑")

    async def _fetch_tencent(self, symbol: str) -> Dict[str, Any]:
        """从腾讯获取数据"""
        raise NotImplementedError("需要实现实际的数据获取逻辑")

    async def _fetch_eastmoney(self, symbol: str) -> Dict[str, Any]:
        """从东方财富获取数据"""
        raise NotImplementedError("需要实现实际的数据获取逻辑")

    async def _fetch_akshare(self, symbol: str) -> Dict[str, Any]:
        """从AkShare获取数据"""
        raise NotImplementedError("需要实现实际的数据获取逻辑")

    async def _fetch_baostock(self, symbol: str) -> Dict[str, Any]:
        """从Baostock获取数据"""
        raise NotImplementedError("需要实现实际的数据获取逻辑")

    async def _fetch_tushare(self, symbol: str) -> Dict[str, Any]:
        """从Tushare获取数据"""
        raise NotImplementedError("需要实现实际的数据获取逻辑")

    # ============ 报告生成方法 ============

    async def _generate_report(self, output_dir: str):
        """生成研究报告"""
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # 生成详细数据
        raw_data_file = output_path / f"research_raw_{timestamp}.json"
        with open(raw_data_file, 'w', encoding='utf-8') as f:
            json.dump({
                source: [asdict(m) for m in metrics]
                for source, metrics in self.results.items()
            }, f, ensure_ascii=False, indent=2)

        logger.info(f"原始数据已保存: {raw_data_file}")

        # 生成汇总报告
        summary = self._generate_summary()
        summary_file = output_path / f"research_summary_{timestamp}.json"
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

        logger.info(f"汇总报告已保存: {summary_file}")

        # 打印控制台报告
        self._print_console_report(summary)

    def _generate_summary(self) -> Dict[str, Any]:
        """生成汇总统计"""
        summary = {
            "test_info": {
                "start_time": self.start_time.isoformat() if self.start_time else None,
                "duration_seconds": self.duration,
                "interval_seconds": self.interval,
                "symbols_tested": self.symbols,
                "total_samples": sum(len(m) for m in self.results.values())
            },
            "source_analysis": {}
        }

        for source_name, metrics in self.results.items():
            if not metrics:
                continue

            successful = [m for m in metrics if m.success]
            failed = [m for m in metrics if not m.success]

            # 延迟统计
            response_times = [m.response_time_ms for m in successful]
            freshness_values = [m.data_freshness_seconds for m in successful]

            # 错误统计
            error_types = {}
            for m in failed:
                error_types[m.error_type] = error_types.get(m.error_type, 0) + 1

            # 字段完整性
            if successful:
                total_fields = 8  # 期望的字段数
                completeness = [
                    len(m.fields_present) / total_fields
                    for m in successful
                ]
                avg_completeness = statistics.mean(completeness)
            else:
                avg_completeness = 0

            summary["source_analysis"][source_name] = {
                "total_requests": len(metrics),
                "successful_requests": len(successful),
                "failed_requests": len(failed),
                "success_rate": len(successful) / len(metrics) if metrics else 0,

                "latency": {
                    "avg_ms": statistics.mean(response_times) if response_times else 0,
                    "min_ms": min(response_times) if response_times else 0,
                    "max_ms": max(response_times) if response_times else 0,
                    "p95_ms": self._percentile(response_times, 95) if response_times else 0,
                    "p99_ms": self._percentile(response_times, 99) if response_times else 0,
                },

                "freshness": {
                    "avg_seconds": statistics.mean(freshness_values) if freshness_values else 0,
                    "max_seconds": max(freshness_values) if freshness_values else 0,
                },

                "error_types": error_types,

                "data_quality": {
                    "avg_field_completeness": avg_completeness,
                    "price_valid_rate": len([m for m in successful if m.price_valid]) / len(successful) if successful else 0,
                    "volume_valid_rate": len([m for m in successful if m.volume_valid]) / len(successful) if successful else 0,
                }
            }

        return summary

    def _percentile(self, data: List[float], percentile: int) -> float:
        """计算百分位数"""
        sorted_data = sorted(data)
        index = int(len(sorted_data) * percentile / 100)
        return sorted_data[min(index, len(sorted_data) - 1)]

    def _print_console_report(self, summary: Dict[str, Any]):
        """打印控制台报告"""
        print("\n" + "=" * 80)
        print("数据源特征研究报告")
        print("=" * 80)

        info = summary["test_info"]
        print(f"\n测试时间: {info['start_time']}")
        print(f"测试时长: {info['duration_seconds']}秒")
        print(f"采样间隔: {info['interval_seconds']}秒")
        print(f"总样本数: {info['total_samples']}")

        print("\n" + "-" * 80)
        print("各数据源表现:")
        print("-" * 80)

        for source_name, analysis in summary["source_analysis"].items():
            print(f"\n【{source_name.upper()}】")
            print(f"  成功率: {analysis['success_rate']:.2%} ({analysis['successful_requests']}/{analysis['total_requests']})")

            latency = analysis['latency']
            print(f"  响应时间: 平均{latency['avg_ms']:.1f}ms | 最小{latency['min_ms']:.1f}ms | 最大{latency['max_ms']:.1f}ms | P95={latency['p95_ms']:.1f}ms")

            freshness = analysis['freshness']
            print(f"  数据新鲜度: 平均{freshness['avg_seconds']:.1f}秒 | 最大{freshness['max_seconds']:.1f}秒")

            quality = analysis['data_quality']
            print(f"  数据质量: 字段完整度{quality['avg_field_completeness']:.1%} | 价格有效{quality['price_valid_rate']:.1%} | 成交量有效{quality['volume_valid_rate']:.1%}")

            if analysis['error_types']:
                print(f"  错误类型: {analysis['error_types']}")

        print("\n" + "=" * 80)


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="数据源特征采集研究脚本")
    parser.add_argument("--duration", type=int, default=300, help="测试持续时间（秒）")
    parser.add_argument("--interval", type=int, default=10, help="采样间隔（秒）")
    parser.add_argument("--output", type=str, default="./research_results", help="输出目录")
    parser.add_argument("--symbols", type=str, nargs="+", help="测试股票代码列表")

    args = parser.parse_args()

    researcher = DataSourceResearcher(
        duration_seconds=args.duration,
        interval_seconds=args.interval
    )

    if args.symbols:
        researcher.symbols = args.symbols

    try:
        asyncio.run(researcher.run_research(args.output))
    except KeyboardInterrupt:
        logger.info("测试被用户中断")
    except Exception as e:
        logger.error(f"测试出错: {e}")
        raise


if __name__ == "__main__":
    main()
