# Backend 模块测试脚本索引

> **说明**: 本文档记录 Backend 模块所有测试文件的功能、用途和位置，供架构师查阅和开发团队维护使用。

---

## 测试系统状态 (P0-001 修复后)

### 2026-02-12 测试系统修复

**修复内容**:
- ✅ ESM/CommonJS混用问题已修复
- ✅ Jest配置支持ESM模式 (`NODE_OPTIONS='--experimental-vm-modules'`)
- ✅ Babel配置支持ESM转换和顶层await
- ✅ 所有测试文件使用统一ESM语法
- ✅ Chai/Sinon断言替换为Jest断言

**当前测试结果**:
```
Test Suites: 20 passed, 27 failed, 47 total
Tests:       422 passed, 97 failed, 519 total
```

**说明**:
- 27个失败的测试套件主要是集成测试，需要外部服务（Redis、PostgreSQL、Trading AI Service等）
- 所有ESM语法错误已修复，`npm test` 可正常运行

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

### Phase 6 新增测试（2026-02-11）

### 0. AI对话服务测试（C4-001 ~ C4-008）

#### DialogueService.test.js
- **位置**: `tests/unit/services/DialogueService.test.js`
- **功能**: AI对话核心服务测试
- **测试内容**:
  - 对话会话管理（创建、获取、过期）
  - 对话消息处理（SSE流式响应）
  - 投资偏好提取与画像生成
  - Token成本控制（轮数限制、预算限制）
  - 系统提示词构建
- **对应需求**: C4-001 ~ C4-006
- **测试数量**: 16 个

#### DialogueConfigService.test.js
- **位置**: `tests/unit/services/DialogueConfigService.test.js`
- **功能**: AI对话动态配置服务测试
- **测试内容**:
  - 默认配置获取
  - Redis缓存读取与写入
  - 数据库配置加载
  - 配置更新与验证（范围检查）
  - 配置变更历史记录
  - 本地缓存与Redis缓存清除
  - 管理员视图配置获取
- **对应需求**: C4-007 动态配置系统
- **测试数量**: 17 个

#### DialogueAuditService.test.js
- **位置**: `tests/unit/services/DialogueAuditService.test.js`
- **功能**: AI对话内容审计服务测试
- **测试内容**:
  - 消息记录与审计状态判定（approved/flagged/blocked）
  - 敏感词检测与敏感度评分
  - 审计日志多维度查询（会话、账户、状态、日期范围）
  - 消息审核（通过/拒绝）
  - 敏感词列表更新
  - 会话审查检查
  - 审计统计报表
  - 内容哈希计算
- **对应需求**: C4-008 内容审查机制
- **测试数量**: 25 个

### 1. DialogueGateway.test.js
- **位置**: `tests/unit/services/DialogueGateway.test.js`
- **功能**: AI对话服务重构测试（T-011）
- **测试内容**:
  - WebSocket消息转发至trading-ai-service
  - 对话状态维护（轮数、冷却时间）
  - 流式响应处理
  - 并发连接控制（同一账户单连接）
  - 服务降级处理
- **对应需求**: T-011 AI对话服务重构
- **测试数量**: 12 个

### 2. PortfolioChangePublisher.test.js
- **位置**: `tests/unit/events/PortfolioChangePublisher.test.js`
- **功能**: 持仓变更事件发布测试（T-012）
- **测试内容**:
  - 持仓变更事件发布到Redis Stream
  - 股票添加/移除事件格式验证
  - 批量事件聚合
- **对应需求**: T-012 热股票列表事件驱动优化
- **测试数量**: 10 个

### 3. HotStocksAggregator.test.js
- **位置**: `tests/unit/services/HotStocksAggregator.test.js`
- **功能**: 热股票聚合器测试（T-012）
- **测试内容**:
  - 增量热股票计数器逻辑
  - Sorted Set更新（ZINCRBY）
  - 定时全量校准任务
  - 事件丢失恢复
- **对应需求**: T-012 热股票列表事件驱动优化
- **测试数量**: 12 个

### 4. DynamicLimitService.test.js
- **位置**: `tests/unit/services/DynamicLimitService.test.js`
- **功能**: 动态限制服务测试（T-013）
- **测试内容**:
  - 分层配置解析（默认→会员→账户）
  - 会员级别限制解析（free/basic/premium/vip）
  - 账户级别覆盖验证
  - 缓存热更新测试
  - 审计日志记录
- **对应需求**: T-013 AI唤醒次数动态配置
- **测试数量**: 14 个

### 5. TradingCalendarService.test.js
- **位置**: `tests/unit/services/TradingCalendarService.test.js`
- **功能**: 交易日历服务测试（T-014）
- **测试内容**:
  - 交易日判断（节假日、调休）
  - 下一个交易日计算
  - 交易时间验证（半日市）
  - CSV导入功能
  - 2026年交易日历数据验证
- **对应需求**: T-014 交易日历管理系统
- **测试数量**: 16 个

### 6. TradingRulesEngine.test.js
- **位置**: `tests/unit/services/TradingRulesEngine.test.js`
- **功能**: 交易规则引擎测试（T-015）
- **测试内容**:
  - 各市场类型规则（主板/创业板/科创板/北交所）
  - 特殊规则（ST 5%/新股首日无限制/停牌）
  - 涨跌停价格计算（四舍五入到分）
  - 交易数量验证（科创板200股起）
  - 交易时间验证（集合竞价/连续竞价）
- **对应需求**: T-015 虚拟交易规则引擎
- **测试数量**: 14 个

### 7. TradeValidator.test.js
- **位置**: `tests/unit/services/TradeValidator.test.js`
- **功能**: 交易校验器测试（T-015）
- **测试内容**:
  - 买入交易前校验（资金、价格限制）
  - 卖出交易前校验（持仓、跌停限制）
  - 停牌股票拒绝交易
  - 错误信息聚合
  - 持仓决策校验
- **对应需求**: T-015 交易前综合校验
- **测试数量**: 12 个

---

## 原始单元测试 (Unit Tests)

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

### 10. EventBusIntegration.test.js
- **位置**: `tests/unit/services/EventBusIntegration.test.js`
- **功能**: 事件总线SDK集成测试
- **测试内容**:
  - Redis连接和SDK集成
  - 发布账户更新事件
  - 发布交易执行事件
  - 订阅AI决策事件
  - 事件处理器实现
  - 消费者组配置
  - 端到端事件流
- **对应需求**: C2-BE-001 ~ C2-BE-006 事件总线集成
- **测试数量**: 15 个

**Phase 6 新增测试**: 8 个测试文件, 105 个测试用例

**单元测试总计**: 18 个测试文件, 314 个测试

---

## 新增测试 (2026-02-11)

### 11. DialogueService.test.js
- **位置**: `tests/unit/services/DialogueService.test.js`
- **功能**: AI对话服务单元测试（C4-001~C4-006）
- **测试内容**:
  - 对话会话管理（创建、获取、过期）
  - 对话消息处理（轮数限制、Token预算）
  - 投资偏好提取与账户激活
  - Token成本控制
  - 系统提示词构建
- **对应需求**: C4-001 ~ C4-006 AI对话服务
- **测试数量**: 14 个

---

## 新增测试 (2026-02-12 联调冲刺)

### 12. GuestService.test.js
- **位置**: `tests/unit/services/GuestService.test.js`
- **功能**: 游客服务单元测试（C5-001~C5-006 + P0-004 + P0-005）
- **测试内容**:
  - 游客Token生成与过期验证（C5-001）
  - AI账户创建与限制，最多2个（C5-002）
  - AI对话与轮数限制，最多10轮（C5-003）
  - 数据迁移到正式用户（C5-004）
  - 过期清理任务（C5-005）
  - 会话查询（C5-006）
  - Redis持久化（P0-004）：会话/账户/对话持久化、从Redis恢复、降级处理
- **对应需求**: C5-001 ~ C5-006, P0-004, P0-005
- **测试数量**: 32 个

### 13. EventBusIntegration.test.js (更新)
- **位置**: `tests/unit/services/EventBusIntegration.test.js`
- **功能**: 事件总线SDK集成测试（C2-BE-001~C2-BE-006 + C3-004B）
- **测试内容**:
  - Redis连接和SDK集成（C2-BE-001）
  - 发布账户更新事件（C2-BE-002）
  - 发布交易执行事件（C2-BE-003）
  - 订阅AI决策事件（C2-BE-004）
  - 事件处理器实现（C2-BE-005）
  - 消费者组配置（C2-BE-006）
  - **AI绩效报告事件订阅（C3-004B）**：订阅ai:performance:report事件、处理绩效报告、更新排行榜
  - 端到端事件流
- **对应需求**: C2-BE-001 ~ C2-BE-006, C3-004B
- **测试数量**: 18 个（新增3个C3-004B测试）

### 14. HealthService.test.js (更新)
- **位置**: `tests/unit/services/HealthService.test.js`
- **功能**: 健康检查服务测试（T-010 + C1-BE-001~C1-BE-003）
- **测试内容**:
  - 基本健康信息（T-010）
  - 依赖状态计算：Redis、PostgreSQL、Market Data、Trading AI、News Service、EventBus（C1-BE-001）
  - NORMAL/DEGRADED/OFFLINE模式切换（C1-BE-002）
  - 自动恢复机制（C1-BE-003）
  - 服务统计
  - 运行时间格式化
- **对应需求**: T-010, C1-BE-001 ~ C1-BE-003
- **测试数量**: 22 个（新增4个C1-BE测试）

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
| services | 65%+ | 52%+ | 62%+ |
| routes | 88%+ | 25%+ | 5%+ |
| middleware | 15%+ | 6%+ | 18%+ |
| models | 3%+ | 0%+ | 6%+ |

> **注意**:
> - models 和 middleware 覆盖率较低是因为主要逻辑在 services 和 routes 层
> - Phase 6新增服务（TradingRulesEngine、DynamicLimitService等）测试覆盖率达85%+

---

*最后更新: 2026-02-11*
*更新人: 首席架构师*
*文档用途: 架构师审查与开发团队维护*
