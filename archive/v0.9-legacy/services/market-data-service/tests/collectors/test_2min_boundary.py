"""
2分钟能力边界压力测试
验证各数据源在连续批量查询下的真实表现
"""

import sys
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/market-data-service/src')

import asyncio
import time
from datetime import datetime
from data_service.collectors.sina import SinaCollector
from data_service.collectors.tencent import TencentCollector
from data_service.collectors.eastmoney import EastMoneyCollector
from data_service.collectors.baostock import BaostockCollector

# 测试股票池（50只）
TEST_SYMBOLS = [f'{i:06d}.SZ' for i in range(1, 51)]


async def stress_test_source(name, collector_class, batch_size, interval, duration=120):
    """
    压力测试单个数据源

    Args:
        name: 数据源名称
        collector_class: 采集器类
        batch_size: 每批次股票数
        interval: 批次间隔（秒）
        duration: 测试持续时间（秒）
    """
    print(f"\n{'='*70}")
    print(f"🚀 {name} 压力测试 - {batch_size}只/批次, 间隔{interval}秒, 持续{duration}秒")
    print(f"{'='*70}")

    col = collector_class()
    await col.__aenter__()

    results = []
    start_time = time.time()
    round_num = 0

    while time.time() - start_time < duration:
        round_num += 1
        round_start = time.time()

        try:
            quotes = await col.get_batch_quotes(TEST_SYMBOLS[:batch_size])
            elapsed = time.time() - round_start

            if quotes:
                success_count = len(quotes)
                success_rate = success_count / batch_size * 100
            else:
                success_count = 0
                success_rate = 0

            results.append({
                'round': round_num,
                'success': success_count,
                'rate': success_rate,
                'time': elapsed,
                'timestamp': datetime.now().strftime('%H:%M:%S')
            })

            status = "✅" if success_rate >= 80 else "⚠️" if success_rate >= 50 else "❌"
            print(f"   第{round_num:2d}轮 {status} {success_count:2d}/{batch_size} ({success_rate:3.0f}%) {elapsed:.2f}s")

        except Exception as e:
            results.append({
                'round': round_num,
                'success': 0,
                'rate': 0,
                'time': 0,
                'error': str(e)[:30],
                'timestamp': datetime.now().strftime('%H:%M:%S')
            })
            print(f"   第{round_num:2d}轮 ❌ 异常: {str(e)[:40]}")

        # 计算实际间隔（扣除请求耗时）
        actual_interval = max(0, interval - (time.time() - round_start))
        if actual_interval > 0:
            await asyncio.sleep(actual_interval)

    await col.__aexit__(None, None, None)

    # 分析结果
    total_rounds = len(results)
    success_rounds = sum(1 for r in results if r['rate'] >= 80)
    partial_rounds = sum(1 for r in results if 50 <= r['rate'] < 80)
    failed_rounds = sum(1 for r in results if r['rate'] < 50)

    avg_success = sum(r['success'] for r in results) / total_rounds if total_rounds > 0 else 0
    avg_rate = avg_success / batch_size * 100 if batch_size > 0 else 0

    # 检查是否有明显降级趋势（后10轮 vs 前10轮）
    if total_rounds >= 20:
        first_10 = sum(r['rate'] for r in results[:10]) / 10
        last_10 = sum(r['rate'] for r in results[-10:]) / 10
        degradation = first_10 - last_10
    else:
        degradation = 0

    print(f"\n📊 {name} 测试结果总结")
    print(f"   总轮次: {total_rounds}")
    print(f"   完整成功(≥80%): {success_rounds}轮 ({success_rounds/total_rounds*100:.0f}%)")
    print(f"   部分成功(50-80%): {partial_rounds}轮")
    print(f"   失败(<50%): {failed_rounds}轮")
    print(f"   平均成功率: {avg_rate:.1f}%")

    if degradation > 20:
        print(f"   🔴 明显降级: 前10轮{first_10:.0f}% → 后10轮{last_10:.0f}%")
        print(f"   ⛔ 结论: 连续采集触发反爬机制")
    elif degradation > 10:
        print(f"   🟡 轻微降级: 前10轮{first_10:.0f}% → 后10轮{last_10:.0f}%")
        print(f"   ⚠️ 结论: 接近临界点，建议降低频率")
    else:
        print(f"   ✅ 稳定性良好: 前10轮{first_10:.0f}% → 后10轮{last_10:.0f}%")
        print(f"   ✅ 结论: 当前频率可持续")

    return {
        'name': name,
        'batch_size': batch_size,
        'interval': interval,
        'total_rounds': total_rounds,
        'avg_rate': avg_rate,
        'degradation': degradation,
        'reliable': degradation < 20 and avg_rate >= 80
    }


async def test_source_scenarios(name, collector_class):
    """测试单个数据源的多个场景"""
    print(f"\n{'#'*70}")
    print(f"# {name} 多场景压力测试")
    print(f"{'#'*70}")

    scenarios = [
        # (批次大小, 间隔秒数, 场景名称)
        (20, 2.0, "保守模式: 20只/2秒"),
        (50, 1.0, "标准模式: 50只/1秒"),
        (50, 0.5, "激进模式: 50只/0.5秒"),
    ]

    results = []

    for batch_size, interval, scenario_name in scenarios:
        print(f"\n{'='*70}")
        print(f"📍 场景: {scenario_name}")
        print(f"{'='*70}")

        result = await stress_test_source(name, collector_class, batch_size, interval, duration=120)
        results.append(result)

        # 如果激进模式失败，跳过后续测试
        if "激进" in scenario_name and not result['reliable']:
            print(f"\n⛔ 激进模式已触发反爬，跳过后续测试")
            break

        # 间隔10秒冷却
        print(f"\n💤 冷却10秒...")
        await asyncio.sleep(10)

    return results


async def main():
    print("🔥 4数据源2分钟能力边界压力测试")
    print(f"⏰ 开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"⏱️  预计总耗时: ~15分钟 (4源 × 3场景 × 2分钟 + 冷却)")
    print("="*70)

    all_results = {}

    # 测试新浪
    all_results['新浪'] = await test_source_scenarios('新浪', SinaCollector)
    print("\n" + "="*70)
    print("💤 新浪测试完成，冷却30秒...")
    print("="*70)
    await asyncio.sleep(30)

    # 测试腾讯
    all_results['腾讯'] = await test_source_scenarios('腾讯', TencentCollector)
    print("\n" + "="*70)
    print("💤 腾讯测试完成，冷却30秒...")
    print("="*70)
    await asyncio.sleep(30)

    # 测试东方财富
    all_results['东方财富'] = await test_source_scenarios('东方财富', EastMoneyCollector)
    print("\n" + "="*70)
    print("💤 东方财富测试完成，冷却30秒...")
    print("="*70)
    await asyncio.sleep(30)

    # 测试Baostock
    all_results['Baostock'] = await test_source_scenarios('Baostock', BaostockCollector)

    # 最终总结
    print("\n" + "#"*70)
    print("# 🎯 最终能力边界总结")
    print("#"*70)

    for source_name, scenarios in all_results.items():
        print(f"\n📊 {source_name}")
        for r in scenarios:
            status = "✅" if r['reliable'] else "❌"
            print(f"   {status} {r['batch_size']:2d}只/{r['interval']}秒: 平均{r['avg_rate']:.0f}%, "
                  f"降级{r['degradation']:.0f}%")

    print("\n" + "="*70)
    print("🏁 全部测试完成")
    print(f"⏰ 结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)


if __name__ == "__main__":
    asyncio.run(main())
