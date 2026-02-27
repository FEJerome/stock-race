"""
Stock Race 统一事件总线 SDK (Python版)
基于 Redis Streams 实现，支持发布/订阅/消费者组
"""

from .client import EventBusClient
from .consumer import EventConsumer
from .producer import EventProducer
from .schema import EventSchema, EventType
from .exceptions import (
    EventBusError,
    ConnectionError,
    PublishError,
    ConsumeError,
    SerializationError
)

__version__ = "1.0.0"
__all__ = [
    "EventBusClient",
    "EventConsumer",
    "EventProducer",
    "EventSchema",
    "EventType",
    "EventBusError",
    "ConnectionError",
    "PublishError",
    "ConsumeError",
    "SerializationError",
]
