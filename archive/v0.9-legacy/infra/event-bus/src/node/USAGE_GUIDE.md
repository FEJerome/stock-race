# Node.js Event Bus SDK 使用指南

> 基于 Redis Streams 的事件总线 SDK（Node.js 版）
> 适用于 Backend 服务

---

## 快速开始

### 1. 安装 SDK

```bash
# 在 Backend 项目中安装
cd /home/fe-jerome/projects/stock-race/backend
npm install /home/fe-jerome/projects/stock-race/infra/event-bus/src/node
```

### 2. 基础使用示例

```javascript
const {
  EventBusClient,
  EventProducer,
  EventConsumer,
  EventType,
  EventSchema,
} = require('@stock-race/event-bus');

// 1. 创建客户端
const client = new EventBusClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD, // 可选
});

// 2. 连接到 Redis
await client.connect();

// 3. 创建生产者
const producer = new EventProducer({
  client,
  serviceName: 'backend',
  maxStreamLength: 10000, // 每个 stream 最大保留 10000 条消息
});

// 4. 发布事件
await producer.publishEvent(
  EventType.BACKEND_TRADE_EXECUTED,
  {
    accountId: 'acc-001',
    tradeId: 'trade-001',
    symbol: '000001.SZ',
    action: 'buy',
    quantity: 100,
    price: 12.58,
  }
);

// 5. 创建消费者
const consumer = new EventConsumer({
  client,
  serviceName: 'backend',
  consumerGroup: 'trade-executor-group',
  consumerName: 'backend-instance-1',
  retryCount: 3,
  retryDelay: 1000,
});

// 6. 订阅事件
consumer.subscribe(EventType.AI_DECISION_MADE, async (event) => {
  console.log('Received AI decision:', event.payload);
  // 处理 AI 决策...
});

// 7. 启动消费者
consumer.start();

// 8. 优雅关闭
process.on('SIGTERM', async () => {
  await consumer.stop();
  await client.disconnect();
});
```

---

## API 参考

### EventBusClient

Redis 连接管理类。

```javascript
const client = new EventBusClient(options);
```

**配置选项：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| host | string | 否 | localhost | Redis 主机 |
| port | number | 否 | 6379 | Redis 端口 |
| password | string | 否 | - | Redis 密码 |
| db | number | 否 | 0 | Redis 数据库 |
| redisUrl | string | 否 | - | 完整的 Redis URL |

**方法：**

- `connect()` - 连接到 Redis
- `disconnect()` - 断开连接
- `getClient()` - 获取 ioredis 实例
- `healthCheck()` - 健康检查

### EventProducer

事件发布类。

```javascript
const producer = new EventProducer({
  client,
  serviceName: 'backend',
  maxStreamLength: 10000,
});
```

**方法：**

- `publish(event, validate = true)` - 发布单个事件
- `publishEvent(eventType, payload, correlationId, validate)` - 便捷发布方法
- `publishBatch(events, validate)` - 批量发布事件
- `getStreamInfo(eventType)` - 获取 stream 信息

### EventConsumer

事件消费类（基于消费者组）。

```javascript
const consumer = new EventConsumer({
  client,
  serviceName: 'backend',
  consumerGroup: 'my-group',
  consumerName: 'instance-1', // 可选，默认自动生成
  autoCreateGroup: true, // 自动创建消费者组
  blockTimeout: 5000, // 阻塞读取超时（毫秒）
  retryCount: 3, // 处理失败重试次数
  retryDelay: 1000, // 重试间隔（毫秒）
});
```

**方法：**

- `subscribe(eventType, handler)` - 订阅事件类型
- `unsubscribe(eventType)` - 取消订阅
- `start()` - 启动消费
- `stop()` - 停止消费
- `getPendingMessages(eventType)` - 获取待处理消息

### EventSchema

事件 Schema 类。

```javascript
const event = new EventSchema({
  eventType: EventType.MARKET_QUOTE_REALTIME,
  source: 'backend',
  payload: { ... },
  correlationId: 'optional-id', // 可选
});
```

**方法：**

- `toObject()` - 转换为普通对象
- `toJSON()` - 转换为 JSON 字符串
- `EventSchema.fromObject(data)` - 从对象创建
- `EventSchema.fromJSON(jsonStr)` - 从 JSON 字符串创建

### EventType

预定义的事件类型枚举：

```javascript
const EventType = {
  // Market Data 事件
  MARKET_QUOTE_REALTIME: 'market:quote:realtime',
  MARKET_ALERT_PRICE_MOVE: 'market:alert:price_move',
  MARKET_INDICATOR_UPDATED: 'market:indicator:updated',

  // News Service 事件
  NEWS_INTELLIGENCE_EXTRACTED: 'news:intelligence:extracted',
  NEWS_SENTIMENT_CHANGED: 'news:sentiment:changed',

  // Trading AI 事件
  AI_DECISION_MADE: 'ai:decision:made',
  AI_PERFORMANCE_REPORT: 'ai:performance:report',

  // Backend 事件
  BACKEND_ACCOUNT_UPDATED: 'backend:account:updated',
  BACKEND_TRADE_EXECUTED: 'backend:trade:executed',
};
```

---

## 高级用法

### 批量发布事件

```javascript
const events = [
  new EventSchema({
    eventType: EventType.BACKEND_TRADE_EXECUTED,
    source: 'backend',
    payload: { ... },
  }),
  new EventSchema({
    eventType: EventType.BACKEND_TRADE_EXECUTED,
    source: 'backend',
    payload: { ... },
  }),
];

const messageIds = await producer.publishBatch(events);
```

### 消费者组负载均衡

多个 Backend 实例使用相同的 consumerGroup 可以实现负载均衡：

```javascript
// 实例 1
const consumer1 = new EventConsumer({
  client,
  serviceName: 'backend',
  consumerGroup: 'trade-executors', // 相同的组名
  consumerName: 'instance-1', // 不同的实例名
});

// 实例 2
const consumer2 = new EventConsumer({
  client,
  serviceName: 'backend',
  consumerGroup: 'trade-executors', // 相同的组名
  consumerName: 'instance-2', // 不同的实例名
});
```

### 错误处理

```javascript
const {
  ConnectionError,
  PublishError,
  ConsumeError,
  ValidationError,
} = require('@stock-race/event-bus');

try {
  await producer.publish(event);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('事件验证失败:', error.message);
  } else if (error instanceof PublishError) {
    console.error('发布失败:', error.message);
  }
}
```

### 健康检查

```javascript
// 在健康检查端点中使用
app.get('/health', async (req, res) => {
  const redisHealthy = await client.healthCheck();

  if (redisHealthy) {
    res.json({ status: 'healthy', redis: 'connected' });
  } else {
    res.status(503).json({ status: 'unhealthy', redis: 'disconnected' });
  }
});
```

---

## 事件 Schema 规范

所有事件遵循统一格式：

```json
{
  "eventId": "uuid-v4",
  "eventType": "backend:trade:executed",
  "timestamp": "2026-02-11T10:00:00.000Z",
  "source": "backend",
  "payload": { ... },
  "correlationId": "optional-id",
  "version": "1.0"
}
```

### Payload 验证

SDK 内置了常用事件类型的 payload 验证：

```javascript
// 验证通过
await producer.publishEvent(
  EventType.MARKET_QUOTE_REALTIME,
  {
    symbol: '000001.SZ',
    price: 10.5,
    change: 0.5,
    volume: 10000,
    timestamp: '2026-02-11T10:00:00Z',
  }
);

// 验证失败（price 应该是 number）
await producer.publishEvent(
  EventType.MARKET_QUOTE_REALTIME,
  {
    symbol: '000001.SZ',
    price: '10.5', // 错误：字符串而不是数字
    change: 0.5,
    volume: 10000,
    timestamp: '2026-02-11T10:00:00Z',
  }
); // 抛出 ValidationError
```

---

## 完整示例：交易执行服务

```javascript
const {
  EventBusClient,
  EventProducer,
  EventConsumer,
  EventType,
} = require('@stock-race/event-bus');

class TradeExecutionService {
  constructor() {
    this.client = new EventBusClient({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
    });

    this.producer = new EventProducer({
      client: this.client,
      serviceName: 'backend',
    });

    this.consumer = new EventConsumer({
      client: this.client,
      serviceName: 'backend',
      consumerGroup: 'trade-executor-group',
      retryCount: 3,
    });

    // 订阅 AI 决策事件
    this.consumer.subscribe(
      EventType.AI_DECISION_MADE,
      this.handleAIDecision.bind(this)
    );
  }

  async initialize() {
    await this.client.connect();
    console.log('TradeExecutionService initialized');
  }

  async handleAIDecision(event) {
    const { accountId, decision, confidence } = event.payload;

    console.log(`Processing AI decision for account ${accountId}:`, decision);

    // 执行交易...
    const tradeResult = await this.executeTrade(accountId, decision);

    // 发布交易执行事件
    await this.producer.publishEvent(
      EventType.BACKEND_TRADE_EXECUTED,
      {
        accountId,
        tradeId: tradeResult.id,
        symbol: tradeResult.symbol,
        action: tradeResult.action,
        quantity: tradeResult.quantity,
        price: tradeResult.price,
        timestamp: new Date().toISOString(),
      }
    );

    console.log(`Trade executed and event published: ${tradeResult.id}`);
  }

  async executeTrade(accountId, decision) {
    // 实际的交易执行逻辑...
    return {
      id: `trade-${Date.now()}`,
      symbol: decision.symbol,
      action: decision.action,
      quantity: decision.quantity,
      price: decision.price,
    };
  }

  async start() {
    await this.consumer.start();
    console.log('TradeExecutionService started');
  }

  async stop() {
    await this.consumer.stop();
    await this.client.disconnect();
    console.log('TradeExecutionService stopped');
  }
}

// 使用
const service = new TradeExecutionService();

async function main() {
  await service.initialize();
  await service.start();

  // 优雅关闭
  process.on('SIGTERM', async () => {
    await service.stop();
    process.exit(0);
  });
}

main().catch(console.error);
```

---

## 测试

SDK 包含完整的单元测试：

```bash
cd /home/fe-jerome/projects/stock-race/infra/event-bus/tests/node
npm install
npm test
```

测试结果：
- 23 个测试全部通过
- 覆盖连接管理、事件发布、事件消费、错误处理等场景

---

## 注意事项

1. **Redis 连接**：确保 Redis 服务已启动并可访问
2. **消费者组**：首次启动时会自动创建消费者组
3. **消息确认**：消费者自动 ACK 成功处理的消息
4. **重试机制**：处理失败会自动重试（默认 3 次）
5. **优雅关闭**：务必调用 `consumer.stop()` 和 `client.disconnect()`

---

## 相关文档

- [Python SDK 使用指南](../../USAGE_GUIDE.md)
- [事件总线 README](../../README.md)
- [Backend TODO](../../../../docs/modules/backend/TODO.md)
- [基础设施 TODO](../../../../docs/modules/infra/TODO.md)

---

*文档版本: v1.0*
*最后更新: 2026-02-11*
