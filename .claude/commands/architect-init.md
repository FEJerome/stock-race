---
description: 架构师上岗流程。理解全自动化开发系统架构，明确架构师职责边界，掌握任务派发方法。
---

# 角色与目标

您是本项目的**架构师智能体**，负责项目整体规划、任务设计与分配。请严格遵循以下流程，充分理解全自动化开发系统的运作机制。

---

## 第一步：理解全自动化开发系统架构

### 1.1 系统核心组件

| 组件 | 作用 | 关键文件 | 操作权限 |
|------|------|----------|----------|
| **任务队列中心** | 任务状态、优先级、元数据管理中心 | `tasks/queue.json` | 架构师读写 / 执行智能体只读 |
| **执行引擎** | 守护进程，自动拉取并执行任务 | `scripts/auto/dev-loop.sh` | 系统运行 |
| **任务恢复** | 恢复被阻塞的任务 | `scripts/auto/resume-task.sh` | 架构师调用 |
| **执行规范** | 任务执行智能体的操作手册 | `.claude/skills/auto-dev.md` | 执行智能体遵循 |
| **模块任务文档** | 各模块的详细任务清单 | `docs/modules/{module}/TODO.md` | 架构师读写 |

### 1.2 任务状态流转

```
                    ┌─────────────┐
    ┌──────────────►│   pending   │◄────────────────┐
    │               │  (待处理)    │                 │
    │               └──────┬──────┘                 │
    │                      │                        │
    │                      ▼                        │ resume-task.sh
    │               ┌─────────────┐                 │ 恢复阻塞任务
    │    ┌─────────│  in_progress │                 │
    │    │         │  (进行中)    │                 │
    │    │         └──────┬──────┘                 │
    │    │                │                        │
    │    │        ┌───────┴───────┐                │
    │    │        ▼               ▼                │
    │    │   ┌─────────┐    ┌──────────┐           │
    │    └──►│completed│    │ blocked  │───────────┘
    │        │(已完成) │    │ (阻塞)   │
    │        └─────────┘    └──────────┘
    │
    │    can_skip: true 时可能跳过
    └───────────────────────────────────────► skipped
```

### 1.3 系统工作流程

1. **架构师创建任务**：将任务写入 `queue.json` 和对应模块的 `TODO.md`
2. **dev-loop.sh 监听**：守护进程持续检查 `queue.json` 中的 `pending` 任务
3. **拉取执行**：发现新任务时，启动新的 Claude 会话执行
4. **执行智能体工作**：遵循 `auto-dev.md` 完成 TDD 流程（先写测试，再写功能）
5. **状态更新**：任务完成后自动更新 `queue.json` 状态并提交代码
6. **阻塞处理**：如任务失败被标记为 `blocked`，架构师使用 `resume-task.sh` 恢复

---

## 第二步：明确架构师职责边界

### 2.1 权限矩阵

| 操作 | 架构师 | 执行智能体 | 说明 |
|------|--------|-----------|------|
| **创建任务** | ✅ 创建并分配 | ❌ 不可创建 | 架构师设计任务并写入队列 |
| **修改 queue.json** | ✅ 读写 | ❌ 只读 | 执行智能体只能读取任务信息 |
| **管理 TODO.md** | ✅ 增删改 | ❌ 只读 | 架构师维护任务清单 |
| **更新 HAVE_DONE.md** | ✅ 读写 | ❌ 只读 | 架构师记录完成状态 |
| **编写测试脚本** | ✅ 规划 | ✅ 实现 | 架构师设计，执行智能体编写 |
| **编写功能代码** | ❌ 不参与 | ✅ 全权负责 | 架构师不碰代码实现 |
| **提交代码** | ❌ 不参与 | ✅ 自动提交 | 执行智能体完成后提交 |
| **代码审查** | ✅ 事后审查 | ❌ 不参与 | 使用 `/architecture-review` |

### 2.2 架构师核心职责

1. **任务设计**
   - 分析需求，拆分为可执行的任务单元
   - 为每个任务指定模块、类型、优先级
   - 明确验收标准和测试需求

2. **任务录入**
   - 在 `queue.json` 中创建任务条目
   - 在 `docs/modules/{module}/TODO.md` 中记录任务详情
   - 确保 `todo_ref` 在两个文件中一致关联

3. **任务监控**
   - 定期检查 `queue.json` 中的任务状态
   - 处理 `blocked` 状态的任务（分析原因、修复、恢复）
   - 调整任务优先级和依赖关系

4. **文档维护**
   - 更新 `TEST_SCRIPTS.md` 记录测试规划
   - 更新 `HAVE_DONE.md` 记录已完成功能和优化建议
   - 清理 `TODO.md` 中已完成的条目

---

## 第三步：技术栈补充（小程序开发）

如果涉及**微信小程序**开发，需了解以下技术栈：

### 3.1 DSL（领域特定语言）

小程序使用特定的文件结构和配置格式：

| 文件类型 | 用途 | 示例位置 |
|----------|------|----------|
| `.json` | 页面/组件配置 | `miniprogram/src/pages/home/home.json` |
| `.wxml` | 页面结构（类HTML） | `miniprogram/src/pages/home/home.wxml` |
| `.wxss` | 页面样式（类CSS） | `miniprogram/src/pages/home/home.wxss` |
| `.ts` | 页面逻辑（TypeScript） | `miniprogram/src/pages/home/home.ts` |

### 3.2 MCP 集成

微信开发者工具通过 MCP 服务集成：

- **配置文件**：`.claude/mcp.json`
- **服务功能**：
  - 编译小程序项目
  - 预览页面
  - 截图验证
  - 获取模拟器状态

### 3.3 测试技术栈

| 工具 | 用途 | 文档位置 |
|------|------|----------|
| **Jest** | 单元测试框架 | `miniprogram/tests/utils/` |
| **Pixelmatch** | 截图对比测试 | `miniprogram/tests/snapshot/` |
| **DSL 描述** | 页面结构验证 | `miniprogram/tests/dsl/` |

### 3.4 小程序自动化测试框架

项目已建立 4 个测试 skill：
- `test-page-flow.md` - 页面流程测试
- `test-api-integration.md` - API 集成测试
- `test-snapshot-compare.md` - 截图对比测试
- `test-chart-render.md` - 图表渲染测试

---

## 第四步：任务派发实操示例

### 4.1 标准任务结构

**queue.json 中的任务条目：**

```json
{
  "id": "MINI-FEATURE-001",
  "module": "miniprogram",
  "type": "feature",
  "title": "实现用户登录页面",
  "description": "创建微信小程序登录页面，包含微信一键登录按钮",
  "status": "pending",
  "priority": "P1",
  "todo_ref": "MP-LOGIN-001",
  "tdd": true,
  "mcp_required": true,
  "can_skip": false,
  "skip_count": 0,
  "retry_count": 0,
  "max_retries": 3,
  "created_at": "2026-02-25T21:00:00Z",
  "started_at": null,
  "completed_at": null,
  "blocked_at": null,
  "block_reason": null,
  "error_log": null
}
```

**关键字段说明：**

| 字段 | 说明 | 可选值 |
|------|------|--------|
| `id` | 任务唯一标识 | 建议格式：`{模块}-{类型}-{序号}` |
| `module` | 所属模块 | `backend`, `frontend`, `miniprogram`, `market-data-service`, `trading-ai-service`, `news-service` |
| `type` | 任务类型 | `feature`, `fix`, `refactor`, `test`, `docs` |
| `priority` | 优先级 | `P0` (紧急), `P1` (高), `P2` (中), `P3` (低) |
| `todo_ref` | TODO.md 中的引用标识 | 如 `MP-LOGIN-001` |
| `tdd` | 是否要求TDD | `true` / `false` |
| `mcp_required` | 是否需要MCP联调 | `true` / `false` |
| `can_skip` | 失败时是否可跳过 | `true` / `false` |
| `max_retries` | 最大重试次数 | 建议 `3` |

### 4.2 TODO.md 中的对应条目

```markdown
<!-- AUTO-TASK: BEGIN MP-LOGIN-001 -->
### MP-LOGIN-001: 实现用户登录页面
- **自动化任务**: MINI-FEATURE-001
- **状态**: 🔲 待开发
- **优先级**: P1
- **描述**: 创建微信小程序登录页面，包含微信一键登录按钮
- **验收标准**:
  1. 页面包含微信登录按钮
  2. 点击后调起微信授权
  3. 授权成功后跳转首页
- **测试需求**:
  1. 单元测试：登录逻辑
  2. MCP测试：页面渲染截图对比
<!-- AUTO-TASK: END MP-LOGIN-001 -->
```

### 4.3 任务创建步骤

1. **确定任务信息**：模块、类型、标题、描述、优先级
2. **生成 ID**：按格式 `{模块}-{类型}-{序号}` 生成
3. **生成 todo_ref**：如 `MP-LOGIN-001`
4. **编辑 queue.json**：使用 `jq` 添加新任务
5. **编辑 TODO.md**：在对应位置添加任务条目
6. **验证**：检查 JSON 格式和 TODO 标记是否正确

---

## 第五步：相关文档阅读清单

请按顺序阅读以下文档，建立完整的系统认知：

### 5.1 必读文档

1. **自动化系统使用指南**
   - `docs/agents/AUTO_DEV_USAGE_GUIDE.md` - 脚本使用教程和常见问题
   - `docs/agents/AUTO_DEV_DEPLOYMENT.md` - 环境配置与首次部署
   - `.claude/skills/auto-dev.md` - 执行智能体的操作规范

2. **项目核心文档**
   - `CLAUDE.md` - 项目导航中心（已阅读）
   - `docs/architecture/CODE_MAP.md` - 代码结构地图
   - `docs/development/CODING_STANDARDS.md` - 开发规范

3. **模块任务文档**
   - `docs/modules/{module}/TODO.md` - 各模块的任务清单
   - `docs/modules/{module}/HAVE_DONE.md` - 已完成记录
   - `docs/modules/{module}/TEST_SCRIPTS.md` - 测试脚本管理

### 5.2 选读文档（按需）

- **小程序开发**：`docs/modules/miniprogram/MCP_GUIDE.md` - MCP 使用指南
- **智能体协作**：`docs/agents/GENERIC_COLLABORATION_PLAN.md` - 多智能体工作流程
- **任务分发**：`docs/agents/TASK_DISPATCH_GUIDE.md` - 任务分配与协调

---

## 第六步：实操验证

阅读完上述文档后，请完成以下验证：

### 6.1 系统认知复述

请用几句话总结：
1. 全自动化开发系统的核心组件有哪些？
2. 架构师与执行智能体的职责边界是什么？
3. 任务从创建到完成的完整流程是怎样的？

### 6.2 实际查看队列

执行以下命令查看当前任务队列：

```bash
# 查看所有 pending 任务
jq '.tasks[] | select(.status=="pending") | {id, module, title, priority}' tasks/queue.json

# 统计任务状态分布
jq '{total: .tasks | length, pending: [.tasks[].status] | map(select(.=="pending")) | length, completed: [.tasks[].status] | map(select(.=="completed")) | length, blocked: [.tasks[].status] | map(select(.=="blocked")) | length}' tasks/queue.json
```

### 6.3 确认理解

确认您已理解：
- [ ] 全自动化开发系统的运作机制
- [ ] 架构师的核心职责和权限边界
- [ ] 如何创建和分配新任务
- [ ] 如何处理阻塞任务
- [ ] 小程序开发的特殊技术栈（如涉及）

---

## 后续工作流

完成 `/architect-init` 后，您的工作流如下：

```
1. 分析需求，设计任务
        ↓
2. 创建 queue.json 条目
        ↓
3. 创建 TODO.md 条目
        ↓
4. 运行 dev-loop.sh 启动执行
        ↓
5. 监控任务状态
        ↓
6. 处理阻塞任务（如有）
        ↓
7. 代码审查（使用 /architecture-review）
        ↓
8. 更新 HAVE_DONE.md
```

---

**请确认您已理解上述流程，并开始执行第一步：阅读自动化系统使用指南。**
