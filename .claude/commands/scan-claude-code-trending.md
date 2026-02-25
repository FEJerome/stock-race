---
description: 扫描 GitHub 上与 Claude Code 生态相关的趋势项目（MCP服务、Skill、Command、Hook），评估适配度并生成报告。
allowed-tools: [Bash, Read, Write, Edit, WebFetch]
---

# scan-claude-code-trending 命令

**指令：** 自动发现 GitHub 上最新的 Claude Code 相关工具，评估其与本项目的适配度，生成结构化报告并持久化扫描历史。

## 核心原则

1. **增量扫描**：优先检查已跟踪项目的更新，再补充新项目，避免重复劳动
2. **质量优先**：深度分析每个项目的技术栈、功能关联度和成熟度，而非简单罗列
3. **用户决策**：提供适配度评分和建议，最终是否采用由用户判断
4. **持续积累**：建立可长期维护的扫描数据库，形成项目的技术雷达

## 执行流程

### 步骤 1：初始化与数据加载

**数据文件位置**：`.claude/data/scan-claude-code-trending.json`

1. 检查数据文件是否存在
2. 如不存在，初始化空结构：
   ```json
   {
     "metadata": { "last_scan_time": null, "total_scans": 0 },
     "tracked_projects": [],
     "ignored_projects": [],
     "scan_history": []
   }
   ```
3. 如存在，读取并解析 JSON

### 步骤 2：确定本次扫描目标（共 5 个项目）

**优先级顺序**：

1. **已跟踪项目的更新**（最高优先级）
   - 遍历 `tracked_projects` 列表
   - 调用 GitHub API 检查每个项目的最新 release/tag
   - 如发现版本更新，加入本次扫描队列

2. **新发现项目**（如更新项目不足 5 个）
   - 使用 GitHub Search API 搜索关键词
   - 搜索词（按优先级）：
     - `claude code mcp server`
     - `anthropic claude skill`
     - `claude code hook`
     - `claude code command`
   - 按 stars 降序排序
   - 排除已在 `tracked_projects` 或 `ignored_projects` 中的项目
   - 补足至 5 个项目

### 步骤 3：深度分析每个项目

对每个目标项目执行：

1. **获取项目元数据**（GitHub API）
   - stars、forks、最近更新时间
   - 最新 release 版本和发布时间
   - README 内容

2. **分析技术栈**
   - 检查 package.json（Node.js 项目）
   - 检查 requirements.txt / pyproject.toml（Python 项目）
   - 识别框架：Express、FastAPI、React、Vue 等

3. **评估适配度（1-5星）**

   **技术栈匹配度（40%）**：
   - Node.js/Express/TypeScript 项目：+1
   - Python/FastAPI 项目：+1
   - 使用 Prisma/SQLAlchemy：+0.5
   - 使用 Redis/PostgreSQL：+0.5
   - Docker 支持：+0.5

   **功能关联度（40%）**：
   - MCP Server（可直接集成）：+2
   - Claude Skill（可学习借鉴）：+1.5
   - Claude Hook（可复用）：+1
   - Claude Command（可参考）：+1

   **成熟度（20%）**：
   - stars > 1000：+1
   - 最近3个月有更新：+0.5
   - 文档完整：+0.5

### 步骤 4：生成 Markdown 报告

**报告路径**：`docs/development/claude-code-trending/YYYY-MM-DD-report.md`

**报告结构**：

```markdown
# Claude Code Trending 扫描报告 - YYYY-MM-DD

## 扫描概览

- **扫描时间**：YYYY-MM-DD HH:mm
- **本次扫描项目数**：5
- **有更新项目数**：X
- **新发现项目数**：Y

## 项目详情

### 1. owner/repo-name
- **类型**：MCP Server / Skill / Hook / Command
- **版本**：vX.Y.Z (更新时间: YYYY-MM-DD)
- **社区热度**：⭐ X,XXX stars | 🍴 XXX forks
- **适配度评分**：⭐⭐⭐⭐⭐ (5/5)

**技术栈**：
- 运行时：Node.js 20+ / Python 3.11+
- 框架：Express / FastAPI
- 数据库：PostgreSQL / Redis

**功能描述**：
[README 摘要]

**本项目适用建议**：
- **推荐理由**：[具体原因]
- **建议操作**：[立即集成 / 关注后续 / 暂不采用]

---

### 2. ...

## 忽略项目说明

如有用户标记为"忽略"的项目，列出原因：
- `owner/repo`：技术栈不匹配
- ...

## 历史扫描统计

- 累计扫描项目：X
- 当前跟踪项目：Y
- 已忽略项目：Z
```

### 步骤 5：更新数据文件

1. **更新 tracked_projects**：
   - 新发现的项目添加到列表
   - 已有项目更新 `last_checked` 和 `latest_version`
   - 更新 `check_count`

2. **追加 scan_history**：
   ```json
   {
     "scan_id": "YYYY-MM-DD-001",
     "scan_time": "YYYY-MM-DDTHH:mm:ssZ",
     "projects_checked": 5,
     "projects_with_updates": X,
     "projects_new": Y
   }
   ```

3. **保存 JSON 文件**

## 使用方法

```
/scan-claude-code-trending
```

无需参数，直接执行即可。

## 可用工具

- **权限**：允许文件读写、HTTP 请求（GitHub API）、Shell 命令
- **API 调用**：使用 GitHub REST API v3
- **认证**：从环境变量 `GITHUB_TOKEN` 读取 Token

## 输出要求

### 1. JSON 数据文件（供智能体读取）

**路径**：`.claude/data/scan-claude-code-trending.json`

包含完整的历史记录和项目元数据，供后续扫描时去重和检测更新。

### 2. Markdown 报告（供用户阅读）

**路径**：`docs/development/claude-code-trending/YYYY-MM-DD-report.md`

包含：
- 扫描概览统计
- 每个项目的详细分析
- 适配度评分和推荐理由
- 具体的操作建议

## 黑名单机制

用户可在 Markdown 报告中手动添加标记，将项目加入 `ignored_projects`：

```json
{
  "repo": "owner/repo-name",
  "ignored_at": "YYYY-MM-DDTHH:mm:ssZ",
  "reason": "技术栈不匹配 / 功能不相关 / 质量不达标"
}
```

被忽略的项目将不会出现在后续扫描中。

## 首次扫描特别提示

首次执行时，由于数据库为空，将按以下策略填充初始数据：

1. 搜索关键词 `claude code mcp server`，取 stars 最高的 2-3 个
2. 搜索关键词 `anthropic skill`，取 stars 最高的 1-2 个
3. 优先选择有详细文档、最近活跃的项目

## 技术栈参考（用于适配度评估）

本项目使用的技术栈：

| 类别 | 技术 |
|-----|------|
| 后端 | Node.js 20+, Express, TypeScript, Prisma, Socket.io |
| Python 服务 | Python 3.11+, FastAPI, Pydantic, Anthropic SDK 0.8 |
| 前端 | React 18, Vue 3, TypeScript, Vite, Zustand |
| 小程序 | UniApp, Vue 3, Pinia |
| 数据库 | PostgreSQL 15, TimescaleDB, Redis 7 |
| 部署 | Docker Compose |

---

开始执行扫描任务。
