#!/usr/bin/env python3
"""
测试数据服务
"""
import asyncio
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "src"))

async def test_data_service():
    """测试数据服务"""
    try:
        from data_service.services.data_service import DataService
        from data_service.models.stock import StockQuote

        print("测试数据服务...")
        service = DataService()
        await service.initialize()

        # 测试获取股票报价
        symbol = "000001.SZ"
        print(f"尝试获取股票报价: {symbol}")

        quote = await service.get_stock_quote(symbol)
        if quote:
            print(f"成功获取报价:")
            print(f"  股票代码: {quote.symbol}")
            print(f"  价格: {quote.price}")
            print(f"  涨跌: {quote.change} ({quote.change_percent}%)")
            print(f"  时间戳: {quote.timestamp}")
            print(f"  类型: {type(quote)}")

            # 尝试转换为字典
            try:
                quote_dict = quote.dict()
                print(f"  转换为字典成功: {len(quote_dict)} 个字段")
            except Exception as e:
                print(f"  转换为字典失败: {e}")
        else:
            print("无法获取报价 (返回None)")

        # 测试数据处理器
        print("\n测试数据处理器...")
        from data_service.processors.data_processor import DataProcessor
        processor = DataProcessor()

        # 创建测试数据
        test_data = {
            "symbol": "000001.SZ",
            "price": 10.97,
            "open": 10.85,
            "high": 10.98,
            "low": 10.84,
            "prev_close": 10.84,
            "volume": 69541547,
            "amount": 760107689.09,
            "timestamp": "2026-02-04T15:00:00",
            "change": 0.13,
            "change_percent": 1.199
        }

        try:
            cleaned_quote = processor.clean_stock_quote(test_data)
            print(f"数据清理成功: {cleaned_quote.symbol}")
            print(f"  类型: {type(cleaned_quote)}")

            # 尝试转换为字典
            try:
                cleaned_dict = cleaned_quote.dict()
                print(f"  转换为字典成功: {len(cleaned_dict)} 个字段")
            except Exception as e:
                print(f"  转换为字典失败: {e}")
        except Exception as e:
            print(f"数据清理失败: {type(e).__name__}: {e}")

    except ImportError as e:
        print(f"导入错误: {e}")
    except Exception as e:
        print(f"测试失败: {type(e).__name__}: {e}")

async def main():
    """主测试函数"""
    print("开始测试数据服务...")
    await test_data_service()
    print("\n测试完成")

if __name__ == "__main__":
    asyncio.run(main())