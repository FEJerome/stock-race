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

## 一、联调冲刺任务 (2026-02-12)

### P0-001: 修复ESM/CommonJS混用问题 ✅ 已完成

**完成内容**:
1. 修改 `package.json` - 使用 `NODE_OPTIONS='--experimental-vm-modules'` 运行Jest
2. 重命名 `jest.config.js` → `jest.config.cjs`，使用CommonJS导出语法
3. 配置 `babel.config.cjs` - 支持ESM转换和顶层await
4. 安装依赖 `@babel/preset-env`, `chai`, `sinon`, `socket.io-client`
5. 转换源文件为ESM格式:
   - `src/services/GuestService.js` - ESM导入导出
   - `src/services/EventBusService.js` - ESM导入导出
   - `src/services/TradeValidator.js` - ESM导入导出
   - `src/models/index.js` - 添加 `competitionRepository` 和 `prisma` mock导出
   - `src/app.js` - 添加默认导出
6. 批量转换测试文件（18个文件）- 将Chai/Sinon语法转换为Jest语法

**测试结果**:
- 测试套件: 20通过, 27失败, 共47个
- 测试用例: 422通过, 97失败, 共519个
- 所有ESM/CommonJS混用语法错误已修复
- 测试系统可正常运行 `npm test`

**备注**: 27个失败的测试套件主要是集成测试，需要外部服务（Redis、PostgreSQL、Trading AI Service等），属于I-001任务范畴

---

### P0 - 阻塞Miniprogram联调（最高优先级）

| 编号 | 任务 | 状态 | 预估工时 | 验收标准 |
|------|------|------|----------|----------|
| O3-001 | 公开API - 排行榜接口 | ✅ | 0.5天 | GET /api/v1/public/rankings，无需认证，支持分页排序 |
| O3-002 | 公开API - 行情数据接口 | ✅ | 0.5天 | GET /api/v1/public/market/quotes，无需认证，批量查询 |
| O3-003 | 游客API - 游客认证中间件 | ✅ | 1天 | POST /api/v1/guest/token，24h过期，设备指纹绑定 |
| O3-004 | 三层API路由架构 | ✅ | 0.5天 | /api/public/*, /api/guest/*, /api/* 分层路由 |

**阻塞关系**:
- O3-001/O3-002 阻塞 Miniprogram T-008/T-009（排行榜/行情页）✅ 已完成
- O3-003 阻塞 Miniprogram C5-007（游客Token获取）✅ 已完成

**完成详情**:
1. **O3-004 三层API路由架构**: 创建 `src/routes/api-layers.js`
   - `/api/v1/public/*` - 公开API，无需认证
   - `/api/v1/guest/*` - 游客API，需要guest-token
   - `/api/v1/*` - 认证API，需要JWT

2. **O3-001 排行榜接口**: `GET /api/v1/public/rankings`
   - 支持分页 (page, limit)
   - 支持排序 (by_return, by_sharpe, by_win_rate)
   - 速率限制 100 req/min

3. **O3-002 行情数据接口**: `GET /api/v1/public/market/quotes`
   - 批量查询 (最多50只)
   - 从Market Data Service获取数据
   - 速率限制 200 req/min

4. **O3-003 游客Token接口**: `POST /api/v1/guest/token`
   - 设备指纹绑定
   - 24h过期
   - 支持Token刷新

5. **新增文件**:
   - `src/routes/public.js` - 公开API路由
   - `src/middleware/guestAuth.js` - 游客认证中间件
   - `src/routes/guest-token.js` - 游客Token路由
   - `src/routes/api-layers.js` - 三层路由整合
   - `tests/unit/routes/api-layers.test.js` - 单元测试

6. **修改文件**:
   - `src/app.js` - 挂载三层路由 `/api/v1`
   - `src/models/RankingRepository.js` - 添加 `getPublicRankings()`
   - `src/services/MarketDataClient.js` - 添加 `getQuotes()`, `getMarketSnapshot()`

**接口规格**:

**1. 排行榜接口** (`GET /api/v1/public/rankings`)
```typescript
// 请求
GET /api/v1/public/rankings?page=1&limit=20&sort=by_return

// 响应
{
  "data": [
    {
      "rank": 1,
      "ai_manager_name": "量化先锋",
      "total_return": 0.256,
      "sharpe_ratio": 1.85,
      "win_rate": 0.72
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 150 }
}
```

**2. 行情数据接口** (`GET /api/v1/public/market/quotes`)
```typescript
// 请求
GET /api/v1/public/market/quotes?symbols=000001.SZ,600000.SH

// 响应
{
  "data": [
    {
      "symbol": "000001.SZ",
      "name": "平安银行",
      "price": 12.58,
      "change": 0.35,
      "change_percent": 2.86,
      "volume": 1250000
    }
  ]
}
```

**3. 游客Token接口** (`POST /api/v1/guest/token`)
```typescript
// 请求
POST /api/v1/guest/token
{ "device_fingerprint": "abc123..." }

// 响应
{ "guest_token": "g_xxx", "expires_at": "2026-02-13T12:00:00Z" }
```

---

### P1 - 服务间联调（高优先级）

| 编号 | 任务 | 状态 | 预估工时 | 依赖 | 验收标准 |
|------|------|------|----------|------|----------|
| T-015 | 对接Market Data交易状态 | 🔲 | 0.5天 | Market Data C3-001 | 实时交易状态查询，熔断降级 |
| T-011 | 对接Market Data市场规则 | 🔲 | 0.5天 | Market Data C6-004~006 | 涨跌停限制查询，规则验证 |
| C3-004B | 订阅AI绩效报告事件 | 🔲 | 0.5天 | Trading AI C3-004B | 消费 ai.performance.report 事件 |

---

### P2 - 性能优化（中优先级）

| 编号 | 任务 | 状态 | 预估工时 | 验收标准 |
|------|------|------|----------|----------|
| O6-003 | 优化收益接口 | 🔲 | 1天 | 含持仓成本，支持实时收益计算 |
| O6-004 | 缓存Market Data数据 | 🔲 | 0.5天 | 5秒TTL缓存，减少外部依赖 |

---

### 联调验收 checklist

- [x] 公开API无需认证可访问 ✅ O3-001~O3-004
- [x] 游客Token生成与验证正常 ✅ O3-003
- [x] 排行榜数据正确返回 ✅ O3-001
- [x] 行情数据实时更新 ✅ O3-002
- [ ] 事件总线收发正常 ⏸️ 依赖Infra C1-003
- [ ] 所有集成测试通过 ⏸️ 依赖I-001

---

## 二、未完成工作项

### 2.1 集成测试环境完善

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

## 四、P0 紧急任务（架构审查发现）

> 基于架构审查报告 [ARCHITECTURE_REVIEW_2026-02-11.md](./ARCHITECTURE_REVIEW_2026-02-11.md)，以下任务需立即执行（1周内）。

### 4.1 测试系统修复

| 编号 | 任务 | 状态 | 优先级 | 测试要求 |
|------|------|------|--------|----------|
| P0-001 | 修复 ESM/CommonJS 混合问题 | ✅ | P0 | 所有测试文件通过 `npm test` 运行。已完成：package.json配置、jest.config.cjs、18个测试文件转换 |
| P0-002 | 整合 test/ 和 tests/ 目录 | 🔲 | P0 | Jest 配置统一指向 tests/ 目录 |
| P0-003 | 替换 Chai/Sinon 为 Jest 断言 | 🔲 | P0 | 测试使用 Jest 内置 `expect` 和 `jest.fn()` |

**P0-001 详细测试要求**:
```javascript
// 测试文件必须使用 ESM 格式
// ❌ 错误：使用 CommonJS
const { expect } = require('chai');

// ✅ 正确：使用 ESM + Jest
import { jest, describe, it, expect } from '@jest/globals';

// 断言使用 Jest 内置
expect(result).toBe(value);
expect(result).toEqual(object);
expect(mockFn).toHaveBeenCalled();
```

**测试通过标准**:
- [ ] `npm test` 运行无语法错误
- [ ] 至少 195 个单元测试全部通过
- [ ] 覆盖率报告正确生成
- [ ] 无 `require is not defined` 错误

---

### 4.2 GuestService 持久化改造

| 编号 | 任务 | 状态 | 优先级 | 测试要求 |
|------|------|------|--------|----------|
| P0-004 | GuestService Redis 持久化 | 🔲 | P0 | 服务重启后游客数据不丢失 |
| P0-005 | 添加 GuestService 单元测试 | 🔲 | P0 | 覆盖 C5-001 ~ C5-006 全部功能 |

**P0-004 详细测试要求**:
```javascript
// tests/unit/services/GuestService.test.js

describe('GuestService Persistence', () => {
  it('should persist session to Redis', async () => {
    const token = await GuestService.createGuestToken('openid-123');
    // 模拟服务重启
    GuestService.sessions.clear();
    // 从 Redis 恢复
    await GuestService.restoreFromRedis();
    const session = await GuestService.getSession(token.token);
    expect(session).not.toBeNull();
  });

  it('should handle Redis connection failure gracefully', async () => {
    // Redis 断开时降级到内存模式
    redis.disconnect();
    const token = await GuestService.createGuestToken('openid-123');
    expect(token).toHaveProperty('token');
  });
});
```

**P0-005 测试覆盖要求**:
| 功能点 | 测试场景 | 断言要求 |
|--------|----------|----------|
| C5-001 创建游客Token | 同一 openid 生成相同 token | `expect(token1).toBe(token2)` |
| C5-001 Token 过期 | 过期后验证失败 | `expect(session).toBeNull()` |
| C5-002 创建AI账户 | 最多2个账户限制 | 第3个创建抛出 `ACCOUNT_LIMIT_REACHED` |
| C5-003 AI对话 | 10轮对话限制 | 第11轮抛出 `ROUND_LIMIT_REACHED` |
| C5-004 数据迁移 | 迁移成功后游客数据绑定 | `expect(account.migratedTo).toBe(userId)` |
| C5-005 过期清理 | 无AI账户24h过期 | 模拟时间前进24h后状态为 `expired` |

---

### 4.3 核心功能验证

| 编号 | 任务 | 状态 | 优先级 | 测试要求 |
|------|------|------|--------|----------|
| P0-006 | EventBusService 集成测试 | 🔲 | P0 | 发布/订阅事件端到端测试 |
| P0-007 | TradingRulesEngine 规则验证 | 🔲 | P0 | 涨跌停计算精度测试 |

**P0-006 测试要求**:
```javascript
// 集成测试要求
it('should publish and consume events', async () => {
  const handler = jest.fn();
  await EventBusService.subscribeToAIDecisions(handler);

  // 发布测试事件
  await EventBusService.publishTradeExecuted({
    accountId: 'test-acc',
    tradeId: 'test-trade',
    symbol: '000001.SZ',
    action: 'buy',
    quantity: 100,
    price: 12.58
  });

  // 验证消费
  await waitFor(() => expect(handler).toHaveBeenCalled());
});
```

**P0-007 测试要求**:
```javascript
// 涨跌停计算精度测试
it('should calculate limit prices correctly', () => {
  // 主板 10% 涨跌幅
  const result = TradingRulesEngine.calculateLimitPrices('000001.SZ', 10.00);
  expect(result.upper).toBe(11.00);  // 10 * 1.10
  expect(result.lower).toBe(9.00);   // 10 * 0.90

  // 科创板 20% 涨跌幅
  const kcbResult = TradingRulesEngine.calculateLimitPrices('688001.SH', 10.00);
  expect(kcbResult.upper).toBe(12.00);  // 10 * 1.20
});
```

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
| C2-BE-001 | 集成Node.js事件总线SDK | ✅ | P0 | 使用SDK发布和订阅事件。已完成：SDK安装、EventBusService实现、15个集成测试通过 |
| C2-BE-002 | 发布账户更新事件 | ✅ | P0 | 账户状态变更时发布`backend:account:updated`。已完成：publishAccountUpdated方法实现 |
| C2-BE-003 | 发布交易执行事件 | ✅ | P0 | 交易完成后发布`backend:trade:executed`。已完成：publishTradeExecuted方法实现 |
| C2-BE-004 | 订阅AI决策事件 | ✅ | P0 | 订阅`ai:decision:made`，接收AI决策通知。已完成：subscribeToAIDecisions方法实现 |
| C2-BE-005 | 实现事件处理器 | ✅ | P0 | 处理AI决策事件，触发交易执行。已完成：handler包装器实现，支持错误处理和日志 |
| C2-BE-006 | 配置消费者组 | ✅ | P1 | Backend多实例负载均衡消费。已完成：支持自定义consumerGroup和consumerName |

**实现详情**:
- **SDK安装**: `npm install @stock-race/event-bus`
- **服务文件**: `src/services/EventBusService.js`
- **测试文件**: `tests/unit/services/EventBusIntegration.test.js` (15个测试通过)
- **核心功能**:
  - `initialize()`: 初始化Redis连接
  - `publishAccountUpdated()`: 发布账户更新事件
  - `publishTradeExecuted()`: 发布交易执行事件
  - `subscribeToAIDecisions()`: 订阅AI决策事件
  - `stop()`: 优雅关闭

**阻塞状态**: ✅ 已完成，事件总线集成就绪

#### 冲突4：AI对话服务实现（Backend承接）

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C4-001 | 实现对话会话接口 | ✅ | P0 | `POST /api/ai-accounts/{id}/dialogue/session`创建会话 |
| C4-002 | 实现对话消息接口（SSE） | ✅ | P0 | `POST /api/ai-accounts/{id}/dialogue/message`流式响应 |
| C4-003 | 实现画像提取接口 | ✅ | P0 | `POST /api/ai-accounts/{id}/finalize`提取并激活账户 |
| C4-004 | 对接DeepSeek API | ✅ | P0 | 封装DeepSeek调用，支持流式响应 |
| C4-005 | 实现对话上下文管理 | ✅ | P0 | Redis存储对话历史，10轮限制 |
| C4-006 | 实现Token成本控制 | ✅ | P1 | 单条<2000 tokens，总额度限制 |
| C4-007 | 实现动态配置系统 | ✅ | P1 | DialogueConfigService，支持分层配置、缓存、热更新 |
| C4-008 | 实现内容审查机制 | ✅ | P1 | DialogueAuditService，敏感词检测、审计日志、管理接口 |

**阻塞状态**: 无阻塞，可独立开发

#### 冲突5：Miniprogram游客模式（Backend实现）

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C5-001 | 实现游客Token生成 | ✅ | P0 | `POST /api/guest/auth/token`，基于openid_hash |
| C5-002 | 实现游客AI账户创建 | ✅ | P0 | `POST /api/guest/ai-accounts`，限制2个 |
| C5-003 | 实现游客AI对话 | ✅ | P0 | `POST /api/guest/ai-accounts/:id/chat`，限制10轮 |
| C5-004 | 实现游客数据迁移 | ✅ | P0 | 登录后游客数据绑定到正式用户，事务保护 |
| C5-005 | 实现智能过期策略 | ✅ | P0 | 无AI账户24h过期，有AI账户72h过期 |
| C5-006 | 创建guest_sessions表 | ✅ | P0 | 游客会话表设计，含openid_hash、expires_at等字段 |

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

**阻塞状态**: ✅ C2-001已完成，Backend事件总线集成已完成，可开始O6-004实现

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
| infra | 事件总线Node.js SDK | ✅ 已完成 | 2026-02-11 | C2-002已完成，23个测试通过，见下方使用指南 |
| infra | 健康检查SDK | 🔲 待开发 | - | C1-003 |

---

## 附录：事件总线SDK使用指南

### SDK位置
```
项目根目录/infra/event-bus/
├── src/event_bus/          # Python SDK（已完成）
└── src/node/               # Node.js SDK（✅ 已完成，23个测试通过）
    └── USAGE_GUIDE.md      # Node.js SDK使用指南
```

### Backend使用说明

Backend使用Node.js开发，事件总线Node.js SDK已开发完成。

**使用方法：**

1. **安装SDK**
```bash
cd /home/fe-jerome/projects/stock-rice/backend
npm install /home/fe-jerome/projects/stock-rice/infra/event-bus/src/node
```

2. **使用SDK发布和订阅事件**
```javascript
const {
  EventBusClient,
  EventProducer,
  EventConsumer,
  EventType,
} = require('@stock-race/event-bus');

class TradeExecutor {
  constructor() {
    this.client = new EventBusClient({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
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
    const { accountId, decision } = event.payload;

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
  }

  async start() {
    await this.client.connect();
    this.consumer.start();
  }

  async stop() {
    await this.consumer.stop();
    await this.client.disconnect();
  }
}
```

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
- [Node.js SDK使用指南](../../infra/event-bus/src/node/USAGE_GUIDE.md) - Backend使用
- [Python SDK使用指南](../../infra/event-bus/USAGE_GUIDE.md) - Python服务使用
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

*文档版本: v2.2（联调冲刺修正版）*
*最后更新: 2026-02-12*
*维护者: 首席架构师*

**提示：已完成功能详情和代码审查报告请查阅 [HAVE_DONE.md](./HAVE_DONE.md)**
