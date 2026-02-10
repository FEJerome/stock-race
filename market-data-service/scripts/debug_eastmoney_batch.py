#!/usr/bin/env python3
"""
东方财富批量查询详细调试
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from data_service.collectors.eastmoney import EastMoneyCollector


TEST_SYMBOLS = ["000001.SZ", "600519.SH"]


async def debug_batch():
    """调试东方财富批量查询"""
    print("="*60)
    print("东方财富 - 批量查询详细调试")
    print("="*60)

    async with EastMoneyCollector() as collector:
        # 构建参数
        eastmoney_codes = []
        symbol_map = {}
        for symbol in TEST_SYMBOLS:
            market, code = collector._parse_symbol(symbol)
            em_code = f"{1 if market == 'SH' else 0}.{code}"
            eastmoney_codes.append(em_code)
            symbol_map[code] = symbol

        print(f"\n1. 请求参数:")
        print(f"   secids: {','.join(eastmoney_codes)}")
        print(f"   symbol_map: {symbol_map}")

        url = f"{collector.base_url}/api/qt/ulist.np/get"
        params = {
            "fields": "f2,f3,f4,f5,f6,f12,f14,f15,f16,f17,f18",
            "secids": ",".join(eastmoney_codes),
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
        }

        print(f"\n2. 发送请求:")
        print(f"   URL: {url}")
        print(f"   Params: {params}")

        # 发送请求
        response = await collector._make_request(url, params=params, headers={
            "Referer": "https://quote.eastmoney.com",
            "User-Agent": "Mozilla/5.0"
        })

        text = response.get("text", "")
        print(f"\n3. 响应结果:")
        print(f"   长度: {len(text)}")
        print(f"   内容: {text[:800] if text else '(空)'}")

        # 解析响应
        if text:
            import json
            import re

            try:
                # 尝试解析
                text = text.strip()
                if text.startswith('jQuery'):
                    match = re.search(r'jQuery\d+_\d+\((.*?)\);', text, re.DOTALL)
                    data = json.loads(match.group(1)) if match else {}
                else:
                    data = json.loads(text)

                print(f"\n4. 解析结果:")
                print(f"   data: {data}")

                diff = data.get("data", {}).get("diff", [])
                print(f"   diff数量: {len(diff)}")

                for item in diff:
                    print(f"\n   项目: {item}")
                    code = item.get("f12", "")
                    print(f"   - code(f12): {code}")
                    print(f"   - name(f14): {item.get('f14')}")
                    print(f"   - price(f2): {item.get('f2')}")

            except Exception as e:
                print(f"\n   解析失败: {e}")
                import traceback
                traceback.print_exc()


async def main():
    await debug_batch()


if __name__ == "__main__":
    asyncio.run(main())
