# Stock Race 项目结构

## 项目目录结构

```
stock-race/
├── frontend/                    # React前端应用
│   ├── src/
│   │   ├── components/         # React组件
│   │   ├── pages/             # 页面组件
│   │   ├── hooks/             # 自定义Hooks
│   │   ├── utils/             # 工具函数
│   │   ├── services/          # API服务层
│   │   ├── stores/            # 状态管理（Zustand）
│   │   ├── types/             # TypeScript类型定义
│   │   ├── assets/            # 静态资源
│   │   ├── styles/            # 样式文件
│   │   ├── App.tsx            # 根组件
│   │   └── main.tsx           # 应用入口
│   ├── public/                # 公共资源
│   ├── package.json           # 前端依赖配置
│   ├── vite.config.ts         # Vite构建配置
│   ├── tsconfig.json          # TypeScript配置
│   ├── tailwind.config.js     # Tailwind CSS配置
│   ├── postcss.config.js      # PostCSS配置
│   └── index.html             # HTML模板
├── backend/                    # Node.js后端API服务
│   ├── src/
│   │   ├── controllers/       # 控制器
│   │   ├── services/          # 业务服务
│   │   ├── models/            # 数据模型
│   │   ├── routes/            # API路由
│   │   ├── middlewares/       # 中间件
│   │   ├── utils/             # 工具类
│   │   ├── database/          # 数据库相关
│   │   │   ├── migrations/    # 数据库迁移
│   │   │   └── seeds/         # 种子数据
│   │   ├── sockets/           # WebSocket处理
│   │   ├── jobs/              # 后台任务
│   │   └── config/            # 配置文件
│   ├── package.json           # 后端依赖配置
│   ├── index.js               # 服务器入口
│   └── .env.example           # 环境变量示例
├── ai-service/                 # Python AI服务
│   ├── src/ai_service/
│   │   ├── core/              # 核心配置和工具
│   │   ├── models/            # 数据模型
│   │   ├── services/          # AI服务逻辑
│   │   ├── utils/             # 工具函数
│   │   └── api/               # FastAPI路由
│   ├── tests/                 # 测试文件
│   ├── pyproject.toml         # Python项目配置
│   ├── .env.example           # 环境变量示例
│   └── README.md              # AI服务文档
├── data-service/               # Python数据服务
│   ├── src/data_service/
│   │   ├── core/              # 核心配置和工具
│   │   ├── models/            # 数据模型
│   │   ├── services/          # 数据服务逻辑
│   │   ├── utils/             # 工具函数
│   │   ├── api/               # FastAPI路由
│   │   ├── collectors/        # 数据采集器
│   │   └── processors/        # 数据处理器
│   ├── tests/                 # 测试文件
│   ├── pyproject.toml         # Python项目配置
│   ├── .env.example           # 环境变量示例
│   └── README.md              # 数据服务文档
├── scripts/                    # 工具脚本
│   ├── setup-dev.sh           # 开发环境设置脚本
│   ├── deploy.sh              # 部署脚本
│   └── backup.sh              # 数据备份脚本
├── docker/                     # Docker配置文件
│   ├── postgres/              # PostgreSQL配置
│   │   └── init.sql           # 数据库初始化脚本
│   └── timescaledb/           # TimescaleDB配置
│       └── init.sql           # 时序数据库初始化脚本
├── config/                     # 配置文件目录
│   ├── nginx/                 # Nginx配置
│   ├── certbot/               # SSL证书配置
│   └── monitoring/            # 监控配置
├── docs/                       # 项目文档目录
│   ├── architecture/          # 架构设计文档
│   ├── development/           # 开发规范文档
│   ├── planning/              # 项目规划文档
│   ├── agents/                # 多智能体协作文档
│   ├── testing/               # 测试文档
│   ├── usage/                 # 使用文档
│   └── analysis/              # 需求分析文档
├── .github/workflows/         # GitHub Actions工作流
│   ├── ci.yml                 # 持续集成配置
│   └── cd.yml                 # 持续部署配置
├── docker-compose.yml         # Docker Compose开发环境配置
├── docker-compose.prod.yml    # Docker Compose生产环境配置
├── .gitignore                 # Git忽略配置
├── CLAUDE.md                  # 本项目主文档
└── README.md                  # 项目README
```

## 各服务说明

### 前端服务 (frontend/)
- **技术栈**: React 18 + TypeScript + Vite + Ant Design + Tailwind CSS
- **主要功能**: 用户界面展示、交易操作、数据可视化、实时监控
- **开发命令**: `npm run dev` (开发), `npm run build` (构建), `npm run preview` (预览)

### 后端服务 (backend/)
- **技术栈**: Node.js 20+ + Express + PostgreSQL + Redis + Socket.IO
- **主要功能**: 用户认证、账户管理、交易处理、实时通信、数据持久化
- **开发命令**: `npm run dev` (开发), `npm start` (生产), `npm test` (测试)

### AI服务 (ai-service/)
- **技术栈**: Python 3.11+ + FastAPI + OpenAI/Anthropic API + Redis
- **主要功能**: AI模型集成、交易决策生成、风险评估、策略分析
- **开发命令**: `uvicorn ai_service.main:app --reload` (开发)

### 数据服务 (data-service/)
- **技术栈**: Python 3.11+ + FastAPI + TimescaleDB + pandas + yfinance
- **主要功能**: 股票数据采集、技术指标计算、市场监控、数据存储
- **开发命令**: `uvicorn data_service.main:app --reload` (开发)

### 数据库服务
- **PostgreSQL**: 存储用户数据、账户信息、交易记录等结构化数据
- **TimescaleDB**: 存储时间序列数据（股票价格、技术指标等）
- **Redis**: 缓存、会话管理、消息队列

## 开发环境启动

1. **一键启动所有服务**:
   ```bash
   docker-compose up -d
   ```

2. **单独启动服务**:
   ```bash
   # 前端开发
   cd frontend && npm run dev

   # 后端开发
   cd backend && npm run dev

   # AI服务开发
   cd ai-service && uvicorn ai_service.main:app --reload

   # 数据服务开发
   cd data-service && uvicorn data_service.main:app --reload
   ```

## 访问地址

- **前端**: http://localhost:3000
- **后端API**: http://localhost:3001
- **后端API文档**: http://localhost:3001/api-docs
- **AI服务**: http://localhost:8000
- **数据服务**: http://localhost:8001
- **pgAdmin**: http://localhost:5050 (用户名: admin@stock-race.com, 密码: admin123)
- **Redis Commander**: http://localhost:8081

## 项目特点

1. **微服务架构**: 前后端分离，AI和数据服务独立部署
2. **实时性**: WebSocket实时通信，实时数据更新
3. **可扩展性**: 模块化设计，易于添加新功能
4. **监控完善**: 健康检查、日志记录、性能监控
5. **开发友好**: Docker Compose一键启动，完整的开发工具链