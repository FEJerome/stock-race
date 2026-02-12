#!/usr/bin/env python3
"""
测试News Service降级模式
"""

import sys
from pathlib import Path

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root / "src"))
sys.path.insert(0, str(project_root / "../infra/event-bus/src"))
sys.path.insert(0, str(project_root / "../infra/health-check/src"))

import asyncio
from news_service.main import NewsService, ServiceMode


async def test_degraded_mode():
    service = NewsService()

    # 模拟Redis检查失败
    def mock_redis_fail():
        return False

    def mock_deepseek_ok():
        return True

    # 初始化
    await service._init_health_checker()

    # 替换检查函数
    for dep in service.health_checker._dependencies:
        if dep.name == 'redis':
            dep.check_func = mock_redis_fail
        elif dep.name == 'deepseek_api':
            dep.check_func = mock_deepseek_ok

    # 执行健康检查
    result = await service.health_checker.check_health()

    print('=' * 60)
    print('News Service 降级模式测试')
    print('=' * 60)
    print(f'健康检查结果: {result.status.value}')
    print(f'检查消息: {result.message}')

    # 根据健康状态设置模式
    if result.status.value == 'degraded':
        await service._set_mode(ServiceMode.DEGRADED)

    print(f'运行模式: {service.mode.value}')
    print('-' * 60)

    # 显示依赖状态
    print('依赖服务状态:')
    for name, dep in result.dependencies.items():
        status = 'OK' if dep['status'] == 'healthy' else 'FAIL'
        print(f'  [{status}] {name}: {dep["status"]}')

    print('-' * 60)
    print('降级模式配置:')
    print(f'  使用缓存: {service._degraded_config["use_cache"]}')
    print(f'  禁用AI分析: {service._degraded_config["disable_ai_analysis"]}')
    print(f'  限制数据源: {service._degraded_config["limited_sources"]}')


if __name__ == "__main__":
    asyncio.run(test_degraded_mode())
