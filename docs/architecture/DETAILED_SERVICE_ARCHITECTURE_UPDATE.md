# 六服务架构详细设计方案 - 架构演进更新

> 本文档记录2026-02-11架构审查后的关键决策和方案更新
>
> **更新日期**: 2026-02-11
> **状态**: 已确认，待实施

---

## 更新概览

### 已解决的架构问题

| 问题编号 | 问题描述 | 解决方案 | 状态 |
|----------|----------|----------|------|
| **Conflict-1** | 服务间循环依赖 | 共享Redis + 冷启动方案 | ✅ 已确认 |
| **Conflict-2** | 事件总线设计不一致 | 统一Redis Streams事件总线 | ✅ 已确认 |
| **Conflict-3** | AI Service双向依赖过多 | 基于事件总线的完全解耦 | ✅ 已确认 |
| **Conflict-4** | AI对话服务职责分歧 | Backend实现AI对话 | ✅ 已确认 |
| **Conflict-5** | Miniprogram公开API冲突 | 三层API + 智能游客模式 | ✅ 已确认 |
| **Conflict-6** | 接口定义重复/不一致 | AI决策服务广度查询需求确认 | ✅ 已确认 |

### 关键架构决策更新

#### 决策1: 统一事件总线架构

**决策内容**: 所有服务间通信统一采用 **Redis Streams** 事件总线

**事件定义**:
```yaml
# Market Data 发布
market:quote:realtime:     # 实时行情更新
market:alert:price_move:   # 价格异动告警
market:indicator:updated:  # 技术指标更新

# News Service 发布
news:intelligence:extracted:  # 新闻情报提取完成
news:sentiment:changed:       # 情感分析变化

# Trading AI 发布
ai:decision:made:         # AI决策完成
ai:performance:report:    # 绩效报告

# Backend 发布
backend:account:updated:  # 账户状态更新
backend:trade:executed:   # 交易执行完成
```

**设计理由**:
- 消除服务间直接HTTP调用，避免循环依赖
- 支持消费者组，实现多实例负载均衡
- 消息持久化，支持ACK机制确保不丢失
- 从轮询模式升级到事件驱动，降低延迟

**详细文档**: [EVENT_BUS_RISK_ANALYSIS.md](./EVENT_BUS_RISK_ANALYSIS.md)

---

#### 决策2: AI对话服务职责划分

**决策内容**: **AI对话功能由Backend实现**，而非Trading AI Service

**架构调整**:
```
# 调整前（有分歧）
Frontend ──► Trading AI Service ──► DeepSeek (对话)
                  │
                  ▼
            Backend (AI账户数据)

# 调整后（确认方案）
Frontend ──► Backend ──► DeepSeek (对话)
                  │
                  ▼
            Trading AI Service (仅用于交易决策)
```

**决策理由**:
1. **避免循环依赖**: Trading AI调用Backend账户数据，同时Backend调用Trading AI对话，形成循环
2. **服务边界清晰**: Trading AI专注"交易决策"，Backend负责"用户交互"
3. **数据主权对齐**: AI账户、对话记录属于用户交互数据，由Backend管理

**Backend需要实现的接口**:
```typescript
POST /api/ai-accounts/{id}/dialogue/session     // 创建对话会话
POST /api/ai-accounts/{id}/dialogue/message     // 对话消息（SSE流式）
POST /api/ai-accounts/{id}/finalize             // 提取画像，激活账户
```

**详细文档**: [AI_DIALOGUE_SERVICE_DESIGN.md](./AI_DIALOGUE_SERVICE_DESIGN.md)

---

#### 决策3: Miniprogram游客模式

**决策内容**: 实现**三层API架构 + 智能过期策略**

**API分层**:
```yaml
# 🔓 公开API（完全无限制）
GET  /api/public/market/quotes      # 行情列表
GET  /api/public/market/search      # 股票搜索
GET  /api/public/ranking/:period    # 排行榜

# 👤 游客API（需要游客Token，智能过期）
POST /api/guest/auth/token          # 获取游客令牌
POST /api/guest/ai-accounts         # 创建临时AI（限2个）
POST /api/guest/ai-accounts/:id/chat # AI对话（限10轮）

# 🔐 认证API（需要JWT）
POST /api/auth/wechat-login         # 微信登录
POST /api/ai-accounts               # 创建正式AI
POST /api/trades                    # 执行交易
```

**智能过期策略**:
| 用户状态 | Token有效期 | 清理时间 | 说明 |
|----------|-------------|----------|------|
| 未创建AI账户 | 24小时 | 24小时无访问后清理 | 纯浏览用户，快速回收资源 |
| 已创建AI账户 | 72小时 | 72小时无访问后清理 | 深度体验用户，延长保留期 |

**游客数据迁移**:
- 使用 `openid` 作为游客标识（`wx.login` 无需用户授权）
- 游客登录后，数据绑定到正式用户账号
- 已绑定数据标记 `status='bound'`，不受清理影响

**详细文档**: [MINIPROGRAM_GUEST_MODE_DESIGN.md](./MINIPROGRAM_GUEST_MODE_DESIGN.md)

---

#### 决策4: Miniprogram数据流优化（混合分离方案）

**决策内容**: 实时行情直连Market Data，收益数据由Backend计算

**数据流设计**:
```
实时行情流（高频、低计算、低敏感）
┌──────────────┐      WebSocket       ┌──────────────┐
│ Market Data  │ ───────────────────► │ Miniprogram  │
│ Service      │   10秒推送，无需认证   │ (实时展示)   │
└──────────────┘                      └──────────────┘

收益数据流（低频、高计算、高敏感）
┌──────────────┐      HTTP API        ┌──────────────┐
│   Backend    │ ◄─────────────────── │ Miniprogram  │
│ (计算收益)   │   JWT认证，按需查询   │ (查询展示)   │
└──────────────┘                      └──────────────┘
```

**数据分类处理**:
| 数据类型 | 处理方式 | 原因 |
|----------|----------|------|
| 实时股价 | Market Data → 小程序直连 | 高频、公开数据、计算简单 |
| 当日涨跌幅 | Market Data → 小程序直连 | 实时性要求高 |
| 持仓总市值 | 小程序本地计算 | 股价 × 持仓量（轻量计算） |
| 累计收益率 | Backend计算后提供 | 涉及成本数据，高敏感 |
| 累计收益金额 | Backend计算后提供 | 复杂计算，需历史交易记录 |
| 收益曲线 | Backend计算后提供 | 时间序列计算复杂 |

**优化效果**:
| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| Backend QPS | 500/秒 | 50/秒 | **-90%** |
| 行情延迟 | 500ms | 50ms | **-90%** |

**详细文档**: [MINIPROGRAM_DATA_FLOW_OPTIMIZATION.md](./MINIPROGRAM_DATA_FLOW_OPTIMIZATION.md)

---

#### 决策5: Redis渐进式部署策略

**决策内容**: 从单节点起步，平滑过渡到Cluster集群

**三阶段部署**:
```
阶段一：起步期（0-6个月）
┌─────────────┐
│  单节点     │  ◄── 个人开发/小范围测试
│  1GB内存   │      成本：¥0（本机/Docker）
│  无持久化   │      可用性：99%（单点）
└─────────────┘

阶段二：成长期（6-12个月）
┌─────────────┐     ┌─────────────┐
│   Master    │◄───►│    Slave    │  ◄── 小规模生产
│   主节点    │ 同步  │   从节点    │      成本：¥50-200/月
│   2GB内存  │       │   2GB内存  │      可用性：99.9%
└──────┬──────┘     └─────────────┘
       │
  ┌────┴────┐
  │Sentinel │  自动故障转移
  └─────────┘

阶段三：成熟期（12个月+）
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Master1 │  │ Master2 │  │ Master3 │  ◄── 大规模生产
│  Slot   │  │  Slot   │  │  Slot   │      成本：¥200-500/月
│ 0-5460  │  │ 5461-10922│ 10923-16383│     可用性：99.95%
└─────────┘  └─────────┘  └─────────┘
```

**升级触发条件**:
- 升级到阶段二: 用户 > 100人，或不能容忍停机
- 升级到阶段三: 内存 > 8GB，或QPS > 10000

**详细文档**: [REDIS_DEPLOYMENT_STRATEGY.md](./REDIS_DEPLOYMENT_STRATEGY.md)

---

#### 决策6: AI Service双向依赖解耦

**决策内容**: Trading AI Service通过事件总线消费数据，消除双向依赖

**解耦前后对比**:
```
# 解耦前（双向依赖）
Trading AI ◄──► Market Data  (行情查询 vs 订阅需求)
Trading AI ◄──► News Service (情报查询 vs 决策反馈)
Trading AI ◄──► Backend      (决策回调 vs 账户数据)

# 解耦后（事件驱动）
Trading AI ──► Redis Streams ◄── Market Data  (订阅行情)
Trading AI ──► Redis Streams ◄── News Service (订阅新闻)
Trading AI ──► Redis Streams ──► Backend      (发布决策)
```

**实施计划**: 6个Phase，总计16天
- Phase 1: 基础设施（Redis + SDK）- 3天
- Phase 2: Market Data改造 - 2天
- Phase 3: News Service改造 - 2天
- Phase 4: Trading AI改造 - 4天
- Phase 5: Backend改造 - 2天
- Phase 6: 联调测试 - 3天

**详细文档**: [AI_SERVICE_DECOUPLING_DESIGN.md](./AI_SERVICE_DECOUPLING_DESIGN.md)

---

#### 决策7: AI决策服务广度查询需求

**决策内容**: News Service和Market Data Service需要支持广度查询

**News Service查询能力**:
| 查询维度 | 当前状态 | 需求 |
|----------|----------|------|
| 单股票查询 | ✅ 已实现 | `GET /intelligence/{code}` |
| 批量股票查询 | ✅ 已实现 | `POST /intelligence/batch` |
| 板块查询 | ⚠️ 待优化 | 按板块名称返回所有相关股票情报 |
| 行业查询 | ⚠️ 待优化 | 按行业名称返回所有相关股票情报 |
| 概念查询 | ⚠️ 待优化 | 按概念名称返回所有相关股票情报 |

**Market Data Service查询能力**:
| 查询维度 | 当前状态 | 需求 |
|----------|----------|------|
| 单股票行情 | ✅ 已实现 | `GET /stocks/{symbol}` |
| 批量股票行情 | ✅ 已实现 | `POST /stocks/realtime` |
| 板块行情 | ⚠️ 待优化 | 按板块名称返回所有股票行情 |
| 行业行情 | ⚠️ 待优化 | 按行业名称返回所有股票行情 |
| 指数成分股 | ⚠️ 待优化 | 按指数代码返回成分股行情 |

**详细文档**: [AI_DECISION_BREADTH_QUERY_REQUIREMENTS.md](./AI_DECISION_BREADTH_QUERY_REQUIREMENTS.md)

---

## 实施计划更新

### 新增实施阶段

在原有实施计划基础上，新增以下阶段：

#### 阶段0: 基础设施部署（Week 0，前置）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         阶段0: 基础设施部署（新增）                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  □ 部署共享Redis集群（阶段一：单节点）                                         │
│  □ 实现事件总线SDK（统一封装Redis Streams操作）                                 │
│  □ 定义事件Schema和消息格式                                                   │
│  □ 配置监控和告警（消息堆积、消费延迟）                                        │
│                                                                              │
│  里程碑: 基础设施就绪，服务可接入事件总线                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 阶段1.5: 服务解耦改造（Week 1-2，插入）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      阶段1.5: 服务解耦改造（新增）                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  □ Market Data接入事件总线（发布行情事件）                                     │
│  □ News Service接入事件总线（发布新闻事件）                                    │
│  □ Trading AI接入事件总线（订阅行情/新闻，发布决策）                            │
│  □ Backend接入事件总线（订阅决策事件）                                         │
│  □ 移除旧的HTTP直接调用                                                        │
│                                                                              │
│  里程碑: 服务间完全解耦，基于事件总线通信                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 阶段2.5: Miniprogram架构优化（Week 2-3，插入）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   阶段2.5: Miniprogram架构优化（新增）                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  □ Backend实现三层API架构（公开/游客/认证）                                    │
│  □ 实现智能游客模式（24h/72h过期策略）                                         │
│  □ Market Data开放公开WebSocket行情接口                                        │
│  □ 小程序实现WebSocket连接和数据合并逻辑                                        │
│                                                                              │
│  里程碑: 支持游客模式，行情直连降低Backend负载                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 关键设计决策汇总（更新版）

| 决策点 | 原方案 | 更新后方案 | 理由 |
|--------|--------|------------|------|
| **服务通信** | HTTP REST + Redis Pub/Sub | **Redis Streams事件总线** | 完全解耦，支持消费者组 |
| **AI对话实现** | Trading AI Service | **Backend** | 避免循环依赖，职责清晰 |
| **Miniprogram认证** | 统一JWT认证 | **三层API（公开/游客/认证）** | 支持游客模式 |
| **Miniprogram数据流** | 全部走Backend中转 | **行情直连 + 收益后端计算** | 降低Backend负载90% |
| **Redis部署** | 直接部署Cluster | **渐进式（单节点→主从→Cluster）** | 成本可控，平滑扩容 |
| **数据查询** | 单股票查询 | **支持板块/行业/概念广度查询** | AI决策需要大范围数据 |

---

## 相关文档索引

### 架构设计文档

| 文档 | 路径 | 说明 |
|------|------|------|
| **五服务外部依赖分析** | [SERVICE_DEPENDENCY_ANALYSIS.md](./SERVICE_DEPENDENCY_ANALYSIS.md) | 主文档，包含6个冲突的完整分析 |
| **循环依赖解决方案对比** | [CIRCULAR_DEPENDENCY_SOLUTION_COMPARISON.md](./CIRCULAR_DEPENDENCY_SOLUTION_COMPARISON.md) | 三种方案详细对比 |
| **事件总线风险分析** | [EVENT_BUS_RISK_ANALYSIS.md](./EVENT_BUS_RISK_ANALYSIS.md) | 风险点、成本、性能分析 |
| **AI对话服务职责划分** | [AI_DIALOGUE_SERVICE_DESIGN.md](./AI_DIALOGUE_SERVICE_DESIGN.md) | Backend vs Trading AI对比 |
| **Miniprogram游客模式** | [MINIPROGRAM_GUEST_MODE_DESIGN.md](./MINIPROGRAM_GUEST_MODE_DESIGN.md) | 三层API + 智能过期 |
| **Miniprogram数据流优化** | [MINIPROGRAM_DATA_FLOW_OPTIMIZATION.md](./MINIPROGRAM_DATA_FLOW_OPTIMIZATION.md) | 混合分离方案 |
| **AI Service双向依赖解耦** | [AI_SERVICE_DECOUPLING_DESIGN.md](./AI_SERVICE_DECOUPLING_DESIGN.md) | 事件总线解耦详细设计 |
| **AI决策广度查询需求** | [AI_DECISION_BREADTH_QUERY_REQUIREMENTS.md](./AI_DECISION_BREADTH_QUERY_REQUIREMENTS.md) | News/Market Data查询需求 |
| **Redis渐进式部署** | [REDIS_DEPLOYMENT_STRATEGY.md](./REDIS_DEPLOYMENT_STRATEGY.md) | 从单节点到Cluster |

---

*更新日期: 2026-02-11*
*维护者: 首席架构师*
