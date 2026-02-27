"""
事件消费者
基于Redis Streams消费者组实现
支持负载均衡和故障转移
"""

import json
import logging
import time
from typing import Callable, Dict, Any, Optional, List
from threading import Thread, Event as ThreadEvent

from .client import EventBusClient
from .schema import EventSchema, EventType
from .exceptions import ConsumeError, ConsumerGroupError

logger = logging.getLogger(__name__)


class EventConsumer:
    """
    事件消费者

    基于Redis Streams消费者组实现：
    - 支持多实例负载均衡
    - 自动故障转移
    - 消息ACK确认
    - 死信队列（处理失败消息）
    """

    def __init__(
        self,
        client: EventBusClient,
        service_name: str,
        consumer_group: str,
        consumer_name: Optional[str] = None,
        auto_create_group: bool = True,
        block_timeout: int = 5000,  # 毫秒
        retry_count: int = 3,
        retry_delay: float = 1.0,
    ):
        """
        初始化事件消费者

        Args:
            client: 事件总线客户端
            service_name: 服务名称
            consumer_group: 消费者组名称
            consumer_name: 消费者实例名称（默认自动生成）
            auto_create_group: 自动创建消费者组
            block_timeout: 阻塞读取超时时间（毫秒）
            retry_count: 处理失败重试次数
            retry_delay: 重试间隔（秒）
        """
        self._client = client
        self._service_name = service_name
        self._consumer_group = consumer_group
        self._consumer_name = consumer_name or f"{service_name}-{id(self)}"
        self._auto_create_group = auto_create_group
        self._block_timeout = block_timeout
        self._retry_count = retry_count
        self._retry_delay = retry_delay

        self._handlers: Dict[EventType, Callable] = {}
        self._running = False
        self._stop_event = ThreadEvent()
        self._consumer_thread: Optional[Thread] = None

    def subscribe(self, event_type: EventType, handler: Callable[[EventSchema], None]):
        """
        订阅事件类型

        Args:
            event_type: 事件类型
            handler: 事件处理函数
        """
        self._handlers[event_type] = handler
        logger.info(f"Subscribed to {event_type.value}")

    def unsubscribe(self, event_type: EventType):
        """
        取消订阅

        Args:
            event_type: 事件类型
        """
        if event_type in self._handlers:
            del self._handlers[event_type]
            logger.info(f"Unsubscribed from {event_type.value}")

    def _ensure_consumer_group(self, stream_name: str):
        """
        确保消费者组存在

        Args:
            stream_name: Stream名称
        """
        try:
            # 尝试创建消费者组（从0开始读取）
            self._client.client.xgroup_create(
                stream_name,
                self._consumer_group,
                id="0",  # 从stream开头开始
                mkstream=True,  # stream不存在时自动创建
            )
            logger.info(
                f"Created consumer group {self._consumer_group} for {stream_name}"
            )
        except Exception as e:
            if "BUSYGROUP" in str(e):
                # 消费者组已存在
                logger.debug(f"Consumer group {self._consumer_group} already exists")
            else:
                raise ConsumerGroupError(f"Failed to create consumer group: {e}")

    def _process_message(
        self,
        stream_name: str,
        message_id: str,
        message_data: Dict[str, str],
    ) -> bool:
        """
        处理单个消息

        Args:
            stream_name: Stream名称
            message_id: 消息ID
            message_data: 消息数据

        Returns:
            bool: 处理是否成功
        """
        try:
            # 解析事件
            event_data = json.loads(message_data.get("data", "{}"))
            event = EventSchema.from_dict(event_data)

            # 查找处理器
            handler = self._handlers.get(event.event_type)
            if not handler:
                logger.warning(f"No handler for event type {event.event_type}")
                return True  # 无处理器视为处理成功

            # 重试机制
            for attempt in range(self._retry_count):
                try:
                    handler(event)
                    logger.debug(f"Processed event {event.event_id}")
                    return True
                except Exception as e:
                    logger.error(
                        f"Error processing event {event.event_id} "
                        f"(attempt {attempt + 1}/{self._retry_count}): {e}"
                    )
                    if attempt < self._retry_count - 1:
                        time.sleep(self._retry_delay * (attempt + 1))

            # 重试耗尽，处理失败
            logger.error(f"Failed to process event {event.event_id} after retries")
            return False

        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode message {message_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error processing message {message_id}: {e}")
            return False

    def _ack_message(self, stream_name: str, message_id: str):
        """
        确认消息已处理

        Args:
            stream_name: Stream名称
            message_id: 消息ID
        """
        try:
            self._client.client.xack(
                stream_name,
                self._consumer_group,
                message_id,
            )
            logger.debug(f"Acknowledged message {message_id}")
        except Exception as e:
            logger.error(f"Failed to acknowledge message {message_id}: {e}")

    def _consume_stream(self, event_type: EventType):
        """
        消费单个stream

        Args:
            event_type: 事件类型
        """
        stream_name = event_type.value

        # 确保消费者组存在
        if self._auto_create_group:
            self._ensure_consumer_group(stream_name)

        while not self._stop_event.is_set():
            try:
                # 读取消息（阻塞模式）
                messages = self._client.client.xreadgroup(
                    groupname=self._consumer_group,
                    consumername=self._consumer_name,
                    streams={stream_name: ">"},  # ">" 表示读取未分配给任何消费者的消息
                    count=10,  # 每次最多读取10条
                    block=self._block_timeout,
                )

                if not messages:
                    continue

                # 处理消息
                for stream, msgs in messages:
                    for message_id, message_data in msgs:
                        success = self._process_message(
                            stream, message_id, message_data
                        )
                        if success:
                            self._ack_message(stream, message_id)
                        else:
                            # 处理失败，不ACK，消息会重新分配
                            logger.warning(
                                f"Message {message_id} processing failed, "
                                f"will be redelivered"
                            )

            except Exception as e:
                logger.error(f"Error consuming from {stream_name}: {e}")
                time.sleep(1)  # 错误后短暂暂停

    def _consume_all(self):
        """消费所有订阅的stream"""
        logger.info(f"Consumer {self._consumer_name} started")

        while not self._stop_event.is_set():
            try:
                # 轮询所有订阅的stream
                for event_type in list(self._handlers.keys()):
                    if self._stop_event.is_set():
                        break
                    self._consume_stream(event_type)

            except Exception as e:
                logger.error(f"Error in consumer loop: {e}")
                time.sleep(1)

        logger.info(f"Consumer {self._consumer_name} stopped")

    def start(self):
        """启动消费者（后台线程）"""
        if self._running:
            logger.warning("Consumer already running")
            return

        if not self._handlers:
            logger.warning("No event handlers registered")
            return

        self._running = True
        self._stop_event.clear()
        self._consumer_thread = Thread(target=self._consume_all, daemon=True)
        self._consumer_thread.start()
        logger.info(f"Consumer thread started: {self._consumer_name}")

    def stop(self, timeout: float = 10.0):
        """
        停止消费者

        Args:
            timeout: 等待消费者停止的超时时间（秒）
        """
        if not self._running:
            return

        logger.info("Stopping consumer...")
        self._stop_event.set()
        self._running = False

        if self._consumer_thread and self._consumer_thread.is_alive():
            self._consumer_thread.join(timeout=timeout)
            if self._consumer_thread.is_alive():
                logger.warning("Consumer thread did not stop gracefully")

        logger.info("Consumer stopped")

    def get_pending_messages(self, event_type: EventType) -> List[Dict[str, Any]]:
        """
        获取待处理消息（用于监控）

        Args:
            event_type: 事件类型

        Returns:
            List[Dict]: 待处理消息列表
        """
        stream_name = event_type.value
        try:
            pending = self._client.client.xpending_range(
                stream_name,
                self._consumer_group,
                min="-",
                max="+",
                count=100,
            )
            return [
                {
                    "message_id": p["message_id"],
                    "consumer": p["consumer"],
                    "time_since_delivered": p["time_since_delivered"],
                    "delivery_count": p["delivery_count"],
                }
                for p in pending
            ]
        except Exception as e:
            logger.error(f"Failed to get pending messages: {e}")
            return []

    def __enter__(self):
        """上下文管理器入口"""
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器出口"""
        self.stop()
        return False
