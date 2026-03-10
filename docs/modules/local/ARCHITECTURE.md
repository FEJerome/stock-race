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

#### AI 适配器容错配置

```python
class AIAdapterConfig:
    """AI 适配器容错配置 - 用户可在 Settings.vue 中调整"""

    # 超时与重试
    timeout: int = 30              # 单次调用超时（秒）
    max_retries: int = 2           # 最大重试次数
    retry_delay: float = 1.0       # 退避基数（秒）

    # Token 预算（用户可配置，默认较高）
    token_budget_per_day: int = 1_000_000  # 默认 100万 Token/天

    # 熔断机制
    circuit_breaker_threshold: int = 5     # 5次失败后熔断
    circuit_breaker_recovery: int = 300    # 5分钟后尝试恢复

    # 成本预警（可选）
    daily_cost_alert_threshold: Decimal = Decimal("50.0")  # 日消费超过50元提醒
```

**用户配置界面**（Settings.vue）：
- Token 日预算上限：滑块选择（10万 ~ 1000万，默认100万）
- API 调用超时：输入框（10 ~ 120秒，默认30秒）
- 启用成本预警：开关（默认开启，阈值可设）

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

#### 实时行情（WebSocket - Local 激进版）

**Local 场景优化**：单用户无连接数限制，最大化实时性

```python
# WS /ws/market
# 客户端订阅: {"action": "subscribe", "symbols": ["sh000001", "sz399001", "000001.SZ"]}
# 服务端推送: {
#   "type": "quote_update",
#   "data": [
#     {"symbol": "sh000001", "price": 3050.12, "change": 0.32, "volume": 1520000, "timestamp": "2026-03-09T14:30:00"},
#     {"symbol": "000001.SZ", "price": 13.25, "change": 1.12, "volume": 850000, "timestamp": "2026-03-09T14:30:00"}
#   ]
# }
```

**WebSocket 连接管理（Local 优化）**：

```python
class WebSocketManager:
    """Local 版 WebSocket 管理 - 最大化实时性体验"""

    # 激进的心跳配置（单用户无压力）
    HEARTBEAT_INTERVAL = 15       # 15秒一次心跳（普通WebSocket 30秒）
    HEARTBEAT_TIMEOUT = 5         # 5秒无响应判定断开
    HEARTBEAT_MISS_THRESHOLD = 2  # 连续丢失2次心跳则断开

    # 快速重连策略
    RECONNECT_INTERVAL_INITIAL = 2      # 首次重连2秒
    RECONNECT_INTERVAL_MAX = 10         # 最大重连间隔10秒
    RECONNECT_BACKOFF_MULTIPLIER = 2    # 指数退避基数
    RECONNECT_MAX_ATTEMPTS = 10         # 最大重试次数（Local持续尝试）

    # 数据推送配置
    BROADCAST_INTERVAL = 5        # 5秒批量推送（高频）
    MAX_SUBSCRIPTIONS = 100       # 最大订阅股票数（Local放宽到100）

    async def handle_connection(self, websocket: WebSocket):
        """处理 WebSocket 连接生命周期"""
        await websocket.accept()

        # 初始化连接状态
        connection = ConnectionState(
            websocket=websocket,
            subscribed_symbols=set(),
            last_heartbeat=time.time(),
            is_healthy=True
        )

        # 启动三个协程
        await asyncio.gather(
            self._heartbeat_loop(connection),
            self._message_handler(connection),
            self._broadcast_loop(connection)
        )

    async def _heartbeat_loop(self, connection: ConnectionState):
        """心跳检测循环"""
        while connection.is_healthy:
            try:
                # 发送 ping
                await connection.websocket.send_json({"type": "ping", "timestamp": time.time()})

                # 等待 pong（5秒超时）
                response = await asyncio.wait_for(
                    connection.websocket.receive_json(),
                    timeout=self.HEARTBEAT_TIMEOUT
                )

                if response.get("type") == "pong":
                    connection.last_heartbeat = time.time()

                await asyncio.sleep(self.HEARTBEAT_INTERVAL)

            except asyncio.TimeoutError:
                # 心跳超时，标记不健康
                connection.is_healthy = False
                break

    async def on_reconnect(self, connection: ConnectionState):
        """重连后数据补偿"""
        # 1. 推送断线期间缓存的最新行情
        cached_quotes = await self.get_cached_quotes(connection.subscribed_symbols)
        await connection.websocket.send_json({
            "type": "batch_update",
            "data": cached_quotes,
            "message": "重连后数据补偿"
        })

        # 2. 推送断线期间错过的交易执行结果
        missed_trades = await self.get_missed_trades(connection.agent_ids)
        if missed_trades:
            await connection.websocket.send_json({
                "type": "trade_updates",
                "data": missed_trades
            })

        # 3. 推送断线期间的AI决策更新
        missed_decisions = await self.get_missed_decisions(connection.agent_ids)
        if missed_decisions:
            await connection.websocket.send_json({
                "type": "decision_updates",
                "data": missed_decisions
            })
```

**前端 WebSocket 客户端**：

```javascript
// stores/market.js - WebSocket 管理
export const useMarketStore = defineStore('market', {
  state: () => ({
    ws: null,
    isConnected: false,
    subscribedSymbols: [],
    quotes: {},           // 实时行情数据
    reconnectAttempts: 0,
    lastHeartbeat: null
  }),

  actions: {
    connect() {
      const ws = new WebSocket('ws://localhost:8000/ws/market')

      ws.onopen = () => {
        this.isConnected = true
        this.reconnectAttempts = 0
        // 恢复订阅
        if (this.subscribedSymbols.length > 0) {
          this.subscribe(this.subscribedSymbols)
        }
      }

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        this.handleMessage(message)
      }

      ws.onclose = () => {
        this.isConnected = false
        this.attemptReconnect()
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      this.ws = ws
    },

    attemptReconnect() {
      // 指数退避重连
      const delay = Math.min(
        2 * Math.pow(2, this.reconnectAttempts),
        10 // 最大10秒
      )
      this.reconnectAttempts++

      setTimeout(() => {
        console.log(`Reconnecting... attempt ${this.reconnectAttempts}`)
        this.connect()
      }, delay * 1000)
    },

    handleMessage(message) {
      switch (message.type) {
        case 'ping':
          // 响应心跳
          this.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
          break
        case 'quote_update':
          // 更新行情数据
          message.data.forEach(quote => {
            this.quotes[quote.symbol] = quote
          })
          break
        case 'batch_update':
          // 重连后批量更新
          message.data.forEach(quote => {
            this.quotes[quote.symbol] = quote
          })
          break
        case 'trade_updates':
          // 交易执行通知
          useTradeStore().handleTradeUpdates(message.data)
          break
        case 'decision_updates':
          // AI决策更新
          useAgentStore().handleDecisionUpdates(message.data)
          break
      }
    },

    subscribe(symbols) {
      this.subscribedSymbols = [...new Set([...this.subscribedSymbols, ...symbols])]
      if (this.isConnected) {
        this.ws.send(JSON.stringify({
          action: 'subscribe',
          symbols: symbols
        }))
      }
    }
  }
})
```

**消息类型定义**：

| 消息类型 | 方向 | 说明 |
|---------|------|------|
| `ping` | 服务端→客户端 | 心跳检测（15秒间隔） |
| `pong` | 客户端→服务端 | 心跳响应 |
| `subscribe` | 客户端→服务端 | 订阅股票列表 |
| `unsubscribe` | 客户端→服务端 | 取消订阅 |
| `quote_update` | 服务端→客户端 | 行情数据更新（5秒推送） |
| `batch_update` | 服务端→客户端 | 重连后批量补偿 |
| `trade_updates` | 服务端→客户端 | 交易执行结果 |
| `decision_updates` | 服务端→客户端 | AI决策结果 |
| `error` | 服务端→客户端 | 错误通知 |

### 3.4 数据源架构（复刻 v0.9 完整机制）

Local 形态完整复刻 v0.9 的六数据源架构，包括动态权重、质量评估、熔断恢复等完整机制。

#### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    DataSourceRouter                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              动态权重管理器                                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │   │
│  │  │   新浪   │  │   腾讯   │  │ 东方财富 │  │ AkShare  │ │   │
│  │  │  Sina    │  │ Tencent  │  │EastMoney │  │(历史)    │ │   │
│  │  │ (主实时) │  │ (备实时) │  │ (备实时) │  │          │ │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │   │
│  │       └─────────────┴─────────────┴─────────────┘       │   │
│  │                      ↓                                   │   │
│  │              ┌──────────────────────┐                   │   │
│  │              │   数据质量评估引擎    │                   │   │
│  │              │  - 多源数据比对       │                   │   │
│  │              │  - 异常值检测         │                   │   │
│  │              │  - 置信度评分(0-100)  │                   │   │
│  │              └──────────────────────┘                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ↓                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              三层缓存架构                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │   │
│  │  │  L1 内存缓存  │  │ L2 SQLite    │  │ L3 远程数据源 │    │   │
│  │  │   (5秒TTL)   │  │ (本地存储)   │  │ (新浪/腾讯)  │    │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

#### DataSourceRouter 完整实现

```python
class DataSourceRouter:
    """数据源路由器 - 复刻 v0.9 完整机制"""

    def __init__(self):
        # 初始化数据源
        self.sources: Dict[str, DataSource] = {
            'sina': SinaDataSource(),
            'tencent': TencentDataSource(),
            'eastmoney': EastMoneyDataSource(),
            'akshare': AkShareDataSource(),
            'baostock': BaostockDataSource(),
            'tushare': TushareDataSource(),
            'csv': CSVDataSource(),  # 离线备用
        }

        # 动态权重配置（实时调整）
        self.weights = {
            'sina': 0.40,      # 新浪财经 - 主实时源
            'tencent': 0.35,   # 腾讯财经 - 备实时源
            'eastmoney': 0.25, # 东方财富 - 补充数据
            'akshare': 0.0,    # 历史数据（按需启用）
            'baostock': 0.0,   # 基本面数据（日终）
            'tushare': 0.0,    # 财务数据（需 Token）
            'csv': 0.0,        # 离线兜底
        }

        # 健康状态管理
        self.health_status: Dict[str, HealthStatus] = {}
        for name in self.sources:
            self.health_status[name] = HealthStatus(
                is_healthy=True,
                success_rate=1.0,
                avg_latency_ms=0,
                last_failure=None,
                consecutive_failures=0
            )

        # 熔断器配置
        self.circuit_breakers: Dict[str, CircuitBreaker] = {
            name: CircuitBreaker(
                failure_threshold=10,      # 10次失败后熔断
                recovery_timeout=300,      # 5分钟后尝试恢复
                half_open_max_calls=3      # 半开状态最多3次试探
            )
            for name in self.sources
        }

        # 并发控制
        self.semaphore = asyncio.Semaphore(3)  # 最多3个数据源并发

    async def fetch_quotes(self, symbols: List[str]) -> Dict[str, Quote]:
        """多源聚合获取行情，智能故障转移"""
        results = {}
        failed_symbols = set(symbols)

        # 获取按权重排序的可用数据源
        active_sources = self._get_active_sources_by_weight()

        for source_name in active_sources:
            if not failed_symbols:
                break

            # 检查熔断器状态
            cb = self.circuit_breakers[source_name]
            if cb.state == CircuitState.OPEN:
                continue

            async with self.semaphore:  # 并发控制
                try:
                    # 批量获取（最大50只/批次）
                    batch_size = 50
                    source_results = {}

                    for i in range(0, len(failed_symbols), batch_size):
                        batch = list(failed_symbols)[i:i+batch_size]
                        batch_results = await self.sources[source_name].fetch_batch(batch)
                        source_results.update(batch_results)

                    # 数据质量评估
                    for symbol, quote in source_results.items():
                        if self._validate_quote(quote):
                            results[symbol] = quote
                            failed_symbols.discard(symbol)

                    # 记录成功
                    self._record_success(source_name, len(source_results))
                    cb.record_success()

                except Exception as e:
                    # 记录失败
                    self._record_failure(source_name, str(e))
                    cb.record_failure()

        # 对未获取到的股票使用缓存数据
        for symbol in failed_symbols:
            cached = await self._get_cached_quote(symbol)
            if cached:
                results[symbol] = cached

        return results

    def _get_active_sources_by_weight(self) -> List[str]:
        """按权重排序获取可用数据源"""
        active = []
        for name, weight in sorted(self.weights.items(), key=lambda x: -x[1]):
            if weight > 0 and self.health_status[name].is_healthy:
                # 检查熔断器
                if self.circuit_breakers[name].state != CircuitState.OPEN:
                    active.append(name)
        return active

    def _validate_quote(self, quote: Quote) -> bool:
        """数据质量验证"""
        # 价格范围检查
        if quote.price <= 0 or quote.price > 100000:
            return False
        # 涨跌幅检查（A股 ±10%，创业板 ±20%）
        if abs(quote.change_percent) > 20:
            return False
        # 成交量检查
        if quote.volume < 0:
            return False
        return True

    async def _dynamic_weight_adjustment(self):
        """动态权重调整（每5分钟执行）"""
        for name, status in self.health_status.items():
            if name == 'csv':  # 离线源不参与调整
                continue

            # 基于成功率和延迟调整权重
            success_weight = status.success_rate
            latency_weight = 1.0 / (1 + status.avg_latency_ms / 100)

            new_weight = (success_weight * 0.7 + latency_weight * 0.3)

            # 平滑过渡
            old_weight = self.weights[name]
            self.weights[name] = old_weight * 0.8 + new_weight * 0.2

        # 归一化
        total = sum(w for w in self.weights.values() if w > 0)
        if total > 0:
            for name in self.weights:
                if self.weights[name] > 0:
                    self.weights[name] /= total
```

#### 数据源分类与用途

| 类别 | 数据源 | 特点 | 用途 | 默认权重 |
|------|--------|------|------|---------|
| **实时主源** | 新浪财经 | 速度快、稳定性高 | 主要实时行情 | 40% |
| **实时备源** | 腾讯财经 | 速度快、数据格式一致 | 实时 failover | 35% |
| **实时补充** | 东方财富 | 数据全面、含板块信息 | 补充/校验 | 25% |
| **历史数据** | AkShare | Python友好、免费 | 历史K线、技术指标 | 按需启用 |
| **基本面** | Baostock | 长期历史数据 | 基本面分析、回测 | 日终采集 |
| **财务数据** | Tushare | 专业（需Token）| 财务报表、公告 | 按需启用 |
| **离线兜底** | CSV | 本地文件 | 无网络/测试环境 | 0% |

#### 熔断器完整实现（复刻 v0.9）

```python
from enum import Enum

class CircuitState(Enum):
    CLOSED = "closed"       # 正常状态
    OPEN = "open"          # 熔断状态
    HALF_OPEN = "half_open" # 半开状态（试探恢复）

class CircuitBreaker:
    """熔断器 - 复刻 v0.9 完整机制"""

    def __init__(self, failure_threshold: int = 10, recovery_timeout: int = 300,
                 half_open_max_calls: int = 3):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls

        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = None
        self.half_open_calls = 0

    def record_success(self):
        """记录成功调用"""
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.half_open_max_calls:
                # 恢复成功，关闭熔断
                self.state = CircuitState.CLOSED
                self.failure_count = 0
                self.success_count = 0
                self.half_open_calls = 0
        else:
            self.failure_count = max(0, self.failure_count - 1)

    def record_failure(self):
        """记录失败调用"""
        self.failure_count += 1
        self.last_failure_time = time.time()

        if self.state == CircuitState.HALF_OPEN:
            # 半开状态失败，立即重新熔断
            self.state = CircuitState.OPEN
        elif self.failure_count >= self.failure_threshold:
            # 达到阈值，开启熔断
            self.state = CircuitState.OPEN

    def can_execute(self) -> bool:
        """检查是否允许执行"""
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            # 检查是否超过恢复时间
            if time.time() - self.last_failure_time >= self.recovery_timeout:
                # 进入半开状态
                self.state = CircuitState.HALF_OPEN
                self.half_open_calls = 0
                self.success_count = 0
                return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            # 限制半开状态的调用次数
            if self.half_open_calls < self.half_open_max_calls:
                self.half_open_calls += 1
                return True
            return False

        return False

    @property
    def is_healthy(self) -> bool:
        return self.state != CircuitState.OPEN
```

#### 分层采集策略

```python
class CollectionScheduler:
    """分层采集调度器 - 复刻 v0.9"""

    def __init__(self):
        self.scheduler = AsyncIOScheduler()

        # 高频层：持仓+关注的股票（约20-50只）
        self.scheduler.add_job(
            self._collect_high_frequency,
            'interval',
            seconds=10,
            id='high_freq_collection'
        )

        # 中频层：观察列表股票（约100只）
        self.scheduler.add_job(
            self._collect_medium_frequency,
            'interval',
            seconds=60,
            id='medium_freq_collection'
        )

        # 低频层：全市场股票（日终）
        self.scheduler.add_job(
            self._collect_low_frequency,
            'cron',
            hour=15, minute=30,
            id='daily_collection'
        )

        # 历史数据更新（每日收盘后）
        self.scheduler.add_job(
            self._update_historical_data,
            'cron',
            hour=16, minute=0,
            id='historical_update'
        )

    async def _collect_high_frequency(self):
        """高频采集：持仓股票"""
        symbols = await self._get_watchlist_symbols()  # 持仓+关注
        quotes = await self.router.fetch_quotes(symbols)
        await self._update_memory_cache(quotes)
        await self._broadcast_to_websocket(quotes)

    async def _collect_medium_frequency(self):
        """中频采集：观察列表"""
        symbols = await self._get_observation_symbols()
        quotes = await self.router.fetch_quotes(symbols)
        await self._update_sqlite_cache(quotes)

    async def _collect_low_frequency(self):
        """低频采集：全市场（收盘后）"""
        symbols = await self._get_all_market_symbols()
        quotes = await self.router.fetch_quotes(symbols)
        await self._update_sqlite_cache(quotes, ttl=86400)  # 24小时

    async def _update_historical_data(self):
        """更新历史数据"""
        # 使用 Baostock/Tushare 获取当日K线
        for source in ['baostock', 'tushare']:
            try:
                await self.sources[source].update_daily_kline()
            except Exception as e:
                logger.warning(f"{source} 历史数据更新失败: {e}")
```

#### 三层缓存架构

```python
class DataCacheManager:
    """三层缓存管理器"""

    def __init__(self):
        # L1: 内存缓存（热数据）
        self.memory_cache: Dict[str, CachedQuote] = {}
        self.memory_ttl = 10  # 10秒

        # L2: SQLite 本地缓存（温数据）
        self.sqlite_ttl = 300  # 5分钟

        # L3: 远程数据源（冷数据）
        # 由 DataSourceRouter 管理

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """三级缓存查询"""
        # 1. 查内存缓存
        if symbol in self.memory_cache:
            cached = self.memory_cache[symbol]
            if cached.is_valid():
                return cached.quote

        # 2. 查 SQLite 缓存
        quote = await self._query_sqlite_cache(symbol)
        if quote:
            # 回填内存缓存
            self.memory_cache[symbol] = CachedQuote(quote, ttl=self.memory_ttl)
            return quote

        # 3. 从数据源获取
        return None

    async def set_quote(self, symbol: str, quote: Quote, level: str = "memory"):
        """写入缓存"""
        if level in ["memory", "all"]:
            self.memory_cache[symbol] = CachedQuote(quote, ttl=self.memory_ttl)

        if level in ["sqlite", "all"]:
            await self._save_to_sqlite(symbol, quote)
```

#### 数据质量评估

```python
class DataQualityEngine:
    """数据质量评估引擎"""

    def evaluate(self, quotes: Dict[str, Quote]) -> Dict[str, QualityScore]:
        """评估数据质量"""
        scores = {}

        for symbol, quote in quotes.items():
            score = QualityScore()

            # 1. 时效性（30%）
            data_age = time.time() - quote.timestamp.timestamp()
            score.freshness = max(0, 1 - data_age / 60)  # 60秒内满分

            # 2. 完整性（30%）
            required_fields = ['price', 'volume', 'change_percent']
            score.completeness = sum(1 for f in required_fields if getattr(quote, f)) / len(required_fields)

            # 3. 合理性（40%）
            checks = [
                0 < quote.price < 100000,
                abs(quote.change_percent) <= 20,
                quote.volume >= 0,
                quote.high >= quote.low >= 0
            ]
            score.reasonableness = sum(checks) / len(checks)

            # 综合得分
            score.total = (
                score.freshness * 0.3 +
                score.completeness * 0.3 +
                score.reasonableness * 0.4
            ) * 100

            scores[symbol] = score

        return scores
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

4. **事务包裹执行**（保证原子性）
   ```python
   async with self.db.transaction():  # BEGIN TRANSACTION
       # 4.1 插入交易记录
       await self.db.execute(
           "INSERT INTO trades (id, agent_id, symbol, action, quantity, price, realized_pnl, timestamp) VALUES (...)",
           trade_data
       )
       # 4.2 更新持仓（买入新增/卖出减少）
       await self.update_position(agent_id, symbol, quantity, action, avg_price)
       # 4.3 更新现金余额
       await self.db.execute(
           "UPDATE agents SET current_capital = current_capital - ? WHERE id = ?",
           (trade_amount, agent_id)
       )
       # 4.4 更新收益指标
       await self.portfolio_service.update_metrics(agent_id)
   # COMMIT - 全部成功或全部回滚
   ```

5. 返回结果给前端
   {success: true, trade_id, realized_pnl}

**并发控制**：SQLite 单文件不支持高并发写，使用 `aiosqlite` + `asyncio.Lock` 保护关键写操作：
```python
class TradingEngine:
    def __init__(self):
        self._trade_lock = asyncio.Lock()  # 保护交易执行

    async def execute_trade(self, trade: Trade):
        async with self._trade_lock:  # 串化交易执行
            async with self.db.transaction():
                # 执行交易...
```

### 5.3 AI 决策流程

#### 5.3.1 决策触发机制

| 触发方式 | 说明 | 频率控制 |
|---------|------|---------|
| 定时触发 | APScheduler 按激励档位调度 | 标准60min/积极30min/激进20min |
| 手动触发 | 用户点击"获取决策" | 无限制，但受 Token 预算约束 |
| 事件触发 | 重大新闻/行情异动（可选）| Phase 1.3 实现 |

#### 5.3.2 AI 决策上下文构建

```python
class DecisionContext:
    """AI 决策上下文 - 控制在 4000 tokens 以内"""

    # 1. 系统角色（固定，~500 tokens）
    system_prompt: str = """
    你是AI股票交易员，严格遵循以下原则：
    - 只交易用户指定的市场范围
    - 严格遵守仓位限制和止损纪律
    - 基于数据理性分析，不情绪化决策
    """

    # 2. 策略文档（创建时生成，~800 tokens）
    strategy: Dict = {
        "risk_tolerance": "稳健",           # 保守/稳健/激进/极度
        "sectors": ["科技", "消费"],        # 关注板块
        "holding_period": "中期",           # 超短/短/中/长
        "position_limit": "单股不超过30%",  # 仓位控制
        "stop_loss": "8%止损",              # 止损纪律
        "market_scope": "主板+创业板"       # 交易范围
    }

    # 3. 当前持仓（动态，~300 tokens）
    portfolio: Dict = {
        "cash": 500000,                     # 可用现金
        "total_value": 550000,              # 总资产
        "total_return": "+10%",             # 总收益率
        "positions": [
            {
                "symbol": "000001.SZ",
                "name": "平安银行",
                "quantity": 1000,
                "avg_cost": 12.5,
                "current_price": 13.2,
                "unrealized_pnl": "+5.6%"
            }
        ]
    }

    # 4. 市场数据（动态，~600 tokens）
    market: Dict = {
        "watchlist": [
            {"symbol": "000001.SZ", "price": 13.2, "change": "+1.2%", "volume": "15.2万手"},
            {"symbol": "000002.SZ", "price": 25.8, "change": "-0.5%", "volume": "8.5万手"}
        ],
        "market_overview": {
            "shanghai_index": {"price": 3050, "change": "+0.3%"},
            "shenzhen_index": {"price": 9850, "change": "+0.1%"},
            "market_sentiment": "震荡整理"    # 从新闻/数据计算
        },
        "hot_sectors": ["人工智能", "新能源"],  # 资金流向
        "news_highlights": [                  # 重要新闻摘要（Phase 1.3）
            "央行降准0.5个百分点",
            "新能源补贴政策延续"
        ]
    }

    # 5. 历史决策（最近3次，~400 tokens）
    recent_decisions: List[Dict] = [
        {
            "timestamp": "2026-03-09T10:30:00",
            "action": "buy",
            "symbol": "000001.SZ",
            "quantity": 500,
            "reason": "银行股估值修复，技术面突破"
        }
    ]

    # 6. 当前时间信息（~100 tokens）
    context_info: Dict = {
        "current_time": "2026-03-09T14:30:00",
        "is_trading_time": True,
        "time_to_market_close": "30分钟",
        "trading_day_count": 15   # 已运行交易日数
    }
```

#### 5.3.3 Token 管理策略

```python
class TokenBudgetManager:
    """Token 预算管理 - 确保总 tokens 控制在限制内"""

    TOKEN_LIMITS = {
        "deepseek-chat": 4000,      # 常规上下文
        "deepseek-coder": 8000,     # 长上下文（如有）
        "default": 4000
    }

    def optimize_context(self, context: DecisionContext, model: str) -> Dict:
        """根据模型限制优化上下文"""
        limit = self.TOKEN_LIMITS.get(model, 4000)
        estimated = self._estimate_tokens(context)

        if estimated <= limit:
            return context

        # 逐层截断，保留核心信息
        strategies = [
            # 1. 截断历史决策（3次 -> 2次 -> 1次 -> 0次）
            lambda ctx: ctx.recent_decisions[:-1] if len(ctx.recent_decisions) > 0 else ctx,
            # 2. 精简观察列表（保留前5只）
            lambda ctx: ctx.market["watchlist"][:5],
            # 3. 移除新闻摘要
            lambda ctx: ctx.market.pop("news_highlights", None),
            # 4. 截断策略文档详细描述
            lambda ctx: {k: v for k, v in ctx.strategy.items() if k in ["risk_tolerance", "position_limit", "stop_loss"]}
        ]

        for strategy in strategies:
            context = strategy(context)
            if self._estimate_tokens(context) <= limit:
                break

        return context
```

#### 5.3.4 决策缓存机制

```python
class DecisionCache:
    """决策缓存 - 减少重复 API 调用"""

    def __init__(self):
        self._cache: Dict[str, CachedDecision] = {}
        self._ttl_seconds = 300  # 5分钟默认TTL

    def _make_cache_key(self, agent_id: str, market_snapshot: Dict) -> str:
        """生成缓存 key"""
        # 关键市场数据哈希
        key_data = {
            "agent_id": agent_id,
            "market_prices": {s["symbol"]: s["price"] for s in market_snapshot.get("watchlist", [])},
            "timestamp": int(time.time() / 60) * 60  # 按分钟取整
        }
        return hashlib.md5(json.dumps(key_data, sort_keys=True).encode()).hexdigest()

    def get(self, agent_id: str, market_snapshot: Dict) -> Optional[Decision]:
        """获取缓存决策"""
        key = self._make_cache_key(agent_id, market_snapshot)
        cached = self._cache.get(key)

        if cached and cached.is_valid():
            # 检查市场变化是否过大（>1% 则失效）
            if self._market_changed_little(cached.market_snapshot, market_snapshot):
                return cached.decision

        return None

    def set(self, agent_id: str, market_snapshot: Dict, decision: Decision):
        """缓存决策结果"""
        key = self._make_cache_key(agent_id, market_snapshot)
        self._cache[key] = CachedDecision(
            decision=decision,
            market_snapshot=market_snapshot,
            expires_at=time.time() + self._ttl_seconds
        )
```

#### 5.3.5 决策执行流程

```
1. 触发决策
   └─▶ 检查 Token 日预算（是否超标）
   └─▶ 检查缓存（是否存在有效缓存）

2. 构建上下文
   └─▶ 查询当前持仓
   └─▶ 查询策略配置
   └─▶ 查询实时行情
   └─▶ 组装上下文对象
   └─▶ Token 优化（如需截断）

3. 调用 AI 适配器
   └─▶ 组装 Prompt（系统+策略+数据+历史）
   └─▶ 异步调用 LLM API
   └─▶ 超时/重试/熔断处理
   └─▶ 解析决策结果

4. 决策结果处理
   └─▶ 记录 Token 消耗
   └─▶ 缓存决策结果
   └─▶ 前端展示"内心戏"
   └─▶ 用户确认 / 自动执行（按档位）

5. 执行交易（如用户确认）
   └─▶ 调用 TradingEngine.execute_trade()
```

#### 5.3.6 决策输出格式

```python
class Decision(BaseModel):
    """AI 决策结果"""

    action: Literal["buy", "sell", "hold", "watch"]
    symbol: Optional[str]          # 目标股票代码（buy/sell时必填）
    quantity: Optional[int]        # 建议数量
    confidence: float              # 置信度 0-1
    reason: str                    # 决策理由（内心戏展示）
    analysis: str                  # 详细分析（可选展开）
    risk_assessment: str           # 风险评估
    suggested_position_size: str   # 建议仓位占比

    # 元数据
    input_tokens: int              # 输入 token 数
    output_tokens: int             # 输出 token 数
    cost: Decimal                  # API 调用成本
    latency_ms: int                # 响应延迟
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
