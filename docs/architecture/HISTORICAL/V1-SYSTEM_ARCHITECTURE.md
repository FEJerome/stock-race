> ⚠️ **历史文档警告**
> 本文档为历史版本V1，创建于2026-02-03，已被后续版本取代。
> 最新架构设计请参考 [CURRENT/SERVICE_ARCHITECTURE.md](../CURRENT/SERVICE_ARCHITECTURE.md)

---

# AI股票竞赛平台 - 系统架构设计

## 1. 整体架构概述

### 1.1 架构原则
- **混合架构**：Node.js + React + Python，发挥各自技术优势
- **模块化设计**：清晰的模块边界，支持独立开发和部署
- **实时优先**：WebSocket实时推送，低延迟数据更新
- **扩展性设计**：为多用户、多AI模型、高级功能预留扩展空间
- **安全合规**：符合中国网络安全法和金融合规要求

### 1.2 架构图
```
┌─────────────────────────────────────────────────────────────────────────┐
│                             用户界面层 (UI Layer)                        │
├─────────────────────────────────────────────────────────────────────────┤
│  React前端应用 (Vite + TypeScript + Ant Design)                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │  登录/注册  │ │  实时看盘   │ │  交易监控   │ │  排行榜    │       │
│  │  组件       │ │  组件       │ │  组件       │ │  组件      │       │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                       │
│  │  持仓管理   │ │  分析报告   │ │  系统设置   │                       │
│  │  组件       │ │  组件       │ │  组件       │                       │
│  └─────────────┘ └─────────────┘ └─────────────┘                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ HTTP/HTTPS + WebSocket
┌─────────────────────────────────────────────────────────────────────────┐
│                         API网关层 (API Gateway Layer)                    │
├─────────────────────────────────────────────────────────────────────────┤
│  Node.js后端服务 (Express.js + TypeScript)                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         API路由层                               │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │   │
│  │  │ 用户认证 │ │ 交易操作 │ │ 数据查询 │ │ 实时推送 │          │   │
│  │  │ 路由     │ │ 路由     │ │ 路由     │ │ 路由     │          │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │                    业务逻辑层                           │   │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │   │
│  │  │  │ 用户服务 │ │ 交易服务 │ │ 数据服务 │ │ 监控服务 │   │   │   │
│  │  │  │          │ │          │ │          │ │          │   │   │   │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │                    数据访问层                           │   │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │   │
│  │  │  │ 用户模型 │ │ 交易模型 │ │ 股票模型 │ │ 日志模型 │   │   │   │
│  │  │  │          │ │          │ │          │ │          │   │   │   │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ HTTP/REST API
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI服务层 (AI Service Layer)                       │
├─────────────────────────────────────────────────────────────────────────┤
│  Python AI服务 (FastAPI + asyncio)                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         AI决策引擎                              │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │   │
│  │  │ 数据准备 │ │ 模型调用 │ │ 决策生成 │ │ 风险评估 │          │   │
│  │  │ 模块     │ │ 模块     │ │ 模块     │ │ 模块     │          │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │                    AI模型适配器                         │   │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │   │
│  │  │  │ OpenAI   │ │ Claude   │ │ 文心一言 │ │ 通义千问 │   │   │   │
│  │  │  │ 适配器   │ │ 适配器   │ │ 适配器   │ │ 适配器   │   │   │   │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ 消息队列/定时任务
┌─────────────────────────────────────────────────────────────────────────┐
│                       数据服务层 (Data Service Layer)                    │
├─────────────────────────────────────────────────────────────────────────┤
│  数据采集与处理服务                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        数据采集器                               │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │   │
│  │  │ 新浪财经 │ │ 腾讯财经 │ │ 东方财富 │ │ 聚宽API  │          │   │
│  │  │ 采集器   │ │ 采集器   │ │ 采集器   │ │ 采集器   │          │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │                    数据处理管道                         │   │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │   │
│  │  │  │ 数据清洗 │ │ 数据验证 │ │ 数据转换 │ │ 数据存储 │   │   │   │
│  │  │  │ 模块     │ │ 模块     │ │ 模块     │ │ 模块     │   │   │   │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ 数据库连接
┌─────────────────────────────────────────────────────────────────────────┐
│                       数据存储层 (Data Storage Layer)                    │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                    │
│  │ PostgreSQL   │ │   Redis      │ │ TimescaleDB  │                    │
│  │ (主数据库)    │ │ (缓存/会话)  │ │ (时序数据)    │                    │
│  │              │ │              │ │              │                    │
│  │ • 用户数据    │ │ • 会话管理   │ │ • 股票行情    │                    │
│  │ • 交易记录    │ │ • 实时行情   │ │ • 历史数据    │                    │
│  │ • AI账户信息  │ │ • API限流   │ │ • 技术指标    │                    │
│  │ • 系统配置    │ │ • 任务队列   │ │              │                    │
│  └──────────────┘ └──────────────┘ └──────────────┘                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. 前端React应用架构

### 2.1 技术栈
- **框架**：React 18 + TypeScript
- **构建工具**：Vite
- **状态管理**：Redux Toolkit（全局状态）+ React Context（局部状态）
- **UI组件库**：Ant Design 5.x
- **数据可视化**：ECharts for React
- **HTTP客户端**：Axios
- **WebSocket**：Socket.io-client
- **路由**：React Router v6
- **样式方案**：CSS Modules + Ant Design样式系统

### 2.2 应用结构
```
frontend/
├── src/
│   ├── api/                    # API客户端封装
│   │   ├── auth.ts            # 认证相关API
│   │   ├── trading.ts         # 交易相关API
│   │   ├── market.ts          # 市场数据API
│   │   ├── ai.ts              # AI相关API
│   │   └── websocket.ts       # WebSocket连接管理
│   ├── components/            # 通用组件
│   │   ├── common/           # 基础组件（按钮、输入框等）
│   │   ├── layout/           # 布局组件
│   │   ├── charts/           # 图表组件
│   │   └── modals/           # 模态框组件
│   ├── features/             # 功能模块
│   │   ├── auth/             # 认证模块
│   │   ├── dashboard/        # 仪表盘模块
│   │   ├── trading/          # 交易模块
│   │   ├── market/           # 市场数据模块
│   │   ├── portfolio/        # 持仓管理模块
│   │   ├── ranking/          # 排行榜模块
│   │   └── settings/         # 设置模块
│   ├── store/                # Redux状态管理
│   │   ├── slices/           # Redux切片
│   │   │   ├── authSlice.ts
│   │   │   ├── marketSlice.ts
│   │   │   ├── portfolioSlice.ts
│   │   │   └── uiSlice.ts
│   │   └── store.ts          # Store配置
│   ├── hooks/                # 自定义Hooks
│   │   ├── useAuth.ts        # 认证相关Hook
│   │   ├── useMarketData.ts  # 市场数据Hook
│   │   └── useWebSocket.ts   # WebSocket Hook
│   ├── utils/                # 工具函数
│   │   ├── formatters.ts     # 数据格式化
│   │   ├── validators.ts     # 表单验证
│   │   ├── constants.ts      # 常量定义
│   │   └── helpers.ts        # 辅助函数
│   ├── types/                # TypeScript类型定义
│   │   ├── api.types.ts      # API类型
│   │   ├── market.types.ts   # 市场数据类型
│   │   └── trading.types.ts  # 交易类型
│   ├── styles/               # 样式文件
│   │   ├── global.css        # 全局样式
│   │   └── variables.less    # Ant Design变量
│   ├── App.tsx               # 根组件
│   ├── main.tsx              # 应用入口
│   └── routes.tsx            # 路由配置
├── public/                   # 静态资源
├── index.html                # HTML模板
├── package.json              # 依赖配置
├── tsconfig.json             # TypeScript配置
├── vite.config.ts            # Vite配置
└── README.md                 # 前端文档
```

### 2.3 核心功能模块
1. **认证模块**：登录/注册、密码管理、会话保持
2. **仪表盘模块**：概览页面、关键指标展示
3. **交易模块**：买卖操作、订单管理、交易记录
4. **市场数据模块**：实时行情、K线图、自选股
5. **持仓管理模块**：当前持仓、盈亏计算、资产分布
6. **排行榜模块**：收益率排名、策略对比
7. **设置模块**：AI配置、通知设置、账户管理

## 3. 后端Node.js服务架构

### 3.1 技术栈
- **运行时**：Node.js 20.x LTS
- **Web框架**：Express.js 4.x + TypeScript
- **数据库ORM**：Prisma（PostgreSQL）+ Redis客户端
- **认证授权**：JWT + bcrypt（密码加密）
- **实时通信**：Socket.io
- **任务队列**：Bull（基于Redis）
- **API文档**：Swagger/OpenAPI 3.0
- **日志系统**：Winston + Morgan
- **监控**：Prometheus客户端
- **测试框架**：Jest + Supertest

### 3.2 服务结构
```
backend/
├── src/
│   ├── config/               # 配置文件
│   │   ├── index.ts          # 配置主文件
│   │   ├── database.ts       # 数据库配置
│   │   ├── redis.ts          # Redis配置
│   │   ├── auth.ts           # 认证配置
│   │   └── server.ts         # 服务器配置
│   ├── middleware/           # 中间件
│   │   ├── auth.middleware.ts # 认证中间件
│   │   ├── validation.middleware.ts # 验证中间件
│   │   ├── error.middleware.ts # 错误处理中间件
│   │   ├── logging.middleware.ts # 日志中间件
│   │   └── rate-limit.middleware.ts # 限流中间件
│   ├── controllers/          # 控制器
│   │   ├── auth.controller.ts # 认证控制器
│   │   ├── user.controller.ts # 用户控制器
│   │   ├── trading.controller.ts # 交易控制器
│   │   ├── market.controller.ts # 市场数据控制器
│   │   ├── ai.controller.ts  # AI控制器
│   │   └── ranking.controller.ts # 排行榜控制器
│   ├── services/             # 业务服务
│   │   ├── auth.service.ts   # 认证服务
│   │   ├── user.service.ts   # 用户服务
│   │   ├── trading.service.ts # 交易服务
│   │   ├── market.service.ts # 市场数据服务
│   │   ├── ai.service.ts     # AI服务（与Python服务通信）
│   │   ├── portfolio.service.ts # 持仓服务
│   │   ├── ranking.service.ts # 排行榜服务
│   │   └── notification.service.ts # 通知服务
│   ├── models/               # 数据模型
│   │   ├── user.model.ts     # 用户模型
│   │   ├── ai-account.model.ts # AI账户模型
│   │   ├── stock.model.ts    # 股票模型
│   │   ├── trade.model.ts    # 交易模型
│   │   ├── portfolio.model.ts # 持仓模型
│   │   └── decision-log.model.ts # 决策日志模型
│   ├── routes/               # API路由
│   │   ├── auth.routes.ts    # 认证路由
│   │   ├── user.routes.ts    # 用户路由
│   │   ├── trading.routes.ts # 交易路由
│   │   ├── market.routes.ts  # 市场数据路由
│   │   ├── ai.routes.ts      # AI路由
│   │   └── ranking.routes.ts # 排行榜路由
│   ├── utils/                # 工具函数
│   │   ├── logger.ts         # 日志工具
│   │   ├── validators.ts     # 验证工具
│   │   ├── formatters.ts     # 格式化工具
│   │   ├── crypto.ts         # 加密工具
│   │   ├── date.ts           # 日期工具
│   │   └── math.ts           # 数学计算工具
│   ├── types/                # TypeScript类型
│   │   ├── express.d.ts      # Express类型扩展
│   │   ├── api.types.ts      # API类型定义
│   │   └── database.types.ts # 数据库类型定义
│   ├── prisma/               # Prisma配置
│   │   ├── schema.prisma     # 数据库schema
│   │   └── migrations/       # 数据库迁移
│   ├── tasks/                # 定时任务
│   │   ├── market-data.task.ts # 市场数据更新任务
│   │   ├── ai-decision.task.ts # AI决策任务
│   │   ├── portfolio-sync.task.ts # 持仓同步任务
│   │   └── ranking-update.task.ts # 排行榜更新任务
│   ├── websocket/            # WebSocket处理
│   │   ├── server.ts         # WebSocket服务器
│   │   ├── handlers/         # 消息处理器
│   │   └── events/           # 事件定义
│   ├── app.ts                # Express应用配置
│   └── server.ts             # 服务器启动文件
├── tests/                    # 测试文件
├── package.json              # 依赖配置
├── tsconfig.json             # TypeScript配置
├── prisma/                   # Prisma配置（符号链接）
└── README.md                 # 后端文档
```

### 3.3 核心服务模块
1. **认证服务**：用户注册、登录、JWT令牌管理
2. **用户服务**：用户信息管理、偏好设置
3. **交易服务**：买卖订单处理、持仓计算、交易验证
4. **市场数据服务**：行情数据获取、缓存、推送
5. **AI服务**：与Python AI服务通信、决策请求转发
6. **持仓服务**：持仓计算、盈亏分析、风险评估
7. **排行榜服务**：收益率计算、排名更新
8. **通知服务**：交易通知、系统消息推送

## 4. Python AI服务架构

### 4.1 技术栈
- **Web框架**：FastAPI + Uvicorn
- **异步框架**：asyncio + aiohttp
- **AI SDK**：OpenAI SDK、Anthropic SDK、国内大模型SDK
- **数据处理**：pandas、numpy、scipy
- **缓存**：Redis客户端
- **消息队列**：Celery（可选，用于异步任务）
- **监控**：Prometheus客户端
- **日志**：structlog

### 4.2 服务结构
```
ai-service/
├── src/
│   ├── api/                  # API端点
│   │   ├── endpoints/        # FastAPI端点
│   │   │   ├── health.py     # 健康检查
│   │   │   ├── decision.py   # 决策端点
│   │   │   ├── analysis.py   # 分析端点
│   │   │   └── models.py     # 模型管理端点
│   │   └── dependencies.py   # 依赖注入
│   ├── core/                 # 核心逻辑
│   │   ├── config.py         # 配置管理
│   │   ├── security.py       # 安全认证
│   │   └── exceptions.py     # 异常处理
│   ├── services/             # 业务服务
│   │   ├── decision_service.py # 决策服务
│   │   ├── data_service.py   # 数据服务
│   │   ├── model_service.py  # 模型服务
│   │   └── risk_service.py   # 风险评估服务
│   ├── models/               # 数据模型
│   │   ├── schemas.py        # Pydantic模型
│   │   ├── decision.py       # 决策模型
│   │   └── market.py         # 市场数据模型
│   ├── adapters/             # AI模型适配器
│   │   ├── base.py           # 基础适配器
│   │   ├── openai_adapter.py # OpenAI适配器
│   │   ├── claude_adapter.py # Claude适配器
│   │   ├── wenxin_adapter.py # 文心一言适配器
│   │   └── qwen_adapter.py   # 通义千问适配器
│   ├── prompts/              # 提示词模板
│   │   ├── base_prompts.py   # 基础提示词
│   │   ├── trading_prompts.py # 交易提示词
│   │   ├── analysis_prompts.py # 分析提示词
│   │   └── risk_prompts.py   # 风险提示词
│   ├── utils/                # 工具函数
│   │   ├── logger.py         # 日志工具
│   │   ├── cache.py          # 缓存工具
│   │   ├── formatters.py     # 数据格式化
│   │   └── validators.py     # 数据验证
│   └── main.py               # 应用入口
├── tests/                    # 测试文件
├── requirements.txt          # Python依赖
├── pyproject.toml           # 项目配置
├── Dockerfile               # Docker配置
└── README.md                # AI服务文档
```

### 4.3 核心功能模块
1. **决策引擎**：整合市场数据、持仓信息、用户策略，生成交易决策
2. **模型适配器**：统一接口对接不同AI模型提供商
3. **提示工程**：优化提示词模板，提高决策质量
4. **风险评估**：评估交易决策的风险水平
5. **缓存管理**：缓存相似决策请求，降低API成本

## 5. 数据服务架构

### 5.1 数据采集服务
```
data-service/
├── src/
│   ├── collectors/           # 数据采集器
│   │   ├── base_collector.py # 基础采集器
│   │   ├── sina_collector.py # 新浪财经采集器
│   │   ├── tencent_collector.py # 腾讯财经采集器
│   │   ├── eastmoney_collector.py # 东方财富采集器
│   │   └── joinquant_collector.py # 聚宽采集器
│   ├── processors/           # 数据处理器
│   │   ├── cleaner.py        # 数据清洗
│   │   ├── validator.py      # 数据验证
│   │   ├── transformer.py    # 数据转换
│   │   └── normalizer.py     # 数据标准化
│   ├── storage/              # 数据存储
│   │   ├── postgres_store.py # PostgreSQL存储
│   │   ├── timescale_store.py # TimescaleDB存储
│   │   └── redis_store.py    # Redis存储
│   ├── scheduler/            # 任务调度
│   │   ├── scheduler.py      # 调度器
│   │   └── tasks.py          # 定时任务
│   └── main.py               # 服务入口
└── requirements.txt          # 依赖配置
```

### 5.2 数据处理流程
1. **数据采集**：从多个数据源定时采集股票行情数据
2. **数据清洗**：处理缺失值、异常值、格式转换
3. **数据验证**：验证数据完整性和一致性
4. **数据存储**：存储到TimescaleDB（时序数据）和PostgreSQL（基础信息）
5. **数据推送**：通过WebSocket实时推送到前端

## 6. 服务间通信机制

### 6.1 REST API通信
- **前端 ↔ 后端**：HTTP/HTTPS，JSON格式
- **后端 ↔ Python AI服务**：HTTP/HTTPS，JSON格式
- **认证机制**：JWT令牌，API密钥

### 6.2 WebSocket实时通信
- **连接建立**：前端通过Socket.io连接后端
- **事件类型**：
  - `market:update`：行情数据更新
  - `trade:executed`：交易执行通知
  - `ai:decision`：AI决策通知
  - `portfolio:update`：持仓更新
  - `system:notification`：系统通知
- **心跳机制**：30秒心跳包，保持连接活跃

### 6.3 消息队列通信
- **技术选型**：Redis + Bull（Node.js）或 Redis + Celery（Python）
- **使用场景**：
  - 异步处理AI决策请求
  - 批量更新市场数据
  - 定时计算排行榜
  - 发送系统通知

### 6.4 数据库同步
- **主从复制**：PostgreSQL主从复制，提高读取性能
- **缓存策略**：Redis缓存热点数据，减少数据库压力
- **数据一致性**：通过事务保证关键操作的数据一致性

## 7. 部署架构

### 7.1 开发环境
```
开发环境（Docker Compose）
├── 前端容器（React + Vite）
├── 后端容器（Node.js + Express）
├── AI服务容器（Python + FastAPI）
├── 数据服务容器（Python）
├── PostgreSQL容器
├── Redis容器
├── TimescaleDB容器
└── Nginx容器（反向代理）
```

### 7.2 生产环境
```
生产环境（Kubernetes）
├── 命名空间：stock-race
│   ├── 部署（Deployments）：
│   │   ├── frontend-deployment（前端）
│   │   ├── backend-deployment（后端）
│   │   ├── ai-service-deployment（AI服务）
│   │   └── data-service-deployment（数据服务）
│   ├── 服务（Services）：
│   │   ├── frontend-service（LoadBalancer）
│   │   ├── backend-service（ClusterIP）
│   │   ├── ai-service-service（ClusterIP）
│   │   └── data-service-service（ClusterIP）
│   ├── 配置（ConfigMaps/Secrets）：
│   │   ├── 应用配置
│   │   ├── 数据库连接
│   │   └── API密钥
│   ├── 持久化存储（PersistentVolumes）：
│   │   ├── postgres-pv（PostgreSQL数据）
│   │   ├── redis-pv（Redis数据）
│   │   └── timescale-pv（TimescaleDB数据）
│   └── 监控（Monitoring）：
│       ├── Prometheus
│       ├── Grafana
│       └── 应用日志收集
```

### 7.3 扩展方案
1. **水平扩展**：无状态服务（前端、后端、AI服务）可水平扩展
2. **数据库扩展**：PostgreSQL读写分离，Redis集群
3. **CDN加速**：前端静态资源通过CDN分发
4. **负载均衡**：Nginx或云服务商负载均衡器

## 8. 安全架构

### 8.1 网络安全
- **HTTPS/TLS**：全站HTTPS，使用Let's Encrypt证书
- **WSS**：WebSocket Secure加密通信
- **防火墙**：云安全组，限制不必要的端口访问
- **DDoS防护**：云服务商DDoS防护服务

### 8.2 应用安全
- **输入验证**：所有用户输入验证和清理
- **SQL注入防护**：使用ORM参数化查询
- **XSS防护**：输出编码，CSP策略
- **CSRF防护**：SameSite Cookie，CSRF令牌

### 8.3 数据安全
- **密码加密**：bcrypt哈希加盐存储
- **敏感数据加密**：数据库字段加密
- **API密钥管理**：密钥轮换，最小权限原则
- **审计日志**：完整操作日志，不可篡改

### 8.4 金融安全
- **交易验证**：防止重复交易、超卖、价格操纵
- **风险控制**：最大持仓限制，单日交易限额
- **合规检查**：交易时间验证，股票停牌检查

## 9. 监控与运维

### 9.1 监控指标
- **应用性能**：响应时间、错误率、吞吐量
- **系统资源**：CPU、内存、磁盘、网络
- **业务指标**：活跃用户、交易量、AI决策成功率
- **数据质量**：数据延迟、数据完整性

### 9.2 日志系统
- **结构化日志**：JSON格式，便于分析
- **日志分级**：DEBUG、INFO、WARN、ERROR
- **日志收集**：ELK Stack或云日志服务
- **日志保留**：业务日志保留90天，审计日志保留1年

### 9.3 告警机制
- **阈值告警**：关键指标超过阈值自动告警
- **异常检测**：机器学习异常检测
- **通知渠道**：邮件、短信、钉钉、企业微信
- **告警升级**：多级告警，未处理自动升级

---

*文档版本：v1.0*
*创建日期：2026-02-02*
*最后更新：2026-02-02*
*维护者：架构设计智能体*