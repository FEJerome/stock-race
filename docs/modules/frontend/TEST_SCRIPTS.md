# Frontend 模块测试脚本索引

本文档记录 Frontend 模块的所有测试脚本，包括功能说明、用途和文件位置。

## 📋 测试概览

| 测试类别 | 数量 | 覆盖率 |
|---------|------|--------|
| 服务层测试 | 3个文件 | API/WebSocket/认证 |
| 页面测试 | 6个文件 | 主要页面功能 |
| Hooks测试 | 3个文件 | 状态管理逻辑 |
| 组件测试 | 1个文件 | 通知中心组件 |

---

## 🔧 服务层测试 (Services)

### 1. API 客户端测试
- **文件**: `frontend/src/services/__tests__/apiClient.test.ts`
- **功能**: 测试 HTTP 客户端封装
- **测试内容**:
  - 请求拦截器（自动添加认证头）
  - 响应拦截器（错误处理）
  - 重试机制（指数退避算法）
  - HTTP 方法封装（GET/POST/PUT/DELETE/PATCH）
- **对应实现**: `frontend/src/services/api.ts`

### 2. 认证拦截器测试
- **文件**: `frontend/src/services/__tests__/authInterceptor.test.ts`
- **功能**: 测试 Token 自动刷新机制
- **测试内容**:
  - Token 过期检测
  - Token 自动刷新
  - 401 错误处理
  - 刷新失败时登出
- **对应实现**: `frontend/src/services/auth.ts`

### 3. WebSocket 管理器测试
- **文件**: `frontend/src/services/__tests__/websocketManager.test.ts`
- **功能**: 测试 WebSocket 连接管理
- **测试内容**:
  - 连接/断开连接
  - 自动重连机制
  - 心跳管理器
  - 消息订阅/取消订阅
  - 多订阅者支持
- **对应实现**: `frontend/src/services/websocket.ts`

---

## 📄 页面测试 (Pages)

### 4. 登录页面测试
- **文件**: `frontend/src/pages/__tests__/Login.test.tsx`
- **功能**: 测试用户登录功能
- **测试内容**:
  - 表单渲染
  - 必填字段验证
  - 用户名长度验证
  - 密码长度验证
  - 登录成功/失败处理
  - 演示账户功能
- **对应实现**: `frontend/src/pages/Login.tsx`

### 5. AI 账户列表测试
- **文件**: `frontend/src/pages/__tests__/AIAccountList.test.tsx`
- **功能**: 测试 AI 账户列表展示
- **测试内容**:
  - 列表页面渲染
  - 账户卡片展示
  - 空状态处理
- **对应实现**: `frontend/src/pages/AIAccounts.tsx`

### 6. 创建向导测试
- **文件**: `frontend/src/pages/__tests__/CreateWizard.test.tsx`
- **功能**: 测试 AI 账户创建向导
- **测试内容**:
  - 向导步骤切换
  - 表单验证
  - 数据持久化
- **对应实现**: `frontend/src/pages/AIAccounts.tsx` (内嵌组件)

### 7. AI 对话界面测试
- **文件**: `frontend/src/pages/__tests__/AIDialogue.test.tsx`
- **功能**: 测试 AI 基金经理对话
- **测试内容**:
  - 聊天界面渲染
  - 消息发送/接收
  - 10轮对话限制
  - Token 预算显示
- **对应实现**: `frontend/src/pages/AIAccounts.tsx` (内嵌组件)

### 8. 账户详情测试
- **文件**: `frontend/src/pages/__tests__/AccountDetail.test.tsx`
- **功能**: 测试 AI 账户详情页
- **测试内容**:
  - 详情数据展示
  - 持仓列表
  - 收益计算
- **对应实现**: `frontend/src/pages/AIAccounts.tsx` (内嵌组件)

### 9. 交易记录测试
- **文件**: `frontend/src/pages/__tests__/TradeHistory.test.tsx`
- **功能**: 测试交易记录页面
- **测试内容**:
  - 交易列表渲染
  - 分页功能
  - 筛选功能
- **对应实现**: `frontend/src/pages/Trading.tsx` (内嵌组件)

---

## 🪝 Hooks 测试

### 10. useAIAccounts Hook 测试
- **文件**: `frontend/src/hooks/__tests__/useAIAccounts.test.ts`
- **功能**: 测试 AI 账户数据获取
- **测试内容**:
  - 账户数据获取
  - 缓存机制
  - 错误处理
- **对应实现**: `frontend/src/hooks/useAIAccounts.ts`

### 11. useAIDialogue Hook 测试
- **文件**: `frontend/src/hooks/__tests__/useAIDialogue.test.ts`
- **功能**: 测试 AI 对话管理
- **测试内容**:
  - 消息发送处理
  - WebSocket 消息接收
  - 对话轮数统计
- **对应实现**: `frontend/src/hooks/useAIDialogue.ts`

### 12. useTradeHistory Hook 测试
- **文件**: `frontend/src/hooks/__tests__/useTradeHistory.test.ts`
- **功能**: 测试交易历史管理
- **测试内容**:
  - 分页查询
  - 筛选功能
  - 排序功能
- **对应实现**: `frontend/src/hooks/useTradeHistory.ts`

---

## 🧩 组件测试 (Components)

### 13. 通知中心组件测试
- **文件**: `frontend/src/components/Notification/__tests__/NotificationCenter.test.tsx`
- **功能**: 测试全局通知中心
- **测试内容**:
  - 通知中心渲染
  - 通知展示/关闭
  - WebSocket 通知接收
  - 多条通知队列
- **对应实现**: `frontend/src/components/Notification/NotificationCenter.tsx`

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

## 📊 测试统计

| 模块 | 测试文件数 | 测试用例数 | 状态 |
|------|-----------|-----------|------|
| Services | 3 | 35+ | ✅ |
| Pages | 6 | 20+ | ✅ |
| Hooks | 3 | 12+ | ✅ |
| Components | 1 | 5+ | ✅ |
| **总计** | **13** | **70+** | **✅** |

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

*文档创建时间: 2026-02-11*
*最后更新: 2026-02-11*
