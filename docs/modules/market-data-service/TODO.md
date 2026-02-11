# Market Data Service - 开发任务追踪

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

### Phase 1: 基础功能完善

| 编号 | 任务 | 状态 | 优先级 | 说明 | 阻塞原因 |
|------|------|------|--------|------|----------|
| T-007 | WebSocket实时数据推送 | ⚠️ | P1 | 接口预留但未启用，需前端支持 | 待前端WebSocket客户端就绪 |

### Phase 5: 生产环境优化（剩余项）

| 编号 | 优化项 | 状态 | 优先级 | 说明 |
|------|--------|------|--------|------|
| P3-001 | 修复数据库测试Mock问题 | ⚠️ | P2 | 15个单元测试因MockPool配置失败，非功能缺陷 |
| P3-002 | 测试导入路径统一 | ⚠️ | P3 | 统一使用`data_service`或`src.data_service` |
| P3-003 | Pydantic v2迁移 | ⚠️ | P3 | 迁移`class Config`到`ConfigDict`消除弃用警告 |

---

## 二、阻塞任务（需其他服务跟进）

### 2.1 等待 Backend 服务

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 行情数据主动推送 | Backend WebSocket | ⏸️ | Data Service 主动推送行情到 Backend，减少轮询 |
| 统一事件总线接入 | Backend Redis Streams | ⏸️ | 发布`market:quote:updated`事件到统一事件总线 |

### 2.2 等待 AI Service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| AI行情订阅接口 | AI Service需求确认 | ⏸️ | 支持AI Service订阅特定股票实时行情 |
| 行情-决策联动 | AI决策服务 | ⏸️ | 根据行情触发AI决策重算 |

### 2.3 等待 News Service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 异动新闻联动 | News Service事件订阅 | ⏸️ | 根据行情异动（如涨跌幅>7%）触发新闻采集 |
| 重大新闻行情推送 | News Service事件发布 | ⏸️ | 重大新闻发布时推送相关股票行情 |

---

## 三、技术债务

### 3.1 代码优化

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| router.py 代码拆分 | P3 | 文件1104行，考虑拆分为 router/strategy/metrics 三个模块 | 4小时 |
| 硬编码值提取 | P3 | 健康检查阈值（如10次错误）提取到配置 | 2小时 |
| 异常类细化 | P3 | 细分DataSourceError为网络/解析/限流等子类 | 3小时 |

### 3.2 测试完善

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| 集成测试覆盖 | P2 | 测试真实数据源连接（需隔离环境） | 8小时 |
| 性能测试基准 | P3 | 建立批量查询性能基准测试 | 4小时 |
| 压力测试 | P3 | 模拟高并发场景测试 | 6小时 |

---

## 四、未来规划（与架构演进相关）

### 4.1 短期（1-2周）

- [ ] 修复数据库测试Mock问题
- [ ] 统一测试导入路径
- [ ] 启用WebSocket实时推送（需前端配合）

### 4.2 中期（1-2月）

- [ ] 接入统一事件总线（Redis Streams）
- [ ] 实现数据归档策略（冷数据自动归档到S3）
- [ ] 采集任务调度器优化（Celery/APScheduler）

### 4.3 长期（3月+）

- [ ] 行情数据主动推送Backend
- [ ] AI Service数据订阅支持
- [ ] News Service联动机制

---

## 五、架构优化任务（2026-02-11新增）

### 5.1 冲突解决方案

#### 冲突1：循环依赖解决（共享Redis + 冷启动）

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C1-MD-001 | 接入健康检查SDK | ✅ | P0 | 服务启动时检查Redis和依赖服务状态 |
| C1-MD-002 | 实现降级运行模式 | ✅ | P0 | 采集器降级、数据源降级策略 |
| C1-MD-003 | 实现自动恢复机制 | ✅ | P0 | 依赖恢复后自动升级到正常采集模式 |

**实现说明**:
- 创建 `MarketDataHealthService` 类，集成健康检查SDK
- 实现 Redis 和数据源健康检查依赖
- 支持降级模式策略（`DegradedModeStrategies`）
- 自动恢复监控（每10秒检查一次）
- 15个单元测试全部通过

**相关文件**:
- `src/data_service/services/health_service.py` - 健康服务实现
- `tests/unit/services/test_health_service.py` - 健康服务测试

#### 冲突2：统一事件总线接入

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C2-MD-001 | 集成Python事件总线SDK | ✅ | P0 | 使用SDK发布事件到Redis Streams | 已实现 MarketDataEventPublisher 类 |
| C3-001 | 发布实时行情事件 | ✅ | P0 | 每10秒发布`market:quote:realtime`事件 | 已实现 publish_quote 方法 |
| C3-001B | 发布价格异动事件 | ✅ | P0 | 涨跌幅>7%时发布`market:alert:price_move` | 已实现 check_and_publish_price_alert 方法 |
| C3-001C | 发布技术指标事件 | ✅ | P1 | 技术指标更新时发布`market:indicator:updated` | 已实现 publish_indicator_update 方法 |
| C2-MD-002 | 配置生产者确认 | ✅ | P1 | 确保消息成功写入Redis | 已实现 get_stream_info 和 message ID 返回 |

**阻塞状态**: 依赖 [infra/TODO.md](../infra/TODO.md) C2-001（Python SDK）

#### 冲突6：广度查询支持

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C6-007 | 创建板块/行业/概念映射表 | 🔲 | P1 | 股票分类映射数据初始化 |
| C6-004 | 实现板块行情查询 | 🔲 | P1 | `GET /api/v1/market/sector/{sector}/quotes` |
| C6-005 | 实现行业行情查询 | 🔲 | P1 | `GET /api/v1/market/industry/{industry}/quotes` |
| C6-006 | 实现指数成分股查询 | 🔲 | P1 | `GET /api/v1/market/index/{index}/components` |
| C6-008 | 分页和缓存优化 | 🔲 | P2 | 大数据量分页，Redis缓存5分钟 |

**阻塞状态**: C6-007 阻塞 C6-004~C6-006

#### 优化6：Miniprogram数据流优化

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| O6-001 | 开放公开WebSocket | ✅ | P0 | `wss://market-data/ws/public/quotes`，无需认证 | 已实现 PublicWebSocketManager 类 |
| O6-002 | 实现股票订阅管理 | ✅ | P0 | 支持订阅/取消订阅特定股票代码 | 已实现 subscribe/unsubscribe 方法 |
| O6-008 | WebSocket限流保护 | ✅ | P1 | 单个连接订阅上限50只股票 | MAX_SUBSCRIPTIONS_PER_CONNECTION = 50 |

**实现说明**:
- 创建 `PublicWebSocketManager` 类，支持公开WebSocket连接（无需JWT认证）
- 实现股票订阅管理：subscribe、unsubscribe、批量订阅接口
- WebSocket限流保护：单个连接最多订阅50只股票，超限返回错误
- 支持实时行情推送，每10秒广播订阅股票列表的最新行情
- 26个单元测试全部通过

**相关文件**:
- `src/data_service/api/public_websocket.py` - 公开WebSocket实现
- `src/data_service/main.py` - WebSocket端点注册 `/ws/public/quotes`
- `tests/unit/api/test_public_websocket.py` - WebSocket测试

**阻塞状态**: 无阻塞，可独立开发

---

## 六、外部依赖跟踪

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 |
|----------|---------|---------|---------|
| Backend | WebSocket服务端 | 🔲 未开始 | - |
| Backend | Redis Streams事件总线 | 🔲 未开始 | - |
| AI Service | 行情订阅需求确认 | 🔲 未确认 | - |
| News Service | 事件订阅机制 | 🔲 未开始 | - |
| Frontend | WebSocket客户端 | 🔲 未开始 | - |

---

## 六、最近更新记录

| 日期 | 更新内容 | 更新人 |
|------|---------|--------|
| 2026-02-11 | 重构TODO.md，将已完成内容移至HAVE_DONE.md | 首席架构师 |
| 2026-02-10 | 更新Phase 5优化进度，标记P0-001~P2-001为完成 | 开发团队 |
| 2026-02-09 | 完成T-010性能优化 | 开发团队 |
| 2026-02-08 | 完成数据降级策略和动态权重调整 | 开发团队 |

---

*文档版本: v2.0（精简版）*
*最后更新: 2026-02-11*
*维护者: 首席架构师*

**提示：已完成功能详情和代码审查报告请查阅 [HAVE_DONE.md](./HAVE_DONE.md)**
