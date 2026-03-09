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
├── services/                   # 业务逻辑层（按微服务边界组织，便于演进）
│   ├── __init__.py
│   ├── market_collector.py    # 行情数据采集 → 复用到 market-data-service
│   ├── news_collector.py      # 新闻/舆论采集 → 复用到 news-service
│   ├── ai_adapter.py          # AI 模型适配器 → 复用到 trading-ai-service
│   ├── trading_engine.py      # 交易引擎 → 参考逻辑到 trading-service (Go)
│   ├── token_tracker.py       # Token 消耗统计 → Local 特有
│   ├── promotion_service.py   # 职级晋升服务 → Local 特有
│   └── portfolio_service.py   # 收益指标计算 → 复用到 portfolio-service
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
│   └── datasource/            # 数据源适配器（完整复刻 v0.9）
│       ├── interface.py       # DataSource 抽象接口
│       ├── router.py          # DataSourceRouter 路由管理器
│       ├── csv.py             # CSV 数据源（离线测试/回测）
│       ├── sina.py            # 新浪财经数据源
│       ├── tencent.py         # 腾讯财经数据源
│       ├── eastmoney.py       # 东方财富数据源
│       ├── akshare.py         # AkShare 数据源
│       ├── baostock.py        # Baostock 数据源
│       └── tushare.py         # Tushare 数据源
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
    initial_capital: Decimal  # 用户设置，范围 1万-10亿
    strategy: Strategy
    model_provider: str = "deepseek"  # deepseek/qwen/kimi/glm
    model_name: str = "deepseek-chat"
    agent_level: AgentLevel = AgentLevel.INTERN  # 职级：实习生/经理/合伙人
    incentive_level: IncentiveLevel = IncentiveLevel.STANDARD  # 档位：标准/积极/激进

    @validator('initial_capital')
    def validate_capital(cls, v):
        MIN_CAPITAL = 10000      # 1万
        MAX_CAPITAL = 1000000000 # 10亿
        if v < MIN_CAPITAL:
            raise ValueError(f'初始资金不能低于 {MIN_CAPITAL}')
        if v > MAX_CAPITAL:
            raise ValueError(f'初始资金不能超过 {MAX_CAPITAL}，大额资金存在风险')
        return v

# 职级默认初始资金（前端表单默认值）
DEFAULT_CAPITAL_BY_LEVEL = {
    AgentLevel.INTERN: 500000,    # 实习生：50万
    AgentLevel.MANAGER: 1000000,  # 经理：100万
    AgentLevel.PARTNER: 5000000,  # 合伙人：500万
}

# GET /api/agents
# GET /api/agents/{agent_id}
# PUT /api/agents/{agent_id}/incentive  # 调整激励档位
# DELETE /api/agents/{agent_id}
```

#### Token 统计

```python
# GET /api/tokens/stats?agent_id=xxx&period=today
class TokenStatsResponse(BaseModel):
    agent_id: UUID
    period: str  # today/week/month
    input_tokens: int
    output_tokens: int
    total_cost: Decimal  # 人民币
    by_model: Dict[str, ModelTokenStats]  # 按模型统计
    by_action: Dict[str, ActionTokenStats]  # 按功能统计

# GET /api/tokens/global?period=today
class GlobalTokenStats(BaseModel):
    period: str
    total_input_tokens: int
    total_output_tokens: int
    total_cost: Decimal
    by_model: Dict[str, ModelTokenStats]
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

### 3.4 数据源架构（复刻 v0.9）

Local 形态完整复刻 v0.9 的六数据源架构，用于技术验证和 fallback 机制。

#### DataSourceRouter 设计

```python
class DataSourceRouter:
    """数据源路由器 - 管理多数据源选择、故障转移"""

    def __init__(self):
        self.sources: Dict[str, DataSource] = {
            'sina': SinaDataSource(),
            'tencent': TencentDataSource(),
            'eastmoney': EastMoneyDataSource(),
            'akshare': AkShareDataSource(),
            'baostock': BaostockDataSource(),
            'tushare': TushareDataSource(),
            'csv': CSVDataSource(),  # 离线备用
        }
        self.weights = {
            'sina': 0.35, 'tencent': 0.30, 'eastmoney': 0.35,  # 实时源
            'akshare': 0.0, 'baostock': 0.0, 'tushare': 0.0,   # 按需启用
            'csv': 0.0,  # 最后 fallback
        }
        self.health_status = {name: True for name in self.sources}

    async def fetch_quotes(self, symbols: List[str]) -> Dict[str, Quote]:
        """多源聚合获取行情，自动故障转移"""
        results = {}
        active_sources = self._get_active_sources()

        for symbol in symbols:
            for source_name in active_sources:
                try:
                    quote = await self.sources[source_name].fetch(symbol)
                    if quote:
                        results[symbol] = quote
                        break
                except Exception as e:
                    self._mark_unhealthy(source_name)
                    continue

        return results
```

#### 数据源分类

| 类别 | 数据源 | 特点 | 用途 |
|------|--------|------|------|
| **实时行情** | 新浪财经 | 速度快、稳定 | 主要实时数据 |
| | 腾讯财经 | 备用 | failover |
| | 东方财富 | 数据全 | 补充数据 |
| **历史数据** | AkShare | 免费、Python 友好 | 历史行情、技术指标 |
| | Baostock | 免费、长期历史 | 基本面数据 |
| **财务数据** | Tushare | 专业（需 Token）| 财务报表、公告 |
| **离线/测试** | CSV | 本地文件 | 开发调试、回测 |

#### 熔断降级策略

```python
class CircuitBreaker:
    """熔断器 - 检测数据源健康状态"""

    def __init__(self, failure_threshold=5, recovery_timeout=60):
        self.failure_count = {}
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.last_failure_time = {}

    def record_failure(self, source_name: str):
        self.failure_count[source_name] = self.failure_count.get(source_name, 0) + 1
        self.last_failure_time[source_name] = time.time()

    def is_healthy(self, source_name: str) -> bool:
        if self.failure_count.get(source_name, 0) >= self.failure_threshold:
            # 检查是否超过恢复时间
            last_fail = self.last_failure_time.get(source_name, 0)
            if time.time() - last_fail < self.recovery_timeout:
                return False
            # 重置计数，尝试恢复
            self.failure_count[source_name] = 0
        return True
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
│  多数据源    │────▶│  Collector  │────▶│  WebSocket  │
│ (六源聚合)   │     │ (Service层) │     │  (推送前端) │
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

## 7. 功能边界

### 7.1 Local 支持的功能

| 功能模块 | 状态 | 说明 |
|---------|------|------|
| AI 交易员创建 | ✅ | Web界面，多模型选择（DeepSeek/通义/Kimi/GLM） |
| 策略收集对话 | ✅ | 五维度策略收集（风险/板块/周期/仓位/止损） |
| AI 职级系统 | ✅ | 实习生/经理/合伙人三级晋升（仅能力差异，无工资成本） |
| 激励档位 | ✅ | 标准/积极/激进三档（仅决策频率差异，无工资成本） |
| 虚拟交易执行 | ✅ | 基于实时数据的虚拟买卖、持仓管理、收益计算 |
| 实时行情数据 | ✅ | 六数据源聚合（完整复刻 v0.9：新浪/腾讯/东方财富/AkShare/Baostock/Tushare） |
| 新闻/舆论数据 | ✅ | 财经新闻采集、社交媒体情绪数据 |
| Token 统计 | ✅ | API 调用成本统计（仅供参考） |
| 排行榜 | ✅ | 本地单机多 AI 对比排行 |
| AI 决策理由展示 | ✅ | 内心戏展示（决策原因） |

### 7.2 Local 不支持的功能

| 功能模块 | 原因 | 归属形态 |
|---------|------|---------|
| 用户登录/注册 | 自用版无需登录 | - |
| 周薪/工资系统 | 无商业成本约束 | MVP/Full |
| 预算约束 | 用户自付 API 成本 | MVP/Full |
| 试用期机制 | Local 无试用期概念 | MVP/Full |
| 等级系统（30级用户等级） | 多用户粘性工具 | Full |
| 订阅/付费功能 | 商业功能 | MVP/Full |
| 称号系统 | 非核心功能 | 可延后 |
| 邀请系统 | 社交裂变 | Full |
| 广告接入 | 商业功能 | MVP/Full |

---

## 8. 演进策略

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
