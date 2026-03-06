#!/usr/bin/env python3
"""
服务启动状态机模块
定义：初始化→降级运行→正常运行的状态流转

使用场景：
- 服务启动时检查依赖状态
- 依赖不可用时进入降级模式
- 依赖恢复后自动升级到正常模式
"""

from enum import Enum, auto
from typing import Dict, List, Callable, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
import asyncio
import logging

logger = logging.getLogger(__name__)


class ServiceState(Enum):
    """服务状态枚举"""
    INITIALIZING = "initializing"      # 初始化中
    DEGRADED = "degraded"               # 降级运行
    NORMAL = "normal"                   # 正常运行
    ERROR = "error"                     # 错误状态
    SHUTDOWN = "shutdown"               # 已关闭


class DependencyStatus(Enum):
    """依赖状态枚举"""
    UNKNOWN = "unknown"                 # 未知
    HEALTHY = "healthy"                 # 健康
    UNHEALTHY = "unhealthy"             # 不健康
    DEGRADED = "degraded"               # 降级


@dataclass
class Dependency:
    """依赖服务定义"""
    name: str
    check_func: Callable[[], bool]
    is_critical: bool = True            # 是否为关键依赖
    retry_interval: int = 5             # 重试间隔（秒）
    max_retries: int = 3                # 最大重试次数
    status: DependencyStatus = field(default=DependencyStatus.UNKNOWN)
    last_check: Optional[datetime] = field(default=None)
    retry_count: int = field(default=0)


@dataclass
class StateTransition:
    """状态转换记录"""
    from_state: ServiceState
    to_state: ServiceState
    timestamp: datetime
    reason: str


class ServiceStateMachine:
    """
    服务状态机

    状态流转图：
    INITIALIZING ──► DEGRADED ──► NORMAL
          │              │
          ▼              ▼
        ERROR ◄──────────┘
          │
          ▼
       SHUTDOWN
    """

    def __init__(self, service_name: str):
        self.service_name = service_name
        self._state = ServiceState.INITIALIZING
        self._dependencies: Dict[str, Dependency] = {}
        self._transitions: List[StateTransition] = []
        self._state_handlers: Dict[ServiceState, List[Callable]] = {
            state: [] for state in ServiceState
        }
        self._transition_handlers: Dict[tuple, List[Callable]] = {}
        self._running = False
        self._monitor_task: Optional[asyncio.Task] = None

    @property
    def state(self) -> ServiceState:
        """获取当前状态"""
        return self._state

    @property
    def is_healthy(self) -> bool:
        """检查服务是否健康"""
        return self._state in [ServiceState.NORMAL, ServiceState.DEGRADED]

    @property
    def is_normal(self) -> bool:
        """检查服务是否正常运行"""
        return self._state == ServiceState.NORMAL

    @property
    def is_degraded(self) -> bool:
        """检查服务是否降级运行"""
        return self._state == ServiceState.DEGRADED

    def register_dependency(self, dependency: Dependency) -> None:
        """注册依赖服务"""
        self._dependencies[dependency.name] = dependency
        logger.info(f"[{self.service_name}] 注册依赖: {dependency.name} "
                   f"(critical={dependency.is_critical})")

    def on_state_enter(self, state: ServiceState, handler: Callable) -> None:
        """注册状态进入处理器"""
        self._state_handlers[state].append(handler)

    def on_state_exit(self, state: ServiceState, handler: Callable) -> None:
        """注册状态退出处理器"""
        # 实际实现中需要存储退出处理器
        pass

    def on_transition(self, from_state: ServiceState, to_state: ServiceState,
                      handler: Callable) -> None:
        """注册状态转换处理器"""
        key = (from_state, to_state)
        if key not in self._transition_handlers:
            self._transition_handlers[key] = []
        self._transition_handlers[key].append(handler)

    def _transition_to(self, new_state: ServiceState, reason: str) -> None:
        """执行状态转换"""
        if self._state == new_state:
            return

        old_state = self._state
        self._state = new_state

        # 记录转换
        transition = StateTransition(
            from_state=old_state,
            to_state=new_state,
            timestamp=datetime.now(),
            reason=reason
        )
        self._transitions.append(transition)

        logger.info(f"[{self.service_name}] 状态转换: {old_state.value} -> {new_state.value}, "
                   f"原因: {reason}")

        # 执行转换处理器
        key = (old_state, new_state)
        if key in self._transition_handlers:
            for handler in self._transition_handlers[key]:
                try:
                    handler(old_state, new_state, reason)
                except Exception as e:
                    logger.error(f"[{self.service_name}] 转换处理器错误: {e}")

        # 执行状态进入处理器
        for handler in self._state_handlers[new_state]:
            try:
                handler(new_state)
            except Exception as e:
                logger.error(f"[{self.service_name}] 状态处理器错误: {e}")

    async def check_dependencies(self) -> Dict[str, DependencyStatus]:
        """检查所有依赖状态"""
        results = {}

        for name, dep in self._dependencies.items():
            try:
                # 执行健康检查
                is_healthy = await asyncio.get_event_loop().run_in_executor(
                    None, dep.check_func
                )

                dep.last_check = datetime.now()

                if is_healthy:
                    dep.status = DependencyStatus.HEALTHY
                    dep.retry_count = 0
                else:
                    dep.status = DependencyStatus.UNHEALTHY
                    dep.retry_count += 1

            except Exception as e:
                logger.error(f"[{self.service_name}] 检查依赖 {name} 失败: {e}")
                dep.status = DependencyStatus.UNHEALTHY
                dep.retry_count += 1

            results[name] = dep.status

        return results

    async def evaluate_state(self) -> None:
        """评估并更新服务状态"""
        # 检查依赖状态
        dep_statuses = await self.check_dependencies()

        # 统计依赖状态
        critical_deps = [d for d in self._dependencies.values() if d.is_critical]
        healthy_critical = sum(1 for d in critical_deps if d.status == DependencyStatus.HEALTHY)
        total_critical = len(critical_deps)

        all_deps = list(self._dependencies.values())
        healthy_all = sum(1 for d in all_deps if d.status == DependencyStatus.HEALTHY)
        total_all = len(all_deps)

        # 状态转换逻辑
        if self._state == ServiceState.INITIALIZING:
            # 初始化完成后，根据依赖状态决定下一步
            if total_critical == 0 or healthy_critical == total_critical:
                # 所有关键依赖健康，进入正常模式
                self._transition_to(ServiceState.NORMAL, "所有关键依赖健康")
            elif healthy_critical > 0:
                # 部分关键依赖健康，进入降级模式
                self._transition_to(ServiceState.DEGRADED,
                                   f"部分关键依赖健康 ({healthy_critical}/{total_critical})")
            else:
                # 无关键依赖健康，保持降级（或错误）
                self._transition_to(ServiceState.DEGRADED, "无关键依赖健康，降级运行")

        elif self._state == ServiceState.NORMAL:
            # 正常模式下，检查是否需要降级
            if healthy_critical < total_critical:
                # 关键依赖不健康，降级
                self._transition_to(ServiceState.DEGRADED,
                                   f"关键依赖异常 ({healthy_critical}/{total_critical})")

        elif self._state == ServiceState.DEGRADED:
            # 降级模式下，检查是否可以恢复
            if healthy_critical == total_critical:
                # 所有关键依赖恢复，进入正常模式
                self._transition_to(ServiceState.NORMAL, "所有关键依赖恢复")

        elif self._state == ServiceState.ERROR:
            # 错误状态下，尝试恢复
            if healthy_critical > 0:
                self._transition_to(ServiceState.DEGRADED,
                                   f"从错误恢复，部分依赖健康 ({healthy_critical}/{total_critical})")

    async def start(self, check_interval: int = 10) -> None:
        """启动状态机监控"""
        if self._running:
            return

        self._running = True
        logger.info(f"[{self.service_name}] 状态机启动，当前状态: {self._state.value}")

        # 初始评估
        await self.evaluate_state()

        # 启动监控循环
        while self._running:
            try:
                await asyncio.sleep(check_interval)
                await self.evaluate_state()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[{self.service_name}] 状态监控错误: {e}")

    async def stop(self) -> None:
        """停止状态机"""
        self._running = False
        self._transition_to(ServiceState.SHUTDOWN, "服务关闭")
        logger.info(f"[{self.service_name}] 状态机停止")

    def get_status(self) -> Dict[str, Any]:
        """获取服务状态信息"""
        return {
            "service": self.service_name,
            "state": self._state.value,
            "is_healthy": self.is_healthy,
            "is_normal": self.is_normal,
            "is_degraded": self.is_degraded,
            "dependencies": {
                name: {
                    "status": dep.status.value,
                    "is_critical": dep.is_critical,
                    "last_check": dep.last_check.isoformat() if dep.last_check else None,
                    "retry_count": dep.retry_count
                }
                for name, dep in self._dependencies.items()
            },
            "transitions": [
                {
                    "from": t.from_state.value,
                    "to": t.to_state.value,
                    "timestamp": t.timestamp.isoformat(),
                    "reason": t.reason
                }
                for t in self._transitions[-10:]  # 最近10次转换
            ]
        }


class ServiceStateManager:
    """服务状态管理器（单例）"""
    _instance: Optional['ServiceStateManager'] = None
    _machines: Dict[str, ServiceStateMachine] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def get_machine(self, service_name: str) -> ServiceStateMachine:
        """获取或创建状态机"""
        if service_name not in self._machines:
            self._machines[service_name] = ServiceStateMachine(service_name)
        return self._machines[service_name]

    def get_all_status(self) -> Dict[str, Dict[str, Any]]:
        """获取所有服务状态"""
        return {
            name: machine.get_status()
            for name, machine in self._machines.items()
        }


# 便捷函数
def get_state_machine(service_name: str) -> ServiceStateMachine:
    """获取服务状态机"""
    manager = ServiceStateManager()
    return manager.get_machine(service_name)
