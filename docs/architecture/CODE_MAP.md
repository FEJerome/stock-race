# AI股票竞赛平台 - 代码结构地图

## 📋 文档简介

本文件作为项目的 **代码结构地图**（Code Map），提供：
- 关键文件的功能说明和代码入口点
- 核心模块的调用关系图
- 智能体工作目录与具体代码文件的对应关系
- 代码变更历史和重要修改记录

**目标**：帮助新会话快速理解项目结构，减少上下文开销，提高开发效率。

## 🚀 快速导航

### 架构文档
- [**系统架构设计**](SYSTEM_ARCHITECTURE.md) - 混合架构设计
- [**数据库设计**](DATABASE_DESIGN.md) - 数据库ER图和表结构
- [**API接口规范**](API_SPECIFICATION.md) - RESTful API和WebSocket设计
- [**数据流架构**](DATA_FLOW_ARCHITECTURE.md) - 数据采集和处理流程
- [**技术架构**](TECH_STACK.md) - 技术栈版本和选型理由

### 其他核心文档
- [**项目主文档**](../../CLAUDE.md) - 项目文档导航中心
- [**新手指南**](../../docs/usage/QUICK_START.md) - 环境搭建和快速上手
- [**开发规范**](../../docs/development/CODING_STANDARDS.md) - 编码标准与最佳实践

## 🗺️ 核心模块代码映射

### 前端模块 (frontend/)
```
frontend/src/
├── main.tsx                    # 应用入口点
├── App.tsx                     # 根组件，路由配置（已更新包含TestAPI路由）
├── types/
│   └── api.types.ts           # TypeScript类型定义（用户、股票、交易、AI等）
├── store/
│   └── auth.store.ts          # Zustand认证状态管理（含持久化）
├── services/                   # API服务层
│   ├── api.ts                 # Axios基础配置和拦截器
│   ├── auth.service.ts        # 认证服务（真实API + 降级机制）
│   ├── trading.service.ts     # 交易服务（真实API + 缓存 + 降级机制）
│   ├── market.service.ts      # 市场数据服务（真实API + 缓存 + 降级机制）
│   └── ai.service.ts          # AI服务（真实API + 缓存 + 降级机制）
├── hooks/
│   └── useWebSocket.ts        # WebSocket连接管理（含心跳、重连）
├── utils/
│   ├── formatters.ts          # 数据格式化工具（货币、百分比、日期等）
│   └── cache.ts               # 缓存工具（多级缓存，A股交易时间感知）
├── components/
│   ├── common/
│   │   └── ProtectedRoute.tsx # 路由保护组件（认证检查）
│   ├── layout/
│   │   └── MainLayout.tsx     # 主布局组件（响应式侧边栏）
│   ├── charts/
│   │   └── ProfitChart.tsx    # 收益曲线图表组件
│   ├── market/
│   │   └── RealTimeQuotes.tsx # 实时行情组件（WebSocket模拟）
│   ├── portfolio/
│   │   └── PortfolioSummary.tsx # 持仓汇总组件
│   └── ai/
│       └── AIDecisionLog.tsx  # AI决策日志组件
├── pages/                      # 页面组件
│   ├── Login.tsx              # 登录页面（表单验证）
│   ├── Dashboard.tsx          # 仪表板页面（集成所有数据）
│   ├── Competition.tsx        # 竞赛页面（排行榜）
│   ├── AIAccounts.tsx         # AI账户管理页面
│   ├── Trading.tsx            # 交易页面（买卖表单、实时数据）
│   ├── Analytics.tsx          # 分析页面（图表工具）
│   ├── Settings.tsx           # 设置页面（用户偏好）
│   └── TestAPI.tsx            # API测试页面（服务集成验证）
│   └── Settings.tsx           # 设置页面
├── services/                   # API服务层
│   └── api.ts                 # API客户端封装
├── stores/                     # 状态管理
│   └── useStore.ts            # Zustand状态存储
├── hooks/                      # 自定义Hooks
├── utils/                      # 工具函数
└── types/                      # TypeScript类型定义
```

### 后端模块 (backend/)
```
backend/src/
├── app.js                      # Express应用入口点（已集成WebSocket）
├── database/                   # 数据库相关
│   ├── connection.js          # PostgreSQL连接
│   └── redis.js               # Redis连接
├── routes/                     # API路由
│   ├── index.js               # 主路由聚合（已包含所有新路由）
│   ├── auth.js                # 认证路由
│   ├── aiAccounts.js          # AI账户路由（新创建）
│   ├── stocks.js              # 股票数据路由（新创建）
│   ├── trades.js              # 交易路由（新创建）
│   ├── portfolios.js          # 持仓路由（新创建）
│   └── market.js              # 市场数据路由（新创建）
├── controllers/                # 控制器
│   ├── AuthController.js      # 认证控制器
│   ├── TradeController.js     # 交易控制器（新创建，已集成虚拟交易服务）
│   ├── StockController.js     # 股票控制器（新创建，已集成数据服务）
│   ├── AIController.js        # AI控制器（新创建，已集成AI服务）
│   ├── PortfolioController.js # 持仓控制器（新创建）
│   └── MarketController.js    # 市场控制器（新创建）
├── services/                   # 业务服务
│   ├── AuthService.js         # 认证服务
│   ├── SessionService.js      # 会话服务
│   ├── WebSocketService.js    # WebSocket实时数据推送服务（新创建）
│   ├── AIService.js           # AI服务集成（新创建）
│   ├── DataService.js         # 数据服务集成（新创建）
│   └── VirtualTradingService.js # 虚拟交易逻辑服务（新创建）
├── models/                     # 数据模型（Repository模式）
│   ├── index.js               # 模型聚合
│   ├── UserRepository.js      # 用户数据访问
│   ├── AIAccountRepository.js # AI账户数据访问
│   ├── StockRepository.js     # 股票数据访问
│   ├── TradeRepository.js     # 交易数据访问
│   ├── PortfolioRepository.js # 持仓数据访问
│   ├── CompetitionRepository.js # 竞赛数据访问
│   ├── SystemLogRepository.js # 系统日志数据访问
│   └── DecisionLogRepository.js # AI决策日志数据访问
├── middlewares/                # 中间件
│   ├── auth.js                # 认证中间件
│   ├── errorHandler.js        # 错误处理中间件
│   └── rateLimiter.js         # 速率限制中间件
├── utils/                      # 工具类
│   ├── logger.js              # 日志工具
│   └── validators.js          # 验证工具
└── test/                       # 测试文件（新创建）
    ├── test-setup.js          # 测试环境配置
    ├── controllers/           # 控制器测试
    │   ├── TradeController.test.js
    │   ├── StockController.test.js
    │   ├── AIController.test.js
    │   ├── PortfolioController.test.js
    │   └── MarketController.test.js
    ├── services/              # 服务测试
    │   └── VirtualTradingService.test.js
    └── integration/           # 集成测试
        └── trade-flow.test.js
```

### AI服务模块 (ai-service/)
```
ai-service/src/ai_service/
├── main.py                     # FastAPI应用入口
├── core/                       # 核心配置
│   ├── config.py              # 配置管理
│   ├── database.py            # 数据库连接
│   ├── redis.py               # Redis连接
│   ├── security.py            # 安全认证和JWT
│   └── exceptions.py          # 自定义异常处理
├── services/                   # AI服务逻辑
│   └── decision_service.py    # AI决策服务
├── api/                        # API路由
│   ├── endpoints/             # API端点
│   │   ├── health.py          # 健康检查端点
│   │   └── decision.py        # 决策端点
│   ├── dependencies.py        # 依赖注入
│   └── routes.py              # 路由定义
├── models/                     # 数据模型
│   └── schemas.py             # Pydantic数据模型
├── adapters/                   # AI模型适配器
│   ├── base.py                # 基础适配器接口
│   ├── openai_adapter.py      # OpenAI适配器
│   ├── deepseek_adapter.py    # DeepSeek适配器
│   ├── claude_adapter.py      # Claude适配器
│   ├── qwen_adapter.py        # Qwen适配器
│   └── wenxin_adapter.py      # 文心一言适配器
├── prompts/                    # 提示词模板
│   ├── base_prompts.py        # 基础提示词工具
│   └── trading_prompts.py     # 交易提示词模板
└── utils/                      # 工具函数
    ├── logger.py              # 日志工具
    └── cache.py               # 缓存工具
```

### 数据服务模块 (data-service/)
```
data-service/src/data_service/
├── main.py                     # FastAPI应用入口
├── core/                       # 核心配置
│   ├── config.py              # 配置管理
│   ├── database.py            # 数据库连接
│   ├── redis.py               # Redis连接
│   └── security.py            # 安全认证和JWT
├── api/                        # API路由
│   ├── routes.py              # 路由定义（RESTful API和WebSocket）
│   └── dependencies.py        # 依赖注入
├── services/                   # 数据服务逻辑
│   ├── data_service.py        # 主数据服务类
│   ├── realtime_service.py    # 实时数据推送服务
│   └── market_monitor.py      # 市场监控器
├── collectors/                 # 数据采集器
│   ├── base.py                # 数据源适配器基类
│   ├── sina.py                # 新浪财经数据源适配器
│   ├── tencent.py             # 腾讯财经数据源适配器
│   └── eastmoney.py           # 东方财富数据源适配器
├── processors/                 # 数据处理器
│   └── data_processor.py      # 数据清洗、验证、转换和增强处理
├── storage/                    # 数据存储层
│   ├── database.py            # TimescaleDB和PostgreSQL存储
│   └── cache.py               # Redis缓存层
├── models/                     # 数据模型
│   └── stock.py               # Pydantic数据模型（StockSymbol、StockQuote、StockData等）
├── utils/                      # 工具函数
│   ├── logger.py              # 日志工具
│   ├── helpers.py             # 通用工具函数
│   └── cache.py               # 缓存工具
└── tests/                      # 测试代码
    └── test_data_service.py   # 数据服务测试套件
```

## 🔍 关键文件功能说明

### 入口文件
- **frontend/src/main.tsx**: React应用入口，配置Ant Design和路由
- **backend/src/index.js**: Node.js服务器入口，初始化Express和数据库连接
- **ai-service/src/ai_service/main.py**: AI服务FastAPI应用入口
- **data-service/src/data_service/main.py**: 数据服务FastAPI应用入口，初始化FastAPI应用、数据库连接和WebSocket服务

### 数据服务关键文件
- **data-service/src/data_service/api/routes.py**: RESTful API和WebSocket路由定义，包含股票查询、历史数据、批量报价、市场状态、技术指标等端点
- **data-service/src/data_service/services/data_service.py**: 主数据服务类，协调数据采集、处理、存储和缓存操作
- **data-service/src/data_service/collectors/base.py**: 数据源适配器基类，定义通用HTTP请求、重试、速率限制等功能
- **data-service/src/data_service/collectors/sina.py**: 新浪财经数据源适配器，实现新浪财经API数据采集
- **data-service/src/data_service/collectors/tencent.py**: 腾讯财经数据源适配器，实现腾讯财经API数据采集
- **data-service/src/data_service/collectors/eastmoney.py**: 东方财富数据源适配器，实现东方财富API数据采集
- **data-service/src/data_service/processors/data_processor.py**: 数据处理器，实现数据清洗、验证、合并、技术指标计算等功能
- **data-service/src/data_service/storage/database.py**: 数据库存储层，实现TimescaleDB和PostgreSQL的存储操作
- **data-service/src/data_service/storage/cache.py**: Redis缓存层，实现多级缓存策略和实时数据推送
- **data-service/src/data_service/services/realtime_service.py**: 实时数据推送服务，实现WebSocket连接管理和实时数据推送
- **data-service/src/data_service/models/stock.py**: Pydantic数据模型，定义StockSymbol、StockQuote、StockData、TechnicalIndicator等模型
- **data-service/tests/test_data_service.py**: 数据服务测试套件，包含数据处理器和数据服务的单元测试

### 配置文件
- **frontend/vite.config.ts**: Vite构建配置，包含代理设置和路径别名
- **frontend/tsconfig.json**: TypeScript配置，包含路径映射
- **backend/.env.example**: 后端环境变量示例
- **ai-service/.env.example**: AI服务环境变量示例
- **data-service/.env.example**: 数据服务环境变量示例
- **docker-compose.yml**: Docker Compose开发环境配置

### 数据库配置
- **docker/postgres/init.sql**: PostgreSQL数据库初始化脚本
- **docker/timescaledb/init.sql**: TimescaleDB时序数据库初始化脚本

### CI/CD配置
- **.github/workflows/ci.yml**: GitHub Actions持续集成配置
- **.github/workflows/cd.yml**: GitHub Actions持续部署配置

## 🔄 核心流程调用关系图

```
用户请求 → 前端 (React) → 后端API (Express) → 数据库 (PostgreSQL)
                                ↓
                         AI服务 (FastAPI) → AI模型 (OpenAI/Anthropic)
                                ↓
                        数据服务 (FastAPI) → 数据源 (股票API)
                                ↓
                        时序数据库 (TimescaleDB)

实时数据流:
股票数据源 → 数据服务 → Redis缓存 → 后端WebSocket → 前端实时更新
```

### 主要数据流
1. **用户登录流程**: 前端 → 后端认证 → PostgreSQL用户表
2. **交易决策流程**: 市场数据 → AI服务分析 → 交易信号 → 后端执行
3. **数据采集流程**: 外部API → 数据服务 → TimescaleDB存储
4. **实时监控流程**: WebSocket连接 → 实时数据推送 → 前端展示

## 🤖 智能体工作目录与代码文件对应表

| 智能体角色 | 工作目录 | 主要代码文件 | 职责说明 |
|-----------|---------|-------------|----------|
| **架构设计智能体** | `/docs/architecture/` | `SYSTEM_ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `API_SPECIFICATION.md` | 系统架构设计、数据库设计、API规范制定 |
| 基础设施智能体 | 项目根目录 | docker-compose.yml, .github/workflows/ | 项目脚手架、Docker配置、CI/CD流水线 |
| 前端开发智能体 | frontend/ | src/App.tsx, src/components/, src/pages/ | React组件开发、UI界面实现 |
| 后端开发智能体 | backend/ | src/index.js, src/routes/, src/controllers/ | API开发、业务逻辑实现 |
| **AI集成智能体** | ai-service/ | src/ai_service/adapters/, src/ai_service/services/decision_service.py | AI模型集成、交易决策算法、提示词工程 |
| **数据服务智能体** | data-service/ | src/data_service/api/routes.py, src/data_service/services/data_service.py, src/data_service/collectors/, src/data_service/processors/data_processor.py | 股票数据采集、清洗、存储、实时推送、API服务 |
| 数据库智能体 | docker/ | postgres/init.sql, timescaledb/init.sql | 数据库设计、迁移脚本 |

## 📜 代码变更历史

### 2026-02-02: 架构设计阶段
- **创建者**: 架构设计智能体
- **变更内容**:
  - 创建系统架构设计文档 (`SYSTEM_ARCHITECTURE.md`)
  - 创建数据库设计文档 (`DATABASE_DESIGN.md`)
  - 创建API接口规范文档 (`API_SPECIFICATION.md`)
  - 创建数据流架构文档 (`DATA_FLOW_ARCHITECTURE.md`)
  - 更新技术架构文档 (`TECH_STACK.md`)
  - 更新代码结构地图 (`CODE_MAP.md`)

### 关键文件创建:
- `/docs/architecture/SYSTEM_ARCHITECTURE.md` - 系统架构设计
- `/docs/architecture/DATABASE_DESIGN.md` - 数据库设计
- `/docs/architecture/API_SPECIFICATION.md` - API接口规范
- `/docs/architecture/DATA_FLOW_ARCHITECTURE.md` - 数据流架构
- 更新 `/docs/architecture/TECH_STACK.md` - 技术架构文档
- 更新 `/docs/architecture/CODE_MAP.md` - 代码结构地图

### 2026-02-02: 项目基础设施搭建
- **创建者**: 基础设施智能体
- **变更内容**:
  - 创建完整的项目目录结构
  - 配置前端React + TypeScript + Vite项目
  - 配置后端Node.js + Express + PostgreSQL项目
  - 配置Python AI服务 (FastAPI + OpenAI/Anthropic)
  - 配置Python数据服务 (FastAPI + TimescaleDB)
  - 创建Docker Compose开发环境
  - 配置GitHub Actions CI/CD流水线
  - 更新项目结构文档
  - 创建代码结构地图初始记录

### 关键文件创建:
- `/frontend/package.json` - 前端依赖配置
- `/backend/package.json` - 后端依赖配置
- `/ai-service/pyproject.toml` - AI服务Python配置
- `/data-service/pyproject.toml` - 数据服务Python配置
- `/docker-compose.yml` - Docker开发环境配置
- `/.github/workflows/ci.yml` - CI流水线配置
- `/.github/workflows/cd.yml` - CD流水线配置
- `/docs/architecture/PROJECT_STRUCTURE.md` - 项目结构文档
- `/docs/architecture/CODE_MAP.md` - 代码结构地图初始版本

### 2026-02-03: AI服务开发完成
- **创建者**: AI集成智能体
- **变更内容**:
  - 完成Python AI服务核心功能开发
  - 实现多模型AI适配器（OpenAI、DeepSeek、Claude等）
  - 创建股票交易提示词模板库
  - 实现AI决策服务和API端点
  - 添加JWT认证和速率限制
  - 实现Redis缓存和数据库连接
  - 编写完整的单元测试和集成测试
  - 更新AI服务README文档

### 关键文件创建:
- `/ai-service/src/ai_service/models/schemas.py` - Pydantic数据模型
- `/ai-service/src/ai_service/adapters/` - AI模型适配器
- `/ai-service/src/ai_service/prompts/` - 提示词模板
- `/ai-service/src/ai_service/services/decision_service.py` - 决策服务
- `/ai-service/src/ai_service/api/endpoints/` - API端点
- `/ai-service/src/ai_service/utils/logger.py` - 日志工具
- `/ai-service/src/ai_service/utils/cache.py` - 缓存工具
- `/ai-service/tests/` - 测试套件
- `/ai-service/README.md` - AI服务文档

### 2026-02-03: 数据服务开发完成
- **创建者**: 数据工程智能体
- **变更内容**:
  - 完成Python数据服务核心功能开发
  - 实现多数据源适配器（新浪财经、腾讯财经、东方财富）
  - 创建数据清洗、验证、转换和增强处理管道
  - 实现TimescaleDB时序数据库和PostgreSQL关系数据库存储
  - 实现Redis多级缓存策略和实时数据推送
  - 实现WebSocket实时数据推送服务
  - 实现JWT认证和用户管理
  - 实现完整的数据质量监控
  - 编写完整的单元测试和集成测试
  - 更新数据服务README文档和Docker配置

### 关键文件创建:
- `/data-service/src/data_service/api/routes.py` - RESTful API和WebSocket路由
- `/data-service/src/data_service/models/stock.py` - Pydantic数据模型
- `/data-service/src/data_service/collectors/base.py` - 数据源适配器基类
- `/data-service/src/data_service/collectors/sina.py` - 新浪财经数据源适配器
- `/data-service/src/data_service/collectors/tencent.py` - 腾讯财经数据源适配器
- `/data-service/src/data_service/collectors/eastmoney.py` - 东方财富数据源适配器
- `/data-service/src/data_service/processors/data_processor.py` - 数据处理器
- `/data-service/src/data_service/storage/database.py` - 数据库存储层
- `/data-service/src/data_service/storage/cache.py` - Redis缓存层
- `/data-service/src/data_service/services/data_service.py` - 主数据服务类
- `/data-service/src/data_service/services/realtime_service.py` - 实时数据推送服务
- `/data-service/tests/test_data_service.py` - 数据服务测试套件
- `/data-service/requirements.txt` - Python依赖配置
- `/data-service/Dockerfile` - Docker容器配置
- `/data-service/README.md` - 数据服务文档

### 2026-02-03: 功能演示脚本创建
- **创建者**: 首席架构师智能体
- **变更内容**:
  - 创建核心功能演示脚本 (`demo_stock_race.py`)
  - 创建增强演示脚本 (`demo_enhanced.py`)
  - 演示脚本展示完整的AI股票交易流程
  - 包含股票数据生成、AI决策、虚拟交易、持仓管理、收益计算等功能
  - 可在无Docker环境下运行展示项目核心功能

### 关键文件创建:
- `/demo_stock_race.py` - 核心功能演示脚本
- `/demo_enhanced.py` - 增强演示脚本（展示完整交易流程）

### 2026-02-05 ~ 2026-02-06: 前端模拟数据改造项目
- **创建者**: 首席架构师
- **变更内容**:
  - 将前端所有模拟数据改为真实数据，共完成6个阶段
  - 阶段一：认证系统连接 - 打通前后端认证，实现降级机制
  - 阶段二：市场数据服务改造 - 创建缓存工具，实现A股交易时间感知的缓存策略
  - 阶段三：交易系统改造 - 修改7个核心函数调用真实API
  - 阶段四：AI系统改造 - 修改11个核心函数调用真实API
  - 阶段五：组件层清理 - 移除所有组件中的模拟数据
  - 阶段六：测试与优化 - 创建端到端测试脚本，验证所有功能
  - 实现多级缓存机制（内存+本地存储），优化非交易时间数据获取
  - 保留完整的降级机制，确保系统始终可用
  - 创建完整文档体系，包括6个阶段文档和最终总结报告

### 关键文件修改和创建:
- `/frontend/src/utils/cache.ts` - 缓存工具（新创建）
- `/frontend/src/services/auth.service.ts` - 认证服务（修改为真实API + 降级）
- `/frontend/src/services/market.service.ts` - 市场数据服务（修改为真实API + 缓存）
- `/frontend/src/services/trading.service.ts` - 交易服务（修改为真实API + 缓存）
- `/frontend/src/services/ai.service.ts` - AI服务（修改为真实API + 缓存）
- `/frontend/src/pages/Analytics.tsx` - 分析页面（移除模拟数据）
- `/frontend/src/pages/Competition.tsx` - 竞赛页面（移除模拟数据）
- `/frontend/src/pages/Settings.tsx` - 设置页面（移除模拟数据）
- `/test_frontend_real_data.sh` - 前端真实数据验证脚本（新创建）
- `/test_cache_mechanism.sh` - 缓存机制测试脚本（新创建）
- `/test_login.sh` - 登录测试脚本（新创建）
- `/docs/development/FRONTEND_DATA_MIGRATION_PHASE1-6.md` - 阶段文档（新创建）
- `/docs/development/FRONTEND_DATA_MIGRATION_SUMMARY.md` - 项目总结报告（新创建）
- `/backend/src/config.js` - 后端配置中心（新创建，解决JWT验证问题）

## 🚀 开发环境快速参考

### 服务访问地址
- **前端**: http://localhost:3000
- **后端API**: http://localhost:3001
- **API文档**: http://localhost:3001/api-docs
- **AI服务**: http://localhost:8000
- **数据服务**: http://localhost:8001

### 启动命令
```bash
# 一键启动所有服务
docker-compose up -d

# 单独启动服务
cd frontend && npm run dev          # 前端开发
cd backend && npm run dev           # 后端开发
cd ai-service && uvicorn ai_service.main:app --reload  # AI服务
cd data-service && uvicorn data_service.main:app --reload  # 数据服务
```

### 更多信息
详细的环境搭建和开发指南请参考 [新手指南](../../docs/usage/QUICK_START.md)

## 📌 重要说明

### 架构设计原则
1. **混合架构**：Node.js + React + Python，发挥各技术栈优势
2. **MVP优先**：优先实现核心功能，支持未来扩展
3. **实时性要求**：股票行情延迟 < 5秒，交易执行 < 1秒
4. **安全性要求**：密码加密、API认证、数据安全合规
5. **扩展性设计**：支持多用户、多AI模型、高级功能扩展

### 技术栈版本
- **Node.js**: 20.x LTS
- **Python**: 3.11+
- **React**: 18.x + TypeScript 5.0+
- **PostgreSQL**: 15.x + TimescaleDB 2.11+
- **Redis**: 7.0+

### 数据库配置
- **PostgreSQL**: 存储用户数据、交易记录、AI账户等结构化数据
- **TimescaleDB**: 存储股票行情时序数据、技术指标
- **Redis**: 缓存、会话管理、实时数据、消息队列

### 开发环境
- 使用Docker Compose一键启动所有服务
- 包含pgAdmin和Redis Commander管理工具
- 支持热重载开发模式
- 完整的CI/CD流水线配置

### 部署架构
- **开发环境**：Docker Compose本地部署
- **测试环境**：独立服务器，自动化部署
- **生产环境**：Kubernetes集群，弹性扩展
- **监控告警**：Prometheus + Grafana + Alertmanager

### 架构设计文档
- **系统架构**：详细描述混合架构和各服务模块
- **数据库设计**：完整的ER图和表结构设计
- **API规范**：RESTful API和WebSocket接口定义
- **数据流架构**：股票数据采集和AI决策流程
- **技术架构**：具体技术栈版本和部署方案

### 下一步开发重点
1. **基于架构设计实现核心功能**
2. **按照API规范开发前后端接口**
3. **根据数据库设计实现数据模型**
4. **按照数据流架构实现各服务模块**
5. **基于技术架构进行部署和优化**

---

*本文档最后更新于: 2026-02-06*
*文档维护者: 首席架构师 (前端模拟数据改造项目更新)*