# Event Bus SDK 使用指南 (Node.js版)

> 本文档说明如何在各服务中使用事件总线Node.js SDK（集成管理模式）

## SDK位置

```
项目根目录/infra/event-bus/
├── src/node/               # Node.js SDK
│   ├── index.js            # 主入口
│   ├── lib/
│   │   ├── client.js       # Redis连接
│   │   ├── producer.js     # 事件发布
│   │   ├── consumer.js     # 事件消费
│   │   ├── schema.js       # 事件Schema
│   │   └── exceptions.js   # 异常定义
│   └── README.md           # 完整文档
```

## 快速开始

### 1. 安装依赖

```bash
# 在backend目录中
cd /home/fe-jerome/projects/stock-race/backend

# 安装SDK依赖（通过本地路径）
npm install /home/fe-jerome/projects/stock-rice/infra/event-bus/src/node
```

### 2. 配置环境变量

在服务的 `.env` 文件中添加：

```bash
# Redis连接配置
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0
# REDIS_PASSWORD=optional
```

### 3. 导入SDK

```javascript
const {
  EventBusClient,
  EventProducer,
  EventConsumer,
  EventSchema,
  EventType,
} = require('@stock-race/event-bus');
```

## Backend服务使用示例

### 交易执行器（事件消费者+发布者）

```javascript
// services/tradeExecutor.js
const {
  EventBusClient,
  EventProducer,
  EventConsumer,
  EventType,
} = require('@stock-race/event-bus');

class TradeExecutor {
  constructor() {
    this.client = new EventBusClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });

    // 生产者：发布交易执行事件
    this.producer = new EventProducer({
      client: this.client,
      serviceName: 'backend',
    });

    // 消费者：订阅AI决策
    this.consumer = new EventConsumer({
      client: this.client,
      serviceName: 'backend',
      consumerGroup: 'trade-executor-group',
    });

    // 注册处理器
    this.consumer.subscribe(
      EventType.AI_DECISION_MADE,
      this._handleAIDecision.bind(this)
    );
  }

  async _handleAIDecision(event) {
    console.log(`Received AI decision: ${event.eventId}`);

    const { accountId, decision, confidence } = event.payload;

    try {
      // 执行交易...
      const tradeResult = await this._executeTrade(accountId, decision);

      // 发布交易执行事件
      await this.producer.publishEvent(
        EventType.BACKEND_TRADE_EXECUTED,
        {
          accountId: accountId,
          tradeId: tradeResult.id,
          symbol: tradeResult.symbol,
          action: tradeResult.action,
          quantity: tradeResult.quantity,
          price: tradeResult.price,
        }
      );

      console.log(`Trade executed: ${tradeResult.id}`);
    } catch (error) {
      console.error('Trade execution failed:', error);
    }
  }

  async _executeTrade(accountId, decision) {
    // 实际交易逻辑...
    return {
      id: 'trade-' + Date.now(),
      symbol: decision.symbol,
      action: decision.action,
      quantity: decision.quantity,
      price: decision.price,
    };
  }

  async start() {
    // 先连接Redis
    await this.client.connect();

    // 启动消费者
    this.consumer.start();

    console.log('TradeExecutor started');
  }

  async stop() {
    await this.consumer.stop();
    await this.client.disconnect();
    console.log('TradeExecutor stopped');
  }
}

module.exports = TradeExecutor;
```

### 启动消费者

```javascript
// app.js 或 server.js
const TradeExecutor = require('./services/tradeExecutor');

const tradeExecutor = new TradeExecutor();

// 启动时
await tradeExecutor.start();

// 优雅关闭时
process.on('SIGTERM', async () => {
  await tradeExecutor.stop();
  process.exit(0);
});
```

## 高级用法

### 批量发布事件

```javascript
const events = [
  new EventSchema({
    eventType: EventType.BACKEND_ACCOUNT_UPDATED,
    source: 'backend',
    payload: { accountId: 'acc-1', balance: 100000 },
  }),
  new EventSchema({
    eventType: EventType.BACKEND_ACCOUNT_UPDATED,
    source: 'backend',
    payload: { accountId: 'acc-2', balance: 200000 },
  }),
];

const messageIds = await producer.publishBatch(events);
console.log(`Published ${messageIds.filter(id => id !== null).length} events`);
```

### 带重试的消费

```javascript
const consumer = new EventConsumer({
  client: client,
  serviceName: 'backend',
  consumerGroup: 'my-group',
  retryCount: 5,        // 失败重试5次
  retryDelay: 2000,     // 每次间隔2秒
});
```

### 自定义消费者配置

```javascript
const consumer = new EventConsumer({
  client: client,
  serviceName: 'backend',
  consumerGroup: 'my-group',
  consumerName: 'instance-1',    // 自定义实例名
  autoCreateGroup: true,          // 自动创建消费者组
  blockTimeout: 10000,            // 阻塞读取10秒
});
```

### 获取待处理消息

```javascript
const pendingMessages = await consumer.getPendingMessages(
  EventType.AI_DECISION_MADE
);
console.log(`Pending messages: ${pendingMessages.length}`);
```

### 获取Stream信息

```javascript
const info = await producer.getStreamInfo(EventType.AI_DECISION_MADE);
console.log(`Stream length: ${info.length}`);
console.log(`Consumer groups: ${info.groups}`);
```

## 事件类型速查表

| 事件类型 | 发布者 | 订阅者 | 用途 |
|----------|--------|--------|------|
| `MARKET_QUOTE_REALTIME` | Market Data | Trading AI | 实时行情推送 |
| `MARKET_ALERT_PRICE_MOVE` | Market Data | News Service | 价格异动触发新闻采集 |
| `NEWS_INTELLIGENCE_EXTRACTED` | News Service | Trading AI | 新闻情报推送 |
| `AI_DECISION_MADE` | Trading AI | Backend | AI交易决策 |
| `BACKEND_TRADE_EXECUTED` | Backend | Trading AI | 交易执行结果 |
| `BACKEND_ACCOUNT_UPDATED` | Backend | Trading AI | 账户更新通知 |

## 测试方法

```javascript
// tests/test-event-bus.js
const {
  EventBusClient,
  EventProducer,
  EventType,
} = require('@stock-race/event-bus');

async function testPublish() {
  const client = new EventBusClient({
    host: 'localhost',
    port: 6379,
  });

  await client.connect();

  const producer = new EventProducer({
    client: client,
    serviceName: 'test',
  });

  await producer.publishEvent(
    EventType.MARKET_QUOTE_REALTIME,
    {
      symbol: '000001.SZ',
      price: 12.58,
      change: 0.5,
      volume: 10000,
      timestamp: new Date().toISOString(),
    }
  );

  console.log('✓ Event published successfully');

  await client.disconnect();
}

testPublish().catch(console.error);
```

## 故障排除

### 1. Error: Cannot find module '@stock-race/event-bus'

**原因**: SDK未正确安装

**解决**: 检查package.json中的依赖路径：
```json
{
  "dependencies": {
    "@stock-race/event-bus": "file:/home/fe-jerome/projects/stock-rice/infra/event-bus/src/node"
  }
}
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
- 使用 `consumer.getPendingMessages()` 查看待处理消息
- 检查日志输出

### 4. PublishError: Failed to publish event

**原因**: Redis连接断开或Stream已满

**解决**: 检查Redis连接状态，清理过期Stream数据。

## 相关文档

- [SDK完整文档](./README.md)
- [Python SDK使用指南](../USAGE_GUIDE.md)
- [事件总线架构设计](../../docs/architecture/EVENT_BUS_RISK_ANALYSIS.md)
- [服务解耦设计](../../docs/architecture/AI_SERVICE_DECOUPLING_DESIGN.md)
