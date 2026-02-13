# Backend 模块 - 待办任务追踪

> 本文档仅记录**未完成**和**等待其他服务跟进**的工作项。
> 已完成功能请查阅 [HAVE_DONE.md](./HAVE_DONE.md)。
> 最后更新：2026-02-13

---

## 状态图例

- 🔲 待开发
- 🔄 开发中
- ⏸️ 阻塞（依赖其他服务）
- ✅ 已完成（已移至 HAVE_DONE.md）

---

## 一、待办任务

### 1.1 集成测试环境完善

| 编号 | 任务 | 状态 | 优先级 | 说明 |
|------|------|------|--------|------|
| I-001 | 完善Docker Compose测试环境 | 🔲 | P2 | 使剩余9个集成测试可自动化运行 |

**待解决的集成测试** (依赖外部服务):
| 测试文件 | 依赖服务 |
|---------|---------|
| `service-communication.test.js` | trading-ai-service:8000, market-data-service:8001 |
| `ai-account-creation.test.js` | Backend:3001 + PostgreSQL |
| `ai-dialogue.test.js` | WebSocket 服务 |
| `ai-decision-execution.test.js` | Backend + PostgreSQL |
| `health-check.test.js` | 部分需外部服务 |

**解决方案**: 需执行 `docker-compose up -d` 启动完整环境，或使用 `docker-compose.test.yml` 创建测试专用环境。

---

### 1.2 等待其他服务实现

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

- [ ] 完善集成测试环境（I-001）
- [ ] 添加API响应缓存层

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
| 2026-02-13 | **新增游客接口**：持仓、交易记录、绩效、余额查询；AI账户上限2→3；支持删除后重建 | 首席架构师 |
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
