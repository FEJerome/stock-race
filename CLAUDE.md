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
- [**统一数据平台架构**](docs/architecture/UNIFIED_DATA_PLATFORM_ARCHITECTURE.md) - 四服务数据架构设计（最新）
- [**六服务架构详细设计**](docs/architecture/DETAILED_SERVICE_ARCHITECTURE.md) - 服务间调用与数据流设计（最新）
- [**项目结构**](docs/architecture/PROJECT_STRUCTURE.md) - 目录结构与组织

### 历史架构文档
- [**系统架构设计**](docs/architecture/SYSTEM_ARCHITECTURE.md) - 早期系统架构（历史版本）
- [**服务通信架构**](docs/architecture/SERVICE_COMMUNICATION_ARCHITECTURE.md) - 早期服务通信设计（历史版本）
- [**数据流架构**](docs/architecture/DATA_FLOW_ARCHITECTURE.md) - 早期数据流设计（历史版本）
- [**数据服务集成**](docs/architecture/DATA_SERVICE_INTEGRATION.md) - 早期集成方案（历史版本）

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
- [Backend TODO](docs/modules/backend/TODO.md) - 后端开发规划（10个条目）
- [Frontend TODO](docs/modules/frontend/TODO.md) - 前端开发规划（11个条目）
- [Market Data Service TODO](docs/modules/market-data-service/TODO.md) - 数据服务规划（10个条目）
- [Trading AI Service TODO](docs/modules/trading-ai-service/TODO.md) - AI服务规划（12个条目）
- [News Service TODO](docs/modules/news-service/TODO.md) - 新闻服务规划（10个条目）
- [Miniprogram TODO](docs/modules/miniprogram/TODO.md) - 小程序规划（10个条目，已完成）

---

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
- 架构相关：`docs/architecture/`
- 开发相关：`docs/development/`
- 部署相关：`docs/deployment/`
- 智能体相关：`docs/agents/`
- 微信小程序：`docs/miniprogram/`

## 📈 近期开发进展

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

📚 **[查看完整项目历史](docs/development/PROJECT_HISTORY.md)** - 包含前端模拟数据改造、紧急系统修复、Docker容器化、内存持久化优化等14个历史项目详细记录。

---

*本文档最后更新于：2026-02-11*
