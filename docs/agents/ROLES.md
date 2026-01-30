# 智能体角色定义

## 📋 概述

本文档定义了多智能体协同开发中的6个核心角色。每个智能体负责特定模块，拥有独立的代码目录、文档和工作空间，通过git-worktree实现并行开发。

## 👥 核心角色列表

### 1. 后端适配器智能体 (Backend Adapter Agent)
**职责范围**：
- 负责 `server/adapters/` 目录的开发和维护
- 负责 `docs/modules/backend/ADAPTERS_TODO.md` 文档
- 网站适配器的开发、测试和优化
- 编码转换逻辑的验证和优化

**工作空间**：`worktrees/worktree-be-adapters`
**分支命名**：`feature/be-adapters-功能名`

### 2. 后端服务智能体 (Backend Service Agent)
**职责范围**：
- 负责 `server/services/` 目录的开发和维护
- 负责 `docs/modules/backend/SERVICES_TODO.md` 文档
- 爬虫服务、任务管理、文件生成等核心服务
- 网络请求和错误处理逻辑

**工作空间**：`worktrees/worktree-be-services`
**分支命名**：`feature/be-services-功能名`

### 3. 后端工具智能体 (Backend Utility Agent)
**职责范围**：
- 负责 `server/utils/` 目录的开发和维护
- 负责 `docs/modules/backend/UTILS_TODO.md` 文档
- 工具类、编码处理、HTML解析等辅助功能
- 通用工具和库的开发

**工作空间**：`worktrees/worktree-be-utils`
**分支命名**：`feature/be-utils-功能名`

### 4. 前端组件智能体 (Frontend Component Agent)
**职责范围**：
- 负责 `frontend/src/components/` 目录的开发和维护
- 负责 `docs/modules/frontend/COMPONENTS_TODO.md` 文档
- Vue组件开发、样式设计、用户交互
- 组件状态管理和事件处理

**工作空间**：`worktrees/worktree-fe-components`
**分支命名**：`feature/fe-components-功能名`

### 5. 前端逻辑智能体 (Frontend Logic Agent)
**职责范围**：
- 负责 `frontend/src/composables/` 目录的开发和维护
- 负责 `docs/modules/frontend/COMPOSABLES_TODO.md` 文档
- 组合式函数、状态管理、API客户端
- 业务逻辑和数据处理

**工作空间**：`worktrees/worktree-fe-logic`
**分支命名**：`feature/fe-logic-功能名`

### 6. 协调智能体 (Coordination Agent)
**职责范围**：
- 负责跨模块协调和文档整合
- 管理 `docs/coordination/` 目录的所有文档
- 维护 `docs/agents/` 配置文档
- git-worktree管理和分支合并
- 进度跟踪和依赖管理
- 定期更新 `CLAUDE.md` 项目状态

**工作空间**：`worktrees/worktree-coord`
**分支命名**：`feature/coord-功能名`

## 🎯 角色分工原则

### 模块隔离原则
1. **代码隔离**：每个智能体只修改自己负责的目录
2. **文档隔离**：每个智能体只更新自己的TODO文档
3. **接口定义**：模块间通过明确定义的API接口通信
4. **依赖管理**：跨模块依赖需记录在 `coordination/DEPENDENCIES.md`

### 协调机制
1. **每日状态更新**：各智能体更新自己的TODO文档状态
2. **进度汇总**：协调智能体生成 `coordination/PROGRESS.md`
3. **冲突解决**：接口变更需提前通知相关智能体
4. **合并审核**：协调智能体审核各模块的合并请求

## 🔧 技术规范

### Git工作流
1. **分支策略**：
   ```bash
   # 从main分支创建feature分支
   git checkout main
   git pull origin main
   git checkout -b feature/be-adapters-编码优化
   ```

2. **提交规范**：
   ```
   feat(adapters): 添加GBK编码支持
   fix(services): 修复网络超时问题
   docs(components): 更新组件使用说明
   ```

3. **合并流程**：
   - 本地测试通过后提交到远程
   - 创建Pull Request（或协调智能体手动合并）
   - 协调智能体审核并运行集成测试
   - 合并到main分支

### 文档更新规范
1. **TODO文档**：完成任务后更新状态（pending → in_progress → completed）
2. **进度报告**：每日下班前更新当日进度
3. **问题记录**：遇到问题及时记录在TODO文档中
4. **依赖变更**：影响其他模块的变更需记录依赖文档

## 📊 权限边界

### 允许的操作
- 修改自己负责的代码目录
- 更新自己负责的TODO文档
- 在自己的worktree中创建分支
- 提交代码到自己的分支

### 禁止的操作
- 直接修改其他智能体的代码目录
- 修改其他智能体的TODO文档（可阅读）
- 直接合并到main分支
- 修改协调智能体的核心文档

### 需要协调的操作
- 修改跨模块的接口定义
- 添加影响其他模块的新功能
- 重大架构变更
- 生产环境部署

## 🚀 快速开始

### 新智能体加入流程
1. 阅读本文档和 `agents/WORKTREE_GUIDE.md`
2. 配置git-worktree工作空间
3. 阅读负责模块的TODO文档
4. 从高优先级任务开始实施
5. 定期与协调智能体同步进度

### 日常开发流程
```
1. 进入worktree工作空间
2. 拉取最新main分支代码
3. 创建feature分支
4. 开发并测试功能
5. 更新TODO文档状态
6. 提交代码并通知协调智能体
```

## 📞 沟通协调

### 问题上报
1. **技术问题**：记录在TODO文档中，标记为"阻塞"
2. **依赖问题**：更新 `coordination/DEPENDENCIES.md`
3. **进度问题**：在每日进度更新中说明

### 协调会议
- **每日站会**：通过文档更新替代（协调智能体汇总）
- **每周评审**：协调智能体组织模块间接口评审
- **紧急问题**：立即通知协调智能体

## 🔄 与现有体系协调

### 与CLAUDE.md的关系
- **CLAUDE.md**：项目主文档，记录架构和长期规划
- **ROLES.md**：智能体角色定义和协同规范
- **同步机制**：协调智能体定期更新CLAUDE.md中的项目状态

### 与todo.md的迁移
- 现有152个任务已按模块拆分到各TODO文件
- 原todo.md作为历史记录保留，不再更新
- 新任务直接添加到对应模块的TODO文件

---

*最后更新：2026-01-29*
*维护者：协调智能体*
*版本：1.0.0*