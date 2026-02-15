"""
4数据源并行2分钟压力测试
同时测试新浪、腾讯、东方财富、Baostock
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

TEST_SYMBOLS = [f'{i:06d}.SZ' for i in range(1, 51)]


async def test_single_source(name, collector_class, batch_size, interval, duration=120):
    """测试单个数据源"""
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
                'time': elapsed
            })
        except Exception as e:
            results.append({
                'round': round_num,
                'success': 0,
                'rate': 0,
                'error': True
            })

        actual_interval = max(0, interval - (time.time() - round_start))
        if actual_interval > 0:
            await asyncio.sleep(actual_interval)

    await col.__aexit__(None, None, None)

    # 分析
    total = len(results)
    avg_rate = sum(r['rate'] for r in results) / total if total > 0 else 0

    if total >= 20:
        first_10 = sum(r['rate'] for r in results[:10]) / 10
        last_10 = sum(r['rate'] for r in results[-10:]) / 10
        degradation = first_10 - last_10
    else:
        degradation = 0

    return {
        'name': name,
        'batch_size': batch_size,
        'interval': interval,
        'total_rounds': total,
        'avg_rate': avg_rate,
        'degradation': degradation,
        'reliable': degradation < 15 and avg_rate >= 85
    }


async def test_all_sources(batch_size, interval, scenario_name):
    """并行测试所有数据源"""
    print(f"\n{'='*70}")
    print(f"🚀 场景: {scenario_name} ({batch_size}只/{interval}秒)")
    print(f"{'='*70}")
    print(f"⏱️  开始时间: {datetime.now().strftime('%H:%M:%S')}")
    print(f"⏱️  预计耗时: 2分钟")
    print("-"*70)

    sources = [
        ('新浪', SinaCollector),
        ('腾讯', TencentCollector),
        ('东方财富', EastMoneyCollector),
        ('Baostock', BaostockCollector),
    ]

    # 并行执行所有数据源测试
    tasks = [test_single_source(name, cls, batch_size, interval) for name, cls in sources]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    print(f"\n📊 测试结果 ({scenario_name})")
    print("-"*70)

    for result in results:
        if isinstance(result, Exception):
            print(f"   ❌ 测试异常: {str(result)[:50]}")
            continue

        status = "✅" if result['reliable'] else "❌"
        deg_text = f"降级{result['degradation']:.0f}%" if result['degradation'] > 5 else "无降级"
        print(f"   {status} {result['name']:8} | {result['batch_size']:2d}只/{result['interval']}s | "
              f"平均{result['avg_rate']:.0f}% | {result['total_rounds']:3d}轮 | {deg_text}")

    print(f"\n⏱️  结束时间: {datetime.now().strftime('%H:%M:%S')}")

    return results


async def main():
    print("🔥 4数据源并行2分钟压力测试")
    print(f"⏰ 开始: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"⏱️  预计总耗时: ~8分钟 (4场景 × 2分钟 + 冷却)")
    print("="*70)

    # 场景1: 保守模式 20只/2秒
    await test_all_sources(20, 2.0, "保守模式")
    await asyncio.sleep(5)

    # 场景2: 标准模式 50只/1秒
    await test_all_sources(50, 1.0, "标准模式")
    await asyncio.sleep(5)

    # 场景3: 激进模式 50只/0.5秒
    await test_all_sources(50, 0.5, "激进模式")
    await asyncio.sleep(5)

    # 场景4: 高频模式 20只/0.5秒
    await test_all_sources(20, 0.5, "高频模式")

    print("\n" + "="*70)
    print("🏁 全部测试完成")
    print(f"⏰ 结束: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)


if __name__ == "__main__":
    asyncio.run(main())
