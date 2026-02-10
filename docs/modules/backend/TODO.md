# Backend 模块开发规划

## 模块概述

**模块名称**: Backend (Node.js + Express)
**主要职责**: API网关、业务逻辑编排、用户认证鉴权、AI账户管理、交易执行
**数据主权**: 业务数据（users, accounts, trades, positions）
**服务端口**: 3001

---

## 服务通信标准

### 1. 对外提供接口

| 接口类型 | 路径 | 消费者 | 说明 |
|---------|------|--------|------|
| REST API | `/api/*` | Frontend, Miniprogram | 统一API网关，JWT认证 |
| WebSocket | `/ws/*` | Frontend | 实时通知、AI对话 |

### 2. 依赖外部服务

| 服务 | 调用方式 | 用途 | 失败策略 |
|------|---------|------|---------|
| trading-ai-service | HTTP REST (`http://trading-ai-service:8000`) | AI决策生成、提示词提炼 | 熔断降级，返回友好错误 |
| market-data-service | HTTP REST (`http://market-data-service:8001`) | 历史数据查询 | 缓存兜底，返回 stale 数据 |
| news-service | HTTP REST (`http://news-service:8002`) | 新闻情报获取 | 可选依赖，失败返回空 |
| PostgreSQL | 直接连接 | 业务数据存储 | 事务回滚，报错 |
| Redis | 直接连接 | 会话、缓存、消息队列 | 服务降级 |

### 3. Redis Pub/Sub 事件

```javascript
// 发布事件
PUBLISH 'data-service:hot-stocks' - 热股票列表更新
PUBLISH 'ai:wakeup:trigger' - AI唤醒触发

// 订阅事件
SUBSCRIBE 'news:breaking' - 突发新闻
SUBSCRIBE 'ai:decision:made' - AI决策完成
SUBSCRIBE 'market:alert' - 市场异动
```

### 4. 数据访问规范

- **业务数据**: 直接访问 PostgreSQL（主权数据）
- **行情数据**: 优先访问 market-data-service API
- **AI决策**: 通过 trading-ai-service API，异步获取结果
- **新闻情报**: 通过 news-service API，Redis缓存5分钟

---

## 开发条目（测试驱动）

### Phase 1: 基础设施与SDK

#### [T-001] Service SDK 统一封装
**功能**: 创建统一的服务调用SDK，封装 trading-ai-service、market-data-service、news-service 的HTTP调用

**测试要求**:
- [ ] `test/unit/services/ServiceClient.test.js` - SDK单元测试：模拟服务调用，验证超时重试逻辑
- [ ] `test/integration/services/service-communication.test.js` - 集成测试：实际调用各服务健康检查接口
- [ ] 熔断器测试：模拟服务不可用，验证熔断开启和恢复

**验收标准**:
```javascript
// 使用示例
const aiClient = new AIServiceClient({ timeout: 5000, retries: 3 });
const decision = await aiClient.generateDecision(accountId, marketData);
// 失败时抛出 ServiceUnavailableError，可被全局异常处理器捕获
```

**依赖**: 无
**预计工时**: 2天

---

#### [T-002] Redis 事件总线封装
**功能**: 封装 Redis Pub/Sub，提供发布/订阅接口

**测试要求**:
- [ ] `test/unit/events/EventBus.test.js` - 单元测试：验证发布订阅基本功能
- [ ] `test/integration/events/event-pubsub.test.js` - 集成测试：跨进程消息传递验证
- [ ] 重连测试：Redis断开时自动重连，消息不丢失

**验收标准**:
```javascript
const eventBus = new EventBus();
await eventBus.subscribe('news:breaking', handler);
await eventBus.publish('ai:wakeup:trigger', { accountId, reason });
```

**依赖**: [T-001]
**预计工时**: 1.5天

---

### Phase 2: AI账户管理

#### [T-003] AI账户创建API
**功能**: 实现 `POST /api/ai-accounts` 创建AI账户，包含初始配置验证

**测试要求**:
- [ ] `test/unit/routes/ai-accounts.test.js` - 单元测试：验证请求参数校验、数据库写入
- [ ] `test/integration/api/ai-account-creation.test.js` - 集成测试：完整创建流程，验证数据库记录
- [ ] 边界测试：验证资金范围限制（最小10000，最大1000000）
- [ ] 权限测试：验证JWT认证，非本人无法创建

**验收标准**:
```bash
curl -X POST http://localhost:3001/api/ai-accounts \
  -H "Authorization: Bearer $JWT" \
  -d '{"name":"测试AI","initialBalance":100000,"riskTolerance":"medium","tradingStrategy":"growth","modelType":"deepseek-chat"}'
# 返回 201 { id, name, status: "draft", ... }
```

**依赖**: [T-001]
**预计工时**: 2天

---

#### [T-004] AI对话服务（WebSocket）
**功能**: 实现 `/ws/ai-account/:id` WebSocket对话，DeepSeek角色扮演，对话限制保护

**测试要求**:
- [ ] `test/integration/websocket/ai-dialogue.test.js` - WebSocket集成测试：连接、消息收发、断开
- [ ] `test/unit/services/AIDialogueService.test.js` - 单元测试：对话轮数限制（10轮）、token限制（500/轮）、冷却时间（1秒）
- [ ] 并发测试：同一账户同时只能有一个对话连接
- [ ] 过期测试：1小时无操作自动断开

**验收标准**:
```javascript
// WebSocket流程验证
ws.on('message', (data) => {
  expect(data.roundCount).toBeLessThanOrEqual(10);
  expect(data.remainingRounds).toBeGreaterThanOrEqual(0);
});
```

**依赖**: [T-003]
**预计工时**: 3天

---

#### [T-005] 提示词生成与AI账户激活
**功能**: 实现 `POST /api/ai-accounts/:id/finalize`，调用 trading-ai-service 提炼提示词，激活账户

**测试要求**:
- [ ] `test/integration/api/ai-account-finalize.test.js` - 集成测试：完整finalize流程
- [ ] `test/unit/services/PromptCraftService.test.js` - 单元测试：验证提示词结构符合预期
- [ ] 失败回滚测试：AI服务失败时账户状态不变，返回友好错误
- [ ] 提示词验证测试：确保生成的提示词包含必需字段（role, philosophy, constraints）

**验收标准**:
```bash
curl -X POST http://localhost:3001/api/ai-accounts/123/finalize \
  -H "Authorization: Bearer $JWT"
# 返回 200 { id, status: "active", prompt: {...} }
```

**依赖**: [T-003], [T-004], 依赖 trading-ai-service 的提示词提炼接口
**预计工时**: 2天

---

### Phase 3: AI唤醒与调度

#### [T-006] 热股票列表生成器
**功能**: 定时任务（1分钟），查询活跃AI账户的持仓和关注列表，生成热股票列表推送至 market-data-service

**测试要求**:
- [ ] `test/unit/jobs/StockHeatScheduler.test.js` - 单元测试：验证热股票列表生成逻辑
- [ ] `test/integration/jobs/hot-stocks-publishing.test.js` - 集成测试：验证Redis消息发布
- [ ] 数据一致性测试：验证提取的持仓和关注列表准确
- [ ] 性能测试：1000个活跃账户在1秒内完成计算

**验收标准**:
```javascript
const message = {
  stocks: ['000001', '600519', ...],
  count: 250,
  accounts: 100,
  timestamp: Date.now(),
  source: 'backend-scheduler'
};
// 发布到 Redis channel: 'data-service:hot-stocks'
```

**依赖**: [T-002]
**预计工时**: 2天

---

#### [T-007] AI唤醒调度器（防重保护）
**功能**: Bull队列管理AI唤醒任务，实现防重保护（5分钟冷却、10次/日上限、token预算）

**测试要求**:
- [ ] `test/unit/services/AIWakeupScheduler.test.js` - 单元测试：验证shouldWakeup逻辑
- [ ] `test/integration/queue/ai-wakeup-queue.test.js` - 集成测试：Bull队列任务提交和执行
- [ ] 防重测试：连续触发验证冷却时间拦截
- [ ] 限次测试：超过10次/日后被拒绝
- [ ] 并发测试：5个并发AI同时执行

**验收标准**:
```javascript
const result = await scheduler.triggerWakeup(accountId, 'manual');
// result.success = true/false
// result.code = 'OK' | 'COOLDOWN' | 'DAILY_LIMIT' | 'TOKEN_BUDGET'
```

**依赖**: [T-006]
**预计工时**: 3天

---

#### [T-008] 每日收盘批量更新任务
**功能**: Cron定时任务（工作日15:30），批量触发活跃AI账户的唤醒更新

**测试要求**:
- [ ] `test/integration/jobs/daily-close-job.test.js` - 集成测试：验证定时触发逻辑
- [ ] 分批测试：验证100个账户分20批执行，每批间隔1秒
- [ ] 错误处理测试：部分账户失败不影响其他账户
- [ ] 限流测试：验证每秒最多5个请求

**验收标准**:
```javascript
const results = await dailyAICloseJob.execute();
// results.total = 活跃账户总数
// results.queued = 成功排队数
// results.rejected = 被拒绝数（限流/预算）
```

**依赖**: [T-007]
**预计工时**: 2天

---

### Phase 4: 交易执行

#### [T-009] AI决策结果接收与执行
**功能**: 接收 trading-ai-service 的决策结果，执行虚拟交易，更新持仓

**测试要求**:
- [ ] `test/integration/api/ai-decision-execution.test.js` - 集成测试：决策到交易的完整流程
- [ ] `test/unit/services/TradeExecutionService.test.js` - 单元测试：交易逻辑（买入/卖出/持仓）
- [ ] 资金检查测试：余额不足时拒绝交易
- [ ] 持仓检查测试：卖出时检查持仓数量
- [ ] 幂等测试：同一决策ID重复执行只生效一次

**验收标准**:
```bash
# AI Service 回调
curl -X POST http://localhost:3001/api/internal/ai-decisions \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -d '{"accountId":"123","decision":{"action":"buy","symbol":"000001","quantity":100,"price":10.5}}'
# 返回 200 { tradeId, status: "executed", ... }
```

**依赖**: [T-007]
**预计工时**: 3天

---

### Phase 5: 监控与告警

#### [T-010] 服务健康检查与监控
**功能**: 实现 `/api/health` 和 `/api/health/detailed`，监控依赖服务状态

**测试要求**:
- [ ] `test/integration/api/health-check.test.js` - 集成测试：验证健康检查端点
- [ ] 依赖检测测试：模拟 trading-ai-service 不可用时返回 degraded
- [ ] 性能测试：健康检查响应时间 < 100ms

**验收标准**:
```json
{
  "status": "healthy|degraded|unhealthy",
  "service": "backend",
  "dependencies": {
    "trading-ai-service": "healthy",
    "market-data-service": "healthy",
    "postgresql": "healthy",
    "redis": "healthy"
  }
}
```

**依赖**: [T-001]
**预计工时**: 1天

---

## 测试脚本目录结构

```
backend/tests/
├── unit/                          # 单元测试
│   ├── routes/                    # 路由测试
│   ├── services/                  # 服务层测试
│   ├── jobs/                      # 定时任务测试
│   └── events/                    # 事件总线测试
├── integration/                   # 集成测试
│   ├── api/                       # API端点测试
│   ├── websocket/                 # WebSocket测试
│   ├── queue/                     # 队列测试
│   ├── jobs/                      # 任务调度测试
│   └── services/                  # 服务通信测试
├── fixtures/                      # 测试数据
└── utils/                         # 测试工具
```

---

## 开发进度留痕

| 条目 | 状态 | 开发日期 | 测试通过日期 | 合并提交 |
|------|------|----------|--------------|----------|
| [T-001] Service SDK | 🔲 待开发 | - | - | - |
| [T-002] Redis事件总线 | 🔲 待开发 | - | - | - |
| [T-003] AI账户创建 | 🔲 待开发 | - | - | - |
| [T-004] AI对话服务 | 🔲 待开发 | - | - | - |
| [T-005] 提示词生成 | 🔲 待开发 | - | - | - |
| [T-006] 热股票列表 | 🔲 待开发 | - | - | - |
| [T-007] 唤醒调度器 | 🔲 待开发 | - | - | - |
| [T-008] 每日收盘任务 | 🔲 待开发 | - | - | - |
| [T-009] 交易执行 | 🔲 待开发 | - | - | - |
| [T-010] 健康检查 | 🔲 待开发 | - | - | - |

---

## 提交规范

1. **分支命名**: `backend/T-XXX-简短描述`（如 `backend/T-001-service-sdk`）
2. **提交信息**: `test(backend): [T-001] 添加Service SDK单元测试`
3. **PR要求**: 必须包含测试文件，测试覆盖率 > 80%
4. **合并前检查**:
   ```bash
   npm run test:unit
   npm run test:integration
   npm run lint
   ```

---

## 依赖的其他模块

| 模块 | 接口需求 | 状态 |
|------|---------|------|
| trading-ai-service | `POST /api/v1/decision/generate` - AI决策生成 | 需对接 |
| trading-ai-service | `POST /api/v1/prompt/craft` - 提示词提炼 | 需对接 |
| market-data-service | `GET /api/stocks/{symbol}/history` - 历史数据 | 已存在 |
| news-service | `GET /api/v1/intelligence/{code}` - 新闻情报 | 待开发 |

---

*最后更新: 2026-02-10*
*负责人: Backend开发团队*
