# Local 模式 - AI 股票竞赛平台

本地部署的自用版，功能对齐 Full 但无多用户支持。

## 快速开始

### 1. 安装依赖

```bash
cd local/backend

# 安装后端依赖
pip install -r requirements.txt

# 安装前端依赖
cd ../frontend
npm install
cd ..
```

### 2. 配置 API Key

```bash
# 设置环境变量（推荐方式）
export MOONSHOT_API_KEY="your-kimi-api-key"      # Kimi K2.5
export DEEPSEEK_API_KEY="your-deepseek-api-key"  # DeepSeek
export DASHSCOPE_API_KEY="your-qwen-api-key"     # 通义千问
export ZHIPU_API_KEY="your-glm-api-key"          # 智谱GLM
```

### 3. 启动服务（自动打开浏览器）

```bash
cd backend
python main.py
```

服务启动后会自动打开浏览器，访问 `http://localhost:8000`

### 4. 仅启动服务（不打开浏览器）

```bash
python main.py --headless
```

然后手动访问 http://localhost:8000

---

## 使用流程

### 1. 创建 AI 交易员

- 在 Web 界面点击「创建 AI」
- 选择 AI 模型（Kimi/DeepSeek/通义/GLM）
- 配置策略（五维度：风险/板块/周期/仓位/止损）
- 设置初始资金
- 选择职级：实习生/经理/合伙人

### 2. 查看实时行情

- 进入「行情」页面
- 查看多数据源实时推送的股票数据
- 支持数据源：腾讯财经、新浪财经、东方财富

### 3. 执行交易

- 在 AI 详情页点击「交易」
- 选择买入/卖出
- 查看 AI 决策理由（内心戏）
- 确认执行

### 4. 职级晋升

- 实习生（Lv.1-6）→ 经理（Lv.7-12）→ 合伙人（Lv.13-20）
- 晋升条件：
  - 实习生→经理：Lv.6、收益率≥5%、交易次数≥10
  - 经理→合伙人：Lv.12、收益率≥15%、交易次数≥30
- 调用 API：`POST /api/agents/{id}/promote`

### 5. 查看收益

- 「仪表盘」查看多 AI 对比
- 「持仓」查看当前持仓和收益
- 「交易历史」查看完整记录

---

## 架构说明

详见 [ARCHITECTURE.md](./ARCHITECTURE.md)

### 技术栈

- **前端**：Vue 3 + Vite + Pinia
- **后端**：FastAPI (Python) + SQLAlchemy (异步)
- **存储**：SQLite + aiosqlite
- **实时通信**：WebSocket
- **数据源**：多源实时行情（腾讯/新浪/东方财富）

### 与 MVP/Full 的区别

| 功能 | Local | MVP | Full |
|------|:-----:|:---:|:----:|
| **部署** | 本地自用 | 微信小程序云端 | 生产环境多用户 |
| **用户** | 单用户（无登录） | 微信授权 | 完整账号体系 |
| **数据源** | 多源实时行情 | 实时行情 | 多源实时行情+新闻 |
| **AI 模型** | 多模型并行 | DeepSeek 单一模型 | 多模型并行 |
| **职级系统** | ✅ | ✅ | ✅ |
| **商业功能** | ❌ | 7 天试用 | 订阅+等级+支付 |
| **社交功能** | ❌ | ❌ | ✅ |
| **前端** | Web（Vue） | 小程序 | 小程序+Web+App |

**核心区别**：Local = Full 的自用版，功能基本一致，仅少了多用户支持和商业功能。

---

## API 端点

### AI 交易员管理
- `GET/POST /api/agents` - 列表/创建
- `GET/PATCH/DELETE /api/agents/{id}` - 详情/更新/删除
- `POST /api/agents/{id}/pause` - 暂停
- `POST /api/agents/{id}/resume` - 恢复
- `GET /api/agents/{id}/promotion` - 晋升状态
- `POST /api/agents/{id}/promote` - 执行晋升

### 行情数据
- `GET /api/market/quotes` - 获取多股票行情
- `GET /api/market/quotes/{symbol}` - 获取单股票行情
- `GET /api/market/health` - 数据源健康状态
- `GET /api/market/sources` - 数据源列表

### 交易执行
- `GET /api/agents/{id}/positions` - 持仓列表
- `GET /api/agents/{id}/trades` - 交易历史
- `POST /api/agents/{id}/trades` - 执行交易

### AI 决策
- `POST /api/agents/{id}/decide` - 触发 AI 决策
- `GET /api/agents/tokens/stats` - Token 使用统计

---

## 已实现功能

- [x] FastAPI 后端框架（异步架构）
- [x] SQLAlchemy ORM + 异步数据库操作
- [x] 多数据源行情采集（腾讯/新浪/东方财富）
- [x] 数据源健康检查与熔断降级
- [x] WebSocket 实时数据推送
- [x] 多模型 AI 适配器（Kimi/DeepSeek/通义/GLM）
- [x] 职级晋升系统（实习生/经理/合伙人）
- [x] 虚拟交易执行与持仓管理
- [x] Token 使用统计
- [x] Vue 3 前端框架

---

## 参考

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 架构设计说明
- [API_SPEC.md](../docs/modules/local/API_SPEC.md) - API 规范
- [MVP](../mvp/) - Phase 2 规划（微信小程序）
- [Full](../full/) - Phase 3 规划（微服务架构）

---

*本文档随开发进展更新*
