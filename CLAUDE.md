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
cd ai-service
pip install -r requirements.txt  # 安装Python依赖
python -m ai_service.main        # 启动服务

# 或使用uvicorn（开发模式）
uvicorn ai_service.main:app --reload --host 0.0.0.0 --port 8000
```

#### 数据服务（Python，端口8001）
```bash
cd data-service
pip install -r requirements.txt  # 安装Python依赖
uvicorn data_service.main:app --reload --host 0.0.0.0 --port 8001
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
cd ai-service && pip install -r requirements.txt

# 安装数据服务依赖（Python）
cd data-service && pip install -r requirements.txt

# 使用虚拟环境（推荐）
cd ai-service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt
cd data-service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt

# 更新特定依赖
cd frontend && npm update axios
cd backend && npm update express
cd ai-service && pip install --upgrade openai fastapi
cd data-service && pip install --upgrade pandas fastapi
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
**MVP开发完成阶段**（2026-02-03）
- 已完成混合架构技术选型（Node.js后端 + React前端 + Python AI/数据服务）
- 已完成项目脚手架和基础设施搭建
- 已完成系统架构设计和数据库设计
- 已完成后端核心功能开发（认证、交易、股票、AI集成、持仓管理）
- 已完成前端React交易界面开发（登录、交易、持仓、监控、图表）
- 已完成Python AI集成服务开发（多模型适配、决策逻辑、提示工程）
- 已完成Python数据服务开发（多数据源采集、实时推送、时序存储）
- 已完成Docker Compose开发环境配置和CI/CD流水线
- 项目已具备演示功能，可进行集成测试和部署验证

## 🔧 近期工作重点
1. **集成测试验证**：验证前后端、AI服务、数据服务的完整集成
2. **功能演示完善**：完善演示脚本、创建用户指南、准备演示数据
3. **性能优化调整**：优化实时数据延迟、API响应时间、内存使用
4. **部署环境配置**：配置生产环境部署、监控告警、日志收集
5. **文档完善更新**：完善用户手册、部署指南、API文档

## 🎯 下一步工作
1. **启动完整集成测试**：使用Docker Compose启动所有服务，验证端到端功能
2. **运行演示脚本验证**：执行现有演示脚本，验证核心交易和AI决策功能
3. **配置生产部署**：设置Kubernetes部署配置、负载均衡、监控告警
4. **性能基准测试**：进行压力测试，优化高并发场景性能
5. **用户反馈收集**：准备用户测试计划，收集功能改进建议

## ⚠️ 注意事项

项目开发和使用中的注意事项，详细内容请参考：[注意事项模板](docs/usage/IMPORTANT_NOTES.md)

## 📋 功能验证记录

项目功能测试和验证记录，详细内容请参考：[功能验证记录模板](docs/testing/VALIDATION_HISTORY.md)

## 🆕 新会话快速上手

### 快速参考
[请在此处填写stock-race项目的快速参考信息，例如：]
- **环境搭建**：[填写前端/后端依赖安装命令]
- **启动开发**：[填写开发服务器启动命令]
- **核心功能**：[填写项目核心功能流程]
- **关键文件**：
  - 后端：[填写关键后端文件路径]
  - 前端：[填写关键前端文件路径]
  - 工具：[填写关键工具文件路径]

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
*本文档最后更新于：2026-02-02*
*文档维护者：本项目首席架构师*