#!/usr/bin/env python3
"""
事件总线监控测试套件

测试场景：
1. 消息堆积超过阈值触发告警
2. 消费延迟超过阈值触发告警
3. 错误率超过阈值触发告警
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime, timedelta
import sys

sys.path.insert(0, '/home/fe-jerome/projects/stock-race/infra/monitoring/src')

from event_bus_monitor import (
    EventBusMonitor,
    AlertRule,
    AlertRuleType,
    AlertLevel,
    Alert,
    StreamMetrics,
    ConsumerGroupMetrics,
    ConsoleAlertHandler
)


class TestEventBusMonitor:
    """事件总线监控器测试类"""

    @pytest.fixture
    def mock_redis(self):
        """创建模拟Redis客户端"""
        mock = AsyncMock()
        return mock

    @pytest.fixture
    def monitor(self, mock_redis):
        """创建监控器实例"""
        return EventBusMonitor(mock_redis, check_interval=1)

    @pytest.mark.asyncio
    async def test_add_alert_rule(self, monitor):
        """测试添加告警规则"""
        rule = AlertRule(
            name="test_rule",
            rule_type=AlertRuleType.PENDING_MESSAGES,
            stream_name="test_stream",
            threshold=100,
            level=AlertLevel.WARNING
        )
        monitor.add_alert_rule(rule)

        assert len(monitor.alert_rules) == 1
        assert monitor.alert_rules[0].name == "test_rule"

    @pytest.mark.asyncio
    async def test_remove_alert_rule(self, monitor):
        """测试移除告警规则"""
        rule = AlertRule(
            name="test_rule",
            rule_type=AlertRuleType.PENDING_MESSAGES,
            stream_name="test_stream",
            threshold=100,
            level=AlertLevel.WARNING
        )
        monitor.add_alert_rule(rule)

        result = monitor.remove_alert_rule("test_rule")
        assert result is True
        assert len(monitor.alert_rules) == 0

        result = monitor.remove_alert_rule("non_existent")
        assert result is False

    @pytest.mark.asyncio
    async def test_get_stream_metrics(self, monitor, mock_redis):
        """测试获取流指标"""
        # 模拟Redis响应
        mock_redis.xinfo_stream.return_value = {
            "length": 1000,
            "pending": 100,
            "last-generated-id": "1234567890-0"
        }
        mock_redis.xinfo_groups.return_value = [
            {"name": "group1", "consumers": 2}
        ]

        metrics = await monitor.get_stream_metrics("test_stream")

        assert metrics is not None
        assert metrics.stream_name == "test_stream"
        assert metrics.total_messages == 1000
        assert metrics.pending_messages == 100
        assert metrics.consumer_groups == 1

    @pytest.mark.asyncio
    async def test_get_consumer_group_metrics(self, monitor, mock_redis):
        """测试获取消费者组指标"""
        mock_redis.xinfo_groups.return_value = [
            {
                "name": "test_group",
                "pending": 50,
                "lag": 100,
                "last-delivered-id": "1234567890-0"
            }
        ]
        mock_redis.xinfo_consumers.return_value = [
            {"name": "consumer1", "idle": 1000},
            {"name": "consumer2", "idle": 400000}  # 空闲超过5分钟
        ]

        metrics = await monitor.get_consumer_group_metrics("test_stream", "test_group")

        assert metrics is not None
        assert metrics.group_name == "test_group"
        assert metrics.pending_messages == 50
        assert metrics.lag == 100
        assert metrics.idle_consumers == 1

    @pytest.mark.asyncio
    async def test_check_pending_messages_alert(self, monitor, mock_redis):
        """测试场景1：消息堆积超过阈值触发告警"""
        # 添加告警规则
        rule = AlertRule(
            name="pending_alert",
            rule_type=AlertRuleType.PENDING_MESSAGES,
            stream_name="test_stream",
            threshold=50,
            level=AlertLevel.WARNING
        )
        monitor.add_alert_rule(rule)

        # 模拟流指标
        mock_redis.xinfo_stream.return_value = {
            "length": 1000,
            "pending": 100,  # 超过阈值50
            "last-generated-id": "1234567890-0"
        }
        mock_redis.xinfo_groups.return_value = []

        # 检查告警
        alerts = await monitor.check_alert_rules()

        assert len(alerts) == 1
        assert alerts[0].rule_name == "pending_alert"
        assert alerts[0].level == AlertLevel.WARNING
        assert "100" in alerts[0].message

    @pytest.mark.asyncio
    async def test_check_consumer_lag_alert(self, monitor, mock_redis):
        """测试场景2：消费延迟超过阈值触发告警"""
        rule = AlertRule(
            name="lag_alert",
            rule_type=AlertRuleType.CONSUMER_LAG,
            stream_name="test_stream",
            threshold=50,
            level=AlertLevel.WARNING
        )
        monitor.add_alert_rule(rule)

        # 模拟消费者组信息
        mock_redis.xinfo_groups.return_value = [
            {
                "name": "test_group",
                "pending": 10,
                "lag": 100  # 超过阈值50
            }
        ]

        alerts = await monitor.check_alert_rules()

        assert len(alerts) == 1
        assert alerts[0].rule_name == "lag_alert"
        assert "100" in alerts[0].message

    @pytest.mark.asyncio
    async def test_check_consumer_idle_alert(self, monitor, mock_redis):
        """测试场景3：消费者空闲超过阈值触发告警"""
        rule = AlertRule(
            name="idle_alert",
            rule_type=AlertRuleType.CONSUMER_IDLE,
            stream_name="test_stream",
            threshold=300,  # 5分钟
            level=AlertLevel.INFO
        )
        monitor.add_alert_rule(rule)

        mock_redis.xinfo_groups.return_value = [
            {"name": "test_group"}
        ]
        # 模拟空闲消费者（超过5分钟）
        mock_redis.xinfo_consumers.return_value = [
            {"name": "consumer1", "idle": 400000},  # 超过5分钟
            {"name": "consumer2", "idle": 1000}     # 未超过
        ]

        alerts = await monitor.check_alert_rules()

        assert len(alerts) == 1
        assert alerts[0].rule_name == "idle_alert"
        assert "1" in alerts[0].message  # 1个空闲消费者

    @pytest.mark.asyncio
    async def test_alert_deduplication(self, monitor, mock_redis):
        """测试告警去重"""
        rule = AlertRule(
            name="dedup_test",
            rule_type=AlertRuleType.PENDING_MESSAGES,
            stream_name="test_stream",
            threshold=50,
            level=AlertLevel.WARNING,
            duration=60  # 60秒内不重复告警
        )
        monitor.add_alert_rule(rule)

        mock_redis.xinfo_stream.return_value = {
            "length": 1000,
            "pending": 100,
            "last-generated-id": "1234567890-0"
        }
        mock_redis.xinfo_groups.return_value = []

        # 第一次检查
        alerts1 = await monitor.check_alert_rules()
        assert len(alerts1) == 1

        # 立即第二次检查（应该被去重）
        alerts2 = await monitor.check_alert_rules()
        assert len(alerts2) == 1

        # 模拟发送告警
        await monitor._send_alert(alerts1[0])

        # 再次检查（应该被去重）
        assert not monitor._should_send_alert(alerts2[0])

    @pytest.mark.asyncio
    async def test_alert_handler(self, monitor, mock_redis):
        """测试告警处理器"""
        handler_called = []

        async def test_handler(alert):
            handler_called.append(alert)

        monitor.on_alert(test_handler)

        rule = AlertRule(
            name="handler_test",
            rule_type=AlertRuleType.PENDING_MESSAGES,
            stream_name="test_stream",
            threshold=50,
            level=AlertLevel.WARNING
        )
        monitor.add_alert_rule(rule)

        mock_redis.xinfo_stream.return_value = {
            "length": 1000,
            "pending": 100,
            "last-generated-id": "1234567890-0"
        }
        mock_redis.xinfo_groups.return_value = []

        alerts = await monitor.check_alert_rules()
        for alert in alerts:
            await monitor._send_alert(alert)

        assert len(handler_called) == 1
        assert handler_called[0].rule_name == "handler_test"

    def test_get_metrics_summary(self, monitor):
        """测试获取监控摘要"""
        summary = monitor.get_metrics_summary()

        assert "alert_rules" in summary
        assert "total_alerts" in summary
        assert "unacknowledged_alerts" in summary
        assert "check_interval" in summary
        assert "is_running" in summary


class TestConsoleAlertHandler:
    """控制台告警处理器测试"""

    @pytest.mark.asyncio
    async def test_handle(self, capsys):
        """测试处理告警"""
        handler = ConsoleAlertHandler()
        alert = Alert(
            id="test_123",
            rule_name="test_rule",
            level=AlertLevel.WARNING,
            message="Test message",
            timestamp=datetime.now(),
            details={"key": "value"}
        )

        await handler.handle(alert)

        captured = capsys.readouterr()
        assert "ALERT" in captured.out
        assert "WARNING" in captured.out
        assert "test_rule" in captured.out
        assert "Test message" in captured.out


class TestAlertLevels:
    """告警级别测试"""

    def test_alert_level_values(self):
        """测试告警级别值"""
        assert AlertLevel.INFO.value == "info"
        assert AlertLevel.WARNING.value == "warning"
        assert AlertLevel.CRITICAL.value == "critical"

    def test_alert_rule_types(self):
        """测试告警规则类型"""
        assert AlertRuleType.PENDING_MESSAGES.value == "pending_messages"
        assert AlertRuleType.CONSUMER_LAG.value == "consumer_lag"
        assert AlertRuleType.ERROR_RATE.value == "error_rate"
        assert AlertRuleType.CONSUMER_IDLE.value == "consumer_idle"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
