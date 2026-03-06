# Local 模式 - AI 股票竞赛平台

本地部署的自用版，功能对齐 Full 但无多用户支持。

## 快速开始

### 1. 安装依赖

```bash
cd local

# 安装后端依赖
pip install -r requirements.txt

# 安装前端依赖
cd frontend
npm install
cd ..
```

### 2. 配置 API Key

```bash
# 复制配置文件
cp config/local.yaml.example config/local.yaml

# 编辑 config/local.yaml，填入你的 API Key
# deepseek:
#   api_key: "your-deepseek-key"
# qwen:
#   api_key: "your-qwen-key"
```

### 3. 启动服务（自动打开浏览器）

```bash
python local.py
```

服务启动后会自动打开浏览器，访问 `http://localhost:8000`

### 4. 仅启动服务（不打开浏览器）

```bash
python local.py --headless
```

然后手动访问 http://localhost:8000

---

## 使用流程

### 1. 创建 AI 交易员

- 在 Web 界面点击「创建 AI」
- 选择 AI 模型（DeepSeek/通义/Kimi/GLM）
- 配置策略（五维度：风险/板块/周期/仓位/止损）
- 设置初始资金

### 2. 查看实时行情

- 进入「行情」页面
- 查看多数据源实时推送的股票数据
- 查看新闻/舆论数据

### 3. 执行交易

- 在 AI 详情页点击「交易」
- 选择买入/卖出
- 查看 AI 决策理由（内心戏）
- 确认执行

### 4. 查看收益

- 「仪表盘」查看多 AI 对比
- 「持仓」查看当前持仓和收益
- 「交易历史」查看完整记录

---

## 架构说明

详见 [ARCHITECTURE.md](./ARCHITECTURE.md)

### 技术栈

- **前端**：Vue 3 + Vite + Pinia
- **后端**：FastAPI (Python)
- **存储**：SQLite
- **实时通信**：WebSocket
- **数据源**：实时行情 API + 新闻/舆论

### 与 MVP/Full 的区别

| 功能 | Local | MVP | Full |
|------|:-----:|:---:|:----:|
| **部署** | 本地自用 | 微信小程序云端 | 生产环境多用户 |
| **用户** | 单用户（无登录） | 微信授权 | 完整账号体系 |
| **数据源** | 实时行情+新闻+舆论 | 实时行情 | 实时行情+新闻+舆论 |
| **AI 模型** | 多模型并行 | DeepSeek 单一模型 | 多模型并行 |
| **商业功能** | ❌ | 7 天试用 | 订阅+等级+支付 |
| **社交功能** | ❌ | ❌ | ✅ |
| **前端** | Web（Vue） | 小程序 | 小程序+Web+App |

**核心区别**：Local = Full 的自用版，功能基本一致，仅少了多用户支持和商业功能。

---

## 开发计划

- [x] 架构设计（Vue + FastAPI）
- [ ] FastAPI 后端基础框架
- [ ] Vue 3 前端基础框架
- [ ] 多数据源行情采集（复用 legacy）
- [ ] 新闻/舆论数据采集
- [ ] AI 适配器（多模型支持）
- [ ] 交易引擎
- [ ] 实时 WebSocket 推送
- [ ] 前端页面实现
- [ ] 策略收集对话

---

## 从 Legacy 复用

Local 从 v0.9 遗留代码中复用以下模块：

| Legacy 模块 | Local 复用方式 |
|------------|--------------|
| `market-data-service` | `services/market_collector.py` |
| `trading-ai-service` | `services/ai_adapter.py` |
| `news-service` | `services/news_collector.py` |

复用策略：业务逻辑不变，仅换框架和存储。

---

*本文档随开发进展更新*
