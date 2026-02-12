"""
事件总线异常定义
"""


class EventBusError(Exception):
    """事件总线基础异常"""
    pass


class ConnectionError(EventBusError):
    """连接错误"""
    pass


class PublishError(EventBusError):
    """发布错误"""
    pass


class ConsumeError(EventBusError):
    """消费错误"""
    pass


class SerializationError(EventBusError):
    """序列化错误"""
    pass


class ValidationError(EventBusError):
    """验证错误"""
    pass


class ConsumerGroupError(EventBusError):
    """消费者组错误"""
    pass
