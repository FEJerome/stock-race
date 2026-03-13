# GitHub Issues 工作流

> **本文档定义 Stock-Race 项目使用 GitHub Issues 进行开发管理的规范**
>
> 替代原 TODO.md，作为智能体任务追踪的唯一来源

---

## 快速开始

### 查看当前任务

```bash
# 查看 Phase 1.3 的 P0 优先级任务
gh issue list --milestone "Phase 1.3" --label "priority:p0"

# 查看自己负责的任务
gh issue list --assignee @me --state open

# 查看 Local 版所有未完成任务
gh issue list --label "form:local" --state open
```

### 创建新任务

```bash
# 非交互式创建（快速记录）
gh issue create --title "[B-1.x.x] 任务标题" \
  --body "详细描述..." \
  --label "form:local,priority:p1,area:backend" \
  --milestone "Phase 1.3"

# 交互式创建（详细描述）
gh issue create --web
```

---

## Labels 体系

### 形态标签（3个）- 必须选择

| 标签 | 说明 | 使用场景 |
|------|------|----------|
| `form:local` | Local本地验证版 | 当前主要开发形态 |
| `form:mvp` | MVP小程序合规版 | 规划中的小程序版本 |
| `form:full` | Full商业完整版 | 完整商业版本 |

**组合使用**：同一任务影响多个形态时，同时打多个标签
- 例：`form:local` + `form:full` = 同时影响两个形态的核心模块改造

### 优先级标签（3个）- 必选其一

| 标签 | 说明 | 响应时间 |
|------|------|----------|
| `priority:p0` | 阻塞性，必须立即处理 | 当天 |
| `priority:p1` | 当前阶段必须完成 | 本周 |
| `priority:p2` | 有精力时完成 | 灵活安排 |

### 模块标签（5个）- 必选其一

| 标签 | 说明 |
|------|------|
| `area:backend` | 后端逻辑（FastAPI）、API、业务服务、数据库模型 |
| `area:frontend` | 前端界面（Vue 3） |
| `area:data` | 数据采集、清洗、解析、外部数据源对接（数据管道） |
| `area:infra` | 基础设施/部署 |
| `area:design` | 设计/产品 |

**边界说明**：
- `area:backend` 关注**业务逻辑**（如何处理数据）
- `area:data` 关注**数据获取**（如何采集、清洗外部数据）
- 例：新闻爬虫 → `area:data`；新闻展示API → `area:backend`

### 类型标签（3个）- 可选

| 标签 | 说明 |
|------|------|
| `type:feature` | 新功能实现 |
| `type:bug` | Bug/缺陷 |
| `type:idea` | 想法/待验证（大脑卸载专用） |

**注意**：本项目使用自定义标签体系，不使用 GitHub 默认标签（如 `enhancement`、`bug` 等）。

---

## Milestones（阶段）

| Milestone | 描述 | 状态 |
|-----------|------|------|
| Phase 1.3 | 完整用户体验 - 合规补丁 | 进行中 |
| Phase 1.4 | 事件舆情系统 | 进行中（33%） |
| Phase 2.0 | MVP小程序启动 | 规划中 |
| Phase 3.0 | Full商业版启动 | 规划中 |

---

## Issue 标题规范

```
[任务ID] 简短描述

示例：
[B-1.3.13] 策略粒度检测服务实现
[F-1.3.16] 粒度反馈UI组件
[IDEA] 支持导入自选股文件
[BUG] 行情页面偶发WS断开
[REFACTOR] 统一错误处理机制
```

**任务ID规则**：
- `B-x.x.x` = Backend 任务
- `F-x.x.x` = Frontend 任务
- `DB-Px.x` = Database 改造
- `IDEA/BUG/REFACTOR` = 非计划内任务

---

## Issue 描述模板

### 功能任务模板

```markdown
## 任务描述
简要说明任务目标和背景

## 实现要求
- [ ] 要求1
- [ ] 要求2

## 技术细节
引用 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) 相关章节

## 验收标准
- [ ] 标准1
- [ ] 标准2

## 依赖
- 依赖任务: #xxx
- 依赖文档: [ARCHITECTURE.md §x.x](./ARCHITECTURE.md)

## 预估工时
X小时
```

### Bug 报告模板

```markdown
## 问题描述
简明描述 Bug 现象

## 复现步骤
1. 步骤1
2. 步骤2
3. 步骤3

## 期望行为
描述期望的正确行为

## 实际行为
描述实际的错误行为

## 环境信息
- 分支: main/develop
- 浏览器: Chrome/Firefox
- 相关 commit: abc123
```

### 想法记录模板

```markdown
## 想法概述
一句话描述想法

## 背景/动机
为什么会有这个想法

## 初步方案
大致的实现思路（可选）

## 待验证问题
- 问题1
- 问题2
```

---

## 工作流

### 智能体每日工作流程

1. **查看任务**
   ```bash
   gh issue list --milestone "Phase 1.3" --label "priority:p0" --state open
   ```

2. **认领任务**
   ```bash
   gh issue edit <number> --assignee @me
   ```

3. **开发实现**
   - 开发过程中在 Issue 下添加进度评论
   - Commit message 引用 Issue: `git commit -m "feat: xxx (refs #42)"`

4. **提交 PR**
   - PR 描述中关联 Issue: `Closes #42`
   - 请求 Review

5. **关闭 Issue**
   ```bash
   gh issue close <number> --comment "已完成，见 PR #xxx"
   ```

### 任务状态流转

```
📋 Backlog (待开始)
    │
    ▼ 开发者认领
🔄 In Progress (开发中)
    │
    ▼ 提交 PR
👀 Review (审核中)
    │
    ▼ PR 合并
✅ Done (完成)
```

使用 GitHub Project 看板管理状态，或在 Issue 标题前加状态标记：
- `[WIP]` = 开发中
- `[REVIEW]` = 审核中
- 无标记 = 待开始

---

## 大脑卸载（快速记录）

开发中突然想到的点子，立即记录不中断思路：

```bash
# 最简方式（3秒完成）
gh issue create --title "[IDEA] 点子标题" \
  --body "待后续补充..." \
  --label "type:idea"
```

**原则**：先记录，后整理。想法类 Issue 不需要立即完善。

---

## 与文档的关联

| 文档 | 用途 | 与 Issues 的关系 |
|------|------|-----------------|
| IMPLEMENTATION_PLAN.md | 技术设计、接口定义、工时估算 | Issue 引用相关章节 |
| ARCHITECTURE.md | 架构决策记录 | Issue 引用相关设计 |
| GITHUB_ISSUES_WORKFLOW.md | 本文件 | 工作规范参考 |

**不重复原则**：
- 技术设计细节 → 放 IMPLEMENTATION_PLAN.md
- 执行状态/进度 → 放 GitHub Issues
- 变更历史 → 放 CHANGELOG.md

---

## 快捷命令参考

```bash
# ========== 查询类 ==========

# 查看所有开放 Issues
gh issue list

# 查看 P0 优先级任务
gh issue list --label "priority:p0"

# 查看指定形态的任务
gh issue list --label "form:local"

# 查看指定阶段的所有任务
gh issue list --milestone "Phase 1.3"

# 组合查询：Phase 1.3 的 Local 版 P0 任务
gh issue list --milestone "Phase 1.3" --label "form:local,priority:p0"

# 查看我负责的任务
gh issue list --assignee @me

# 查看已关闭的任务
gh issue list --state closed --limit 10

# ========== 创建/编辑类 ==========

# 创建任务
gh issue create --title "标题" --body "内容" --label "标签" --milestone "里程碑"

# 编辑任务（加标签）
gh issue edit <number> --label "priority:p0,area:backend"

# 分配任务给自己
gh issue edit <number> --assignee @me

# 分配给里程碑
gh issue edit <number> --milestone "Phase 1.3"

# ========== 状态管理类 ==========

# 关闭任务
gh issue close <number>

# 关闭并添加注释
gh issue close <number> --comment "已完成"

# 重新打开任务
gh issue reopen <number>

# 在浏览器中查看任务
gh issue view <number> --web
```

---

## 注意事项

1. **Issue 堆积控制**：每周五15分钟清理过时 Issue，关闭不再需要或已失去意义的 Issue

2. **粒度控制**：一个 Issue 应该是一个可独立完成的单元，太大应拆分为子任务

3. **及时更新**：开发过程中及时更新 Issue 状态，避免信息过时

4. **关联引用**：Commit 和 PR 中引用 Issue 编号，建立完整的追溯链

---

*本文档最后更新：2026-03-13*
