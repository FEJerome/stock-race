"""
事件Schema定义
统一事件字段规范
"""

from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Any, Optional
import uuid
import json


class EventType(Enum):
    """事件类型枚举"""
    # Market Data 事件
    MARKET_QUOTE_REALTIME = "market:quote:realtime"
    MARKET_ALERT_PRICE_MOVE = "market:alert:price_move"
    MARKET_INDICATOR_UPDATED = "market:indicator:updated"

    # News Service 事件
    NEWS_INTELLIGENCE_EXTRACTED = "news:intelligence:extracted"
    NEWS_SENTIMENT_CHANGED = "news:sentiment:changed"

    # Trading AI 事件
    AI_DECISION_MADE = "ai:decision:made"
    AI_PERFORMANCE_REPORT = "ai:performance:report"

    # Backend 事件
    BACKEND_ACCOUNT_UPDATED = "backend:account:updated"
    BACKEND_TRADE_EXECUTED = "backend:trade:executed"


@dataclass
class EventSchema:
    """
    统一事件Schema

    字段规范:
    - event_id: 全局唯一事件ID (UUID)
    - event_type: 事件类型 (EventType)
    - timestamp: 事件发生时间 (ISO 8601格式)
    - source: 事件来源服务
    - payload: 事件负载数据
    - correlation_id: 关联ID（用于追踪）
    - version: 事件版本
    """
    event_type: EventType
    source: str
    payload: Dict[str, Any]
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    correlation_id: Optional[str] = None
    version: str = "1.0"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "timestamp": self.timestamp,
            "source": self.source,
            "payload": self.payload,
            "correlation_id": self.correlation_id,
            "version": self.version,
        }

    def to_json(self) -> str:
        """转换为JSON字符串"""
        return json.dumps(self.to_dict(), ensure_ascii=False)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EventSchema":
        """从字典创建事件"""
        return cls(
            event_id=data["event_id"],
            event_type=EventType(data["event_type"]),
            timestamp=data["timestamp"],
            source=data["source"],
            payload=data["payload"],
            correlation_id=data.get("correlation_id"),
            version=data.get("version", "1.0"),
        )

    @classmethod
    def from_json(cls, json_str: str) -> "EventSchema":
        """从JSON字符串创建事件"""
        return cls.from_dict(json.loads(json_str))


# 事件负载Schema定义（用于验证）
EVENT_PAYLOAD_SCHEMAS = {
    EventType.MARKET_QUOTE_REALTIME: {
        "symbol": str,
        "price": float,
        "change": float,
        "volume": int,
        "timestamp": str,
    },
    EventType.MARKET_ALERT_PRICE_MOVE: {
        "symbol": str,
        "alert_type": str,
        "severity": str,
        "message": str,
    },
    EventType.NEWS_INTELLIGENCE_EXTRACTED: {
        "stock_code": str,
        "intelligence": str,
        "sentiment": str,
        "timestamp": str,
    },
    EventType.AI_DECISION_MADE: {
        "account_id": str,
        "decision": str,
        "confidence": float,
        "reasoning": str,
        "timestamp": str,
    },
    EventType.BACKEND_TRADE_EXECUTED: {
        "account_id": str,
        "trade_id": str,
        "symbol": str,
        "action": str,
        "quantity": int,
        "price": float,
    },
}


def validate_payload(event_type: EventType, payload: Dict[str, Any]) -> bool:
    """
    验证事件负载是否符合Schema

    Args:
        event_type: 事件类型
        payload: 事件负载

    Returns:
        bool: 验证是否通过
    """
    schema = EVENT_PAYLOAD_SCHEMAS.get(event_type)
    if not schema:
        return True  # 无定义Schema时不验证

    for field_name, field_type in schema.items():
        if field_name not in payload:
            return False
        if not isinstance(payload[field_name], field_type):
            return False
    return True
