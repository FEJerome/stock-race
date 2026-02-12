"""
健康检查装饰器
用于FastAPI等Web框架集成
"""

import functools
import logging
from typing import Callable, Optional

from .checker import HealthChecker

logger = logging.getLogger(__name__)


def health_check_endpoint(checker: HealthChecker):
    """
    健康检查端点装饰器

    用于FastAPI/Flask等框架的健康检查端点

    Args:
        checker: 健康检查器实例

    Returns:
        装饰器函数
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            result = checker.get_health()
            if result is None:
                # 如果没有检查结果，执行一次检查
                result = await checker.check_health()
            return checker.to_dict()

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            return checker.to_dict()

        # 根据原始函数类型返回适当的包装器
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


def require_healthy(checker: HealthChecker, allow_degraded: bool = True):
    """
    要求服务健康的装饰器

    如果服务不健康，则返回503错误

    Args:
        checker: 健康检查器实例
        allow_degraded: 是否允许降级运行

    Returns:
        装饰器函数
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            if not checker.is_healthy():
                if not allow_degraded or not checker.is_degraded():
                    from fastapi import HTTPException
                    raise HTTPException(
                        status_code=503,
                        detail=f"Service {checker.service_name} is not healthy"
                    )
            return await func(*args, **kwargs)

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            if not checker.is_healthy():
                if not allow_degraded or not checker.is_degraded():
                    raise Exception(f"Service {checker.service_name} is not healthy")
            return func(*args, **kwargs)

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator
