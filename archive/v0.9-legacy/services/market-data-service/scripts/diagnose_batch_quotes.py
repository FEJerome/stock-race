#!/usr/bin/env python3
"""
批量查询诊断脚本

诊断腾讯和东方财富批量查询返回0只股票的问题
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from data_service.collectors.tencent import TencentCollector
from data_service.collectors.eastmoney import EastMoneyCollector


TEST_SYMBOLS = [
    "000001.SZ",  # 平安银行
    "000002.SZ",  # 万科A
    "600519.SH",  # 贵州茅台
    "601318.SH",  # 中国平安
]


async def diagnose_tencent():
    """诊断腾讯财经批量查询"""
    print("\n" + "="*60)
    print("腾讯财经批量查询诊断")
    print("="*60)

    async with TencentCollector() as collector:
        # 测试单股查询
        print("\n1. 测试单股查询:")
        for symbol in TEST_SYMBOLS[:2]:
            try:
                quote = await collector.get_stock_quote(symbol)
                print(f"   ✓ {symbol}: {quote.get('name')} @ {quote.get('price')}")
            except Exception as e:
                print(f"   ✗ {symbol}: {e}")

        # 测试批量查询
        print("\n2. 测试批量查询:")
        try:
            batch = await collector.get_batch_quotes(TEST_SYMBOLS)
            print(f"   返回股票数量: {len(batch)}")
            for symbol, quote in batch.items():
                print(f"   ✓ {symbol}: {quote.get('name')} @ {quote.get('price')}")

            if len(batch) == 0:
                print("   ⚠ 批量查询返回空结果!")
                # 调试: 打印URL和响应
                tencent_symbols = []
                for symbol in TEST_SYMBOLS:
                    market, code = collector._parse_symbol(symbol)
                    tencent_symbols.append(f"{market.lower()}{code}")

                url = f"{collector.base_url}/q={','.join(tencent_symbols)}"
                print(f"\n   调试 - URL: {url}")

        except Exception as e:
            print(f"   ✗ 批量查询失败: {e}")
            import traceback
            traceback.print_exc()


async def diagnose_eastmoney():
    """诊断东方财富批量查询"""
    print("\n" + "="*60)
    print("东方财富批量查询诊断")
    print("="*60)

    async with EastMoneyCollector() as collector:
        # 测试单股查询
        print("\n1. 测试单股查询:")
        for symbol in TEST_SYMBOLS[:2]:
            try:
                quote = await collector.get_stock_quote(symbol)
                print(f"   ✓ {symbol}: {quote.get('name')} @ {quote.get('price')}")
            except Exception as e:
                print(f"   ✗ {symbol}: {e}")

        # 测试批量查询
        print("\n2. 测试批量查询:")
        try:
            batch = await collector.get_batch_quotes(TEST_SYMBOLS)
            print(f"   返回股票数量: {len(batch)}")
            for symbol, quote in batch.items():
                print(f"   ✓ {symbol}: {quote.get('name')} @ {quote.get('price')}")

            if len(batch) == 0:
                print("   ⚠ 批量查询返回空结果!")
                # 调试: 打印secids参数
                eastmoney_codes = []
                for symbol in TEST_SYMBOLS:
                    market, code = collector._parse_symbol(symbol)
                    eastmoney_codes.append(f"{1 if market == 'SH' else 0}.{code}")

                print(f"\n   调试 - secids: {','.join(eastmoney_codes)}")

        except Exception as e:
            print(f"   ✗ 批量查询失败: {e}")
            import traceback
            traceback.print_exc()


async def main():
    print("批量查询问题诊断工具")
    print("此脚本用于诊断腾讯和东方财富批量查询返回0只股票的问题")

    await diagnose_tencent()
    await diagnose_eastmoney()

    print("\n" + "="*60)
    print("诊断完成")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(main())
