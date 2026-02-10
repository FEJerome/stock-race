# Backend 模块测试脚本索引

> **说明**: 本文档记录 Backend 模块所有测试文件的功能、用途和位置，供架构师查阅和开发团队维护使用。

---

## 测试目录结构

```
backend/
├── tests/
│   ├── unit/                          # 单元测试
│   │   ├── routes/                    # 路由层测试
│   │   ├── services/                  # 服务层测试
│   │   ├── jobs/                      # 定时任务测试
│   │   └── events/                    # 事件总线测试
│   ├── integration/                   # 集成测试
│   │   ├── api/                       # API端点测试
│   │   ├── websocket/                 # WebSocket测试
│   │   ├── queue/                     # 队列测试
│   │   ├── jobs/                      # 任务调度测试
│   │   └── services/                  # 服务通信测试
│   └── fixtures/                      # 测试数据
└── test/                              # 旧版测试目录
    ├── controllers/                   # 控制器测试
    ├── integration/                   # 旧版集成测试
    └── services/                      # 旧版服务测试
```

---

## 单元测试 (Unit Tests)

### 1. ServiceClient.test.js
- **位置**: `tests/unit/services/ServiceClient.test.js`
- **功能**: Service SDK 统一封装测试
- **测试内容**:
  - HTTP 方法测试 (GET, POST, PUT, DELETE)
  - 请求重试逻辑
  - 熔断器状态管理
  - 健康检查功能
- **对应需求**: T-001 Service SDK 统一封装
- **测试数量**: 26 个

### 2. EventBus.test.js
- **位置**: `tests/unit/events/EventBus.test.js`
- **功能**: Redis 事件总线封装测试
- **测试内容**:
  - 发布/订阅基本功能
  - 模式订阅
  - 取消订阅
  - 事件处理程序执行
- **对应需求**: T-002 Redis 事件总线封装
- **测试数量**: 18 个

### 3. ai-accounts.test.js
- **位置**: `tests/unit/routes/ai-accounts.test.js`
- **功能**: AI账户创建 API 路由测试
- **测试内容**:
  - 认证要求验证
  - 必填字段验证
  - 初始资金范围边界测试
  - 模型类型验证
  - 数据库操作测试
- **对应需求**: T-003 AI账户创建API
- **测试数量**: 19 个

### 4. AIDialogueService.test.js
- **位置**: `tests/unit/services/AIDialogueService.test.js`
- **功能**: AI对话服务单元测试
- **测试内容**:
  - 对话限制保护 (10轮)
  - Token 限制 (500/轮)
  - 冷却时间验证 (1秒)
  - 连接管理
- **对应需求**: T-004 AI对话服务
- **测试数量**: 30 个

### 5. PromptCraftService.test.js
- **位置**: `tests/unit/services/PromptCraftService.test.js`
- **功能**: 提示词提炼服务测试
- **测试内容**:
  - 提示词结构生成
  - 角色定义提取
  - 约束条件解析
  - 失败回滚测试
- **对应需求**: T-005 提示词生成与AI账户激活
- **测试数量**: 22 个

### 6. StockHeatScheduler.test.js
- **位置**: `tests/unit/jobs/StockHeatScheduler.test.js`
- **功能**: 热股票列表生成器测试
- **测试内容**:
  - 热股票列表生成逻辑
  - 持仓数据提取
  - 关注列表统计
  - Redis 消息发布
- **对应需求**: T-006 热股票列表生成器
- **测试数量**: 24 个

### 7. AIWakeupScheduler.test.js
- **位置**: `tests/unit/services/AIWakeupScheduler.test.js`
- **功能**: AI唤醒调度器测试
- **测试内容**:
  - 冷却时间拦截 (5分钟)
  - 日限次保护 (10次/日)
  - Token 预算检查
  - 并发执行测试
- **对应需求**: T-007 AI唤醒调度器
- **测试数量**: 22 个

### 8. TradeExecutionService.test.js
- **位置**: `tests/unit/services/TradeExecutionService.test.js`
- **功能**: 交易执行服务测试
- **测试内容**:
  - 买入执行 (余额检查)
  - 卖出执行 (持仓检查)
  - 持有决策记录
  - 幂等性保护
  - 批量执行
- **对应需求**: T-009 AI决策结果接收与执行
- **测试数量**: 13 个

### 9. HealthService.test.js
- **位置**: `tests/unit/services/HealthService.test.js`
- **功能**: 健康检查服务测试
- **测试内容**:
  - 基本健康信息
  - 依赖状态计算
  - 服务统计
  - 运行时间格式化
- **对应需求**: T-010 服务健康检查与监控
- **测试数量**: 18 个

**单元测试总计**: 9 个测试文件, 195 个测试

---

## 集成测试 (Integration Tests)

### 1. service-communication.test.js
- **位置**: `tests/integration/services/service-communication.test.js`
- **功能**: 服务通信集成测试
- **测试内容**:
  - 实际服务健康检查调用
  - 熔断器集成测试
  - 超时重试验证
- **对应需求**: T-001 Service SDK
- **环境要求**: 需 trading-ai-service:8000, market-data-service:8001 运行
- **状态**: 需要外部服务

### 2. event-pubsub.test.js
- **位置**: `tests/integration/events/event-pubsub.test.js`
- **功能**: Redis Pub/Sub 集成测试
- **测试内容**:
  - 跨进程消息传递
  - 频道订阅/取消
  - 消息持久化
- **对应需求**: T-002 Redis 事件总线
- **环境要求**: 需 Redis 服务
- **状态**: ✅ 通过

### 3. ai-account-creation.test.js
- **位置**: `tests/integration/api/ai-account-creation.test.js`
- **功能**: AI账户创建 API 集成测试
- **测试内容**:
  - 完整创建流程
  - 数据库记录验证
  - 权限控制
- **对应需求**: T-003 AI账户创建API
- **环境要求**: 需 Backend 服务运行在 :3001, PostgreSQL
- **状态**: 需要完整服务环境

### 4. ai-account-finalize.test.js
- **位置**: `tests/integration/api/ai-account-finalize.test.js`
- **功能**: AI账户激活集成测试
- **测试内容**:
  - 提示词提炼流程
  - 账户状态转换
  - 失败回滚
- **对应需求**: T-005 提示词生成
- **环境要求**: 需 Backend + PostgreSQL
- **状态**: ✅ 通过

### 5. ai-dialogue.test.js
- **位置**: `tests/integration/websocket/ai-dialogue.test.js`
- **功能**: WebSocket AI对话集成测试
- **测试内容**:
  - WebSocket 连接建立
  - 消息收发
  - 对话限制验证
- **对应需求**: T-004 AI对话服务
- **环境要求**: 需 Backend WebSocket 服务
- **状态**: 需要 WebSocket 服务

### 6. hot-stocks-publishing.test.js
- **位置**: `tests/integration/jobs/hot-stocks-publishing.test.js`
- **功能**: 热股票列表发布集成测试
- **测试内容**:
  - Redis 消息发布验证
  - 数据格式验证
- **对应需求**: T-006 热股票列表
- **环境要求**: 需 Redis
- **状态**: ✅ 通过

### 7. ai-wakeup-queue.test.js
- **位置**: `tests/integration/queue/ai-wakeup-queue.test.js`
- **功能**: AI唤醒队列集成测试
- **测试内容**:
  - Bull 队列任务提交
  - 任务执行验证
  - 防重保护验证
- **对应需求**: T-007 AI唤醒调度器
- **环境要求**: 需 Redis
- **状态**: ✅ 通过

### 8. daily-close-job.test.js
- **位置**: `tests/integration/jobs/daily-close-job.test.js`
- **功能**: 每日收盘任务集成测试
- **测试内容**:
  - 定时触发逻辑
  - 分批执行
  - 错误处理
- **对应需求**: T-008 每日收盘批量更新
- **环境要求**: 需 Redis
- **状态**: ✅ 通过

### 9. ai-decision-execution.test.js
- **位置**: `tests/integration/api/ai-decision-execution.test.js`
- **功能**: AI决策执行集成测试
- **测试内容**:
  - 决策到交易流程
  - 余额/持仓检查
  - 幂等性验证
- **对应需求**: T-009 交易执行
- **环境要求**: 需 Backend + PostgreSQL
- **状态**: 需要数据库

### 10. health-check.test.js
- **位置**: `tests/integration/api/health-check.test.js`
- **功能**: 健康检查端点集成测试
- **测试内容**:
  - 基本健康检查 (< 100ms)
  - 详细健康状态
  - 服务降级检测
  - 响应时间验证
- **对应需求**: T-010 健康检查
- **环境要求**: 需 Backend 服务
- **状态**: 部分需要外部服务

**集成测试总计**: 10 个测试文件, 75 个测试 (66 通过, 9 需要完整环境)

---

## 运行测试

### 运行所有单元测试
```bash
cd backend
NODE_OPTIONS="--experimental-vm-modules" npm test -- tests/unit/
```

### 运行所有集成测试
```bash
cd backend
NODE_OPTIONS="--experimental-vm-modules" npm test -- tests/integration/
```

### 运行特定测试文件
```bash
cd backend
NODE_OPTIONS="--experimental-vm-modules" npm test -- tests/unit/services/HealthService.test.js
```

### 运行带覆盖率报告
```bash
cd backend
NODE_OPTIONS="--experimental-vm-modules" npm test -- --coverage
```

---

## 测试环境要求

### 最小单元测试环境
- Node.js 18+
- npm 依赖已安装

### 完整集成测试环境
- Backend 服务运行在 localhost:3001
- PostgreSQL 数据库 (端口 5432)
- Redis 缓存 (端口 6379)
- trading-ai-service (端口 8000)
- market-data-service (端口 8001)

### 使用 Docker Compose 启动完整环境
```bash
docker-compose up -d
```

---

## 测试覆盖率汇总

| 模块 | 语句覆盖 | 分支覆盖 | 函数覆盖 |
|------|---------|---------|---------|
| services | 55%+ | 44%+ | 55%+ |
| routes | 88%+ | 25%+ | 5%+ |
| middleware | 15%+ | 6%+ | 18%+ |
| models | 3%+ | 0%+ | 6%+ |

> **注意**: models 和 middleware 覆盖率较低是因为主要逻辑在 services 和 routes 层。

---

*最后更新: 2026-02-10*
*更新人: Claude (Backend开发助手)*
*文档用途: 架构师审查与开发团队维护*
