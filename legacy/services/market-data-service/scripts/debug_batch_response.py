#!/usr/bin/env python3
"""
调试批量查询响应
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from data_service.collectors.tencent import TencentCollector
from data_service.collectors.eastmoney import EastMoneyCollector


TEST_SYMBOLS = ["000001.SZ", "600519.SH"]


async def debug_tencent():
    """调试腾讯财经响应"""
    print("="*60)
    print("腾讯财经 - 实际响应调试")
    print("="*60)

    async with TencentCollector() as collector:
        # 构建URL
        tencent_symbols = []
        for symbol in TEST_SYMBOLS:
            market, code = collector._parse_symbol(symbol)
            tencent_symbols.append(f"{market.lower()}{code}")

        url = f"{collector.base_url}/q={','.join(tencent_symbols)}"
        print(f"\n请求URL: {url}")

        # 发送请求
        response = await collector._make_request(url, headers={
            "Referer": "http://gu.qq.com",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })

        text = response.get("text", "")
        print(f"\n响应内容 (前500字符):")
        print(text[:500])
        print("\n")

        # 分析响应
        lines = text.strip().split("\n")
        print(f"响应行数: {len(lines)}")

        for i, line in enumerate(lines[:3]):
            print(f"\n行 {i+1}:")
            print(f"  内容: {line[:100]}...")

            # 尝试解析
            import re
            match = re.search(r'v_(\w+)="(.*?)";', line)
            if match:
                symbol = match.group(1)
                data = match.group(2)
                fields = data.split("~")
                print(f"  解析 symbol: {symbol}")
                print(f"  字段数: {len(fields)}")
                if len(fields) > 5:
                    print(f"  名称: {fields[1]}")
                    print(f"  价格: {fields[3]}")
            else:
                print(f"  未匹配到模式")


async def debug_eastmoney():
    """调试东方财富响应"""
    print("\n" + "="*60)
    print("东方财富 - 实际响应调试")
    print("="*60)

    async with EastMoneyCollector() as collector:
        # 构建参数
        eastmoney_codes = []
        for symbol in TEST_SYMBOLS:
            market, code = collector._parse_symbol(symbol)
            eastmoney_codes.append(f"{1 if market == 'SH' else 0}.{code}")

        url = f"{collector.base_url}/api/qt/ulist.np/get"
        params = {
            "fields": "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21",
            "secids": ",".join(eastmoney_codes),
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
        }

        print(f"\n请求URL: {url}")
        print(f"参数: {params}")

        # 发送请求
        response = await collector._make_request(url, params=params, headers={
            "Referer": "https://quote.eastmoney.com",
            "User-Agent": "Mozilla/5.0"
        })

        text = response.get("text", "")
        print(f"\n响应内容 (前800字符):")
        print(text[:800])


async def main():
    await debug_tencent()
    await debug_eastmoney()


if __name__ == "__main__":
    asyncio.run(main())
