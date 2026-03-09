# Stock-Race 文档中心

欢迎来到 Stock-Race 文档中心！本文档采用 **三形态交付** 策略组织。

## 🎯 快速导航

### 核心产品文档

| 文档 | 说明 |
|------|------|
| [PRD.md](./PRD.md) | 产品需求文档（核心宪章）|
| [DELIVERY_PLAN.md](./DELIVERY_PLAN.md) | 三形态交付边界定义 |
| [CHANGELOG.md](./CHANGELOG.md) | 变更记录与决策历史 |

### 架构文档

| 形态 | 位置 |
|------|------|
| Local | [architecture/CURRENT/LOCAL/](./architecture/CURRENT/LOCAL/) |
| MVP | [architecture/CURRENT/MVP/](./architecture/CURRENT/MVP/) |
| Full | [architecture/CURRENT/FULL/](./architecture/CURRENT/FULL/) |
| v0.9 历史 | [architecture/HISTORICAL/](./architecture/HISTORICAL/) |

### 模块开发

| 形态 | TODO |
|------|------|
| Local | [modules/local/TODO.md](./modules/local/TODO.md) |
| MVP | [modules/mvp/TODO.md](./modules/mvp/TODO.md) |
| Full | [modules/full/TODO.md](./modules/full/TODO.md) |

---

## 📂 文档结构

```
docs/
├── PRD.md                    # 产品需求文档
├── DELIVERY_PLAN.md          # 交付计划
├── CHANGELOG.md              # 变更记录
├── README.md                 # 本文档
│
├── discussion/               # 讨论记录
│   └── discussion-log.md
│
├── architecture/             # 架构文档
│   ├── CURRENT/             # 当前三形态架构
│   │   ├── README.md
│   │   ├── LOCAL/
│   │   ├── MVP/
│   │   └── FULL/
│   └── HISTORICAL/          # v0.9 历史架构
│       └── V0.9-*
│
└── modules/                  # 模块开发任务
    ├── local/TODO.md
    ├── mvp/TODO.md
    └── full/TODO.md
```

---

## 🏗️ 三形态交付

| 形态 | 状态 | 说明 |
|------|------|------|
| **Local** | 🚧 Phase 1 开发中 | 本地自用，FastAPI + Vue 3 + SQLite |
| **MVP** | 📋 Phase 2 规划中 | 微信小程序，7天试用 |
| **Full** | 📋 Phase 3 规划中 | 生产环境，Go + Python 微服务 |

---

## 📚 历史文档

v0.9 时代的文档已归档至：
- [archive/v0.9-legacy/docs/](../archive/v0.9-legacy/docs/)

---

*本文档最后更新于：2026-03-09*
