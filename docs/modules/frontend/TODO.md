# Frontend 模块开发规划

## 架构决策声明（2026-02-12）

> **重要决策**: Frontend 在此次联调阶段暂停用户界面功能开发
>
> **决策原因**:
> 1. Miniprogram 是项目主要用户触点（面向C端用户）
> 2. Frontend 当前仅用于开发调试，非生产必需
> 3. 监控与配置中心架构尚未设计完成
>
> **后续定位**: Frontend 将转型为"监控中心 + 配置中心"（面向运维和管理员）
> - **监控中心**: 服务健康状态、事件总线监控、AI决策性能监控
> - **配置中心**: 动态配置管理、AI模型配置、业务规则配置
>
> **联调阶段策略**:
> - ✅ Miniprogram 参与联调（P0优先级）
> - ⏸️ Frontend 延后至 Miniprogram 稳定后启动监控中心设计

---

## 模块概述

**模块名称**: Frontend (React + TypeScript + Vite)
**当前职责**: Web用户界面、实时行情展示、AI账户管理UI、交易界面
**未来职责**: 监控中心 + 配置中心（详见【六、监控与配置中心规划】）
**服务端口**: 3000
**通信方式**: HTTP REST + WebSocket (通过 Backend 中转)
**联调阶段状态**: ⏸️ 暂停开发，延后至 Miniprogram 上线后

---

## 服务通信标准

### 1. 依赖服务

| 服务 | 调用方式 | 用途 | 失败策略 |
|------|---------|------|---------|
| Backend | HTTP REST (`http://localhost:3001/api/*`) | 业务API、认证 | 全局错误提示，重试3次 |
| Backend WebSocket | WebSocket (`ws://localhost:3001/ws/*`) | 实时通知、AI对话 | 自动重连，心跳检测 |
| Market Data Service | HTTP/WebSocket 直连 | 实时行情（可选优化） | 降级到Backend中转 |

### 2. 数据流规范

```typescript
// API调用统一封装
const apiClient = new APIClient({
  baseURL: '/api',
  timeout: 10000,
  retry: 3
});

// WebSocket统一管理
const wsManager = new WebSocketManager({
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
  heartbeatInterval: 30000
});
```

### 3. 状态管理

- **全局状态**: Zustand (用户认证、账户信息)
- **服务器状态**: React Query (行情数据、缓存、自动刷新)
- **本地状态**: React useState/useReducer (UI状态)

---

## 开发条目（测试驱动）

### Phase 1: 基础设施

#### [T-001] API客户端封装
**功能**: 统一的HTTP客户端，封装认证、错误处理、重试逻辑

**测试要求**:
- [ ] `src/services/__tests__/apiClient.test.ts` - 单元测试：请求拦截、错误重试
- [ ] `src/services/__tests__/authInterceptor.test.ts` - 单元测试：Token自动刷新
- [ ] Mock测试：模拟401响应，验证自动跳转登录页

**验收标准**:
```typescript
const response = await apiClient.get('/ai-accounts');
// 自动附加Authorization header
// 401时自动刷新token，失败则跳转登录
// 超时自动重试3次
```

**依赖**: 无
**预计工时**: 1.5天

---

#### [T-002] WebSocket管理器
**功能**: 统一的WebSocket连接管理，支持自动重连、心跳、多订阅

**测试要求**:
- [ ] `src/services/__tests__/websocketManager.test.ts` - 单元测试：连接、断开、重连
- [ ] `src/services/__tests__/heartbeat.test.ts` - 单元测试：心跳机制
- [ ] 并发测试：多个组件订阅同一WebSocket，单连接复用

**验收标准**:
```typescript
const ws = wsManager.connect('/ws/market');
ws.subscribe('quote:000001', callback);
// 断开5秒后自动重连
// 30秒心跳检测
```

**依赖**: [T-001]
**预计工时**: 2天

---

### Phase 2: 用户认证

#### [T-003] 登录/注册页面
**功能**: 用户登录、注册、密码找回页面

**测试要求**:
- [ ] `src/pages/Auth/__tests__/Login.test.tsx` - 单元测试：表单验证、提交
- [ ] `src/pages/Auth/__tests__/Register.test.tsx` - 单元测试：注册流程
- [ ] E2E测试：完整登录流程，验证Token存储
- [ ] 安全测试：密码强度校验、XSS防护

**验收标准**:
```typescript
// 登录表单验证
expect(screen.getByText('邮箱格式不正确')).toBeInTheDocument();
expect(screen.getByText('密码至少需要8位')).toBeInTheDocument();

// 登录成功
await userEvent.click(loginButton);
expect(localStorage.getItem('token')).toBeTruthy();
expect(navigate).toHaveBeenCalledWith('/dashboard');
```

**依赖**: [T-001]
**预计工时**: 2天

---

### Phase 3: AI账户管理

#### [T-004] AI账户列表页
**功能**: 展示用户所有AI账户，支持创建、编辑、删除

**测试要求**:
- [ ] `src/pages/AIAccounts/__tests__/AccountList.test.tsx` - 单元测试：列表渲染、操作
- [ ] `src/hooks/__tests__/useAIAccounts.test.ts` - Hook测试：数据获取、缓存
- [ ] 交互测试：点击创建按钮跳转，点击卡片进入详情
- [ ] 空状态测试：无账户时显示引导页面

**验收标准**:
```typescript
// 列表渲染
expect(screen.getByText('我的AI基金经理')).toBeInTheDocument();
expect(screen.getAllByTestId('ai-account-card').length).toBe(3);

// 状态显示
expect(screen.getByText('运行中')).toHaveClass('status-active');
expect(screen.getByText('草稿')).toHaveClass('status-draft');
```

**依赖**: [T-003]
**预计工时**: 2天

---

#### [T-005] AI账户创建向导
**功能**: 分步向导，配置AI账户参数（名称、资金、风险偏好、选择模型）

**测试要求**:
- [ ] `src/pages/AIAccounts/__tests__/CreateWizard.test.tsx` - 单元测试：步骤切换、数据保存
- [ ] `src/components/Wizard/__tests__/Stepper.test.tsx` - 组件测试：步骤条组件
- [ ] 验证测试：资金范围、必填字段校验
- [ ] 数据持久化测试：步骤间数据不丢失

**验收标准**:
```typescript
// 步骤导航
expect(screen.getByText('第一步：基础配置')).toBeInTheDocument();
await userEvent.click(nextButton);
expect(screen.getByText('第二步：风险偏好')).toBeInTheDocument();

// 表单验证
await userEvent.click(submitButton);
expect(screen.getByText('请输入账户名称')).toBeInTheDocument();
```

**依赖**: [T-004]
**预计工时**: 2.5天

---

#### [T-006] AI基金经理对话界面
**功能**: WebSocket对话界面，与DeepSeek导师对话，实时显示对话历史和剩余轮数

**测试要求**:
- [ ] `src/pages/AIAccounts/__tests__/AIDialogue.test.tsx` - 单元测试：消息渲染、发送
- [ ] `src/hooks/__tests__/useAIDialogue.test.ts` - Hook测试：WebSocket消息处理
- [ ] WebSocket集成测试：消息实时收发
- [ ] 限制测试：10轮后禁用输入，显示生成按钮
- [ ] Token预算测试：显示已用/剩余Token

**验收标准**:
```typescript
// 对话界面
expect(screen.getByText('对话进度: 3/10')).toBeInTheDocument();

// 发送消息
await userEvent.type(input, '我想做稳健型投资');
await userEvent.click(sendButton);
expect(screen.getByText('我想做稳健型投资')).toBeInTheDocument();

// 达到限制
expect(screen.getByText('已达到最大对话轮数')).toBeInTheDocument();
expect(sendButton).toBeDisabled();
```

**依赖**: [T-002], [T-005], 依赖 Backend 的 WebSocket 接口
**预计工时**: 3天

---

#### [T-007] AI基金经理生成确认页
**功能**: 展示生成的基金经理画像，确认激活

**测试要求**:
- [ ] `src/pages/AIAccounts/__tests__/FinalizePage.test.tsx` - 单元测试：画像展示、确认操作
- [ ] 加载测试：提示词生成中显示loading
- [ ] 错误处理测试：生成失败显示重试按钮

**验收标准**:
```typescript
// 展示画像
expect(screen.getByText('投资风格：稳健型')).toBeInTheDocument();
expect(screen.getByText('关注领域：科技、消费')).toBeInTheDocument();

// 确认激活
await userEvent.click(activateButton);
expect(mockNavigate).toHaveBeenCalledWith('/ai-accounts/123');
```

**依赖**: [T-006]
**预计工时**: 1.5天

---

### Phase 4: 行情与交易

#### [T-008] 实时行情展示组件
**功能**: 股票实时价格、涨跌幅、K线图展示

**测试要求**:
- [ ] `src/components/Market/__tests__/QuoteCard.test.tsx` - 单元测试：价格渲染、颜色变化
- [ ] `src/components/Market/__tests__/KlineChart.test.tsx` - 组件测试：图表渲染
- [ ] 实时更新测试：WebSocket推送价格变化，UI自动更新
- [ ] 精度测试：价格显示2位小数，涨跌幅显示2位小数

**验收标准**:
```typescript
// 价格显示
expect(screen.getByTestId('current-price')).toHaveTextContent('¥10.50');

// 涨跌幅颜色
expect(screen.getByTestId('change-percent')).toHaveClass('text-red-500'); // 上涨红色
expect(screen.getByTestId('change-percent')).toHaveClass('text-green-500'); // 下跌绿色
```

**依赖**: [T-002]
**预计工时**: 2.5天

---

#### [T-009] AI账户详情页
**功能**: 展示AI账户详情、持仓、收益、交易历史

**测试要求**:
- [ ] `src/pages/AIAccounts/__tests__/AccountDetail.test.tsx` - 单元测试：数据展示
- [ ] `src/components/Portfolio/__tests__/PositionList.test.tsx` - 组件测试：持仓列表
- [ ] 空状态测试：无持仓显示引导
- [ ] 数字精度测试：收益率、市值计算准确

**验收标准**:
```typescript
// 账户信息
expect(screen.getByText('总资产：¥105,000')).toBeInTheDocument();
expect(screen.getByText('累计收益：+5.00%')).toBeInTheDocument();

// 持仓列表
expect(screen.getByText('000001 平安银行')).toBeInTheDocument();
expect(screen.getByText('持仓：100股')).toBeInTheDocument();
```

**依赖**: [T-008]
**预计工时**: 2.5天

---

#### [T-010] 交易记录页面
**功能**: 展示AI账户的所有交易记录，支持筛选、分页

**测试要求**:
- [ ] `src/pages/AIAccounts/__tests__/TradeHistory.test.tsx` - 单元测试：列表渲染
- [ ] `src/hooks/__tests__/useTradeHistory.test.ts` - Hook测试：分页、筛选
- [ ] 分页测试：点击页码、每页条数切换
- [ ] 筛选测试：按日期、股票代码、交易类型筛选

**验收标准**:
```typescript
// 交易记录
expect(screen.getByText('买入 000001')).toBeInTheDocument();
expect(screen.getByText('数量：100股')).toBeInTheDocument();
expect(screen.getByText('金额：¥1,050')).toBeInTheDocument();
```

**依赖**: [T-009]
**预计工时**: 2天

---

### Phase 5: 监控与通知

#### [T-011] 实时通知组件
**功能**: 全局通知中心，接收Backend推送的交易、市场异动通知

**测试要求**:
- [ ] `src/components/Notification/__tests__/NotificationCenter.test.tsx` - 单元测试：通知展示
- [ ] WebSocket测试：接收通知自动弹出
- [ ] 交互测试：点击通知跳转对应页面
- [ ] 批量测试：多条通知排队显示

**验收标准**:
```typescript
// 通知弹出
expect(screen.getByText('AI执行买入')).toBeInTheDocument();
expect(screen.getByText('平安银行 100股 @ ¥10.50')).toBeInTheDocument();

// 自动消失
await waitFor(() => {
  expect(screen.queryByText('AI执行买入')).not.toBeInTheDocument();
}, { timeout: 5000 });
```

**依赖**: [T-002]
**预计工时**: 2天

---

## 测试脚本目录结构

```
frontend/src/
├── services/__tests__/            # 服务层测试
├── hooks/__tests__/               # Hook测试
├── components/
│   ├── Market/__tests__/          # 行情组件测试
│   ├── Portfolio/__tests__/       # 持仓组件测试
│   ├── Wizard/__tests__/          # 向导组件测试
│   └── Notification/__tests__/    # 通知组件测试
├── pages/
│   ├── Auth/__tests__/            # 认证页面测试
│   └── AIAccounts/__tests__/      # AI账户页面测试
└── e2e/                           # E2E测试
    ├── auth.spec.ts
    ├── ai-account.spec.ts
    └── trading.spec.ts
```

---

## 开发进度留痕

| 条目 | 状态 | 开发日期 | 测试通过日期 | 合并提交 | 架构师审查意见 |
|------|------|----------|--------------|----------|----------------|
| [T-001] API客户端 | ✅ 已完成 | 2026-02-11 | - | - | 需补充token刷新机制 |
| [T-002] WebSocket管理器 | ✅ 已完成 | 2026-02-11 | - | - | 需补充订阅管理 |
| [T-003] 登录/注册页 | ✅ 已完成 | 2026-02-11 | - | - | 功能完整 |
| [T-004] AI账户列表 | ✅ 已完成 | 2026-02-11 | - | - | 性能数据待接入真实数据 |
| [T-005] AI创建向导 | ⚠️ 部分完成 | 2026-02-11 | - | - | 非向导形式，需重构 |
| [T-006] AI对话界面 | ⏸️ 阻塞 | - | - | - | 🔴 需trading-ai-service先实现对话接口 |
| [T-007] 生成确认页 | ❌ 未实现 | - | - | - | 依赖T-006 |
| [T-008] 实时行情组件 | ✅ 已完成 | 2026-02-11 | - | - | 缓存设计优秀 |
| [T-009] AI账户详情 | ⚠️ 部分完成 | 2026-02-11 | - | - | 缺少独立页面 |
| [T-010] 交易记录页 | ⚠️ 部分完成 | 2026-02-11 | - | - | 缺少分页筛选 |
| [T-011] 实时通知 | ✅ 已完成 | 2026-02-11 | - | - | 功能完整 |
| [T-012] 单元测试 | ✅ 已完成 | 2026-02-11 | 2026-02-11 | - | 已搭建TDD基础设施，67个测试56个通过 |

---

## 架构师审查总结

**审查日期**: 2026-02-11
**审查结论**: Frontend核心功能框架已完成，但存在以下关键问题：

### 🔴 高优先级问题
1. **AI对话界面缺失** - 阻塞AI账户创建核心流程，需trading-ai-service先实现对话接口
2. **~~零测试覆盖~~** - ✅ 已解决，TDD基础设施已搭建，67个测试56个通过

### 🟡 中优先级问题
3. AI创建向导未按需求实现（当前为表单而非向导）
4. 交易记录缺少分页和筛选
5. API客户端缺少token自动刷新

### 下一步行动建议
1. **优先实现AI对话界面** - 需跨服务协调：
   - trading-ai-service: 创建 `POST /api/v1/dialogue/session` 接口
   - backend: 创建 WebSocket `/ws/ai-dialogue/:accountId` 代理
   - frontend: 实现 AIDialogue 组件和 useAIDialogue Hook
2. 修复 WebSocket 测试隔离问题（11个测试失败）
3. 修复 market.service.ts 参数误用问题（sortOrder误用为搜索词）

详细审查报告参见: [HAVE_DONE.md](./HAVE_DONE.md)

---

## 提交规范

1. **分支命名**: `frontend/T-XXX-简短描述`（如 `frontend/T-001-api-client`）
2. **提交信息**: `test(frontend): [T-001] 添加API客户端测试`
3. **PR要求**: 必须包含组件测试，核心功能覆盖 > 80%
4. **合并前检查**:
   ```bash
   npm run test:unit
   npm run test:e2e
   npm run build
   npm run lint
   ```

---

---

## 六、监控与配置中心规划（未来阶段）

> **阶段**: Miniprogram 上线后启动（预计2026-03后）
> **目标用户**: 运维人员、管理员、开发人员
> **核心定位**: 生产环境监控与动态配置管理

### 6.1 监控中心架构

#### 6.1.1 服务健康监控
**数据来源**: 各服务 Health Check SDK (`/health` 端点)
**监控维度**:
| 维度 | 指标 | 告警阈值 |
|------|------|----------|
| 服务状态 | Backend/Market Data/Trading AI/News 健康状态 | 任何服务 Unhealthy |
| 依赖状态 | Redis/PostgreSQL/DeepSeek API 可用性 | 关键依赖不可用 |
| 响应时间 | P95 API 响应时间 | > 500ms |
| 错误率 | 5xx 错误占比 | > 1% |

**UI设计**:
- 服务拓扑图（绿色/黄色/红色状态指示）
- 实时告警通知（WebSocket推送）
- 历史健康趋势（24h/7d/30d）

#### 6.1.2 事件总线监控
**数据来源**: Redis Streams 统计信息
**监控维度**:
| 维度 | 指标 | 告警阈值 |
|------|------|----------|
| 消息堆积 | 各stream未消费消息数 | > 1000条 |
| 消费延迟 | 消费者组消息处理延迟 | > 30秒 |
| 发布速率 | 每秒发布事件数 | 突增 > 200% |
| 消费速率 | 每秒消费事件数 | 持续下降 |

**UI设计**:
- 事件流拓扑图（发布者→Streams→消费者）
- 消息堆积热力图
- 消费者组消费进度（类似Kafka消费组监控）

#### 6.1.3 AI决策性能监控
**数据来源**: Trading AI Service 事件 + Backend 决策日志
**监控维度**:
| 维度 | 指标 | 告警阈值 |
|------|------|----------|
| Token消耗 | 每分钟/每小时Token使用量 | > 预算80% |
| 响应时间 | AI决策平均响应时间 | > 10秒 |
| 成功率 | AI决策成功率 | < 95% |
| 模型分布 | 各模型调用占比 | 异常分布 |
| 成本分析 | 每日/每月API调用成本 | > 预算 |

**UI设计**:
- Token使用仪表盘（实时+趋势）
- 模型性能对比（延迟/成功率/成本）
- 决策质量评分（基于实际收益回测）

#### 6.1.4 行情数据质量监控
**数据来源**: Market Data Service 日志 + 事件
**监控维度**:
| 维度 | 指标 | 告警阈值 |
|------|------|----------|
| 数据源健康 | 6个数据源可用性 | 主数据源故障 |
| 数据延迟 | 行情数据更新延迟 | > 30秒 |
| 数据质量 | 异常价格波动检测 | 涨跌幅 > 15% |
| 采集成功率 | 股票采集成功率 | < 99% |

### 6.2 配置中心架构

#### 6.2.1 动态配置管理
**配置类型**:
| 配置类别 | 示例 | 生效方式 |
|----------|------|----------|
| Feature Flag | 新功能开关 | 即时生效 |
| 系统参数 | 缓存TTL、超时时间 | 即时生效 |
| 阈值配置 | 告警阈值、限流阈值 | 即时生效 |

**技术方案**:
- 配置存储: Redis (热配置) + PostgreSQL (持久化)
- 配置推送: 事件总线 `config:updated` 事件
- 版本控制: 配置变更历史记录

#### 6.2.2 AI模型配置
**配置内容**:
| 配置项 | 说明 | 示例 |
|--------|------|------|
| Prompt模板 | DeepSeek处理模板 | 情感分析Prompt |
| 模型参数 | temperature, max_tokens | temperature=0.7 |
| 成本预算 | 每日Token预算 | 100万 tokens/日 |
| 降级策略 | API故障时降级方案 | 使用缓存结果 |

#### 6.2.3 业务规则配置
**配置内容**:
| 配置项 | 说明 | 示例 |
|--------|------|------|
| 交易规则 | 涨跌停限制、交易时间 | 科创板±20% |
| 风控阈值 | 单账户最大持仓、单日最大交易 | 单股≤30%仓位 |
| 通知规则 | 告警通知方式、通知对象 | 邮件+Webhook |
| 游客限制 | 游客模式功能限制 | 不能创建AI账户 |

### 6.3 开发计划（Miniprogram上线后）

| 阶段 | 时间 | 任务 | 优先级 |
|------|------|------|--------|
| **阶段1** | T+0~2周 | 监控中心架构设计、技术选型 | P0 |
| **阶段2** | T+2~4周 | 服务健康监控、事件总线监控 | P0 |
| **阶段3** | T+4~6周 | AI决策性能监控、行情数据质量监控 | P1 |
| **阶段4** | T+6~8周 | 配置中心：动态配置管理 | P1 |
| **阶段5** | T+8~10周 | 配置中心：AI模型配置、业务规则配置 | P2 |
| **阶段6** | T+10~12周 | 权限管理、审计日志、完善文档 | P2 |

### 6.4 技术栈建议

**监控数据采集**:
- Prometheus (指标收集)
- Grafana (可视化，可选Embedded或独立部署)
- 或自研轻量级方案（直接查询各服务API）

**配置管理**:
- 配置存储: Redis + PostgreSQL
- 配置推送: 事件总线 (Redis Streams)
- 配置版本: Git-like版本控制（可选）

**前端技术栈**:
- React + TypeScript (现有)
- 图表库: ECharts / AntV
- UI组件: Ant Design / Material-UI
- 状态管理: Zustand / React Query

### 6.5 与现有服务的集成

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (监控中心)                       │
├─────────────────────────────────────────────────────────────┤
│  监控面板        配置管理        告警中心        日志查询    │
└────────────┬────────────────┬────────────────┬──────────────┘
             │                │                │
             ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                        Backend API                          │
│  /monitor/health      /config/*       /alerts      /logs    │
└─────────────────────────────────────────────────────────────┘
             │                │                │
     ┌───────┴───────┐       │       ┌────────┴────────┐
     ▼               ▼       ▼       ▼                 ▼
┌─────────┐   ┌──────────┐  │  ┌──────────┐    ┌──────────┐
│Backend  │   │Market    │  │  │Trading   │    │News      │
│Health   │   │Data      │  │  │AI        │    │Service   │
│Service  │   │Service   │  │  │Service   │    │          │
└─────────┘   └──────────┘  │  └──────────┘    └──────────┘
                            │
                     ┌──────┴──────┐
                     ▼             ▼
                ┌─────────┐  ┌──────────┐
                │  Redis  │  │PostgreSQL│
                │ (Config)│  │ (Persist)│
                └─────────┘  └──────────┘
```

### 6.6 架构决策记录

**决策编号**: ARCH-2026-02-12-001
**决策日期**: 2026-02-12
**决策人**: 首席架构师 + 产品经理

**决策内容**:
1. Frontend 在此次联调阶段不参与用户界面功能开发
2. Frontend 定位从"用户Web界面"调整为"监控中心 + 配置中心"
3. Miniprogram 作为唯一C端用户入口，优先保障联调
4. Frontend 监控中心开发延后至 Miniprogram 上线后启动

**决策理由**:
- Miniprogram 是主要用户触点（微信生态）
- Web Frontend 当前仅用于开发调试，非生产必需
- 监控与配置中心需要完整的架构设计，目前尚未完成
- 避免资源分散，集中火力保障 Miniprogram 联调

**影响范围**:
- Frontend 开发团队：暂停用户界面开发任务
- 架构团队：需在 Miniprogram 上线后设计监控中心架构
- 运维团队：暂时通过日志和命令行进行监控

**相关文档**:
- `docs/modules/miniprogram/TODO.md` - Miniprogram联调任务
- `docs/architecture/CURRENT/SERVICE_ARCHITECTURE.md` - 服务架构设计
- `docs/development/MONITORING_CENTER_PLAN.md` - 监控中心详细设计（待创建）

---

## 七、联调阶段任务调整

### 7.1 暂停开发任务（联调阶段不执行）

| 任务编号 | 任务名称 | 原计划工时 | 暂停原因 | 重启条件 |
|----------|----------|------------|----------|----------|
| T-006 | AI对话界面 | 3天 | Backend已实现C4-001~008，但Miniprogram优先 | Miniprogram稳定后 |
| T-007 | 生成确认页 | 1.5天 | 依赖T-006 | T-006完成后 |
| T-012 | E2E测试完善 | 2天 | 非联调必需 | 监控中心阶段 |

### 7.2 保持可用状态（不新增功能）

| 功能 | 当前状态 | 联调阶段策略 |
|------|----------|--------------|
| 登录/注册页 (T-003) | ✅ 可用 | 保持现状，仅用于开发调试 |
| AI账户列表 (T-004) | ✅ 可用 | 保持现状，仅用于开发调试 |
| 实时行情组件 (T-008) | ✅ 可用 | 保持现状，仅用于开发调试 |
| API客户端 (T-001) | ✅ 可用 | 保持现状，供开发使用 |

### 7.3 监控中心预备任务（可选）

如 Frontend 团队有余力，可提前进行：
- [ ] 调研监控开源方案（Grafana/Prometheus vs 自研）
- [ ] 设计监控中心信息架构（页面结构、导航）
- [ ] 整理各服务可提供的监控指标

---

*最后更新: 2026-02-12*
*架构决策: Frontend转型监控中心，联调阶段暂停用户界面开发*
*负责人: Frontend开发团队（当前暂停）/ 架构团队（监控中心设计）*
