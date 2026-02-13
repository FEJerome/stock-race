# stock-race项目 - 文档导航中心

## 📋 项目概览

**项目简介**：AI股票竞赛平台，支持用户分配虚拟人民币账号给AI大模型进行虚拟股票交易，集成多种数据源和AI模型。

**核心功能**：
- 用户管理与AI账户管理
- 多模型AI集成与交易决策
- 实时股票数据采集与推送
- 虚拟交易与持仓管理
- 实时监控与收益分析
- 多智能体协作架构

## 🚀 快速导航

### 核心文档
- [**代码结构地图**](docs/architecture/CODE_MAP.md) - 项目结构与文件功能
- [**架构文档总入口**](docs/architecture/README.md) - 架构文档导航中心
- [**六服务架构详细设计**](docs/architecture/CURRENT/SERVICE_ARCHITECTURE.md) - 服务间调用与数据流设计（最新）
- [**统一数据平台架构**](docs/architecture/CURRENT/DATA_PLATFORM.md) - 四服务数据架构设计
- [**技术架构**](docs/architecture/CURRENT/TECH_STACK.md) - 技术栈与架构设计
- [**API规范**](docs/architecture/CURRENT/API_SPECIFICATION.md) - RESTful API与WebSocket设计
- [**数据库设计**](docs/architecture/CURRENT/DATABASE_DESIGN.md) - 数据库ER图与表结构
- [**配置中心架构设计**](docs/architecture/CURRENT/CONFIG_CENTER/README.md) - 配置中心规划与各服务配置设计（持续更新）

### 架构决策文档（2026-02-11更新）
- [**服务依赖冲突分析**](docs/architecture/ANALYSIS/SERVICE_DEPENDENCY.md) - 五服务外部依赖对接需求分析与6个冲突解决方案
- [**循环依赖解决方案**](docs/architecture/CURRENT/DECISIONS/001-CIRCULAR-DEPENDENCY.md) - 三种方案详细对比分析
- [**事件总线风险分析**](docs/architecture/CURRENT/DECISIONS/002-EVENT-BUS.md) - Redis Streams事件总线的风险点、成本、性能分析
- [**AI对话服务职责划分**](docs/architecture/CURRENT/DECISIONS/003-AI-DIALOGUE-LOCATION.md) - AI对话功能放在Backend还是Trading AI Service的详细分析
- [**AI Service双向依赖解耦**](docs/architecture/CURRENT/DECISIONS/004-AI-DECOUPLING.md) - 基于事件总线的完全解耦方案，消除3个双向依赖环
- [**微信小程序游客模式设计**](docs/architecture/CURRENT/DECISIONS/005-MINIPROGRAM-GUEST-MODE.md) - 三层API架构 + 智能过期策略（24h/72h）设计
- [**Miniprogram数据流优化方案**](docs/architecture/CURRENT/DECISIONS/006-MINIPROGRAM-DATA-FLOW.md) - 混合分离方案：行情直连+收益后端计算
- [**AI决策服务广度查询需求确认**](docs/architecture/CURRENT/DECISIONS/007-BREADTH-QUERY-REQUIREMENTS.md) - News Service和Market Data Service的广度数据查询需求确认
- [**Redis渐进式部署策略**](docs/architecture/CURRENT/DECISIONS/008-REDIS-DEPLOYMENT.md) - 从单节点到Cluster的渐进式部署方案，成本可控平滑扩容
- [**六数据源频率限制策略**](docs/architecture/CURRENT/DATA_SOURCE_RATE_LIMITING_STRATEGY.md) - A股全量数据采集方案，6数据源智能调度与分层采集

### 历史架构文档
历史架构文档已归档至 [docs/architecture/HISTORICAL/](docs/architecture/HISTORICAL/) 目录：
- **V2026-02-10-SERVICE_ARCHITECTURE.md** - 六服务架构详细设计初版
- **V1-SYSTEM_ARCHITECTURE.md** - 早期系统架构（历史版本）
- **V1-SERVICE_COMMUNICATION.md** - 早期服务通信设计（历史版本）
- **V1-DATA_FLOW.md** - 早期数据流设计（历史版本）
- **V1-PROJECT_STRUCTURE.md** - 早期项目结构（历史版本）
- **V1-DATA_SERVICE_INTEGRATION.md** - 早期集成方案（历史版本）

### 需求与分析
- [**需求规格说明书**](docs/analysis/REQUIREMENTS.md) - 详细功能需求
- [**技术选型分析**](docs/analysis/TECHNOLOGY_EVALUATION.md) - 技术方案对比

### 微信小程序
- [**小程序需求规格**](docs/miniprogram/REQUIREMENTS.md) - 小程序功能需求
- [**小程序技术栈**](docs/miniprogram/TECH_STACK.md) - 小程序技术方案
- [**小程序可行性报告**](docs/miniprogram/FEASIBILITY_REPORT.md) - 小程序可行性分析

### 开发指南
- [**开发规范**](docs/development/CODING_STANDARDS.md) - 编码标准与最佳实践
- [**模块化分支开发规范**](docs/development/MODULE_DEVELOPMENT_WORKFLOW.md) - Git Worktree多模块并行开发规范
- [**产出物管理规范**](docs/development/ARTIFACT_MANAGEMENT.md) - 产出物存储、日志与留痕管理
- [**当前功能清单**](docs/development/CURRENT_FUNCTIONALITY_INVENTORY.md) - 系统当前业务功能详细清单
- [**内存持久化优化产出物记录**](docs/development/MEMORY_PERSISTENCE_OPTIMIZATION_ARTIFACTS.md) - 优化功能产出物详细记录
- [**新手指南**](docs/usage/QUICK_START.md) - 环境搭建与快速上手

### 智能体协作
- [**通用协作方案**](docs/agents/GENERIC_COLLABORATION_PLAN.md) - 多智能体工作流程
- [**角色定义**](docs/agents/GENERIC_ROLES.md) - 智能体角色与职责
- [**任务分发**](docs/agents/TASK_DISPATCH_GUIDE.md) - 任务分配与协调

### 部署与运维
- [**部署指南**](docs/deployment/DEPLOYMENT_GUIDE.md) - 生产环境部署
- [**生产部署指南**](docs/deployment/PRODUCTION_DEPLOYMENT_GUIDE.md) - 快速部署流程
- [**生产就绪测试报告**](docs/deployment/SYSTEM_INTEGRATION_TEST_REPORT_COMPLETE.md) - 完整系统集成测试
- [**TimescaleDB修复记录**](docs/deployment/TIMESCALEDB_FIX_RECORD.md) - 时序数据库问题修复
- [**AI服务数据库修复记录**](docs/deployment/AI_SERVICE_DATABASE_FIX_RECORD.md) - AI服务数据库连接修复
- [**生产检查清单**](docs/deployment/PRODUCTION_CHECKLIST.md) - 部署前检查项

### 代码审查
- [**数据服务代码审查报告**](docs/reviews/DATA_SERVICE_CODE_REVIEW_REPORT.md) - 数据服务功能审查与修复记录
- [**故障排除指南**](docs/operations/TROUBLESHOOTING.md) - 系统故障处理手册
- [**部署文档总结**](docs/deployment/PRODUCTION_DEPLOYMENT_DOCUMENTATION_SUMMARY.md) - 生产环境部署文档完整总结

### 数据管理
- [**多源数据策略**](docs/data_sources/MULTI_SOURCE_STRATEGY.md) - 数据采集方案
- [**数据流架构**](docs/architecture/DATA_FLOW_ARCHITECTURE.md) - 数据流程设计

### 测试与验证
- [**功能验证记录**](docs/testing/VALIDATION_HISTORY.md) - 功能测试结果

## 📁 文档分层结构

### 一级文档（概览与导航）
- **CLAUDE.md** - 项目文档导航中心（本文件）
- **README.md** - 项目基本信息

### 二级文档（核心信息）
- **CODE_MAP.md** - 代码结构与文件功能
- **TECH_STACK.md** - 技术架构与选型
- **QUICK_START.md** - 快速上手指南

### 三级文档（详细说明）
- **REQUIREMENTS.md** - 详细需求规格
- **DEPLOYMENT_GUIDE.md** - 部署详细步骤
- **CODING_STANDARDS.md** - 编码规范细节
- **ARTIFACT_MANAGEMENT.md** - 产出物管理规范

## 🎯 核心模块导航

### 前端模块
- **主要文件**：`frontend/src/`
- **关键文件**：
  - `frontend/src/main.tsx` - 应用入口
  - `frontend/src/App.tsx` - 路由配置
  - `frontend/src/services/` - API服务

### 后端模块
- **主要文件**：`backend/src/`
- **关键文件**：
  - `backend/src/app.js` - Express应用
  - `backend/src/routes/` - API路由
  - `backend/src/controllers/` - 业务逻辑

### 交易AI服务模块
- **主要文件**：`trading-ai-service/src/ai_service/`
- **关键文件**：
  - `trading-ai-service/src/ai_service/main.py` - FastAPI应用
  - `trading-ai-service/src/ai_service/adapters/` - AI模型适配器
  - `trading-ai-service/src/ai_service/services/decision_service.py` - 决策服务

### 市场行情数据服务模块
- **主要文件**：`market-data-service/src/data_service/`
- **关键文件**：
  - `market-data-service/src/data_service/main.py` - FastAPI应用
  - `market-data-service/src/data_service/collectors/` - 数据采集器
  - `market-data-service/src/data_service/services/data_service.py` - 主数据服务

### 微信小程序模块
- **主要文件**：`miniprogram/src/`
- **关键文件**：
  - `miniprogram/src/pages/` - 页面组件
  - `miniprogram/src/components/` - 公共组件
  - `miniprogram/src/stores/` - 状态管理（Pinia）
  - `miniprogram/src/api/` - API服务层
  - 📚 **文档**：[小程序需求规格](docs/miniprogram/REQUIREMENTS.md) | [技术栈](docs/miniprogram/TECH_STACK.md)

### 基础设施模块
- **文档位置**：`docs/modules/infra/`
- **关键文件**：
  - **[基础设施TODO](docs/modules/infra/TODO.md)** - 跨服务架构任务跟踪（事件总线、Redis部署、冲突解决方案）
  - 共享Redis集群部署、统一事件总线SDK、服务解耦实施计划

## 🔧 快速操作指南

### 模块开发命令（module-dev）

使用 `module-dev` 命令快速进入指定模块的开发工作流：

```bash
# 格式：module-dev <服务名>
module-dev backend              # 后端模块开发
module-dev frontend             # 前端模块开发
module-dev market-data-service  # 市场行情数据服务开发
module-dev trading-ai-service   # 交易AI服务开发
module-dev news-service         # 新闻服务开发
module-dev miniprogram          # 微信小程序开发
```

**命令执行流程**：
1. 自动执行 `/pro-init` 熟悉项目结构
2. 读取 `docs/modules/<服务名>/TODO.md` 开发规划
3. 识别下一个待开发条目（🔲 待开发）
4. 检查当前git分支，引导切换至正确worktree
5. 制定具体执行计划，等待你的开发指令

**模块开发规划文档**：
- [Backend TODO](docs/modules/backend/TODO.md) - 后端开发规划（含架构优化任务C1~C6, O3, O6）
- [Frontend TODO](docs/modules/frontend/TODO.md) - 前端开发规划
- [Market Data Service TODO](docs/modules/market-data-service/TODO.md) - 数据服务规划（含架构优化任务C1~C6, O6）
- [Trading AI Service TODO](docs/modules/trading-ai-service/TODO.md) - AI服务规划（含架构优化任务C1~C4）
- [News Service TODO](docs/modules/news-service/TODO.md) - 新闻服务规划（含架构优化任务C1~C6）
- [Miniprogram TODO](docs/modules/miniprogram/TODO.md) - 小程序规划（含架构优化任务C1, C5, O6）
- **[Infrastructure TODO](docs/modules/infra/TODO.md)** - 基础设施规划（6个冲突解决方案 + 2个优化方案）

---

## 🐳 Docker 部署指南

### 环境概述

项目提供两种 Docker Compose 配置：

| 配置 | 用途 | 文件 | 特点 |
|------|------|------|------|
| **联调测试** | 集成测试、全服务验证 | `docker-compose.integration.yml` | 全容器化、热重载、严格模式 |
| **开发环境** | 本地开发、单服务调试 | `docker-compose.yml` | 仅基础设施、服务本地运行 |

---

### 联调测试环境（推荐）

**适用场景**：
- 多服务集成测试
- 联调验证
- 生产环境预演
- CI/CD 流水线

**配置特点**：
- ✅ 所有服务（包括业务服务）Docker 容器化
- ✅ Volume 挂载源代码，支持热重载
- ✅ 严格模式（STRICT_MODE=true），强制使用真实数据
- ✅ 自动数据库迁移
- ✅ 健康检查与依赖等待

**一键启动**：
```bash
# 启动所有服务（基础设施 + 业务服务）
docker-compose -f docker-compose.integration.yml up -d

# 查看服务状态
docker-compose -f docker-compose.integration.yml ps

# 查看实时日志
docker-compose -f docker-compose.integration.yml logs -f

# 查看特定服务日志
docker-compose -f docker-compose.integration.yml logs -f backend

# 停止所有服务
docker-compose -f docker-compose.integration.yml down

# 停止并清除数据卷（谨慎使用）
docker-compose -f docker-compose.integration.yml down -v
```

**服务端口映射**：

| 服务 | 容器名 | 主机端口 | 容器端口 | 说明 |
|------|--------|----------|----------|------|
| Backend | stock-race-backend-int | 3001 | 3001 | API 服务 |
| Trading AI Service | stock-race-trading-ai-int | 8000 | 8000 | AI 决策服务 |
| Market Data Service | stock-race-market-data-int | 8001 | 8001 | 行情数据服务 |
| News Service | stock-race-news-int | - | - | 新闻服务（无 HTTP） |
| Redis | stock-race-redis-int | 6380 | 6379 | 缓存（注意：宿主机 6379 已被占用） |
| PostgreSQL | stock-race-postgres-int | 5434 | 5432 | 主数据库 |
| TimescaleDB | stock-race-timescaledb-int | 5433 | 5432 | 时序数据库 |

**健康检查**：
```bash
# Backend
curl http://localhost:3001/api/health

# Trading AI Service
curl http://localhost:8000/api/v1/health/

# Market Data Service
curl http://localhost:8001/health
```

**常见问题解决**：
```bash
# 端口冲突（如 6379 被宿主机 Redis 占用）
# 已在配置中修改为 6380，无需额外操作

# 重建镜像（代码变更后）
docker-compose -f docker-compose.integration.yml build

# 强制重启特定服务
docker-compose -f docker-compose.integration.yml up -d --force-recreate backend

# 进入容器调试
docker exec -it stock-race-backend-int sh
docker exec -it stock-race-market-data-int bash
```

---

### 生产环境部署

**部署文件**：
- `docker-compose.prod.yml` - 生产环境配置
- `backend/Dockerfile` - Backend 生产镜像
- `trading-ai-service/Dockerfile` - AI 服务生产镜像
- `market-data-service/Dockerfile` - 数据服务生产镜像
- `news-service/Dockerfile` - 新闻服务生产镜像

**启动步骤**：
```bash
# 1. 设置环境变量
export NODE_ENV=production
export DATABASE_URL=postgresql://user:pass@postgres:5432/stock_race
export REDIS_URL=redis://redis:6379

# 2. 启动基础设施
docker-compose -f docker-compose.prod.yml up -d postgres redis timescaledb

# 3. 等待数据库就绪（约 10 秒）
sleep 10

# 4. 执行数据库迁移
docker-compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy

# 5. 启动所有服务
docker-compose -f docker-compose.prod.yml up -d
```

**生产环境检查清单**：
- [ ] 修改默认密码（PostgreSQL、Redis）
- [ ] 配置 SSL/TLS 证书
- [ ] 设置资源限制（CPU/内存）
- [ ] 配置日志收集（ELK/Loki）
- [ ] 启用监控告警（Prometheus/Grafana）
- [ ] 配置备份策略

---

### 开发环境（基础设施 only）

**适用场景**：
- 单服务本地开发调试
- 快速启动基础设施

**启动方式**：
```bash
# 仅启动基础设施（PostgreSQL、Redis、TimescaleDB）
docker-compose up -d

# 服务在宿主机本地运行，便于调试
# Backend: cd backend && npm run dev
# Market Data: cd market-data-service && python -m uvicorn data_service.main:app --reload
```

### 服务访问地址
- **前端**：http://localhost:3000
- **后端API**：http://localhost:3001
- **交易AI服务**：http://localhost:8000 (AI账户交易决策)
- **市场行情数据服务**：http://localhost:8001 (A股实时行情)

### 健康检查
```bash
# 后端健康检查
curl http://localhost:3001/api/health

# 交易AI服务健康检查
curl http://localhost:8000/api/v1/health/

# 市场行情数据服务健康检查
curl http://localhost:8001/health
```

## 📝 文档使用建议

1. **新会话快速入门**：
   - 首先阅读 [新手指南](docs/usage/QUICK_START.md)
   - 参考 [代码结构地图](docs/architecture/CODE_MAP.md) 了解项目结构

2. **开发流程**：
   - 遵循 [开发规范](docs/development/CODING_STANDARDS.md)

3. **部署流程**：
   - 参考 [部署指南](docs/deployment/DEPLOYMENT_GUIDE.md)
   - 执行 [生产部署](docs/deployment/PRODUCTION_DEPLOYMENT_GUIDE.md)

4. **智能体协作**：
   - 查看 [协作方案](docs/agents/GENERIC_COLLABORATION_PLAN.md)
   - 了解 [角色定义](docs/agents/GENERIC_ROLES.md)

## 🎨 文档设计原则

- **分层组织**：从概览到详细，逐步深入
- **信息压缩**：核心信息前置，详细信息后置
- **链接导航**：通过链接减少重复内容
- **结构清晰**：统一文档格式与命名规范
- **易于维护**：模块化设计，便于更新

## 🔍 搜索与定位

**快速定位文件**：
- 使用文档导航链接直接访问
- 按功能模块分类查找
- 核心文件通过 CODE_MAP.md 统一索引

**常用搜索路径**：
- 架构相关：`docs/architecture/` ([README](docs/architecture/README.md))
- 开发相关：`docs/development/`
- 部署相关：`docs/deployment/`
- 智能体相关：`docs/agents/`
- 微信小程序：`docs/miniprogram/`

## 📈 近期开发进展

### Docker 全容器化联调环境配置完成
**项目状态**：✅ **联调环境全 Docker 化完成（2026-02-13）**

**关键成果**：完成所有业务服务的 Docker 容器化配置，支持一键启动全服务联调环境。

**解决的问题**：
1. **Backend 容器化** - 添加 OpenSSL 支持 Prisma，自动生成 Prisma Client，启动时自动运行 migrations
2. **Market Data Service 容器化** - 添加缺失依赖（`python-jose`, `pydantic-settings`, `akshare`, `baostock`, `tushare`, `asyncpg`）
3. **Trading AI Service 容器化** - 修正依赖安装方式，支持 infra SDK 本地挂载
4. **News Service 容器化** - 修正依赖安装顺序和 PYTHONPATH 配置
5. **Redis 端口冲突** - 将 Docker Redis 映射到宿主机 6380 端口，避免与宿主机 Redis 冲突

**配置文件**：
- `docker-compose.integration.yml` - 联调测试专用配置（全容器化）
- `backend/Dockerfile.dev` - Backend 开发镜像
- `market-data-service/Dockerfile.dev` - 数据服务开发镜像
- `trading-ai-service/Dockerfile.dev` - AI 服务开发镜像
- `news-service/Dockerfile` - 新闻服务镜像

**快速启动命令**：
```bash
# 一键启动所有服务
docker-compose -f docker-compose.integration.yml up -d

# 验证所有服务健康状态
curl http://localhost:3001/api/health
curl http://localhost:8000/api/v1/health/
curl http://localhost:8001/health
```

---

### 五服务架构冲突分析与解决方案制定
**项目状态**：✅ **架构审查完成，6个冲突全部解决（2026-02-11）**

**关键成果**：首席架构师完成Backend、Market Data Service、Trading AI Service、News Service、Miniprogram五个服务的TODO.md综合审查，识别6个架构冲突并提供完整解决方案。

**解决的架构冲突**：
1. ✅ **循环依赖问题** - 采用"共享Redis + 冷启动"混合方案（方案C）
2. ✅ **事件总线设计不一致** - 统一采用Redis Streams事件总线
3. ✅ **AI Service双向依赖过多** - 基于事件总线的完全解耦
4. ✅ **AI对话服务职责分歧** - 确定由Backend实现AI对话功能
5. ✅ **Miniprogram公开API冲突** - 三层API架构 + 智能游客模式
6. ✅ **接口定义重复/不一致** - AI决策服务广度查询需求确认

**关键架构决策**：
- 统一事件总线架构：所有服务通过Redis Streams通信，消除直接依赖
- AI对话服务：由Backend实现，避免Backend ↔ Trading AI循环依赖
- Miniprogram游客模式：支持24h/72h智能过期，80%功能无需登录
- 数据流优化：行情直连Market Data，Backend负载降低90%
- Redis部署：渐进式策略，从单节点¥0起步到Cluster集群

**详细文档**：
- 📋 [服务依赖冲突分析](docs/architecture/ANALYSIS/SERVICE_DEPENDENCY.md) - 主文档，6个冲突完整分析
- 📋 [六服务架构设计](docs/architecture/CURRENT/SERVICE_ARCHITECTURE.md) - 关键决策更新
- 📋 [循环依赖解决方案](docs/architecture/CURRENT/DECISIONS/001-CIRCULAR-DEPENDENCY.md)
- 📋 [事件总线风险分析](docs/architecture/CURRENT/DECISIONS/002-EVENT-BUS.md)
- 📋 [AI对话服务职责划分](docs/architecture/CURRENT/DECISIONS/003-AI-DIALOGUE-LOCATION.md)
- 📋 [Miniprogram游客模式设计](docs/architecture/CURRENT/DECISIONS/005-MINIPROGRAM-GUEST-MODE.md)
- 📋 [Miniprogram数据流优化](docs/architecture/CURRENT/DECISIONS/006-MINIPROGRAM-DATA-FLOW.md)
- 📋 [AI Service双向依赖解耦](docs/architecture/CURRENT/DECISIONS/004-AI-DECOUPLING.md)
- 📋 [AI决策广度查询需求](docs/architecture/CURRENT/DECISIONS/007-BREADTH-QUERY-REQUIREMENTS.md)
- 📋 [Redis渐进式部署策略](docs/architecture/CURRENT/DECISIONS/008-REDIS-DEPLOYMENT.md)

---

### Market Data Service 代码审查与文档重构
**项目状态**：✅ **审查完成，已合并到develop分支（2026-02-11）**

**关键成果**：首席架构师完成全面代码审查，服务达到生产就绪标准。重构TODO.md，创建HAVE_DONE.md记录已完成功能，测试覆盖率96%。

**审查结论**：
- 多数据源架构（6源）设计成熟，智能路由与动态权重机制完善
- 三层缓存策略（Redis/TimescaleDB/内存回退）确保高可用性
- 数据质量评估与降级策略有效保障数据可靠性
- 单元测试通过率95.8%，核心功能100%覆盖

**详细文档**：
- 📋 [已完成功能记录](docs/modules/market-data-service/HAVE_DONE.md)
- 📋 [待办任务追踪](docs/modules/market-data-service/TODO.md)
- 📋 [测试脚本索引](docs/modules/market-data-service/TEST_SCRIPTS.md)

---

### News Service 代码审查与文档重构
**项目状态**：✅ **审查完成，已合并到develop分支（2026-02-11）**

**关键成果**：首席架构师完成全面代码审查，服务达到生产就绪标准。重构TODO.md，创建HAVE_DONE.md记录已完成功能，创建TEST_SCRIPTS.md索引测试脚本。

**审查结论**：
- 完全符合统一数据平台精简情报架构设计
- DeepSeek流式处理，Token严格控制（单条<2000 tokens）
- 分层存储策略合理（Redis 24h + PostgreSQL 7d），节省98%存储空间
- 采集器、处理器、存储层设计规范，易于扩展

**详细文档**：
- 📋 [已完成功能记录](docs/modules/news-service/HAVE_DONE.md)
- 📋 [待办任务追踪](docs/modules/news-service/TODO.md)
- 📋 [测试脚本索引](docs/modules/news-service/TEST_SCRIPTS.md)

---

### Trading AI Service 代码审查与文档重构
**项目状态**：✅ **审查完成，已合并到develop分支（2026-02-11）**

**关键成果**：首席架构师完成全面代码审查，服务达到生产就绪标准。重构TODO.md，创建HAVE_DONE.md记录已完成功能，更新TEST_SCRIPTS.md索引测试脚本。

**审查结论**：
- 多模型适配器架构优秀（6大AI提供商统一接口）
- Token成本控制精准（预算估算→限额控制→分级告警）
- 数据融合设计合理（Market Data + News Service双源聚合）
- 提示词工程成熟（基金经理画像自动提炼）
- 综合功能测试32项全部通过（100%通过率）

**详细文档**：
- 📋 [已完成功能记录](docs/modules/trading-ai-service/HAVE_DONE.md)
- 📋 [待办任务追踪](docs/modules/trading-ai-service/TODO.md)
- 📋 [测试脚本索引](docs/modules/trading-ai-service/TEST_SCRIPTS.md)

---

### Miniprogram 代码审查与文档重构
**项目状态**：✅ **审查完成，已合并到develop分支（2026-02-11）**

**关键成果**：首席架构师完成全面代码审查。重构TODO.md，创建HAVE_DONE.md记录已完成功能（T-001~T-011），更新TEST_SCRIPTS.md索引测试脚本。

**审查结论**：
- 游客模式设计优秀，无需登录即可访问公开数据，降低用户使用门槛
- Pinia状态管理规范，5个Store职责分明，持久化配置合理
- 代码规范统一，TypeScript类型完善，Vue 3 Composition API使用规范
- UI设计符合A股习惯（红涨绿跌），西式复古精英风格独特
- E2E测试覆盖游客模式7个场景（20+子测试全部通过）

**待完成工作**：
- AI经理详情页（T-007）需要完善收益曲线和持仓列表
- 排行榜/行情页需等待Backend提供公开API
- 单元测试待补充（T-001~T-010）

**详细文档**：
- 📋 [已完成功能记录](docs/modules/miniprogram/HAVE_DONE.md)
- 📋 [待办任务追踪](docs/modules/miniprogram/TODO.md)
- 📋 [测试脚本索引](docs/modules/miniprogram/TEST_SCRIPTS.md)

---

### Backend 代码审查与文档重构
**项目状态**：✅ **审查完成，已合并到develop分支（2026-02-11）**

**关键成果**：首席架构师完成全面代码审查。重构TODO.md，创建HAVE_DONE.md记录已完成功能（T-001~T-015），更新TEST_SCRIPTS.md索引测试脚本（新增7个测试文件/90个测试用例）。

**审查结论**：
- 交易规则引擎精准：完整支持A股市场各类规则（主板/创业板/科创板/北交所），涨跌停计算准确，特殊场景（ST/停牌/新股）处理完善
- 服务通信可靠：SDK封装完善，熔断降级策略合理，服务间调用健壮
- 动态配置灵活：分层配置架构优雅（默认→会员→账户），支持会员级别和账户级别的灵活控制
- WebSocket设计成熟：Socket.io使用规范，订阅管理精细化，实时推送稳定
- 测试覆盖率高：单元测试195个全部通过，新增测试90个，生产就绪度90%

**待完成工作**：
- 完善集成测试环境（9个测试需完整Docker Compose环境）
- 对接trading-ai-service对话接口（T-011）
- 对接market-data-service交易状态接口（T-015）

**详细文档**：
- 📋 [已完成功能记录](docs/modules/backend/HAVE_DONE.md)
- 📋 [待办任务追踪](docs/modules/backend/TODO.md)
- 📋 [测试脚本索引](docs/modules/backend/TEST_SCRIPTS.md)

---

### 六数据源鲁棒性测试项目（分层采集验证）
**项目状态**：✅ 测试中，v1.1方案已制定（2026-02-10）

**关键成果**：制定中频层（10秒/300只）+ 低频层（60秒/全量）分层采集方案，新浪财经生产就绪（100%成功率/0.33s响应）。

**详细报告**：
- 📋 [v1.1分层采集方案](data-service/docs/HYBRID_DATA_SOURCE_SOLUTION_v1.1.md)
- 📋 [六数据源测试报告](data-service/docs/SIX_SOURCES_ROBUSTNESS_TEST_REPORT.md)

---

### 股票数据源采集测试项目（集合竞价专项）
**项目状态**：✅ 修复完成，连续测试中（2026-02-10）

**关键成果**：修复腾讯财经和东方财富字段解析问题，所有3个数据源在集合竞价时段均正常工作。

**详细报告**：
- 📋 [混合数据源采集方案](data-service/docs/HYBRID_DATA_SOURCE_SOLUTION.md)
- 📋 [测试报告](data-service/docs/DATA_SOURCE_TEST_REPORT_20260210.md)

---

### 微信小程序项目
**项目状态**：✅ **全部完成，等待微信审核（2026-02-09）**

**关键成果**：UniApp + Vue 3小程序全部功能开发完成（P0/P1/P2），ucharts图表集成，西式复古精英风格UI设计，审核材料准备完毕。

**详细文档**：
- 📋 [隐私保护指引](docs/miniprogram/PRIVACY.md)
- 📋 [用户服务协议](docs/miniprogram/TERMS.md)
- 📋 [审核指南](docs/miniprogram/WECHAT_AUDIT_GUIDE.md)
- 📋 [开发进度](docs/miniprogram/DEVELOPMENT_PROGRESS.md)

---

### 数据源扩展计划取消（2026-02-13）
**项目状态**: ❌ **计划取消**

**背景**: 计划利用春节期间将数据源从4个扩展到6-8个，提升系统容灾能力。

**调研结果**: 对7个潜在数据源（网易财经、金融界、中国证券网、同花顺、和讯网、中金在线、雪球）进行详细调研和POC测试，结果如下：
- ❌ 网易财经：API已失效，域名无法解析
- ❌ 金融界：无官方开放API
- ❌ 中国证券网：无公开接口
- ⚠️ 同花顺：需付费（298-60,000元/年）
- ❌ 和讯网：API已停用
- ❌ 中金在线：无公开接口
- ❌ 雪球：反爬过于严格（4/5级）

**结论**: 7个调研数据源中6个完全不可行，仅同花顺可用但需付费。由于无法找到可用的免费数据源，**本计划正式取消**。

**后续方案**: 保持现有4数据源系统（新浪、腾讯、东方财富、Baostock），如需扩展考虑采购同花顺官方API或联系券商获取Level-2接口。

**归档文档**:
- 📋 [调研报告](docs/architecture/HISTORICAL/V2026-02-13-DATA_SOURCE_SURVEY_REPORTS.md)
- 📋 [可行性评估](docs/architecture/HISTORICAL/V2026-02-13-NEW_DATA_SOURCE_FEASIBILITY.md)
- 📋 [完整规划](docs/architecture/HISTORICAL/V2026-02-13-DATA_SOURCE_EXPANSION_PLAN_V2-CANCELLED.md)

---

📚 **[查看完整项目历史](docs/development/PROJECT_HISTORY.md)** - 包含前端模拟数据改造、紧急系统修复、Docker容器化、内存持久化优化等15个历史项目详细记录。

---

*本文档最后更新于：2026-02-13*
