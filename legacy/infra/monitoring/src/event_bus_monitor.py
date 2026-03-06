#!/usr/bin/env python3
"""
事件总线监控模块

监控指标：
- 消息堆积（Pending messages）
- 消费延迟（Consumer lag）
- 错误率（Error rate）

告警机制：
- 阈值告警
- 告警级别（INFO/WARNING/CRITICAL）
- 多渠道通知（日志/Webhook）
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Callable, Any
import redis.asyncio as redis

logger = logging.getLogger(__name__)


class AlertLevel(Enum):
    """告警级别"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertRuleType(Enum):
    """告警规则类型"""
    PENDING_MESSAGES = "pending_messages"      # 消息堆积
    CONSUMER_LAG = "consumer_lag"              # 消费延迟
    ERROR_RATE = "error_rate"                  # 错误率
    CONSUMER_IDLE = "consumer_idle"            # 消费者空闲


@dataclass
class AlertRule:
    """告警规则"""
    name: str
    rule_type: AlertRuleType
    stream_name: str
    threshold: int
    level: AlertLevel
    duration: int = 60                          # 持续时间（秒）
    enabled: bool = True
    description: str = ""


@dataclass
class Alert:
    """告警记录"""
    id: str
    rule_name: str
    level: AlertLevel
    message: str
    timestamp: datetime
    details: Dict[str, Any] = field(default_factory=dict)
    acknowledged: bool = False


@dataclass
class StreamMetrics:
    """流指标"""
    stream_name: str
    total_messages: int
    pending_messages: int
    consumer_groups: int
    last_message_id: str
    timestamp: datetime


@dataclass
class ConsumerGroupMetrics:
    """消费者组指标"""
    group_name: str
    stream_name: str
    consumers: int
    pending_messages: int
    lag: int                                    # 消费延迟
    idle_consumers: int                         # 空闲消费者
    last_delivered_id: str
    timestamp: datetime


class EventBusMonitor:
    """事件总线监控器"""

    def __init__(self, redis_client: redis.Redis, check_interval: int = 30):
        self.redis = redis_client
        self.check_interval = check_interval
        self.alert_rules: List[AlertRule] = []
        self.alerts: List[Alert] = []
        self.alert_handlers: List[Callable[[Alert], None]] = []
        self._running = False
        self._monitor_task: Optional[asyncio.Task] = None
        self._alert_history: Dict[str, datetime] = {}  # 防止重复告警

    def add_alert_rule(self, rule: AlertRule) -> None:
        """添加告警规则"""
        self.alert_rules.append(rule)
        logger.info(f"添加告警规则: {rule.name} ({rule.rule_type.value})")

    def remove_alert_rule(self, rule_name: str) -> bool:
        """移除告警规则"""
        for i, rule in enumerate(self.alert_rules):
            if rule.name == rule_name:
                self.alert_rules.pop(i)
                return True
        return False

    def on_alert(self, handler: Callable[[Alert], None]) -> None:
        """注册告警处理器"""
        self.alert_handlers.append(handler)

    async def get_stream_metrics(self, stream_name: str) -> Optional[StreamMetrics]:
        """获取流指标"""
        try:
            # 获取流信息
            info = await self.redis.xinfo_stream(stream_name)

            # 获取消费者组信息
            groups = await self.redis.xinfo_groups(stream_name)

            return StreamMetrics(
                stream_name=stream_name,
                total_messages=info.get("length", 0),
                pending_messages=info.get("pending", 0),
                consumer_groups=len(groups),
                last_message_id=info.get("last-generated-id", "0-0"),
                timestamp=datetime.now()
            )
        except Exception as e:
            logger.error(f"获取流 {stream_name} 指标失败: {e}")
            return None

    async def get_consumer_group_metrics(self, stream_name: str,
                                         group_name: str) -> Optional[ConsumerGroupMetrics]:
        """获取消费者组指标"""
        try:
            # 获取消费者组信息
            groups = await self.redis.xinfo_groups(stream_name)

            for group in groups:
                if group.get("name") == group_name:
                    # 获取消费者信息
                    consumers = await self.redis.xinfo_consumers(stream_name, group_name)

                    # 计算空闲消费者
                    idle_consumers = sum(
                        1 for c in consumers
                        if c.get("idle", 0) > 300000  # 5分钟无活动
                    )

                    return ConsumerGroupMetrics(
                        group_name=group_name,
                        stream_name=stream_name,
                        consumers=len(consumers),
                        pending_messages=group.get("pending", 0),
                        lag=group.get("lag", 0),
                        idle_consumers=idle_consumers,
                        last_delivered_id=group.get("last-delivered-id", "0-0"),
                        timestamp=datetime.now()
                    )

            return None
        except Exception as e:
            logger.error(f"获取消费者组 {group_name} 指标失败: {e}")
            return None

    async def check_alert_rules(self) -> List[Alert]:
        """检查告警规则"""
        triggered_alerts = []

        for rule in self.alert_rules:
            if not rule.enabled:
                continue

            try:
                if rule.rule_type == AlertRuleType.PENDING_MESSAGES:
                    metrics = await self.get_stream_metrics(rule.stream_name)
                    if metrics and metrics.pending_messages > rule.threshold:
                        alert = self._create_alert(
                            rule,
                            f"消息堆积告警: {metrics.pending_messages} 条消息待处理",
                            {"pending_count": metrics.pending_messages}
                        )
                        triggered_alerts.append(alert)

                elif rule.rule_type == AlertRuleType.CONSUMER_LAG:
                    # 获取所有消费者组
                    groups = await self.redis.xinfo_groups(rule.stream_name)
                    for group in groups:
                        lag = group.get("lag", 0)
                        if lag > rule.threshold:
                            alert = self._create_alert(
                                rule,
                                f"消费延迟告警: 消费者组 {group['name']} 延迟 {lag} 条消息",
                                {"group_name": group["name"], "lag": lag}
                            )
                            triggered_alerts.append(alert)

                elif rule.rule_type == AlertRuleType.CONSUMER_IDLE:
                    # 检查空闲消费者
                    groups = await self.redis.xinfo_groups(rule.stream_name)
                    for group in groups:
                        consumers = await self.redis.xinfo_consumers(
                            rule.stream_name, group["name"]
                        )
                        idle_count = sum(
                            1 for c in consumers
                            if c.get("idle", 0) > rule.threshold * 1000
                        )
                        if idle_count > 0:
                            alert = self._create_alert(
                                rule,
                                f"消费者空闲告警: {idle_count} 个消费者超过 {rule.threshold} 秒无活动",
                                {"group_name": group["name"], "idle_count": idle_count}
                            )
                            triggered_alerts.append(alert)

            except Exception as e:
                logger.error(f"检查告警规则 {rule.name} 失败: {e}")

        return triggered_alerts

    def _create_alert(self, rule: AlertRule, message: str,
                      details: Dict[str, Any]) -> Alert:
        """创建告警"""
        alert_id = f"{rule.name}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        return Alert(
            id=alert_id,
            rule_name=rule.name,
            level=rule.level,
            message=message,
            timestamp=datetime.now(),
            details=details
        )

    def _should_send_alert(self, alert: Alert) -> bool:
        """检查是否应该发送告警（防止重复）"""
        key = f"{alert.rule_name}:{alert.level.value}"
        last_alert = self._alert_history.get(key)

        if last_alert is None:
            return True

        # 获取规则
        rule = next((r for r in self.alert_rules if r.name == alert.rule_name), None)
        if rule is None:
            return True

        # 检查是否超过持续时间
        cooldown = timedelta(seconds=rule.duration)
        if datetime.now() - last_alert > cooldown:
            return True

        return False

    async def _send_alert(self, alert: Alert) -> None:
        """发送告警"""
        if not self._should_send_alert(alert):
            return

        # 记录告警历史
        key = f"{alert.rule_name}:{alert.level.value}"
        self._alert_history[key] = datetime.now()

        # 添加到告警列表
        self.alerts.append(alert)

        # 调用告警处理器
        for handler in self.alert_handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(alert)
                else:
                    handler(alert)
            except Exception as e:
                logger.error(f"告警处理器错误: {e}")

        # 记录日志
        log_func = {
            AlertLevel.INFO: logger.info,
            AlertLevel.WARNING: logger.warning,
            AlertLevel.CRITICAL: logger.error
        }.get(alert.level, logger.info)

        log_func(f"[ALERT-{alert.level.value.upper()}] {alert.message}")

    async def start(self) -> None:
        """启动监控"""
        if self._running:
            return

        self._running = True
        logger.info("事件总线监控器启动")

        while self._running:
            try:
                # 检查告警规则
                alerts = await self.check_alert_rules()
                for alert in alerts:
                    await self._send_alert(alert)

                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"监控循环错误: {e}")
                await asyncio.sleep(self.check_interval)

    async def stop(self) -> None:
        """停止监控"""
        self._running = False
        logger.info("事件总线监控器停止")

    def get_metrics_summary(self) -> Dict[str, Any]:
        """获取监控摘要"""
        return {
            "alert_rules": len(self.alert_rules),
            "total_alerts": len(self.alerts),
            "unacknowledged_alerts": sum(1 for a in self.alerts if not a.acknowledged),
            "check_interval": self.check_interval,
            "is_running": self._running
        }


class ConsoleAlertHandler:
    """控制台告警处理器"""

    async def handle(self, alert: Alert) -> None:
        """处理告警"""
        print(f"\n{'='*60}")
        print(f"[ALERT] {alert.level.value.upper()}")
        print(f"Rule: {alert.rule_name}")
        print(f"Time: {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Message: {alert.message}")
        if alert.details:
            print(f"Details: {json.dumps(alert.details, indent=2)}")
        print(f"{'='*60}\n")


class WebhookAlertHandler:
    """Webhook告警处理器"""

    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url

    async def handle(self, alert: Alert) -> None:
        """发送告警到Webhook"""
        import aiohttp

        payload = {
            "level": alert.level.value,
            "rule": alert.rule_name,
            "message": alert.message,
            "timestamp": alert.timestamp.isoformat(),
            "details": alert.details
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.webhook_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status != 200:
                        logger.warning(f"Webhook告警发送失败: {response.status}")
        except Exception as e:
            logger.error(f"Webhook告警发送异常: {e}")


# 便捷函数
def create_default_monitor(redis_host: str = "localhost",
                           redis_port: int = 6379) -> EventBusMonitor:
    """创建默认监控器"""
    redis_client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
    monitor = EventBusMonitor(redis_client)

    # 添加默认告警规则
    monitor.add_alert_rule(AlertRule(
        name="pending_messages_high",
        rule_type=AlertRuleType.PENDING_MESSAGES,
        stream_name="event-bus:*",
        threshold=1000,
        level=AlertLevel.WARNING,
        description="消息堆积超过1000条"
    ))

    monitor.add_alert_rule(AlertRule(
        name="consumer_lag_high",
        rule_type=AlertRuleType.CONSUMER_LAG,
        stream_name="event-bus:*",
        threshold=100,
        level=AlertLevel.WARNING,
        description="消费延迟超过100条"
    ))

    monitor.add_alert_rule(AlertRule(
        name="consumer_idle_warning",
        rule_type=AlertRuleType.CONSUMER_IDLE,
        stream_name="event-bus:*",
        threshold=300,  # 5分钟
        level=AlertLevel.INFO,
        description="消费者超过5分钟无活动"
    ))

    return monitor
