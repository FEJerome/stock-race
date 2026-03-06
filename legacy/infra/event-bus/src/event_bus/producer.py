"""
事件生产者
负责发布事件到Redis Streams
"""

import json
import logging
from typing import Dict, Any, Optional

from .client import EventBusClient
from .schema import EventSchema, EventType, validate_payload
from .exceptions import PublishError, ValidationError

logger = logging.getLogger(__name__)


class EventProducer:
    """
    事件生产者

    负责将事件发布到Redis Streams
    支持同步发布和批量发布
    """

    def __init__(
        self,
        client: EventBusClient,
        service_name: str,
        max_stream_length: int = 10000,
    ):
        """
        初始化事件生产者

        Args:
            client: 事件总线客户端
            service_name: 服务名称（作为事件source）
            max_stream_length: 单个stream最大长度（防止无限增长）
        """
        self._client = client
        self._service_name = service_name
        self._max_stream_length = max_stream_length

    def publish(
        self,
        event: EventSchema,
        validate: bool = True,
    ) -> str:
        """
        发布单个事件

        Args:
            event: 事件对象
            validate: 是否验证事件负载

        Returns:
            str: 事件ID（Redis生成的消息ID）

        Raises:
            ValidationError: 验证失败
            PublishError: 发布失败
        """
        try:
            # 验证事件
            if validate and not validate_payload(event.event_type, event.payload):
                raise ValidationError(
                    f"Invalid payload for event type {event.event_type}"
                )

            # 确保source字段正确
            event.source = self._service_name

            # 获取stream名称
            stream_name = event.event_type.value

            # 发布到Redis Streams
            message_id = self._client.client.xadd(
                stream_name,
                {"data": event.to_json()},
                maxlen=self._max_stream_length,
                approximate=True,
            )

            logger.debug(
                f"Published event {event.event_id} to {stream_name}, "
                f"message_id: {message_id}"
            )
            return message_id

        except ValidationError:
            raise
        except Exception as e:
            raise PublishError(f"Failed to publish event: {e}")

    def publish_event(
        self,
        event_type: EventType,
        payload: Dict[str, Any],
        correlation_id: Optional[str] = None,
        validate: bool = True,
    ) -> str:
        """
        便捷方法：创建并发布事件

        Args:
            event_type: 事件类型
            payload: 事件负载
            correlation_id: 关联ID
            validate: 是否验证

        Returns:
            str: 事件ID
        """
        event = EventSchema(
            event_type=event_type,
            source=self._service_name,
            payload=payload,
            correlation_id=correlation_id,
        )
        return self.publish(event, validate=validate)

    def publish_batch(
        self,
        events: list,
        validate: bool = True,
    ) -> list:
        """
        批量发布事件

        Args:
            events: 事件列表
            validate: 是否验证

        Returns:
            list: 消息ID列表
        """
        message_ids = []
        for event in events:
            try:
                message_id = self.publish(event, validate=validate)
                message_ids.append(message_id)
            except Exception as e:
                logger.error(f"Failed to publish event in batch: {e}")
                message_ids.append(None)
        return message_ids

    def get_stream_info(self, event_type: EventType) -> Dict[str, Any]:
        """
        获取stream信息

        Args:
            event_type: 事件类型

        Returns:
            Dict: stream信息
        """
        stream_name = event_type.value
        info = self._client.client.xinfo_stream(stream_name)
        return {
            "length": info.get("length", 0),
            "radix-tree-keys": info.get("radix-tree-keys", 0),
            "radix-tree-nodes": info.get("radix-tree-nodes", 0),
            "last-generated-id": info.get("last-generated-id", ""),
            "groups": info.get("groups", 0),
            "first-entry": info.get("first-entry"),
            "last-entry": info.get("last-entry"),
        }
