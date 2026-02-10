#!/usr/bin/env python3
"""
东方财富API调试脚本
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from data_service.collectors.eastmoney import EastMoneyCollector


TEST_SYMBOLS = ["000001.SZ", "600519.SH"]


async def debug_eastmoney_single():
    """调试东方财富单股查询"""
    print("="*60)
    print("东方财富 - 单股查询调试")
    print("="*60)

    async with EastMoneyCollector() as collector:
        symbol = TEST_SYMBOLS[0]
        market, code = collector._parse_symbol(symbol)
        eastmoney_code = f"{1 if market == 'SH' else 0}.{code}"

        url = f"{collector.base_url}/api/qt/stock/get"
        params = {
            "invt": 2,
            "fltt": 2,
            "fields": "f12,f14,f43,f44,f45,f46,f47,f48,f57,f60",
            "secid": eastmoney_code,
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
        }

        print(f"\n请求URL: {url}")
        print(f"参数: {params}")

        response = await collector._make_request(url, params=params, headers={
            "Referer": "https://quote.eastmoney.com",
            "User-Agent": "Mozilla/5.0"
        })

        text = response.get("text", "")
        print(f"\n响应内容:")
        print(text[:500])

        # 解析响应
        import re
        import json
        match = re.search(r'jQuery\d+_\d+\((.*?)\);', text, re.DOTALL)
        if match:
            json_str = match.group(1)
            data = json.loads(json_str)
            result = data.get("data", {})
            print(f"\n解析结果:")
            for k, v in list(result.items())[:10]:
                print(f"  {k}: {v}")


async def debug_eastmoney_batch():
    """调试东方财富批量查询"""
    print("\n" + "="*60)
    print("东方财富 - 批量查询调试")
    print("="*60)

    async with EastMoneyCollector() as collector:
        # 构建参数
        eastmoney_codes = []
        for symbol in TEST_SYMBOLS:
            market, code = collector._parse_symbol(symbol)
            eastmoney_codes.append(f"{1 if market == 'SH' else 0}.{code}")

        url = f"{collector.base_url}/api/qt/ulist.np/get"
        params = {
            "fields": "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f15,f16,f17,f18,f19,f20,f21,f22,f23,f24,f25,f26,f27,f28,f29,f30,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f41,f42,f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65,f66,f67,f68,f69,f70,f71,f72,f73,f74,f75,f76,f77,f78,f79,f80,f81,f82,f83,f84,f85,f86,f87,f88,f89,f90,f91,f92,f93,f94,f95,f96,f97,f98,f99,f100,f101,f102,f103,f104,f105,f106,f107,f108,f109,f110,f111,f112,f113,f114,f115,f116,f117,f118,f119,f120,f121,f122,f123,f124,f125,f126,f127,f128,f129,f130,f131,f132,f133,f134,f135,f136,f137,f138,f139,f140,f141,f142,f143,f144,f145,f146,f147,f148,f149,f150,f151,f152,f153,f154,f155,f156,f157,f158,f159,f160,f161,f162,f163,f164,f165,f166,f167,f168,f169,f170,f171,f172,f173,f174,f175,f176,f177,f178,f179,f180,f181,f182,f183,f184,f185,f186,f187,f188,f189,f190,f191,f192,f193,f194,f195,f196,f197,f198,f199,f200",
            "secids": ",".join(eastmoney_codes),
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
        }

        print(f"\n请求URL: {url}")
        print(f"secids: {params['secids']}")

        # 尝试不同的请求方式
        # 方式1: 使用原来的ulist.np/get
        response = await collector._make_request(url, params=params, headers={
            "Referer": "https://quote.eastmoney.com",
            "User-Agent": "Mozilla/5.0"
        })

        text = response.get("text", "")
        print(f"\n响应内容 (前800字符):")
        print(text[:800] if text else "(空响应)")

        # 尝试使用不同的API端点
        print("\n" + "-"*60)
        print("尝试使用 /api/qt/stock/get 批量查询...")

        url2 = "https://push2.eastmoney.com/api/qt/stock/get"
        params2 = {
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
            "fltt": 2,
            "invt": 2,
            "fields": "f43,f57,f60,f46,f44,f45,f47,f48,f169,f170",
            "secid": eastmoney_codes[0],  # 只查第一只
        }

        response2 = await collector._make_request(url2, params=params2, headers={
            "Referer": "https://quote.eastmoney.com",
            "User-Agent": "Mozilla/5.0"
        })

        text2 = response2.get("text", "")
        print(f"\n单股响应 (前500字符):")
        print(text2[:500] if text2 else "(空响应)")


async def main():
    await debug_eastmoney_single()
    await debug_eastmoney_batch()


if __name__ == "__main__":
    asyncio.run(main())
