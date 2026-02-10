#!/usr/bin/env python3
"""
股票数据源采集测试脚本 - 集合竞价/开市前测试

测试时间: 2026-02-10 09:09 CST (星期二)
目标: 验证各数据源在集合竞价期间的数据采集能力
"""

import asyncio
import sys
import os
from datetime import datetime, time
from pathlib import Path

# 添加src到路径
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from data_service.collectors.sina import SinaCollector
from data_service.collectors.tencent import TencentCollector
from data_service.collectors.eastmoney import EastMoneyCollector

# 测试股票列表 - 覆盖不同板块
TEST_SYMBOLS = [
    "000001.SZ",  # 平安银行 - 深市主板
    "000002.SZ",  # 万科A - 深市主板
    "000858.SZ",  # 五粮液 - 深市主板
    "002594.SZ",  # 比亚迪 - 深市中小板
    "300750.SZ",  # 宁德时代 - 深市创业板
    "600036.SH",  # 招商银行 - 沪市主板
    "600519.SH",  # 贵州茅台 - 沪市主板
    "601318.SH",  # 中国平安 - 沪市主板
    "688981.SH",  # 中芯国际 - 沪市科创板
]


def get_market_status():
    """获取当前市场状态"""
    now = datetime.now()
    current_time = now.time()

    # A股市场时间定义
    pre_market_start = time(9, 15)    # 集合竞价开始
    pre_market_end = time(9, 25)      # 集合竞价结束
    market_open = time(9, 30)         # 开市
    morning_close = time(11, 30)      # 上午休市
    afternoon_open = time(13, 0)      # 下午开市
    market_close = time(15, 0)        # 收市

    # 判断市场状态
    if now.weekday() >= 5:  # 周末
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


async def test_single_source(collector, source_name):
    """测试单个数据源"""
    print(f"\n{'='*60}")
    print(f"测试数据源: {source_name}")
    print(f"{'='*60}")

    results = {
        "source": source_name,
        "success": False,
        "quotes": {},
        "errors": [],
        "latency": 0.0
    }

    start_time = datetime.now()

    try:
        async with collector:
            # 测试单只股票
            print(f"\n1. 测试单只股票查询 (600519.SH - 贵州茅台)...")
            try:
                quote = await collector.get_stock_quote("600519.SH")
                print(f"   ✓ 成功获取: {quote.get('name', 'N/A')} - 价格: {quote.get('price', 'N/A')}")
                results["quotes"]["600519.SH"] = quote
            except Exception as e:
                print(f"   ✗ 失败: {str(e)}")
                results["errors"].append(f"Single quote: {str(e)}")

            # 测试批量查询
            print(f"\n2. 测试批量查询 (5只股票)...")
            batch_symbols = TEST_SYMBOLS[:5]
            try:
                batch_quotes = await collector.get_batch_quotes(batch_symbols)
                print(f"   ✓ 成功获取 {len(batch_quotes)} 只股票数据")
                for symbol, quote in batch_quotes.items():
                    name = quote.get('name', 'N/A')
                    price = quote.get('price', 'N/A')
                    change_pct = quote.get('change_percent', 'N/A')
                    print(f"     - {symbol}: {name} @ {price} ({change_pct:+.2f}%)")
                results["quotes"].update(batch_quotes)
            except Exception as e:
                print(f"   ✗ 失败: {str(e)}")
                results["errors"].append(f"Batch quotes: {str(e)}")

            # 测试股票信息
            print(f"\n3. 测试股票信息查询...")
            try:
                info = await collector.get_stock_info("000001.SZ")
                print(f"   ✓ 成功获取: {info.get('name', 'N/A')} - 交易所: {info.get('exchange', 'N/A')}")
            except Exception as e:
                print(f"   ✗ 失败: {str(e)}")
                results["errors"].append(f"Stock info: {str(e)}")

        results["latency"] = (datetime.now() - start_time).total_seconds()
        results["success"] = len(results["quotes"]) > 0

    except Exception as e:
        results["errors"].append(f"General: {str(e)}")
        print(f"   ✗ 数据源初始化失败: {str(e)}")

    print(f"\n   耗时: {results['latency']:.2f}秒")
    print(f"   成功获取: {len(results['quotes'])} 只股票")

    return results


async def test_all_sources():
    """测试所有数据源"""
    print("\n" + "="*60)
    print("A股股票数据源采集测试")
    print("="*60)

    # 显示当前时间和市场状态
    now = datetime.now()
    market_status, market_desc = get_market_status()
    print(f"\n当前时间: {now.strftime('%Y-%m-%d %H:%M:%S')} CST")
    print(f"市场状态: {market_desc}")

    # 初始化收集器
    collectors = [
        (SinaCollector(), "新浪财经"),
        (TencentCollector(), "腾讯财经"),
        (EastMoneyCollector(), "东方财富"),
    ]

    # 测试所有数据源
    all_results = []
    for collector, name in collectors:
        try:
            result = await test_single_source(collector, name)
            all_results.append(result)
        except Exception as e:
            print(f"\n✗ {name} 测试失败: {str(e)}")
            all_results.append({
                "source": name,
                "success": False,
                "quotes": {},
                "errors": [str(e)],
                "latency": 0.0
            })

    # 汇总报告
    print("\n" + "="*60)
    print("测试汇总报告")
    print("="*60)

    total_sources = len(all_results)
    successful_sources = sum(1 for r in all_results if r["success"])
    total_quotes = sum(len(r["quotes"]) for r in all_results)
    avg_latency = sum(r["latency"] for r in all_results) / total_sources if total_sources > 0 else 0

    print(f"\n数据源总数: {total_sources}")
    print(f"成功数据源: {successful_sources}")
    print(f"失败数据源: {total_sources - successful_sources}")
    print(f"总报价数量: {total_quotes}")
    print(f"平均响应时间: {avg_latency:.2f}秒")

    print("\n各数据源详情:")
    for result in all_results:
        status = "✓ 正常" if result["success"] else "✗ 失败"
        print(f"  - {result['source']}: {status} ({len(result['quotes'])} 只股票, {result['latency']:.2f}秒)")

    # 集合竞价/开市建议
    print("\n" + "="*60)
    print("集合竞价/开市状态分析")
    print("="*60)

    if market_status == "pre_market":
        print("\n⚡ 当前处于集合竞价时段 (9:15-9:25)")
        print("   建议:")
        print("   - 数据源应能提供实时竞价数据")
        print("   - 价格可能波动较大，注意数据质量")
        print("   - 建议在9:25前完成数据源健康检查")
    elif market_status == "pre_open":
        print("\n⏰ 集合竞价已结束，即将开市 (9:25-9:30)")
        print("   建议:")
        print("   - 确认所有数据源已就绪")
        print("   - 准备接收9:30开市数据")
        print("   - 检查缓存和数据库连接状态")
    elif market_status in ["morning_session", "afternoon_session"]:
        print("\n📈 当前处于交易时段")
        print("   建议:")
        print("   - 保持高频数据采集（建议3-5秒间隔）")
        print("   - 监控数据源健康状态")
        print("   - 准备自动故障转移")

    # 数据源健康状态评估
    healthy_sources = [r for r in all_results if r["success"]]
    if len(healthy_sources) >= 2:
        print("\n✓ 数据源健康状态良好，可以支持混合采集策略")
    elif len(healthy_sources) == 1:
        print("\n⚠ 仅有一个数据源可用，建议启用备用方案")
    else:
        print("\n✗ 所有数据源均不可用，需要检查网络连接或API配置")

    return all_results


def main():
    """主函数"""
    print("\n" + "="*60)
    print("Stock-Race 数据服务 - 股票数据源采集测试")
    print("="*60)

    try:
        results = asyncio.run(test_all_sources())

        # 返回码: 0 = 至少一个数据源可用, 1 = 全部失败
        success = any(r["success"] for r in results)
        sys.exit(0 if success else 1)

    except KeyboardInterrupt:
        print("\n\n测试被用户中断")
        sys.exit(130)
    except Exception as e:
        print(f"\n测试执行失败: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
