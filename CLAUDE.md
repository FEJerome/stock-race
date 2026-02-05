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
- [**技术架构**](docs/architecture/TECH_STACK.md) - 技术栈与架构设计
- [**项目结构**](docs/architecture/PROJECT_STRUCTURE.md) - 目录结构与组织

### 需求与分析
- [**需求规格说明书**](docs/analysis/REQUIREMENTS.md) - 详细功能需求
- [**技术选型分析**](docs/analysis/TECHNOLOGY_EVALUATION.md) - 技术方案对比

### 开发指南
- [**开发规范**](docs/development/CODING_STANDARDS.md) - 编码标准与最佳实践
- [**新手指南**](docs/usage/QUICK_START.md) - 环境搭建与快速上手

### 智能体协作
- [**通用协作方案**](docs/agents/GENERIC_COLLABORATION_PLAN.md) - 多智能体工作流程
- [**角色定义**](docs/agents/GENERIC_ROLES.md) - 智能体角色与职责
- [**任务分发**](docs/agents/TASK_DISPATCH_GUIDE.md) - 任务分配与协调

### 部署与运维
- [**部署指南**](docs/deployment/DEPLOYMENT_GUIDE.md) - 生产环境部署
- [**生产部署指南**](docs/deployment/PRODUCTION_DEPLOYMENT_GUIDE.md) - 快速部署流程

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

### AI服务模块
- **主要文件**：`ai-service/src/ai_service/`
- **关键文件**：
  - `ai-service/src/ai_service/main.py` - FastAPI应用
  - `ai-service/src/ai_service/adapters/` - AI模型适配器
  - `ai-service/src/ai_service/services/decision_service.py` - 决策服务

### 数据服务模块
- **主要文件**：`data-service/src/data_service/`
- **关键文件**：
  - `data-service/src/data_service/main.py` - FastAPI应用
  - `data-service/src/data_service/collectors/` - 数据采集器
  - `data-service/src/data_service/services/data_service.py` - 主数据服务

## 🔧 快速操作指南

### 开发环境启动
```bash
# 一键启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看服务日志
docker-compose logs -f [service_name]
```

### 服务访问地址
- **前端**：http://localhost:3000
- **后端API**：http://localhost:3001
- **AI服务**：http://localhost:8000
- **数据服务**：http://localhost:8001

### 健康检查
```bash
# 后端健康检查
curl http://localhost:3001/api/health

# AI服务健康检查
curl http://localhost:8000/api/v1/health/

# 数据服务健康检查
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
- 架构相关：`docs/architecture/`
- 开发相关：`docs/development/`
- 部署相关：`docs/deployment/`
- 智能体相关：`docs/agents/`

---
*本文档最后更新于：2026-02-05*
*文档维护者：项目团队*