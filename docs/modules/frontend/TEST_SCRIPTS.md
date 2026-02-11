# Frontend 模块测试脚本索引

本文档记录 Frontend 模块的所有测试脚本，包括功能说明、用途和文件位置。

## 📋 测试概览

| 测试类别 | 计划数量 | 实际数量 | 覆盖率 | 状态 |
|---------|---------|---------|--------|------|
| 服务层测试 | 3个文件 | 0 | 0% | ❌ 未实现 |
| 页面测试 | 6个文件 | 0 | 0% | ❌ 未实现 |
| Hooks测试 | 3个文件 | 0 | 0% | ❌ 未实现 |
| 组件测试 | 1个文件 | 0 | 0% | ❌ 未实现 |
| **总计** | **13** | **0** | **0%** | **❌** |

---

## 🔧 服务层测试 (Services)

### 1. API 客户端测试
- **文件**: `frontend/src/services/__tests__/apiClient.test.ts`
- **状态**: ❌ 未实现
- **计划功能**: 测试 HTTP 客户端封装
- **计划测试内容**:
  - 请求拦截器（自动添加认证头）
  - 响应拦截器（错误处理）
  - 重试机制（指数退避算法）
  - HTTP 方法封装（GET/POST/PUT/DELETE/PATCH）
- **对应实现**: `frontend/src/services/api.ts`

**架构师标注**: 核心基础设施，优先实现

---

### 2. 认证拦截器测试
- **文件**: `frontend/src/services/__tests__/authInterceptor.test.ts`
- **状态**: ❌ 未实现
- **计划功能**: 测试 Token 自动刷新机制
- **计划测试内容**:
  - Token 过期检测
  - Token 自动刷新
  - 401 错误处理
  - 刷新失败时登出
- **对应实现**: `frontend/src/services/auth.ts`

**架构师标注**: 当前实现缺少token刷新，需先实现功能再补充测试

---

### 3. WebSocket 管理器测试
- **文件**: `frontend/src/services/__tests__/websocketManager.test.ts`
- **状态**: ❌ 未实现
- **计划功能**: 测试 WebSocket 连接管理
- **计划测试内容**:
  - 连接/断开连接
  - 自动重连机制
  - 心跳管理器
  - 消息订阅/取消订阅
  - 多订阅者支持
- **对应实现**: `frontend/src/services/websocket.ts`

**架构师标注**: Hook实现完善，需要提取为可测试的服务类

---

## 📄 页面测试 (Pages)

### 4. 登录页面测试
- **文件**: `frontend/src/pages/__tests__/Login.test.tsx`
- **状态**: ❌ 未实现
- **计划功能**: 测试用户登录功能
- **计划测试内容**:
  - 表单渲染
  - 必填字段验证
  - 用户名长度验证
  - 密码长度验证
  - 登录成功/失败处理
  - 演示账户功能
- **对应实现**: `frontend/src/pages/Login.tsx`

**架构师标注**: 用户入口，高优先级测试

---

### 5. AI 账户列表测试
- **文件**: `frontend/src/pages/__tests__/AIAccountList.test.tsx`
- **状态**: ❌ 未实现
- **计划功能**: 测试 AI 账户列表展示
- **计划测试内容**:
  - 列表页面渲染
  - 账户卡片展示
  - 空状态处理
- **对应实现**: `frontend/src/pages/AIAccounts.tsx`

---

### 6. 创建向导测试
- **文件**: `frontend/src/pages/__tests__/CreateWizard.test.tsx`
- **状态**: ❌ 未实现
- **计划功能**: 测试 AI 账户创建向导
- **计划测试内容**:
  - 向导步骤切换
  - 表单验证
  - 数据持久化
- **对应实现**: `frontend/src/pages/AIAccounts.tsx` (内嵌组件)

**架构师标注**: 当前非向导形式，需先重构为向导组件

---

### 7. AI 对话界面测试
- **文件**: `frontend/src/pages/__tests__/AIDialogue.test.tsx`
- **状态**: ❌ 未实现（功能未实现）
- **计划功能**: 测试 AI 基金经理对话
- **计划测试内容**:
  - 聊天界面渲染
  - 消息发送/接收
  - 10轮对话限制
  - Token 预算显示
- **对应实现**: `frontend/src/pages/AIAccounts.tsx` (内嵌组件)

**架构师标注**: 依赖Backend WebSocket接口

---

### 8. 账户详情测试
- **文件**: `frontend/src/pages/__tests__/AccountDetail.test.tsx`
- **状态**: ❌ 未实现
- **计划功能**: 测试 AI 账户详情页
- **计划测试内容**:
  - 详情数据展示
  - 持仓列表
  - 收益计算
- **对应实现**: `frontend/src/pages/AIAccounts.tsx` (内嵌组件)

---

### 9. 交易记录测试
- **文件**: `frontend/src/pages/__tests__/TradeHistory.test.tsx`
- **状态**: ❌ 未实现
- **计划功能**: 测试交易记录页面
- **计划测试内容**:
  - 交易列表渲染
  - 分页功能
  - 筛选功能
- **对应实现**: `frontend/src/pages/Trading.tsx` (内嵌组件)

---

## 🪝 Hooks 测试

### 10. useAIAccounts Hook 测试
- **文件**: `frontend/src/hooks/__tests__/useAIAccounts.test.ts`
- **状态**: ❌ 未实现
- **计划功能**: 测试 AI 账户数据获取
- **计划测试内容**:
  - 账户数据获取
  - 缓存机制
  - 错误处理
- **对应实现**: `frontend/src/hooks/useAIAccounts.ts`

**架构师标注**: Hook未独立提取，当前在页面中直接调用service

---

### 11. useAIDialogue Hook 测试
- **文件**: `frontend/src/hooks/__tests__/useAIDialogue.test.ts`
- **状态**: ❌ 未实现（功能未实现）
- **计划功能**: 测试 AI 对话管理
- **计划测试内容**:
  - 消息发送处理
  - WebSocket 消息接收
  - 对话轮数统计
- **对应实现**: `frontend/src/hooks/useAIDialogue.ts`

---

### 12. useTradeHistory Hook 测试
- **文件**: `frontend/src/hooks/__tests__/useTradeHistory.test.ts`
- **状态**: ❌ 未实现
- **计划功能**: 测试交易历史管理
- **计划测试内容**:
  - 分页查询
  - 筛选功能
  - 排序功能
- **对应实现**: `frontend/src/hooks/useTradeHistory.ts`

**架构师标注**: Hook未独立提取

---

## 🧩 组件测试 (Components)

### 13. 通知中心组件测试
- **文件**: `frontend/src/components/Notification/__tests__/NotificationCenter.test.tsx`
- **状态**: ❌ 未实现
- **计划功能**: 测试全局通知中心
- **计划测试内容**:
  - 通知中心渲染
  - 通知展示/关闭
  - WebSocket 通知接收
  - 多条通知队列
- **对应实现**: `frontend/src/components/Notification/NotificationCenter.tsx`

**架构师标注**: 当前通知集成在useWebSocket中，建议提取为独立组件

---

## 🧰 工具类测试

### 14. 缓存管理器测试
- **文件**: `frontend/src/utils/__tests__/cache.test.ts`
- **状态**: ❌ 未实现
- **计划功能**: 测试缓存管理工具
- **计划测试内容**:
  - 内存缓存读写
  - localStorage读写
  - 过期清理
  - 交易时间判断
  - 统计功能
- **对应实现**: `frontend/src/utils/cache.ts`

**架构师标注**: 工具类逻辑复杂，需要充分测试

---

## 🚀 运行测试

### 运行所有测试
```bash
cd frontend
npm test
```

### 运行特定测试文件
```bash
npm test -- apiClient.test.ts
npm test -- websocketManager.test.ts
npm test -- Login.test.tsx
```

### 运行测试并生成覆盖率报告
```bash
npm run test:coverage
```

### 运行测试（UI 模式）
```bash
npm run test:ui
```

---

## 📝 测试配置

### 当前配置 (package.json)
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  },
  "devDependencies": {
    "vitest": "^1.0.4",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.1.4"
  }
}
```

### 缺少的配置
- ❌ `vitest.config.ts` - Vitest配置文件
- ❌ `src/test/setup.ts` - 测试环境初始化
- ❌ `@testing-library/user-event` - 用户交互模拟

---

## 📊 测试实施建议

### Phase 1: 基础设施测试（高优先级）
1. `cache.test.ts` - 缓存管理器测试
2. `apiClient.test.ts` - API客户端测试

### Phase 2: 核心功能测试（高优先级）
3. `Login.test.tsx` - 登录页面测试
4. `AIAccountList.test.tsx` - AI账户列表测试

### Phase 3: 服务层测试（中优先级）
5. `market.service.test.ts` - 市场服务测试
6. `trading.service.test.ts` - 交易服务测试
7. `auth.service.test.ts` - 认证服务测试

### Phase 4: 组件测试（中优先级）
8. `RealTimeQuotes.test.tsx` - 实时行情组件测试
9. `PortfolioSummary.test.tsx` - 持仓汇总组件测试

### Phase 5: 高级功能测试（低优先级）
10. `CreateWizard.test.tsx` - 创建向导测试（需先实现功能）
11. `AIDialogue.test.tsx` - AI对话测试（需先实现功能）

---

## 📝 提交规范

测试提交信息格式：
```
test(frontend): [T-XXX] 添加XXX测试
```

示例：
```
test(frontend): [T-001] 添加API客户端测试
test(frontend): [T-002] 添加WebSocket管理器测试
test(frontend): [T-003] 添加登录页面测试
```

---

## 架构师总结

**当前状态**: ⚠️ 测试框架已配置，但无实际测试文件

**风险评估**: 🔴 高风险 - 零测试覆盖意味着代码质量无法保障

**建议优先级**:
1. 立即补充缓存管理器测试（工具类，无依赖）
2. 补充API客户端测试（基础设施）
3. 补充登录页面测试（核心用户流程）
4. 逐步补充其他测试

**预计工作量**: 约5-7天完成基础测试覆盖

---

*文档创建时间: 2026-02-11*
*最后更新: 2026-02-11*
*架构师: 首席架构师*
