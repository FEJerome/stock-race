# 模块开发命令

执行特定服务的模块开发工作流程。

## 使用方法

```
module-dev <service-name>
```

## 可用服务

- `backend` - 后端服务 (Node.js + Express)
- `frontend` - 前端服务 (React + TypeScript)
- `market-data-service` - 行情数据服务 (Python + FastAPI)
- `trading-ai-service` - 交易AI服务 (Python + FastAPI)
- `news-service` - 新闻服务 (Python + FastAPI)
- `miniprogram` - 微信小程序 (UniApp + Vue 3)

## 示例

```
module-dev backend
module-dev trading-ai-service
```

## 命令功能

1. **项目初始化**: 运行 /pro-init 以熟悉项目
2. **读取开发计划**: 读取 docs/modules/<service>/TODO.md
3. **识别下一个任务**: 查找下一个待开发条目 (🔲 待开发)
4. **切换上下文**: 引导切换到正确的 git worktree 分支
5. **创建执行计划**: 分析测试需求和验收标准
6. **等待指令**: 展示计划并等待你的确认

## 工作流程

运行此命令时：

1. 系统首先初始化，读取 CLAUDE.md 和核心文档
2. 然后读取特定服务的 TODO.md，位于 docs/modules/<service>/
3. 识别下一个未完成的任务 (标记为 🔲 待开发)
4. 检查当前 git 分支并引导你切换到正确的 worktree
5. 展示任务详情，包括：
   - 任务名称和描述
   - 测试需求 (必须实现)
   - 验收标准
   - 对其他模块的依赖
   - 预计开发时间

展示计划后，系统将**等待你的明确指令**，然后才会继续进行任何开发工作。

## 开发标准

所有开发遵循 TDD (测试驱动开发):

1. 在实现之前先编写测试
2. 提交前所有测试必须通过
3. 完成任务时更新 TODO.md 进度表
4. 提交格式: `test(<service>): [T-XXX] 描述`

## 服务通信

每个模块的 TODO.md 包含通信标准:

- **Backend**: HTTP REST (3001), Redis Pub/Sub, PostgreSQL
- **Frontend**: 通过 Backend 的 HTTP/WebSocket (3000)
- **Market Data Service**: HTTP/WebSocket (8001), TimescaleDB, Redis
- **Trading AI Service**: HTTP (8000), PostgreSQL, Redis
- **News Service**: HTTP/WebSocket (8002), PostgreSQL, Redis
- **Miniprogram**: 通过 Backend API 的 HTTPS

---

## 实现说明

当使用服务名称调用此命令时:

<$if$>

### 步骤 1: 项目初始化

运行 /pro-init 读取 CLAUDE.md 并熟悉:
- 项目结构和架构
- 开发标准 (CODING_STANDARDS.md)
- 模块协作计划

### 步骤 2: 读取服务 TODO

读取 `docs/modules/<service>/TODO.md` 以了解:
- 服务职责和数据主权
- 与其他服务的通信标准
- 包含测试需求的开发条目
- 当前进度状态

### 步骤 3: 识别下一个任务

解析 TODO.md 以查找:
- 第一个标记为 🔲 待开发 (pending) 的条目
- 提取 T-XXX 任务 ID、名称和描述
- 识别测试需求和验收标准
- 列出对其他模块的依赖

### 步骤 4: 检查 Git 上下文

检查当前 git 分支并与预期的 worktree 分支进行比较:
- backend → worktree-backend
- frontend → worktree-frontend
- market-data-service → worktree-market-data-service
- trading-ai-service → worktree-trading-ai-service
- news-service → worktree-news-service
- miniprogram → worktree-miniprogram

如果不在正确的分支上，引导用户切换。

### 步骤 5: 创建执行计划

展示开发计划，包括:
1. **任务概览**: T-XXX - 任务名称
2. **描述**: 需要实现的内容
3. **测试需求**: 必须编写的测试列表
4. **验收标准**: 如何验证完成
5. **依赖**: 需要的其他模块或任务
6. **预计时间**: 开发工作量估算
7. **检查清单**: 分步开发工作流程

### 步骤 6: 等待指令

明确说明:
"我已经分析了 [service] 的开发计划。我准备开始实现 [T-XXX]，但我会等待你的明确确认后再继续。"

然后等待用户指示:
- "开始" / "开始开发" / "go" → 继续开发
- 问题 → 回答并继续等待
- 修改 → 调整计划并再次等待

<$endif$>
