# 多模块并行开发执行计划

> 本计划基于阻塞项复核结果制定，旨在最大化并行开发效率，减少阻塞等待时间
> 生成日期：2026-02-12
> 版本：v1.0

---

## 一、执行策略概述

### 1.1 核心原则

1. **关键路径优先**：优先完成解锁最多下游任务的工作
2. **并行最大化**：识别无依赖的任务并行开发
3. **阻塞最小化**：按联调链顺序安排任务，避免等待
4. **快速验证**：每阶段完成后立即联调验证

### 1.2 开发团队配置建议

| 团队 | 负责模块 | 人数建议 | 当前优先级 | 说明 |
|------|---------|---------|-----------|------|
| Backend团队 | Backend (Node.js) | 2-3人 | P0（最高） | API网关，承载Miniprogram全部流量 |
| Python团队 | Market Data + News Service + Trading AI | 3-4人 | P0 | 事件总线联调 |
| **Miniprogram团队** | **Miniprogram** | **2人** | **P0（最高）** | **唯一C端用户入口，优先保障** |
| **Frontend团队** | **Frontend** | **1人** | **⏸️ 暂停** | **联调阶段暂停，延后至Miniprogram上线后** |

---

## 二、分阶段执行计划

### 阶段0：基础设施就绪（已完成 ✅）

| 任务 | 状态 | 影响 |
|------|------|------|
| C2-001 Python SDK | ✅ 完成 | 解锁Python服务事件总线接入 |
| C2-002 Node.js SDK | ✅ 完成 | 解锁Backend事件总线接入 |
| C1-003 健康检查SDK | ✅ 完成 | 解锁各服务健康检查功能 |
| O4-001~005 Redis部署 | ✅ 完成 | 解锁共享Redis使用 |

**结论**：基础设施已就绪，各服务可开始接入。

---

### 阶段1：Backend三层API + 事件总线联调（第1周，最高优先级）

#### 1.1 Backend团队任务（可立即开始，无阻塞）

| 优先级 | 任务 | 工时 | 解锁内容 | 开发要求 |
|--------|------|------|---------|----------|
| P0 | C1-BE-001~003 健康检查SDK | 1天 | Backend自身稳定性 | 集成infra/health-check SDK |
| P0 | O3-001~004 三层API架构 | 2天 | **Miniprogram全部7个阻塞任务** | 实现/public、/guest、/api路由分层 |
| P0 | O3-005 微信登录API | 1天 | Miniprogram登录功能 | 微信jscode2session换取token |
| P0 | O6-003~004 收益接口+缓存 | 1.5天 | Miniprogram收益功能 | 含持仓成本计算，5秒缓存 |
| P1 | C2-BE事件消费者扩展 | 0.5天 | 接收Market Data事件 | 添加行情/异动事件订阅 |

**阶段产出**：
- Backend公开API层就绪
- Miniprogram可恢复开发
- Backend可接收Market Data事件

#### 1.2 Market Data团队任务（与Backend并行）

| 优先级 | 任务 | 工时 | 解锁内容 | 开发要求 |
|--------|------|------|---------|----------|
| P1 | C3-001B 技术指标事件 | 0.5天 | Trading AI C3-003C | 发布`market:indicator:updated`事件 |
| P2 | T-007 WebSocket启用 | 1天 | Frontend实时行情 | 配合Frontend联调 |

#### 1.3 News Service团队任务（与Backend并行）

| 优先级 | 任务 | 工时 | 解锁内容 | 开发要求 |
|--------|------|------|---------|----------|
| P0 | C3-002 发布新闻情报事件 | 1天 | **Trading AI C3-003B** | 发布`news:intelligence:extracted` |
| P0 | C3-003B 订阅行情异动事件 | 0.5天 | 异动新闻联动 | 订阅`market:alert:price_move` |

#### 1.4 Trading AI团队任务（部分可并行）

| 优先级 | 任务 | 工时 | 依赖状态 | 说明 |
|--------|------|------|---------|------|
| P0 | C3-003 订阅实时行情 | 1天 | ✅ Market Data C3-001已完成 | 可立即开始开发 |
| P1 | C6-TAI-001~003 板块/行业决策 | 2天 | ✅ Market Data C6已完成 | 可立即开始开发 |
| P1 | C3-003B 订阅新闻情报 | 1天 | ⏸️ 等待News C3-002 | 阶段2开始 |

---

### 阶段2：事件总线联调链推进（第2周）

#### 2.1 联调链顺序

```
News C3-002 (发布新闻) ──► Trading AI C3-003B (订阅新闻)
                                        │
                                        ▼
Market Data C3-001B (技术指标) ──► Trading AI C3-003C
                                        │
                                        ▼
Trading AI C3-004 (发布决策) ──► Backend C3-005 (订阅决策)
                                        │
                                        ▼
Trading AI C3-006~008 (移除HTTP客户端)
```

#### 2.2 各团队任务

**News Service团队**：
- 完成C3-002，发布新闻情报事件
- 与Trading AI联调C3-003B

**Trading AI团队**：
- 完成C3-003B（订阅新闻）
- 完成C3-003C（订阅技术指标，需Market Data C3-001B）
- 完成C3-004（发布AI决策事件）
- 与Backend联调

**Backend团队**：
- 完成C3-005（订阅AI决策事件）
- 与Trading AI联调事件流转

**Market Data团队**：
- 完成C3-001B（技术指标事件）
- 配合Trading AI联调

---

### 阶段3：Miniprogram恢复开发（第2-3周）

#### 3.1 前提条件

Backend必须完成：
- ✅ O3-001~004 三层API架构
- ✅ O3-005 微信登录API
- ✅ O6-003~004 收益接口

#### 3.2 Miniprogram团队任务

| 优先级 | 任务 | 工时 | 说明 |
|--------|------|------|------|
| P0 | 排行榜数据对接 | 0.5天 | 调用Backend `/api/public/ranking` |
| P0 | 行情数据对接 | 0.5天 | 调用Backend `/api/public/market/quotes` |
| P0 | 微信登录联调 | 1天 | 真机测试微信授权流程 |
| P0 | 收益数据对接 | 1天 | 调用Backend `/api/ai-accounts/:id/performance` |
| P1 | WebSocket连接 | 1天 | 连接Market Data公开WebSocket |
| P1 | 数据合并逻辑 | 0.5天 | Pinia Store合并行情+收益数据 |

---

### 阶段4：广度查询功能集成（第3-4周）

#### 4.1 Trading AI团队任务

| 任务 | 依赖状态 | 工时 | 说明 |
|------|---------|------|------|
| C6-TAI-001 板块级决策 | ✅ Market Data C6-004完成 | 1天 | 调用板块行情接口 |
| C6-TAI-002 行业级决策 | ✅ Market Data C6-005完成 | 1天 | 调用行业行情接口 |
| C6-TAI-003 批量股票决策 | ✅ Market Data C6-006完成 | 1天 | 调用股票列表接口 |

**注意**：这些任务实际上在阶段1就可以并行开发，因为Market Data的广度查询接口已完成。

---

## 三、关键路径甘特图

```
第1周                    第2周                    第3周                    第4周
|-----------------------|-----------------------|-----------------------|-----------------------|

Backend团队:
[C1-BE健康检查][ O3三层API ][微信登录][O6收益接口]
                                           [C2-BE消费者扩展][C3-005订阅决策]

Market Data团队:
[C3-001B技术指标][配合联调]

News Service团队:
[C3-002发布新闻][C3-003B订阅异动]
                      [配合联调]

Trading AI团队:
[C3-003订阅行情][C6-TAI板块/行业/批量]
                      [C3-003B订阅新闻][C3-003C技术指标][C3-004发布决策]
                                                            [配合联调]

Miniprogram团队:
                    [等待Backend]
                                           [恢复开发:排行榜/行情/登录/收益]
                                                                   [WebSocket]
```

---

## 四、风险缓解与应急预案

### 4.1 风险识别

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Backend O3开发延期 | 中 | 高 | Miniprogram团队可先完成单元测试，准备Mock数据 |
| 事件总线联调复杂 | 中 | 中 | 每完成一个环节立即联调测试，不累积到阶段末 |
| 微信登录真机问题 | 中 | 中 | 准备测试号，提前配置AppID |
| Frontend功能暂停 | 已决策 | 低 | Frontend不参与联调，专注Miniprogram |

### 4.2 应急预案

**如果Backend O3延期**：
1. Miniprogram团队使用现有Mock数据继续开发UI
2. 准备Mock Server模拟Backend响应
3. 一旦Backend就绪，快速切换联调

**如果事件总线联调阻塞**：
1. 保留HTTP调用作为fallback
2. 事件总线和HTTP并行运行
3. 逐步切换，不一次性全量迁移

---

## 五、每日站会检查清单

### 5.1 Backend团队

- [ ] O3-001~004三层API进度
- [ ] 微信登录API配置状态
- [ ] O6收益接口缓存策略
- [ ] 事件总线消费者接入状态

### 5.2 Python团队（Market Data/News/Trading AI）

- [ ] C3-001B技术指标事件进度
- [ ] C3-002新闻情报事件进度
- [ ] C3-003实时行情订阅联调状态
- [ ] C6-TAI板块/行业决策进度

### 5.3 Miniprogram团队

- [ ] Backend API就绪状态检查
- [ ] 单元测试补充进度
- [ ] Mock数据准备状态

---

## 六、里程碑定义

### Milestone 1：Backend API就绪（第1周末）

**标准**：
- O3-001~004 三层API架构完成
- O3-005 微信登录API完成
- O6-003~004 收益接口完成
- 所有接口通过单元测试

**产出**：
- Miniprogram可恢复开发
- Backend可接收Market Data事件

### Milestone 2：事件总线联调完成（第2周末）

**标准**：
- Market Data C3-001B 技术指标事件发布
- News Service C3-002 新闻情报事件发布
- Trading AI C3-003~004 事件订阅和发布完成
- Backend C3-005 决策事件订阅完成
- 端到端事件流转测试通过

**产出**：
- 所有服务通过事件总线解耦
- Trading AI可移除HTTP客户端

### Milestone 3：Miniprogram功能完成（第3周末）

**标准**：
- 排行榜/行情/登录功能联调通过
- 收益数据展示正确
- WebSocket连接正常（可选）

**产出**：
- Miniprogram达到演示就绪状态

---

## 七、联系人与升级路径

| 问题类型 | 负责人 | 升级路径 |
|---------|--------|---------|
| Backend API设计 | Backend Tech Lead | 首席架构师 |
| 事件总线技术问题 | Infra Team | 首席架构师 |
| Miniprogram UI/UX | Frontend Tech Lead | 产品经理 |
| 跨团队协作问题 | 项目经理 | CTO |

---

---

## 八、Frontend联调阶段暂停声明

### 8.1 决策背景

**决策日期**: 2026-02-12
**决策编号**: ARCH-2026-02-12-001
**决策人**: 首席架构师、产品经理

**决策内容**:
1. Frontend在此次联调阶段暂停用户界面功能开发
2. Frontend定位从"用户Web界面"调整为"监控中心 + 配置中心"
3. Miniprogram作为唯一C端用户入口，优先保障联调

**决策理由**:
- Miniprogram是项目主要用户触点（微信生态）
- Web Frontend当前仅用于开发调试，非生产必需
- 监控与配置中心需要完整的架构设计，目前尚未完成
- 避免资源分散，集中火力保障Miniprogram联调

### 8.2 Frontend后续规划

**转型定位**: 监控中心 + 配置中心
**启动时间**: Miniprogram上线且稳定后（预计2026-03后）
**目标用户**: 运维人员、管理员、开发人员

**核心功能**:
- 服务健康监控（Backend/Market Data/Trading AI/News）
- 事件总线监控（Redis Streams消息堆积、消费延迟）
- AI决策性能监控（Token消耗、响应时间、成功率）
- 行情数据质量监控（数据源可用性、延迟）
- 动态配置管理（Feature Flag、系统参数）
- AI模型配置（Prompt模板、模型参数）
- 业务规则配置（交易规则、风控阈值）

### 8.3 相关文档

- `docs/architecture/CURRENT/DECISIONS/009-FRONTEND-POSITIONING.md` - 架构决策记录
- `docs/modules/frontend/TODO.md` - Frontend开发规划（含监控中心详细设计）

---

*本文档最后更新：2026-02-12*
*架构决策：Frontend转型监控中心，联调阶段暂停用户界面开发*
*维护者：首席架构师*

**相关文档**：
- [Backend TODO](../modules/backend/TODO.md)
- [Market Data TODO](../modules/market-data-service/TODO.md)
- [News Service TODO](../modules/news-service/TODO.md)
- [Trading AI TODO](../modules/trading-ai-service/TODO.md)
- [Miniprogram TODO](../modules/miniprogram/TODO.md)
