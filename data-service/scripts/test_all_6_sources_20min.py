#!/usr/bin/env python3
"""
六数据源连续测试脚本 - 20分钟鲁棒性测试

基于v1.1方案，测试全部6种数据源:
1. 新浪财经 (sina)
2. 腾讯财经 (tencent)
3. 东方财富 (eastmoney)
4. AkShare (akshare)
5. Baostock (baostock)
6. Tushare (tushare)

测试目标:
- 验证6源并行采集的可行性
- 测试分层采集策略 (中频层10秒/低频层60秒)
- 评估生产环境鲁棒性
- 确认全量数据采集能力
"""

import asyncio
import sys
import os
import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict
import statistics

# 添加src到路径
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from data_service.collectors.sina import SinaCollector
from data_service.collectors.tencent import TencentCollector
from data_service.collectors.eastmoney import EastMoneyCollector
from data_service.collectors.akshare import AkShareCollector
from data_service.collectors.baostock import BaostockCollector
from data_service.collectors.tushare import TushareCollector

# 测试股票列表 - 分层测试
MEDIUM_FREQ_STOCKS = [  # 中频层 - 300只中的样本
    "000001.SZ",  # 平安银行
    "000002.SZ",  # 万科A
    "000858.SZ",  # 五粮液
    "002594.SZ",  # 比亚迪
    "300750.SZ",  # 宁德时代
    "600036.SH",  # 招商银行
    "600519.SH",  # 贵州茅台
    "601318.SH",  # 中国平安
    "688981.SH",  # 中芯国际
    "000333.SZ",  # 美的集团
]

LOW_FREQ_STOCKS = [  # 低频层 - 补充样本
    "000063.SZ",  # 中兴通讯
    "000538.SZ",  # 云南白药
    "000568.SZ",  # 泸州老窖
    "000651.SZ",  # 格力电器
    "000725.SZ",  # 京东方A
    "000768.SZ",  # 中航西飞
    "000895.SZ",  # 双汇发展
    "002001.SZ",  # 新和成
    "002007.SZ",  # 华兰生物
    "002024.SZ",  # 苏宁易购
]

ALL_TEST_STOCKS = MEDIUM_FREQ_STOCKS + LOW_FREQ_STOCKS

# 全局测试结果
all_test_results = []
source_stats = defaultdict(lambda: {
    "total": 0,
    "success": 0,
    "single_success": 0,
    "batch_success": 0,
    "quotes_count": 0,
    "latencies": [],
    "errors": [],
    "last_error": None
})


def get_market_status():
    """获取当前市场状态"""
    now = datetime.now()
    current_time = now.time()

    pre_market_start = time(9, 15)
    pre_market_end = time(9, 25)
    market_open = time(9, 30)
    morning_close = time(11, 30)
    afternoon_open = time(13, 0)
    market_close = time(15, 0)

    if now.weekday() >= 5:
        return "closed_weekend", "周末休市"
    elif pre_market_start <= current_time < pre_market_end:
        return "pre_market", "集合竞价中 (9:15-9:25)"
    elif pre_market_end <= current_time < market_open:
        return "pre_open", "集合竞价结束，等待开市 (9:25-9:30)"
    elif market_open <= current_time < morning_close:
        return "morning_session", "上午交易时段 (9:30-11:30)"
    elif morning_close <= current_time < afternoon_open:
        return "lunch_break", "午间休市 (11:30-13:00)"
    elif afternoon_open <= current_time < market_close:
        return "afternoon_session", "下午交易时段 (13:00-15:00)"
    else:
        return "closed", "已收盘"


async def test_single_source(collector, source_name, test_index, tier="medium"):
    """测试单个数据源"""
    result = {
        "test_index": test_index,
        "timestamp": datetime.now().isoformat(),
        "source": source_name,
        "tier": tier,
        "success": False,
        "single_quote_success": False,
        "batch_quotes_success": False,
        "quotes_count": 0,
        "latency": 0.0,
        "errors": []
    }

    start_time = datetime.now()

    try:
        async with collector:
            # 测试单只股票 (所有层级)
            try:
                quote = await collector.get_stock_quote("600519.SH")
                result["single_quote_success"] = True
                result["single_quote_name"] = quote.get('name', 'N/A')
                result["single_quote_price"] = quote.get('price', 0)
            except Exception as e:
                result["errors"].append(f"Single: {str(e)}")

            # 测试批量查询 (根据层级选择股票数量)
            batch_size = 5 if tier == "medium" else 10
            batch_symbols = ALL_TEST_STOCKS[:batch_size]

            try:
                batch_quotes = await collector.get_batch_quotes(batch_symbols)
                result["batch_quotes_success"] = True
                result["quotes_count"] = len(batch_quotes)
                if batch_quotes:
                    result["batch_details"] = {
                        symbol: {
                            "name": quote.get('name', 'N/A'),
                            "price": quote.get('price', 0),
                            "change_percent": quote.get('change_percent', 0)
                        }
                        for symbol, quote in batch_quotes.items()
                    }
            except Exception as e:
                result["errors"].append(f"Batch: {str(e)}")

            # 测试股票信息
            try:
                info = await collector.get_stock_info("000001.SZ")
                result["info_success"] = True
            except Exception as e:
                result["errors"].append(f"Info: {str(e)}")

        result["latency"] = (datetime.now() - start_time).total_seconds()
        result["success"] = result["single_quote_success"] or result["batch_quotes_success"]

    except Exception as e:
        result["errors"].append(f"General: {str(e)}")

    # 更新统计
    stats = source_stats[source_name]
    stats["total"] += 1
    stats["latencies"].append(result["latency"])
    if result["success"]:
        stats["success"] += 1
    if result["single_quote_success"]:
        stats["single_success"] += 1
    if result["batch_quotes_success"]:
        stats["batch_success"] += 1
    stats["quotes_count"] += result["quotes_count"]
    if result["errors"]:
        stats["errors"].extend(result["errors"])
        stats["last_error"] = result["errors"][-1]

    return result


async def run_tiered_test(test_index, tier="medium"):
    """运行分层测试"""
    now = datetime.now()
    market_status, market_desc = get_market_status()

    print(f"\n{'='*80}")
    print(f"测试 #{test_index} | {tier.upper()}层 | {now.strftime('%H:%M:%S')} | {market_desc}")
    print(f"{'='*80}")

    # 初始化所有6个数据源
    collectors = [
        (SinaCollector(), "新浪财经", "sina"),
        (TencentCollector(), "腾讯财经", "tencent"),
        (EastMoneyCollector(), "东方财富", "eastmoney"),
        (AkShareCollector(), "AkShare", "akshare"),
        (BaostockCollector(), "Baostock", "baostock"),
        (TushareCollector(), "Tushare", "tushare"),
    ]

    test_results = {
        "test_index": test_index,
        "timestamp": now.isoformat(),
        "tier": tier,
        "market_status": market_status,
        "market_desc": market_desc,
        "sources": []
    }

    # 并行测试所有数据源
    tasks = []
    for collector, name, key in collectors:
        task = test_single_source(collector, name, test_index, tier)
        tasks.append((name, key, task))

    # 等待所有测试完成
    results = await asyncio.gather(*[task for _, _, task in tasks], return_exceptions=True)

    for (name, key, _), result in zip(tasks, results):
        if isinstance(result, Exception):
            print(f"  ✗ {name}: 测试失败 - {str(result)}")
            test_results["sources"].append({
                "source": name,
                "key": key,
                "success": False,
                "errors": [str(result)]
            })
        else:
            status = "✓" if result["success"] else "✗"
            batch_info = f"批量={result['batch_quotes_success']}, 数量={result['quotes_count']}"
            print(f"  {status} {name}: 单股={result['single_quote_success']}, {batch_info}, 耗时={result['latency']:.2f}s")
            test_results["sources"].append(result)

    all_test_results.append(test_results)
    return test_results


def generate_comprehensive_report():
    """生成综合测试报告"""
    print("\n" + "="*80)
    print("六数据源20分钟连续测试报告")
    print("="*80)

    if not all_test_results:
        print("没有测试数据")
        return

    # 基本统计
    total_tests = len(all_test_results)
    duration = (datetime.fromisoformat(all_test_results[-1]["timestamp"]) -
                datetime.fromisoformat(all_test_results[0]["timestamp"]))

    print(f"\n【测试概况】")
    print(f"总测试次数: {total_tests}")
    print(f"测试时长: {duration}")
    print(f"开始时间: {all_test_results[0]['timestamp']}")
    print(f"结束时间: {all_test_results[-1]['timestamp']}")

    # 各数据源统计
    print(f"\n【各数据源表现】")
    print("-" * 80)
    print(f"{'数据源':<12} {'成功率':<10} {'单股成功率':<12} {'批量成功率':<12} {'平均响应':<10} {'P95响应':<10} {'总报价数':<10}")
    print("-" * 80)

    for name, stats in sorted(source_stats.items()):
        if stats["total"] == 0:
            continue

        success_rate = stats["success"] / stats["total"] * 100
        single_rate = stats["single_success"] / stats["total"] * 100
        batch_rate = stats["batch_success"] / stats["total"] * 100
        avg_latency = statistics.mean(stats["latencies"]) if stats["latencies"] else 0
        p95_latency = statistics.quantiles(stats["latencies"], n=20)[18] if len(stats["latencies"]) >= 20 else avg_latency

        print(f"{name:<12} {success_rate:>6.1f}%    {single_rate:>6.1f}%      {batch_rate:>6.1f}%      {avg_latency:>6.2f}s    {p95_latency:>6.2f}s    {stats['quotes_count']:<10}")

    # 鲁棒性评估
    print(f"\n【鲁棒性评估】")
    print("-" * 80)

    robust_sources = 0
    for name, stats in source_stats.items():
        if stats["total"] == 0:
            continue

        success_rate = stats["success"] / stats["total"] * 100
        avg_latency = statistics.mean(stats["latencies"]) if stats["latencies"] else 999

        # 鲁棒性评级
        if success_rate >= 99 and avg_latency < 0.5:
            grade = "A+ (生产就绪)"
            robust_sources += 1
        elif success_rate >= 95 and avg_latency < 1.0:
            grade = "A (可用)"
            robust_sources += 1
        elif success_rate >= 90 and avg_latency < 2.0:
            grade = "B (需优化)"
        elif success_rate >= 80:
            grade = "C (仅备用)"
        else:
            grade = "D (不可用)"

        print(f"  {name}: {grade}")

    print(f"\n  生产就绪数据源: {robust_sources}/6")

    # 分层采集可行性
    print(f"\n【分层采集可行性评估】")
    print("-" * 80)

    # 中频层评估 (需要10秒延迟)
    medium_capable = []
    for name, stats in source_stats.items():
        if stats["total"] == 0:
            continue
        avg_latency = statistics.mean(stats["latencies"]) if stats["latencies"] else 999
        success_rate = stats["success"] / stats["total"] * 100
        if success_rate >= 95 and avg_latency < 0.5:
            medium_capable.append(name)

    print(f"  中频层候选 (10秒延迟): {', '.join(medium_capable) if medium_capable else '无'}")

    # 低频层评估 (需要60秒延迟)
    low_capable = []
    for name, stats in source_stats.items():
        if stats["total"] == 0:
            continue
        success_rate = stats["success"] / stats["total"] * 100
        if success_rate >= 80:
            low_capable.append(name)

    print(f"  低频层候选 (60秒延迟): {', '.join(low_capable) if low_capable else '无'}")

    # 全量数据采集评估
    print(f"\n【全量数据采集评估】")
    print("-" * 80)

    total_stocks = 5000
    batch_sizes = {"新浪财经": 100, "腾讯财经": 150, "东方财富": 50, "AkShare": 200, "Baostock": 100, "Tushare": 50}

    for name, stats in source_stats.items():
        if stats["total"] == 0 or name not in batch_sizes:
            continue

        avg_latency = statistics.mean(stats["latencies"]) if stats["latencies"] else 1.0
        batch_size = batch_sizes[name]
        requests_needed = total_stocks / batch_size
        serial_time = requests_needed * avg_latency

        # 假设6源并行
        parallel_time = serial_time / 6

        print(f"  {name}:")
        print(f"    - 批量大小: {batch_size}只/次")
        print(f"    - 全量请求数: {requests_needed:.0f}次")
        print(f"    - 串行时间: {serial_time:.1f}s")
        print(f"    - 6源并行时间: {parallel_time:.1f}s")
        print(f"    - 10秒目标: {'✓ 可行' if parallel_time <= 10 else '✗ 不可行'}")

    # 时间段分析
    print(f"\n【分时段表现】")
    print("-" * 80)

    period_stats = defaultdict(lambda: defaultdict(lambda: {"total": 0, "success": 0}))

    for test in all_test_results:
        period = test["market_desc"]
        for source in test["sources"]:
            name = source["source"]
            period_stats[period][name]["total"] += 1
            if source.get("success"):
                period_stats[period][name]["success"] += 1

    for period, sources in period_stats.items():
        print(f"\n  {period}:")
        for name, stats in sorted(sources.items()):
            rate = stats["success"] / stats["total"] * 100 if stats["total"] > 0 else 0
            print(f"    {name}: {stats['success']}/{stats['total']} ({rate:.1f}%)")

    # 保存详细结果
    report_file = f"six_sources_test_report_{datetime.now().strftime('%Y%m%d_%H%M')}.json"
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump({
            "test_summary": {
                "total_tests": total_tests,
                "duration_seconds": duration.total_seconds(),
                "start_time": all_test_results[0]['timestamp'],
                "end_time": all_test_results[-1]['timestamp'],
                "test_stocks_count": len(ALL_TEST_STOCKS)
            },
            "sources_summary": {
                name: {
                    "success_rate": stats["success"] / stats["total"] * 100 if stats["total"] > 0 else 0,
                    "single_quote_rate": stats["single_success"] / stats["total"] * 100 if stats["total"] > 0 else 0,
                    "batch_quote_rate": stats["batch_success"] / stats["total"] * 100 if stats["total"] > 0 else 0,
                    "average_latency": statistics.mean(stats["latencies"]) if stats["latencies"] else 0,
                    "p95_latency": statistics.quantiles(stats["latencies"], n=20)[18] if len(stats["latencies"]) >= 20 else 0,
                    "total_quotes": stats["quotes_count"],
                    "total_tests": stats["total"],
                    "error_count": len(stats["errors"]),
                    "last_error": stats["last_error"]
                }
                for name, stats in source_stats.items() if stats["total"] > 0
            },
            "detailed_results": all_test_results
        }, f, ensure_ascii=False, indent=2)

    print(f"\n\n【详细报告】")
    print(f"  已保存: {report_file}")

    # 最终结论
    print(f"\n" + "="*80)
    print("【最终结论】")
    print("="*80)

    if robust_sources >= 3:
        print("✓ 生产环境可用: 至少3个数据源达到生产就绪标准")
    elif robust_sources >= 2:
        print("△ 谨慎可用: 2个数据源可用，建议增加冗余")
    else:
        print("✗ 不可用: 数据源不足，需要修复或增加")

    if len(medium_capable) >= 2:
        print("✓ 中频层可行: 可实现10秒延迟的300只股票采集")
    else:
        print("✗ 中频层不可行: 数据源性能不足")

    if len(low_capable) >= 4:
        print("✓ 低频层可行: 可实现60秒延迟的全量采集")
    else:
        print("△ 低频层需谨慎: 建议增加数据源或延长延迟")

    return report_file


async def continuous_20min_test():
    """20分钟连续测试"""
    test_index = 0
    start_time = datetime.now()
    end_time = start_time + timedelta(minutes=20)

    print("\n" + "="*80)
    print("六数据源20分钟鲁棒性测试")
    print("="*80)
    print(f"开始时间: {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"计划结束: {end_time.strftime('%H:%M:%S')}")
    print(f"测试股票: {len(ALL_TEST_STOCKS)}只 (中频层{len(MEDIUM_FREQ_STOCKS)}只 + 低频层{len(LOW_FREQ_STOCKS)}只)")
    print(f"测试间隔: 10秒 (中频层) / 60秒 (低频层)")
    print(f"数据源: 新浪财经、腾讯财经、东方财富、AkShare、Baostock、Tushare")
    print("="*80)

    last_low_freq_test = 0

    try:
        while datetime.now() < end_time:
            test_index += 1
            current_time = datetime.now()
            elapsed = (current_time - start_time).total_seconds()

            # 中频层测试 (每10秒)
            await run_tiered_test(test_index, tier="medium")

            # 低频层测试 (每60秒)
            if elapsed - last_low_freq_test >= 60:
                test_index += 1
                await run_tiered_test(test_index, tier="low")
                last_low_freq_test = elapsed

            # 计算下次测试时间
            next_test = current_time + timedelta(seconds=10)
            wait_seconds = (next_test - datetime.now()).total_seconds()
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)

    except KeyboardInterrupt:
        print("\n\n测试被用户中断")

    # 生成报告
    report_file = generate_comprehensive_report()
    return report_file


def main():
    """主函数"""
    try:
        report_file = asyncio.run(continuous_20min_test())

        print("\n" + "="*80)
        print("测试完成")
        print(f"报告文件: {report_file}")
        print("="*80)

        sys.exit(0)

    except Exception as e:
        print(f"\n测试执行失败: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
