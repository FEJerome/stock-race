"""
统一健康检查SDK
支持服务健康状态检查、依赖服务检查和状态报告
"""

from .checker import HealthChecker, HealthStatus
from .reporter import HealthReporter
from .decorators import health_check_endpoint, require_healthy

__version__ = "1.0.0"
__all__ = [
    "HealthChecker",
    "HealthStatus",
    "HealthReporter",
    "health_check_endpoint",
    "require_healthy",
]
