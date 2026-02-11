# 五服务外部依赖对接需求分析报告

> 本文档记录Backend、Market Data Service、Trading AI Service、News Service、Miniprogram五个服务的外部依赖分析结果，包括发现的冲突和优化建议。
>
> **文档版本**: v1.8
> **分析日期**: 2026-02-11
> **更新日期**: 2026-02-11
> **分析依据**: 各服务TODO.md文档（位于docs/modules/服务名/TODO.md）
> **状态**:
> - ✅ 循环依赖问题：已有解决方案（方案C - Redis+冷启动）
> - ✅ 事件总线不一致：已确定采用Redis Streams，风险点已识别
> - ✅ AI对话服务归属：已确定由Backend实现
> - ✅ Miniprogram公开API：已有解决方案（三层API + 智能游客模式）
> - ✅ 接口定义重复/不一致：AI决策服务广度查询需求已确认
> - ⏳ 其他冲突：待讨论

---

## 目录

1. [依赖关系总览](#一依赖关系总览)
2. [发现的冲突与问题](#二发现的冲突与问题)
3. [优化建议](#三优化建议)
4. [优先级建议](#四优先级建议)
5. [Docker启动与冷启动方案](#五docker启动与冷启动方案)

---

## 一、依赖关系总览

### 1.1 服务间外部依赖关系图

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              服务间外部依赖关系图                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   Backend 等待的外部接口：                                                             │
│   ├── trading-ai-service: POST /api/v1/dialogue/session, /dialogue/preference        │
│   ├── market-data-service: GET /stocks/{symbol}/trading-status, WS /stock-status     │
│   └── news-service: GET /intelligence/{code}, SUBSCRIBE news:breaking               │
│                                                                                      │
│   Market Data Service 等待的外部接口：                                                 │
│   ├── Backend: WebSocket服务端, Redis Streams事件总线                                 │
│   ├── AI Service: 行情订阅需求确认                                                    │
│   └── News Service: 事件订阅/发布机制                                                 │
│                                                                                      │
│   Trading AI Service 等待的外部接口：                                                  │
│   ├── Market Data: K线数据, 批量行情, 技术指标                                        │
│   ├── News Service: 股票新闻, 情报聚合                                               │
│   └── Backend: 决策回调通知, 交易记录查询                                             │
│                                                                                      │
│   News Service 等待的外部接口：                                                        │
│   ├── Backend: Redis Streams事件总线                                                  │
│   ├── AI Service: 决策日志反馈, 情报订阅需求                                          │
│   └── Market Data: 行情异动事件                                                      │
│                                                                                      │
│   Miniprogram 等待的外部接口：                                                         │
│   └── Backend: 微信登录, 排行榜, 行情, 搜索 (均为公开API)                             │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 依赖矩阵

| 服务 \ 依赖 | Backend | Market Data | Trading AI | News | Miniprogram |
|-------------|---------|-------------|------------|------|-------------|
| **Backend** | - | 3个接口 | 2个接口 | 2个接口 | - |
| **Market Data** | 2项能力 | - | 需求确认 | 事件订阅 | - |
| **Trading AI** | 2个回调 | 3个接口 | - | 2个接口 | - |
| **News** | 1项能力 | 1个事件 | 2项能力 | - | - |
| **Miniprogram** | 4个API | - | - | - | - |

---

## 二、发现的冲突与问题

### 冲突1: 循环依赖问题 (严重) ✅ 已有解决方案

| 服务A | 等待服务B | 服务B | 等待服务A |
|-------|-----------|-------|-----------|
| Backend | Market Data 的 trading-status | Market Data | Backend 的 WebSocket/Redis Streams |
| Backend | News Service 的 intelligence | News Service | Backend 的 Redis Streams |
| Trading AI | Market Data 的 K线/行情 | Market Data | AI Service 的行情订阅 |

**问题描述**: 存在明显的双向依赖循环。Backend需要Data/News的数据接口，而Data/News又需要Backend的基础设施（WebSocket/事件总线）。

**影响**: Docker Compose无法保证启动顺序，可能导致服务启动死锁。

**解决方案**: 采用"共享Redis + 冷启动"混合方案（方案C）

**详细方案对比**: [循环依赖解决方案横向对比分析](./CIRCULAR_DEPENDENCY_SOLUTION_COMPARISON.md)

#### 方案C详细设计

**核心思路**: 部署共享Redis作为主要通信方式，同时各服务实现对Redis连接失败的冷启动容错。

```
┌─────────────────────────────────────────┐
│           共享Redis集群                  │
│  ┌─────────────────────────────────┐   │
│  │  主要通信方式：Redis Streams     │   │
│  │  • market:quote:updated         │   │
│  │  • news:breaking                │   │
│  │  • ai:decision:made             │   │
│  └─────────────────────────────────┘   │
└─────────────────┬───────────────────────┘
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Backend │ │Market   │ │Trading  │
│         │ │Data     │ │AI       │
│ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │
│ │降级 │ │ │ │降级 │ │ │ │降级 │ │
│ │模式 │ │ │ │模式 │ │ │ │模式 │ │
│ └─────┘ │ │ └─────┘ │ │ └─────┘ │
└─────────┘ └─────────┘ └─────────┘

通信：主要走Redis
容错：Redis不可用时进入降级模式
```

**关键优势**:
1. **风险最低** - Redis故障时有降级保护，不会导致系统崩溃
2. **性能最优** - 主要通信走Redis（10ms vs HTTP 50ms）
3. **运维友好** - 通信路径清晰，问题定位容易
4. **成本可控** - 开发成本约7.5天

**实施计划**:
- 阶段一（1周）: 部署Redis，实现事件总线SDK
- 阶段二（1周）: Market Data、Trading AI、News Service接入
- 阶段三（1周）: Backend改造，移除旧的直接调用
- 阶段四（1周）: 实现降级机制（可选）

**综合评分**: 7.9/10（三种方案中最高）

---

### 冲突2: 事件总线设计方案不一致 ✅ 已有解决方案

| 服务 | 期望的事件总线方式 | 目标 |
|------|-------------------|------|
| Backend | `SUBSCRIBE news:breaking` (直接订阅News Service) | 接收突发新闻 |
| Market Data | `Backend Redis Streams` | 发布行情事件 |
| News Service | `Backend Redis Streams` | 发布新闻事件 |

**问题描述**:
- Backend期望直接订阅News Service（可能是HTTP SSE或WebSocket直连）
- 但Market Data和News Service期望Backend提供统一的Redis Streams

**解决方案**: 统一采用 **Redis Streams 事件总线**（方案C的组成部分）

**详细风险分析**: [Redis Streams事件总线风险分析](./EVENT_BUS_RISK_ANALYSIS.md)

#### 事件总线设计方案

```yaml
# 统一事件定义（Redis Streams）
Stream名称:                    发布者:           订阅者:
────────────────────────────────────────────────────────
market:quote:updated          Market Data      Backend, Trading AI
news:breaking                 News Service     Backend, Trading AI
ai:decision:made              Trading AI       Backend
ai:wakeup:queue               Backend          Trading AI
trading:trade:executed        Backend          All Services
```

#### ⚠️ 各服务必须解决的风险点

**🔴 高风险 - 必须优先解决（影响系统稳定性或成本）**

| 服务 | 风险点 | 影响 | 必须实现的缓解措施 |
|------|--------|------|-------------------|
| **Trading AI** | **Token成本爆炸** | 无防抖时¥5184/天 | **决策防抖机制**：同一股票5分钟内只触发一次决策，预计节省90%成本 |
| **Backend** | **事件风暴过载** | 大盘异动时消息量激增10倍，系统崩溃 | **限流保护**：消息堆积超过1000条时触发限流，优先处理关键股票 |
| **Market Data** | **Redis性能瓶颈** | 高频写入导致内存溢出 | **批量发布**：将10秒内300条行情合并为1条批量消息；**MAXLEN限制**：Stream保留最近10000条 |

**🟡 中风险 - 建议解决（影响用户体验或数据一致性）**

| 服务 | 风险点 | 影响 | 建议实现的缓解措施 |
|------|--------|------|-------------------|
| **Trading AI** | **消息消费延迟** | 决策基于过期数据 | **并发消费者组**：多实例并行消费；**本地缓存**：缓存最近行情 |
| **News Service** | **DeepSeek处理延迟** | 突发新闻实时性受损 | **双Stream设计**：`news:raw`（低延迟）+ `news:processed`（高质量） |
| **Backend** | **消息处理失败** | AI决策与实际交易不一致 | **幂等处理**：基于decision_id去重；**对账机制**：定时修正不一致 |
| **Backend** | **消费者组管理复杂** | 消费偏移、Pending消息处理 | **统一SDK**：封装消费者组管理；**自动ACK超时重处理** |

**🟢 低风险 - 可选优化**

| 服务 | 风险点 | 影响 | 优化措施 |
|------|--------|------|----------|
| News Service | 新闻热度评估不准确 | 重要新闻被过滤 | 人工审核+模型评分结合 |
| Market Data | 消息丢失 | 行情断档 | 本地缓存最近N条，失败重试 |
| Trading AI | 决策结果重复发布 | 重复交易 | 决策消息包含唯一ID |

#### 成本与性能数据

| 指标 | 数值 | 评估 |
|------|------|------|
| **发布到消费延迟** | 2-7ms | ✅ 优秀（远低于5秒要求） |
| **理论吞吐量** | 30000 msg/s | ✅ 足够（需求仅300 msg/s） |
| **Redis内存增长** | 1.3GB/天 | ⚠️ 需配置MAXLEN清理 |
| **Token成本（无防抖）** | ¥5184/天 | 🔴 必须优化 |
| **Token成本（5分钟防抖）** | ¥518/天 | ✅ 节省90% |

---

### 冲突3: AI Service 双向依赖过多 ✅ 已有详细方案

**问题描述**: AI Service与Market Data、News Service、Backend形成3个双向依赖环，违背"数据主权"原则，导致启动死锁风险。

**当前依赖关系**:
```
Trading AI Service 等待:
├── Market Data: 行情数据 (输入)
├── News Service: 新闻情报 (输入)
└── Backend: 决策回调 (输出)

同时其他服务等待AI Service:
├── Market Data 等待 AI: 行情订阅需求、决策联动
├── News Service 等待 AI: 决策反馈、情报订阅
```

**解决方案**: **基于事件总线的完全解耦**

**目标架构**:
```
                    ┌─────────────────┐
                    │   Redis Streams │ ◄──── 统一事件总线
                    │   (事件中心)     │
                    └────────┬────────┘
                             │
        ┌────────────────────┼──────────────────────┐
        │                    │                      │
        ▼                    ▼                      ▼
   ┌──────────┐       ┌──────────┐          ┌──────────┐
   │ Market   │       │  News    │          │ Trading  │
   │ Data     │       │ Service  │          │ AI       │
   │ 发布行情  │       │ 发布新闻  │          │ 订阅消费  │
   └──────────┘       └──────────┘          │ 发布决策  │
                                             └────┬─────┘
                                                  │
                                                  ▼
                                           ┌──────────┐
                                           │ Backend  │
                                           │ 订阅决策  │
                                           │ 执行交易  │
                                           └──────────┘
```

**关键改进**:
| 维度 | 当前（双向依赖） | 目标（事件驱动） |
|------|------------------|------------------|
| **服务启动** | 需要按顺序启动，易死锁 | 并行启动，启动即可运行 |
| **故障影响** | 任一服务故障影响 Trading AI | Trading AI 可降级运行 |
| **耦合度** | 3个双向依赖环 | 所有服务只依赖 Redis |
| **实时性** | 轮询延迟（5-10秒） | 事件驱动（毫秒级） |

**废弃的接口（改为事件订阅）**:
| 原接口 | 替代方案 |
|--------|----------|
| `GET /stocks/{symbol}/realtime` (Market Data) | 订阅 `market:quote:realtime` Stream |
| `GET /intelligence/{code}` (News Service) | 订阅 `news:intelligence:extracted` Stream |
| `POST /api/trades` (Backend 同步调用) | 发布 `ai:decision:made` 事件 |

**核心事件定义**:
```yaml
# Market Data 发布
market:quote:realtime:    # 实时行情
market:alert:price_move:  # 价格异动

# News Service 发布
news:intelligence:extracted:  # 新闻情报
news:sentiment:changed:       # 情感变化

# Trading AI 发布
ai:decision:made:         # AI决策
ai:performance:report:    # 绩效报告

# Backend 发布
backend:account:updated:  # 账户更新
backend:trade:executed:   # 交易执行
```

**实施计划**: 6个Phase，总计16天（约3周）
- Phase 1: 基础设施（Redis + SDK）- 3天
- Phase 2: Market Data改造 - 2天
- Phase 3: News Service改造 - 2天
- Phase 4: Trading AI改造 - 4天
- Phase 5: Backend改造 - 2天
- Phase 6: 联调测试 - 3天

**详细设计文档**: [AI Service双向依赖解耦设计](./AI_SERVICE_DECOUPLING_DESIGN.md)

**包含内容**:
- 完整的双向依赖分析（3个依赖环详细拆解）
- 事件总线设计（6个Stream的消息Schema）
- 数据流重新设计（行情、新闻、决策三流分离）
- 代码实现示例（Python SDK）
- 风险缓解策略（降级方案、监控指标）

---

### 冲突4: Backend对AI对话接口的需求与架构设计分歧 ✅ 已有解决方案

| 需求方 | 需求接口 | 接口用途 |
|--------|----------|----------|
| Backend | `POST /api/v1/dialogue/session` | AI对话会话 |
| Backend | `POST /api/v1/dialogue/preference` | 投资偏好提取 |

**问题描述**:
- Backend期望Trading AI Service提供对话接口
- 但根据《六服务架构详细设计方案》(DETAILED_SERVICE_ARCHITECTURE.md)，AI对话应通过Backend实现
- Trading AI Service的职责是"交易决策"，不是"对话生成"

**解决方案**: **AI对话功能由Backend实现**（方案B）

**详细分析**: [AI对话服务职责划分分析](./AI_DIALOGUE_SERVICE_DESIGN.md)

#### 决策理由

1. **避免循环依赖**（最关键）
   - 如果对话放在Trading AI，它需要查询Backend的AI账户信息
   - 同时Backend又需要调用Trading AI进行对话
   - 形成Backend ↔ Trading AI循环依赖

2. **服务边界清晰**
   - **Trading AI Service**: 专注于交易决策（输入行情+新闻，输出交易决策）
   - **Backend**: 负责用户交互（对话、账户管理、交易执行）
   - 符合"领域服务"与"API网关"的分层原则

3. **数据主权对齐**
   - AI账户信息、对话记录、投资画像都属于用户交互数据
   - 理应由Backend管理
   - 交易决策才是Trading AI的核心职责

#### Backend需要实现的接口

```typescript
// 1. 创建对话会话
POST /api/ai-accounts/{id}/dialogue/session
Response: { session_id, welcome_message, max_rounds }

// 2. 对话消息（SSE流式）
POST /api/ai-accounts/{id}/dialogue/message
Request: { message }
Response: SSE Stream { type, content, round_count, extracted_preference }

// 3. 提取投资画像，激活账户
POST /api/ai-accounts/{id}/finalize
Response: { prompt, user_profile, status }
```

#### 对话限制配置

| 限制项 | 数值 | 说明 |
|--------|------|------|
| 最大轮数 | 10轮 | 防止对话过长 |
| 每轮最大Token | 500 | 控制成本 |
| 会话有效期 | 1小时 | Redis TTL |
| 消息最小间隔 | 1秒 | 防刷屏 |

#### 与Trading AI Service的关系

```
Frontend ◄──► Backend ◄──► DeepSeek (对话生成)
                  │
                  ▼
           PostgreSQL (对话记录、画像)
                  │
                  ▼
        Trading AI Service (仅用于交易决策)
```

**注意**: Trading AI Service不再提供对话接口，专注于交易决策API。

---

### 冲突5: Miniprogram公开API与Backend现有架构的冲突 ✅ 已有解决方案

| Miniprogram需求 | 问题描述 |
|-----------------|----------|
| `GET /api/ranking/:period` (无需认证) | Backend当前API都需要JWT认证 |
| `GET /api/market/quotes` (无需认证) | 需要开放公开访问 |
| `GET /api/market/search` (无需认证) | 需要开放公开访问 |
| 游客模式支持 | 用户无需授权即可体验80%功能 |

**问题描述**: Miniprogram支持游客模式，需要公开API。但Backend当前设计可能默认全部需要认证。同时需要支持智能游客模式：未创建AI账户24h清理，已创建AI账户72h清理。

**解决方案**: **三层API架构 + 智能游客模式**

**详细设计方案**: [微信小程序游客模式设计](./MINIPROGRAM_GUEST_MODE_DESIGN.md)

#### 三层API架构

```yaml
# 🔓 公开API（完全无限制）
GET  /api/public/market/quotes      # 行情列表
GET  /api/public/market/search      # 股票搜索
GET  /api/public/ranking/:period    # 排行榜

# 👤 游客API（需要游客Token，智能过期：24h或72h）
POST /api/guest/auth/token          # 获取游客令牌
POST /api/guest/ai-accounts         # 创建临时AI（限2个）
POST /api/guest/ai-accounts/:id/chat # AI对话（限10轮）

# 🔐 认证API（需要JWT）
POST /api/auth/wechat-login         # 微信登录
POST /api/ai-accounts               # 创建正式AI
POST /api/trades                    # 执行交易
```

#### 智能过期策略

| 用户状态 | Token有效期 | 清理时间 | 说明 |
|----------|-------------|----------|------|
| **未创建AI账户** | 24小时 | 24小时无访问后清理 | 纯浏览用户，快速回收资源 |
| **已创建AI账户** | 72小时 | 72小时无访问后清理 | 深度体验用户，延长保留期 |

**技术实现**:
- 使用 `openid` 作为游客标识（`wx.login` 无需授权）
- 创建AI账户后调用 `extend_guest_expiry()` 延长至72h
- 每小时执行清理任务，根据 `has_ai_account` 字段判断
- 每次访问刷新 `last_activity_at`

#### Backend需要实现的关键功能

1. **公开API白名单**：`/api/public/*` 免JWT认证
2. **游客认证体系**：动态过期时间（24h/72h）
3. **智能清理机制**：根据用户行为决定保留时长
4. **数据迁移**：游客数据绑定到正式用户

---

### 冲突6: 接口定义重复/不一致 ✅ 已有解决方案

**原始问题**：存在多个服务定义了相似但不同的接口

| 功能 | Backend期望 | Trading AI期望 | 状态 |
|------|-------------|----------------|------|
| 新闻情报 | `GET /intelligence/{code}` | `POST /news/stocks` | ✅ 已有批量接口 |
| 行情数据 | `GET /stocks/{symbol}/trading-status` | `POST /stocks/realtime` | ✅ Market Data已定义两者 |

**深化需求**：AI决策服务需要"广度查询"能力

**解决方案**: **AI决策服务广度查询需求确认文档**

**详细需求文档**: [AI决策服务广度查询需求确认](./AI_DECISION_BREADTH_QUERY_REQUIREMENTS.md)

#### 核心需求：一次调用，广度数据

AI决策服务需要以下查询能力：

**News Service 需要支持**：
| 查询维度 | 说明 | 状态 |
|----------|------|------|
| 单股票查询 | `GET /intelligence/{code}` | ✅ 已实现 |
| 批量股票查询 | `POST /intelligence/batch` | ✅ 已实现 |
| **板块查询** | 按板块名称返回所有相关股票情报 | ⚠️ 待确认/优化 |
| **行业查询** | 按行业名称返回所有相关股票情报 | ⚠️ 待确认/优化 |
| **概念查询** | 按概念名称返回所有相关股票情报 | ⚠️ 待确认/优化 |
| **舆情聚合** | 微博、论坛数据已包含 | ✅ 已实现 |

**Market Data Service 需要支持**：
| 查询维度 | 说明 | 状态 |
|----------|------|------|
| 单股票行情 | `GET /stocks/{symbol}` | ✅ 已实现 |
| 批量股票行情 | `POST /stocks/realtime` (100只/批) | ✅ 已实现 |
| **板块行情** | 按板块名称返回所有股票行情 | ⚠️ 待确认/优化 |
| **行业行情** | 按行业名称返回所有股票行情 | ⚠️ 待确认/优化 |
| **指数成分股** | 按指数代码返回成分股行情 | ⚠️ 待确认/优化 |
| **技术指标** | 返回MACD/RSI等指标 | ⚠️ 待确认/优化 |

#### 关键待确认问题

两个服务需要确认：
1. 是否支持按板块/行业/概念名称查询（而非仅股票代码）？
2. 板块到股票的映射关系由谁维护？
3. 是否支持聚合统计（如板块平均涨跌幅、整体情感）？
4. 查询响应时间是否能控制在 <500ms？

#### 建议的协调方案

| 协调项 | 建议方案 |
|--------|----------|
| **板块定义标准** | 统一使用申万行业分类或同花顺概念 |
| **映射关系维护** | 两个服务共享股票分类数据表 |
| **响应时间SLA** | 都承诺 <500ms（95分位） |

#### 时间节点建议

| 里程碑 | 建议日期 |
|--------|----------|
| 需求确认完成 | 2026-02-13 |
| 优化开发完成 | 2026-02-18 |
| 联调测试完成 | 2026-02-19 |

---

## 三、优化建议

### 优化1: 统一事件总线架构 (高优先级)

建议采用统一数据平台架构文档中定义的Redis Streams方案：

```yaml
# 共享Redis配置 (所有服务共用)
Redis Streams:
  - market:quote:updated    # Data Service发布
  - news:breaking           # News Service发布
  - ai:decision:made        # AI Service发布
  - ai:wakeup:queue         # AI唤醒队列
```

所有服务通过统一SDK接入，避免点对点依赖。

---

### 优化2: 明确服务边界，消除双向依赖 (高优先级)

| 服务 | 核心职责 | 输入来源 | 输出去向 |
|------|----------|----------|----------|
| Backend | 业务编排、用户管理、交易执行 | 所有服务 | Frontend/Miniprogram |
| Market Data | 行情采集、数据存储 | 外部数据源 | 事件总线 |
| News Service | 新闻采集、情报提取 | 外部数据源 | 事件总线 |
| Trading AI | 交易决策 | 事件总线(行情+新闻) | Backend回调/事件总线 |

---

### 优化3: Miniprogram数据流优化 (混合分离方案) ✅ 已有详细方案

**问题背景**: 当前设计所有数据都经过Backend中转，Backend成为瓶颈，行情延迟500ms。

**解决方案**: **混合分离方案**

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
| **实时股价** | Market Data → 小程序直连 | 高频、公开数据、计算简单 |
| **当日涨跌幅** | Market Data → 小程序直连 | 实时性要求高 |
| **持仓总市值** | 小程序本地计算 | 股价 × 持仓量（轻量计算） |
| **累计收益率** | Backend计算后提供 | 涉及成本数据，高敏感 |
| **累计收益金额** | Backend计算后提供 | 复杂计算，需历史交易记录 |
| **收益曲线** | Backend计算后提供 | 时间序列计算复杂 |
| **排名数据** | Backend计算后提供 | 需全账户排序，计算量大 |

**方案优势**:

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| **Backend QPS** | 500/秒 | 50/秒 | **-90%** |
| **行情延迟** | 500ms | 50ms | **-90%** |
| **数据安全性** | 高 | 高 | 成本数据不暴露 |
| **实现成本** | - | 3天 | 低 |

**关键设计**:
1. **Market Data开放公开WebSocket** - 无需认证，支持股票代码订阅
2. **Backend缓存行情数据** - 5秒TTL，确保持仓列表中的当前价与收益计算一致
3. **小程序数据合并** - 成本数据(Backend) + 实时股价(Market Data) → 本地计算市值

**详细方案文档**: [Miniprogram数据流优化方案分析](./MINIPROGRAM_DATA_FLOW_OPTIMIZATION.md)

**实施步骤**:
- [ ] Phase 1: Market Data开放WebSocket公开行情推送（1天）
- [ ] Phase 2: Backend优化收益接口，缓存行情数据（1天）
- [ ] Phase 3: 小程序实现WebSocket连接和数据合并逻辑（1天）

---

### 优化4: 部署共享Redis集群 (渐进式部署策略) ✅ 已有详细方案

**问题背景**: 当前项目缺少共享Redis基础设施，这是服务间循环依赖的根源。同时需要考虑个人项目的成本约束。

**解决方案**: **渐进式Redis部署策略**

从最低成本起步，平滑过渡到企业级高可用：

```
阶段一：起步期（0-6个月）
┌─────────────┐
│  单节点     │  ◄── 个人开发/小范围测试
│  1GB内存   │      成本：¥0（本机/Docker）
│  无持久化   │      可用性：99%（单点）
└─────────────┘
       │
       ▼  用户增长，需要高可用

阶段二：成长期（6-12个月）
┌─────────────┐     ┌─────────────┐
│   Master    │◄───►│    Slave    │  ◄── 小规模生产
│   主节点    │ 同步  │   从节点    │      成本：¥50-100/月
│   2GB内存  │       │   2GB内存  │      可用性：99.9%
└──────┬──────┘     └─────────────┘
       │
  ┌────┴────┐
  │Sentinel │  自动故障转移
  │  哨兵   │
  └─────────┘
       │
       ▼  数据量增长，需要分片

阶段三：成熟期（12个月+）
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Master1 │  │ Master2 │  │ Master3 │  ◄── 大规模生产
│  Slot   │  │  Slot   │  │  Slot   │      成本：¥300-500/月
│ 0-5460  │  │ 5461-10922│ 10923-16383│     可用性：99.95%
└────┬────┘  └────┬────┘  └────┬────┘
     │            │            │
┌────┴────┐  ┌────┴────┐  ┌────┴────┐
│  Slave1 │  │  Slave2 │  │  Slave3 │
└─────────┘  └─────────┘  └─────────┘
```

**各阶段适用场景**:

| 阶段 | 用户规模 | 数据量 | QPS | 成本/月 | 触发升级条件 |
|------|----------|--------|-----|---------|--------------|
| **阶段一** | < 100人 | < 1GB | < 1000 | ¥0-50 | 起步期 |
| **阶段二** | 100-1000人 | 1-10GB | 1000-10000 | ¥50-200 | 不能容忍停机 |
| **阶段三** | 1000+人 | 10GB+ | 10000+ | ¥200-500 | 需要分片 |

**起步期最低配置（推荐当前使用）**:

```yaml
# docker-compose.yml - 起步期配置
services:
  redis:
    image: redis:7-alpine
    container_name: stock-race-redis
    command: >
      redis-server
      --maxmemory 1gb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --appendfsync everysec
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
```

**关键设计**:
- **阶段一**: 单节点Docker，足够支撑100用户，成本¥0
- **平滑迁移**: 提供阶段1→2→3的完整迁移脚本，数据不丢失
- **客户端兼容**: SDK自动适配单节点/Sentinel/Cluster模式
- **监控告警**: 每个阶段都有配套的健康检查脚本

**详细部署文档**: [Redis渐进式部署策略](./REDIS_DEPLOYMENT_STRATEGY.md)

**包含内容**:
- 三个阶段的完整Docker Compose配置
- Sentinel和Cluster的详细配置
- 平滑迁移脚本（零停机）
- 成本对比（自建 vs 云托管）
- 各阶段的运维脚本和监控方案
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # 所有服务都依赖 redis，但不互相依赖
  backend:
    depends_on:
      redis:
        condition: service_healthy

  market-data-service:
    depends_on:
      redis:
        condition: service_healthy
    # 不依赖 backend！

  trading-ai-service:
    depends_on:
      redis:
        condition: service_healthy
    # 不依赖 backend！

  news-service:
    depends_on:
      redis:
        condition: service_healthy
    # 不依赖 backend！
```

---

## 四、优先级建议

| 优先级 | 任务 | 原因 |
|--------|------|------|
| **P0** | 部署共享Redis基础设施 | 解除多个服务的阻塞状态，解决循环依赖 |
| **P0** | 明确AI对话服务实现方 | Backend或AI Service，消除架构分歧 |
| **P1** | Miniprogram数据流优化（混合分离） | 行情直连Market Data，Backend负载降低90% |
| **P1** | Market Data开放公开行情API | Miniprogram可直接访问，降低Backend负载 |
| **P1** | Backend添加公开路由白名单 | 支持Miniprogram游客模式 |
| **P2** | 统一事件总线SDK | 简化服务间通信 |
| **P2** | 对齐情报/新闻接口定义 | 减少重复开发 |
| **P3** | 各服务实现冷启动/降级机制 | 提升系统可用性 |

---

## 五、Docker启动与冷启动方案

### 5.1 为什么需要冷启动方案

Docker Compose的`depends_on`只能控制启动顺序，**不能解决循环依赖**。如果A依赖B，B又依赖A，Docker会报错或无限等待。

### 5.2 服务启动状态机

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Starting  │────▶│  Degraded   │────▶│   Ready     │
│  (初始化中)  │     │  (降级运行)  │     │  (完全就绪)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                    依赖不可用时返回
                    降级响应/缓存数据
```

### 5.3 推荐的启动流程

#### 第一阶段：基础设施（必须顺序启动）

```bash
# 1. 先启动数据库和Redis（无依赖）
docker-compose up -d redis postgres timescaledb

# 2. 等待基础设施就绪
sleep 5
```

#### 第二阶段：领域服务（并行启动，冷启动模式）

```bash
# 3. 并行启动所有领域服务（不互相等待）
docker-compose up -d market-data-service trading-ai-service news-service

# 服务启动时会：
# - 检查Redis是否就绪
# - 如果Backend未就绪，进入降级模式（使用默认配置）
# - 后台持续重试连接Backend
```

#### 第三阶段：Backend（最后启动）

```bash
# 4. 启动Backend（聚合层）
docker-compose up -d backend

# 5. 启动前端
docker-compose up -d frontend miniprogram
```

### 5.4 各服务降级策略建议

| 服务 | 降级策略 | 完全就绪条件 |
|------|----------|--------------|
| **Backend** | 返回缓存数据/友好错误提示 | PostgreSQL + Redis |
| **Market Data** | 使用内存缓存/降低采集频率 | Redis + TimescaleDB |
| **Trading AI** | 返回默认决策/延迟处理 | Backend回调接口就绪 |
| **News Service** | 跳过新闻采集/只处理紧急新闻 | DeepSeek API可用 |
| **Miniprogram** | 展示静态页面/提示服务维护 | Backend公开API可用 |

### 5.5 健康检查端点

每个服务需要提供健康检查，用于判断"完全就绪"状态：

```python
# 各Python服务（Market Data/AI/News）
@app.get("/health")
async def health_check():
    return {
        "status": "healthy" if all_deps_ready() else "degraded",
        "dependencies": {
            "redis": redis_ready,
            "database": db_ready,
            "backend": backend_ready  # 可选
        },
        "timestamp": datetime.now()
    }
```

```javascript
// Backend
app.get('/api/health', (req, res) => {
  res.json({
    status: serviceHealthManager.isAllReady() ? 'healthy' : 'degraded',
    services: serviceHealthManager.getStatus(),
    timestamp: new Date()
  });
});
```

### 5.6 关键原则

**服务启动时从"降级模式"开始，逐步升级到"完全就绪"，而不是阻塞等待依赖。**

---

## 六、总结

当前五个服务的TODO文档中，**循环依赖**和**架构设计分歧**是主要问题：

1. **Backend ↔ Data/News Service** 形成循环依赖
2. **AI Service** 与多个服务双向依赖，职责边界不清
3. **AI对话接口** 需求与架构设计文档不一致
4. **Miniprogram公开API** 需求需要Backend调整认证策略
5. **缺少共享Redis** 作为基础设施

**建议优先解决（按优先级排序）：**

**P0 - 阻塞性问题（必须立即解决）**
1. 🔴 **Trading AI实现决策防抖机制** - Token成本控制，避免¥5184/天的费用
2. 🔴 **Backend实现限流保护** - 防止事件风暴导致系统崩溃
3. 🔴 **Market Data实现批量发布** - 避免Redis性能瓶颈
4. 🔴 **部署共享Redis集群** - 基础设施，解耦循环依赖

**P1 - 重要问题（尽快解决）**
5. 🟡 **Trading AI实现并发消费者组** - 避免消息消费延迟
6. 🟡 **News Service实现双Stream设计** - 解耦DeepSeek延迟
7. 🟡 **Backend实现幂等处理** - 避免重复交易
8. ✅ **Backend实现AI对话功能** - 已确定方案，待开发

**P2 - 优化项（后续迭代）**
9. Backend支持公开API白名单
10. 各服务实现冷启动/优雅降级机制
11. 统一事件总线SDK开发

**各服务任务分配参考**：
- **Trading AI**: 决策防抖（P0）、并发消费（P1）、决策去重（P2）
- **Backend**: 限流保护（P0）、幂等处理（P1）、消费者组管理（P1）、公开API（P2）
- **Market Data**: 批量发布（P0）、Stream长度限制（P0）
- **News Service**: 双Stream设计（P1）、新闻去重（P2）
- **基础设施**: Redis Cluster部署（P0）

---

## 七、相关文档

### 方案详细对比

| 文档 | 路径 | 说明 |
|------|------|------|
| **循环依赖解决方案横向对比** | [CIRCULAR_DEPENDENCY_SOLUTION_COMPARISON.md](./CIRCULAR_DEPENDENCY_SOLUTION_COMPARISON.md) | 三种方案（纯Redis/纯冷启动/Redis+冷启动）的详细对比分析 |
| **事件总线风险分析** | [EVENT_BUS_RISK_ANALYSIS.md](./EVENT_BUS_RISK_ANALYSIS.md) | Redis Streams事件总线的风险点、成本、性能分析 |
| **AI对话服务职责划分** | [AI_DIALOGUE_SERVICE_DESIGN.md](./AI_DIALOGUE_SERVICE_DESIGN.md) | AI对话功能放在Backend还是Trading AI Service的详细分析 |
| **微信小程序游客模式设计** | [MINIPROGRAM_GUEST_MODE_DESIGN.md](./MINIPROGRAM_GUEST_MODE_DESIGN.md) | 三层API架构 + 智能过期策略（24h/72h）设计 |
| **AI决策服务广度查询需求确认** | [AI_DECISION_BREADTH_QUERY_REQUIREMENTS.md](./AI_DECISION_BREADTH_QUERY_REQUIREMENTS.md) | News Service和Market Data Service的广度数据查询需求确认 |
| **Miniprogram数据流优化方案** | [MINIPROGRAM_DATA_FLOW_OPTIMIZATION.md](./MINIPROGRAM_DATA_FLOW_OPTIMIZATION.md) | 混合分离方案：行情直连+收益后端计算详细设计 |
| **AI Service双向依赖解耦** | [AI_SERVICE_DECOUPLING_DESIGN.md](./AI_SERVICE_DECOUPLING_DESIGN.md) | 基于事件总线的完全解耦方案，消除3个双向依赖环 |
| **Redis渐进式部署策略** | [REDIS_DEPLOYMENT_STRATEGY.md](./REDIS_DEPLOYMENT_STRATEGY.md) | 从单节点到Cluster的渐进式部署，成本可控平滑扩容 |

### 架构设计参考

| 文档 | 路径 | 说明 |
|------|------|------|
| 六服务架构详细设计 | [DETAILED_SERVICE_ARCHITECTURE.md](./DETAILED_SERVICE_ARCHITECTURE.md) | 服务间调用关系、AI唤醒机制、数据分层策略 |
| 统一数据平台架构 | [UNIFIED_DATA_PLATFORM_ARCHITECTURE.md](./UNIFIED_DATA_PLATFORM_ARCHITECTURE.md) | 数据主权划分、分层存储、事件总线设计 |
| 代码结构地图 | [CODE_MAP.md](./CODE_MAP.md) | 项目文件结构、模块映射、关键文件说明 |

### 各服务TODO文档

| 服务 | 路径 | 状态 |
|------|------|------|
| Backend | [docs/modules/backend/TODO.md](../../docs/modules/backend/TODO.md) | 开发完成，待对接 |
| Market Data Service | [docs/modules/market-data-service/TODO.md](../../docs/modules/market-data-service/TODO.md) | 开发完成，待对接 |
| Trading AI Service | [docs/modules/trading-ai-service/TODO.md](../../docs/modules/trading-ai-service/TODO.md) | 开发完成，待对接 |
| News Service | [docs/modules/news-service/TODO.md](../../docs/modules/news-service/TODO.md) | 开发完成，待对接 |
| Miniprogram | [docs/modules/miniprogram/TODO.md](../../docs/modules/miniprogram/TODO.md) | 开发完成，待对接 |

---

*文档版本: v1.8*
*更新日期: 2026-02-11*
*更新内容:*
* - 添加循环依赖问题解决方案（方案C - Redis+冷启动）*
* - 添加事件总线风险分析，明确各服务风险点*
* - 添加AI对话服务职责划分方案（Backend实现）*
* - 添加Miniprogram游客模式设计方案（三层API + 智能过期策略）*
* - 添加AI决策服务广度查询需求确认（冲突6解决方案）*
* - 添加Miniprogram数据流优化方案（混合分离：行情直连+收益后端计算）*
* - 添加AI Service双向依赖解耦方案（基于事件总线）*
* - 添加Redis渐进式部署策略（从单节点到Cluster，成本可控）*
* - 添加任务分配参考*
*维护者: 首席架构师分析*
