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

### 架构决策文档（2026-02-13更新）
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
- [**AI架构定位与演进路线图**](docs/architecture/CURRENT/DECISIONS/010-AI-ARCHITECTURE-POSITIONING.md) - 当前"LLM as a Service"定位确认，三阶段演进路线图（上线→轻量Agent→观望），避免过度工程化决策

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

## 🎯 核心模块位置

| 模块 | 代码位置 | 详细结构 |
|------|----------|----------|
| **前端** | `frontend/src/` | [CODE_MAP.md](docs/architecture/CODE_MAP.md#前端) |
| **后端** | `backend/src/` | [CODE_MAP.md](docs/architecture/CODE_MAP.md#后端) |
| **交易AI服务** | `trading-ai-service/src/ai_service/` | [CODE_MAP.md](docs/architecture/CODE_MAP.md#交易ai服务) |
| **数据服务** | `market-data-service/src/data_service/` | [CODE_MAP.md](docs/architecture/CODE_MAP.md#数据服务) |
| **微信小程序** | `miniprogram/src/` | [需求规格](docs/miniprogram/REQUIREMENTS.md) · [技术栈](docs/miniprogram/TECH_STACK.md) |
| **基础设施** | `docs/modules/infra/` | [TODO](docs/modules/infra/TODO.md) |

> 📚 完整代码结构请参考 [CODE_MAP.md](docs/architecture/CODE_MAP.md)

---

## 🛠️ 环境工具清单

**⚠️ 智能体必看**：操作项目数据时，请优先使用以下已安装的工具，避免重复实现。

### JSON 处理工具

| 工具 | 版本 | 用途 | 常用命令示例 |
|------|------|------|-------------|
| **jq** | 1.7.1 | JSON 查询、过滤、修改 | `jq '.tasks[0]' tasks/queue.json` |
| | | | `jq '.tasks[] | select(.status=="pending")' tasks/queue.json` |
| | | | `jq '.stats.completed += 1' tasks/queue.json` |

> 💡 **优先使用 jq**：操作 `tasks/queue.json` 等 JSON 文件时，**必须使用 jq**，禁止手动字符串拼接。

### 版本控制工具

| 工具 | 用途 | 常用命令示例 |
|------|------|-------------|
| **git** | 代码版本管理 | `git status` / `git add .` / `git commit -m "msg"` |
| | | `git log --oneline -5` / `git diff HEAD~1` |

### 构建与运行工具

| 工具 | 用途 | 常用命令示例 |
|------|------|-------------|
| **make** | 统一命令入口 | `make help` / `make integration` / `make status` |
| **node/npm** | JavaScript 运行时 | `node scripts/test.js` / `npm run dev` |
| **python** | Python 运行时 | `python -m uvicorn main:app` / `pip install` |
| **docker-compose** | 容器编排 | `docker-compose up -d` / `docker-compose ps` |

### 文本处理工具（Git Bash 内置）

| 工具 | 用途 | 常用命令示例 |
|------|------|-------------|
| **grep** | 文本搜索 | `grep -r "TODO" src/` / `grep -n "function" file.ts` |
| **sed** | 流编辑器 | `sed -i 's/old/new/g' file.txt` |
| **awk** | 文本处理 | `awk '{print $1}' file.txt` |
| **curl** | HTTP 请求 | `curl http://localhost:3001/api/health` |

### 自动化开发工具

| 工具/脚本 | 用途 | 文档链接 |
|-----------|------|----------|
| **dev-loop.sh** | 自动化任务循环执行 | [使用指南](docs/agents/AUTO_DEV_USAGE_GUIDE.md) |
| **resume-task.sh** | 恢复被阻塞的任务 | [使用指南](docs/agents/AUTO_DEV_USAGE_GUIDE.md) |

### 开发环境说明

- **Shell 环境**：Git Bash（Windows）- **不支持 WSL**，因微信开发者工具 MCP 需 Windows 原生环境
- **项目根目录**：脚本自动检测，无需手动 `cd`
- **配置文件加载**：`.claude/skills/` 和 `.claude/mcp.json` 由脚本自动加载

---

## 🔧 快速操作指南

### 智能体上岗（必需首先执行）

```bash
/pro-init
```

### 模块开发命令

```bash
# 格式：module-dev <服务名>
module-dev backend              # 后端模块开发
module-dev frontend             # 前端模块开发
module-dev market-data-service  # 市场行情数据服务开发
module-dev trading-ai-service   # 交易AI服务开发
module-dev news-service         # 新闻服务开发
module-dev miniprogram          # 微信小程序开发
```

**模块规划文档**：
- [Backend](docs/modules/backend/TODO.md) · [Frontend](docs/modules/frontend/TODO.md) · [Market Data](docs/modules/market-data-service/TODO.md) · [AI Service](docs/modules/trading-ai-service/TODO.md) · [News](docs/modules/news-service/TODO.md) · [Miniprogram](docs/modules/miniprogram/TODO.md) · [Infra](docs/modules/infra/TODO.md)

### Makefile 常用命令

| 命令 | 用途 |
|------|------|
| `make integration` | 启动联调环境（全容器化，推荐） |
| `make status` | 查看服务状态 |
| `make logs` | 查看实时日志 |
| `make health` | 健康检查 |
| `make help` | 查看所有命令 |

> 📚 [Docker 部署详细指南](docs/usage/DOCKER_GUIDE.md) | [新手指南](docs/usage/QUICK_START.md)

---

## 🌐 服务访问地址
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
- 脚本工具：`scripts/` ([脚本说明](scripts/README.md))

## 📈 近期开发进展

📚 **[查看完整项目历史](docs/development/PROJECT_HISTORY.md)** - 包含Docker容器化、架构冲突解决、代码审查、自动化开发系统、数据源测试等15+历史项目详细记录。

---

*本文档最后更新于：2026-02-25*
