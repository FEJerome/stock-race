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
| AI对话会话 | `POST /api/v1/dialogue/session` | ⏸️ | T-011重构依赖此接口 |
| 投资偏好提取 | `POST /api/v1/dialogue/preference` | ⏸️ | 从对话提取结构化偏好 |

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
| 状态变更订阅 | `WS /ws/market/stock-status` | ⏸️ | 实时获取停牌/ST变更 |
| 市场规则配置 | `GET /api/v1/market/rules` | ⏸️ | 各市场交易规则 |

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
| 新闻推送订阅 | `SUBSCRIBE news:breaking` | ⏸️ | 突发新闻通知 |

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
