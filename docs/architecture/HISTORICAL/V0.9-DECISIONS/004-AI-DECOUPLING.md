# AI Service 双向依赖解耦设计方案

> 详细分析 Trading AI Service 与 Market Data、News Service、Backend 之间的双向依赖问题，提供基于事件总线的完全解耦方案。
>
> **文档版本**: v1.0
> **分析日期**: 2026-02-11
> **涉及服务**: Trading AI Service, Market Data Service, News Service, Backend

---

## 目录

1. [问题详细分析](#一问题详细分析)
2. [目标架构设计](#二目标架构设计)
3. [数据流重新设计](#三数据流重新设计)
4. [接口调整方案](#四接口调整方案)
5. [实施步骤](#五实施步骤)
6. [风险与缓解](#六风险与缓解)

---

## 一、问题详细分析

### 1.1 当前依赖关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                     当前双向依赖关系图（问题状态）                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────┐          ┌─────────────────┐              │
│   │   Market Data   │◄────────►│   Trading AI    │              │
│   │   Service       │  HTTP    │   Service       │              │
│   │                 │  行情查询  │                 │              │
│   │ ◄── 行情订阅需求 │          │ ──► 决策联动     │              │
│   └─────────────────┘          └────────┬────────┘              │
│           ▲                             │                        │
│           │                             │                        │
│   ┌───────┴────────┐           ┌────────▼────────┐              │
│   │  News Service  │◄─────────►│     Backend     │              │
│   │                │  HTTP     │                 │              │
│   │ ◄── 情报订阅    │  新闻查询  │ ◄── 决策回调     │              │
│   │ ──► 决策反馈    │           │                 │              │
│   └─────────────────┘           └─────────────────┘              │
│                                                                  │
│   🔴 问题：形成3个双向依赖环                                      │
│   - Trading AI ↔ Market Data                                    │
│   - Trading AI ↔ News Service                                   │
│   - Trading AI ↔ Backend                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 双向依赖的具体表现

#### 依赖环1: Trading AI ↔ Market Data

| 方向 | 调用方 | 被调用方 | 接口 | 用途 |
|------|--------|----------|------|------|
| → | Trading AI | Market Data | `GET /stocks/{symbol}/realtime` | 获取实时行情 |
| → | Trading AI | Market Data | `GET /stocks/{symbol}/kline` | 获取K线数据 |
| ← | Market Data | Trading AI | `POST /api/v1/subscribe` | 订阅行情推送 |
| ← | Market Data | Trading AI | `POST /api/v1/alert` | 行情异动通知 |

**问题**:
- Trading AI 启动时需要调用 Market Data 获取历史数据
- Market Data 需要知道 Trading AI 关注哪些股票才能推送
- 形成"谁先启动"的死锁

#### 依赖环2: Trading AI ↔ News Service

| 方向 | 调用方 | 被调用方 | 接口 | 用途 |
|------|--------|----------|------|------|
| → | Trading AI | News Service | `GET /intelligence/{code}` | 获取新闻情报 |
| ← | News Service | Trading AI | `POST /api/v1/feedback` | 决策反馈优化 |
| ← | News Service | Trading AI | `GET /api/v1/subscription` | 获取订阅需求 |

**问题**:
- News Service 需要 Trading AI 的反馈来优化情报提取
- Trading AI 需要 News Service 的情报来做决策
- 同样存在启动顺序依赖

#### 依赖环3: Trading AI ↔ Backend

| 方向 | 调用方 | 被调用方 | 接口 | 用途 |
|------|--------|----------|------|------|
| → | Trading AI | Backend | `POST /api/trades` | 执行交易 |
| → | Trading AI | Backend | `GET /api/accounts/{id}` | 获取账户信息 |
| ← | Backend | Trading AI | `POST /api/v1/decision/callback` | 决策结果回调 |
| ← | Backend | Trading AI | `POST /api/v1/wakeup` | 唤醒AI决策 |

**问题**:
- Trading AI 需要 Backend 的账户数据才能决策
- Backend 需要 Trading AI 的决策结果才能执行交易
- 这是业务上的必然依赖，需要特殊处理

### 1.3 违背的设计原则

| 原则 | 当前状态 | 理想状态 |
|------|----------|----------|
| **数据主权** | Trading AI 从多个服务拉取数据 | 数据推送到事件总线，Trading AI 订阅消费 |
| **单向依赖** | 3个双向依赖环 | 所有服务只依赖事件总线 |
| **服务自治** | Trading AI 启动依赖其他服务就绪 | Trading AI 启动即可运行，数据异步到达 |
| **故障隔离** | 任一服务故障影响 Trading AI | Trading AI 可降级运行 |

---

## 二、目标架构设计

### 2.1 解耦后架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                目标架构：基于事件总线的完全解耦                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                      ┌─────────────────┐                         │
│                      │   Redis Streams │ ◄──── 统一事件总线        │
│                      │   (事件中心)     │                         │
│                      └────────┬────────┘                         │
│                               │                                  │
│        ┌──────────────────────┼──────────────────────┐          │
│        │                      │                      │          │
│        ▼                      ▼                      ▼          │
│   ┌──────────┐          ┌──────────┐          ┌──────────┐      │
│   │ Market   │          │  News    │          │ Trading  │      │
│   │ Data     │          │ Service  │          │ AI       │      │
│   │          │          │          │          │          │      │
│   │ 发布:    │          │ 发布:    │          │ 订阅:    │      │
│   │ ·行情    │          │ ·新闻    │          │ ·行情    │      │
│   │ ·指标    │          │ ·情报    │          │ ·新闻    │      │
│   │ ·异动    │          │ ·舆情    │          │ 发布:    │      │
│   └──────────┘          └──────────┘          │ ·决策    │      │
│                                               └────┬─────┘      │
│                                                    │             │
│                                                    ▼             │
│                                             ┌──────────┐        │
│                                             │ Backend  │        │
│                                             │          │        │
│                                             │ 订阅:    │        │
│                                             │ ·决策    │        │
│                                             │ 发布:    │        │
│                                             │ ·账户    │        │
│                                             │ ·交易    │        │
│                                             └──────────┘        │
│                                                                  │
│   ✅ 优势：                                                      │
│   - 所有服务只依赖 Redis，无直接调用                              │
│   - Trading AI 启动即可运行，数据异步到达                          │
│   - 新增服务只需接入事件总线，不影响现有服务                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 事件总线设计

```yaml
# Redis Streams 事件定义

streams:
  # Market Data 发布
  market:quote:realtime:
    publisher: market-data-service
    subscribers: [trading-ai-service, backend]
    schema:
      symbol: string        # 股票代码
      timestamp: datetime   # 时间戳
      open: float
      high: float
      low: float
      close: float
      volume: int
      indicators: object    # 技术指标
    retention: 1h           # 保留1小时

  market:indicator:updated:
    publisher: market-data-service
    subscribers: [trading-ai-service]
    schema:
      symbol: string
      timestamp: datetime
      ma5: float
      ma10: float
      ma20: float
      macd: float
      rsi: float
    retention: 1h

  market:alert:price_move:
    publisher: market-data-service
    subscribers: [trading-ai-service, backend]
    schema:
      symbol: string
      move_type: enum[limit_up, limit_down, surge, drop]
      change_percent: float
      trigger_time: datetime
    retention: 24h

  # News Service 发布
  news:intelligence:extracted:
    publisher: news-service
    subscribers: [trading-ai-service, backend]
    schema:
      symbol: string
      timestamp: datetime
      sentiment: enum[positive, negative, neutral]
      sentiment_score: float  # 0-1
      importance: int         # 1-10
      summary: string         # 摘要
      source: string
      related_sectors: [string]
    retention: 24h

  news:sentiment:changed:
    publisher: news-service
    subscribers: [trading-ai-service]
    schema:
      symbol: string
      old_sentiment: enum[positive, negative, neutral]
      new_sentiment: enum[positive, negative, neutral]
      confidence: float
    retention: 1h

  # Trading AI 发布
  ai:decision:made:
    publisher: trading-ai-service
    subscribers: [backend]
    schema:
      decision_id: uuid
      ai_account_id: string
      symbol: string
      action: enum[buy, sell, hold]
      confidence: float       # 0-1
      reasoning: string       # 决策理由
      position_ratio: float   # 建议仓位比例
      timestamp: datetime
      market_context: object  # 决策时的市场数据快照
      news_context: [object]  # 相关新闻情报
    retention: 30d

  ai:performance:report:
    publisher: trading-ai-service
    subscribers: [backend]
    schema:
      ai_account_id: string
      period: enum[day, week, month]
      total_return: float
      win_rate: float
      trade_count: int
      sharpe_ratio: float
      timestamp: datetime
    retention: 90d

  # Backend 发布
  backend:account:updated:
    publisher: backend
    subscribers: [trading-ai-service]
    schema:
      ai_account_id: string
      event_type: enum[created, activated, trade_executed, position_changed]
      payload: object
      timestamp: datetime
    retention: 7d

  backend:trade:executed:
    publisher: backend
    subscribers: [trading-ai-service]
    schema:
      trade_id: uuid
      ai_account_id: string
      symbol: string
      action: enum[buy, sell]
      quantity: int
      price: float
      total_amount: float
      timestamp: datetime
    retention: 30d
```

### 2.3 服务启动顺序

```
阶段1: 基础设施（顺序启动）
├── Redis
├── PostgreSQL
└── TimescaleDB

阶段2: 数据采集层（并行启动）
├── Market Data Service ──► 发布行情事件
└── News Service ─────────► 发布新闻事件

阶段3: 决策层（启动即可运行）
└── Trading AI Service ───► 订阅行情/新闻事件
                          ► 发布决策事件

阶段4: 业务层
└── Backend ─────────────► 订阅决策事件
                          ► 发布账户/交易事件
```

**关键改进**：
- Trading AI Service 启动时无需等待其他服务
- 数据通过事件总线异步到达
- 服务间完全解耦

---

## 三、数据流重新设计

### 3.1 行情数据流

#### 当前流程（有问题）
```
Market Data ──► Trading AI 定时轮询 ──► 获取行情
     ▲                                    │
     └──────── 订阅需求配置 ◄─────────────┘
```

#### 目标流程（解耦后）
```
Market Data ──► Redis Streams ──► Trading AI 订阅消费
                     │
                     ▼
               ┌─────────────┐
               │  Event Bus  │
               │  (消息队列)  │
               └─────────────┘
```

**实现细节**：

1. **Market Data 发布端**
```python
# market-data-service/src/publishers/quote_publisher.py

class QuotePublisher:
    def __init__(self, redis_client):
        self.redis = redis_client
        self.stream_key = "market:quote:realtime"

    async def publish_quote(self, quote: StockQuote):
        """发布行情到事件总线"""
        message = {
            "symbol": quote.symbol,
            "timestamp": quote.timestamp.isoformat(),
            "open": quote.open,
            "high": quote.high,
            "low": quote.low,
            "close": quote.close,
            "volume": quote.volume,
            "indicators": {
                "ma5": quote.ma5,
                "ma10": quote.ma10,
                "rsi": quote.rsi
            }
        }

        # 使用 XADD 发布到 Stream
        await self.redis.xadd(
            self.stream_key,
            message,
            maxlen=10000  # 保留最近10000条
        )

    async def publish_alert(self, alert: PriceAlert):
        """发布价格异动告警"""
        message = {
            "symbol": alert.symbol,
            "move_type": alert.move_type,
            "change_percent": alert.change_percent,
            "trigger_time": alert.trigger_time.isoformat()
        }

        await self.redis.xadd(
            "market:alert:price_move",
            message,
            maxlen=1000
        )
```

2. **Trading AI 订阅端**
```python
# trading-ai-service/src/subscribers/quote_subscriber.py

class QuoteSubscriber:
    def __init__(self, redis_client, consumer_group="ai-decision-group"):
        self.redis = redis_client
        self.consumer_group = consumer_group
        self.streams = [
            "market:quote:realtime",
            "market:alert:price_move"
        ]

    async def start_consuming(self):
        """开始消费行情事件"""
        # 创建消费者组（如果不存在）
        for stream in self.streams:
            try:
                await self.redis.xgroup_create(
                    stream,
                    self.consumer_group,
                    id="0",  # 从最早的消息开始
                    mkstream=True
                )
            except Exception:
                pass  # 消费者组已存在

        # 启动消费循环
        while True:
            try:
                # 读取消息（阻塞模式，最多阻塞5秒）
                messages = await self.redis.xreadgroup(
                    groupname=self.consumer_group,
                    consumername=f"ai-worker-{uuid.uuid4()}",
                    streams={stream: ">" for stream in self.streams},
                    count=100,
                    block=5000
                )

                for stream, msgs in messages:
                    for msg_id, fields in msgs:
                        await self.process_message(stream, msg_id, fields)

            except Exception as e:
                logger.error(f"Error consuming messages: {e}")
                await asyncio.sleep(1)

    async def process_message(self, stream: str, msg_id: str, fields: dict):
        """处理行情消息"""
        try:
            if stream == "market:quote:realtime":
                quote = StockQuote(**fields)
                await self.on_quote_update(quote)

            elif stream == "market:alert:price_move":
                alert = PriceAlert(**fields)
                await self.on_price_alert(alert)

            # 确认消息已处理（ACK）
            await self.redis.xack(stream, self.consumer_group, msg_id)

        except Exception as e:
            logger.error(f"Error processing message {msg_id}: {e}")

    async def on_quote_update(self, quote: StockQuote):
        """行情更新处理"""
        # 1. 更新本地行情缓存
        await self.cache.update_quote(quote)

        # 2. 检查是否触发决策条件
        if await self.should_make_decision(quote):
            await self.trigger_decision(quote)

    async def on_price_alert(self, alert: PriceAlert):
        """价格告警处理（高优先级）"""
        # 价格异动立即触发决策
        await self.trigger_urgent_decision(alert)
```

### 3.2 新闻情报流

#### 当前流程（有问题）
```
News Service ◄── Trading AI 定时轮询
     │
     └──► Trading AI 决策反馈（反向调用）
```

#### 目标流程（解耦后）
```
News Service ──► Redis Streams ──► Trading AI 订阅消费
                     │
                     ▼
            Trading AI 决策后
                     │
                     ▼
        Backend 执行交易
                     │
                     ▼
        Redis Streams ◄── 交易结果反馈
                     │
                     ▼
            News Service 订阅（可选优化）
```

**实现细节**：

1. **Trading AI 决策时关联新闻上下文**
```python
# trading-ai-service/src/services/decision_service.py

class DecisionService:
    def __init__(self, cache: NewsCache):
        self.cache = cache

    async def make_decision(self, symbol: str, quote: StockQuote) -> Decision:
        """基于行情和新闻做出决策"""

        # 1. 从本地缓存获取相关新闻（已订阅存入缓存）
        recent_news = await self.cache.get_news_for_symbol(symbol, hours=24)

        # 2. 构建决策上下文
        context = DecisionContext(
            quote=quote,
            news=recent_news,
            timestamp=datetime.now()
        )

        # 3. 调用大模型做出决策
        decision = await self.llm.decide(context)

        # 4. 发布决策事件（包含新闻上下文）
        await self.publish_decision(decision, context)

        return decision
```

### 3.3 决策执行流

#### 当前流程（有问题）
```
Trading AI ──► Backend 同步调用 ──► 执行交易
     ▲                                    │
     └──────── 交易结果回调 ◄────────────┘
```

#### 目标流程（解耦后）
```
Trading AI ──► Redis Streams ──► Backend 订阅消费
                     │
                     ▼
              Backend 执行交易
                     │
                     ▼
              Backend 发布交易结果
                     │
                     ▼
              Trading AI 订阅确认
```

**为什么保留 Backend 对 Trading AI 的调用？**

实际上，Backend 不需要调用 Trading AI。Trading AI 只需发布决策事件，Backend 订阅执行即可。

但有一个例外：**AI 唤醒机制**

```yaml
# AI 唤醒场景
backend:account:activated:
  publisher: backend
  subscribers: [trading-ai-service]
  # 当用户激活AI账户时，Backend发布事件
  # Trading AI 订阅后初始化该账户的决策状态
```

这不是依赖，而是事件通知。

---

## 四、接口调整方案

### 4.1 废弃的接口（改为事件订阅）

| 原接口 | 所在服务 | 替代方案 |
|--------|----------|----------|
| `GET /stocks/{symbol}/realtime` | Market Data | 订阅 `market:quote:realtime` Stream |
| `GET /stocks/{symbol}/kline` | Market Data | 订阅 `market:indicator:updated` Stream |
| `POST /api/v1/subscribe` | Market Data | 无需调用，Trading AI自主订阅Stream |
| `GET /intelligence/{code}` | News Service | 订阅 `news:intelligence:extracted` Stream |
| `POST /api/v1/feedback` | News Service | 通过 `ai:decision:made` 事件间接反馈 |
| `POST /api/trades` | Backend | 发布 `ai:decision:made` 事件 |
| `GET /api/accounts/{id}` | Backend | 订阅 `backend:account:updated` Stream |

### 4.2 新增的接口（事件驱动）

#### Trading AI Service 新增

```python
# trading-ai-service/src/api/event_routes.py

@router.post("/webhook/account-activated")
async def on_account_activated(event: AccountActivatedEvent):
    """
    Backend 调用：账户激活通知
    这不是双向依赖，而是事件通知的同步调用版本（可选）
    """
    await decision_service.initialize_account(event.ai_account_id)
    return {"status": "ok"}

@router.get("/health")
async def health_check():
    """健康检查，返回事件消费状态"""
    return {
        "status": "healthy",
        "event_lag": {
            "market:quote:realtime": await subscriber.get_lag(),
            "news:intelligence:extracted": await subscriber.get_lag()
        }
    }
```

#### Backend 新增

```python
# backend/src/routes/ai_decision_routes.js

// 订阅 AI 决策事件并执行交易
router.post('/webhook/ai-decision', async (req, res) => {
    const decision = req.body;

    // 1. 验证决策合法性
    const validation = await validateDecision(decision);
    if (!validation.valid) {
        logger.warn(`Invalid AI decision: ${validation.reason}`);
        return res.status(400).json({ error: validation.reason });
    }

    // 2. 执行交易
    const trade = await executeTrade(decision);

    // 3. 发布交易执行事件
    await eventBus.publish('backend:trade:executed', {
        trade_id: trade.id,
        ai_account_id: decision.ai_account_id,
        symbol: decision.symbol,
        action: decision.action,
        quantity: trade.quantity,
        price: trade.price,
        timestamp: new Date()
    });

    res.json({ status: 'executed', trade_id: trade.id });
});
```

### 4.3 事件总线 SDK 设计

```python
# shared/event_bus/sdk.py

class EventBusSDK:
    """统一事件总线SDK，所有服务共用"""

    def __init__(self, redis_url: str, service_name: str):
        self.redis = aioredis.from_url(redis_url)
        self.service_name = service_name
        self.consumer_group = f"{service_name}-group"

    async def publish(self, stream: str, message: dict):
        """发布事件"""
        message['_meta'] = {
            'publisher': self.service_name,
            'timestamp': datetime.now().isoformat()
        }
        await self.redis.xadd(stream, message, maxlen=10000)

    async def subscribe(self, streams: list, handler: callable):
        """订阅事件"""
        # 创建消费者组
        for stream in streams:
            try:
                await self.redis.xgroup_create(
                    stream, self.consumer_group, mkstream=True
                )
            except Exception:
                pass

        # 消费循环
        while True:
            messages = await self.redis.xreadgroup(
                groupname=self.consumer_group,
                consumername=f"{self.service_name}-{uuid.uuid4()}",
                streams={s: ">" for s in streams},
                block=5000
            )

            for stream, msgs in messages:
                for msg_id, fields in msgs:
                    try:
                        await handler(stream, fields)
                        await self.redis.xack(stream, self.consumer_group, msg_id)
                    except Exception as e:
                        logger.error(f"Handler error: {e}")
```

---

## 五、实施步骤

### Phase 1: 基础设施（3天）

- [ ] **Day 1**: 部署共享 Redis Cluster
  - Docker Compose 配置
  - 持久化配置（AOF）
  - 健康检查

- [ ] **Day 2**: 开发事件总线 SDK
  - 发布接口
  - 订阅接口（支持消费者组）
  - 消息确认机制

- [ ] **Day 3**: 定义事件 Schema
  - 所有 Stream 的消息格式
  - 验证规则
  - 版本管理

### Phase 2: Market Data 改造（2天）

- [ ] **Day 4**: 实现行情发布
  - 采集到行情后立即发布到 Stream
  - 批量发布优化（10秒内合并）
  - 异常处理（发布失败重试）

- [ ] **Day 5**: 移除旧接口依赖
  - 废弃轮询接口（标记为 deprecated）
  - 更新文档
  - 测试发布性能

### Phase 3: News Service 改造（2天）

- [ ] **Day 6**: 实现新闻发布
  - DeepSeek处理完成后发布到 Stream
  - 情感变化时发布变更事件

- [ ] **Day 7**: 移除旧接口依赖
  - 废弃轮询接口
  - 更新订阅机制

### Phase 4: Trading AI 改造（4天）

- [ ] **Day 8-9**: 实现事件订阅
  - 订阅行情 Stream
  - 订阅新闻 Stream
  - 本地缓存管理

- [ ] **Day 10**: 实现决策发布
  - 决策后发布到 Stream
  - 包含完整上下文

- [ ] **Day 11**: 移除旧接口调用
  - 不再轮询 Market Data
  - 不再轮询 News Service

### Phase 5: Backend 改造（2天）

- [ ] **Day 12**: 实现决策订阅
  - 订阅 AI 决策 Stream
  - 执行交易
  - 发布交易结果

- [ ] **Day 13**: 账户事件发布
  - 账户激活时发布事件
  - 持仓变化时发布事件

### Phase 6: 联调测试（3天）

- [ ] **Day 14-15**: 集成测试
  - 端到端流程测试
  - 性能测试
  - 故障恢复测试

- [ ] **Day 16**: 文档更新
  - API文档更新
  - 架构图更新
  - 运维手册

**总计：16天（约3周）**

---

## 六、风险与缓解

### 6.1 风险分析

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| **事件丢失** | 中 | 高 | 使用 Redis Streams ACK 机制，消费者确认后才删除 |
| **消息堆积** | 高 | 高 | 监控消费延迟，自动扩容消费者实例 |
| **事件乱序** | 低 | 中 | 使用时间戳排序，Trading AI 处理时考虑时间窗口 |
| **Redis 故障** | 低 | 高 | 部署 Redis Cluster + 降级机制（缓存数据） |
| **Consumer Group 失衡** | 中 | 中 | 使用自动负载均衡，监控每个消费者的消费速率 |

### 6.2 降级策略

当事件总线不可用时：

```python
# Trading AI 降级策略

class DegradedDecisionService:
    async def make_decision(self, symbol: str):
        # 1. 尝试从本地缓存获取行情
        quote = await self.local_cache.get_quote(symbol)

        if not quote or self.is_stale(quote):
            # 2. 缓存不存在或过期，使用默认决策
            return Decision(
                action=Action.HOLD,
                confidence=0.5,
                reasoning="市场数据不可用，保持观望"
            )

        # 3. 使用缓存数据做决策（可能基于过期数据）
        return await self.llm.decide_with_cache(quote)
```

### 6.3 监控指标

```yaml
# 关键监控指标

metrics:
  event_lag:
    - market:quote:realtime      # 消费延迟（秒）
    - news:intelligence:extracted
    - ai:decision:made

  consumer_health:
    - consumer_count             # 消费者实例数
    - pending_messages           # 待处理消息数
    - ack_rate                   # 消息确认率

  business_kpi:
    - decision_latency           # 从行情到决策的延迟
    - decision_accuracy          # 决策准确率（回测）
    - event_driven_trade_ratio   # 事件驱动交易占比
```

---

## 七、总结

### 解耦前后对比

| 维度 | 当前（双向依赖） | 目标（事件驱动） |
|------|------------------|------------------|
| **服务启动** | 需要按顺序启动，易死锁 | 并行启动，启动即可运行 |
| **故障影响** | 任一服务故障影响 Trading AI | Trading AI 可降级运行 |
| **扩展性** | 新增服务需修改 Trading AI | 新增服务只需接入事件总线 |
| **耦合度** | 3个双向依赖环 | 所有服务只依赖 Redis |
| **实时性** | 轮询延迟（5-10秒） | 事件驱动（毫秒级） |
| **复杂度** | 低（同步调用） | 中（异步事件） |

### 关键收益

1. **彻底解耦**：消除3个双向依赖环
2. **提升可用性**：Trading AI 可独立运行
3. **增强扩展性**：新服务接入成本低
4. **实时性提升**：从轮询到事件驱动

### 实施关键

1. **Redis 高可用**：必须部署 Cluster，单点是瓶颈
2. **SDK 标准化**：所有服务使用统一 SDK，降低接入成本
3. **监控完善**：事件延迟、消费速率必须监控
4. **降级测试**：必须验证事件总线故障时的降级能力

---

*文档版本: v1.0*
*创建日期: 2026-02-11*
*维护者: 首席架构师*
