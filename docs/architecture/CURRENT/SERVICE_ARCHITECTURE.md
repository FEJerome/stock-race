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

---

## 新增决策：AI决策服务数据获取架构设计

**决策日期**: 2026-02-11
**决策背景**: 确定Trading AI Service如何获取新闻情报数据以支持AI决策
**最终方案**: Trading AI Service自给自足架构（事件驱动+内存缓存+按需查询）

### 问题分析

在AI决策流程中，Trading AI Service需要实时获取以下数据：
1. **新闻情报**: 与决策标的（股票/板块/行业）相关的精简情报
2. **行情数据**: 实时股价、涨跌幅等市场数据
3. **账户数据**: 持仓、交易约束等（从Backend查询）

**核心挑战**:
- 数据时效性要求高（新闻需要在几分钟内送达）
- 查询频率高（每个AI账户可能每5分钟决策一次）
- Token成本控制（需要预压缩数据，避免无效传输）

### 方案对比与选择

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **Backend唤醒+数据准备** | Backend统一控制 | Backend变厚，Node.js不适合数据聚合 | ❌ 不推荐 |
| **AI Service主动拉取** | 职责清晰 | 延迟高，需要多次HTTP调用 | ❌ 不推荐 |
| **AI Service自给自足** | Python擅长数据处理，热缓存低延迟 | AI Service较厚但合理 | ✅ **推荐** |

**选择理由**:
- Python技术栈（APScheduler、asyncio、Pandas）更适合定时调度和数据处理
- 热数据缓存在内存，决策时0延迟获取
- 单次DeepSeek调用，无二次判断
- Backend保持薄层，专注用户服务和交易执行

### 架构设计

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Trading AI Service (Python)                           │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      唤醒调度器 (Scheduler)                           │  │
│  │  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────┐  │  │
│  │  │ 定时触发      │  │ 事件触发      │  │ 手动触发                │  │  │
│  │  │ (APScheduler) │  │ (Redis Sub)   │  │ (HTTP API)              │  │  │
│  │  │ • 每5/15/60min│  │ • 行情异动    │  │ • 用户主动请求          │  │  │
│  │  │ • 账户独立调度│  │ • 突发新闻    │  │                         │  │  │
│  │  └───────┬───────┘  └───────┬───────┘  └────────────┬────────────────┘  │  │
│  │          └──────────────────┼───────────────────────┘                   │  │
│  │                             ▼                                           │  │
│  │                  ┌────────────────────┐                                 │  │
│  │                  │    决策编排器      │                                 │  │
│  │                  │  (数据聚合+压缩)   │                                 │  │
│  │                  └──────────┬─────────┘                                 │  │
│  └─────────────────────────────┼───────────────────────────────────────────┘  │
│                                ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        数据获取层                                     │  │
│  │  ┌────────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │  │
│  │  │ 热缓存(内存)   │  │ News Service │  │ Market Data Service      │  │  │
│  │  │ • 实时事件消费 │  │ • 冷数据查询 │  │ • 行情API/事件订阅       │  │  │
│  │  │ • <1ms响应     │  │ • 历史数据   │  │ • 实时行情               │  │  │
│  │  └───────┬────────┘  └──────┬───────┘  └────────────┬───────────────┘  │  │
│  │          └──────────────────┼───────────────────────┘                   │  │
│  │                             ▼                                           │  │
│  │                  ┌────────────────────┐                                 │  │
│  │                  │   数据融合引擎     │                                 │  │
│  │                  │ (热+冷+行情+持仓)  │                                 │  │
│  │                  └──────────┬─────────┘                                 │  │
│  └─────────────────────────────┼───────────────────────────────────────────┘  │
│                                ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     AI决策层 (DeepSeek)                               │  │
│  │  • 接收预压缩的完整Context                                           │  │
│  │  • 单次Token消耗，无二次查询                                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                ▼                                            │
│                    决策结果 → Backend (交易执行)                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         Backend (Node.js)                                   │
│                                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────────┐ │
│  │ 用户API编排    │  │ 交易执行       │  │ 数据服务 (供AI Service查询)    │ │
│  │ (薄层)         │  │ (接收决策结果) │  │ • 账户配置                     │ │
│  │                │  │                │  │ • 持仓数据                     │ │
│  │                │  │                │  │ • 交易历史                     │ │
│  └────────────────┘  └────────────────┘  └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 详细实现方案

#### 1. Trading AI Service 职责

**模块结构**:
```
trading_ai_service/
├── scheduler/                    # 唤醒调度器
│   ├── decision_trigger.py       # 决策触发逻辑
│   ├── timer_tasks.py            # APScheduler定时任务
│   └── event_handlers.py         # 事件处理器(行情/新闻)
├── data_aggregator/              # 数据聚合器
│   ├── news_cache.py             # 新闻热缓存(内存+Redis)
│   ├── market_cache.py           # 行情缓存
│   └── data_fusion.py            # 数据融合引擎
├── decision_engine/              # 决策引擎
│   ├── prompt_builder.py         # Prompt构建
│   └── deepseek_client.py        # DeepSeek调用
├── adapters/                     # 外部适配器
│   ├── backend_client.py         # Backend API客户端
│   ├── news_client.py            # News Service API客户端
│   └── market_client.py          # Market Data API客户端
└── models/                       # 数据模型
    ├── decision_context.py       # 决策上下文模型
    └── ai_account.py             # AI账户模型
```

**核心功能**:

##### 1.1 唤醒调度器 (Scheduler)

```python
# scheduler/decision_trigger.py

class DecisionTrigger:
    """决策触发器 - 管理所有AI账户的决策时机"""

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.news_cache = NewsHotCache()
        self.market_cache = MarketDataCache()

    def start(self):
        """启动所有触发器"""
        # 1. 定时触发（每个账户独立调度）
        self._setup_scheduled_triggers()

        # 2. 事件触发（实时）
        self._setup_event_triggers()

        self.scheduler.start()

    def _setup_scheduled_triggers(self):
        """定时触发：根据账户偏好设置频率"""
        accounts = self.get_all_active_accounts()

        for account in accounts:
            freq = account.decision_frequency  # 5min, 15min, 1hour

            self.scheduler.add_job(
                func=self.trigger_decision,
                trigger='interval',
                minutes=freq,
                args=[account.id],
                id=f"decision_{account.id}",
                replace_existing=True
            )

    def _setup_event_triggers(self):
        """事件触发：订阅Redis Streams"""
        # 行情异动触发
        self.event_consumer.subscribe(
            EventType.MARKET_ALERT_PRICE_MOVE,
            self._on_price_alert
        )

        # 突发新闻触发
        self.event_consumer.subscribe(
            EventType.NEWS_INTELLIGENCE_EXTRACTED,
            self._on_news_breaking
        )

        self.event_consumer.start()

    async def _on_price_alert(self, event: EventSchema):
        """价格异动触发决策"""
        symbol = event.payload["symbol"]
        severity = event.payload["severity"]

        # 找出关注该股票的AI账户
        accounts = await self.find_accounts_watching_stock(symbol)

        for account in accounts:
            if severity == "high":
                await self.trigger_decision(
                    account.id,
                    trigger_reason="price_alert_high",
                    urgency="immediate"
                )
            elif severity == "medium":
                await self.schedule_delayed_decision(account.id, delay=60)
```

**触发策略**:

| 触发类型 | 触发条件 | 频率控制 | 适用场景 |
|----------|----------|----------|----------|
| **定时触发** | 按账户设置的决策频率(5/15/60分钟) | 每账户独立 | 常规监控 |
| **行情异动** | 价格涨跌超过阈值(>3%/>7%) | 5分钟内去重 | 紧急响应 |
| **突发新闻** | 重大情感变化(正面/负面) | 同股票10分钟去重 | 舆情驱动 |
| **手动触发** | 用户主动请求 | 无限制 | 即时决策 |

##### 1.2 新闻热缓存 (NewsHotCache)

```python
# data_aggregator/news_cache.py

class NewsHotCache:
    """
    新闻热缓存 - 内存+Redis双层缓存

    设计目标:
    - 热点数据内存缓存，<1ms查询延迟
    - 事件驱动更新，实时同步
    - 内存LRU淘汰，Redis持久化
    """

    def __init__(self):
        self.memory_cache = {}  # {stock_code: [intelligence_list]}
        self.redis = RedisClient(db=3)
        self.max_memory_items = 1000

    async def on_intelligence_event(self, event: EventSchema):
        """实时消费情报事件，更新缓存"""
        intel = event.payload
        stock_code = intel["stock_code"]

        # 更新内存缓存
        if stock_code not in self.memory_cache:
            self.memory_cache[stock_code] = []

        self.memory_cache[stock_code].append(intel)
        self._enforce_memory_limit()  # LRU淘汰

        # 同步到Redis（持久化，多实例共享）
        await self.redis.lpush(
            f"ai:news:{stock_code}",
            json.dumps(intel),
            ttl=7200  # 2小时
        )

    def query_hot(self, stock_codes: List[str], since: datetime) -> List[Dict]:
        """查询热缓存（内存，<1ms）"""
        results = []
        for code in stock_codes:
            if code in self.memory_cache:
                recent = [
                    i for i in self.memory_cache[code]
                    if i["timestamp"] > since
                ]
                results.extend(recent)
        return results

    def _enforce_memory_limit(self):
        """LRU淘汰策略"""
        total = sum(len(v) for v in self.memory_cache.values())
        if total > self.max_memory_items:
            # 按最后访问时间淘汰
            # ...LRU实现...
            pass
```

**缓存策略**:

| 层级 | 存储 | 数据量 | 延迟 | TTL |
|------|------|--------|------|-----|
| **L1内存** | Python dict | 1000条热点 | <1ms | 运行时 |
| **L2 Redis** | Redis List | 10000条/股票 | <5ms | 2小时 |
| **L3 DB** | PostgreSQL | 全量历史 | 50-100ms | 永久 |

##### 1.3 数据融合引擎 (DataFusion)

```python
# data_aggregator/data_fusion.py

class DataFusion:
    """
    数据融合引擎 - 聚合热缓存+冷查询+行情+持仓

    输出: 压缩后的DecisionContext，直接送入DeepSeek
    """

    async def prepare_context(self, account_id: str) -> DecisionContext:
        """准备决策上下文"""

        # 1. 获取账户配置
        account = await self.backend_client.get_account(account_id)
        watched_stocks = account["watched_stocks"]
        sectors = account["preferred_sectors"]

        # 2. 查询热缓存（内存，<5ms）
        since = datetime.now() - timedelta(hours=2)
        hot_news = self.news_cache.query_hot(watched_stocks, since)

        # 3. 判断是否需要冷数据
        cold_news = []
        if len(hot_news) < 5 or self.time_span(hot_news) < 1800:
            # 冷查询：最近24小时数据
            cold_news = await self.news_client.query(
                stock_codes=watched_stocks,
                sectors=sectors,
                since=datetime.now() - timedelta(hours=24),
                limit=50
            )

        # 4. 合并+去重+排序
        all_news = self._merge_and_rank(hot_news, cold_news)

        # 5. 预压缩（减少Token消耗）
        compressed_news = self._compress_for_prompt(all_news, max_items=20)

        # 6. 获取行情（优先缓存，其次API）
        market_data = await self._get_market_data(watched_stocks)

        # 7. 获取持仓
        portfolio = await self.backend_client.get_portfolio(account_id)

        return DecisionContext(
            account_id=account_id,
            market_data=market_data,
            news_intelligence=compressed_news,
            portfolio=portfolio,
            trading_constraints=account["constraints"],
            timestamp=datetime.now()
        )

    def _compress_for_prompt(self, news_list: list, max_items: int) -> list:
        """
        预压缩新闻，严格控制Token预算

        压缩策略:
        - 按相关性和时效性排序
        - 保留关键字段：股票、摘要、情感、时间
        - 摘要截断至100字符
        """
        sorted_news = sorted(
            news_list,
            key=lambda x: (x["relevance_score"], x["timestamp"]),
            reverse=True
        )

        compressed = []
        for news in sorted_news[:max_items]:
            compressed.append({
                "stock": news["stock_code"],
                "summary": news["summary"][:100],  # 截断
                "sentiment": news["sentiment"],
                "time": news["timestamp"].strftime("%m-%d %H:%M"),
                "source": news["source"]
            })

        return compressed
```

**数据聚合流程**:

```
触发决策
    │
    ▼
┌─────────────────┐
│ 1. 查询热缓存   │ ◄── 内存，<5ms，最近2小时
│ (内存缓存)      │
└────────┬────────┘
         │
         ▼
    ┌────────────┐
    │ 数据足够?  │───是──► 跳过冷查询
    │ (>=5条)    │
    └─────┬──────┘
          │ 否
          ▼
┌─────────────────┐
│ 2. 冷数据查询   │ ◄── News Service API，50-100ms
│ (最近24小时)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. 合并+去重    │ ◄── 按股票代码去重
│ 4. 排序         │ ◄── 相关性>时效性
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. 预压缩       │ ◄── 最多20条，100字/条
│ (Token优化)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. 获取行情     │ ◄── 缓存或Market Data API
│ 7. 获取持仓     │ ◄── Backend API
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ DecisionContext │ ◄── 完整上下文
└─────────────────┘
```

##### 1.4 决策引擎 (DecisionEngine)

```python
# decision_engine/engine.py

class DecisionEngine:
    """决策引擎 - 调用DeepSeek进行AI决策"""

    async def make_decision(
        self,
        account_id: str,
        trigger_reason: str
    ) -> Decision:
        """
        执行决策

        Args:
            account_id: AI账户ID
            trigger_reason: 触发原因(定时/异动/新闻/手动)

        Returns:
            Decision: 决策结果
        """
        # 1. 聚合数据（内部完成，无外部依赖）
        context = await self.data_fusion.prepare_context(account_id)

        # 2. 构建Prompt（包含所有必要信息）
        prompt = self.prompt_builder.build(
            context=context,
            trigger_reason=trigger_reason
        )

        # 3. 调用DeepSeek（单次，数据已在prompt中）
        response = await self.deepseek.generate(
            prompt=prompt,
            max_tokens=1000,
            temperature=0.3,
            model="deepseek-chat"
        )

        # 4. 解析决策
        decision = self._parse_decision(response)

        # 5. 记录决策（用于后续反馈优化）
        await self._record_decision(account_id, decision, context)

        # 6. 通知Backend执行交易（只发结果，不带数据）
        await self.backend_client.execute_trade(
            account_id=account_id,
            decision=decision
        )

        return decision
```

#### 2. News Service 职责

**事件发布**:

```python
# News Service 发布的事件

class NewsEventPublisher:
    """新闻事件发布器"""

    async def publish_intelligence(self, intelligence: dict):
        """发布新闻情报事件"""
        await self.event_producer.publish(
            event_type=EventType.NEWS_INTELLIGENCE_EXTRACTED,
            payload={
                "stock_code": intelligence["stock_code"],
                "summary": intelligence["summary"],
                "sentiment": intelligence["sentiment"],
                "confidence": intelligence["confidence"],
                "timestamp": intelligence["timestamp"],
                "source": intelligence["source"]
            }
        )

    async def publish_hot_update(self, hot_intelligence: list):
        """发布热情报更新（批量，每2分钟）"""
        await self.event_producer.publish(
            event_type=EventType.NEWS_HOT_INTELLIGENCE_UPDATE,
            payload={
                "intelligence": hot_intelligence,  # Top 100
                "coverage": [i["stock_code"] for i in hot_intelligence],
                "timestamp": datetime.now().isoformat()
            }
        )
```

**冷查询API**:

```python
# News Service API

@app.post("/api/v1/intelligence/query")
async def query_intelligence(request: QueryRequest):
    """
    查询新闻情报（冷数据）

    供Trading AI Service在热缓存不足时调用
    """
    # 参数验证
    if len(request.stock_codes) > 50:
        raise HTTPException(400, "最多查询50只股票")

    # 数据库查询
    query = db.query(Intelligence).filter(
        Intelligence.stock_code.in_(request.stock_codes),
        Intelligence.timestamp > request.since,
        Intelligence.confidence > 0.6  # 只返回高置信度
    )

    if request.sectors:
        query = query.filter(Intelligence.sector.in_(request.sectors))

    # 排序和限制
    results = query.order_by(
        Intelligence.relevance_score.desc(),
        Intelligence.timestamp.desc()
    ).limit(request.limit).all()

    return {
        "items": [i.to_dict() for i in results],
        "total": len(results),
        "query_time": datetime.now().isoformat()
    }
```

**News Service实现清单**:

| 功能 | 实现内容 | 状态 |
|------|----------|------|
| **事件发布** | `news:intelligence:extracted` 实时发布 | 已实现 (C3-002) |
| **热情报推送** | `news:hot_intelligence_update` 每2分钟批量推送 | 待实现 |
| **冷查询API** | `POST /intelligence/query` 支持股票/板块/行业筛选 | 待实现 |
| **AI反馈订阅** | 订阅 `ai:performance:report` 优化Prompt | 已实现 (C3-003C) |

#### 3. Backend 职责

Backend保持薄层，提供数据查询API供Trading AI Service调用：

```javascript
// Backend API (Node.js)

// 1. 获取AI账户配置
GET /api/ai-accounts/:id/config
Response: {
  watched_stocks: ["000001.SZ", "600519.SH"],
  preferred_sectors: ["银行", "白酒"],
  decision_frequency: 15,  // 分钟
  trading_constraints: {
    max_position: 0.3,
    stop_loss: 0.05
  }
}

// 2. 获取持仓数据
GET /api/ai-accounts/:id/portfolio
Response: {
  holdings: [
    {symbol: "000001.SZ", quantity: 1000, avg_cost: 12.5}
  ],
  cash: 50000,
  total_value: 125000
}

// 3. 执行交易（接收AI决策结果）
POST /api/trades/execute
Request: {
  account_id: "ai-001",
  decision: {
    action: "buy|sell|hold",
    symbol: "000001.SZ",
    quantity: 500,
    reason: "技术指标突破"
  }
}
```

**Backend实现清单**:

| 功能 | 实现内容 | 状态 |
|------|----------|------|
| **账户配置查询** | 提供AI账户关注股票、偏好板块、决策频率 | 待确认 |
| **持仓数据查询** | 提供实时持仓、成本、市值 | 待确认 |
| **交易执行** | 接收AI决策，验证规则，执行交易 | 待确认 |
| **决策记录** | 记录AI决策结果用于后续分析 | 待确认 |

### 事件定义更新

新增事件类型：

```yaml
# News Service 发布
news:intelligence:extracted:     # 单条情报实时发布 (已实现)
news:hot_intelligence_update:    # 热情报批量推送 (新增)
news:sentiment:changed:          # 情感变化 (已实现)

# Trading AI Service 发布
ai:decision:made:               # AI决策完成 (已有)
ai:performance:report:          # 决策绩效报告 (已有)

# Market Data Service 发布
market:alert:price_move:        # 行情异动 (已有)
market:quote:realtime:          # 实时行情 (已有)
```

### 数据流时序图

```
Trading AI          News Service          Market Data          Backend
     │                    │                    │                  │
     │◄───────────────────┤                    │                  │
     │  subscribe         │                    │                  │
     │  news:intelligence │                    │                  │
     │  (实时事件)         │                    │                  │
     │                    │                    │                  │
     │◄───────────────────────────────────────┤                  │
     │  subscribe                              │                  │
     │  market:alert                           │                  │
     │                    │                    │                  │
     │◄──────────────────────────────────────────────────────────┤
     │  HTTP API (按需)   │                    │                  │
     │  获取账户配置/持仓  │                    │                  │
     │                    │                    │                  │
     │───────────────────►│                    │                  │
     │  POST /query       │                    │                  │
     │  (冷数据，低频)     │                    │                  │
     │                    │                    │                  │
     │────────────────────────────────────────►│                  │
     │  GET /quotes       │                    │                  │
     │  (行情，按需)       │                    │                  │
     │                    │                    │                  │
     │──────────────────────────────────────────────────────────►│
     │  POST /execute     │                    │                  │
     │  (决策结果)         │                    │                  │
```

### 性能指标目标

| 指标 | 目标值 | 测量方式 |
|------|--------|----------|
| **热缓存查询延迟** | <5ms | 内存读取时间 |
| **冷查询API延迟** | <100ms | News Service响应时间 |
| **数据聚合总时间** | <200ms | 从触发到Context就绪 |
| **DeepSeek调用** | <2000ms | AI推理时间 |
| **端到端决策延迟** | <3000ms | 触发到决策完成 |
| **内存缓存命中率** | >80% | 热数据满足决策需求比例 |

### 实施阶段

```
Week 1: News Service扩展
  □ 实现热情报批量推送 (news:hot_intelligence_update)
  □ 实现冷查询API (/intelligence/query)
  □ 单元测试

Week 2: Trading AI Service增强
  □ 实现APScheduler调度器
  □ 实现新闻热缓存 (内存+Redis)
  □ 实现数据融合引擎
  □ 单元测试

Week 3: 集成测试
  □ 事件总线联调
  □ 端到端测试
  □ 性能基准测试

Week 4: 优化上线
  □ 缓存策略调优
  □ 监控告警配置
  □ 生产部署
```

---

*更新日期: 2026-02-11*
*维护者: 首席架构师*
