"""
健康检查核心逻辑
支持服务健康状态检查和依赖服务检查
"""

import asyncio
import logging
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


class HealthStatus(Enum):
    """健康状态枚举"""
    HEALTHY = "healthy"           # 健康
    DEGRADED = "degraded"         # 降级运行
    UNHEALTHY = "unhealthy"       # 不健康
    UNKNOWN = "unknown"           # 未知


@dataclass
class DependencyCheck:
    """依赖检查配置"""
    name: str
    check_func: Callable[[], Any]
    is_critical: bool = True      # 是否为关键依赖
    timeout: float = 5.0          # 检查超时时间
    retry_count: int = 3          # 重试次数
    retry_delay: float = 1.0      # 重试间隔


@dataclass
class HealthCheckResult:
    """健康检查结果"""
    status: HealthStatus
    message: str
    timestamp: datetime
    dependencies: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    metrics: Dict[str, Any] = field(default_factory=dict)


class HealthChecker:
    """
    健康检查器

    负责检查服务自身健康状态和依赖服务健康状态
    """

    def __init__(
        self,
        service_name: str,
        version: str = "1.0.0",
        check_interval: int = 30
    ):
        """
        初始化健康检查器

        Args:
            service_name: 服务名称
            version: 服务版本
            check_interval: 健康检查间隔（秒）
        """
        self.service_name = service_name
        self.version = version
        self.check_interval = check_interval

        self._dependencies: List[DependencyCheck] = []
        self._custom_checks: List[Callable[[], Dict[str, Any]]] = []

        self._last_result: Optional[HealthCheckResult] = None
        self._last_check_time: Optional[datetime] = None
        self._consecutive_failures: Dict[str, int] = {}

        self._running = False
        self._check_task: Optional[asyncio.Task] = None

    def add_dependency(
        self,
        name: str,
        check_func: Callable[[], Any],
        is_critical: bool = True,
        timeout: float = 5.0,
        retry_count: int = 3,
        retry_delay: float = 1.0
    ):
        """
        添加依赖检查

        Args:
            name: 依赖名称
            check_func: 检查函数，返回True表示健康
            is_critical: 是否为关键依赖
            timeout: 检查超时时间
            retry_count: 重试次数
            retry_delay: 重试间隔
        """
        dependency = DependencyCheck(
            name=name,
            check_func=check_func,
            is_critical=is_critical,
            timeout=timeout,
            retry_count=retry_count,
            retry_delay=retry_delay
        )
        self._dependencies.append(dependency)
        self._consecutive_failures[name] = 0
        logger.info(f"Added dependency check: {name} (critical={is_critical})")

    def add_custom_check(self, check_func: Callable[[], Dict[str, Any]]):
        """
        添加自定义健康检查

        Args:
            check_func: 检查函数，返回检查结果字典
        """
        self._custom_checks.append(check_func)
        logger.info("Added custom health check")

    async def check_dependency(self, dependency: DependencyCheck) -> Dict[str, Any]:
        """
        检查单个依赖

        Args:
            dependency: 依赖检查配置

        Returns:
            检查结果字典
        """
        result = {
            "name": dependency.name,
            "critical": dependency.is_critical,
            "status": HealthStatus.UNKNOWN.value,
            "response_time_ms": 0,
            "message": "",
            "last_success": None,
        }

        start_time = datetime.now()

        for attempt in range(dependency.retry_count):
            try:
                # 执行检查
                if asyncio.iscoroutinefunction(dependency.check_func):
                    check_result = await asyncio.wait_for(
                        dependency.check_func(),
                        timeout=dependency.timeout
                    )
                else:
                    check_result = await asyncio.get_event_loop().run_in_executor(
                        None,
                        dependency.check_func
                    )

                response_time = (datetime.now() - start_time).total_seconds() * 1000

                if check_result:
                    result["status"] = HealthStatus.HEALTHY.value
                    result["message"] = "OK"
                    result["response_time_ms"] = round(response_time, 2)
                    result["last_success"] = datetime.now().isoformat()
                    self._consecutive_failures[dependency.name] = 0
                    return result
                else:
                    result["status"] = HealthStatus.UNHEALTHY.value
                    result["message"] = "Check returned False"

            except asyncio.TimeoutError:
                result["status"] = HealthStatus.UNHEALTHY.value
                result["message"] = f"Timeout after {dependency.timeout}s"

            except Exception as e:
                result["status"] = HealthStatus.UNHEALTHY.value
                result["message"] = str(e)

            # 重试
            if attempt < dependency.retry_count - 1:
                await asyncio.sleep(dependency.retry_delay)

        # 所有重试失败
        self._consecutive_failures[dependency.name] += 1
        return result

    async def check_health(self) -> HealthCheckResult:
        """
        执行完整健康检查

        Returns:
            健康检查结果
        """
        timestamp = datetime.now()
        dependencies_status = {}

        # 检查所有依赖
        critical_failures = 0
        non_critical_failures = 0

        for dependency in self._dependencies:
            dep_result = await self.check_dependency(dependency)
            dependencies_status[dependency.name] = dep_result

            if dep_result["status"] != HealthStatus.HEALTHY.value:
                if dependency.is_critical:
                    critical_failures += 1
                else:
                    non_critical_failures += 1

        # 执行自定义检查
        custom_metrics = {}
        for check_func in self._custom_checks:
            try:
                if asyncio.iscoroutinefunction(check_func):
                    metrics = await check_func()
                else:
                    metrics = check_func()
                custom_metrics.update(metrics)
            except Exception as e:
                logger.warning(f"Custom health check failed: {e}")

        # 确定整体状态
        if critical_failures > 0:
            status = HealthStatus.UNHEALTHY
            message = f"{critical_failures} critical dependencies failed"
        elif non_critical_failures > 0:
            status = HealthStatus.DEGRADED
            message = f"{non_critical_failures} non-critical dependencies failed"
        else:
            status = HealthStatus.HEALTHY
            message = "All dependencies healthy"

        result = HealthCheckResult(
            status=status,
            message=message,
            timestamp=timestamp,
            dependencies=dependencies_status,
            metrics=custom_metrics
        )

        self._last_result = result
        self._last_check_time = timestamp

        return result

    def get_health(self) -> Optional[HealthCheckResult]:
        """
        获取最近一次健康检查结果

        Returns:
            健康检查结果，如果没有执行过检查则返回None
        """
        return self._last_result

    def is_healthy(self) -> bool:
        """
        检查服务是否健康

        Returns:
            True如果服务健康
        """
        if self._last_result is None:
            return False
        return self._last_result.status == HealthStatus.HEALTHY

    def is_degraded(self) -> bool:
        """
        检查服务是否降级运行

        Returns:
            True如果服务降级运行
        """
        if self._last_result is None:
            return False
        return self._last_result.status == HealthStatus.DEGRADED

    async def start_periodic_checks(self):
        """启动周期性健康检查"""
        if self._running:
            return

        self._running = True
        logger.info(f"Starting periodic health checks for {self.service_name}")

        while self._running:
            try:
                await self.check_health()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in periodic health check: {e}")
                await asyncio.sleep(self.check_interval)

    def stop_periodic_checks(self):
        """停止周期性健康检查"""
        self._running = False
        if self._check_task:
            self._check_task.cancel()
        logger.info(f"Stopped periodic health checks for {self.service_name}")

    def to_dict(self) -> Dict[str, Any]:
        """
        转换为字典格式

        Returns:
            健康状态字典
        """
        result = self._last_result

        return {
            "service": self.service_name,
            "version": self.version,
            "status": result.status.value if result else HealthStatus.UNKNOWN.value,
            "message": result.message if result else "No health check performed",
            "timestamp": result.timestamp.isoformat() if result else None,
            "dependencies": result.dependencies if result else {},
            "metrics": result.metrics if result else {},
            "check_interval": self.check_interval,
        }
