# Local 形态架构设计

本文档定义 Local 版本的技术架构、模块设计和演进策略。

> **定位**：Local = FastAPI + Vue 3 + SQLite 的本地自用版
> **目标**：功能对标 Full，验证所有技术点，无多用户支持

---

## 目录

- [1. 架构概览](#1-架构概览)
- [2. 技术栈选型](#2-技术栈选型)
- [3. 后端架构](#3-后端架构)
- [4. 前端架构](#4-前端架构)
- [5. 数据流设计](#5-数据流设计)
- [6. 模块边界](#6-模块边界)
- [7. 演进策略](#7-演进策略)

---

## 1. 架构概览

### 1.1 产品形态

```
用户执行: python local.py
           │
           ▼
    ┌──────────────┐
    │  自动打开浏览器 │
    └──────────────┘
           │
           ▼
    ┌─────────────────────────────────────┐
    │         Local AI Trading Platform    │
    │              http://localhost:8000   │
    ├─────────────────────────────────────┤
    │  Frontend (Vue 3 + Vite)            │
    │  - 仪表盘 / AI管理 / 行情 / 交易     │
    └─────────────────────────────────────┘
                      │
                      │ HTTP / WebSocket
                      ▼
    ┌─────────────────────────────────────┐
    │  Backend (FastAPI)                   │
    │  ┌─────────┐ ┌─────────┐ ┌────────┐ │
    │  │ API层   │ │Service层│ │数据层  │ │
    │  └─────────┘ └─────────┘ └────────┘ │
    └─────────────────────────────────────┘
                      │
                      ▼
    ┌─────────────────────────────────────┐
    │  SQLite (本地存储)                   │
    │  - agents / trades / positions      │
    └─────────────────────────────────────┘
```

### 1.2 核心设计原则

| 原则 | 说明 |
|------|------|
| **单体优先** | 单进程部署，减少运维复杂度 |
| **模块化边界** | 代码层面清晰分层，便于后续拆分微服务 |
| **复用 Legacy** | 业务逻辑从 v0.9 迁移，仅换框架不换逻辑 |
| **实时交互** | WebSocket 推送实时行情，支持即时决策 |

---

## 2. 技术栈选型

### 2.1 完整技术栈

| 层级 | 技术 | 版本 | 选型理由 |
|------|------|------|---------|
| **后端框架** | FastAPI | ^0.104 | 异步原生、自动生成 OpenAPI、类型提示友好 |
| **前端框架** | Vue 3 | ^3.3 | 组合式 API 灵活，组件可向 Full 复用 |
| **构建工具** | Vite | ^5.0 | 快速 HMR，与 Vue 3 生态深度整合 |
| **状态管理** | Pinia | ^2.1 | 类型安全，Vue DevTools 支持 |
| **数据库** | SQLite | 3.x | 本地零配置，单文件存储 |
| **ORM** | SQLAlchemy | ^2.0 | 异步支持，与 FastAPI 配合良好 |
| **实时通信** | WebSocket | native | FastAPI 原生支持，轻量高效 |
| **HTTP 客户端** | Axios | ^1.6 | 拦截器、并发控制成熟 |
| **图表库** | ECharts | ^5.4 | 功能全面，Vue 封装成熟 |

### 2.2 与 Full 形态的演进关系

```
Local（当前）                          Full（演进目标）
├─ FastAPI ────────────────────────────┤
│  ├─ api/ ──────────────────────────────→  api-gateway (Go)
│  ├─ services/ ─────────────────────────→  独立微服务
│  │   ├─ market_collector.py ────────────→  market-data-service (Python)
│  │   ├─ ai_adapter.py ─────────────────→  trading-ai-service (Python)
│  │   ├─ news_collector.py ──────────────→  news-service (Python)
│  │   └─ trading_engine.py ──────────────→  trading-service (Go)
│  └─ models/ ───────────────────────────→  shared-domain (Go/Python)
├─ Vue 3 ──────────────────────────────→  复用前端组件
└─ SQLite ─────────────────────────────→  PostgreSQL + TimescaleDB
```

**演进保障**：
- Local 阶段 `services/` 层按微服务边界组织
- Full 阶段服务拆分 = 将 `services/` 下各模块改为 HTTP/gRPC 通信

---

## 3. 后端架构

### 3.1 目录结构

```
local/
├── cmd/
│   └── main.py                 # CLI 入口（现有，保留兼容）
├── api/                        # API 路由层（新建）
│   ├── __init__.py
│   ├── agent.py               # AI交易员管理接口
│   ├── market.py              # 行情接口（REST + WebSocket）
│   ├── news.py                # 新闻/舆论接口
│   ├── trade.py               # 交易执行接口
│   └── strategy.py            # 策略配置接口
├── services/                   # 业务逻辑层
│   ├── __init__.py
│   ├── market_collector.py    # 行情数据采集（复用 legacy）
│   ├── news_collector.py      # 新闻/舆论采集（复用 legacy）
│   ├── ai_adapter.py          # AI 模型适配器（复用 legacy）
│   └── trading_engine.py      # 交易引擎
├── core/                       # 核心领域（与三种形态共用）
│   ├── domain/
│   │   ├── models.py          # Pydantic 模型
│   │   └── enums.py           # 枚举定义
│   ├── engine/
│   │   ├── agent.py           # Agent 引擎
│   │   └── trading.py         # 交易引擎
│   └── prompts/
│       └── strategy.py        # 策略收集 Prompt
├── adapters/                   # 适配器层
│   ├── storage/
│   │   ├── interface.py       # 存储接口
│   │   └── sqlite.py          # SQLite 实现
│   └── datasource/
│       ├── interface.py       # 数据源接口
│       └── csv.py             # CSV 数据源（Local 开发用）
├── db/                         # 数据库
│   └── sqlite.py              # SQLAlchemy 配置
├── config/
│   └── local.yaml             # 本地配置
└── main.py                    # FastAPI 入口 + 自动浏览器
```

### 3.2 分层职责

| 层级 | 职责 | 示例 |
|------|------|------|
| **API 层** | HTTP 路由、请求校验、响应序列化 | `@router.post("/agents")` |
| **Service 层** | 业务逻辑编排、跨领域协调 | `create_agent()`, `execute_trade()` |
| **Core 层** | 领域模型、核心业务规则 | `AIAgent`, `Trade`, `Strategy` |
| **Adapter 层** | 外部依赖抽象（存储、数据源、AI） | `SQLiteStorage`, `DeepSeekAdapter` |

### 3.3 关键接口设计

#### AI 交易员管理

```python
# POST /api/agents
class CreateAgentRequest(BaseModel):
    name: str
    initial_capital: Decimal
    strategy: Strategy
    model_provider: str = "deepseek"  # deepseek/qwen/kimi/glm
    model_name: str = "deepseek-chat"

# GET /api/agents
# GET /api/agents/{agent_id}
# DELETE /api/agents/{agent_id}
```

#### 交易执行

```python
# POST /api/trades
class ExecuteTradeRequest(BaseModel):
    agent_id: UUID
    symbol: str           # 股票代码，如 sh000001
    action: DecisionAction  # buy/sell
    quantity: int

# GET /api/trades?agent_id=xxx
# GET /api/portfolio/{agent_id}
```

#### 实时行情（WebSocket）

```python
# WS /ws/market
# 订阅: {"action": "subscribe", "symbols": ["sh000001", "sz399001"]}
# 推送: {"symbol": "sh000001", "price": 3000.5, "timestamp": "..."}
```

---

## 4. 前端架构

### 4.1 目录结构

```
local/frontend/
├── public/                     # 静态资源
├── src/
│   ├── assets/                # 样式、图片
│   │   ├── css/
│   │   └── images/
│   ├── components/            # 组件
│   │   ├── common/            # 基础组件
│   │   │   ├── Button.vue
│   │   │   ├── Input.vue
│   │   │   └── Modal.vue
│   │   ├── charts/            # 图表组件
│   │   │   ├── LineChart.vue
│   │   │   └── BarChart.vue
│   │   └── layout/            # 布局组件
│   │       ├── Sidebar.vue
│   │       └── Header.vue
│   ├── views/                 # 页面视图
│   │   ├── Dashboard.vue      # 仪表盘（多 AI 对比）
│   │   ├── AgentCreate.vue    # 创建 AI 交易员
│   │   ├── AgentDetail.vue    # AI 详情/交易记录
│   │   ├── AgentList.vue      # AI 列表
│   │   ├── StrategyConfig.vue # 策略配置（五维度对话）
│   │   ├── MarketData.vue     # 实时行情
│   │   ├── TradePanel.vue     # 交易面板
│   │   └── Settings.vue       # 设置（API Key 配置）
│   ├── stores/                # Pinia 状态管理
│   │   ├── agent.js           # AI 交易员状态
│   │   ├── market.js          # 行情数据状态
│   │   ├── trade.js           # 交易状态
│   │   └── settings.js        # 应用设置
│   ├── api/                   # API 客户端
│   │   ├── http.js            # Axios 实例
│   │   ├── websocket.js       # WebSocket 管理
│   │   └── index.js           # API 方法封装
│   ├── utils/                 # 工具函数
│   │   ├── format.js          # 格式化（金额、百分比）
│   │   └── validate.js        # 表单校验
│   ├── router/                # Vue Router
│   │   └── index.js
│   ├── App.vue                # 根组件
│   └── main.js                # 入口
├── index.html
├── package.json
└── vite.config.js
```

### 4.2 状态管理设计

```javascript
// stores/agent.js
export const useAgentStore = defineStore('agent', {
  state: () => ({
    agents: [],           // AI 列表
    currentAgent: null,   // 当前选中的 AI
    loading: false,
  }),
  actions: {
    async fetchAgents() { /* ... */ },
    async createAgent(data) { /* ... */ },
    async deleteAgent(id) { /* ... */ },
  }
})

// stores/market.js
export const useMarketStore = defineStore('market', {
  state: () => ({
    quotes: {},           // 实时行情数据 {symbol: data}
    subscribed: [],       // 已订阅的股票
    wsConnected: false,   // WebSocket 连接状态
  }),
  actions: {
    connectWebSocket() { /* ... */ },
    subscribe(symbols) { /* ... */ },
    unsubscribe(symbols) { /* ... */ },
  }
})
```

### 4.3 路由设计

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | Dashboard | 仪表盘，多 AI 收益对比 |
| `/agents` | AgentList | AI 交易员列表 |
| `/agents/create` | AgentCreate | 创建 AI（含策略收集） |
| `/agents/:id` | AgentDetail | AI 详情、持仓、交易记录 |
| `/market` | MarketData | 实时行情面板 |
| `/trade/:agentId` | TradePanel | 交易执行面板 |
| `/settings` | Settings | API Key 配置 |

---

## 5. 数据流设计

### 5.1 核心数据流

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  数据源      │────▶│  Collector  │────▶│  WebSocket  │
│ (东方财富等) │     │ (Service层) │     │  (推送前端) │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   SQLite    │◀────│   Engine    │◀────│  用户操作    │
│  (持久化)    │     │ (交易决策)   │     │ (买入/卖出) │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│   AI 适配器  │
│ (决策请求)   │
└─────────────┘
```

### 5.2 交易执行流程

```
1. 用户发起交易请求
   POST /api/trades
   {agent_id, symbol, action, quantity}

2. API 层校验
   - 检查 agent 存在且状态正常
   - 检查交易时间（A股 09:30-11:30, 13:00-15:00）
   - 检查资金/持仓充足

3. TradingEngine 执行
   - 查询当前价格（market_collector）
   - 计算交易金额
   - 更新持仓和现金
   - 记录交易历史

4. 持久化到 SQLite
   - trades 表：插入交易记录
   - positions 表：更新持仓
   - agents 表：更新当前资金

5. 返回结果给前端
   {success: true, trade_id, realized_pnl}
```

### 5.3 AI 决策流程

```
1. 定时触发（或手动触发）
   Scheduler / 用户点击"获取决策"

2. 构建上下文
   - 当前持仓（Portfolio）
   - 策略文档（Strategy，五维度配置）
   - 市场数据（实时行情、新闻）

3. 调用 AI 适配器
   ai_adapter.decide(agent, context)

   3.1 组装 Prompt
       - 系统 Prompt（角色设定）
       - 策略 Prompt（用户五维度配置）
       - 数据 Prompt（当前市场数据）

   3.2 调用 LLM API
       - DeepSeek / 通义 / Kimi / GLM
       - 异步调用，超时处理

   3.3 解析决策结果
       - action: buy/sell/hold/watch
       - confidence: 0-1
       - reason: 决策理由
       - suggested_position_size: 建议仓位

4. 返回决策结果
   - 前端展示"内心戏"（决策理由）
   - 用户确认后执行交易
```

---

## 6. 模块边界

### 6.1 与 Full 形态的模块映射

| Local 模块 | Full 微服务 | 拆分策略 |
|------------|-------------|---------|
| `services/market_collector.py` | `market-data-service` | 直接迁移，改为 HTTP 接口 |
| `services/news_collector.py` | `news-service` | 直接迁移，改为消息队列 |
| `services/ai_adapter.py` | `trading-ai-service` | 直接迁移，负载均衡 |
| `services/trading_engine.py` | `trading-service` | 重写为 Go，保留业务逻辑 |
| `api/*` | `api-gateway` | 重写为 Go，路由转发 |
| `core/domain/*` | `shared-domain` | 复制到各服务 |

### 6.2 内部模块依赖规则

```
api/ ────────┐
             │
services/ ───┼──▶ core/domain ◀── adapters/
             │       (核心，无外部依赖)
             │
adapters/ ───┘

禁止依赖方向：
- ❌ adapters 不能依赖 services
- ❌ core 不能依赖 api/services/adapters
- ❌ services 之间不能直接调用（通过 core/domain）
```

---

## 7. 演进策略

### 7.1 Local → Full 演进检查清单

| 检查项 | Local 要求 | 验收标准 |
|--------|-----------|---------|
| 模块边界 | services/ 按职责分离 | 每个 .py 文件对应一个微服务 |
| 接口抽象 | adapters/ 接口化 | 切换实现无需修改业务代码 |
| 无本地依赖 | 配置外部化 | 环境变量 + 配置文件 |
| 日志规范 | 结构化日志 | 支持日志收集系统 |
| 健康检查 | /health 端点 | 各服务健康状态可查询 |

### 7.2 技术债务跟踪

| 债务项 | 原因 | 解决时机 |
|--------|------|---------|
| SQLite 单文件 | Local 简化 | Full 阶段换 PostgreSQL |
| 单进程部署 | Local 简化 | Full 阶段容器化 |
| 内存缓存 | Local 性能足够 | Full 阶段换 Redis |
| 同步 HTTP 调用 | Local 简化 | Full 阶段换消息队列 |

---

## 参考文档

- [PRD](../../PRD.md) - 产品需求（功能来源）
- [DELIVERY_PLAN](../../DELIVERY_PLAN.md) - 三形态边界定义
- [IMPLEMENTATION_PLAN](./IMPLEMENTATION_PLAN.md) - 详细实施规划
- [TODO](./TODO.md) - 开发任务追踪

---

*本文档最后更新：2026-03-09*
