#!/usr/bin/env python3
"""
股票数据源连续测试脚本

测试时间范围: 从当前时间持续到9:40
目标: 收集足够样本数据，分析各数据源在集合竞价和开市初期的表现
"""

import asyncio
import sys
import os
import json
from datetime import datetime, time, timedelta
from pathlib import Path
from collections import defaultdict

# 添加src到路径
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from data_service.collectors.sina import SinaCollector
from data_service.collectors.tencent import TencentCollector
from data_service.collectors.eastmoney import EastMoneyCollector

# 测试股票列表
TEST_SYMBOLS = [
    "000001.SZ",  # 平安银行
    "000002.SZ",  # 万科A
    "000858.SZ",  # 五粮液
    "002594.SZ",  # 比亚迪
    "300750.SZ",  # 宁德时代
    "600036.SH",  # 招商银行
    "600519.SH",  # 贵州茅台
    "601318.SH",  # 中国平安
    "688981.SH",  # 中芯国际
]

# 全局测试结果存储
all_test_results = []


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


async def test_single_source(collector, source_name, test_index):
    """测试单个数据源"""
    result = {
        "test_index": test_index,
        "timestamp": datetime.now().isoformat(),
        "source": source_name,
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
            # 测试单只股票
            try:
                quote = await collector.get_stock_quote("600519.SH")
                result["single_quote_success"] = True
                result["single_quote_name"] = quote.get('name', 'N/A')
                result["single_quote_price"] = quote.get('price', 0)
            except Exception as e:
                result["errors"].append(f"Single: {str(e)}")

            # 测试批量查询
            try:
                batch_quotes = await collector.get_batch_quotes(TEST_SYMBOLS[:5])
                result["batch_quotes_success"] = True
                result["quotes_count"] = len(batch_quotes)
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

        result["latency"] = (datetime.now() - start_time).total_seconds()
        result["success"] = result["single_quote_success"] or result["batch_quotes_success"]

    except Exception as e:
        result["errors"].append(f"General: {str(e)}")

    return result


async def run_single_test(test_index):
    """运行单次测试"""
    now = datetime.now()
    market_status, market_desc = get_market_status()

    print(f"\n{'='*70}")
    print(f"测试 #{test_index} | {now.strftime('%H:%M:%S')} | {market_desc}")
    print(f"{'='*70}")

    collectors = [
        (SinaCollector(), "新浪财经"),
        (TencentCollector(), "腾讯财经"),
        (EastMoneyCollector(), "东方财富"),
    ]

    test_results = {
        "test_index": test_index,
        "timestamp": now.isoformat(),
        "market_status": market_status,
        "market_desc": market_desc,
        "sources": []
    }

    for collector, name in collectors:
        try:
            result = await test_single_source(collector, name, test_index)
            test_results["sources"].append(result)

            status = "✓" if result["success"] else "✗"
            print(f"  {status} {name}: 单股={result['single_quote_success']}, "
                  f"批量={result['batch_quotes_success']}, "
                  f"数量={result['quotes_count']}, 耗时={result['latency']:.2f}s")

            if result["batch_quotes_success"] and result.get("batch_details"):
                for symbol, details in result["batch_details"].items():
                    print(f"      {symbol}: {details['name']} @ {details['price']}")

        except Exception as e:
            print(f"  ✗ {name}: 测试失败 - {str(e)}")
            test_results["sources"].append({
                "test_index": test_index,
                "timestamp": now.isoformat(),
                "source": name,
                "success": False,
                "errors": [str(e)]
            })

    all_test_results.append(test_results)
    return test_results


def generate_report():
    """生成测试报告"""
    print("\n" + "="*70)
    print("连续测试报告")
    print("="*70)

    if not all_test_results:
        print("没有测试数据")
        return

    # 统计信息
    total_tests = len(all_test_results)
    sources_stats = defaultdict(lambda: {
        "total": 0,
        "success": 0,
        "single_success": 0,
        "batch_success": 0,
        "total_quotes": 0,
        "total_latency": 0.0,
        "errors": []
    })

    for test in all_test_results:
        for source in test["sources"]:
            name = source["source"]
            sources_stats[name]["total"] += 1
            sources_stats[name]["total_latency"] += source.get("latency", 0)

            if source["success"]:
                sources_stats[name]["success"] += 1
            if source.get("single_quote_success"):
                sources_stats[name]["single_success"] += 1
            if source.get("batch_quotes_success"):
                sources_stats[name]["batch_success"] += 1

            sources_stats[name]["total_quotes"] += source.get("quotes_count", 0)
            sources_stats[name]["errors"].extend(source.get("errors", []))

    print(f"\n总测试次数: {total_tests}")
    print(f"测试时间段: {all_test_results[0]['timestamp']} ~ {all_test_results[-1]['timestamp']}")

    print("\n各数据源统计:")
    print("-" * 70)
    print(f"{'数据源':<12} {'成功率':<10} {'单股成功率':<12} {'批量成功率':<12} {'平均响应':<10} {'总报价数':<10}")
    print("-" * 70)

    for name, stats in sources_stats.items():
        success_rate = stats["success"] / stats["total"] * 100 if stats["total"] > 0 else 0
        single_rate = stats["single_success"] / stats["total"] * 100 if stats["total"] > 0 else 0
        batch_rate = stats["batch_success"] / stats["total"] * 100 if stats["total"] > 0 else 0
        avg_latency = stats["total_latency"] / stats["total"] if stats["total"] > 0 else 0

        print(f"{name:<12} {success_rate:>6.1f}%    {single_rate:>6.1f}%      {batch_rate:>6.1f}%      {avg_latency:>6.2f}s    {stats['total_quotes']:<10}")

    # 按时间段分析
    print("\n\n时间段分析:")
    print("-" * 70)

    period_stats = defaultdict(lambda: defaultdict(lambda: {"total": 0, "success": 0}))

    for test in all_test_results:
        period = test["market_desc"]
        for source in test["sources"]:
            name = source["source"]
            period_stats[period][name]["total"] += 1
            if source["success"]:
                period_stats[period][name]["success"] += 1

    for period, sources in period_stats.items():
        print(f"\n{period}:")
        for name, stats in sources.items():
            rate = stats["success"] / stats["total"] * 100 if stats["total"] > 0 else 0
            print(f"  {name}: {stats['success']}/{stats['total']} ({rate:.1f}%)")

    # 保存详细结果到文件
    report_file = f"data_source_test_report_{datetime.now().strftime('%Y%m%d_%H%M')}.json"
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump({
            "test_summary": {
                "total_tests": total_tests,
                "start_time": all_test_results[0]['timestamp'],
                "end_time": all_test_results[-1]['timestamp']
            },
            "sources_summary": {
                name: {
                    "success_rate": stats["success"] / stats["total"] * 100 if stats["total"] > 0 else 0,
                    "single_quote_rate": stats["single_success"] / stats["total"] * 100 if stats["total"] > 0 else 0,
                    "batch_quote_rate": stats["batch_success"] / stats["total"] * 100 if stats["total"] > 0 else 0,
                    "average_latency": stats["total_latency"] / stats["total"] if stats["total"] > 0 else 0,
                    "total_quotes": stats["total_quotes"],
                    "total_tests": stats["total"]
                }
                for name, stats in sources_stats.items()
            },
            "detailed_results": all_test_results
        }, f, ensure_ascii=False, indent=2)

    print(f"\n\n详细报告已保存: {report_file}")


async def continuous_test():
    """连续测试直到9:40"""
    test_index = 0
    end_time = datetime.now().replace(hour=9, minute=40, second=0, microsecond=0)

    # 如果当前时间已经超过9:40，则测试到当前时间后30分钟
    if datetime.now() > end_time:
        end_time = datetime.now() + timedelta(minutes=30)

    print("\n" + "="*70)
    print("股票数据源连续测试")
    print("="*70)
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"计划结束: {end_time.strftime('%H:%M:%S')}")
    print(f"测试间隔: 60秒")
    print("="*70)

    try:
        while datetime.now() < end_time:
            test_index += 1
            await run_single_test(test_index)

            # 等待60秒
            await asyncio.sleep(60)

    except KeyboardInterrupt:
        print("\n\n测试被用户中断")

    # 生成报告
    generate_report()


def main():
    """主函数"""
    try:
        asyncio.run(continuous_test())
    except Exception as e:
        print(f"\n测试执行失败: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
