# 全自动化智能体开发方案 - 部署指南

**制定日期**: 2026-02-25
**版本**: 1.0
**状态**: 已确定，可执行

---

## 📋 方案概述

本方案实现基于 **Skill驱动** 的全自动化智能体开发架构，通过 Shell 脚本循环调度 Claude 会话，每个会话加载预定义的 Skill 完成独立的开发任务。

### 核心设计原则

1. **简单可靠**: 每个任务 = 一个全新的 Claude 会话
2. **Skill驱动**: 所有开发逻辑集中在 Skill 文件中
3. **双层任务模型**: 简约的队列调度 + 详细的模块文档
4. **容灾能力**: 阻塞任务可跳过，人工可随时介入

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      全自动化架构（Skill驱动）                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Shell层（极简）                  Claude层（核心）                │
│  ───────────────                  ─────────────                  │
│                                                                 │
│  dev-loop.sh                      ┌─────────────────────────┐    │
│  └── 无限循环                      │   Skill: auto-dev       │    │
│      ├── 读取 queue.json          │   └── 标准开发流程        │    │
│      ├── 启动 Claude 会话         │       ├── 读取任务         │    │
│      └── 传入任务ID               │       ├── 加载项目上下文   │    │
│                                   │       ├── 读取模块TODO     │    │
│                                   │       ├── TDD开发         │    │
│                                   │       ├── MCP联调（如需）  │    │
│                                   │       ├── 更新文档         │    │
│                                   │       └── 提交代码         │    │
│                                   └─────────────────────────┘    │
│                                                                 │
│  关系：Shell只负责"启动器"，所有开发逻辑在Claude Skill中完成      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗂️ 目录结构

创建以下文件和目录：

```
stock-race/
├── .claude/
│   └── skills/
│       └── auto-dev.md           # 核心开发流程Skill（P0）
│
├── tasks/
│   ├── queue.json                # 主任务队列（P0）
│   ├── queue.json.backup         # 自动备份
│   └── templates/                # 任务模板（可选）
│       └── unit-task-template.json
│
├── scripts/auto/
│   ├── dev-loop.sh               # 主循环脚本（P0）
│   ├── resume-task.sh            # 人工恢复脚本（P1）
│   ├── setup-mcp.sh              # MCP环境检查（P1）
│   ├── check-health.sh           # 健康检查（P1）
│   └── lib/
│       └── common.sh             # 公共函数库（可选）
│
├── logs/auto-dev/                # 日志目录
│   ├── errors/                   # 错误日志
│   ├── reports/                  # 执行报告
│   └── daily/                    # 每日汇总
│
└── docs/modules/{module}/        # 各模块文档（需更新格式）
    ├── TODO.md                   # 添加AUTO-TASK标记
    ├── HAVE_DONE.md              # 追加记录
    └── TEST_SCRIPTS.md           # 更新测试索引
```

---

## 📄 核心文件内容

### 1. Skill文件（.claude/skills/auto-dev.md）

```markdown
---
name: auto-dev
description: 全自动化单任务开发流程
---

# 全自动化开发助手

你是stock-race项目的全自动化开发智能体。你的职责是完成分配的开发任务，并严格遵守TDD流程。

## 任务执行流程

当你被调用时，会收到一个任务ID（如 MINI-001）。请按以下步骤执行：

### Step 1: 读取任务信息

1. 读取 `tasks/queue.json`，找到对应任务
   ```bash
   cat tasks/queue.json | jq '.tasks[] | select(.id=="{{TASK_ID}}")'
   ```

2. 根据 `module` 和 `todo_ref` 读取模块TODO文档
   ```bash
   cat docs/modules/{module}/TODO.md
   ```

### Step 2: 更新状态为"进行中"

1. 更新 queue.json
   ```bash
   jq --arg id "{{TASK_ID}}" '.tasks[] |= if .id == $id then .status = "in_progress" | .started_at = now else . end' tasks/queue.json > tmp.json && mv tmp.json tasks/queue.json
   ```

2. 更新 TODO.md 中的状态标记
   - 找到 `<!-- AUTO-TASK: BEGIN {todo_ref} -->`
   - 将 `**状态**: 🔲 待开发` 改为 `**状态**: 🔄 开发中`

### Step 3: TDD开发流程

**先写测试**：
1. 根据技术方案和验收标准，创建测试脚本
2. 保存到 `tests/modules/{module}/test_{{TASK_ID}}.py` 或对应位置
3. 更新 `docs/modules/{module}/TEST_SCRIPTS.md`

**再写功能**：
1. 根据技术方案实现功能代码
2. 遵循项目的编码规范

**运行测试**：
1. 执行测试脚本
2. 如果失败，修复代码直到通过
3. 记录测试结果

### Step 4: MCP联调（如任务需要）

如果 `mcp_required: true`：
1. 使用 mcp__weixin_devtools 进行编译验证
2. 如需截图验证，使用 MCP 截图功能
3. 验证通过后继续

### Step 5: 文档留痕

1. 更新 TODO.md：
   - 状态改为 `✅ 已完成`
   - 添加完成时间
   - 添加测试结果摘要

2. 追加到 HAVE_DONE.md：
   ```markdown
   - $(date +%Y-%m-%d): {todo_ref} 完成 - {任务标题}
     - 测试: 通过/失败
     - 备注: xxx
   ```

3. 更新 TEST_SCRIPTS.md（如新增测试文件）

### Step 6: 提交代码

```bash
git add .
git commit -m "feat({module}): {{TASK_ID}} {任务标题} [automated]"
```

### Step 7: 更新任务状态为完成

更新 queue.json：
```bash
jq --arg id "{{TASK_ID}}" '.tasks[] |= if .id == $id then .status = "completed" | .completed_at = now else . end' tasks/queue.json > tmp.json && mv tmp.json tasks/queue.json
```

---

## 错误处理

如果任何步骤失败：

1. **记录错误**：
   ```bash
   echo "[$(date)] {{TASK_ID}} failed: {错误原因}" >> logs/auto-dev/errors/{{TASK_ID}}_$(date +%Y%m%d_%H%M%S).log
   ```

2. **更新为阻塞状态**：
   ```bash
   jq --arg id "{{TASK_ID}}" --arg reason "{错误原因}" '.tasks[] |= if .id == $id then .status = "blocked" | .block_reason = $reason | .blocked_at = now | .retry_count += 1 else . end' tasks/queue.json > tmp.json && mv tmp.json tasks/queue.json
   ```

3. **更新 TODO.md 状态为 `⛔ 阻塞`**

4. **优雅退出**，等待人工介入

---

## 可用工具

- 文件操作：Read, Edit, Write, Glob, Grep
- 命令执行：Bash
- MCP服务：mcp__weixin_devtools（微信小程序开发）
- 项目管理：TodoWrite（跟踪子任务）

---

## 约束条件

1. **每个任务是独立的**：不依赖之前的会话上下文
2. **必须TDD**：先写测试，再写功能，测试通过才算完成
3. **必须留痕**：所有变更都要更新到对应文档
4. **必须提交**：代码完成后必须git commit
5. **超时保护**：单个步骤超过30分钟视为失败

---

## 示例调用

用户（或脚本）会这样调用你：

```
claude --new "执行任务 MINI-001"
```

你需要：
1. 识别任务ID是 MINI-001
2. 按上述流程执行
3. 完成后自动退出
```

### 2. Shell主循环（scripts/auto/dev-loop.sh）

```bash
#!/bin/bash
# 全自动化开发主循环 - 极简版本
# 职责：读取队列 → 启动Claude会话 → 等待结束 → 循环

QUEUE_FILE="tasks/queue.json"
LOG_FILE="logs/auto-dev/loop.log"

# 确保日志目录存在
mkdir -p logs/auto-dev/errors
mkdir -p logs/auto-dev/reports
mkdir -p logs/auto-dev/daily

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 自动化开发循环启动" >> "$LOG_FILE"
echo "PID: $$" >> "$LOG_FILE"

while true; do
    # 获取下一个待执行任务（按id排序取第一个pending）
    TASK_ID=$(jq -r '.tasks[] | select(.status=="pending") | .id' "$QUEUE_FILE" | head -1)

    if [ -z "$TASK_ID" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 无待执行任务，60秒后重试..." >> "$LOG_FILE"

        # 检查是否所有任务都是blocked
        ALL_BLOCKED=$(jq '[.tasks[].status] | map(select(. != "blocked")) | length == 0 and (.tasks | length > 0)' "$QUEUE_FILE")
        if [ "$ALL_BLOCKED" == "true" ]; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ 警告：所有任务均被阻塞！" >> "$LOG_FILE"
            # 可选：发送告警通知
        fi

        sleep 60
        continue
    fi

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 启动任务: $TASK_ID" >> "$LOG_FILE"

    # 启动Claude会话执行任务
    # 方式1: 如果支持skill
    # claude --new --skill auto-dev "执行任务 $TASK_ID"

    # 方式2: 通用方式，传入完整prompt
    claude --new "
你是stock-race项目的全自动化开发智能体。
请执行任务: $TASK_ID

执行流程：
1. 读取 tasks/queue.json 找到任务 $TASK_ID 的详情
2. 根据 module 和 todo_ref 读取对应模块的 TODO.md
3. 更新 queue.json 状态为 in_progress
4. 更新 TODO.md 状态为 🔄 开发中
5. 按TDD流程开发：写测试 → 写功能 → 跑测试
6. 如需MCP（mcp_required=true），使用 weixin-devtools 验证
7. 更新 TODO.md（状态改为 ✅ 已完成）、HAVE_DONE.md、TEST_SCRIPTS.md
8. git commit -m \"feat({module}): $TASK_ID [automated]\"
9. 更新 queue.json 状态为 completed

如果失败，更新状态为 blocked 并记录原因到 logs/auto-dev/errors/${TASK_ID}_$(date +%Y%m%d_%H%M%S).log
"

    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 任务 $TASK_ID 正常结束" >> "$LOG_FILE"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 任务 $TASK_ID 异常退出 (code: $EXIT_CODE)" >> "$LOG_FILE"
    fi

    # 短暂休息，避免API限制
    sleep 10
done
```

### 3. 任务队列示例（tasks/queue.json）

```json
{
  "version": "1.0",
  "project": "stock-race",
  "created_at": "2026-02-25T20:00:00Z",
  "last_updated": "2026-02-25T20:00:00Z",
  "stats": {
    "total": 0,
    "completed": 0,
    "blocked": 0,
    "failed": 0,
    "skipped": 0
  },
  "tasks": [
    {
      "id": "MINI-001",
      "module": "miniprogram",
      "type": "unit",
      "title": "创建登录页面基础结构",
      "description": "创建 pages/login/index.vue，包含基础布局和样式",
      "status": "pending",
      "priority": "P0",
      "todo_ref": "T-007",
      "tdd": true,
      "mcp_required": false,
      "can_skip": true,
      "skip_count": 0,
      "retry_count": 0,
      "max_retries": 3,
      "created_at": "2026-02-25T20:00:00Z",
      "started_at": null,
      "completed_at": null,
      "blocked_at": null,
      "block_reason": null,
      "error_log": null
    }
  ]
}
```

### 4. 人工恢复脚本（scripts/auto/resume-task.sh）

```bash
#!/bin/bash
# 恢复阻塞的任务

if [ $# -lt 2 ]; then
    echo "用法: $0 <task-id> <恢复原因>"
    echo "示例: $0 MINI-001 '已修复表单验证逻辑'"
    exit 1
fi

TASK_ID=$1
REASON=$2
QUEUE_FILE="tasks/queue.json"

# 1. 更新 queue.json
jq --arg id "$TASK_ID" --arg reason "$REASON" '
    .tasks[] |= if .id == $id then
        .status = "pending" |
        .retry_count = 0 |
        .skip_count = 0 |
        .blocked_at = null |
        .block_reason = null |
        .resume_history += [{"time": now, "reason": $reason}]
    else . end
' "$QUEUE_FILE" > tmp.json && mv tmp.json "$QUEUE_FILE"

echo "✅ 任务 $TASK_ID 已恢复: $REASON"
echo "下次循环将重新执行该任务"

# 可选：自动更新 TODO.md（需要知道模块）
MODULE=$(jq -r --arg id "$TASK_ID" '.tasks[] | select(.id==$id) | .module' "$QUEUE_FILE")
TODO_FILE="docs/modules/$MODULE/TODO.md"

if [ -f "$TODO_FILE" ] && [ "$MODULE" != "null" ]; then
    # 将 ⛔ 阻塞 改为 🔲 待开发
    sed -i 's/- \*\*状态\*\*: ⛔ 阻塞/- **状态**: 🔲 待开发/g' "$TODO_FILE"
    echo "已更新 $TODO_FILE"
fi
```

---

## 📝 TODO.md 格式标准

为了让智能体能正确解析，所有模块的 `TODO.md` 必须使用以下格式：

```markdown
# {模块名} 开发计划

## 待开发

<!-- AUTO-TASK: BEGIN T-007 -->
### T-007: 登录页面基础结构
- **自动化任务**: MINI-001              # 对应 queue.json 的任务ID
- **状态**: 🔲 待开发                   # 可选：🔲 待开发 / 🔄 开发中 / ✅ 已完成 / ⛔ 阻塞
- **优先级**: P0                       # P0/P1/P2
- **技术方案**:
  - 使用 uni-app 的 view 和 button 组件
  - 实现响应式布局
  - 添加基础样式
- **验收标准**:
  - [ ] 页面能在微信开发者工具正常显示
  - [ ] 布局符合设计稿
  - [ ] 单元测试通过
<!-- AUTO-TASK: END T-007 -->

<!-- AUTO-TASK: BEGIN T-008 -->
### T-008: 登录表单验证
- **自动化任务**: MINI-002
- **状态**: 🔲 待开发
- **优先级**: P0
- **依赖**: T-007
- **技术方案**:
  - 手机号正则验证
  - 验证码倒计时60秒
- **验收标准**:
  - [ ] 手机号格式验证正确
  - [ ] 验证码倒计时功能正常
<!-- AUTO-TASK: END T-008 -->
```

### 格式约定

| 标记 | 说明 | 必须 |
|------|------|------|
| `<!-- AUTO-TASK: BEGIN {task-id} -->` | 任务开始标记，task-id 需唯一 | ✅ |
| `<!-- AUTO-TASK: END {task-id} -->` | 任务结束标记，与开始对应 | ✅ |
| `**自动化任务**: {queue-task-id}` | 映射到 queue.json 的任务ID | ✅ |
| `**状态**: {状态}` | 当前状态 | 建议 |
| `**优先级**: {P0/P1/P2}` | 优先级 | 建议 |
| `**技术方案**:` | 实现细节 | ✅ |
| `**验收标准**:` | 完成标准 | ✅ |

---

## 🚀 落地执行流程

### Phase 1: 准备阶段（1-2小时）

#### Step 1.1: 创建目录结构

```bash
# 在项目根目录执行
mkdir -p .claude/skills
mkdir -p tasks/templates
mkdir -p scripts/auto/lib
mkdir -p logs/auto-dev/{errors,reports,daily}
```

#### Step 1.2: 创建核心文件

1. 创建 `.claude/skills/auto-dev.md`（复制上面的内容）
2. 创建 `scripts/auto/dev-loop.sh`（复制上面的内容，并添加执行权限）
3. 创建 `scripts/auto/resume-task.sh`（复制上面的内容，并添加执行权限）
4. 创建 `tasks/queue.json`（复制上面的初始结构）

#### Step 1.3: 添加执行权限

```bash
chmod +x scripts/auto/dev-loop.sh
chmod +x scripts/auto/resume-task.sh
```

#### Step 1.4: 配置 MCP 服务（微信小程序开发）

确保 `weixin-devtools-mcp` 已配置可用：

```bash
# 验证 MCP 服务
npx @weixin-devtools/mcp --version
```

### Phase 2: 文档格式化（1-2小时）

#### Step 2.1: 更新各模块 TODO.md

对每个模块执行：

```bash
# 示例：miniprogram 模块
cat > docs/modules/miniprogram/TODO.md << 'EOF'
# Miniprogram 开发计划

## 格式说明
本文档使用标准格式，支持自动化开发。
任务标记：<!-- AUTO-TASK: BEGIN {task-id} --> ... <!-- AUTO-TASK: END {task-id} -->

## 待开发

<!-- AUTO-TASK: BEGIN T-007 -->
### T-007: 登录页面基础结构
- **自动化任务**: MINI-001
- **状态**: 🔲 待开发
- **优先级**: P0
- **技术方案**:
  - 创建 pages/login/index.vue
  - 使用 uni-app 基础组件
  - 实现响应式布局
- **验收标准**:
  - [ ] 页面能正常编译
  - [ ] 布局符合设计稿
<!-- AUTO-TASK: END T-007 -->

EOF
```

#### Step 2.2: 填充初始任务队列

从各模块 TODO.md 中提取任务，填充到 `tasks/queue.json`：

```json
{
  "tasks": [
    {
      "id": "MINI-001",
      "module": "miniprogram",
      "type": "unit",
      "title": "登录页面基础结构",
      "status": "pending",
      "priority": "P0",
      "todo_ref": "T-007",
      "tdd": true,
      "mcp_required": false,
      "can_skip": true,
      "skip_count": 0,
      "retry_count": 0,
      "max_retries": 3
    }
  ]
}
```

### Phase 3: 验证阶段（1小时）

#### Step 3.1: 单任务手动测试

```bash
# 测试单个任务执行
claude --new "执行任务 MINI-001"
```

观察：
- 是否正确读取了 queue.json
- 是否正确读取了 TODO.md
- 是否正确更新了状态
- 是否正常退出

#### Step 3.2: 阻塞恢复测试

```bash
# 手动创建一个阻塞任务
jq '.tasks[0].status = "blocked"' tasks/queue.json > tmp.json && mv tmp.json tasks/queue.json

# 执行恢复
./scripts/auto/resume-task.sh MINI-001 "测试恢复功能"

# 验证状态已恢复
jq '.tasks[0].status' tasks/queue.json  # 应为 "pending"
```

#### Step 3.3: 队列循环测试

```bash
# 准备2-3个简单任务
# 前台运行测试（便于观察）
./scripts/auto/dev-loop.sh

# Ctrl+C 停止
```

### Phase 4: 启动阶段（30分钟）

#### Step 4.1: 后台启动

```bash
# 后台启动自动化循环
nohup ./scripts/auto/dev-loop.sh > logs/auto-dev/loop.log 2>&1 &

# 记录PID
echo $! > .auto-dev.pid

# 查看运行状态
tail -f logs/auto-dev/loop.log
```

#### Step 4.2: 监控命令

```bash
# 查看任务队列状态
jq '{pending: [.tasks[].status]|map(select(.=="pending"))|length, in_progress: [.tasks[].status]|map(select(.=="in_progress"))|length, completed: [.tasks[].status]|map(select(.=="completed"))|length, blocked: [.tasks[].status]|map(select(.=="blocked"))|length}' tasks/queue.json

# 查看阻塞任务
cat tasks/queue.json | jq '.tasks[] | select(.status=="blocked") | {id, block_reason, blocked_at}'

# 查看实时日志
tail -f logs/auto-dev/loop.log
```

### Phase 5: 运维阶段（持续）

#### 日常检查

**每天早上**：
```bash
# 查看昨晚进展
cat logs/auto-dev/loop.log | grep "$(date -d 'yesterday' '+%Y-%m-%d')"

# 查看阻塞任务列表
./scripts/auto/check-health.sh  # 如有此脚本
```

**阻塞处理**：
```bash
# 查看阻塞详情
cat tasks/queue.json | jq '.tasks[] | select(.status=="blocked")'

# 查看错误日志
ls logs/auto-dev/errors/
cat logs/auto-dev/errors/{task-id}_{timestamp}.log

# 人工修复后恢复
./scripts/auto/resume-task.sh {task-id} "修复了xxx问题"
```

#### 停止/重启

```bash
# 停止
kill $(cat .auto-dev.pid)

# 重启
./scripts/auto/dev-loop.sh &
echo $! > .auto-dev.pid
```

#### 添加新任务

1. 在模块 `TODO.md` 中添加新任务（使用标准格式）
2. 在 `queue.json` 中添加对应条目
3. 确保 `todo_ref` 双向映射正确
4. 无需重启，下次循环自动获取

---

## ✅ 检查清单

### 准备阶段

- [ ] 目录结构已创建（.claude/skills, tasks, scripts/auto, logs）
- [ ] auto-dev.md Skill文件已创建
- [ ] dev-loop.sh 脚本已创建并有执行权限
- [ ] resume-task.sh 脚本已创建并有执行权限
- [ ] queue.json 初始结构已创建
- [ ] MCP服务（weixin-devtools）已配置可用

### 文档阶段

- [ ] 所有模块 TODO.md 已添加格式说明
- [ ] 所有自动化任务已用 `<!-- AUTO-TASK: BEGIN/END -->` 包裹
- [ ] 所有任务已添加 `**自动化任务**: {queue-task-id}` 映射
- [ ] queue.json 中的任务与 TODO.md 一一对应

### 验证阶段

- [ ] 单任务手动测试通过
- [ ] 阻塞恢复测试通过
- [ ] 队列循环测试通过（前台运行正常）
- [ ] 日志文件正确生成

### 启动阶段

- [ ] 后台启动成功
- [ ] 监控命令可用
- [ ] 阻塞告警机制可用（如有配置）

---

## ⚠️ 风险与应对

| 风险 | 应对策略 |
|------|---------|
| MCP服务不稳定 | 任务标记 mcp_required=false，后续手动联调 |
| 任务粒度把握不好 | 从极小任务开始（如"创建空文件"）验证流程 |
| git冲突 | 每个任务开始前先 `git pull`，冲突时标记阻塞 |
| Windows路径问题 | 使用 Git Bash 或 WSL，路径使用 `/` 或转义 `\\` |
| 智能体执行超时 | Skill中设置30分钟超时，超时标记阻塞 |
| 队列文件损坏 | 定期自动备份 queue.json.backup |

---

## 📊 预期时间线

| 阶段 | 预计时间 | 产出物 |
|------|---------|--------|
| Phase 1: 准备 | 1-2h | 核心文件已创建 |
| Phase 2: 文档 | 1-2h | 所有模块TODO已格式化 |
| Phase 3: 验证 | 1h | 测试通过 |
| Phase 4: 启动 | 0.5h | 后台运行中 |
| **总计** | **3.5-5.5h** | **今晚可运行** |

---

## 🔄 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-02-25 | 初始版本，确定Skill驱动架构 |

---

**维护者**: Claude
**审核状态**: 待审核
**下一步**: 确认后执行落地
