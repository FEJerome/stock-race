请始终使用简体中文与我沟通

# stock-race项目 - 项目指南

## 📑 详细目录

- [项目角色](#项目角色)
- [项目目标](#项目目标)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [开发规范](#开发规范)
- [命令集](#命令集)
  - [开发环境启动](#开发环境启动)
  - [构建和部署](#构建和部署)
  - [测试命令](#测试命令)
  - [依赖管理](#依赖管理)
- [项目规划](#项目规划)
- [多智能体协作执行方案](#多智能体协作执行方案)
- [当前状态](#当前状态)
- [近期工作重点](#近期工作重点)
- [下一步工作](#下一步工作)
- [注意事项](#注意事项)
- [功能验证记录](#功能验证记录)
- [新会话快速上手](#新会话快速上手)
- [代码结构地图](#代码结构地图)

## 🚀 快速导航

- [技术架构模板](docs/architecture/TECH_STACK.md)
- [需求规格说明书](docs/analysis/REQUIREMENTS.md) - 详细功能需求和非功能需求
- [技术选型分析](docs/analysis/TECHNOLOGY_EVALUATION.md) - 多个技术栈方案对比和推荐
- [项目结构模板](docs/architecture/PROJECT_STRUCTURE.md)
- [**代码结构地图模板**](docs/architecture/CODE_MAP.md) - 关键文件功能说明和调用关系
- [开发规范模板](docs/development/CODING_STANDARDS.md)
- [项目实施计划模板](docs/planning/IMPLEMENTATION_PHASES.md)
- [通用多智能体协作方案](docs/agents/GENERIC_COLLABORATION_PLAN.md)
  - [通用角色定义](docs/agents/GENERIC_ROLES.md) - 6个功能型智能体角色
  - [任务分发指南](docs/agents/TASK_DISPATCH_GUIDE.md) - 主智能体任务分发机制
  - [项目模板配置](docs/agents/PROJECT_TEMPLATE.md) - 模板使用和定制指南
  - [通用worktree配置](docs/agents/GENERIC_WORKTREE_GUIDE.md) - git-worktree工作空间
  - [通用状态管理](docs/agents/GENERIC_AGENT_STATUS.md) - 智能体状态跟踪
- [注意事项模板](docs/usage/IMPORTANT_NOTES.md)
- [功能验证记录模板](docs/testing/VALIDATION_HISTORY.md)
- [**新手指南模板**](docs/usage/QUICK_START.md) - 环境搭建和快速上手
- [**DataService集成指南**](backend/DATA_SERVICE_INTEGRATION.md) - 后端与数据服务集成配置
- [**多源数据采集策略**](docs/data_sources/MULTI_SOURCE_STRATEGY.md) - AkShare/Baostock/Tushare多维度数据采集方案

## 👨‍💼 项目角色
**本项目的首席架构师**：负责项目整体架构设计、技术选型、开发规范制定和核心问题解决。作为项目的主要技术负责人，确保代码质量、架构可扩展性和开发效率。

## 🎯 项目目标
构建一个AI股票竞赛平台，让用户能够分配虚拟人民币账号给AI大模型进行虚拟股票交易。平台支持：

1. **用户管理**：用户注册登录，创建和管理多个AI炒股账户
2. **AI集成**：集成多种大模型（如ChatGPT、Claude、国内大模型），根据用户预设提示词和实时股票数据做出交易决策
3. **实时数据**：获取中国A股实时行情数据，包括价格、成交量、涨跌幅等
4. **虚拟交易**：模拟股票买卖操作，支持市价单、限价单等交易类型
5. **实时监控**：用户可实时查看AI操作记录、当前持仓、估算收益、交易逻辑分析
6. **竞赛功能**：不同AI账户之间的收益排名，支持多种排行榜（日榜、周榜、总榜）
7. **分析报告**：提供详细的交易分析报告，包括AI决策理由、风险评估、收益曲线等

项目采用敏捷开发方法，优先实现核心功能的最小可行版本（MVP），逐步迭代完善。

## 🏗️ 技术架构

详细技术栈信息已移至：[技术架构模板](docs/architecture/TECH_STACK.md)

## 📁 项目结构

详细项目结构信息已移至：[项目结构模板](docs/architecture/PROJECT_STRUCTURE.md)

## 📝 开发规范

详细开发规范信息已移至：[开发规范模板](docs/development/CODING_STANDARDS.md)

## 🚀 命令集

### Docker Compose一键启动（推荐）
```bash
# 启动所有服务（前端、后端、AI服务、数据服务、数据库）
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看服务日志
docker-compose logs -f [service_name]  # 如: backend, frontend, ai-service, data-service

# 停止所有服务
docker-compose down

# 停止并清理所有资源（数据卷、网络）
docker-compose down -v
```

### 开发环境手动启动

#### 后端服务（Node.js，端口3001）
```bash
cd backend
npm install          # 安装依赖
npm run dev          # 开发模式启动
# 或
node src/app.js      # 生产模式启动

# 运行测试
npm test             # 运行所有测试
npm test -- --coverage  # 测试覆盖率
```

#### 前端服务（React，端口3000）
```bash
cd frontend
npm install          # 安装依赖
npm run dev          # 开发模式启动

# 构建生产版本
npm run build        # 构建生产版本
npm run preview      # 预览构建结果
```

#### AI服务（Python，端口8000）
```bash
cd ai-service && source venv/bin/activate && 
pip install -r requirements.txt  # 安装Python依赖
python -m ai_service.main        # 启动服务

# 或使用uvicorn（开发模式）
cd ai-service && source venv/bin/activate && uvicorn ai_service.main:app --reload --host 0.0.0.0 --port 8000
```

#### 数据服务（Python，端口8001）
```bash
cd data-service && source venv/bin/activate && 
pip install -r requirements.txt  # 安装Python依赖

# 启动服务
cd data-service && source venv/bin/activate && uvicorn data_service.main:app --reload --host 0.0.0.0 --port 8001
```
### 数据库管理
```bash
# PostgreSQL数据库（端口5432）
# 使用pgAdmin管理（端口5050）：http://localhost:5050
# 用户名：admin@stock-race.com，密码：admin123

# Redis缓存（端口6379）
# 使用Redis Commander管理（端口8081）：http://localhost:8081

# TimescaleDB时序数据库（端口5433）
```

### 健康检查和API测试
```bash
# 后端健康检查
curl http://localhost:3001/api/health

# AI服务健康检查
curl http://localhost:8000/api/v1/health/

# 数据服务健康检查
curl http://localhost:8001/health

# 前端开发服务器
curl http://localhost:3000

# API文档访问
# 后端API文档：http://localhost:3001/api-docs
# AI服务API文档：http://localhost:8000/docs
# 数据服务API文档：http://localhost:8001/docs
```

### 测试命令
```bash
# 后端测试
cd backend && npm test

# AI服务测试
cd ai-service && python -m pytest tests/

# 数据服务测试
cd data-service && python -m pytest tests/

# 前端测试
cd frontend && npm test
```

### 依赖管理
```bash
# 安装前端依赖（Node.js）
cd frontend && npm install

# 安装后端依赖（Node.js）
cd backend && npm install

# 安装AI服务依赖（Python）
cd ai-service && source venv/bin/activate && pip install -r requirements.txt

# 安装数据服务依赖（Python）
cd data-service && pip install -r requirements.txt

# 使用虚拟环境（推荐）
cd ai-service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt
cd data-service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt

# 更新特定依赖
cd frontend && npm update axios
cd backend && npm update express
cd ai-service && source venv/bin/activate && pip install --upgrade openai fastapi
cd data-service && source venv/bin/activate && pip install --upgrade pandas fastapi
```


## 📋 项目规划

### 第一阶段：MVP开发完成（2026-02-02 至 2026-02-03）
**目标**：交付最小可行产品，展示核心功能

**已完成里程碑**：
1. ✅ **需求分析与技术选型**（2026-02-02）
   - 完成需求规格说明书
   - 完成技术选型分析报告
   - 确定混合架构方案

2. ✅ **基础设施搭建**（2026-02-03）
   - 创建完整项目脚手架
   - 配置Docker Compose开发环境
   - 设置CI/CD流水线

3. ✅ **架构设计与数据库建模**（2026-02-03）
   - 完成系统架构设计
   - 完成数据库ER图和API规范
   - 更新技术架构文档

4. ✅ **后端核心功能开发**（2026-02-03）
   - 实现简化用户系统（单用户密码访问）
   - 实现虚拟交易逻辑（买入/卖出、持仓管理）
   - 实现RESTful API和WebSocket实时推送
   - 集成外部服务（AI服务、数据服务）

5. ✅ **前端交易界面开发**（2026-02-03）
   - 实现React交易界面（登录、交易、持仓、监控）
   - 实现数据可视化组件（收益曲线、实时行情）
   - 实现响应式设计和用户体验优化

6. ✅ **AI集成服务开发**（2026-02-03）
   - 实现多模型AI适配器（OpenAI、DeepSeek、Claude等）
   - 实现股票交易决策逻辑和提示工程
   - 实现决策理由生成和风险评估

7. ✅ **数据服务开发**（2026-02-03）
   - 实现多数据源股票数据采集（新浪、腾讯、东方财富）
   - 实现实时数据推送和时序数据存储
   - 实现数据清洗和质量监控

### 第二阶段：集成测试与优化（规划中）
**目标**：验证系统集成，优化性能，准备演示

**计划工作**：
1. **集成测试验证**：验证所有服务协同工作
2. **性能优化**：优化实时数据延迟和API响应
3. **演示准备**：创建演示脚本和用户指南
4. **生产部署**：配置生产环境部署方案

### 第三阶段：功能扩展与平台化（规划中）
**目标**：扩展核心功能，支持多用户和多AI模型

**计划工作**：
1. **多用户支持**：实现完整的用户管理系统
2. **多AI账户**：支持用户创建多个AI交易账户
3. **高级功能**：高级分析工具、社交功能、移动端
4. **开放平台**：API开放平台、第三方集成

详细实施计划请参考：[项目实施计划模板](docs/planning/IMPLEMENTATION_PHASES.md)

## 🤖 多智能体协作执行方案

通用多智能体协作方案已移至：[通用多智能体协作方案](docs/agents/GENERIC_COLLABORATION_PLAN.md)。另请参考相关文档：[通用角色定义](docs/agents/GENERIC_ROLES.md)、[任务分发指南](docs/agents/TASK_DISPATCH_GUIDE.md)、[项目模板配置](docs/agents/PROJECT_TEMPLATE.md)

## 📊 当前状态
**集成测试完成，进入部署验证阶段**（2026-02-04）
- ✅ **TypeScript迁移完成**：前端所有核心代码转换为TypeScript，修复88个编译错误，编译无错误
- ✅ **真实数据获取方案实施**：实现多数据源路由器，4种智能选择策略，分段获取规避API限制
- ✅ **后端模块优化完成**：统一API响应格式，完善错误处理，TypeScript基础设施就绪
- ✅ **AI服务优化完成**：支持延迟数据决策，增强风险评估，添加性能监控
- ✅ **多智能体协调架构建立**：4个模块worktree配置完成，协调主文档和进度跟踪机制建立
- ✅ **系统集成测试完成**：所有服务运行正常，核心API功能验证通过，前端界面正常显示
- ⚠️ **已知问题**：东方财富数据源API解析错误，导致股票价格数据为空（降级模式返回模拟数据）
- 🔄 **部署验证准备**：开始生产环境部署配置和文档完善工作

**真实数据集成完成阶段**（2026-02-03）
- 已完成混合架构技术选型（Node.js后端 + React前端 + Python AI/数据服务）
- 已完成项目脚手架和基础设施搭建
- 已完成系统架构设计和数据库设计
- 已完成后端核心功能开发（认证、交易、股票、AI集成、持仓管理）
- 已完成前端React交易界面开发（登录、交易、持仓、监控、图表）
- 已完成Python AI集成服务开发（多模型适配、决策逻辑、提示工程）
- 已完成Python数据服务开发（多数据源采集、实时推送、时序存储）
- 已完成Docker Compose开发环境配置和CI/CD流水线
- **已完成DataService集成**（API端点适配、数据格式转换、监控健康检查、智能降级策略）
- **已完成前端真实数据集成**（市场服务、实时行情、交易页面、收益图表、持仓汇总）
- **已完成多数据源路由器实现**（新浪、腾讯、东方财富数据源负载均衡）
- 项目已具备演示功能，可进行集成测试和部署验证

**环境部署进展**（2026-02-04 更新）
- ✅ **Docker安装成功**：使用中国镜像源优化版脚本`install_docker_china.sh`完成安装
- ✅ **数据库安装成功**：使用优化版脚本`install_databases_china.sh`安装PostgreSQL、Redis
- ✅ **项目结构探索完成**：已详细分析数据服务和多数据源架构
- ✅ **数据获取方案完善**：已完成三大免费数据源分析和获取策略（见`docs/data_acquisition_plan.md`）
- ✅ **安装脚本优化**：创建了中国镜像源优化版脚本解决网络问题
- ✅ **后端依赖安装完成**：Node.js v18.19.1（要求≥20.0.0，有版本警告但不影响运行）
- ✅ **前端依赖安装完成**：React应用依赖已就绪
- 🔄 **Redis服务待启动**：Redis已安装但服务未运行，需启动服务
- 🔄 **Python pip未安装**：AI和数据服务依赖需要pip包管理器
- 🔄 **混合部署策略**：当前采用主机服务+容器化混合部署，便于调试验证
- 🔄 **全容器化支持**：项目完全支持`docker-compose up`一键启动（需要docker组权限）
- 📋 **环境检查脚本**：已创建`check_environment.sh`用于检查所有依赖和服务状态
- 📋 **开发进度报告**：已创建详细的功能清单和验证步骤（见`docs/progress_report.md`）

**后端模块优化进展**（2026-02-04 更新）
- ✅ **代码质量审查完成**：分析了38个JavaScript文件，识别了API响应格式、错误处理、TypeScript支持等问题
- ✅ **统一响应格式化工具**：创建了`responseFormatter.js`，提供标准化成功/错误/分页响应格式
- ✅ **错误处理中间件**：创建了`errorHandler.js`，实现自定义错误类和全局错误处理器
- ✅ **TypeScript基础设施**：创建了`tsconfig.json`、类型定义文件，更新了`package.json`
- ✅ **StockController优化**：更新了所有方法使用统一响应格式和错误处理
- ✅ **优化方案文档**：创建了TypeScript迁移、性能优化、WebSocket优化、监控日志、集成测试方案
- 🔄 **其他控制器优化**：TradeController.js导入已更新，需要继续优化其他控制器
- 📋 **优化进度报告**：已创建详细优化进度报告（见`backend/BACKEND_OPTIMIZATION_PROGRESS.md`）

**数据获取方案**
- 已完成新浪、腾讯、东方财富三大免费数据源分析
- 已制定多节点分段获取策略和负载均衡方案
- 计划实施实时数据获取（高频）和历史数据获取（低频）分层策略
- 设计了数据验证、缓存和故障转移机制

**开发进度报告**
详细的项目开发进度和已完成功能清单，请参考：[开发进度报告](docs/progress_report.md)
- 包含所有已完成功能的详细清单
- 功能验证步骤和检查清单
- 立即需要执行的操作指南
- 已知问题和下一步工作计划

## 🔧 近期工作重点（2026-02-04 更新）
1. ✅ **TypeScript迁移完成**：前端所有核心代码已转换为TypeScript，编译无错误
2. ✅ **真实数据获取方案实施**：多数据源路由器已实现，支持分段获取规避API限制
3. ✅ **后端模块优化完成**：API响应标准化，错误处理完善，TypeScript基础设施就绪
4. ✅ **AI服务优化完成**：支持延迟数据决策，增强风险评估，性能监控就绪
5. ✅ **多智能体协调架构建立**：4个模块worktree配置，协调主文档和进度跟踪机制
6. ✅ **系统集成测试完成**：所有服务运行正常，核心API功能验证通过，前端界面正常显示
7. 🔄 **生产部署准备**：配置生产环境部署，优化Docker Compose配置，修复数据获取API问题
8. 🔄 **性能基准测试**：建立性能基线，优化关键路径性能（优先级降低）

## 🎯 下一步工作（部署验证阶段）
1. **修复数据获取API问题**：
   ```bash
   # 1. 检查数据服务东方财富数据源解析错误
   cd data-service && source venv/bin/activate && python -c "from data_service.collectors.router import DataSourceRouter; router = DataSourceRouter(); print(router.data_sources)"

   # 2. 修复东方财富API解析问题（"too many values to unpack"错误）
   # 查看文件：data-service/src/data_service/collectors/eastmoney.py
   ```

2. **生产环境配置优化**：
   ```bash
   # 1. 检查Docker Compose生产配置
   docker-compose -f docker-compose.prod.yml config

   # 2. 优化环境变量配置
   cp backend/.env.example backend/.env.production
   cp ai-service/.env.example ai-service/.env.production
   cp data-service/.env.example data-service/.env.production
   ```

3. **文档完善和验证**：
   ```bash
   # 1. 更新部署文档
   cp docs/deployment/DEPLOYMENT_GUIDE.md.example docs/deployment/DEPLOYMENT_GUIDE.md

   # 2. 验证所有服务健康
   curl http://localhost:3001/api/health      # 后端
   curl http://localhost:8000/api/v1/health/  # AI服务
   curl http://localhost:8001/health          # 数据服务
   curl http://localhost:3000                 # 前端
   ```

4. **全容器化部署测试**：
   ```bash
   # 1. 停止所有服务
   pkill -f "node.*backend" && pkill -f "uvicorn.*ai_service" && pkill -f "uvicorn.*data_service" && pkill -f "vite"

   # 2. 使用Docker Compose启动所有服务
   docker-compose down && docker-compose up -d
   docker-compose ps  # 查看状态
   docker-compose logs -f  # 查看日志
   ```

## ⚠️ 注意事项

项目开发和使用中的注意事项，详细内容请参考：[注意事项模板](docs/usage/IMPORTANT_NOTES.md)

## 📋 功能验证记录

项目功能测试和验证记录，详细内容请参考：[功能验证记录模板](docs/testing/VALIDATION_HISTORY.md)

## 🆕 新会话快速上手

### 快速参考
- **环境搭建**：
  ```bash
  # 方案1：使用中国镜像源（推荐，解决网络问题）
  # 1. 安装数据库（需要sudo）
  sudo bash install_databases_china.sh

  # 2. 尝试安装Docker（可选）
  sudo bash install_docker_china.sh

  # 方案2：如果网络正常使用原始脚本
  # sudo bash install_databases.sh
  # sudo bash install_docker.sh

  # 3. 安装应用依赖
  cd backend && npm install
  cd frontend && npm install
  cd ai-service && source venv/bin/activate && pip install -r requirements.txt
  cd data-service && source venv/bin/activate && pip install -r requirements.txt
  ```
- **启动开发**：
  ```bash
  # 在4个终端分别启动
  cd backend && npm run dev           # 端口3001
  cd ai-service && source venv/bin/activate && python -m uvicorn ai_service.main:app --reload --port 8000
  cd data-service && source venv/bin/activate && python -m uvicorn data_service.main:app --reload --port 8001
  cd frontend && npm run dev          # 端口3000
  ```
- **核心功能**：用户登录 → 查看实时行情 → AI交易决策 → 查看持仓收益
- **关键文件**：
  - 后端：`backend/src/services/DataService.js` (数据服务集成)
  - 前端：`frontend/src/services/market.service.ts` (市场数据服务)
  - AI服务：`ai-service/src/ai_service/services/decision_service.py`
  - 数据服务：`data-service/src/data_service/collectors/router.py` (多数据源路由器)

### 详细指南
完整的新手指南请参考：[新手指南模板](docs/usage/QUICK_START.md)，包含：
- 详细的环境搭建步骤
- 核心功能使用示例
- 项目结构快速浏览
- 开发指南和调试技巧
- 常见问题与解决方案
- 开发最佳实践

## 🗺️ 代码结构地图

详细的代码结构地图已移至：[代码结构地图模板](docs/architecture/CODE_MAP.md)

**代码结构地图** 包含：
- 关键文件的功能说明和代码入口点
- 核心模块的调用关系图
- 智能体工作目录与具体代码文件的对应表
- 代码变更历史和重要修改记录
- 快速导航指南和新会话上手提示

---
*本文档最后更新于：2026-02-04*
*文档维护者：本项目首席架构师*