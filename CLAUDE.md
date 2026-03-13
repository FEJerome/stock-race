# Stock-Race v2.0

> **当前阶段**: Local 版本 Phase 1 | **技术栈**: FastAPI + Vue 3 + SQLite

---

## 📋 项目概览

**Stock-Race** 是一个 AI 股票竞赛平台——用户作为"投资经理"招聘 AI 作为"交易员"进行虚拟股票交易。

| 形态 | 定位 | 状态 | 技术栈 |
|------|------|------|--------|
| **Local** | 本地自用验证版 | 🔥 **当前** | FastAPI + Vue 3 + SQLite |
| **MVP** | 微信小程序合规验证 | 📋 规划 | 微信云 + DeepSeek |
| **Full** | 完整商业版 | 📋 规划 | Go + Gin + GORM + 微服务 |

---

## 🚀 快速导航

| 文档 | 用途 |
|------|------|
| [📘 PRD](docs/PRD.md) | 产品需求（关注【已冻结】章节） |
| [📗 交付策略](docs/DELIVERY_PLAN.md) | Local/MVP/Full 三形态边界 |
| [📙 变更记录](docs/CHANGELOG.md) | 决策历史与版本演进 |
| [📕 Local 开发](docs/modules/local/) | [架构](docs/modules/local/ARCHITECTURE.md) · [计划](docs/modules/local/IMPLEMENTATION_PLAN.md) · [工作流](docs/GITHUB_ISSUES_WORKFLOW.md) |
| [🔥 GitHub Issues](../../issues) | 任务追踪（替代原 TODO.md） |

---

## 🎯 智能体任务指引

### 第 1 步：启用代码智能（LSP）

**⚠️ 探索代码前，先启用代码智能服务**

项目已配置 cclsp MCP 服务器，提供代码导航和重构能力：

| 工具 | 用途 |
|------|------|
| `find_definition` | 跳转到函数/类定义 |
| `find_references` | 查看符号被哪里引用 |
| `rename_symbol` | 安全重命名（优于文本替换） |
| `get_hover` | 查看类型签名和文档 |

**探索代码时**：先用 `find_definition` 和 `find_references` 理解依赖关系，**避免盲目搜索**。

### 第 2 步：阅读核心文档

1. 阅读 [DELIVERY_PLAN.md](docs/DELIVERY_PLAN.md) 了解三形态交付策略
2. 阅读 [PRD.md](docs/PRD.md) 了解产品需求（重点关注【已冻结】章节）
3. 阅读 [ARCHITECTURE.md](docs/modules/local/ARCHITECTURE.md) 了解模块设计
4. 查看 [IMPLEMENTATION_PLAN.md](docs/modules/local/IMPLEMENTATION_PLAN.md) 了解详细设计
5. **查看 [GitHub Issues](../../issues)** 了解当前任务（替代原 TODO.md）

### 第 3 步：确认技术栈

- Local 版 = FastAPI + Vue 3 + SQLite
- 不要参考 v0.9 的 Node.js/Prisma 代码（已归档至 `archive/v0.9-legacy/`）
- 不要实现多用户、订阅、等级等商业功能（Full 版特性）

### 第 4 步：查看任务（GitHub Issues）

**快捷命令**：
```bash
# 查看当前阶段的 P0 优先级任务
gh issue list --milestone "Phase 1.3" --label "priority:p0"

# 查看 Local 版所有未完成任务
gh issue list --label "form:local" --state open

# 查看自己负责的任务
gh issue list --assignee @me
```

**更多用法**：参考 [GITHUB_ISSUES_WORKFLOW.md](docs/GITHUB_ISSUES_WORKFLOW.md)

### 第 5 步：开始开发

```bash
cd local/backend
python main.py  # 自动打开浏览器
```

---

## ⚠️ Local 版本功能边界

| 功能 | Local | 说明 |
|------|-------|------|
| AI 交易员创建 | ✅ | Web 界面，多模型选择 |
| 策略收集对话 | ✅ | 五维度策略收集 |
| 实时行情 | ✅ | 多数据源混合采集 |
| 新闻/舆论 | ✅ | 数据整合验证 |
| 虚拟交易 | ✅ | 实时数据驱动 |
| 多 AI 并行对比 | ✅ | 单机多 AI 收益排行 |
| AI 职级晋升 | ✅ | 实习生/经理/合伙人 |
| 用户登录 | ❌ | 自用版无需登录 |
| 订阅/等级 | ❌ | Full 版商业功能 |
| 微信小程序 | ❌ | MVP/Full 特性 |

---

## 📁 项目结构

```
stock-race/
├── local/                  # 🔥 Local 版本（当前开发）
│   ├── backend/            # FastAPI 单体后端
│   │   ├── api/            # API 路由
│   │   ├── services/       # 业务逻辑
│   │   └── main.py         # 入口
│   └── frontend/           # Vue 3 前端
├── docs/                   # 项目文档
│   ├── PRD.md              # 产品需求
│   ├── DELIVERY_PLAN.md    # 交付策略
│   └── modules/local/      # Local 模块详细设计
├── mvp/                    # MVP 版本（规划中）
├── full/                   # Full 版本（规划中）
└── archive/v0.9-legacy/    # ⛔ v0.9 归档代码（勿动）
```

---

## 🛠️ 开发规范

**模块边界**（Local → Full 演进保障）：

```
Local（单体）                      Full（微服务）
├── api/market.py  ───────────────→  market-data-service
├── api/news.py    ───────────────→  news-service
├── api/ai.py      ───────────────→  trading-ai-service
└── api/trade.py   ───────────────→  trading-service
```

**原则**：Local 阶段保持模块边界清晰，Full 阶段可直接拆分，**不重写业务逻辑**。

---

## 📝 最后更新

2026-03-13 | 迁移到 GitHub Issues 管理任务，更新智能体工作流 | [CHANGELOG](docs/CHANGELOG.md)
