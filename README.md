# Stock-Race · AI 股票竞赛平台

**你不是在炒股，你是在经营一家基金公司。**

Stock-Race 是一个 AI 驱动的股票竞赛平台。用户扮演"投资总负责人"，受"投资董事长"之托管理虚拟基金。你可以"招聘"来自不同"大学"（DeepSeek、通义千问、Kimi 等）的 AI 基金经理，让它们用真实的投资风格进行 PK。

---

## 🎯 三种产品形态

本项目采用 **Three-Form Delivery** 策略，分三个阶段交付：

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI股票竞赛平台                            │
│                     (Three-Form Delivery)                        │
├──────────────┬──────────────┬───────────────────────────────────┤
│    Local     │     MVP      │              Full                 │
│   (自用版)    │  (合规验证版)  │           (商业运营版)              │
├──────────────┼──────────────┼───────────────────────────────────┤
│ • 本地部署     │ • 微信小程序  │ • 生产环境多用户服务               │
│ • 单用户自用   │ • 7天试用限制 │ • 完整商业功能                    │
│ • FastAPI单体 │ • 单一模型   │ • Go + Python 微服务               │
│ • 多模型对比   │ • 云端部署    │ • 高可用架构                      │
└──────────────┴──────────────┴───────────────────────────────────┘
```

| 形态 | 状态 | 技术栈 | 目标 |
|------|------|--------|------|
| **[Local](./local/)** | 🚧 **Phase 1 开发中** | FastAPI + Vue 3 + SQLite | 本地自用，验证所有技术点 |
| **[MVP](./mvp/)** | 📋 Phase 2 规划中 | 微信小程序 + 云端 | 合规验证，7天试用 |
| **[Full](./full/)** | 📋 Phase 3 规划中 | Go + Python 微服务 | 生产环境多用户服务 |

**详细定义**: [DELIVERY_PLAN.md](./docs/v1/DELIVERY_PLAN.md)

---

## 🚀 快速开始

### Local 形态（当前重点）

```bash
cd local

# 安装依赖
pip install -r requirements.txt

# 启动服务（自动打开浏览器）
python local.py
```

访问 `http://localhost:8000`

更多: [local/README.md](./local/)

---

## 📂 项目结构

```
stock-race/
├── 📁 local/                  # 【当前重点】Local形态
│   ├── backend/              # FastAPI 单体后端
│   ├── frontend/             # Vue 3 前端
│   ├── adapters/             # 数据源 & AI 适配器
│   ├── core/                 # 领域模型 & 业务逻辑
│   └── README.md             # Local 使用指南
│
├── 📁 mvp/                    # 【Phase 2】MVP形态
│   ├── miniprogram/          # 微信小程序
│   └── README.md
│
├── 📁 full/                   # 【Phase 3】Full形态 (v2.0)
│   ├── backend/              # Go 后端服务
│   ├── trading-ai-service/   # Python AI服务
│   ├── market-data-service/  # Python 数据服务
│   ├── news-service/         # Python 新闻服务
│   ├── notification-service/ # Go 通知服务
│   ├── config-center/        # Go 配置中心
│   └── README.md
│
├── 📁 archive/                # 历史归档
│   └── v0.9-legacy/          # v0.9 旧代码
│
├── 📁 docs/                   # 文档
│   ├── v1/                   # PRD & 交付计划
│   └── architecture/         # 架构文档
│       ├── CURRENT/          # 当前架构（Local/MVP/Full）
│       └── HISTORICAL/       # 历史架构（v0.9）
│
├── 📁 scripts/                # 脚本工具
├── CLAUDE.md                  # 项目导航中心
└── README.md                  # 本文件
```

---

## 🏗️ 架构演进

```
Phase 1: Local（当前）
    │
    ├── 验证所有技术点：多数据源、多AI模型、实时数据
    ├── 确立领域模型
    └── 积累 Vue 组件
    │
    ▼ 演进（业务逻辑不变，架构调整）
Phase 2: MVP（小程序）
    │
    ├── 复用 Local 的核心逻辑
    ├── 适配微信小程序
    └── 添加7天试用限制
    │
    ▼ 演进（业务逻辑不变，架构拆分）
Phase 3: Full（微服务）
    │
    ├── 基于 Local 模块边界拆分
    ├── Backend 从 Python 改为 Go
    └── 增加运维能力
```

**关键原则**: 演进时"业务逻辑"保持不变，只有"技术架构"调整。

---

## 🛠️ 技术栈

### Local 形态

| 层级 | 技术 |
|------|------|
| **前端** | Vue 3 + Vite + Pinia |
| **后端** | FastAPI (Python) |
| **存储** | SQLite |
| **实时通信** | WebSocket |
| **数据源** | 新浪/腾讯/东方财富 |

### Full 形态 (v2.0)

| 服务 | 技术栈 |
|------|--------|
| **Backend** | Go + Gin + GORM + Wire |
| **Trading AI** | Python + FastAPI |
| **Market Data** | Python + FastAPI + TimescaleDB |
| **News** | Python + FastAPI |
| **Notification** | Go + Gin |
| **Config Center** | Go + Gin |

---

## 📚 核心文档

- [CLAUDE.md](./CLAUDE.md) — 项目导航中心
- [PRD.md](./docs/v1/PRD.md) — 产品需求文档
- [DELIVERY_PLAN.md](./docs/v1/DELIVERY_PLAN.md) — 三种形态交付边界
- [架构文档](./docs/architecture/CURRENT/) — Local/MVP/Full 架构

---

## 🤖 AI 模型支持

| 模型 | Local | MVP | Full |
|------|:-----:|:---:|:----:|
| DeepSeek | ✅ | ✅ | ✅ |
| 通义千问 | ✅ | ❌ | ✅ |
| Kimi | ✅ | ❌ | ✅ |
| ChatGLM | ✅ | ❌ | ✅ |

---

## 📄 License

MIT License © 2026 Stock-Race Team

---

> **Built with ❤️ by Claude Code + Multi-Agent Collaboration**
