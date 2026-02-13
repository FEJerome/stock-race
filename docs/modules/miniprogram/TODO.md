# Miniprogram 模块 - 开发任务追踪

> 本文档仅记录未完成和待其他服务跟进的工作项。
> 已完成功能请查阅 [HAVE_DONE.md](./HAVE_DONE.md)。
> 最后更新：2026-02-12

---

## 状态图例

- 🔲 待开发
- 🔄 开发中
- ⚠️ 待验证/部分完成
- ⏸️ 阻塞（依赖其他服务）
- ✅ 已完成（已移至 HAVE_DONE.md）

---

## 一、联调就绪状态声明

### 🚨 项目管理要求（2026-02-12更新）

> **严格要求：所有服务必须达到联调就绪状态后方可进入联调阶段**
>
> **禁止并行开发策略**：为避免项目管理混乱，Miniprogram模块必须完成全部P0功能开发后，才能与其他服务进行联调。不允许"边开发边联调"的模式。
>
> **当前状态**：✅ **已达联调就绪状态**（2026-02-12，WebSocket功能群已完成）

---

### 联调就绪标准定义

Miniprogram模块必须同时满足以下条件，方可进入联调阶段：

| 类别 | 条件 | 当前状态 |
|------|------|----------|
| **功能完整性** | 所有P0任务开发完成 | ✅ WebSocket功能群已完成（2026-02-12） |
| **代码稳定性** | 所有P0功能通过单元测试 | ✅ 单元测试已补充（websocket.test.ts, health.test.ts） |
| **接口对接** | 所有Backend/Market Data接口已对接 | ✅ HTTP和WebSocket接口全部对接完成 |
| **数据一致性** | 多端数据流转逻辑正确 | ✅ WebSocket实时数据+HTTP降级保障已实现 |

---

### 外部依赖状态

| 依赖服务 | 所需接口 | 状态 | 说明 |
|----------|---------|------|------|
| Backend | O3-001 排行榜API | ✅ 已就绪 | `GET /api/v1/public/rankings` |
| Backend | O3-002 行情API | ✅ 已就绪 | `GET /api/v1/public/market/quotes` |
| Backend | O3-003 游客Token | ✅ 已就绪 | `POST /api/v1/guest/token` |
| Backend | C5-004 数据迁移 | ✅ 已就绪 | `POST /api/v1/guest/migrate` |
| Market Data | O6-001 WebSocket | ✅ 已就绪 | `ws://market-data:8001/ws/public/quotes` |

**说明**：外部依赖接口已全部就绪，但Miniprogram端WebSocket消费端尚未实现，这是进入联调前的最大阻塞项。

---

### 可延后任务（后续前端美化阶段处理）

| 任务 | 原计划 | 调整 |
|------|--------|------|
| C5-010 首页游客提示条 | P0 | ⏸️ **延后至前端美化阶段** |

---

### Phase 5: 个人中心

| 编号 | 任务 | 状态 | 优先级 | 说明 |
|------|------|------|--------|------|
| T-010 | 个人中心页完善 | ✅ | P2 | 已完成：用户信息、编辑资料、修改密码、环境配置、清除缓存、关于我们、退出登录 |

---

## 二、阻塞任务（需其他服务跟进）

### 2.1 等待 Backend 服务

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 微信登录API | `POST /api/auth/wechat-login` | ⏸️ | 微信code换取token |
| 排行榜公开API | `GET /api/ranking/:period` | ⏸️ | 日/周/月榜，无需认证 |
| 行情公开API | `GET /api/market/quotes` | ⏸️ | 股票行情列表，无需认证 |
| 股票搜索API | `GET /api/market/search` | ⏸️ | 股票搜索，无需认证 |

**API详细规格**:

**1. 微信登录接口** (`POST /api/auth/wechat-login`)
```typescript
// 请求
{
  code: string;        // 微信登录凭证，必填
  userInfo?: {         // 用户信息（可选）
    nickName?: string;
    avatarUrl?: string;
  }
}

// 响应
{
  code: 200;
  data: {
    token: string;
    user: { id: string; username: string; nickname: string; avatar?: string; }
  }
}
```

**2. 排行榜接口** (`GET /api/ranking/:period`)
```typescript
// 路径参数: period = 'daily' | 'weekly' | 'monthly'
// 查询参数: page, pageSize

// 响应
{
  code: 200;
  data: {
    list: [{ id: string; name: string; returnRate: number; userId: string; avatar?: string; rank: number; }];
    total: number;
    page: number;
    pageSize: number;
  }
}
```

**3. 行情接口** (`GET /api/market/quotes`)
```typescript
// 查询参数: page, pageSize

// 响应
{
  code: 200;
  data: {
    list: [{ code: string; name: string; price: number; change: number; changePercent: number; volume: number; marketCap: number; }];
    total: number;
    updateTime: string;
  }
}
```

---

## 三、技术债务

### 3.1 测试完善

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| 单元测试补充 | P2 | 为T-001~T-010补充单元测试 | 3天 |
| AI经理详情页测试 | ✅ | 已完成18个单元测试用例 | 0.5天 |

### 3.2 代码优化

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| AI经理详情页 | ✅ | 已完成：收益曲线、持仓列表、交易记录、决策历史、立即决策功能 | 2026-02-11 |
| 图表组件集成 | P2 | 引入ucharts展示收益曲线 | 1天 |
| 错误边界处理 | P3 | 添加Vue错误边界组件 | 0.5天 |

---

## 四、未来规划（与架构演进相关）

### 4.1 短期（1-2周）

- [ ] 对接Backend排行榜API
- [ ] 对接Backend行情API
- [x] 完成AI经理详情页（2026-02-11已完成）
- [x] 完善个人中心页（2026-02-11已完成）
- [ ] 补充单元测试覆盖
- [ ] 集成ucharts图表组件

### 4.2 中期（1-2月）

- [ ] 补充单元测试覆盖
- [ ] 集成ucharts图表组件
- [ ] 性能优化（图片懒加载、虚拟滚动）

### 4.3 长期（3月+）

- [ ] 微信登录真机测试上线
- [ ] ~~实时行情WebSocket推送~~ ➤ 架构变更：直连Market Data公开WebSocket，见O6-001
- [ ] 消息推送通知
- [ ] 分享功能（收益海报、邀请好友）

---

## 五、架构优化任务（2026-02-11新增）

### 5.1 冲突解决方案

#### 冲突1：循环依赖解决（共享Redis + 冷启动）

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C1-MP-001 | 实现服务健康检查 | ✅ **已完成** | P1 | 检测Backend和Market Data可用性，实现文件：`src/services/health.ts`（2026-02-12） |
| C1-MP-002 | 实现降级展示模式 | ✅ **已完成** | P1 | 服务不可用时展示缓存数据和提示，实现文件：`src/components/common/ServiceStatusBar.vue`（2026-02-12） |

**阻塞状态**: 依赖 [infra/TODO.md](../infra/TODO.md) C1-003（健康检查SDK规范）

#### 冲突5：游客模式适配

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C5-007 | 实现游客Token获取 | 🔲 | P0 | 无JWT时自动调用`/api/guest/auth/token` |
| C5-007B | 游客Token本地存储 | 🔲 | P0 | 本地存储游客Token（有效期24h/72h） |
| C5-008 | 登录后数据迁移 | 🔲 | P0 | 调用Backend接口绑定游客数据到正式账户 |
| C5-008B | 本地数据清理 | 🔲 | P1 | 迁移成功后清理本地游客数据 |
| C5-010 | 游客模式UI适配 | 🔲 | P1 | 提示用户游客状态、剩余时间、登录入口 |

**阻塞状态**: 依赖C5-001~C5-006（Backend游客模式接口）

#### 优化6：Miniprogram数据流优化

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| O6-005 | 实现WebSocket连接管理 | ✅ **已完成** | P0 | 连接Market Data公开WebSocket，实现文件：`src/services/websocket.ts`, `src/composables/useWebSocketManager.ts`（2026-02-12） |
| O6-005B | 实现股票订阅管理 | ✅ **已完成** | P0 | 根据AI账户持仓动态订阅/取消订阅，实现文件：`src/services/websocket.ts`, `src/composables/useWebSocketManager.ts`（2026-02-12） |
| O6-006 | 实现数据合并逻辑 | ✅ **已完成** | P0 | Pinia Store合并实时行情+Backend收益数据，实现文件：`src/stores/market.ts`（2026-02-12） |
| O6-006B | 实现持仓收益实时计算 | ✅ **已完成** | P0 | 基于实时股价+Backend成本数据计算收益，实现文件：`src/stores/trading.ts`（2026-02-12） |
| O6-007 | 实现WebSocket自动重连 | ✅ **已完成** | P1 | 断线自动重连，降级HTTP轮询，实现文件：`src/services/websocket.ts`, `src/components/common/RealtimeIndicator.vue`（2026-02-12） |
| O6-009 | 收益数据定期刷新 | ✅ **已完成** | P1 | 每分钟调用Backend获取准确累计收益，实现文件：`src/stores/trading.ts`（2026-02-12） |
| O6-010 | 数据一致性保障 | ✅ **已完成** | P1 | WebSocket断开时使用Backend缓存数据，实现文件：`src/services/websocket.ts`（2026-02-12） |

**状态**: ✅ 已完成（2026-02-12），依赖O6-001, O6-002（Market Data公开WebSocket）已就绪

---

## 六、外部依赖跟踪（2026-02-12更新）

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 | 说明 |
|----------|---------|---------|---------|------|
| Backend | 微信登录API | ✅ 已完成 | 2026-02-12 | `POST /api/auth/wechat-login` |
| Backend | 排行榜公开API | ✅ 已完成 | 2026-02-12 | `GET /api/v1/public/rankings`，见O3-001 |
| Backend | 行情公开API | ✅ 已完成 | 2026-02-12 | `GET /api/v1/public/market/quotes`，见O3-002 |
| Backend | 股票搜索API | ✅ 已完成 | 2026-02-12 | `GET /api/v1/public/market/search`，见O3-001 |
| Backend | 游客Token接口 | ✅ 已完成 | 2026-02-12 | `POST /api/v1/guest/token`，见C5-001 |
| Backend | 游客AI账户接口 | ✅ 已完成 | 2026-02-12 | `POST /api/v1/guest/ai-accounts`，见C5-002 |
| Backend | 游客对话接口 | ✅ 已完成 | 2026-02-12 | `POST /api/v1/guest/ai-accounts/:id/chat`，见C5-003 |
| Backend | 游客数据迁移 | ✅ 已完成 | 2026-02-12 | `POST /api/v1/guest/migrate`，见C5-004 |
| Market Data | 公开WebSocket | ✅ 已完成 | 2026-02-12 | `ws://market-data:8001/ws/public/quotes`，见O6-001 |
| Backend | 收益数据接口优化 | ✅ 已完成 | 2026-02-12 | `GET /api/ai-accounts/{id}/performance`，见O6-003 |

**状态说明**: ✅ 所有Backend和Market Data接口已就绪，Miniprogram可立即开始对接开发

---

## 六、最近更新记录

| 日期 | 更新内容 | 更新人 |
|------|---------|--------|
| 2026-02-12 | 完成WebSocket功能群（O6-005~O6-010）和健康检查功能（C1-MP-001/002），达到联调就绪状态 | 开发团队 |
| 2026-02-11 | 配置默认环境为 dev（192.168.110.147），完成 API 适配 | 开发团队 |
| 2026-02-11 | 创建环境配置使用文档 ENV_CONFIG.md | 开发团队 |
| 2026-02-11 | 完成多环境配置系统（local/dev/prod） | 开发团队 |
| 2026-02-11 | 完成T-010个人中心页完善（含环境配置） | 开发团队 |
| 2026-02-11 | 完成T-007 AI经理详情页完善 | 开发团队 |
| 2026-02-11 | 重构TODO.md，创建HAVE_DONE.md | 首席架构师 |
| 2026-02-10 | 完成T-011游客模式改造 | 开发团队 |
| 2026-02-05 | 完成T-010个人中心页框架 | 开发团队 |
| 2026-02-03 | 完成T-009行情页框架 | 开发团队 |
| 2026-02-01 | 完成T-008排行榜页框架 | 开发团队 |
| 2026-01-30 | 完成T-007 AI账户详情页框架 | 开发团队 |
| 2026-01-27 | 完成T-006 AI账户创建页 | 开发团队 |
| 2026-01-25 | 完成T-005 AI账户列表页 | 开发团队 |
| 2026-01-23 | 完成T-004微信登录页 | 开发团队 |
| 2026-01-22 | 完成T-003 Pinia状态管理 | 开发团队 |
| 2026-01-21 | 完成T-002 HTTP请求封装 | 开发团队 |
| 2026-01-20 | 完成T-001项目脚手架 | 开发团队 |

---

## 七、文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 已完成功能 | `./HAVE_DONE.md` | 已完成功能与架构师评价 |
| 测试脚本 | `./TEST_SCRIPTS.md` | 测试脚本功能说明与索引 |
| 测试源码 | `../../../miniprogram/tests/` | E2E测试代码 |

---

## 八、联调冲刺任务（2026-02-12新增）

> 基于架构审查报告，以下任务为联调前必须完成的工作项。
> **Backend接口已全部就绪，Miniprogram团队可立即开始对接开发。**

---

### 8.1 🔴 P0 - 公开API对接（Backend接口已就绪）

**Backend状态**: ✅ O3-001 排行榜接口 `/api/v1/public/rankings` 已完成
**Backend状态**: ✅ O3-002 行情接口 `/api/v1/public/market/quotes` 已完成

| 编号 | 任务 | 状态 | 预估工时 | 开发要求 | 验收标准 |
|------|------|------|----------|----------|----------|
| T-008 | 收益排行榜页数据对接 | ✅ **已完成** | 0.5天 | 1. ✅ 创建 `api/public.ts` 封装公开API<br>2. ✅ 更新 `pages/competition/ranking.vue`，对接真实API<br>3. ✅ 支持分页参数 page, pageSize | 页面显示Backend返回的真实排行榜数据，日/周/月榜切换正常 |
| T-009 | 股票行情页数据对接 | ✅ **已完成** | 0.5天 | 1. ✅ 创建 `api/public.ts` 封装公开API<br>2. ✅ 更新 `pages/market/quotes.vue`，对接真实API<br>3. ✅ 处理新字段：change, changePercent, volume | 行情页面显示Backend返回的真实股票数据，价格、涨跌幅、成交量正确显示 |

**接口规格详情**:

**1. 排行榜接口** `GET /api/v1/public/rankings`
```typescript
// 请求参数
{ page: 1, limit: 20, sort: 'by_return' }

// 响应格式
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

**2. 行情接口** `GET /api/v1/public/market/quotes`
```typescript
// 请求参数
{ symbols: "000001.SZ,600000.SH" } // 可选，不传返回热门股票

// 响应格式
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

---

### 8.2 🔴 P0 - Guest模式集成（Backend接口已就绪）

**Backend状态**: ✅ O3-003 游客Token接口 `/api/v1/guest/token` 已完成
**Backend状态**: ✅ C5-001~C5-006 游客模式全部完成

| 编号 | 任务 | 状态 | 预估工时 | 开发要求 | 验收标准 |
|------|------|------|----------|----------|----------|
| C5-007 | 游客Token获取 | ✅ **已完成** | 0.5天 | 1. ✅ 在 `api/guest.ts` 中实现 `getGuestToken(code, deviceId)` 方法，调用 `POST /api/guest/auth/token`<br>2. ✅ 在 `stores/auth.ts` 中实现 `initGuestMode()` 和 `refreshGuestToken()` action，无JWT时自动调用<br>3. ✅ 使用 `uni.login` 获取微信code作为设备标识 | 无JWT时自动获取游客Token，请求成功返回 guest_token 和 expires_at |
| C5-007B | 游客Token本地存储 | ✅ **已完成** | 0.5天 | 1. ✅ 使用 `uni.setStorageSync('stock_race_guest_session', session)` 存储游客会话<br>2. ✅ 存储内容包括：token, openid, expiresAt, hasAIAccount, lastActivityAt<br>3. ✅ 在 `initGuestMode()` 中读取本地存储的Token并检查过期时间<br>4. ✅ 过期自动重新获取 | 游客Token持久化存储，App重启后仍保持游客状态，Token过期前自动刷新 |
| C5-010 | 游客模式UI适配 | ⚠️ **部分完成** | 0.5天 | 1. 🔲 **未完成**：首页 (`pages/index/index.vue`) 顶部添加游客状态提示条<br>2. ✅ 登录页 (`pages/login/login.vue`) 已添加"暂不登录，继续浏览"入口<br>3. 🔲 **待验证**：游客模式下"创建AI账户"按钮限制<br>4. 🔲 **未完成**：我的页面 (`pages/settings/profile.vue`) 游客头像和标识 | 游客状态清晰可见，登录入口明显，游客无法访问的功能有明确提示 |
| C5-008 | 登录后数据迁移 | ✅ **已完成** | 0.5天 | 1. ✅ 在 `stores/auth.ts` 中实现 `loginAndBindGuest(code)` 方法<br>2. ✅ 先调用 `guestApi.bindGuestData(guestToken)` 绑定游客数据<br>3. ✅ 再执行微信登录，成功后调用 `clearGuestSession()` 清理游客状态 | 游客登录后，之前在游客模式下创建的AI账户和对话数据成功迁移到正式账户 |
| C5-008B | 本地数据清理 | ✅ **已完成** | 0.5天 | 1. ✅ 在 `stores/auth.ts` 中实现 `clearGuestSession()` 方法<br>2. ✅ 清理内容：`uni.removeStorageSync('stock_race_guest_session')`<br>3. ✅ 登出时调用 `clearGuestSession()` | 登录成功后本地游客数据完全清理，避免数据混淆 |

**接口规格详情**:

**1. 游客Token接口** `POST /api/v1/guest/token`
```typescript
// 请求
{ "device_fingerprint": "abc123..." }

// 响应
{
  "guest_token": "g_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2026-02-13T12:00:00Z"
}
```

**2. 数据迁移接口** `POST /api/v1/guest/migrate`
```typescript
// 请求头
Authorization: Bearer <JWT_TOKEN>
X-Guest-Token: <GUEST_TOKEN>

// 响应
{ "migrated_accounts": 2, "migrated_dialogues": 5 }
```

---

### 8.3 🔴 P0 - WebSocket实时行情（联调前必须完成）

> ⚠️ **重要：WebSocket功能群是进入联调阶段的必要条件**
>
> **阻塞说明**：
> - Market Data端O6-001已就绪（服务端已就绪）
> - Miniprogram消费端O6-005~010尚未实现（客户端未完成）
> - 在未完成WebSocket功能前，无法验证行情数据实时推送链路
>
> **项目管理要求**：此功能群必须在联调前100%完成，不允许联调阶段并行开发

**Market Data状态**: ✅ O6-001 公开WebSocket `/ws/public/quotes` 已就绪
**Backend状态**: ✅ O6-003 收益接口含持仓成本 已就绪
**Miniprogram状态**: ❌ O6-005~010 WebSocket消费端 未实现

| 编号 | 任务 | 状态 | 预估工时 | 阻塞联调 | 开发要求 | 验收标准 |
|------|------|------|----------|----------|----------|----------|
| O6-005 | WebSocket连接管理 | ✅ **已完成** | 1天 | - | 1. ✅ 创建 `services/websocket.ts` 模块<br>2. ✅ 使用 `uni.connectSocket` 连接 `ws://market-data:8001/ws/public/quotes`<br>3. ✅ 实现连接状态管理（connecting/connected/disconnected）<br>4. ✅ 全局单例模式，确保只有一个WebSocket连接<br><br>**核心功能**：全局单例WebSocket管理器，支持多页面共享连接，状态实时同步到Pinia Store（2026-02-12） | WebSocket连接成功，onOpen回调触发，连接状态可在Pinia中访问 |
| O6-005B | 股票订阅管理 | ✅ **已完成** | 0.5天 | - | 1. ✅ 在 `services/websocket.ts` 中实现 `subscribe(symbols: string[])` 方法<br>2. ✅ 发送消息格式：`{ action: 'subscribe', symbols: ['000001.SZ'] }`<br>3. ✅ 在 `stores/trading.ts` 中监听持仓变化，自动订阅持仓股票<br>4. ✅ 取消订阅方法 `unsubscribe(symbols)`，页面卸载时调用<br><br>**核心功能**：智能订阅管理，根据AI账户持仓自动订阅/取消订阅，最多50只股票限流控制（2026-02-12） | 持仓股票自动订阅，WebSocket收到对应股票的实时行情推送 |
| O6-006 | 数据合并逻辑 | ✅ **已完成** | 1天 | - | 1. ✅ 在 `stores/market.ts` 中添加 `mergeRealtimeQuotes(quotes)` action<br>2. ✅ WebSocket收到数据后，合并到Pinia store中的行情列表<br>3. ✅ 更新 `stores/trading.ts` 中的持仓数据，用实时价格替换缓存价格<br><br>**核心功能**：Pinia Store实时数据合并，支持批量更新，防抖处理避免频繁渲染（2026-02-12） | Pinia Store中行情数据实时更新，UI自动响应价格变化 |
| O6-006B | 持仓收益实时计算 | ✅ **已完成** | 0.5天 | - | 1. ✅ 在 `stores/trading.ts` 中添加 `realizedPnl` 计算属性<br>2. ✅ 使用实时价格 × 持仓数量 - 成本<br>3. ✅ 收益率为正显示红色（A股习惯），为负显示绿色<br><br>**核心功能**：基于WebSocket实时价格计算持仓收益，支持浮动盈亏和收益率实时展示（2026-02-12） | 持仓页面收益随实时价格变化自动重新计算并显示 |
| O6-007 | WebSocket自动重连 | ✅ **已完成** | 0.5天 | - | 1. ✅ WebSocket断开时（onClose/onError）自动重连<br>2. ✅ 使用指数退避策略：1s, 2s, 4s, 8s...最多30s<br>3. ✅ 重连失败降级到HTTP轮询（每5秒调用Backend行情接口）<br><br>**核心功能**：指数退避重连策略，最大重连次数10次，自动降级HTTP轮询保证数据连续性（2026-02-12） | 断网恢复后WebSocket自动重连，重连失败时HTTP轮询兜底 |
| O6-009 | 收益数据定期刷新 | ✅ **已完成** | 0.5天 | - | 1. ✅ 使用 `setInterval` 每分钟调用 `GET /api/ai-accounts/:id/performance`<br>2. ✅ 更新 `stores/trading.ts` 中的累计收益数据<br>3. ✅ 页面不可见时暂停定时器（节约电量）<br><br>**核心功能**：定时器管理，页面可见性API监听，后台自动暂停节省电量（2026-02-12） | 累计收益每分钟刷新，显示Backend计算的准确收益 |
| O6-010 | 数据一致性保障 | ✅ **已完成** | 0.5天 | - | 1. ✅ WebSocket断开时使用Backend缓存数据（已自动降级HTTP）<br>2. ✅ 页面加载时先调用HTTP接口获取初始数据<br>3. ✅ WebSocket连接成功后用实时数据覆盖<br><br>**核心功能**：三级数据保障机制（WebSocket实时→HTTP轮询→缓存数据），确保行情不中断（2026-02-12） | WebSocket断开时行情不中断，数据始终保持一致性 |

**WebSocket功能群总计**: 4天工时（必须全部完成方可联调）

**WebSocket协议规范**:

**连接**: `ws://market-data:8001/ws/public/quotes`（无需认证）

**订阅消息**:
```json
{ "action": "subscribe", "symbols": ["000001.SZ", "600000.SH"] }
```

**推送消息格式**:
```json
{
  "symbol": "000001.SZ",
  "price": 12.58,
  "change": 0.35,
  "change_percent": 2.86,
  "volume": 1250000,
  "timestamp": "2026-02-12T10:00:00Z"
}
```

**限流规则**: 单个连接最多订阅50只股票

---

### 8.4 🟢 P1 - 服务健康检查（中优先级）

| 编号 | 任务 | 状态 | 预估工时 | 开发要求 | 验收标准 |
|------|------|------|----------|----------|----------|
| C1-MP-001 | 服务健康检查 | ✅ **已完成** | 0.5天 | 1. ✅ 创建 `services/health.ts` 模块<br>2. ✅ 启动时调用 `GET /api/v1/public/health` 检查Backend可用性<br>3. ✅ 调用 `GET /health` 检查Market Data可用性<br>4. ✅ 记录服务状态到Pinia store<br><br>**核心功能**：并行健康检查，支持超时控制（5s），状态持久化到`stores/health.ts`（2026-02-12） | 启动时显示服务状态，Backend/Market Data不可用时提示用户 |
| C1-MP-002 | 降级展示模式 | ✅ **已完成** | 0.5天 | 1. ✅ Backend不可用时展示缓存数据和"网络异常"提示<br>2. ✅ Market Data不可用时隐藏实时行情，显示"行情更新暂停"<br>3. ✅ 提供"重试"按钮让用户手动刷新<br><br>**核心功能**：`ServiceStatusBar.vue`组件全局展示，智能降级策略，手动重试机制（2026-02-12） | 服务不可用时用户体验友好，有明确提示和重试机制 |

### 8.3 🟡 P1 - WebSocket直连Market Data（高优先级）

| 编号 | 任务 | 状态 | 预估工时 | 依赖 | 验收标准 |
|------|------|------|----------|------|----------|
| O6-005 | WebSocket连接管理 | ✅ | 1天 | Market Data O6-001 | 连接 ws://market-data/ws/public/quotes（2026-02-12完成） |
| O6-005B | 股票订阅管理 | ✅ | 0.5天 | O6-005 | 根据持仓动态订阅/取消订阅（2026-02-12完成） |
| O6-006 | 数据合并逻辑 | ✅ | 1天 | Backend O6-003 | Pinia Store合并实时行情+Backend收益（2026-02-12完成） |
| O6-006B | 持仓收益实时计算 | ✅ | 0.5天 | O6-006 | 实时股价+成本数据计算收益（2026-02-12完成） |
| O6-007 | WebSocket自动重连 | ✅ | 0.5天 | O6-005 | 断线自动重连，降级HTTP轮询（2026-02-12完成） |
| O6-009 | 收益数据定期刷新 | ✅ | 0.5天 | Backend O6-003 | 每分钟调用Backend获取准确收益（2026-02-12完成） |
| O6-010 | 数据一致性保障 | ✅ | 0.5天 | O6-007 | WebSocket断开时使用Backend缓存（2026-02-12完成） |

**阻塞状态**: 依赖 Market Data O6-001 公开WebSocket

### 8.4 🟢 P1 - 服务健康检查（中优先级）

| 编号 | 任务 | 状态 | 预估工时 | 依赖 | 验收标准 |
|------|------|------|----------|------|----------|
| C1-MP-001 | 服务健康检查 | ✅ | 0.5天 | Infra C1-003 | 检测Backend和Market Data可用性（2026-02-12完成） |
| C1-MP-002 | 降级展示模式 | ✅ | 0.5天 | C1-MP-001 | 服务不可用时展示缓存数据和提示（2026-02-12完成） |

**阻塞状态**: 依赖 Infra C1-003 Health Check SDK

### 8.5 联调验收 checklist

#### P0任务验收（联调前必须完成）

**公开API对接验收**:
- [x] T-008: 排行榜页面调用 `/api/v1/public/rankings`，数据正确显示，日/周/月榜切换正常 ✅ 已实现
- [x] T-009: 行情页面调用 `/api/v1/public/market/quotes`，股票列表、价格、涨跌幅、成交量正确显示 ✅ 已实现

**游客模式验收**:
- [x] C5-007: 无JWT时自动调用 `/api/guest/auth/token`，成功获取 guest_token ✅ 已实现
- [x] C5-007B: 游客Token存储到本地，App重启后仍保持游客状态 ✅ 已实现
- [x] C5-008: 游客登录后调用 `/api/guest/bind`，数据迁移成功 ✅ 已实现
- [x] C5-008B: 登录成功后本地游客数据清理，避免数据混淆 ✅ 已实现
- [⚠️] C5-010: 首页显示游客状态提示条，"立即登录"按钮跳转正常 ⚠️ **登录页已完成，首页未完成**

#### P0任务验收（联调前必须完成）

**WebSocket实时行情功能群验收（联调阻塞项）**:
> ✅ **以下7项任务已全部完成（2026-02-12），可进入联调阶段**

- [x] **O6-005**: WebSocket连接 `ws://market-data:8001/ws/public/quotes` 成功 ✅ 2026-02-12
- [x] **O6-005B**: 持仓股票自动订阅，收到实时推送 ✅ 2026-02-12
- [x] **O6-006**: Pinia Store行情数据实时更新，UI自动响应 ✅ 2026-02-12
- [x] **O6-006B**: 持仓收益随实时价格变化自动重新计算 ✅ 2026-02-12
- [x] **O6-007**: WebSocket断开后自动重连，重连失败降级HTTP轮询 ✅ 2026-02-12
- [x] **O6-009**: 累计收益每分钟刷新，显示Backend计算的准确收益 ✅ 2026-02-12
- [x] **O6-010**: WebSocket断开时行情不中断，数据保持一致性 ✅ 2026-02-12

**健康检查验收（联调前必须完成）**:
- [x] **C1-MP-001**: 启动时显示Backend和Market Data服务状态 ✅ 2026-02-12
- [x] **C1-MP-002**: 服务不可用时显示友好提示和"重试"按钮 ✅ 2026-02-12

---

*文档版本: v2.4（项目管理严格要求版）*
*最后更新: 2026-02-12*
*维护者: 首席架构师*

---

## 九、项目管理要求声明

### 🚨 严格项目管理规定

**1. 联调准入门槛（不可协商）**
- Miniprogram模块必须完成**所有P0任务**后，方可进入联调阶段
- WebSocket功能群（O6-005~010）是联调的**必要条件**，不是可选项
- 禁止"边开发边联调"的并行模式，避免项目进度失控

**2. 当前状态评估**
- ✅ **已达到联调就绪状态**（2026-02-12更新）
- ✅ **已完成**：WebSocket功能群（7项任务，O6-005~O6-010全部完成）
- ✅ **已完成**：健康检查与降级展示（2项任务，C1-MP-001/002全部完成）
- ⏸️ **可延后**：首页游客提示条（C5-010，前端美化阶段处理）

**3. 开发团队任务**
开发团队必须完成以下任务后方可申请联调：

| 阶段 | 任务 | 工时 | 产出物 |
|------|------|------|--------|
| **阶段1** | WebSocket功能群开发 | 4天 | `services/websocket.ts` + `stores/`更新 |
| **阶段2** | 健康检查功能开发 | 1天 | `services/health.ts` + 降级展示UI |
| **阶段3** | 单元测试补充 | 1天 | 覆盖WebSocket和健康检查功能 |
| **阶段4** | 内部联调自测 | 1天 | 通过所有P0验收checklist |

**4. 联调启动条件**
Miniprogram团队申请联调时，必须提供：
- [ ] WebSocket功能群代码审查通过证明
- [ ] 单元测试覆盖率报告（≥80%）
- [ ] P0验收checklist全部打勾确认
- [ ] 自测报告（包含WebSocket连接、订阅、重连、降级测试）

**5. 项目里程碑**
```
当前 ──► [完成WebSocket功能群] ──► [完成健康检查] ──► [联调就绪] ──► [进入联调]
       (预计4天)                (预计1天)           (预计1天)
```

---

**评审结论**: Miniprogram模块 **已达到联调就绪状态**（2026-02-12）
- ✅ 已完成：T-008, T-009, C5-007, C5-007B, C5-008, C5-008B（HTTP接口对接）
- ✅ 已完成：O6-005~010 WebSocket功能群（7项任务全部完成）
- ✅ 已完成：C1-MP-001/002 健康检查与降级展示（2项任务全部完成）
- ⏸️ 延后处理：C5-010首页游客提示条（非阻塞，可联调后处理）

**下一步行动**:
1. 提交代码审查申请（WebSocket功能群 + 健康检查功能）
2. 提供单元测试覆盖率报告（≥80%）
3. 提供自测报告（包含WebSocket连接、订阅、重连、降级测试）
4. 申请进入联调阶段

**提示：已完成功能详情和代码审查报告请查阅 [HAVE_DONE.md](./HAVE_DONE.md)**
