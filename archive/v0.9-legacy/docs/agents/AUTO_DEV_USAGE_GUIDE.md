# 全自动化开发系统 - 使用指南

**本文档**：脚本使用教程与示例
**目标读者**：想要使用自动化开发系统的开发者
**前置条件**：已完成 [部署指南](AUTO_DEV_DEPLOYMENT.md) 中的环境配置

---

## 环境要求

| 项目 | 要求 | 说明 |
|------|------|------|
| 操作系统 | Windows | 支持微信开发者工具 MCP |
| Shell 环境 | **Git Bash** | 必须使用，脚本依赖 Bash 语法和 Unix 工具 |
| 必需工具 | jq | JSON 处理工具，已包含在部署步骤中 |
| 项目位置 | 任意 | 脚本自动定位项目根目录 |

**⚠️ 重要**：不支持 WSL、PowerShell 或 CMD，因为微信开发者工具 MCP 需要在 Windows 原生环境运行。

---

## 快速开始

### 1. 启动 Git Bash

在项目上右键 → **Git Bash Here**，或从开始菜单启动 Git Bash。

### 2. 进入项目目录

```bash
cd /c/dev/projects/stock-race
```

### 3. 查看帮助

```bash
./scripts/auto/dev-loop.sh --help
```

输出示例：
```
[2026-02-25 17:33:15] ✅ 工作目录: /c/dev/projects/stock-race
用法: scripts/auto/dev-loop.sh [选项]

选项:
  --once     单次模式：执行一个任务后退出
  --night    夜间模式：处理完所有pending任务后退出
  --help     显示帮助信息

默认（无参数）：守护进程模式，无限循环等待新任务

项目级配置加载:
  - Skill: .claude/skills/auto-dev.md
  - MCP: .claude/mcp.json
  - 工作目录: /c/dev/projects/stock-race
```

---

## 三种运行模式

### 模式一：单次模式（`--once`）⭐ 推荐测试用

执行一个待处理任务后自动退出。

```bash
./scripts/auto/dev-loop.sh --once
```

**适用场景**：
- 首次测试自动化流程
- 验证单个任务执行
- 开发调试
- CI/CD 集成

**执行流程**：
```
1. 读取 queue.json 获取第一个 pending 任务
2. 启动新 Claude 会话执行任务
3. 等待任务完成
4. 退出脚本
```

---

### 模式二：夜间模式（`--night`）

处理完所有 pending 任务后自动退出。

```bash
./scripts/auto/dev-loop.sh --night
```

**适用场景**：
- 下班前启动，批量处理积压任务
- 夜间自动运行，不占用白天工作时间
- 需要连续处理多个任务

**执行流程**：
```
1. 循环读取 queue.json
2. 处理所有 pending 任务
3. 无任务时退出
4. 生成执行报告
```

---

### 模式三：守护进程模式（默认）

无限循环，持续监听新任务。

```bash
./scripts/auto/dev-loop.sh
```

**适用场景**：
- 长期运行的工作站
- 配合任务队列实时处理
- 生产环境部署

**执行流程**：
```
1. 循环读取 queue.json
2. 有任务时立即处理
3. 无任务时等待 60 秒后重试
4. 永不退出（除非手动终止 Ctrl+C）
```

---

## Windows 快捷方式设置

### 方法一：创建 BAT 文件（简单）

创建文件 `启动自动化-单次模式.bat`：

```batch
@echo off
echo 正在启动自动化开发系统（单次模式）...
"C:\Program Files\Git\bin\bash.exe" -c "cd /c/dev/projects/stock-race && ./scripts/auto/dev-loop.sh --once"
echo.
pause
```

双击运行即可。

---

### 方法二：创建 Git Bash 快捷方式（推荐）

1. 右键桌面 → 新建 → 快捷方式
2. 位置输入：
```
"C:\Program Files\Git\git-bash.exe" -c "cd /c/dev/projects/stock-race && ./scripts/auto/dev-loop.sh --once; read -p '按回车键退出...'"
```
3. 命名快捷方式为 "StockRace 自动化开发"

**不同模式的快捷方式**：

| 模式 | 目标命令 |
|------|----------|
| 单次模式 | `.../git-bash.exe" -c "cd /c/dev/projects/stock-race && ./scripts/auto/dev-loop.sh --once; read -p '完成，按回车退出...'"` |
| 夜间模式 | `.../git-bash.exe" -c "cd /c/dev/projects/stock-race && ./scripts/auto/dev-loop.sh --night; read -p '完成，按回车退出...'"` |
| 守护模式 | `.../git-bash.exe" -c "cd /c/dev/projects/stock-race && ./scripts/auto/dev-loop.sh"` |

---

### 方法三：VS Code 集成任务

在 `.vscode/tasks.json` 中添加：

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Auto Dev: 单次模式",
      "type": "shell",
      "command": "./scripts/auto/dev-loop.sh --once",
      "options": {
        "cwd": "${workspaceFolder}"
      },
      "group": "build",
      "problemMatcher": []
    },
    {
      "label": "Auto Dev: 夜间模式",
      "type": "shell",
      "command": "./scripts/auto/dev-loop.sh --night",
      "options": {
        "cwd": "${workspaceFolder}"
      },
      "group": "build",
      "problemMatcher": []
    }
  ]
}
```

使用时按 `Ctrl+Shift+P` → 运行任务 → 选择对应任务。

---

## 完整工作流示例

### 场景：添加并执行一个新任务

#### Step 1: 添加任务到队列

编辑 `tasks/queue.json`，在 `tasks` 数组中添加：

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

#### Step 2: 在 TODO.md 中添加对应条目

编辑 `docs/modules/miniprogram/TODO.md`：

```markdown
<!-- AUTO-TASK: BEGIN MP-LOGIN-001 -->
### MP-LOGIN-001: 实现用户登录页面
- **自动化任务**: MINI-FEATURE-001
- **状态**: 🔲 待开发
- **优先级**: P1
- **描述**: 创建微信小程序登录页面，包含微信一键登录按钮
<!-- AUTO-TASK: END MP-LOGIN-001 -->
```

#### Step 3: 运行单次模式测试

```bash
./scripts/auto/dev-loop.sh --once
```

#### Step 4: 查看执行日志

```bash
# 查看主日志
tail -f logs/auto-dev/loop.log

# 如果任务被阻塞，查看错误日志
ls logs/auto-dev/errors/
cat logs/auto-dev/errors/MINI-FEATURE-001_*.log
```

#### Step 5: 处理阻塞任务

如果任务因错误被标记为 `blocked`：

```bash
# 1. 查看 queue.json 确认状态
jq '.tasks[] | select(.id=="MINI-FEATURE-001") | {id, status, block_reason}' tasks/queue.json

# 2. 修复问题后，恢复任务
./scripts/auto/resume-task.sh MINI-FEATURE-001 "已修复登录接口调用问题"

# 3. 重新运行
./scripts/auto/dev-loop.sh --once
```

#### Step 6: 批量处理多个任务（夜间模式）

如果有多个任务待处理：

```bash
./scripts/auto/dev-loop.sh --night
```

执行完成后查看总结：
```bash
tail -20 logs/auto-dev/loop.log
```

---

## 任务状态流转

```
pending ──► in_progress ──► completed
    │           │
    │           ▼
    │        blocked ──► pending (通过 resume-task.sh 恢复)
    │
    ▼
 skipped (可选)
```

查看当前任务状态：

```bash
# 查看所有 pending 任务
jq '.tasks[] | select(.status=="pending") | {id, title, priority}' tasks/queue.json

# 查看所有 blocked 任务
jq '.tasks[] | select(.status=="blocked") | {id, title, block_reason}' tasks/queue.json

# 统计任务数量
jq '{total: .tasks | length, pending: [.tasks[].status] | map(select(.=="pending")) | length, completed: [.tasks[].status] | map(select(.=="completed")) | length, blocked: [.tasks[].status] | map(select(.=="blocked")) | length}' tasks/queue.json
```

---

## 常见问题

### Q1: 脚本提示 "❌ 错误: 需要安装 jq"

**解决**：下载 jq 并添加到 PATH：

```bash
# 下载 jq
curl -L -o /usr/bin/jq.exe https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-windows-amd64.exe

# 验证
jq --version
```

---

### Q2: 脚本提示 "❌ 错误：无法找到项目根目录配置"

**原因**：脚本无法定位到项目根目录。

**解决**：确保从项目目录内运行脚本，或检查 `CLAUDE.md` 和 `.claude` 目录存在。

```bash
# 验证项目结构
ls CLAUDE.md
ls -d .claude
```

---

### Q3: 任务一直显示 "无待执行任务"

**检查**：
1. queue.json 是否存在且格式正确
2. 是否有 status 为 "pending" 的任务
3. jq 是否能正常解析

```bash
# 验证 queue.json 格式
jq '.' tasks/queue.json > /dev/null && echo "✅ JSON格式正确"

# 查看 pending 任务
jq '.tasks[] | select(.status=="pending")' tasks/queue.json
```

---

### Q4: 如何在 WSL 中运行？

**回答**：**不支持 WSL**。因为微信开发者工具 MCP 必须在 Windows 原生环境运行。

如果需要在 Linux/Mac 环境使用，需要：
1. 移除或注释掉 `.claude/mcp.json` 中的微信开发者工具配置
2. 修改脚本，将 MCP 相关功能设为可选

---

### Q5: 如何停止守护进程模式？

在 Git Bash 窗口中按 `Ctrl+C` 即可终止。

---

## 进阶用法

### 后台运行（nohup）

```bash
# 夜间模式后台运行
nohup ./scripts/auto/dev-loop.sh --night > /dev/null 2>&1 &

# 查看后台任务
ps aux | grep dev-loop.sh

# 终止后台任务
kill <PID>
```

### 定时启动（Windows 任务计划程序）

1. 打开「任务计划程序」
2. 创建基本任务 → 名称："StockRace 夜间构建"
3. 触发器：每天 22:00
4. 操作：启动程序
5. 程序：`C:\Program Files\Git\git-bash.exe`
6. 参数：`-c "cd /c/dev/projects/stock-race && ./scripts/auto/dev-loop.sh --night"`

---

## 相关文档

- [部署指南](AUTO_DEV_DEPLOYMENT.md) - 环境配置与首次部署
- [执行记录](AUTO_DEV_EXECUTION.md) - 部署执行日志与测试记录
- [项目导航](../../CLAUDE.md) - 项目整体文档导航

---

**最后更新**: 2026-02-25
**文档版本**: v1.0
