"""
热情报批量推送实现

NS-D-002: 每2分钟发布`news:hot_intelligence_update`事件到事件总线
"""

import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

# NS-D-004: 允许的推送间隔（分钟）
ALLOWED_PUSH_INTERVALS = [1, 2, 5]


class HotIntelligencePusher:
    """
    热情报推送器

    定时从 HotIntelligenceSelector 获取热情报，
    并通过事件总线发布到 Redis Streams。

    配置:
    - push_interval_minutes: 推送间隔（分钟），默认2分钟
    - event_type: 事件类型，默认 "news:hot_intelligence_update"
    """

    def __init__(
        self,
        selector: Any,
        event_producer: Any,
        push_interval_minutes: int = 2,
    ):
        """
        初始化热情报推送器

        NS-D-004: 支持配置推送间隔（1/2/5分钟）

        Args:
            selector: HotIntelligenceSelector 实例
            event_producer: EventProducer 实例（事件总线）
            push_interval_minutes: 推送间隔分钟数（默认2分钟，可选1/2/5）

        Raises:
            ValueError: 如果 push_interval_minutes 不是允许的值（1, 2, 5）
        """
        # 验证推送间隔
        self._validate_push_interval(push_interval_minutes)

        self.selector = selector
        self.event_producer = event_producer
        self.push_interval_minutes = push_interval_minutes

        self._scheduler: Optional[AsyncIOScheduler] = None
        self._is_running = False

    def _validate_push_interval(self, interval: int) -> None:
        """
        验证推送间隔是否有效

        NS-D-004: 只允许 1, 2, 5 分钟

        Args:
            interval: 推送间隔（分钟）

        Raises:
            ValueError: 如果间隔无效
        """
        if interval not in ALLOWED_PUSH_INTERVALS:
            raise ValueError(
                f"Invalid push interval: {interval} minutes. "
                f"Allowed values are: {ALLOWED_PUSH_INTERVALS}"
            )

    async def update_push_interval(self, new_interval: int) -> bool:
        """
        更新推送间隔

        NS-D-004: 支持运行时动态调整推送频率

        Args:
            new_interval: 新的推送间隔（分钟，必须是1/2/5）

        Returns:
            bool: 更新成功返回 True，失败返回 False
        """
        try:
            # 验证新间隔
            self._validate_push_interval(new_interval)

            # 如果间隔相同，无需更新
            if new_interval == self.push_interval_minutes:
                logger.info(f"Push interval is already {new_interval} minutes")
                return True

            old_interval = self.push_interval_minutes
            self.push_interval_minutes = new_interval

            # 如果正在运行，重启调度器以应用新间隔
            if self._is_running and self._scheduler:
                await self._restart_scheduler()

            logger.info(
                f"Push interval updated from {old_interval}min to {new_interval}min"
            )
            return True

        except ValueError as e:
            logger.error(f"Failed to update push interval: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error updating push interval: {e}")
            return False

    async def _restart_scheduler(self) -> bool:
        """
        重启调度器以应用新的推送间隔

        Returns:
            bool: 重启成功返回 True
        """
        try:
            # 停止当前调度器
            if self._scheduler:
                self._scheduler.shutdown(wait=True)

            # 创建新的调度器
            self._scheduler = AsyncIOScheduler()

            # 添加定时任务
            self._scheduler.add_job(
                self.push_hot_intelligence,
                trigger=IntervalTrigger(minutes=self.push_interval_minutes),
                id="hot_intelligence_push_job",
                name="Push hot intelligence to event bus",
                replace_existing=True,
            )

            # 启动调度器
            self._scheduler.start()

            logger.info(f"Scheduler restarted with {self.push_interval_minutes}min interval")
            return True

        except Exception as e:
            logger.error(f"Failed to restart scheduler: {e}")
            return False

    def get_available_intervals(self) -> List[int]:
        """
        获取可用的推送间隔列表

        NS-D-004: 返回所有允许的推送间隔

        Returns:
            List[int]: 允许的间隔列表 [1, 2, 5]
        """
        return ALLOWED_PUSH_INTERVALS.copy()

    def get_interval_config(self) -> Dict[str, Any]:
        """
        获取推送间隔配置信息

        NS-D-004: 获取当前配置和可用选项

        Returns:
            Dict: 配置信息
                - current: 当前间隔
                - available: 可用间隔列表
                - unit: 单位（minutes）
        """
        return {
            "current": self.push_interval_minutes,
            "available": self.get_available_intervals(),
            "unit": "minutes",
        }

    @property
    def is_running(self) -> bool:
        """检查推送器是否正在运行"""
        return self._is_running

    async def start(self) -> None:
        """
        启动定时推送任务

        创建 APScheduler 定时任务，按配置间隔自动推送热情报。
        """
        if self._is_running:
            logger.warning("Hot intelligence pusher is already running")
            return

        try:
            self._scheduler = AsyncIOScheduler()

            # 添加定时任务
            self._scheduler.add_job(
                self.push_hot_intelligence,
                trigger=IntervalTrigger(minutes=self.push_interval_minutes),
                id="hot_intelligence_push_job",
                name="Push hot intelligence to event bus",
                replace_existing=True,
            )

            self._scheduler.start()
            self._is_running = True

            logger.info(
                f"Hot intelligence pusher started with "
                f"{self.push_interval_minutes}min interval"
            )

        except Exception as e:
            logger.error(f"Failed to start hot intelligence pusher: {e}")
            raise

    async def stop(self) -> None:
        """
        停止定时推送任务
        """
        if not self._is_running:
            return

        try:
            if self._scheduler:
                self._scheduler.shutdown(wait=True)
                self._scheduler = None

            self._is_running = False
            logger.info("Hot intelligence pusher stopped")

        except Exception as e:
            logger.error(f"Error stopping hot intelligence pusher: {e}")
            raise

    async def push_hot_intelligence(self) -> bool:
        """
        执行一次热情报推送

        1. 调用 selector 获取热情报数据
        2. 通过 event_producer 发布事件

        Returns:
            bool: 推送成功返回 True，失败返回 False
        """
        try:
            # 获取热情报数据
            hot_data = await self.selector.select_and_format_for_push()

            if not hot_data:
                logger.warning("No hot intelligence data to push")
                hot_data = {
                    "intelligence": [],
                    "coverage": [],
                    "timestamp": datetime.now().isoformat(),
                }

            # 构建事件 payload
            payload = {
                "intelligence": hot_data.get("intelligence", []),
                "coverage": hot_data.get("coverage", []),
                "timestamp": hot_data.get("timestamp", datetime.now().isoformat()),
                "total_count": len(hot_data.get("intelligence", [])),
                "coverage_count": len(hot_data.get("coverage", [])),
            }

            # 发布事件到事件总线
            # 使用字符串形式的事件类型，因为 EventType 枚举可能没有定义
            event_type_str = "news:hot_intelligence_update"

            # 调用 event_producer 发布事件
            # 注意：这里假设 event_producer 支持字符串事件类型
            # 或者我们可以通过 EventSchema 直接发布
            await self._publish_event(event_type_str, payload)

            logger.info(
                f"Published hot intelligence update: "
                f"{payload['total_count']} items, "
                f"covering {payload['coverage_count']} stocks"
            )

            return True

        except Exception as e:
            logger.error(f"Failed to push hot intelligence: {e}")
            return False

    async def _publish_event(self, event_type: str, payload: Dict[str, Any]) -> None:
        """
        发布事件到事件总线

        Args:
            event_type: 事件类型字符串
            payload: 事件负载
        """
        try:
            # 尝试直接使用 event_producer 的 publish_event 方法
            # 如果 event_producer 需要 EventType 枚举，则需要转换
            if hasattr(self.event_producer, 'publish_event'):
                # 检查是否需要 EventType 枚举
                import inspect
                sig = inspect.signature(self.event_producer.publish_event)
                first_param = list(sig.parameters.values())[0]

                # 如果需要 EventType 类型，我们创建临时方式
                if 'EventType' in str(first_param.annotation):
                    # 使用 EventSchema 直接发布
                    await self._publish_via_schema(event_type, payload)
                else:
                    # 直接使用字符串
                    await self.event_producer.publish_event(event_type, payload)
            else:
                # 使用 EventSchema 直接发布
                await self._publish_via_schema(event_type, payload)

        except Exception as e:
            logger.error(f"Error publishing event: {e}")
            raise

    async def _publish_via_schema(self, event_type: str, payload: Dict[str, Any]) -> None:
        """
        通过 EventSchema 发布事件

        这是一种绕过 EventType 枚举限制的方式，
        直接使用 Redis 客户端发布。
        """
        try:
            # 获取 event_producer 的 Redis 客户端
            if hasattr(self.event_producer, '_client'):
                client = self.event_producer._client
                if hasattr(client, 'client'):
                    redis_client = client.client
                else:
                    redis_client = client
            else:
                # 如果没有 _client，尝试直接创建 Redis 连接
                # 这需要在配置中指定 Redis 连接信息
                raise RuntimeError("Cannot access Redis client from event_producer")

            # 构建事件数据
            import json
            import uuid

            event_data = {
                "event_id": str(uuid.uuid4()),
                "event_type": event_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source": "news-service",
                "payload": payload,
                "version": "1.0",
            }

            # 发布到 Redis Streams
            redis_client.xadd(
                event_type,
                {"data": json.dumps(event_data, ensure_ascii=False)},
                maxlen=10000,
                approximate=True,
            )

        except Exception as e:
            logger.error(f"Error publishing via schema: {e}")
            raise

    async def push_once(self) -> bool:
        """
        手动触发一次推送（不依赖定时器）

        Returns:
            bool: 推送成功返回 True，失败返回 False
        """
        return await self.push_hot_intelligence()

    def get_status(self) -> Dict[str, Any]:
        """
        获取推送器状态

        Returns:
            Dict: 包含运行状态、配置等信息
        """
        return {
            "is_running": self._is_running,
            "push_interval_minutes": self.push_interval_minutes,
            "event_type": "news:hot_intelligence_update",
            "scheduler_active": self._scheduler is not None and self._scheduler.running,
        }
