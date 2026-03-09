# 架构文档导航

本文档中心提供 stock-race 项目所有架构相关文档的统一入口。

> **重要**: 项目正处于 v2.0 重构阶段，采用 **三种产品形态** 交付策略。
>
> 文档已按形态重新组织：
> - [CURRENT/](./CURRENT/) - 当前版本架构文档（Local/MVP/Full）
> - [HISTORICAL/](./HISTORICAL/) - v0.9 历史归档文档

---

## 📂 文档结构

```
docs/architecture/
├── README.md                    # 本文档 - 架构文档总入口
├── CURRENT/                     # 【当前版本】三种形态架构文档
│   ├── README.md                # 三种形态总览与导航
│   ├── LOCAL/                   # Local 形态（当前重点）
│   │   ├── README.md           # Local 架构概述
│   │   ├── ARCHITECTURE.md     # 单体架构详细设计（待创建）
│   │   ├── TECH_STACK.md       # 技术栈选型（待创建）
│   │   └── DATA_FLOW.md        # 数据流设计（待创建）
│   ├── MVP/                     # MVP 形态（规划中）
│   │   └── README.md           # MVP 架构概述
│   └── FULL/                    # Full 形态（规划中）
│       └── README.md           # v2.0 微服务架构规划
└── HISTORICAL/                  # 【历史归档】v0.9 时代文档
    ├── README.md                # 历史版本说明
    ├── V0.9-CODE_MAP.md         # v0.9 代码地图
    ├── V0.9-SERVICE_ARCHITECTURE.md  # 六服务架构
    ├── V0.9-TECH_STACK.md       # v0.9 技术栈
    ├── V0.9-*                   # 其他 v0.9 文档
    └── V1-*                     # V1 历史文档
```

---

## 🚀 快速导航

### 三种产品形态

| 形态 | 定位 | 技术栈 | 当前状态 |
|------|------|--------|----------|
| **[Local](./CURRENT/LOCAL/)** | 本地自用版 | FastAPI + Vue 3 + SQLite | 🚧 Phase 1 开发中 |
| **[MVP](./CURRENT/MVP/)** | 小程序合规版 | 微信小程序 + 云服务 | 📋 Phase 2 规划中 |
| **[Full](./CURRENT/FULL/)** | 商业运营版 | Go + Python 微服务 | 📋 Phase 3 规划中 |

**详细定义**: [交付计划](../v1/DELIVERY_PLAN.md)

---

### Local 形态（当前重点）

| 文档 | 说明 | 状态 |
|------|------|------|
| [LOCAL/README.md](./CURRENT/LOCAL/README.md) | Local 架构总览 | ✅ 已创建 |
| [LOCAL/ARCHITECTURE.md](./CURRENT/LOCAL/ARCHITECTURE.md) | 单体架构详细设计 | 🚧 待创建 |
| [LOCAL/TECH_STACK.md](./CURRENT/LOCAL/TECH_STACK.md) | 技术栈选型 | 🚧 待创建 |
| [LOCAL/DATA_FLOW.md](./CURRENT/LOCAL/DATA_FLOW.md) | 数据流设计 | 🚧 待创建 |

**核心特征**:
- 本地部署，开箱即用
- FastAPI 单体架构
- 多 AI 模型对比
- 技术验证平台

---

### 历史归档

v0.9 时代文档已归档至 [HISTORICAL/](./HISTORICAL/)，包含：

| 文档 | 说明 |
|------|------|
| [V0.9-SERVICE_ARCHITECTURE.md](./HISTORICAL/V0.9-SERVICE_ARCHITECTURE.md) | v0.9 六服务架构（Node.js Backend）|
| [V0.9-TECH_STACK.md](./HISTORICAL/V0.9-TECH_STACK.md) | v0.9 技术栈 |
| [V0.9-CODE_MAP.md](./HISTORICAL/V0.9-CODE_MAP.md) | v0.9 代码地图 |
| [V1-SYSTEM_ARCHITECTURE.md](./HISTORICAL/V1-SYSTEM_ARCHITECTURE.md) | V1 系统架构 |

---

## 📋 架构演进时间线

| 时间 | 事件 | 说明 |
|------|------|------|
| 2026-02-28 | v0.9 归档 | 旧代码移至 `archive/v0.9-legacy/`，git 标签 `v0.9-legacy-archived` |
| 2026-03-06 | Local 重新定义 | 从"离线CLI"改为"本地服务版"，功能对标 Full |
| 2026-03-09 | 文档清理完成 | v0.9 文档归档，创建新的 CURRENT/ 结构 |

---

## 🔗 相关文档

- [项目导航中心](../../CLAUDE.md) - 项目级文档总入口
- [交付计划](../v1/DELIVERY_PLAN.md) - 三种形态交付边界
- [v1 PRD](../v1/PRD.md) - 产品需求文档
- [开发规范](../development/CODING_STANDARDS.md) - 编码标准

---

*本文档最后更新于：2026-03-09*
