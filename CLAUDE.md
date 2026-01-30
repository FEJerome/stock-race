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
[请在此处填写stock-race项目的具体目标，例如：构建一个股票竞赛平台，支持实时数据展示、交易模拟、排行榜等功能。]

## 🏗️ 技术架构

详细技术栈信息已移至：[技术架构模板](docs/architecture/TECH_STACK.md)

## 📁 项目结构

详细项目结构信息已移至：[项目结构模板](docs/architecture/PROJECT_STRUCTURE.md)

## 📝 开发规范

详细开发规范信息已移至：[开发规范模板](docs/development/CODING_STANDARDS.md)

## 🚀 命令集

### 开发环境启动
```bash
# 启动后端服务器（端口3001）
cd server && npm start
# 或使用开发模式（自动重启）
cd server && npm run dev

# 启动前端开发服务器（端口3000）
cd frontend && npm run dev

# 同时启动前后端（需要两个终端）
# 终端1: cd server && npm start
# 终端2: cd frontend && npm run dev
```

### 构建和部署
```bash
# 构建前端生产版本
cd frontend && npm run build

# 预览构建结果
cd frontend && npm run preview

# 启动生产环境（需要先构建前端）
cd server && npm start
```

### 测试命令
```bash
# 运行编码测试脚本
cd server && node test_encoding.js

# 运行适配器测试脚本
cd server && node test_adapter.js

# 运行监控系统测试
cd server && node test_monitoring_system.js

# 健康检查
curl http://localhost:3001/health

# 获取监控数据
curl http://localhost:3001/api/metrics
curl http://localhost:3001/api/metrics?level=detailed

# 获取系统统计
curl http://localhost:3001/api/stats

# 查看错误日志
curl http://localhost:3001/api/logs/errors?limit=10
```

### 依赖管理
```bash
# 安装前端依赖
cd frontend && npm install

# 安装后端依赖
cd server && npm install

# 更新特定依赖
cd frontend && npm update axios
cd server && npm update cheerio
```


## 📋 项目规划
[请在此处填写stock-race项目的详细规划，包括阶段划分、里程碑等。]

<!-- 原实施计划模板参考：docs/planning/IMPLEMENTATION_PHASES.md -->

## 🤖 多智能体协作执行方案

通用多智能体协作方案已移至：[通用多智能体协作方案](docs/agents/GENERIC_COLLABORATION_PLAN.md)。另请参考相关文档：[通用角色定义](docs/agents/GENERIC_ROLES.md)、[任务分发指南](docs/agents/TASK_DISPATCH_GUIDE.md)、[项目模板配置](docs/agents/PROJECT_TEMPLATE.md)

## 📊 当前状态
[请在此处填写stock-race项目的当前开发状态。]

## 🔧 近期工作重点
[请在此处填写stock-race项目的近期工作重点。]

## 🎯 下一步工作
[请在此处填写stock-race项目的下一步工作计划。]

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
*本文档最后更新于：2026-01-30*
*文档维护者：本项目首席架构师*