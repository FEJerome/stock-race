#!/usr/bin/env python3
"""
测试数据收集器
"""
import asyncio
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "src"))

async def test_sina_collector():
    """测试新浪数据收集器"""
    try:
        from src.data_service.collectors.sina import SinaCollector
        from src.data_service.collectors.base import DataSourceError

        print("测试新浪数据收集器...")
        collector = SinaCollector()

        # 测试股票代码解析
        symbol = "000001.SZ"
        market, code = collector._parse_symbol(symbol)
        print(f"解析股票代码 {symbol}: market={market}, code={code}")

        # 尝试获取数据
        try:
            quote = await collector.get_stock_quote(symbol)
            print(f"获取到数据: {quote}")
        except DataSourceError as e:
            print(f"数据源错误: {e}")
        except Exception as e:
            print(f"其他错误: {type(e).__name__}: {e}")

    except ImportError as e:
        print(f"导入错误: {e}")
    except Exception as e:
        print(f"测试失败: {type(e).__name__}: {e}")

async def test_data_router():
    """测试数据路由器"""
    try:
        from src.data_service.collectors.router import DataSourceRouter

        print("\n测试数据路由器...")
        router = DataSourceRouter()
        await router.initialize()

        # 测试获取股票报价
        symbol = "000001.SZ"
        print(f"尝试获取股票报价: {symbol}")

        quote = await router.get_stock_quote(symbol)
        if quote:
            print(f"获取到报价: {quote}")
        else:
            print("无法获取报价")

        # 显示路由器状态
        stats = router.get_router_stats()
        print(f"\n路由器状态:")
        print(f"  总请求数: {stats['total_requests']}")
        print(f"  成功请求: {stats['successful_requests']}")
        print(f"  失败请求: {stats['failed_requests']}")
        print(f"  数据源数量: {len(stats['data_sources'])}")

        for name, source in stats['data_sources'].items():
            print(f"  {name}: 状态={source['status']}, 可用={source['is_available']}")

    except ImportError as e:
        print(f"导入错误: {e}")
    except Exception as e:
        print(f"测试失败: {type(e).__name__}: {e}")

async def main():
    """主测试函数"""
    print("开始测试数据收集器...")
    await test_sina_collector()
    await test_data_router()
    print("\n测试完成")

if __name__ == "__main__":
    asyncio.run(main())