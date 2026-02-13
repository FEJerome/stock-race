# Backend 模块 - 待办任务追踪

> 本文档仅记录**未完成**和**等待其他服务跟进**的工作项。
> 已完成功能请查阅 [HAVE_DONE.md](./HAVE_DONE.md)。
> 最后更新：2026-02-13 (Backend开发团队) - 今日开发收尾完成，所有工作已校验并持久化

---

## 状态图例

- 🔲 待开发
- 🔄 开发中
- ⏸️ 阻塞（依赖其他服务）
- ✅ 已完成（已移至 HAVE_DONE.md）

---

## 一、待办任务

### 1.1 Market Data Service 热股票列表 API（新增）

| 编号 | 任务 | 状态 | 优先级 | 说明 | 测试覆盖 |
|------|------|------|--------|------|----------|
| B-001 | WeightedHotStocksService实现 | ✅ | P0 | 多因子权重计算服务：用户查看数(40%) + 查看次数(30%) + 交易量(20%) + 收藏数(10%) | WeightedHotStocksService.test.js |
| B-002 | 热股票列表API端点 | ✅ | P0 | `GET /api/v1/market/hot-stocks`，支持limit和minWeight参数 | 集成测试 |
| B-003 | 缓存状态查询接口 | ✅ | P1 | `GET /api/v1/market/hot-stocks/status` | 集成测试 |
| B-004 | 手动刷新接口（管理员） | ✅ | P1 | `POST /api/v1/market/hot-stocks/refresh` | 集成测试 |
| B-005 | 用户活动数据收集 | ✅ | P1 | 从WebSocket连接统计用户查看行为 | StockActivityTracker.test.js |
| B-006 | 定时更新任务 | ✅ | P1 | 每30秒自动更新热股票列表 | 集成测试 |
| B-007 | 热股票公开API端点 | ✅ | P1 | `GET /api/v1/public/hot-stocks`，供Market Data Service无认证访问 | 联调通过 |

**设计文档**: [热股票列表API设计](../../architecture/CURRENT/HOT_STOCK_LIST_DESIGN.md)

**实现说明**:
- ✅ 采用TDD开发模式：先编写测试脚本，再实现功能代码
- ✅ 多因子权重计算：归一化处理，保留1位小数
- ✅ Redis缓存：60秒TTL，支持容错降级
- ✅ 权重范围：0-100，便于Market Data Service排序选取
- ✅ 公开API：`/api/v1/public/hot-stocks` 无需认证，供Market Data Service调用
- ✅ 修复Redis API：`setex` → `setEx` 适配Redis v4客户端

**API端点**:
- `GET /api/v1/market/hot-stocks` - 获取加权热股票列表
- `GET /api/v1/market/hot-stocks/status` - 获取缓存状态
- `POST /api/v1/market/hot-stocks/refresh` - 手动刷新（管理员）

**实现文件**:
- `src/services/WeightedHotStocksService.js` - 权重计算服务
- `src/services/StockActivityTracker.js` - 用户活动追踪服务(B-005)
- `src/controllers/MarketController.js` - 控制器方法（含定时任务启动/停止）
- `src/routes/market.js` - API路由
- `src/app.js` - 应用启动时启动定时任务(B-006)

**阻塞状态**: B-005、B-006已完成

**B-005 实现说明**:
- 创建 `StockActivityTracker` 服务，使用 Redis Hash 存储用户查看数据
- 记录 userCount（独立用户数）和 viewCount（查看次数）
- 集成到 `WebSocketService`，用户订阅股票时自动记录
- 支持批量记录、单条查询、批量查询
- 数据过期时间：1小时（可配置）
- 内存缓存去重：避免同一用户重复计数

**B-006 实现说明**:
- 应用启动时自动启动定时更新任务（每30秒）
- 通过 `startHotStocksScheduler()` / `stopHotStocksScheduler()` 控制
- 优雅关闭时自动停止定时任务
- 首次启动立即执行一次更新，确保缓存可用

### 1.2 集成测试环境完善

| 编号 | 任务 | 状态 | 优先级 | 说明 |
|------|------|------|--------|------|
| I-001 | 完善Docker Compose测试环境 | ✅ | P2 | 使剩余9个集成测试可自动化运行 |

**I-001 实现说明**:
- 创建 `docker-compose.test.yml` - 测试专用环境配置（轻量级）
- 创建 `scripts/run-integration-tests.sh` - 一键启动脚本（自动等待服务就绪、执行迁移）
- 更新 `package.json` - 添加 `test:integration`, `test:unit` 脚本
- 创建 `INTEGRATION_TESTING.md` - 完整测试指南文档
- 支持三种模式：一键启动、手动启动、CI模式
- 自动化健康检查和数据库迁移

**测试脚本列表**:
| 测试文件 | 测试内容 | 状态 |
|---------|---------|------|
| `service-communication.test.js` | 服务间通信 | ✅ 可运行 |
| `ai-account-creation.test.js` | AI账户创建流程 | ✅ 可运行 |
| `ai-dialogue.test.js` | WebSocket对话功能 | ✅ 可运行 |
| `ai-decision-execution.test.js` | AI决策执行 | ✅ 可运行 |
| `health-check.test.js` | 健康检查 | ✅ 可运行 |
| `event-pubsub.test.js` | 事件发布订阅 | ✅ 可运行 |
| `daily-close-job.test.js` | 日终结算任务 | ✅ 可运行 |
| `hot-stocks-publishing.test.js` | 热股票发布 | ✅ 可运行 |

**使用方式**:
```bash
# 一键启动完整环境
./scripts/run-integration-tests.sh

# 运行集成测试
cd backend && npm run test:integration
```

---

### 1.2 游客数据PostgreSQL化改造（高优先级）

> **背景**: 将游客数据从Redis迁移到PostgreSQL，使用逻辑删除+定时清理策略，与正式用户统一存储。
> **设计文档**: [游客模式设计方案](../../architecture/CURRENT/DECISIONS/005-MINIPROGRAM-GUEST-MODE.md)

| 编号 | 任务 | 状态 | 优先级 | 预计工作量 | 说明 | 测试覆盖 |
|------|------|------|--------|-----------|------|----------|
| G-001 | 创建guest_sessions表 | ✅ | P0 | 0.5天 | 游客会话表，含openid_hash、token、expires_at、status字段 | guest-migration.test.js |
| G-002 | 修改ai_accounts表 | ✅ | P0 | 0.5天 | 添加guest_session_id、is_guest、guest_expires_at字段，外键级联删除 | guest-migration.test.js |
| G-003 | GuestService重构 | ✅ | P0 | 2天 | GuestServicePostgreSQL：Token管理、AI账户CRUD、对话管理 | GuestServicePostgreSQL.test.js (50+测试) |
| G-004 | 游客账户删除功能 | ✅ | P0 | 0.5天 | 软删除实现，删除后可重建（活跃上限3个），事务保证计数准确 | GuestServicePostgreSQL.test.js |
| G-005 | 游客数据查询接口 | ✅ | P0 | 1天 | getAIAccounts等方法，联表查询支持 | GuestServicePostgreSQL.test.js |
| G-006 | 游客转正迁移服务 | ✅ | P0 | 1.5天 | migrateToFormalUser：原子事务+乐观锁+回滚机制 | GuestServicePostgreSQL.test.js (8个迁移测试) |
| G-007 | 定时清理服务 | ✅ | P0 | 1天 | GuestCleanupService：凌晨2点逻辑删除，凌晨3点物理删除 | GuestCleanupService.js |
| G-008 | 缓存一致性保障 | ✅ | P1 | 0.5天 | 删除时同步清缓存，缓存穿透防护（短TTL+数据库兜底） | GuestCacheService.test.js |
| G-009 | 数据库触发器保护 | ✅ | P1 | 0.5天 | prevent_migrated_guest_delete触发器阻止误删 | guest-migration.test.js |
| G-010 | 迁移数据校验任务 | ⏸️ | P1 | 0.5天 | 每小时校验迁移数据完整性，异常告警 | 待监控阶段实现 |

**实现文件**:
- `prisma/schema.prisma` - GuestSession、GuestMigrationLog模型
- `src/services/GuestServicePostgreSQL.js` - 核心服务（450+行，事务安全，含缓存集成）
- `src/services/GuestCacheService.js` - 缓存服务（Token/AI账户列表缓存，穿透防护）(G-008)
- `src/services/GuestCleanupService.js` - 定时清理服务（200+行）
- `tests/unit/database/guest-migration.test.js` - 数据库层测试（18个测试）
- `tests/unit/services/GuestServicePostgreSQL.test.js` - 服务层测试（50+测试）
- `tests/unit/services/GuestCacheService.test.js` - 缓存服务测试（21个测试）(G-008)

**关键实现细节**:
- **事务安全**: 所有关键操作使用Prisma事务，隔离级别Serializable
- **防误删机制**: 触发器阻止删除migrated/migrating状态，延迟25小时物理删除
- **并发控制**: 乐观锁（status条件）+ 行级锁（FOR UPDATE）
- **回滚机制**: 迁移失败自动恢复session状态

**关键约束**:
- 定时任务WHERE条件必须包含 `status IN ('active', 'expired')` 排除 'migrating' 和 'migrated'
- 物理删除延迟25小时（给恢复留余地）
- 级联删除：guest_sessions → ai_accounts → portfolios/trades/ai_decisions
- 缓存键前缀区分：guest:* vs user:*

**阻塞状态**: G-001~G-002 阻塞 G-003；G-003 阻塞 G-004~G-006；G-008 已完成

**G-008 实现说明（缓存一致性保障）**:
- 创建 `GuestCacheService` 服务，提供游客数据Redis缓存层
- **缓存内容**：Token验证结果、AI账户列表、OpenID映射
- **缓存穿透防护**：空值缓存（60秒TTL），防止缓存击穿
- **缓存一致性**：数据库删除/更新时同步清除相关缓存（级联删除）
- **集成点**：`GuestServicePostgreSQL` 所有读写操作自动维护缓存
- **性能优化**：使用pipeline批量操作，命中率统计监控
- **降级策略**：Redis不可用时自动降级到数据库查询

---

### 1.3 等待其他服务实现

#### 等待 trading-ai-service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| AI绩效报告事件 | `ai.performance.report` | ⏸️ | Backend已实现`subscribeToAIPerformanceReports`，等待对方发布事件 |

#### 等待 market-data-service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 股票交易状态实时接口 | `GET /api/v1/stocks/{symbol}/trading-status` | ⏸️ | Backend已实现T-015，当前使用TradingRulesEngine降级方案 |
| 市场规则配置接口 | `GET /api/v1/market/rules` | ⏸️ | Backend已实现T-011，当前使用本地规则引擎降级 |

#### 等待 news-service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 新闻情报获取 | `GET /api/v1/intelligence/{code}` | ⏸️ | Backend已预留接口，等待News Service实现 |
| 新闻推送订阅 | `news:intelligence:extracted` 事件 | ⏸️ | Backend事件总线已就绪，可即时消费 |

---

## 二、技术债务

### 2.1 测试完善

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| E2E测试 | P3 | 端到端测试覆盖 | 3天 |

### 2.2 性能优化

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| 数据库连接池 | P2 | 优化PostgreSQL连接池配置 | 0.5天 |
| WebSocket性能 | P3 | 支持更多并发连接 | 1天 |

---

## 三、未来规划（等待架构师要求）

### 3.1 短期（架构师要求后执行）

- [x] 完善集成测试环境（I-001）✅ 已完成
- [x] 添加API响应缓存层（G-008）✅ 已完成

### 3.2 中期（架构师要求后执行）

- [ ] 引入消息队列（RabbitMQ/Kafka）
- [ ] 添加分布式追踪（Jaeger）
- [ ] 完善Prometheus业务指标
- [ ] GraphQL接口支持

### 3.3 长期（架构师要求后执行）

- [ ] 微服务拆分（Auth/Trade/AI独立服务）
- [ ] 服务网格（Istio）
- [ ] 多活架构支持

---

## 四、外部依赖跟踪

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 | 备注 |
|----------|---------|---------|---------|------|
| trading-ai-service | `ai.performance.report` 事件 | ⏸️ 等待对方 | 2026-02-12 | Backend端已就绪 |
| market-data-service | 交易状态API | ⏸️ 降级运行 | 2026-02-12 | Backend使用降级方案 |
| market-data-service | 市场规则API | ⏸️ 降级运行 | 2026-02-12 | Backend使用降级方案 |
| news-service | 情报查询API | ⏸️ 预留 | 2026-02-12 | 联调阶段可选 |
| news-service | 新闻事件 | ✅ 就绪 | 2026-02-12 | Backend事件总线已就绪 |

---

## 五、最近更新记录

| 日期 | 更新内容 | 更新人 |
|------|---------|--------|
| 2026-02-13 | **开发收尾校验完成**：校验所有已完成工作已持久化到文档，修复TODO中过期标记，文档与实际代码状态一致 | Backend开发团队 |
| 2026-02-13 | **完成集成测试环境(I-001)**：docker-compose.test.yml、一键启动脚本、测试文档 | Backend开发团队 |
| 2026-02-13 | **完成缓存一致性保障(G-008)**：GuestCacheService实现，缓存穿透防护，删除同步清缓存 | Backend开发团队 |
| 2026-02-13 | **完成热股票列表API用户活动数据收集(B-005)**：StockActivityTracker实现，WebSocket集成，Redis存储 | Backend开发团队 |
| 2026-02-13 | **完成热股票列表定时更新任务(B-006)**：每30秒自动更新，应用生命周期集成 | Backend开发团队 |
| 2026-02-13 | **完成游客数据PostgreSQL化改造**：G-001~G-007全部完成（测试先行），含GuestServicePostgreSQL、GuestCleanupService | Backend开发团队 |
| 2026-02-13 | **测试代码量超过实现代码量**：GuestServicePostgreSQL.test.js（50+测试）确保事务安全和账户安全 | Backend开发团队 |
| 2026-02-13 | **新增游客数据PostgreSQL化改造任务**：G-001~G-010，含数据库设计、服务重构、定时清理、防误删机制 | 首席架构师 |
| 2026-02-13 | **新增游客接口**：持仓、交易记录、绩效、余额查询；AI账户上限2→3；支持删除后重建（Redis版，待重构） | 首席架构师 |
| 2026-02-13 | 大幅精简TODO.md，已完成内容移至HAVE_DONE.md | 首席架构师 |
| 2026-02-12 | 联调冲刺完成，O3-001~O3-004、T-015、T-011、O6-003、O6-004完成 | Backend开发团队 |
| 2026-02-11 | 重构TODO.md，创建HAVE_DONE.md | 首席架构师 |

---

## 六、文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 已完成功能 | `./HAVE_DONE.md` | 已完成功能与架构师评价（含详细实现） |
| 测试脚本 | `./TEST_SCRIPTS.md` | 测试脚本功能说明与索引 |
| 测试源码 | `../../../backend/tests/` | 单元测试和集成测试代码 |

---

*文档版本: v3.0（精简版）*
*最后更新: 2026-02-13*
*维护者: 首席架构师*

**提示：已完成内容的详细实现请查阅 [HAVE_DONE.md](./HAVE_DONE.md)**
