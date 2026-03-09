# Local 形态开发文档

欢迎来到 **Stock-Race Local 形态** 开发文档中心。

> **产品定位**：本地部署的自用版，功能对标 Full 但无多用户支持
> **技术栈**：FastAPI + Vue 3 + SQLite
> **当前阶段**：Phase 1 开发中

---

## 快速导航

| 文档 | 说明 | 读者 |
|------|------|------|
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | **详细实施规划**（必读） | 开发人员 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 技术架构设计 | 架构师/开发 |
| [TODO.md](./TODO.md) | 开发任务追踪 | 项目经理/开发 |

---

## 文档体系关系

```
PRD.md（产品需求）
    │
    ▼
DELIVERY_PLAN.md（三形态边界）
    │
    ▼
modules/local/
    ├── README.md              ← 本文档（入口）
    ├── IMPLEMENTATION_PLAN.md ← 详细实施规划（阶段/任务/依赖）
    ├── ARCHITECTURE.md        ← 技术架构（分层/接口/演进）
    └── TODO.md                ← 任务追踪（执行清单）
```

**阅读顺序**：
1. 新成员：README → ARCHITECTURE → IMPLEMENTATION_PLAN → TODO
2. 开发人员：IMPLEMENTATION_PLAN → TODO（开始任务）
3. 架构师：ARCHITECTURE → IMPLEMENTATION_PLAN（评审）

---

## 核心信息速查

### 开发阶段

| 阶段 | 时间 | 目标 | 关键产出 |
|------|------|------|---------|
| **1.1 基础框架** | 第 1-2 周 | 可运行的技术骨架 | FastAPI + Vue 3 搭建完成 |
| **1.2 核心功能** | 第 3-4 周 | 核心业务流程闭环 | 创建 AI → 行情 → 交易 |
| **1.3 完整体验** | 第 5-6 周 | 完整的用户体验 | 策略对话、实时推送、图表 |

### 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 后端框架 | FastAPI | ^0.104 |
| 前端框架 | Vue 3 | ^3.3 |
| 构建工具 | Vite | ^5.0 |
| 状态管理 | Pinia | ^2.1 |
| 数据库 | SQLite | 3.x |
| ORM | SQLAlchemy | ^2.0 |
| 实时通信 | WebSocket | native |
| 图表库 | ECharts | ^5.4 |

### 关键目录

```
local/
├── api/              # API 路由层
├── services/         # 业务逻辑层（从 legacy 复用）
├── core/             # 核心领域（三种形态共用）
├── adapters/         # 适配器层（存储/数据源）
├── frontend/         # Vue 3 前端
└── main.py           # FastAPI 入口
```

### 与 Full 形态的演进关系

```
Local（当前单体）                          Full（目标微服务）
├─ services/market_collector.py  ────────→  market-data-service
├─ services/ai_adapter.py  ──────────────→  trading-ai-service
├─ services/news_collector.py  ──────────→  news-service
├─ services/trading_engine.py  ──────────→  trading-service
└─ Vue 3 前端  ──────────────────────────→  复用前端组件
```

---

## 常用命令

```bash
# 启动 Local 服务（自动打开浏览器）
cd local
python main.py

# 仅启动服务（不打开浏览器）
python main.py --headless

# 前端开发（热更新）
cd local/frontend
npm run dev

# 安装后端依赖
pip install -r requirements.txt

# 安装前端依赖
cd frontend && npm install
```

---

## 参考文档

- [PRD](../../PRD.md) - 产品需求文档（功能来源）
- [DELIVERY_PLAN](../../DELIVERY_PLAN.md) - 三形态交付边界定义
- [CLAUDE.md](../../../CLAUDE.md) - 项目导航中心

---

*本文档最后更新：2026-03-09*
