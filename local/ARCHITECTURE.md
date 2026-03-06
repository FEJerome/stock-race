# Local 架构设计说明

## 设计原则

### 1. 产品形态

**Local 模式定位**：本地部署的自用版，功能对齐 Full 但无多用户支持

**用户体验**：
```bash
$ python local.py
Starting Local AI Trading Platform...
Server running at http://localhost:8000
Opening browser... ✓
# 浏览器自动弹出，直接使用
```

**不采用的方案**：
- ❌ CLI 命令行（已废弃）
- ❌ 系统托盘（当前阶段不需要后台常驻）
- ❌ Electron/Tauri（技术栈冲突，增加复杂度）
- ❌ PyQt 桌面（Vue 前端已选，无需内嵌 WebView）

**采用方案**：本地服务 + 自动打开浏览器
- 双击/命令行启动后，自动弹出浏览器新标签页
- 用户直接使用，无需关心"服务"概念
- 提供 `--headless` 参数（仅启动服务，不打开浏览器）

---

### 2. 技术栈

| 层级 | 技术选型 | 理由 |
|------|---------|------|
| **前端** | Vue 3 + Vite | 已熟悉，组合式 API 灵活，组件可向 Full 复用 |
| **后端** | FastAPI (Python) | 异步架构适合 IO 密集型（行情采集、AI 调用），模块化设计便于后续拆分微服务 |
| **存储** | SQLite | 本地零配置，后续可迁移 PostgreSQL |
| **实时通信** | WebSocket | FastAPI 原生支持，前端实时接收行情推送 |
| **数据源** | 实时 API | 多源混合（东方财富/新浪财经/同花顺等）+ 新闻/舆论数据 |

---

### 3. 架构设计

#### 单体后端 + 模块化设计

```
local/backend/
├── api/                   # API 路由层
│   ├── __init__.py
│   ├── market.py         # 行情接口（WebSocket + REST）
│   ├── news.py           # 新闻/舆论接口
│   ├── ai.py             # AI 交易员管理
│   ├── trade.py          # 交易执行
│   └── strategy.py       # 策略配置
├── services/             # 业务逻辑层（从 legacy 复用）
│   ├── __init__.py
│   ├── market_collector.py    # 原 market-data-service
│   ├── news_collector.py      # 原 news-service
│   ├── ai_adapter.py          # 原 trading-ai-service
│   └── trading_engine.py      # 原 backend 简化
├── models/               # 数据模型（与 core/ 复用）
│   └── schemas.py        # Pydantic 模型
├── db/                   # 数据库连接
│   └── sqlite.py         # SQLite 实现
├── config.py             # 配置管理
└── main.py               # FastAPI 入口 + 自动打开浏览器
```

#### 与 Full 的演进关系

```
Local（单体，自用）
    │
    ├── AI 适配器 ──────────────→ Full（ai-service 微服务）
    ├── 数据源适配器 ───────────→ Full（market-data-service/news-service）
    ├── 交易引擎 ───────────────→ Full（trading-service）
    └── Vue 前端 ───────────────→ Full（复用前端组件）
```

**演进保障**：
- Local 阶段模块边界清晰 → Full 阶段直接拆成微服务
- 不需要重写业务逻辑，仅需调整通信方式（函数调用 → HTTP/gRPC）

---

### 4. 前端架构

```
local/frontend/
├── public/               # 静态资源
├── src/
│   ├── assets/          # 样式、图片
│   ├── components/      # 通用组件
│   │   ├── common/      # 基础组件（Button/Input/Modal）
│   │   ├── charts/      # 图表组件（ECharts）
│   │   └── layout/      # 布局组件（Sidebar/Header）
│   ├── views/           # 页面视图
│   │   ├── Dashboard.vue      # 仪表盘（多 AI 对比）
│   │   ├── AgentCreate.vue    # 创建 AI 交易员
│   │   ├── AgentDetail.vue    # AI 详情/交易记录
│   │   ├── StrategyConfig.vue # 策略配置
│   │   ├── MarketData.vue     # 实时行情
│   │   └── Settings.vue       # 设置（API Key 配置）
│   ├── stores/          # Pinia 状态管理
│   │   ├── agent.js     # AI 交易员状态
│   │   ├── market.js    # 行情数据状态
│   │   └── trade.js     # 交易状态
│   ├── api/             # API 客户端
│   │   ├── http.js      # Axios 实例
│   │   ├── websocket.js # WebSocket 管理
│   │   └── index.js     # API 方法封装
│   ├── utils/           # 工具函数
│   └── App.vue          # 根组件
├── index.html
├── package.json
└── vite.config.js
```

---

### 5. 核心领域模型

```python
# 与三种形态共用
- AIAgent: AI 交易员实体
- Strategy: 策略文档（五维度）
- Trade: 交易记录
- Position: 持仓
- Portfolio: 账户组合
```

---

### 6. 关键技术点

| 技术点 | 实现 | 理由 |
|--------|------|------|
| **异步架构** | FastAPI async/await | 行情采集、AI 调用都是 IO 密集型 |
| **实时通信** | WebSocket | 前端实时接收行情推送 |
| **模块化** | APIRouter 拆分 | 便于后续拆微服务 |
| **依赖注入** | FastAPI Depends | 管理数据库、配置、客户端 |

**性能评估**：
- 并发量：1（单用户自用）
- 数据存储：SQLite（GB 级以下无压力）
- 采集频率：即使每秒采集，Python asyncio 轻松处理

---

### 7. 复用 Legacy 代码策略

**直接迁移的模块**（业务逻辑不变，换框架）：

| Legacy 路径 | Local 路径 | 说明 |
|------------|-----------|------|
| `legacy/services/market-data-service/` | `services/market_collector.py` | 多数据源采集逻辑 |
| `legacy/services/trading-ai-service/` | `services/ai_adapter.py` | AI 适配器和 Prompt |
| `legacy/services/news-service/` | `services/news_collector.py` | 新闻/舆论采集 |

**演进保障**：
- Local 阶段模块边界清晰 → Full 阶段直接拆成微服务
- 不需要重写业务逻辑，仅需调整通信方式

---

### 8. 功能边界

**Local 支持的功能**：
- ✅ 多模型 AI 交易员（DeepSeek/通义/Kimi/GLM）
- ✅ 实时行情（多数据源混合）
- ✅ 新闻/舆论数据采集
- ✅ 策略收集（五维度）
- ✅ AI 职级系统（实习生/经理/合伙人）
- ✅ 多 AI 并行对比
- ✅ 虚拟交易执行
- ✅ 持仓管理和收益计算

**Local 不支持的功能**：
- ❌ 用户登录/注册（自用，无需登录）
- ❌ 商业功能（订阅/支付/等级）
- ❌ 社交功能（分享/排行榜）

---

### 9. 快速开始流程

```bash
# 1. 启动服务（自动打开浏览器）
python local.py

# 2. 仅启动服务（不打开浏览器）
python local.py --headless

# 3. 访问 http://localhost:8000
# 浏览器自动打开，开始使用
```

---

## 决策依据汇总

| 决策点 | 来源文档 | 具体章节 |
|--------|---------|---------|
| 自动打开浏览器 | discussion-log.md | 2026-03-06 新增会话 |
| Vue 3 + FastAPI | DELIVERY_PLAN.md | Local 技术栈定义 |
| SQLite 存储 | DELIVERY_PLAN.md | 适配层定义 |
| 实时数据源 | DELIVERY_PLAN.md | Local 数据源定义 |
| 单体 + 模块化 | discussion-log.md | 单体后端 + 模块化设计 |
| 复用 Legacy | DELIVERY_PLAN.md | 复用策略 |
| 五维度策略 | PRD.md | 4.2.2 策略收集机制 |
