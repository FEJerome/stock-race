"""
健康状态报告器
支持多种方式报告健康状态
"""

import json
import logging
from typing import Dict, Any, Optional, Callable
from datetime import datetime

from .checker import HealthChecker, HealthStatus

logger = logging.getLogger(__name__)


class HealthReporter:
    """
    健康状态报告器

    负责将健康状态报告给监控系统或日志
    """

    def __init__(self, checker: HealthChecker):
        """
        初始化报告器

        Args:
            checker: 健康检查器实例
        """
        self.checker = checker
        self._reporters: list = []

    def add_log_reporter(self, level: int = logging.INFO):
        """
        添加日志报告器

        Args:
            level: 日志级别
        """
        def log_reporter(data: Dict[str, Any]):
            if data["status"] == HealthStatus.HEALTHY.value:
                logger.log(level, f"Health check: {data['service']} is healthy")
            elif data["status"] == HealthStatus.DEGRADED.value:
                logger.warning(f"Health check: {data['service']} is degraded - {data['message']}")
            else:
                logger.error(f"Health check: {data['service']} is unhealthy - {data['message']}")

        self._reporters.append(log_reporter)

    def add_callback_reporter(self, callback: Callable[[Dict[str, Any]], None]):
        """
        添加回调报告器

        Args:
            callback: 回调函数，接收健康状态字典
        """
        self._reporters.append(callback)

    def report(self):
        """执行健康状态报告"""
        data = self.checker.to_dict()

        for reporter in self._reporters:
            try:
                reporter(data)
            except Exception as e:
                logger.error(f"Health reporter failed: {e}")

    def get_prometheus_metrics(self) -> str:
        """
        获取Prometheus格式的指标

        Returns:
            Prometheus指标字符串
        """
        data = self.checker.to_dict()
        status_value = 1 if data["status"] == HealthStatus.HEALTHY.value else 0

        metrics = f"""# HELP service_health Service health status (1=healthy, 0=unhealthy)
# TYPE service_health gauge
service_health{{service="{data['service']}"}} {status_value}

# HELP service_health_check_timestamp Last health check timestamp
# TYPE service_health_check_timestamp gauge
service_health_check_timestamp{{service="{data['service']}"}} {int(datetime.now().timestamp())}
"""

        # 添加依赖指标
        for dep_name, dep_data in data.get("dependencies", {}).items():
            dep_status = 1 if dep_data.get("status") == HealthStatus.HEALTHY.value else 0
            metrics += f"""# HELP dependency_health Dependency health status
# TYPE dependency_health gauge
dependency_health{{service="{data['service']}", dependency="{dep_name}"}} {dep_status}
"""

        return metrics

    def get_json_report(self) -> str:
        """
        获取JSON格式的报告

        Returns:
            JSON字符串
        """
        return json.dumps(self.checker.to_dict(), indent=2, ensure_ascii=False)
