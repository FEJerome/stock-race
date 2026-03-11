# Local 架构设计说明

> 当前版本: v2.0 Phase 1 已实现
> 最后更新: 2026-03-10

## 设计原则

### 1. 产品形态

**Local 模式定位**：本地部署的自用版，功能对齐 Full 但无多用户支持

**用户体验**：
```bash
$ python main.py
Starting Local AI Trading Platform...
Server running at http://localhost:8000
Opening browser... Done
# 浏览器自动弹出，直接使用
```

**不采用的方案**：
- CLI 命令行（已废弃）
- 系统托盘（当前阶段不需要后台常驻）
- Electron/Tauri（技术栈冲突，增加复杂度）
- PyQt 桌面（Vue 前端已选，无需内嵌 WebView）

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
| **存储** | SQLite + SQLAlchemy | 本地零配置，异步操作，后续可迁移 PostgreSQL |
| **实时通信** | WebSocket | FastAPI 原生支持，前端实时接收行情推送 |
| **数据源** | 实时 API | 多源混合（腾讯/新浪/东方财富）+ 新闻/舆论数据 |

---

### 3. 架构设计

#### 当前实际目录结构

```
local/
├── backend/              # FastAPI 后端
│   ├── api/              # API 路由层
│   │   ├── agents.py     # AI 交易员管理
│   │   ├── decision.py   # AI 决策执行
│   │   ├── health.py     # 健康检查
│   │   ├── market.py     # 行情接口
│   │   ├── settings.py   # 设置管理
│   │   ├── strategy.py   # 策略配置
│   │   ├── trading.py    # 交易执行
│   │   └── websocket.py  # WebSocket 实时推送
│   ├── models/           # 数据模型
│   │   ├── database.py   # SQLAlchemy ORM 模型
│   │   └── schemas.py    # Pydantic 请求/响应模型
│   ├── services/         # 业务逻辑层
│   │   ├── market_data/  # 行情数据服务
│   │   │   ├── base.py   # 数据源抽象基类
│   │   │   ├── router.py # 多源路由聚合
│   │   │   ├── csv_source.py    # CSV 数据源
│   │   │   ├── sina_source.py   # 新浪财经
│   │   │   ├── tencent_source.py # 腾讯财经
│   │   │   └── eastmoney_source.py # 东方财富
│   │   ├── ai_adapter/   # AI 适配器
│   │   │   ├── base.py   # 适配器基类与数据模型
│   │   │   └── kimi_adapter.py   # Kimi K2.5 实现
│   │   └── trading_service.py    # 交易执行与持仓管理
│   ├── tests/            # 测试
│   │   ├── integration/  # 集成测试
│   │   └── e2e/          # 端到端测试
│   └── main.py           # FastAPI 入口 + 自动浏览器
│
└── frontend/             # Vue 3 前端
    ├── src/
    │   ├── components/   # 组件
    │   │   ├── AgentCard.vue      # AI交易员卡片（进度条式）
    │   │   ├── MetricCard.vue     # 指标卡片
    │   │   ├── charts/            # 图表组件
    │   │   ├── strategy/          # 策略配置
    │   │   └── tokens/            # Token统计
    │   ├── styles/       # 设计系统
    │   │   ├── variables.css      # CSS变量（深色主题）
    │   │   ├── animations.css     # 动画定义
    │   │   └── mixins.css         # 工具类
    │   ├── views/        # 页面
    │   ├── stores/       # Pinia 状态管理
    │   └── api/          # API 客户端
    ├── index.html
    ├── package.json
    └── vite.config.ts
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

### 4. 核心领域模型

#### ORM 模型 (SQLAlchemy)
- `AgentModel`: AI 交易员实体
- `TradeModel`: 交易记录
- `PositionModel`: 持仓

#### Pydantic Schemas
- `AgentCreate` / `AgentResponse`: AI 创建/响应
- `TradeCreate` / `TradeResponse`: 交易创建/响应
- `PositionResponse`: 持仓响应
- `StrategyConfig`: 策略配置（五维度）
- `QuoteResponse`: 行情数据

---

### 5. 前端设计系统

**主题**: 深色专业交易界面 ("数字农场")

**核心特性**:
- 深色主题背景 (#0a0e1a) - 适合长时间盯屏
- 玻璃拟态导航栏 - backdrop-filter blur
- 功能色彩系统: 增长绿/警示红/电光蓝/渐变金
- 金属质感等级徽章 (铜/银/金)
- 呼吸灯动画状态指示
- 3D卡片悬浮效果

**文件结构**:
- `src/styles/variables.css` - CSS变量系统
- `src/styles/animations.css` - 动画定义
- `src/styles/mixins.css` - 工具类
- `src/components/AgentCard.vue` - 统一交易员卡片
- `src/components/MetricCard.vue` - 指标卡片

### 6. 关键技术点

| 技术点 | 实现 | 理由 |
|--------|------|------|
| **异步架构** | FastAPI async/await + aiosqlite | 行情采集、AI 调用都是 IO 密集型 |
| **存储层** | SQLAlchemy ORM + 异步会话 | 统一存储抽象，便于后续迁移 |
| **实时通信** | WebSocket | 前端实时接收行情推送 |
| **模块化** | APIRouter 拆分 | 便于后续拆微服务 |
| **依赖注入** | FastAPI Depends | 管理数据库、配置、客户端 |
| **多数据源** | 策略模式 + 权重路由 | 自动故障转移，数据聚合 |

---

### 7. 功能边界

**Local 支持的功能**：
- 多模型 AI 交易员（Kimi/通义/GLM/DeepSeek）
- 实时行情（多数据源混合：腾讯/新浪/东方财富）
- 新闻/舆论数据采集
- 策略收集（五维度）
- AI 职级系统（实习生/经理/合伙人）
- 多 AI 并行对比
- 虚拟交易执行
- 持仓管理和收益计算
- WebSocket 实时数据推送

**Local 不支持的功能**：
- 用户登录/注册（自用，无需登录）
- 商业功能（订阅/支付/等级）
- 社交功能（分享/排行榜）

---

### 8. 快速开始

```bash
# 启动服务（自动打开浏览器）
cd local/backend
python main.py

# 仅启动服务（不打开浏览器）
python main.py --headless

# 访问 http://localhost:8000
# 浏览器自动打开，开始使用
```

---

### 8. 历史变更

| 日期 | 变更内容 |
|------|----------|
| 2026-03-10 | 实现职级晋升系统（PromotionService） |
| 2026-03-10 | 添加多模型 AI 适配器（DeepSeek/Qwen/GLM） |
| 2026-03-10 | 清理遗留代码（core/, adapters/, cmd/, config/） |
| 2026-03-09 | 完成 Phase 1 基础架构 |
| 2026-03-06 | 重新定义 Local 为"本地服务版" |

---

## 决策依据汇总

| 决策点 | 来源文档 | 具体章节 |
|--------|---------|---------|
| 自动打开浏览器 | discussion-log.md | 2026-03-06 新增会话 |
| Vue 3 + FastAPI | DELIVERY_PLAN.md | Local 技术栈定义 |
| SQLite + SQLAlchemy | DELIVERY_PLAN.md | 适配层定义 |
| 实时数据源 | DELIVERY_PLAN.md | Local 数据源定义 |
| 单体 + 模块化 | discussion-log.md | 单体后端 + 模块化设计 |
| 五维度策略 | PRD.md | 4.2.2 策略收集机制 |
