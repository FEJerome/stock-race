#!/usr/bin/env python3
"""
News Service 状态检查脚本

用于检查服务健康状态和运行模式
"""

import sys
from pathlib import Path

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root / "src"))
sys.path.insert(0, str(project_root / "../infra/event-bus/src"))
sys.path.insert(0, str(project_root / "../infra/health-check/src"))

import asyncio
from news_service.main import NewsService


async def check_service():
    """检查服务状态"""
    service = NewsService()

    print("=" * 60)
    print("News Service 状态检查")
    print("=" * 60)

    try:
        # 初始化健康检查器
        await service._init_health_checker()

        # 执行健康检查
        result = await service.health_checker.check_health()

        # 显示整体状态
        status_icon = "OK" if result.status.value == "healthy" else "WARN"
        print(f"\n整体状态: [{status_icon}] {result.status.value}")
        print(f"检查时间: {result.timestamp}")
        print(f"消息: {result.message}")

        # 显示依赖状态
        print("\n依赖服务状态:")
        print("-" * 60)
        for name, dep in result.dependencies.items():
            status = "OK" if dep['status'] == 'healthy' else "FAIL"
            critical = "关键" if dep['critical'] else "非关键"
            print(f"  [{status}] {name} ({critical})")
            print(f"       状态: {dep['status']}")
            print(f"       响应时间: {dep['response_time_ms']:.2f}ms")
            print(f"       消息: {dep['message']}")
            print()

        # 显示建议
        print("-" * 60)
        if result.status.value == "healthy":
            print("建议: 服务运行正常，可以正常处理请求")
        elif result.status.value == "degraded":
            print("建议: 服务处于降级模式，部分功能受限")
            print("      建议检查非关键依赖服务状态")
        else:
            print("建议: 服务不健康，请检查关键依赖服务")

    except Exception as e:
        print(f"\n[ERROR] 状态检查失败: {e}")
        import traceback
        traceback.print_exc()

    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(check_service())
