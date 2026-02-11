# 架构文档导航

本文档中心提供stock-race项目所有架构相关文档的统一入口。

## 📂 文档结构

```
docs/architecture/
├── README.md                    # 本文档 - 架构文档总入口
├── CODE_MAP.md                  # 代码结构地图（保留根目录）
├── CURRENT/                     # 当前活跃架构文档
│   ├── SERVICE_ARCHITECTURE.md      # 六服务架构详细设计（最新）
│   ├── DATA_PLATFORM.md             # 统一数据平台架构
│   ├── TECH_STACK.md                # 技术架构与选型
│   ├── API_SPECIFICATION.md         # RESTful API与WebSocket设计
│   ├── DATABASE_DESIGN.md           # 数据库ER图与表结构
│   └── DECISIONS/                   # 架构决策记录(ADR)
│       ├── 001-CIRCULAR-DEPENDENCY.md    # 循环依赖解决方案
│       ├── 002-EVENT-BUS.md              # 事件总线风险分析
│       ├── 003-AI-DIALOGUE-LOCATION.md   # AI对话服务职责划分
│       ├── 004-AI-DECOUPLING.md          # AI Service双向依赖解耦
│       ├── 005-MINIPROGRAM-GUEST-MODE.md # 微信小程序游客模式
│       ├── 006-MINIPROGRAM-DATA-FLOW.md  # Miniprogram数据流优化
│       ├── 007-BREADTH-QUERY-REQUIREMENTS.md # AI决策广度查询需求
│       └── 008-REDIS-DEPLOYMENT.md       # Redis渐进式部署策略
├── ANALYSIS/                    # 架构分析报告
│   └── SERVICE_DEPENDENCY.md    # 服务依赖冲突分析（精简版）
└── HISTORICAL/                  # 历史归档文档
    ├── README.md                # 历史版本说明
    ├── V2026-02-10-SERVICE_ARCHITECTURE.md  # 2026-02-10版本
    ├── V1-SYSTEM_ARCHITECTURE.md            # V1系统架构
    ├── V1-SERVICE_COMMUNICATION.md          # V1服务通信
    ├── V1-DATA_FLOW.md                      # V1数据流
    ├── V1-PROJECT_STRUCTURE.md              # V1项目结构
    └── V1-DATA_SERVICE_INTEGRATION.md       # V1数据服务集成
```

## 🚀 快速导航

### 核心架构文档
| 文档 | 说明 | 最后更新 |
|------|------|----------|
| [SERVICE_ARCHITECTURE.md](./CURRENT/SERVICE_ARCHITECTURE.md) | 六服务架构详细设计，包含服务间调用与数据流 | 2026-02-11 |
| [DATA_PLATFORM.md](./CURRENT/DATA_PLATFORM.md) | 四服务数据架构，数据主权与分层存储设计 | 2026-02-10 |
| [TECH_STACK.md](./CURRENT/TECH_STACK.md) | 技术栈选型与架构设计 rationale | 2026-02-03 |
| [API_SPECIFICATION.md](./CURRENT/API_SPECIFICATION.md) | RESTful API与WebSocket设计规范 | 2026-02-03 |
| [DATABASE_DESIGN.md](./CURRENT/DATABASE_DESIGN.md) | 数据库ER图与表结构设计 | 2026-02-03 |

### 架构决策记录(ADR)

所有重大架构决策均记录在 [DECISIONS/](./CURRENT/DECISIONS/) 目录：

| ADR | 决策主题 | 状态 |
|-----|----------|------|
| [001](./CURRENT/DECISIONS/001-CIRCULAR-DEPENDENCY.md) | 循环依赖解决方案 - 采用"共享Redis + 冷启动"混合方案 | ✅ 已决策 |
| [002](./CURRENT/DECISIONS/002-EVENT-BUS.md) | 事件总线设计 - 统一采用Redis Streams | ✅ 已决策 |
| [003](./CURRENT/DECISIONS/003-AI-DIALOGUE-LOCATION.md) | AI对话服务职责 - 由Backend实现 | ✅ 已决策 |
| [004](./CURRENT/DECISIONS/004-AI-DECOUPLING.md) | AI Service解耦 - 基于事件总线完全解耦 | ✅ 已决策 |
| [005](./CURRENT/DECISIONS/005-MINIPROGRAM-GUEST-MODE.md) | 小程序游客模式 - 三层API架构+智能过期 | ✅ 已决策 |
| [006](./CURRENT/DECISIONS/006-MINIPROGRAM-DATA-FLOW.md) | 小程序数据流 - 混合分离方案 | ✅ 已决策 |
| [007](./CURRENT/DECISIONS/007-BREADTH-QUERY-REQUIREMENTS.md) | AI决策查询需求 - 广度数据查询确认 | ✅ 已决策 |
| [008](./CURRENT/DECISIONS/008-REDIS-DEPLOYMENT.md) | Redis部署策略 - 渐进式从单节点到Cluster | ✅ 已决策 |

### 分析报告
| 文档 | 说明 |
|------|------|
| [SERVICE_DEPENDENCY.md](./ANALYSIS/SERVICE_DEPENDENCY.md) | 五服务外部依赖冲突分析，6个冲突解决方案索引 |

### 历史归档
历史版本文档已归档至 [HISTORICAL/](./HISTORICAL/) 目录，包含版本标记和指向最新文档的链接。

## 📋 架构演进时间线

- **2026-02-11**: 架构审查完成，6个冲突全部解决，创建架构决策记录
- **2026-02-10**: 六服务架构详细设计完成
- **2026-02-04**: 统一数据平台架构设计完成
- **2026-02-03**: 早期架构文档创建（已归档至HISTORICAL/）

## 🔗 相关文档

- [项目导航中心](../../CLAUDE.md) - 项目级文档总入口
- [开发规范](../development/CODING_STANDARDS.md) - 编码标准与最佳实践
- [部署指南](../deployment/DEPLOYMENT_GUIDE.md) - 生产环境部署

---

*本文档最后更新于：2026-02-11*
