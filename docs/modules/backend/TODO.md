# Backend 模块 - 开发任务追踪

> 本文档仅记录未完成和待其他服务跟进的工作项。
> 已完成功能请查阅 [HAVE_DONE.md](./HAVE_DONE.md)。
> 最后更新：2026-02-11

---

## 状态图例

- 🔲 待开发
- 🔄 开发中
- ⚠️ 待验证/部分完成
- ⏸️ 阻塞（依赖其他服务）
- ✅ 已完成（已移至 HAVE_DONE.md）

---

## 一、未完成工作项

### 1.1 集成测试环境完善

| 编号 | 任务 | 状态 | 优先级 | 说明 |
|------|------|------|--------|------|
| I-001 | 完善Docker Compose测试环境 | ⚠️ | P2 | 使剩余9个集成测试可自动化运行 |

**待解决的集成测试**:
- `service-communication.test.js` - 需 trading-ai-service:8000, market-data-service:8001
- `ai-account-creation.test.js` - 需 Backend:3001 + PostgreSQL
- `ai-dialogue.test.js` - 需 WebSocket 服务
- `ai-decision-execution.test.js` - 需 Backend + PostgreSQL
- `health-check.test.js` - 部分需外部服务

---

## 二、阻塞任务（需其他服务跟进）

### 2.1 等待 trading-ai-service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| AI对话会话 | `POST /api/v1/dialogue/session` | ⏸️ | ~~T-011重构依赖此接口~~ ➤ 架构变更：由Backend实现，见C4-001 |
| 投资偏好提取 | `POST /api/v1/dialogue/preference` | ⏸️ | ~~从对话提取结构化偏好~~ ➤ 架构变更：由Backend实现，见C4-003 |

> **架构变更说明**: 根据冲突4解决方案，AI对话服务由Backend实现，不再依赖Trading AI Service。见 [infra/TODO.md](../infra/TODO.md) C4-001~C4-007。

**接口规格**:

**1. 对话会话接口** (`POST /api/v1/dialogue/session`)
```typescript
// 请求
{
  account_id: string;
  user_preferences: object;
  history: Message[];
}

// 响应 (SSE流式)
{
  type: 'message|preference_update|complete';
  content: string;
  roundCount: number;
  remainingRounds: number;
  extractedPreference?: object;
}
```

### 2.2 等待 market-data-service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 股票交易状态 | `GET /api/v1/stocks/{symbol}/trading-status` | ⏸️ | T-015需要实时状态 |
| 状态变更订阅 | `WS /ws/market/stock-status` | ⏸️ | ~~实时获取停牌/ST变更~~ ➤ 优化方案：通过事件总线订阅 `market:alert:price_move`，见C2-001 |
| 市场规则配置 | `GET /api/v1/market/rules` | ⏸️ | 各市场交易规则 |

> **架构变更说明**: 根据冲突2/3解决方案，优先使用事件总线替代部分WebSocket订阅。见 [infra/TODO.md](../infra/TODO.md) C2-001, C3-001。

**接口规格**:

**1. 交易状态接口** (`GET /api/v1/stocks/{symbol}/trading-status`)
```typescript
// 响应
{
  symbol: string;
  status: 'normal|suspended|limit_up|limit_down|auction';
  priceLimits: { upper: number; lower: number; };
  tradingPhase: 'continuous|auction|closed';
  isST: boolean;
  isSuspended: boolean;
}
```

### 2.3 等待 news-service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 新闻情报获取 | `GET /api/v1/intelligence/{stock_code}` | ⏸️ | 预留接口 |
| 新闻推送订阅 | `SUBSCRIBE news:breaking` | 🔄 | 解决中：通过事件总线订阅 `news:intelligence:extracted`，依赖C2-001, C3-002 |

> **架构变更说明**: 根据冲突2/3解决方案，使用事件总线订阅新闻事件。见 [infra/TODO.md](../infra/TODO.md) C2-001, C3-002。

---

## 三、技术债务

### 3.1 测试完善

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| 集成测试环境 | P2 | 完善Docker Compose使全部75个测试可运行 | 1天 |
| E2E测试 | P3 | 端到端测试覆盖 | 3天 |

### 3.2 性能优化

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| API响应缓存 | P2 | 热点数据Redis缓存 | 1天 |
| 数据库连接池 | P2 | 优化PostgreSQL连接池配置 | 0.5天 |
| WebSocket性能 | P3 | 支持更多并发连接 | 1天 |

---

## 四、架构优化任务（2026-02-11新增）

### 4.1 冲突解决方案

#### 冲突1：循环依赖解决（共享Redis + 冷启动）

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C1-BE-001 | 接入健康检查SDK | 🔲 | P0 | 服务启动时检查Redis和依赖服务状态 |
| C1-BE-002 | 实现降级运行模式 | 🔲 | P0 | 依赖不可用时以降级模式启动，提供有限功能 |
| C1-BE-003 | 实现自动恢复机制 | 🔲 | P0 | 依赖恢复后自动升级到正常模式 |

**阻塞状态**: 依赖 [infra/TODO.md](../infra/TODO.md) C1-003（健康检查SDK）

#### 冲突2：统一事件总线接入

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C2-BE-001 | 集成Node.js事件总线SDK | 🔲 | P0 | 使用SDK发布和订阅事件 |
| C2-BE-002 | 发布账户更新事件 | 🔲 | P0 | 账户状态变更时发布`backend:account:updated` |
| C2-BE-003 | 发布交易执行事件 | 🔲 | P0 | 交易完成后发布`backend:trade:executed` |
| C2-BE-004 | 订阅AI决策事件 | 🔲 | P0 | 订阅`ai:decision:made`，接收AI决策通知 |
| C2-BE-005 | 实现事件处理器 | 🔲 | P0 | 处理AI决策事件，触发交易执行 |
| C2-BE-006 | 配置消费者组 | 🔲 | P1 | Backend多实例负载均衡消费 |

**阻塞状态**: 依赖 [infra/TODO.md](../infra/TODO.md) C2-002（Node.js SDK）

#### 冲突4：AI对话服务实现（Backend承接）

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C4-001 | 实现对话会话接口 | 🔲 | P0 | `POST /api/ai-accounts/{id}/dialogue/session`创建会话 |
| C4-002 | 实现对话消息接口（SSE） | 🔲 | P0 | `POST /api/ai-accounts/{id}/dialogue/message`流式响应 |
| C4-003 | 实现画像提取接口 | 🔲 | P0 | `POST /api/ai-accounts/{id}/finalize`提取并激活账户 |
| C4-004 | 对接DeepSeek API | 🔲 | P0 | 封装DeepSeek调用，支持流式响应 |
| C4-005 | 实现对话上下文管理 | 🔲 | P0 | Redis存储对话历史，10轮限制 |
| C4-006 | 实现Token成本控制 | 🔲 | P1 | 单条<2000 tokens，总额度限制 |

**阻塞状态**: 无阻塞，可独立开发

#### 冲突5：Miniprogram游客模式（Backend实现）

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C5-001 | 实现游客Token生成 | 🔲 | P0 | `POST /api/guest/auth/token`，基于openid_hash |
| C5-002 | 实现游客AI账户创建 | 🔲 | P0 | `POST /api/guest/ai-accounts`，限制2个 |
| C5-003 | 实现游客AI对话 | 🔲 | P0 | `POST /api/guest/ai-accounts/:id/chat`，限制10轮 |
| C5-004 | 实现游客数据迁移 | 🔲 | P0 | 登录后游客数据绑定到正式用户，事务保护 |
| C5-005 | 实现智能过期策略 | 🔲 | P0 | 无AI账户24h过期，有AI账户72h过期 |
| C5-006 | 创建guest_sessions表 | 🔲 | P0 | 游客会话表设计，含openid_hash、expires_at等字段 |

**阻塞状态**: 无阻塞，可独立开发

#### 优化3：三层API架构

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| O3-001 | 公开API层实现 | 🔲 | P0 | `/api/public/*`行情、排行榜、搜索无需认证 |
| O3-002 | 游客API层实现 | 🔲 | P0 | `/api/guest/*`游客Token、临时AI账户 |
| O3-003 | 认证API层保护 | 🔲 | P0 | `/api/*`JWT认证加固 |
| O3-004 | API路由分层中间件 | 🔲 | P0 | 根据路由前缀应用不同认证策略 |

**阻塞状态**: 依赖C5-001~C5-006（游客模式）

#### 优化6：Miniprogram数据流优化（Backend部分）

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| O6-003 | 优化收益接口 | 🔲 | P0 | `GET /api/ai-accounts/{id}/performance`含持仓成本 |
| O6-004 | 缓存Market Data数据 | 🔲 | P0 | 5秒TTL缓存行情数据，减少外部依赖 |

**阻塞状态**: 依赖 [infra/TODO.md](../infra/TODO.md) C2-001（事件总线SDK）用于订阅行情

---

## 五、外部依赖跟踪（更新）

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 |
|----------|---------|---------|---------|
| trading-ai-service | `POST /api/v1/dialogue/session` | ❌ 取消 | 2026-02-11 | 架构变更：由Backend实现 |
| trading-ai-service | `POST /api/v1/dialogue/preference` | ❌ 取消 | 2026-02-11 | 架构变更：由Backend实现 |
| market-data-service | `GET /api/v1/stocks/{symbol}/trading-status` | ⏸️ 阻塞 | - | 仍需要 |
| market-data-service | `WS /ws/market/stock-status` | 🔄 解决中 | 2026-02-11 | 替换为事件总线订阅 |
| market-data-service | `GET /api/v1/market/rules` | ⏸️ 阻塞 | - | 仍需要 |
| news-service | `GET /api/v1/intelligence/{code}` | ⏸️ 阻塞 | - | 预留接口 |
| news-service | `SUBSCRIBE news:breaking` | 🔄 解决中 | 2026-02-11 | 替换为事件总线订阅 |
| infra | 事件总线Node.js SDK | 🔄 开发中 | 2026-02-11 | C2-002框架已搭建，Python SDK已完成可用，见下方使用指南 |
| infra | 健康检查SDK | 🔲 待开发 | - | C1-003 |

---

## 附录：事件总线SDK使用指南

### SDK位置
```
项目根目录/infra/event-bus/
├── src/event_bus/          # Python SDK（已完成）
└── src/node/               # Node.js SDK（框架搭建中）
```

### Backend使用说明

Backend使用Node.js开发，事件总线Node.js SDK正在开发中。当前可使用的方案：

**方案1：使用ioredis直接操作（推荐临时方案）**
```javascript
const Redis = require('ioredis');

// 创建Redis连接
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

// 订阅AI决策事件
async function subscribeToAIDecisions() {
  const consumerGroup = 'backend-trade-executor';
  const consumerName = `backend-${Date.now()}`;
  const streamKey = 'ai:decision:made';

  // 创建消费者组
  try {
    await redis.xgroup('CREATE', streamKey, consumerGroup, '0', 'MKSTREAM');
  } catch (err) {
    if (!err.message.includes('BUSYGROUP')) throw err;
  }

  // 消费消息
  while (true) {
    const messages = await redis.xreadgroup(
      'GROUP', consumerGroup, consumerName,
      'BLOCK', 5000,
      'STREAMS', streamKey, '>'
    );

    if (messages) {
      for (const [, msgs] of messages) {
        for (const [id, data] of msgs) {
          const event = JSON.parse(data[1]);
          console.log('收到AI决策:', event);

          // 处理决策...
          await executeTrade(event.payload);

          // ACK确认
          await redis.xack(streamKey, consumerGroup, id);
        }
      }
    }
  }
}

// 发布交易执行事件
async function publishTradeExecuted(trade) {
  const event = {
    eventId: uuid(),
    eventType: 'backend:trade:executed',
    timestamp: new Date().toISOString(),
    source: 'backend',
    payload: trade
  };

  await redis.xadd('backend:trade:executed', '*', 'data', JSON.stringify(event));
}
```

**方案2：等待Node.js SDK完成**
Node.js SDK框架已搭建，包含：
- `schema.js` - 事件类型定义
- `client.js` - Redis连接管理
- `exceptions.js` - 异常定义

完整实现预计2天工作量。

### 事件Schema规范

所有事件遵循统一格式：
```json
{
  "eventId": "uuid",
  "eventType": "ai:decision:made",
  "timestamp": "2026-02-11T10:00:00Z",
  "source": "trading-ai",
  "payload": { ... },
  "correlationId": "optional"
}
```

### Backend需要处理的事件

| 事件类型 | 方向 | 处理逻辑 |
|----------|------|----------|
| `ai:decision:made` | 订阅 | 接收AI决策，执行交易 |
| `backend:trade:executed` | 发布 | 交易完成后发布结果 |
| `backend:account:updated` | 发布 | 账户状态变更时发布 |

### 完整文档
- [SDK使用指南](../../infra/event-bus/USAGE_GUIDE.md) - 包含Python示例，Node.js可参考
- [SDK README](../../infra/event-bus/README.md)

---

## 四、未来规划（与架构演进相关）

### 4.1 短期（1-2周）

- [ ] 完善集成测试环境（I-001）
- [ ] 对接 trading-ai-service 对话接口
- [ ] 对接 market-data-service 交易状态接口
- [ ] 添加API响应缓存层

### 4.2 中期（1-2月）

- [ ] 引入消息队列（RabbitMQ/Kafka）
- [ ] 添加分布式追踪（Jaeger）
- [ ] 完善Prometheus业务指标
- [ ] GraphQL接口支持

### 4.3 长期（3月+）

- [ ] 微服务拆分（Auth/Trade/AI独立服务）
- [ ] 服务网格（Istio）
- [ ] 多活架构支持

---

## 五、外部依赖跟踪

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 |
|----------|---------|---------|---------|
| trading-ai-service | `POST /api/v1/dialogue/session` | 🔲 未开始 | - |
| trading-ai-service | `POST /api/v1/dialogue/preference` | 🔲 未开始 | - |
| market-data-service | `GET /api/v1/stocks/{symbol}/trading-status` | 🔲 未开始 | - |
| market-data-service | `WS /ws/market/stock-status` | 🔲 未开始 | - |
| market-data-service | `GET /api/v1/market/rules` | 🔲 未开始 | - |
| news-service | `GET /api/v1/intelligence/{code}` | 🔲 未开始 | - |
| news-service | `SUBSCRIBE news:breaking` | 🔲 未开始 | - |

---

## 六、最近更新记录

| 日期 | 更新内容 | 更新人 |
|------|---------|--------|
| 2026-02-11 | 重构TODO.md，创建HAVE_DONE.md | 首席架构师 |
| 2026-02-11 | 完成T-011~T-015开发与测试 | 开发团队 |
| 2026-02-10 | 完成T-001~T-010开发与测试 | 开发团队 |

---

## 七、文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 已完成功能 | `./HAVE_DONE.md` | 已完成功能与架构师评价 |
| 测试脚本 | `./TEST_SCRIPTS.md` | 测试脚本功能说明与索引 |
| 测试源码 | `../../../backend/tests/` | 单元测试和集成测试代码 |

---

*文档版本: v2.0（精简版）*
*最后更新: 2026-02-11*
*维护者: 首席架构师*

**提示：已完成功能详情和代码审查报告请查阅 [HAVE_DONE.md](./HAVE_DONE.md)**
