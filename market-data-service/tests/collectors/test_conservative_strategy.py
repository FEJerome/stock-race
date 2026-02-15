"""
保守反爬策略验证测试
- 批次大小: 20只
- 批次间隔: 3秒
- 高频层: 50只/15秒
"""

import asyncio
import sys
import time

sys.path.insert(0, '/home/fe-jerome/projects/stock-race/market-data-service/src')

from data_service.collectors.router import DataSourceRouter
from data_service.collectors.sina import SinaCollector
from data_service.core.config import settings


async def test_small_batch():
    """测试小批量采集"""
    print("🚀 保守策略验证测试")
    print(f"⏰ 批次大小: {settings.BATCH_SIZE}")
    print(f"⏰ 批次间隔: {settings.BATCH_INTERVAL}秒")
    print("=" * 60)

    router = DataSourceRouter()
    await router.initialize()

    # 测试1: 单只股票（基准）
    print("\n📊 测试1: 单只股票")
    try:
        start = time.time()
        quote = await router.get_stock_quote("000001.SZ")
        elapsed = time.time() - start
        if quote:
            print(f"✅ 成功: {quote.get('name')} ¥{quote.get('price')} ({elapsed:.2f}s)")
        else:
            print("❌ 返回空数据")
    except Exception as e:
        print(f"❌ 失败: {e}")

    await asyncio.sleep(3)  # 间隔3秒

    # 测试2: 5只股票（小批量）
    print("\n📊 测试2: 5只股票")
    try:
        start = time.time()
        quotes = await router.get_batch_quotes(
            ["000001.SZ", "000002.SZ", "000858.SZ", "002594.SZ", "300750.SZ"]
        )
        elapsed = time.time() - start
        if quotes:
            print(f"✅ 成功: {len(quotes)}/5只 ({elapsed:.2f}s)")
            for sym, data in list(quotes.items())[:3]:
                print(f"   {sym}: {data.get('name')} ¥{data.get('price')}")
        else:
            print("❌ 返回空数据")
    except Exception as e:
        print(f"❌ 失败: {e}")

    await asyncio.sleep(3)

    # 测试3: 20只股票（单批次上限）
    print("\n📊 测试3: 20只股票（单批次）")
    symbols_20 = [
        "000001.SZ", "000002.SZ", "000858.SZ", "002594.SZ", "300750.SZ",
        "600036.SH", "600519.SH", "601012.SH", "601318.SH", "601888.SH",
        "000063.SZ", "000100.SZ", "000333.SZ", "000538.SZ", "000568.SZ",
        "000651.SZ", "000725.SZ", "000768.SZ", "000792.SZ", "000895.SZ"
    ]
    try:
        start = time.time()
        quotes = await router.get_batch_quotes(symbols_20)
        elapsed = time.time() - start
        if quotes:
            success_rate = len(quotes) / len(symbols_20) * 100
            print(f"✅ 成功: {len(quotes)}/20只 ({success_rate:.0f}%) ({elapsed:.2f}s)")
        else:
            print("❌ 返回空数据")
    except Exception as e:
        print(f"❌ 失败: {e}")

    await router.close()
    print("\n🏁 测试完成")


if __name__ == "__main__":
    asyncio.run(test_small_batch())
