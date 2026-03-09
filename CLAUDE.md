# Stock-Race v2.0 - 项目导航中心

> ⚠️ **重要提示：项目已进入 v2.0 重组阶段**  
> v0.9 旧架构代码已归档至 `archive/v0.9-legacy/`，当前开发基于全新技术栈。

---

## 📋 项目概览

**项目名称**：Stock-Race · AI 股票竞赛平台  
**当前版本**：v2.0 重组阶段  
**核心定位**："AI 模型农场"——用户作为"投资经理"招聘 AI 作为"交易员"进行虚拟股票交易

### 三形态交付策略

| 形态 | 定位 | 当前状态 | 技术栈 |
|------|------|----------|--------|
| **Local** | 本地自用验证版 | 🔥 **Phase 1 当前** | FastAPI + Vue 3 + SQLite |
| **MVP** | 微信小程序合规验证 | 📋 Phase 2 规划中 | 微信云 + DeepSeek 单一模型 |
| **Full** | 完整商业版 | 📋 Phase 3 规划中 | Go + Gin + GORM + 微服务 |

### v2.0 技术栈变更（2026-02-28）

| 服务 | v0.9（已归档） | v2.0（当前） |
|------|----------------|--------------|
| **Backend** | Node.js + Express + Prisma | **Go + Gin + GORM + Wire** |
| **Trading AI** | Python + FastAPI | Python + FastAPI（保留，升级） |
| **Market Data** | Python + FastAPI | Python + FastAPI + TimescaleDB |
| **Database** | PostgreSQL | PostgreSQL + TimescaleDB |
| **DI/配置** | 手动管理 | **Wire + Viper + Config Center** |
| **Local 版** | 无 | **FastAPI + Vue 3 + SQLite** |

### 代码归档
- **Git 标签**: `v0.9-legacy-archived`
- **归档位置**: `archive/v0.9-legacy/`（v0.9 旧代码）
- **新代码位置**: `local/`（Local 版）、`mvp/`（小程序）、`full/`（Full 版微服务）

---

## 🚀 快速导航

### v2.0 核心文档（必读）
- [**📘 PRD 产品需求文档**](docs/PRD.md) - v1.0-MVP 完整需求规格
- [**📗 交付策略**](docs/DELIVERY_PLAN.md) - Local/MVP/Full 三形态边界定义
- [**📙 变更记录**](docs/CHANGELOG.md) - PRD 版本演进与决策历史
- [**📕 讨论日志**](docs/discussion/discussion-log.md) - 详细讨论过程记录

### Local 版本开发（当前重点）
- **代码位置**: `local/`
- **后端**: FastAPI + Python（单体服务，模块化设计）
- **前端**: Vue 3 + Vite + WebSocket
- **数据库**: SQLite
- **目标**: 验证所有技术点，自用完整体验

### 历史文档（v0.9 已归档）
> ⚠️ 以下文档仅作历史参考，当前开发以 docs/ 目录文档为准
- ~~六服务架构~~ → 已简化为 Local 单体 / Full 微服务
- ~~Node.js Backend~~ → 已替换为 Go / FastAPI
- ~~Redis Streams 事件总线~~ → Local 版简化实现

---

## 📁 项目结构

```
stock-race/
├── 📂 docs/                       # v2.0 当前文档
│   ├── PRD.md                     # 产品需求文档（核心）
│   ├── DELIVERY_PLAN.md           # 交付策略（Local/MVP/Full）
│   ├── CHANGELOG.md               # 变更记录
│   ├── README.md                  # 文档导航
│   ├── discussion/                # 讨论记录
│   ├── guides/                    # 开发指南
│   ├── architecture/              # 架构文档
│   └── modules/                   # 模块开发任务
│
├── 📂 local/                      # 🔥 Local 版本（当前开发）
│   ├── backend/                   # FastAPI 单体后端
│   │   ├── api/                   # API 路由层
│   │   ├── services/              # 业务逻辑层
│   │   ├── models/                # 数据模型
│   │   └── main.py                # 入口 + 自动浏览器
│   └── frontend/                  # Vue 3 前端
│
├── 📂 mvp/                        # 📋 MVP 版本（Phase 2 规划）
│   └── miniprogram/               # 微信小程序
│
├── 📂 full/                       # 📋 Full 版本（Phase 3 规划）
│   ├── backend/                   # Go 后端服务
│   ├── trading-ai-service/        # Python AI 服务
│   ├── market-data-service/       # Python 数据服务
│   ├── news-service/              # Python 新闻服务
│   ├── notification-service/      # Go 通知服务
│   └── config-center/             # Go 配置中心
│
├── 📂 archive/v0.9-legacy/        # ⛔ v0.9 已归档（勿动）
│   └── services/                  # 旧 Node.js/Python 代码
│
└── 📄 CLAUDE.md                   # 本文件（项目导航）
```

---

## 🎯 智能体任务指引

### 如果你刚进入项目

**第一步：阅读核心文档**
1. 阅读 [docs/v1/DELIVERY_PLAN.md](docs/v1/DELIVERY_PLAN.md) 了解三形态交付策略
2. 阅读 [docs/v1/PRD.md](docs/v1/PRD.md) 了解产品需求（重点关注【已冻结】章节）
3. 确认当前开发阶段：**Local 版本 Phase 1**

**第二步：确认技术栈**
- Local 版 = FastAPI + Vue 3 + SQLite
- 不要参考 v0.9 的 Node.js/Prisma 代码（已归档）
- 不要实现多用户、订阅、等级等商业功能（Full 版特性）

**第三步：开始开发**
```bash
# Local 版本启动
cd local/backend
python main.py  # 自动打开浏览器
```

### Local 版本功能边界

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
| 订阅/等级 | ❌ | Full 版特性 |
| 微信小程序 | ❌ | MVP/Full 特性 |

---

## 🛠️ 开发规范

### 模块边界（Local → Full 演进保障）

```
Local（单体）                      Full（微服务）
├── api/market.py  ───────────────→  market-data-service
├── api/news.py    ───────────────→  news-service
├── api/ai.py      ───────────────→  trading-ai-service
├── api/trade.py   ───────────────→  trading-service
└── api/strategy.py ──────────────→  strategy-service
```

**原则**：Local 阶段模块边界清晰 → Full 阶段直接拆分，不重写业务逻辑

### 代码复用策略

从 `archive/v0.9-legacy/` 直接迁移业务逻辑（换框架不换逻辑）：
- `legacy/services/market-data-service/` → `local/backend/services/market_collector.py`
- `legacy/services/trading-ai-service/` → `local/backend/services/ai_adapter.py`
- `legacy/services/news-service/` → `local/backend/services/news_collector.py`

---

## 📋 PRD 章节状态速查

阅读 PRD 时，注意章节状态标记：

| 状态 | 含义 | 行动 |
|------|------|------|
| **【已冻结】** | 已确定，可直接实现 | 按文档实现 |
| **【待细化】** | 方向确定，需产出实施清单 | 开发前确认细节 |
| **【待讨论】** | 概念未定，不得擅自实现 | 讨论后再决定 |

**关键已冻结章节**（可直接实现）：
- 2.1 产品定位、2.2 产品边界、2.3 商业模式
- 2.4 用户准入、2.5 合规声明
- 4.1.5 AI 激励机制、4.1.6 称号系统、4.1.7 自填 API

**关键待讨论章节**（实现前必须确认）：
- 3.1 系统架构（Local 版简化）
- 4.3 交易系统（虚拟资金与交易执行逻辑）
- 4.4 排行榜系统

---

## 🔄 版本演进路线

```
Local（当前）
├── Phase 1: 基础架构搭建
│   ├── FastAPI + Vue 3 搭建
│   ├── SQLite 存储初始化
│   └── 多数据源行情采集
│
├── Phase 2: AI 与交易系统
│   ├── 多模型适配器（DeepSeek/通义/Kimi）
│   ├── AI 交易员创建与管理
│   └── 虚拟交易执行
│
└── Phase 3: 数据展示与验证
    ├── 实时行情面板
    ├── 收益图表
    └── 多 AI 对比排行
        │
        ▼
MVP（微信小程序）
├── 接入微信登录
├── 单一模型支持（DeepSeek）
└── 7 天试用限制
        │
        ▼
Full（商业版）
├── 微服务拆分（基于 Local 模块边界）
├── 用户系统完善
├── 订阅支付系统
└── 等级/社交功能
```

---

## 📝 重要决策摘要

| 日期 | 决策 | 影响 |
|------|------|------|
| 2026-02-28 | v2.0 技术栈重构 | Node.js → Go，Python 保留，DI 改为 Wire |
| 2026-02-28 | 代码归档 | v0.9 代码移至 archive/，创建 legacy 标签 |
| 2026-02-28 | 自填 API 模式 | 新增用户自备 API Key 功能 |
| 2026-02-28 | 称号系统 | 低成本高情感回报激励体系 |
| 2026-03-04 | 商业模式调整 | 订阅为主体，等级为粘性，引入周薪制度 |
| 2026-03-04 | 周薪制度 | A 股交易日计费，11:30 Cutoff，周一凌晨扣费 |
| 2026-03-06 | Local 重新定义 | 从"离线 CLI"改为"本地服务版"，功能对标 Full |

---

## 🆘 常见误区提醒

**❌ 不要做的事**：
1. 不要修改 `archive/v0.9-legacy/` 下的代码（已归档）
2. 不要基于 Node.js/Prisma 开发（技术栈已变更）
3. 不要实现多用户/登录功能（Local 版自用无需登录）
4. 不要实现订阅/等级/周薪（Full 版商业功能）
5. 不要参考 v0.9 的架构文档（已过时）

**✅ 应该做的事**：
1. 优先阅读 `docs/v1/` 目录下的 PRD/DELIVERY_PLAN
2. 基于 FastAPI + Vue 3 开发 Local 版
3. 保持模块边界清晰，便于后续拆分
4. 复用 legacy 的业务逻辑（仅换框架）

---

## 📞 文档维护

- **本文件维护者**: 项目团队
- **最后更新**: 2026-03-08（v2.0 导航更新）
- **更新方式**: 项目重大阶段变更时同步更新
- **变更记录**: 见 [docs/CHANGELOG.md](docs/CHANGELOG.md)

---

*智能体进入项目时，请先确认当前阶段（Local/MVP/Full），再选择对应文档阅读。*
