# Stock Race 统一事件总线 SDK (Python版)

基于 Redis Streams 实现的事件总线，支持发布/订阅/消费者组，用于服务间解耦通信。

## 特性

- **发布/订阅模式**: 支持多服务事件发布和订阅
- **消费者组**: 支持多实例负载均衡和故障转移
- **消息持久化**: 基于Redis Streams，消息不丢失
- **ACK机制**: 手动确认，确保消息可靠处理
- **Schema验证**: 统一事件格式，支持负载验证
- **死信队列**: 处理失败消息可重试

## 快速开始

### 安装

```bash
pip install -r requirements.txt
```

### 发布事件

```python
from event_bus import EventBusClient, EventProducer, EventType

# 创建客户端
client = EventBusClient(host="localhost", port=6379)

# 创建生产者
producer = EventProducer(client=client, service_name="market-data")

# 发布事件
producer.publish_event(
    EventType.MARKET_QUOTE_REALTIME,
    {
        "symbol": "000001.SZ",
        "price": 12.58,
        "change": 0.5,
        "volume": 10000,
        "timestamp": "2026-02-11T10:00:00Z"
    }
)
```

### 订阅事件

```python
from event_bus import EventBusClient, EventConsumer, EventType

# 创建客户端
client = EventBusClient(host="localhost", port=6379)

# 创建消费者
consumer = EventConsumer(
    client=client,
    service_name="trading-ai",
    consumer_group="ai-decision-group",
)

# 定义处理器
def handle_market_data(event):
    print(f"Received quote: {event.payload['symbol']} @ {event.payload['price']}")

# 订阅事件
consumer.subscribe(EventType.MARKET_QUOTE_REALTIME, handle_market_data)

# 启动消费者（后台线程）
consumer.start()

# ... 运行中 ...

# 停止消费者
consumer.stop()
```

### 使用上下文管理器

```python
from event_bus import EventBusClient, EventProducer, EventConsumer, EventType

# 生产者
with EventBusClient(host="localhost", port=6379) as client:
    producer = EventProducer(client=client, service_name="backend")
    producer.publish_event(
        EventType.BACKEND_TRADE_EXECUTED,
        {"account_id": "acc_123", "symbol": "000001.SZ", "action": "buy"}
    )

# 消费者
with EventBusClient(host="localhost", port=6379) as client:
    consumer = EventConsumer(
        client=client,
        service_name="trading-ai",
        consumer_group="ai-group",
    )
    consumer.subscribe(EventType.MARKET_QUOTE_REALTIME, handler)
    consumer.start()
    # 消费者会在上下文退出时自动停止
```

## 事件类型

```python
from event_bus import EventType

# Market Data 事件
EventType.MARKET_QUOTE_REALTIME      # 实时行情更新
EventType.MARKET_ALERT_PRICE_MOVE    # 价格异动告警
EventType.MARKET_INDICATOR_UPDATED   # 技术指标更新

# News Service 事件
EventType.NEWS_INTELLIGENCE_EXTRACTED  # 新闻情报提取完成
EventType.NEWS_SENTIMENT_CHANGED       # 情感分析变化

# Trading AI 事件
EventType.AI_DECISION_MADE        # AI决策完成
EventType.AI_PERFORMANCE_REPORT   # 绩效报告

# Backend 事件
EventType.BACKEND_ACCOUNT_UPDATED  # 账户状态更新
EventType.BACKEND_TRADE_EXECUTED   # 交易执行完成
```

## 测试

### 运行单元测试

```bash
cd infra/event-bus
pytest tests/ -v
```

### 运行集成测试（需要Redis）

```bash
# 启动Redis
docker-compose -f ../redis/docker-compose.redis.yml up -d

# 运行集成测试
pytest tests/ -v --integration
```

## 架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Market Data    │────▶│  Redis Streams  │◀────│   Trading AI    │
│  (Producer)     │     │  (Event Bus)    │     │  (Consumer)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               │
                        ┌──────┴──────┐
                        │  Consumer   │
                        │   Group     │
                        │  (Load Bal) │
                        └─────────────┘
```

## 配置

### 消费者配置

```python
consumer = EventConsumer(
    client=client,
    service_name="my-service",
    consumer_group="my-group",
    consumer_name="instance-1",  # 可选，默认自动生成
    auto_create_group=True,       # 自动创建消费者组
    block_timeout=5000,           # 阻塞读取超时（毫秒）
    retry_count=3,                # 处理失败重试次数
    retry_delay=1.0,              # 重试间隔（秒）
)
```

### 生产者配置

```python
producer = EventProducer(
    client=client,
    service_name="my-service",
    max_stream_length=10000,  # Stream最大长度
)
```

## 监控

```python
# 获取stream信息
info = producer.get_stream_info(EventType.MARKET_QUOTE_REALTIME)
print(f"Stream length: {info['length']}")

# 获取待处理消息
pending = consumer.get_pending_messages(EventType.MARKET_QUOTE_REALTIME)
print(f"Pending messages: {len(pending)}")
```

## 错误处理

```python
from event_bus.exceptions import (
    ConnectionError,
    PublishError,
    ConsumeError,
    ValidationError,
)

try:
    producer.publish(event)
except ValidationError as e:
    # 事件验证失败
    print(f"Invalid event: {e}")
except PublishError as e:
    # 发布失败
    print(f"Failed to publish: {e}")
```

## 最佳实践

1. **消费者组命名**: 使用服务名作为消费者组名，如 `"trading-ai-group"`
2. **错误处理**: 在handler中捕获所有异常，避免消费者崩溃
3. **幂等性**: 消费者应实现幂等性，同一消息可能被投递多次
4. **监控**: 定期检查pending消息数，及时发现消费延迟
5. **资源清理**: 使用上下文管理器或确保调用`stop()`关闭消费者

## 依赖

- Python >= 3.8
- Redis >= 5.0
- redis-py >= 5.0.0
