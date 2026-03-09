# News Service 事件接口规范文档

> 本文档定义 News Service 通过事件总线（Redis Streams）发布和订阅的事件规范。
> 版本: v1.0
> 最后更新: 2026-02-12

---

## 1. 概述

### 1.1 事件总线架构

News Service 使用 Redis Streams 作为统一事件总线，实现与其他服务的异步解耦通信。

```
┌─────────────────────────────────────────────────────────────┐
│                      Redis Streams                          │
├─────────────────────────────────────────────────────────────┤
│  news:intelligence:extracted  ←  发布（News Service）        │
│  news:sentiment:changed       ←  发布（News Service）        │
│  market:alert:price_move      →  订阅（Market Data Service） │
│  ai:performance:report        →  订阅（Trading AI Service）  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 通用事件格式

所有事件遵循统一的事件 Schema：

```json
{
  "event_id": "uuid-v4-string",
  "event_type": "news:intelligence:extracted",
  "timestamp": "2026-02-12T10:00:00Z",
  "source": "news-service",
  "payload": {},
  "correlation_id": "optional-trace-id",
  "version": "1.0"
}
```

### 1.3 通用字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `event_id` | string | ✅ | 全局唯一事件ID (UUID v4) |
| `event_type` | string | ✅ | 事件类型标识符 |
| `timestamp` | string | ✅ | 事件发生时间 (ISO 8601 UTC格式) |
| `source` | string | ✅ | 事件来源服务名称 |
| `payload` | object | ✅ | 事件负载数据 |
| `correlation_id` | string | ❌ | 关联追踪ID，用于链路追踪 |
| `version` | string | ✅ | 事件版本号，当前为 "1.0" |

---

## 2. 发布事件

### 2.1 新闻情报提取完成事件

**事件名称**: `news:intelligence:extracted`

**发布时机**: DeepSeek 处理完新闻并提取结构化情报后

**消费方**: Trading AI Service

#### Payload 字段定义

| 字段 | 类型 | 必填 | 说明 | 示例值 |
|------|------|------|------|--------|
| `stock_code` | string | ✅ | 股票代码 | "000001.SZ" |
| `intelligence` | string | ✅ | 情报摘要（≤100字符） | "平安银行发布业绩预增公告" |
| `sentiment` | string | ✅ | 情感类型 | "positive" / "negative" / "neutral" |
| `confidence` | number | ✅ | 置信度 (0-1) | 0.85 |
| `timestamp` | string | ✅ | 情报提取时间 (ISO 8601) | "2026-02-12T10:00:00Z" |
| `source` | string | ❌ | 情报来源 | "deepseek" / "sina" / "eastmoney" |

#### 完整示例

```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "event_type": "news:intelligence:extracted",
  "timestamp": "2026-02-12T10:00:00Z",
  "source": "news-service",
  "payload": {
    "stock_code": "000001.SZ",
    "intelligence": "平安银行发布业绩预增公告，净利润同比增长15%",
    "sentiment": "positive",
    "confidence": 0.92,
    "timestamp": "2026-02-12T10:00:00Z",
    "source": "deepseek"
  },
  "correlation_id": "trace-123456",
  "version": "1.0"
}
```

#### 字段约束

- `stock_code`: 必须符合 A 股代码格式（6位数字+交易所后缀）
- `intelligence`: 最大长度 200 字符，中文按2字符计算
- `sentiment`: 只允许 "positive", "negative", "neutral" 三种值
- `confidence`: 浮点数，范围 0.0 - 1.0

---

### 2.2 情感变化事件

**事件名称**: `news:sentiment:changed`

**发布时机**: 股票情感分析结果发生显著变化时（如从 positive 变为 negative）

**消费方**: Trading AI Service

#### Payload 字段定义

| 字段 | 类型 | 必填 | 说明 | 示例值 |
|------|------|------|------|--------|
| `stock_code` | string | ✅ | 股票代码 | "000001.SZ" |
| `old_sentiment` | string | ✅ | 原情感类型 | "neutral" |
| `new_sentiment` | string | ✅ | 新情感类型 | "positive" |
| `change_reason` | string | ✅ | 变化原因简述 | "发布业绩预告" |
| `timestamp` | string | ✅ | 变化检测时间 (ISO 8601) | "2026-02-12T10:00:00Z" |

#### 完整示例

```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440001",
  "event_type": "news:sentiment:changed",
  "timestamp": "2026-02-12T10:00:00Z",
  "source": "news-service",
  "payload": {
    "stock_code": "000001.SZ",
    "old_sentiment": "neutral",
    "new_sentiment": "positive",
    "change_reason": "发布业绩预增公告",
    "timestamp": "2026-02-12T10:00:00Z"
  },
  "version": "1.0"
}
```

#### 触发条件

情感变化事件仅在以下情况触发：
- 股票代码已有历史情感记录
- 新旧情感值不同（neutral → positive, positive → negative 等）
- 变化置信度 > 0.7

---

## 3. 订阅事件

### 3.1 行情异动告警事件

**事件名称**: `market:alert:price_move`

**发布方**: Market Data Service

**消费时机**: 收到异动后触发相关新闻采集

**消费者组**: `news-trigger-group`

#### Payload 字段定义

| 字段 | 类型 | 必填 | 说明 | 示例值 |
|------|------|------|------|--------|
| `symbol` | string | ✅ | 股票代码 | "000001.SZ" |
| `alert_type` | string | ✅ | 异动类型 | "price_surge" / "price_drop" / "volume_spike" |
| `severity` | string | ✅ | 严重程度 | "high" / "medium" / "low" |
| `message` | string | ✅ | 异动描述 | "股价大涨7%" |
| `current_price` | number | ❌ | 当前价格 | 15.24 |
| `change_percent` | number | ❌ | 涨跌幅 (%) | 7.5 |
| `timestamp` | string | ✅ | 异动时间 (ISO 8601) | "2026-02-12T10:00:00Z" |

#### 完整示例

```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440002",
  "event_type": "market:alert:price_move",
  "timestamp": "2026-02-12T10:00:00Z",
  "source": "market-data-service",
  "payload": {
    "symbol": "000001.SZ",
    "alert_type": "price_surge",
    "severity": "high",
    "message": "股价大涨7%，突破前期高点",
    "current_price": 15.24,
    "change_percent": 7.5,
    "timestamp": "2026-02-12T10:00:00Z"
  },
  "version": "1.0"
}
```

#### 处理逻辑

News Service 收到该事件后：

1. 解析 `symbol` 获取股票代码
2. 根据 `severity` 确定采集策略：
   - `high`: 采集所有数据源（sina, eastmoney, weibo, xueqiu, guba）
   - `medium`: 采集主要数据源（sina, eastmoney, xueqiu）
   - `low`: 采集基础数据源（sina, eastmoney）
3. 触发异步新闻采集任务
4. 采集结果通过 `news:intelligence:extracted` 事件发布

---

### 3.2 AI 决策反馈报告事件

**事件名称**: `ai:performance:report`

**发布方**: Trading AI Service

**消费时机**: 收到反馈后优化 Prompt

**消费者组**: `news-trigger-group`

#### Payload 字段定义

| 字段 | 类型 | 必填 | 说明 | 示例值 |
|------|------|------|------|--------|
| `account_id` | string | ✅ | AI 账户ID | "ai-acc-12345" |
| `period` | string | ✅ | 报告周期 | "daily" / "weekly" / "monthly" |
| `metrics` | object | ✅ | 性能指标 | 见下表 |
| `timestamp` | string | ✅ | 报告时间 (ISO 8601) | "2026-02-12T10:00:00Z" |

#### metrics 字段定义

| 字段 | 类型 | 说明 | 示例值 |
|------|------|------|--------|
| `total_trades` | number | 总交易次数 | 10 |
| `win_rate` | number | 胜率 (0-1) | 0.6 |
| `avg_return` | number | 平均收益率 (%) | 2.5 |
| `max_drawdown` | number | 最大回撤 (%) | -3.2 |
| `decision_accuracy` | number | 决策准确度评分 (0-1) | 0.75 |

#### 完整示例

```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440003",
  "event_type": "ai:performance:report",
  "timestamp": "2026-02-12T10:00:00Z",
  "source": "trading-ai-service",
  "payload": {
    "account_id": "ai-acc-12345",
    "period": "daily",
    "metrics": {
      "total_trades": 10,
      "win_rate": 0.6,
      "avg_return": 2.5,
      "max_drawdown": -3.2,
      "decision_accuracy": 0.75
    },
    "timestamp": "2026-02-12T10:00:00Z"
  },
  "version": "1.0"
}
```

#### 处理逻辑

News Service 收到该事件后（当前阶段仅记录，不执行实际优化）：

1. 解析 `metrics` 获取决策准确度
2. 如果 `decision_accuracy < 0.6`，记录需要优化 Prompt
3. 根据 `win_rate` 和 `avg_return` 调整情报筛选策略
4. 优化策略将在下次采集时生效

---

## 4. 错误码和异常处理

### 4.1 事件发布错误

| 错误码 | 说明 | 处理建议 |
|--------|------|----------|
| `E1001` | Redis 连接失败 | 进入降级模式，跳过事件发布 |
| `E1002` | 事件序列化失败 | 记录错误日志，丢弃该事件 |
| `E1003` | 事件大小超限 (>512KB) | 截断 payload 中的长文本字段 |
| `E1004` | 发布超时 | 重试3次后放弃，记录日志 |

### 4.2 事件消费错误

| 错误码 | 说明 | 处理建议 |
|--------|------|----------|
| `E2001` | 事件解析失败 | 记录错误日志，ACK 该消息避免阻塞 |
| `E2002` | 处理器执行失败 | 记录错误，根据重试策略决定是否重试 |
| `E2003` | 下游服务调用失败 | 降级处理，返回默认值 |

### 4.3 降级策略

当事件总线不可用时，News Service 进入降级模式：

```python
class ServiceMode:
    NORMAL = "normal"       # 正常模式：完整事件发布/订阅
    DEGRADED = "degraded"   # 降级模式：跳过事件发布/订阅
```

**降级模式行为**：
- 不发布任何事件（情报提取后仅存储，不通知其他服务）
- 不订阅任何事件（行情异动由定时任务补偿）
- 限制数据源为 sina、eastmoney（节省资源）
- 禁用 AI 情感分析（节省 Token）

**自动恢复**：
- 每 30 秒检测 Redis 连接状态
- 连接恢复后自动切换回 NORMAL 模式

---

## 5. 接口版本管理

### 5.1 版本策略

- 事件版本通过 `version` 字段标识
- 当前版本: `1.0`
- 向后兼容：新版本消费者应能处理旧版本事件

### 5.2 版本升级流程

1. 新增字段必须设为可选（nullable）
2. 废弃字段保留至少 2 个版本
3. 破坏性变更需提前通知所有消费方

---

## 6. 联调检查清单

### 6.1 发布方检查项

- [ ] `news:intelligence:extracted` 事件格式符合规范
- [ ] `news:sentiment:changed` 事件格式符合规范
- [ ] 时间戳使用 ISO 8601 UTC 格式
- [ ] 股票代码格式正确（6位数字+交易所后缀）
- [ ] 降级模式正确处理（Redis 断开时不阻塞）

### 6.2 订阅方检查项

- [ ] 能正确解析 `market:alert:price_move` 事件
- [ ] 能正确解析 `ai:performance:report` 事件
- [ ] 消费者组配置正确（`news-trigger-group`）
- [ ] 事件处理异常时有重试机制
- [ ] 长时间未收到事件时有告警

### 6.3 端到端测试场景

1. **正常流程测试**
   - Market Data 发布 price_move 事件
   - News Service 触发采集并发布 intelligence 事件
   - Trading AI 接收 intelligence 事件

2. **降级模式测试**
   - 断开 Redis 连接
   - 验证 News Service 进入降级模式
   - 恢复 Redis 连接
   - 验证 News Service 恢复并补发事件

3. **高并发测试**
   - 模拟 1000 次/秒的事件发布
   - 验证无消息丢失
   - 验证消费者组负载均衡

---

## 7. 相关文档

- [News Service TODO](./TODO.md) - 开发任务追踪
- [News Service TEST_SCRIPTS](./TEST_SCRIPTS.md) - 测试脚本索引
- [事件总线 SDK 使用指南](../../../infra/event-bus/USAGE_GUIDE.md)
- [服务架构设计](../../../docs/architecture/CURRENT/SERVICE_ARCHITECTURE.md)

---

*文档版本: v1.0*
*最后更新: 2026-02-12*
*维护者: News Service 开发团队*
