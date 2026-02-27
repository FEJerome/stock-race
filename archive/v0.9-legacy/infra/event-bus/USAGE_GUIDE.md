# 事件总线SDK使用指南

> 本文档说明如何在各服务中使用事件总线SDK（集成管理模式）

## SDK位置

```
项目根目录/infra/event-bus/
├── src/event_bus/          # Python SDK
│   ├── __init__.py
│   ├── client.py           # Redis连接
│   ├── producer.py         # 事件发布
│   ├── consumer.py         # 事件消费
│   ├── schema.py           # 事件Schema
│   └── exceptions.py       # 异常定义
└── README.md               # 完整文档
```

## 快速开始

### 1. 添加Python路径

在各服务的入口文件（如 `main.py` 或 `app.py`）顶部添加：

```python
import sys
from pathlib import Path

# 添加事件总线SDK到Python路径
project_root = Path(__file__).parent.parent.parent  # 根据实际目录层级调整
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))
```

### 2. 导入SDK

```python
from event_bus import (
    EventBusClient,
    EventProducer,
    EventConsumer,
    EventSchema,
    EventType,
)
```

### 3. 配置环境变量

在服务的 `.env` 或配置文件中添加：

```bash
# Redis连接配置
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0
# REDIS_PASSWORD=optional
```

## 各服务使用示例

### Market Data Service（事件发布者）

```python
# services/market_data_publisher.py
import os
from event_bus import EventBusClient, EventProducer, EventType

class MarketDataPublisher:
    """行情数据事件发布器"""

    def __init__(self):
        self.client = EventBusClient(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379))
        )
        self.producer = EventProducer(
            client=self.client,
            service_name="market-data"
        )

    def publish_quote(self, symbol: str, price: float, change: float, volume: int):
        """发布实时行情"""
        self.producer.publish_event(
            EventType.MARKET_QUOTE_REALTIME,
            {
                "symbol": symbol,
                "price": price,
                "change": change,
                "volume": volume,
                "timestamp": datetime.utcnow().isoformat()
            }
        )

    def publish_alert(self, symbol: str, alert_type: str, severity: str, message: str):
        """发布价格异动告警"""
        self.producer.publish_event(
            EventType.MARKET_ALERT_PRICE_MOVE,
            {
                "symbol": symbol,
                "alert_type": alert_type,
                "severity": severity,
                "message": message
            }
        )
```

### Trading AI Service（事件消费者+发布者）

```python
# services/ai_decision_service.py
import os
import threading
from event_bus import (
    EventBusClient, EventProducer, EventConsumer,
    EventType, EventSchema
)

class AIDecisionService:
    """AI决策服务 - 消费行情和新闻，发布决策"""

    def __init__(self):
        self.client = EventBusClient(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379))
        )

        # 生产者：发布AI决策
        self.producer = EventProducer(
            client=self.client,
            service_name="trading-ai"
        )

        # 消费者：订阅行情和新闻
        self.consumer = EventConsumer(
            client=self.client,
            service_name="trading-ai",
            consumer_group="ai-decision-group"
        )

        # 注册处理器
        self.consumer.subscribe(
            EventType.MARKET_QUOTE_REALTIME,
            self._handle_market_quote
        )
        self.consumer.subscribe(
            EventType.NEWS_INTELLIGENCE_EXTRACTED,
            self._handle_news
        )

    def _handle_market_quote(self, event: EventSchema):
        """处理行情事件"""
        symbol = event.payload["symbol"]
        price = event.payload["price"]

        # AI决策逻辑...
        decision = self._make_decision(symbol, price)

        if decision:
            # 发布决策事件
            self.producer.publish_event(
                EventType.AI_DECISION_MADE,
                {
                    "account_id": decision.account_id,
                    "decision": decision.action,
                    "confidence": decision.confidence,
                    "reasoning": decision.reasoning,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )

    def _handle_news(self, event: EventSchema):
        """处理新闻事件"""
        stock_code = event.payload["stock_code"]
        sentiment = event.payload["sentiment"]

        # 根据情感分析调整策略...

    def start(self):
        """启动消费者"""
        self.consumer.start()

    def stop(self):
        """停止消费者"""
        self.consumer.stop()
```

### News Service（事件发布者）

```python
# services/news_publisher.py
from event_bus import EventBusClient, EventProducer, EventType

class NewsPublisher:
    """新闻事件发布器"""

    def __init__(self):
        self.client = EventBusClient(host=os.getenv("REDIS_HOST"))
        self.producer = EventProducer(
            client=self.client,
            service_name="news-service"
        )

    def publish_intelligence(self, stock_code: str, intelligence: str, sentiment: str):
        """发布新闻情报"""
        self.producer.publish_event(
            EventType.NEWS_INTELLIGENCE_EXTRACTED,
            {
                "stock_code": stock_code,
                "intelligence": intelligence,
                "sentiment": sentiment,
                "timestamp": datetime.utcnow().isoformat()
            }
        )
```

### Backend（事件消费者+发布者）

```python
# services/trade_executor.py
from event_bus import EventBusClient, EventProducer, EventConsumer, EventType

class TradeExecutor:
    """交易执行器 - 消费AI决策，执行交易"""

    def __init__(self):
        self.client = EventBusClient(host=os.getenv("REDIS_HOST"))

        # 生产者：发布交易执行事件
        self.producer = EventProducer(
            client=self.client,
            service_name="backend"
        )

        # 消费者：订阅AI决策
        self.consumer = EventConsumer(
            client=self.client,
            service_name="backend",
            consumer_group="trade-executor-group"
        )

        self.consumer.subscribe(
            EventType.AI_DECISION_MADE,
            self._handle_ai_decision
        )

    def _handle_ai_decision(self, event: EventSchema):
        """处理AI决策"""
        account_id = event.payload["account_id"]
        decision = event.payload["decision"]

        # 执行交易...
        trade_result = self._execute_trade(account_id, decision)

        # 发布交易执行事件
        self.producer.publish_event(
            EventType.BACKEND_TRADE_EXECUTED,
            {
                "account_id": account_id,
                "trade_id": trade_result.id,
                "symbol": trade_result.symbol,
                "action": trade_result.action,
                "quantity": trade_result.quantity,
                "price": trade_result.price
            }
        )
```

## 事件类型速查表

| 事件类型 | 发布者 | 订阅者 | 用途 |
|----------|--------|--------|------|
| `MARKET_QUOTE_REALTIME` | Market Data | Trading AI | 实时行情推送 |
| `MARKET_ALERT_PRICE_MOVE` | Market Data | News Service | 价格异动触发新闻采集 |
| `NEWS_INTELLIGENCE_EXTRACTED` | News Service | Trading AI | 新闻情报推送 |
| `AI_DECISION_MADE` | Trading AI | Backend | AI交易决策 |
| `BACKEND_TRADE_EXECUTED` | Backend | Trading AI | 交易执行结果 |

## 测试方法

```python
# tests/test_event_bus_integration.py
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "infra" / "event-bus" / "src"))

from event_bus import EventBusClient, EventProducer, EventType

def test_publish():
    client = EventBusClient(host="localhost", port=6379)
    producer = EventProducer(client=client, service_name="test")

    producer.publish_event(
        EventType.MARKET_QUOTE_REALTIME,
        {"symbol": "000001.SZ", "price": 12.58, "change": 0.5, "volume": 10000, "timestamp": "2026-02-11T10:00:00Z"}
    )
    print("✓ 事件发布成功")

if __name__ == "__main__":
    test_publish()
```

## 故障排除

### 1. ModuleNotFoundError: No module named 'event_bus'

**原因**: Python路径未正确设置

**解决**: 确保在导入前添加了SDK路径：
```python
import sys
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/infra/event-bus/src')
```

### 2. ConnectionError: Failed to connect to Redis

**原因**: Redis未启动或配置错误

**解决**:
```bash
# 检查Redis状态
docker ps | grep redis

# 检查环境变量
echo $REDIS_HOST  # 应为 redis (docker-compose) 或 localhost (本地)
```

### 3. 消费者不消费消息

**原因**: 消费者组配置错误或handler抛出异常

**解决**:
- 检查handler是否捕获所有异常
- 使用 `consumer.get_pending_messages()` 查看待处理消息
- 检查日志输出

## 相关文档

- [SDK完整文档](./README.md)
- [事件总线架构设计](../../docs/architecture/EVENT_BUS_RISK_ANALYSIS.md)
- [服务解耦设计](../../docs/architecture/AI_SERVICE_DECOUPLING_DESIGN.md)
