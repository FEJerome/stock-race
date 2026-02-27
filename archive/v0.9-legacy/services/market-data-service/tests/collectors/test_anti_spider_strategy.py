"""
反爬策略下的分层采集测试
分阶段验证采集能力：
1. 高频层100只，10秒间隔
2. 中频层400只，30秒间隔
3. 低频层4500只，60秒间隔
"""

import asyncio
import sys
import time
from datetime import datetime
from typing import List, Dict, Any

# 添加项目路径
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/market-data-service/src')

from data_service.collectors.router import DataSourceRouter
from data_service.collectors.sina import SinaCollector
from data_service.collectors.tencent import TencentCollector
from data_service.collectors.eastmoney import EastMoneyCollector
from data_service.collectors.baostock import BaostockCollector
from data_service.core.config import settings


# 测试股票池
TEST_SYMBOLS = {
    # 高频层：热门股票100只
    "high_freq": [
        "000001.SZ", "000002.SZ", "000858.SZ", "002594.SZ", "300750.SZ",
        "600036.SH", "600519.SH", "601012.SH", "601318.SH", "601888.SH",
        # ... 实际测试时补充到100只
    ],
    # 中频层：400只
    "mid_freq": [
        "000063.SZ", "000100.SZ", "000333.SZ", "000538.SZ", "000568.SZ",
        "000651.SZ", "000725.SZ", "000768.SZ", "000792.SZ", "000895.SZ",
        # ... 实际测试时补充到400只
    ],
    # 低频层：全量A股
    "low_freq": []
}


class TieredCollectionTest:
    """分层采集测试器"""

    def __init__(self):
        self.router = None
        self.results = {
            "high_freq": {"success": 0, "failed": 0, "avg_latency": 0},
            "mid_freq": {"success": 0, "failed": 0, "avg_latency": 0},
            "low_freq": {"success": 0, "failed": 0, "avg_latency": 0},
        }

    async def initialize(self):
        """初始化路由器"""
        self.router = DataSourceRouter()
        await self.router.initialize()
        print(f"✅ 路由器初始化完成")
        print(f"   批次大小: {settings.BATCH_SIZE}")
        print(f"   可用数据源: {[s.name for s in self.router.data_sources]}")

    async def test_direct_source(self, symbols: List[str], source_name: str):
        """测试直连数据源"""
        print(f"\n{'='*60}")
        print(f"📡 直连测试: {source_name} - {len(symbols)}只股票")
        print(f"{'='*60}")

        source = None
        for s in self.router.data_sources:
            if s.name == source_name:
                source = s
                break

        if not source:
            print(f"❌ 数据源 {source_name} 不可用")
            return

        start_time = time.time()
        try:
            quotes = await source.get_batch_quotes(symbols)
            elapsed = time.time() - start_time

            if quotes:
                print(f"✅ 成功: 获取 {len(quotes)} 只股票数据")
                print(f"⏱️  耗时: {elapsed:.2f}秒")
                print(f"📊 样本: {list(quotes.items())[0] if quotes else 'N/A'}")
            else:
                print(f"⚠️ 返回空数据")

        except Exception as e:
            print(f"❌ 失败: {str(e)}")

    async def test_router_collection(self, symbols: List[str], tier_name: str):
        """测试路由器批量采集"""
        print(f"\n{'='*60}")
        print(f"🔄 路由器测试: {tier_name} - {len(symbols)}只股票")
        print(f"{'='*60}")

        start_time = time.time()
        try:
            quotes = await self.router.get_batch_quotes(
                symbols,
                segmentation_strategy="by_first_letter"
            )
            elapsed = time.time() - start_time

            success_count = len(quotes)
            failed_count = len(symbols) - success_count

            self.results[tier_name]["success"] = success_count
            self.results[tier_name]["failed"] = failed_count
            self.results[tier_name]["avg_latency"] = elapsed

            print(f"✅ 成功: {success_count}/{len(symbols)} ({success_count/len(symbols)*100:.1f}%)")
            print(f"❌ 失败: {failed_count}/{len(symbols)}")
            print(f"⏱️  总耗时: {elapsed:.2f}秒")
            print(f"⚡ 平均延迟: {elapsed/max(1,success_count)*1000:.0f}ms/只")

            if quotes:
                print(f"\n📊 数据样本:")
                for i, (symbol, data) in enumerate(list(quotes.items())[:3]):
                    print(f"   {symbol}: {data.get('name', 'N/A')} ¥{data.get('price', 'N/A')}")

        except Exception as e:
            print(f"❌ 测试失败: {str(e)}")
            import traceback
            traceback.print_exc()

    async def test_tiered_strategy(self):
        """测试分层采集策略"""
        print(f"\n{'#'*70}")
        print(f"# 分层采集策略验证")
        print(f"# 高频层: {settings.HIGH_FREQ_STOCKS}只/{settings.HIGH_FREQ_INTERVAL}秒")
        print(f"# 中频层: {settings.MID_FREQ_STOCKS}只/{settings.MID_FREQ_INTERVAL}秒")
        print(f"# 低频层: {settings.LOW_FREQ_STOCKS}只/{settings.LOW_FREQ_INTERVAL}秒")
        print(f"{'#'*70}")

        # 阶段1: 高频层测试 (用10只代替100只做快速验证)
        high_freq_test = TEST_SYMBOLS["high_freq"][:10]
        if high_freq_test:
            await self.test_router_collection(high_freq_test, "high_freq")
            print(f"\n💤 高频层间隔 {settings.HIGH_FREQ_INTERVAL}秒...")
            await asyncio.sleep(2)  # 实际应为10秒，测试中缩短

        # 阶段2: 中频层测试 (用20只代替400只)
        mid_freq_test = TEST_SYMBOLS["mid_freq"][:20]
        if mid_freq_test:
            await self.test_router_collection(mid_freq_test, "mid_freq")
            print(f"\n💤 中频层间隔 {settings.MID_FREQ_INTERVAL}秒...")
            await asyncio.sleep(3)  # 实际应为30秒，测试中缩短

        # 阶段3: 低频层测试 (用50只代替4500只)
        low_freq_symbols = [f"{i:06d}.SZ" for i in range(1, 51)]  # 生成50只测试
        await self.test_router_collection(low_freq_symbols, "low_freq")

    def print_summary(self):
        """打印测试总结"""
        print(f"\n{'#'*70}")
        print(f"# 分层采集测试结果总结")
        print(f"{'#'*70}")

        total_success = 0
        total_failed = 0

        for tier, result in self.results.items():
            success = result["success"]
            failed = result["failed"]
            total = success + failed

            if total > 0:
                rate = success / total * 100
                print(f"\n{tier.upper()}:")
                print(f"  ✅ 成功: {success}/{total} ({rate:.1f}%)")
                print(f"  ❌ 失败: {failed}/{total}")
                print(f"  ⏱️  平均延迟: {result['avg_latency']:.2f}秒")

                total_success += success
                total_failed += failed

        total = total_success + total_failed
        if total > 0:
            print(f"\n{'='*50}")
            print(f"总计:")
            print(f"  ✅ 成功: {total_success}/{total} ({total_success/total*100:.1f}%)")
            print(f"  ❌ 失败: {total_failed}/{total}")


async def main():
    """主测试函数"""
    print("🚀 反爬策略分层采集测试启动")
    print(f"⏰ 测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    test = TieredCollectionTest()

    try:
        await test.initialize()

        # 先测试直连数据源
        await test.test_direct_source(["000001.SZ", "600036.SH"], "sina")

        # 测试分层策略
        await test.test_tiered_strategy()

        # 打印总结
        test.print_summary()

    except KeyboardInterrupt:
        print("\n\n⚠️ 测试被中断")
    except Exception as e:
        print(f"\n❌ 测试异常: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        if test.router:
            await test.router.close()
        print("\n🏁 测试结束")


if __name__ == "__main__":
    asyncio.run(main())
