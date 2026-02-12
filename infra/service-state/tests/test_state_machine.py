#!/usr/bin/env python3
"""
服务状态机测试套件

测试场景：
1. Redis不可用，服务应以降级模式启动
2. 依赖服务宕机，服务应标记为降级但保持运行
3. 依赖服务恢复，服务应自动升级到正常模式
4. 循环依赖场景下所有服务应能正常冷启动
"""

import pytest
import asyncio
from unittest.mock import Mock, patch
from datetime import datetime

import sys
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/infra/service-state/src')

from state_machine import (
    ServiceStateMachine,
    ServiceState,
    DependencyStatus,
    Dependency,
    ServiceStateManager
)


class TestServiceStateMachine:
    """服务状态机测试类"""

    @pytest.fixture
    def state_machine(self):
        """创建状态机实例"""
        return ServiceStateMachine("test-service")

    @pytest.fixture
    def mock_redis_check(self):
        """模拟Redis健康检查"""
        return Mock(return_value=True)

    @pytest.fixture
    def mock_db_check(self):
        """模拟数据库健康检查"""
        return Mock(return_value=True)

    def test_initial_state(self, state_machine):
        """测试初始状态为INITIALIZING"""
        assert state_machine.state == ServiceState.INITIALIZING
        assert not state_machine.is_healthy
        assert not state_machine.is_normal
        assert not state_machine.is_degraded

    def test_register_dependency(self, state_machine, mock_redis_check):
        """测试注册依赖"""
        dep = Dependency(
            name="redis",
            check_func=mock_redis_check,
            is_critical=True
        )
        state_machine.register_dependency(dep)

        status = state_machine.get_status()
        assert "redis" in status["dependencies"]
        assert status["dependencies"]["redis"]["is_critical"] is True

    @pytest.mark.asyncio
    async def test_transition_to_normal(self, state_machine, mock_redis_check):
        """测试场景1：所有依赖健康，进入正常模式"""
        # 注册健康依赖
        dep = Dependency(
            name="redis",
            check_func=mock_redis_check,
            is_critical=True
        )
        state_machine.register_dependency(dep)

        # 评估状态
        await state_machine.evaluate_state()

        assert state_machine.state == ServiceState.NORMAL
        assert state_machine.is_healthy
        assert state_machine.is_normal

    @pytest.mark.asyncio
    async def test_transition_to_degraded(self, state_machine):
        """测试场景2：关键依赖不健康，进入降级模式"""
        # 注册不健康依赖
        unhealthy_check = Mock(return_value=False)
        dep = Dependency(
            name="redis",
            check_func=unhealthy_check,
            is_critical=True
        )
        state_machine.register_dependency(dep)

        # 评估状态
        await state_machine.evaluate_state()

        assert state_machine.state == ServiceState.DEGRADED
        assert state_machine.is_healthy  # 降级仍视为健康
        assert state_machine.is_degraded

    @pytest.mark.asyncio
    async def test_recovery_from_degraded(self, state_machine):
        """测试场景3：依赖恢复，自动升级到正常模式"""
        # 初始为不健康
        is_healthy = False
        def check_func():
            return is_healthy

        dep = Dependency(
            name="redis",
            check_func=check_func,
            is_critical=True
        )
        state_machine.register_dependency(dep)

        # 先进入降级模式
        await state_machine.evaluate_state()
        assert state_machine.state == ServiceState.DEGRADED

        # 模拟依赖恢复
        is_healthy = True
        await state_machine.evaluate_state()

        assert state_machine.state == ServiceState.NORMAL

    @pytest.mark.asyncio
    async def test_non_critical_dependency_failure(self, state_machine):
        """测试场景4：非关键依赖失败，仍保持正常模式"""
        # 注册关键依赖（健康）
        critical_dep = Dependency(
            name="redis",
            check_func=Mock(return_value=True),
            is_critical=True
        )
        state_machine.register_dependency(critical_dep)

        # 注册非关键依赖（不健康）
        non_critical_dep = Dependency(
            name="cache",
            check_func=Mock(return_value=False),
            is_critical=False
        )
        state_machine.register_dependency(non_critical_dep)

        await state_machine.evaluate_state()

        # 应保持正常模式
        assert state_machine.state == ServiceState.NORMAL

    @pytest.mark.asyncio
    async def test_circular_dependency_cold_start(self):
        """测试场景5：循环依赖场景下冷启动"""
        # 创建两个相互依赖的服务
        service_a = ServiceStateMachine("service-a")
        service_b = ServiceStateMachine("service-b")

        # 模拟相互依赖（通过共享状态）
        b_healthy = False
        def check_b():
            return b_healthy

        a_healthy = False
        def check_a():
            return a_healthy

        # Service A 依赖 Service B
        service_a.register_dependency(Dependency(
            name="service-b",
            check_func=check_b,
            is_critical=True
        ))

        # Service B 依赖 Service A
        service_b.register_dependency(Dependency(
            name="service-a",
            check_func=check_a,
            is_critical=True
        ))

        # 冷启动：两者都应进入降级模式
        await service_a.evaluate_state()
        await service_b.evaluate_state()

        assert service_a.state == ServiceState.DEGRADED
        assert service_b.state == ServiceState.DEGRADED

        # 模拟两者都恢复
        a_healthy = True
        b_healthy = True

        await service_a.evaluate_state()
        await service_b.evaluate_state()

        # 两者都应进入正常模式
        assert service_a.state == ServiceState.NORMAL
        assert service_b.state == ServiceState.NORMAL

    def test_state_handlers(self, state_machine, mock_redis_check):
        """测试状态处理器"""
        handler_called = []

        def on_normal_enter(state):
            handler_called.append(f"enter_{state.value}")

        def on_transition(old, new, reason):
            handler_called.append(f"transition_{old.value}_to_{new.value}")

        state_machine.on_state_enter(ServiceState.NORMAL, on_normal_enter)
        state_machine.on_transition(ServiceState.INITIALIZING, ServiceState.NORMAL, on_transition)

        # 注册依赖并触发状态转换
        dep = Dependency(
            name="redis",
            check_func=mock_redis_check,
            is_critical=True
        )
        state_machine.register_dependency(dep)

        # 同步执行评估
        asyncio.run(state_machine.evaluate_state())

        assert state_machine.state == ServiceState.NORMAL
        assert "transition_initializing_to_normal" in handler_called
        assert "enter_normal" in handler_called

    def test_get_status(self, state_machine, mock_redis_check):
        """测试获取状态信息"""
        dep = Dependency(
            name="redis",
            check_func=mock_redis_check,
            is_critical=True
        )
        state_machine.register_dependency(dep)

        status = state_machine.get_status()

        assert status["service"] == "test-service"
        assert "state" in status
        assert "dependencies" in status
        assert "transitions" in status
        assert "is_healthy" in status
        assert "is_normal" in status
        assert "is_degraded" in status

    def test_service_state_manager_singleton(self):
        """测试状态管理器单例模式"""
        manager1 = ServiceStateManager()
        manager2 = ServiceStateManager()

        assert manager1 is manager2

    def test_service_state_manager_get_machine(self):
        """测试状态管理器获取状态机"""
        manager = ServiceStateManager()

        machine1 = manager.get_machine("service-1")
        machine2 = manager.get_machine("service-1")
        machine3 = manager.get_machine("service-2")

        assert machine1 is machine2  # 相同名称返回相同实例
        assert machine1 is not machine3  # 不同名称返回不同实例

    def test_multiple_dependencies(self, state_machine):
        """测试多个依赖场景"""
        # 注册多个依赖
        deps = [
            Dependency(name="redis", check_func=Mock(return_value=True), is_critical=True),
            Dependency(name="postgres", check_func=Mock(return_value=True), is_critical=True),
            Dependency(name="kafka", check_func=Mock(return_value=False), is_critical=False),
        ]

        for dep in deps:
            state_machine.register_dependency(dep)

        asyncio.run(state_machine.evaluate_state())

        # 关键依赖都健康，应保持正常
        assert state_machine.state == ServiceState.NORMAL


class TestStateTransitions:
    """状态转换测试类"""

    @pytest.mark.asyncio
    async def test_initializing_to_degraded(self):
        """测试：初始化 -> 降级"""
        sm = ServiceStateMachine("test")
        sm.register_dependency(Dependency(
            name="dep",
            check_func=Mock(return_value=False),
            is_critical=True
        ))

        await sm.evaluate_state()

        assert sm.state == ServiceState.DEGRADED
        transitions = sm.get_status()["transitions"]
        assert len(transitions) == 1
        assert transitions[0]["from"] == "initializing"
        assert transitions[0]["to"] == "degraded"

    @pytest.mark.asyncio
    async def test_normal_to_degraded(self):
        """测试：正常 -> 降级"""
        sm = ServiceStateMachine("test")

        is_healthy = True
        sm.register_dependency(Dependency(
            name="dep",
            check_func=lambda: is_healthy,
            is_critical=True
        ))

        # 先进入正常
        await sm.evaluate_state()
        assert sm.state == ServiceState.NORMAL

        # 依赖失败
        is_healthy = False
        await sm.evaluate_state()

        assert sm.state == ServiceState.DEGRADED

    @pytest.mark.asyncio
    async def test_degraded_to_normal(self):
        """测试：降级 -> 正常"""
        sm = ServiceStateMachine("test")

        is_healthy = False
        sm.register_dependency(Dependency(
            name="dep",
            check_func=lambda: is_healthy,
            is_critical=True
        ))

        # 先进入降级
        await sm.evaluate_state()
        assert sm.state == ServiceState.DEGRADED

        # 依赖恢复
        is_healthy = True
        await sm.evaluate_state()

        assert sm.state == ServiceState.NORMAL


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
