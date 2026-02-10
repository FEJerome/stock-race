# Frontend 模块开发规划

## 模块概述

**模块名称**: Frontend (React + TypeScript + Vite)
**主要职责**: Web用户界面、实时行情展示、AI账户管理UI、交易界面
**服务端口**: 3000
**通信方式**: HTTP REST + WebSocket (通过 Backend 中转)

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

| 条目 | 状态 | 开发日期 | 测试通过日期 | 合并提交 |
|------|------|----------|--------------|----------|
| [T-001] API客户端 | 🔲 待开发 | - | - | - |
| [T-002] WebSocket管理器 | 🔲 待开发 | - | - | - |
| [T-003] 登录/注册页 | 🔲 待开发 | - | - | - |
| [T-004] AI账户列表 | 🔲 待开发 | - | - | - |
| [T-005] AI创建向导 | 🔲 待开发 | - | - | - |
| [T-006] AI对话界面 | 🔲 待开发 | - | - | - |
| [T-007] 生成确认页 | 🔲 待开发 | - | - | - |
| [T-008] 实时行情组件 | 🔲 待开发 | - | - | - |
| [T-009] AI账户详情 | 🔲 待开发 | - | - | - |
| [T-010] 交易记录页 | 🔲 待开发 | - | - | - |
| [T-011] 实时通知 | 🔲 待开发 | - | - | - |

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

*最后更新: 2026-02-10*
*负责人: Frontend开发团队*
