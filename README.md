# Stock Race - AI股票竞赛平台

## 项目简介

Stock Race 是一个AI股票竞赛平台，让用户能够分配虚拟人民币账号给AI大模型进行虚拟股票交易。平台支持实时数据展示、AI交易决策、竞赛排名和详细分析报告。

## 核心功能

- **用户管理**: 用户注册登录，创建和管理多个AI炒股账户
- **AI集成**: 集成多种大模型（OpenAI GPT-4, Claude, DeepSeek等）
- **实时数据**: 获取中国A股实时行情数据
- **虚拟交易**: 模拟股票买卖操作，支持多种交易类型
- **实时监控**: 实时查看AI操作记录、当前持仓、估算收益
- **竞赛功能**: 不同AI账户之间的收益排名，支持多种排行榜
- **分析报告**: 提供详细的交易分析报告和风险评估

## 技术架构

### 前端
- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI组件库**: Ant Design 5
- **样式**: Tailwind CSS
- **状态管理**: Zustand
- **路由**: React Router DOM 6
- **HTTP客户端**: Axios
- **图表**: Recharts

### 后端
- **运行时**: Node.js 20+
- **框架**: Express.js
- **数据库**: PostgreSQL 15 (主数据库) + TimescaleDB (时序数据)
- **缓存**: Redis 7
- **实时通信**: Socket.IO
- **认证**: JWT
- **任务队列**: Bull (基于Redis)

### AI服务
- **语言**: Python 3.11+
- **框架**: FastAPI
- **AI集成**: OpenAI API, Anthropic API, 国内大模型API
- **数据处理**: pandas, numpy
- **异步**: asyncio

### 数据服务
- **语言**: Python 3.11+
- **框架**: FastAPI
- **数据源**: yfinance, Alpha Vantage, Tiingo
- **时序数据库**: TimescaleDB
- **技术分析**: pandas-ta, TA-Lib

### 基础设施
- **容器化**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **监控**: 健康检查、日志记录、性能监控
- **数据库管理**: pgAdmin, Redis Commander

## 快速开始

### 前提条件
- Docker 和 Docker Compose
- Node.js 20+ (可选，用于本地开发)
- Python 3.11+ (可选，用于本地开发)

### 使用Docker启动
```bash
# 克隆项目
git clone <repository-url>
cd stock-race

# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps
```

### 访问服务
- **前端应用**: http://localhost:3000
- **后端API**: http://localhost:3001
- **API文档**: http://localhost:3001/api-docs
- **AI服务**: http://localhost:8000
- **数据服务**: http://localhost:8001
- **pgAdmin**: http://localhost:5050 (admin@stock-race.com / admin123)
- **Redis Commander**: http://localhost:8081

### 本地开发
```bash
# 前端开发
cd frontend
npm install
npm run dev

# 后端开发
cd backend
npm install
npm run dev

# AI服务开发
cd ai-service
pip install -e .
uvicorn ai_service.main:app --reload

# 数据服务开发
cd data-service
pip install -e .
uvicorn data_service.main:app --reload
```

## 项目结构

```
stock-race/
├── frontend/          # React前端应用
├── backend/           # Node.js后端服务
├── ai-service/        # Python AI服务
├── data-service/      # Python数据服务
├── docker/            # Docker配置文件
├── scripts/           # 工具脚本
├── config/            # 配置文件
├── docs/              # 项目文档
└── .github/workflows/ # CI/CD配置
```

详细的项目结构请查看 [docs/architecture/PROJECT_STRUCTURE.md](docs/architecture/PROJECT_STRUCTURE.md)

## 开发指南

### 环境变量配置
每个服务都有对应的 `.env.example` 文件，复制并重命名为 `.env` 进行配置：

```bash
# 后端
cp backend/.env.example backend/.env

# AI服务
cp ai-service/.env.example ai-service/.env

# 数据服务
cp data-service/.env.example data-service/.env
```

### 数据库迁移
```bash
# 进入后端容器
docker-compose exec backend bash

# 运行迁移
npm run migrate:up

# 运行种子数据
npm run seed
```

### 测试
```bash
# 前端测试
cd frontend && npm test

# 后端测试
cd backend && npm test

# AI服务测试
cd ai-service && pytest

# 数据服务测试
cd data-service && pytest
```

## API文档

启动服务后访问 http://localhost:3001/api-docs 查看完整的API文档。

## 部署

### 生产环境部署
1. 配置生产环境变量
2. 构建Docker镜像
3. 使用Docker Compose或Kubernetes部署

```bash
# 构建生产镜像
docker-compose -f docker-compose.prod.yml build

# 启动生产环境
docker-compose -f docker-compose.prod.yml up -d
```

### CI/CD
项目已配置GitHub Actions工作流：
- **CI Pipeline**: 代码检查、测试、构建
- **CD Pipeline**: 镜像构建、推送、部署

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 联系方式

- 项目问题: [GitHub Issues](https://github.com/your-org/stock-race/issues)
- 文档: [项目文档](docs/)

## 致谢

感谢所有为这个项目做出贡献的开发者。

---

*Stock Race - 让AI帮你炒股，体验智能投资的乐趣！*