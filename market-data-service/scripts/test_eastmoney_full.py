#!/usr/bin/env python3
"""
东方财富API调试脚本 - 带完整headers
"""

import asyncio
import aiohttp

TEST_CODES = ["0.000001", "1.600519"]


async def test_with_session():
    """使用完整headers测试东方财富API"""
    print("="*60)
    print("东方财富API测试 - 完整Headers")
    print("="*60)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://quote.eastmoney.com/",
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9",
    }

    async with aiohttp.ClientSession(headers=headers) as session:
        print("\n1. 测试单股查询:")
        url1 = "https://push2.eastmoney.com/api/qt/stock/get"
        params1 = {
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
            "fltt": 2,
            "invt": 2,
            "fields": "f43,f57,f60,f46,f44,f45,f47,f48,f169,f170,f12,f14",
            "secid": TEST_CODES[0],
        }

        try:
            async with session.get(url1, params=params1, timeout=10) as resp:
                text = await resp.text()
                print(f"   状态码: {resp.status}")
                print(f"   响应长度: {len(text)}")
                print(f"   响应内容: {text[:300] if text else '(空)'}")
        except Exception as e:
            print(f"   请求失败: {e}")


async def main():
    await test_with_session()


if __name__ == "__main__":
    asyncio.run(main())
