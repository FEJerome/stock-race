# 跨服务链条联调测试方案

> **文档编号**: TEST-CHAIN-2026-02-12
> **制定日期**: 2026-02-12
> **适用范围**: Backend、Market Data Service、Trading AI Service、News Service、Miniprogram
> **测试环境**: 生产环境基准（所有基础设施和服务已启动）
> **测试目标**: 验证所有业务环节在服务间正确流转，数据流向和逻辑正确

---

## 一、测试方案概述

### 1.1 测试范围

本次联调测试覆盖 **5个核心服务** 之间的 **8条业务数据链条**：

| 序号 | 数据链条 | 涉及服务 | 通信方式 | 优先级 |
|------|----------|----------|----------|--------|
| 1 | 实时行情推送链 | Market Data → Miniprogram | WebSocket | P0 |
| 2 | 排行榜数据链 | Backend → Miniprogram | HTTP API | P0 |
| 3 | 游客模式完整链 | Miniprogram ↔ Backend | HTTP API | P0 |
| 4 | 行情事件驱动链 | Market Data → Trading AI | Redis Streams | P1 |
| 5 | 新闻情报处理链 | News Service → Trading AI | Redis Streams | P1 |
| 6 | AI决策事件链 | Trading AI → Backend | Redis Streams | P1 |
| 7 | 收益查询链 | Backend → Miniprogram | HTTP API | P1 |
| 8 | 账户状态同步链 | Backend → 各服务 | Redis Streams | P2 |

### 1.2 测试环境要求

```yaml
# 基础设施（全部已启动）
Redis: 6.x+ (单节点/主从/集群均可)
PostgreSQL: 15.x+ (Backend业务库、AI决策库、新闻库)
TimescaleDB: 2.x+ (Market Data时序库)

# 各服务（全部已启动）
Backend: http://localhost:3001
Market Data Service: http://localhost:8001
Trading AI Service: http://localhost:8000
News Service: http://localhost:8002 (如果有独立端口)
Miniprogram: 微信开发者工具 / 真机调试

# 外部依赖
微信登录: 需配置有效的小程序AppID和AppSecret
AI模型API: DeepSeek/OpenAI等（配置有效API Key）
```

### 1.3 测试方法

1. **端到端验证**: 从用户操作（Miniprogram）发起，追踪数据完整流转
2. **事件追踪**: 验证Redis Streams中的事件发布/消费
3. **数据一致性**: 验证各服务数据库中的数据状态一致
4. **故障模拟**: 验证服务降级和异常处理逻辑

---

## 二、测试链条详细设计

### 链条1: 实时行情推送链 (P0)

**业务场景**: 用户在Miniprogram行情页查看实时股价

**数据流向**:
```
┌─────────────────┐    WebSocket     ┌──────────────┐
│ Market Data     │ ───────────────► │ Miniprogram  │
│ Service:8001    │  10秒推送JSON    │ (行情页展示)  │
└─────────────────┘                  └──────────────┘
```

**测试步骤**:

| 步骤 | 操作 | 验证点 | 预期结果 |
|------|------|--------|----------|
| 1.1 | Miniprogram连接WebSocket | `ws://market-data:8001/ws/public/quotes` | 连接成功，返回连接确认 |
| 1.2 | 订阅股票代码 | 发送 `{"action":"subscribe","symbols":["000001.SZ","600000.SS"]}` | 返回订阅确认 |
| 1.3 | 等待数据推送 | 观察WebSocket消息 | 每10秒收到一次行情数据 |
| 1.4 | 验证数据格式 | 检查JSON字段 | 包含symbol, price, change_percent, volume等 |
| 1.5 | 取消订阅 | 发送 `{"action":"unsubscribe","symbols":["000001.SZ"]}` | 返回取消确认，不再收到该股票数据 |
| 1.6 | 断开连接 | 关闭WebSocket | 正常关闭，无异常 |

**数据验证**:
```json
{
  "type": "quote_update",
  "data": {
    "symbol": "000001.SZ",
    "name": "平安银行",
    "price": 10.58,
    "change": 0.12,
    "change_percent": 1.15,
    "volume": 125800000,
    "timestamp": "2026-02-12T10:30:00Z"
  }
}
```

**通过标准**:
- [x] WebSocket连接建立时间 < 1秒
- [x] 订阅/取消订阅响应时间 < 500ms
- [x] 行情数据推送间隔 10秒 ± 2秒
- [x] 数据字段完整，无null值
- [x] 涨跌幅计算正确（红涨绿跌，A股习惯）

---

### 链条2: 排行榜数据链 (P0)

**业务场景**: 用户查看AI账户收益排行榜

**数据流向**:
```
┌──────────────┐    HTTP GET      ┌─────────────┐    SQL查询     ┌──────────────┐
│ Miniprogram  │ ───────────────► │ Backend     │ ─────────────► │ PostgreSQL   │
│ (排行榜页)    │  /public/ranking │ :3001       │                │ (AI账户表)    │
└──────────────┘                  └─────────────┘                └──────────────┘
                                        │
                                        ▼
                                ┌──────────────┐
                                │ Redis缓存    │
                                │ (5秒TTL)     │
                                └──────────────┘
```

**测试步骤**:

| 步骤 | 操作 | 验证点 | 预期结果 |
|------|------|--------|----------|
| 2.1 | 游客访问排行榜 | `GET /api/v1/public/ranking/daily` | 返回200，无需认证 |
| 2.2 | 验证响应格式 | 检查JSON结构 | 包含rankings数组，每个元素有rank, account_id, nickname, return_rate等 |
| 2.3 | 验证排行榜顺序 | 检查return_rate排序 | 按收益率降序排列 |
| 2.4 | 验证数据条数 | 检查数组长度 | 返回前20/50/100名（根据参数） |
| 2.5 | 测试不同周期 | `GET /api/v1/public/ranking/weekly` | 周排行数据正确 |
| 2.6 | 测试缓存生效 | 5秒内重复请求 | 返回相同数据，响应时间 < 50ms |
| 2.7 | 测试缓存刷新 | 等待5秒后请求 | 数据可能更新，响应时间 < 200ms |

**数据验证**:
```json
{
  "code": 0,
  "data": {
    "period": "daily",
    "rankings": [
      {
        "rank": 1,
        "account_id": "acc_123456",
        "nickname": "AI股神一号",
        "avatar_url": "https://...",
        "return_rate": 15.8,
        "total_assets": 1158000.00,
        "update_time": "2026-02-12T15:30:00Z"
      }
    ],
    "total": 150
  }
}
```

**通过标准**:
- [x] 无需认证即可访问公开排行榜
- [x] 数据排序正确（收益率降序）
- [x] 缓存策略生效（5秒TTL）
- [x] 响应时间 < 200ms（首次），< 50ms（缓存命中）

---

### 链条3: 游客模式完整链 (P0)

**业务场景**: 新用户以游客身份体验，创建临时AI账户并进行对话

**数据流向**:
```
Miniprogram
    │ 1. 获取游客Token (POST /guest/token)
    ▼
Backend ──► Redis (存储游客Token, TTL=24h)
    │
    │ 2. 创建临时AI (POST /guest/ai-accounts)
    ▼
Backend ──► PostgreSQL (创建AI账户, status='guest')
    │
    │ 3. AI对话 (POST /guest/ai-accounts/:id/chat)
    ▼
Backend ──► DeepSeek API ──► 返回流式响应
    │
    │ 4. 微信登录迁移 (POST /auth/wechat-login)
    ▼
Backend ──► 数据迁移 (guest → formal)
```

**测试步骤**:

| 步骤 | 操作 | API端点 | 验证点 | 预期结果 |
|------|------|---------|--------|----------|
| 3.1 | 获取设备指纹 | 小程序端生成 | 生成唯一device_id | 稳定的设备标识 |
| 3.2 | 获取游客Token | `POST /api/v1/guest/token` | 请求头带device_id | 返回guest_token和expire_time |
| 3.3 | Token本地存储 | 小程序本地存储 | `uni.setStorageSync` | 存储成功，下次自动携带 |
| 3.4 | 创建临时AI | `POST /api/v1/guest/ai-accounts` | 携带guest_token | 返回AI账户ID，状态为draft |
| 3.5 | 验证创建限制 | 创建第3个AI账户 | 检查限制逻辑 | 返回错误，游客最多2个 |
| 3.6 | AI对话 | `POST /api/v1/guest/ai-accounts/:id/chat` | SSE流式响应 | 正常返回AI回复 |
| 3.7 | 验证对话限制 | 进行第11轮对话 | 检查轮数限制 | 返回错误，游客最多10轮 |
| 3.8 | Token续期 | 访问任意游客API | 检查TTL刷新 | Redis TTL重置为24h/72h |
| 3.9 | 微信登录 | `POST /api/v1/auth/wechat-login` | code换取session | 返回JWT Token |
| 3.10 | 数据迁移验证 | 查询AI账户 | 检查owner_id变更 | 账户绑定到正式用户 |
| 3.11 | 游客Token失效 | 再次使用guest_token | 检查有效性 | 返回401，已迁移用户不再可用 |

**数据验证**:
```json
// 3.2 游客Token响应
{
  "code": 0,
  "data": {
    "guest_token": "eyJhbGc...",
    "expire_in": 86400,
    "expire_at": "2026-02-13T10:30:00Z"
  }
}

// 3.4 创建AI账户响应
{
  "code": 0,
  "data": {
    "id": "ai_acc_xxx",
    "name": "AI助手",
    "status": "draft",
    "created_at": "2026-02-12T10:30:00Z"
  }
}
```

**通过标准**:
- [x] 设备指纹生成稳定唯一
- [x] 游客Token正确生成并存储到Redis
- [x] 创建AI账户数量限制生效（最多2个）
- [x] AI对话轮数限制生效（最多10轮）
- [x] Token过期策略正确（24h/72h）
- [x] 微信登录后数据正确迁移
- [x] 游客Token在迁移后失效

---

### 链条4: 行情事件驱动链 (P1)

**业务场景**: Market Data发布行情事件，Trading AI订阅并触发决策

**数据流向**:
```
┌─────────────────┐    Redis Streams    ┌─────────────────┐
│ Market Data     │ ──────────────────► │ Trading AI      │
│ Service         │  market:quote:      │ Service         │
│ (发布行情事件)   │     realtime        │ (订阅并处理)     │
└─────────────────┘                     └─────────────────┘
                                                │
                                                ▼
                                        ┌───────────────┐
                                        │ 决策触发逻辑   │
                                        │ (Token防抖)   │
                                        └───────────────┘
```

**测试步骤**:

| 步骤 | 操作 | 验证点 | 预期结果 |
|------|------|--------|----------|
| 4.1 | 检查Redis连接 | `XINFO STREAM market:quote:realtime` | Stream存在，有消费者组 |
| 4.2 | 验证消费者组 | `XINFO GROUPS market:quote:realtime` | 存在trading-ai-group |
| 4.3 | 等待行情发布 | 观察Market Data日志 | 定期发布行情事件到Redis |
| 4.4 | 验证事件内容 | `XREAD COUNT 1 STREAMS market:quote:realtime $` | 事件包含symbol, price, timestamp |
| 4.5 | 验证Trading AI消费 | 查看Trading AI日志 | 收到行情事件，触发处理逻辑 |
| 4.6 | Token防抖验证 | 同一股票高频事件 | 5分钟内不重复触发决策 |
| 4.7 | 验证消费者组ACK | `XPENDING market:quote:realtime trading-ai-group` | 消息被正确处理并确认 |

**事件格式验证**:
```json
{
  "event_id": "evt_abc123",
  "event_type": "market:quote:realtime",
  "timestamp": "2026-02-12T10:30:00Z",
  "payload": {
    "symbol": "000001.SZ",
    "price": 10.58,
    "change_percent": 1.15,
    "volume": 125800000
  }
}
```

**通过标准**:
- [x] Redis Stream正确创建
- [x] 消费者组正确配置
- [x] 行情事件正常发布
- [x] Trading AI正常消费事件
- [x] Token防抖机制生效
- [x] 消息ACK机制正常

---

### 链条5: 新闻情报处理链 (P1)

**业务场景**: News Service发布新闻情报，Trading AI订阅并影响决策

**数据流向**:
```
┌─────────────────┐    Redis Streams    ┌─────────────────┐
│ News Service    │ ──────────────────► │ Trading AI      │
│ (新闻采集+分析)  │  news:intelligence: │ Service         │
│                 │   extracted         │ (订阅分析)       │
└─────────────────┘                     └─────────────────┘
                                                │
                                                ▼
                                        ┌───────────────┐
                                        │ 新闻影响因子   │
                                        │ 计算与存储     │
                                        └───────────────┘
```

**测试步骤**:

| 步骤 | 操作 | 验证点 | 预期结果 |
|------|------|--------|----------|
| 5.1 | 检查News Service运行 | 查看服务日志 | 正常运行，定期采集新闻 |
| 5.2 | 验证Redis Stream | `XINFO STREAM news:intelligence:extracted` | Stream存在 |
| 5.3 | 手动触发新闻采集 | 调用News Service采集API | 采集到新闻并分析 |
| 5.4 | 验证事件发布 | `XREAD COUNT 1 STREAMS news:intelligence:extracted $` | 事件包含stock_code, sentiment, impact_score |
| 5.5 | 验证Trading AI订阅 | 查看Trading AI日志 | 收到新闻情报事件 |
| 5.6 | 验证情感分析 | 检查事件payload | sentiment字段为positive/negative/neutral |
| 5.7 | 验证影响因子 | 检查事件payload | impact_score在0-100之间 |
| 5.8 | 验证消费者组状态 | `XINFO CONSUMERS news:intelligence:extracted trading-ai-group` | 消费者正常连接 |

**事件格式验证**:
```json
{
  "event_id": "evt_news_456",
  "event_type": "news:intelligence:extracted",
  "timestamp": "2026-02-12T10:30:00Z",
  "payload": {
    "stock_code": "000001.SZ",
    "stock_name": "平安银行",
    "news_title": "平安银行发布2025年报",
    "sentiment": "positive",
    "impact_score": 75,
    "summary": "业绩超预期...",
    "source_url": "https://..."
  }
}
```

**通过标准**:
- [x] News Service正常采集和分析新闻
- [x] 新闻情报事件正常发布到Redis
- [x] Trading AI正常订阅和消费
- [x] 情感分析结果正确
- [x] 影响因子评分合理

---

### 链条6: AI决策事件链 (P1)

**业务场景**: Trading AI生成决策后发布事件，Backend订阅并执行交易

**数据流向**:
```
┌─────────────────┐    Redis Streams    ┌─────────────────┐
│ Trading AI      │ ──────────────────► │ Backend         │
│ Service         │  ai:decision:made   │ (Node.js)       │
│ (决策生成)       │                     │ (订阅并执行)     │
└─────────────────┘                     └─────────────────┘
                                                │
                                                ▼
                                        ┌───────────────┐
                                        │ 交易执行      │
                                        │ 结果回写DB     │
                                        └───────────────┘
```

**测试步骤**:

| 步骤 | 操作 | 验证点 | 预期结果 |
|------|------|--------|----------|
| 6.1 | 验证Redis Stream | `XINFO STREAM ai:decision:made` | Stream存在，有消费者组 |
| 6.2 | 验证Backend消费者组 | `XINFO GROUPS ai:decision:made` | 存在backend-group |
| 6.3 | 触发AI决策 | 等待或手动触发Trading AI决策 | Trading AI生成决策 |
| 6.4 | 验证决策事件 | `XREAD COUNT 1 STREAMS ai:decision:made $` | 事件包含account_id, action, symbol, confidence等 |
| 6.5 | 验证Backend消费 | 查看Backend日志 | 收到决策事件，开始处理 |
| 6.6 | 验证交易执行 | 检查PostgreSQL trade_records表 | 生成交易记录，状态为executed/pending |
| 6.7 | 验证持仓更新 | 检查PostgreSQL positions表 | 持仓数量正确更新 |
| 6.8 | 验证账户资产 | 检查PostgreSQL ai_accounts表 | 资产总值正确计算 |

**事件格式验证**:
```json
{
  "event_id": "evt_dec_789",
  "event_type": "ai:decision:made",
  "timestamp": "2026-02-12T10:30:00Z",
  "payload": {
    "account_id": "ai_acc_xxx",
    "symbol": "000001.SZ",
    "action": "buy",
    "quantity": 100,
    "price": 10.58,
    "confidence": 0.85,
    "reason": "技术指标突破...",
    "model_used": "deepseek-chat"
  }
}
```

**通过标准**:
- [x] AI决策事件正常发布
- [x] Backend正常订阅和消费
- [x] 交易正确执行
- [x] 持仓数据正确更新
- [x] 账户资产正确计算

---

### 链条7: 收益查询链 (P1)

**业务场景**: 用户查看AI账户收益详情

**数据流向**:
```
┌──────────────┐    HTTP GET      ┌─────────────┐    SQL查询      ┌──────────────┐
│ Miniprogram  │ ───────────────► │ Backend     │ ───────────────►│ PostgreSQL   │
│ (收益页)      │  /ai-accounts/  │ :3001       │                 │ (交易记录表)  │
│              │    :id/         │             │                 │ (持仓表)     │
│              │ performance     │             │                 │              │
└──────────────┘                  └─────────────┘                 └──────────────┘
                                        │
                                        ▼
                                ┌──────────────┐
                                │ 收益计算引擎  │
                                │ (持仓成本计算)│
                                └──────────────┘
```

**测试步骤**:

| 步骤 | 操作 | 验证点 | 预期结果 |
|------|------|--------|----------|
| 7.1 | 登录获取JWT | `POST /api/v1/auth/wechat-login` | 返回有效JWT |
| 7.2 | 查询收益数据 | `GET /api/v1/ai-accounts/:id/performance` | 返回200，需JWT认证 |
| 7.3 | 验证响应格式 | 检查JSON结构 | 包含total_return, return_rate, daily_curve, positions等 |
| 7.4 | 验证累计收益 | 对比交易记录计算 | 累计收益 = 当前市值 - 累计投入 |
| 7.5 | 验证收益率 | 检查计算准确性 | 收益率 = 累计收益 / 累计投入 × 100% |
| 7.6 | 验证收益曲线 | 检查daily_curve数据 | 包含日期和当日收益率，时间序列完整 |
| 7.7 | 验证持仓详情 | 检查positions数组 | 每只股票的持仓量、成本价、当前价、盈亏 |
| 7.8 | 验证缓存策略 | 5秒内重复请求 | 返回相同数据（5秒缓存） |

**数据验证**:
```json
{
  "code": 0,
  "data": {
    "account_id": "ai_acc_xxx",
    "total_assets": 1158000.00,
    "total_cost": 1000000.00,
    "total_return": 158000.00,
    "return_rate": 15.8,
    "daily_curve": [
      {"date": "2026-02-01", "return_rate": 0},
      {"date": "2026-02-02", "return_rate": 2.5},
      {"date": "2026-02-12", "return_rate": 15.8}
    ],
    "positions": [
      {
        "symbol": "000001.SZ",
        "name": "平安银行",
        "quantity": 1000,
        "cost_price": 10.00,
        "current_price": 10.58,
        "market_value": 10580.00,
        "profit": 580.00,
        "profit_rate": 5.8
      }
    ]
  }
}
```

**通过标准**:
- [x] 需JWT认证访问
- [x] 收益计算准确
- [x] 收益率计算正确
- [x] 收益曲线数据完整
- [x] 持仓详情准确
- [x] 缓存策略生效（5秒TTL）

---

### 链条8: 账户状态同步链 (P2)

**业务场景**: AI账户状态变更时，通过事件总线同步给相关服务

**数据流向**:
```
┌─────────────────┐    Redis Streams    ┌─────────────────┐
│ Backend         │ ──────────────────► │ News Service    │
│ (Node.js)       │  backend:account:  │ Trading AI      │
│ (状态变更)       │     updated        │ (订阅同步)       │
└─────────────────┘                     └─────────────────┘
```

**测试步骤**:

| 步骤 | 操作 | 验证点 | 预期结果 |
|------|------|--------|----------|
| 8.1 | 创建AI账户 | `POST /api/v1/ai-accounts` | 创建成功 |
| 8.2 | 验证事件发布 | `XREAD COUNT 1 STREAMS backend:account:updated $` | 事件包含account_id, status, created_at |
| 8.3 | 激活AI账户 | `POST /api/v1/ai-accounts/:id/activate` | 激活成功 |
| 8.4 | 验证状态变更事件 | 检查Redis Stream | 事件包含status=active |
| 8.5 | 验证News Service订阅 | 查看News Service日志 | 收到账户状态事件 |
| 8.6 | 暂停AI账户 | `POST /api/v1/ai-accounts/:id/pause` | 暂停成功 |
| 8.7 | 验证暂停事件 | 检查Redis Stream | 事件包含status=paused |

**事件格式验证**:
```json
{
  "event_id": "evt_acc_012",
  "event_type": "backend:account:updated",
  "timestamp": "2026-02-12T10:30:00Z",
  "payload": {
    "account_id": "ai_acc_xxx",
    "user_id": "user_yyy",
    "status": "active",
    "previous_status": "draft",
    "updated_fields": ["status", "activated_at"]
  }
}
```

**通过标准**:
- [x] 账户状态变更事件正确发布
- [x] 相关服务正常订阅
- [x] 事件内容完整准确

---

## 三、测试执行计划

### 3.1 执行顺序

```
阶段1: P0核心链条（阻塞Miniprogram上线）
├── 链条1: 实时行情推送链
├── 链条2: 排行榜数据链
└── 链条3: 游客模式完整链

阶段2: P1事件总线链条（服务解耦验证）
├── 链条4: 行情事件驱动链
├── 链条5: 新闻情报处理链
├── 链条6: AI决策事件链
└── 链条7: 收益查询链

阶段3: P2扩展链条（完整生态）
└── 链条8: 账户状态同步链
```

### 3.2 测试时间安排

| 阶段 | 链条 | 预计用时 | 前置条件 |
|------|------|----------|----------|
| 阶段1 | 1-3 | 2天 | Miniprogram完成P0任务 |
| 阶段2 | 4-7 | 2天 | 事件总线联调完成 |
| 阶段3 | 8 | 0.5天 | Backend账户管理功能就绪 |

### 3.3 人员分工

| 角色 | 职责 | 负责链条 |
|------|------|----------|
| 测试负责人 | 整体协调、进度把控 | 全部 |
| Backend开发 | Backend相关API验证 | 2, 3, 6, 7, 8 |
| Market Data开发 | 行情数据流验证 | 1, 4 |
| Trading AI开发 | AI决策链验证 | 4, 5, 6 |
| News Service开发 | 新闻情报链验证 | 5 |
| Miniprogram开发 | 端到端用户场景验证 | 1, 2, 3, 7 |
| 运维支持 | 环境保障、Redis监控 | 全部 |

---

## 四、测试工具与脚本

### 4.1 通用验证命令

```bash
# 1. 检查Redis Streams
redis-cli XINFO STREAM market:quote:realtime
redis-cli XINFO GROUPS market:quote:realtime
redis-cli XINFO CONSUMERS market:quote:realtime trading-ai-group

# 2. 查看待处理消息
redis-cli XPENDING market:quote:realtime trading-ai-group

# 3. 读取最新事件
redis-cli XREVRANGE market:quote:realtime + - COUNT 1

# 4. 检查服务健康
./scripts/health_check.sh

# 5. 查看Docker日志
docker-compose logs -f backend
docker-compose logs -f market-data
docker-compose logs -f trading-ai
docker-compose logs -f news-service
```

### 4.2 自动化测试脚本

```bash
#!/bin/bash
# chain_test_runner.sh - 链条测试执行脚本

set -e

# 配置
BACKEND_URL="http://localhost:3001"
MARKET_DATA_URL="http://localhost:8001"
TRADING_AI_URL="http://localhost:8000"
REDIS_HOST="localhost"
REDIS_PORT="6379"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 测试结果统计
PASSED=0
FAILED=0

# 测试函数
run_test() {
    local test_name=$1
    local test_cmd=$2

    echo -n "Testing $test_name... "
    if eval $test_cmd > /dev/null 2>&1; then
        echo -e "${GREEN}PASSED${NC}"
        ((PASSED++))
    else
        echo -e "${RED}FAILED${NC}"
        ((FAILED++))
    fi
}

# 执行测试
echo "=== 跨服务链条联调测试 ==="
echo "开始时间: $(date)"
echo ""

# 链条1: 实时行情推送链
echo "--- 链条1: 实时行情推送链 ---"
run_test "WebSocket连接" "curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' $MARKET_DATA_URL/ws/public/quotes"
run_test "行情Stream存在" "redis-cli -h $REDIS_HOST -p $REDIS_PORT EXISTS market:quote:realtime"

# 链条2: 排行榜数据链
echo ""
echo "--- 链条2: 排行榜数据链 ---"
run_test "排行榜API" "curl -s $BACKEND_URL/api/v1/public/ranking/daily | grep -q 'rankings'"
run_test "排行榜缓存" "redis-cli -h $REDIS_HOST -p $REDIS_PORT TTL 'ranking:daily' > /dev/null"

# 链条3: 游客模式链
echo ""
echo "--- 链条3: 游客模式链 ---"
run_test "游客Token接口" "curl -s -X POST $BACKEND_URL/api/v1/guest/token -H 'X-Device-ID: test123' | grep -q 'guest_token'"

# 更多测试...

echo ""
echo "=== 测试摘要 ==="
echo "通过: $PASSED"
echo "失败: $FAILED"
echo "总计: $((PASSED + FAILED))"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}所有测试通过！${NC}"
    exit 0
else
    echo -e "${RED}存在失败测试，请检查！${NC}"
    exit 1
fi
```

### 4.3 事件追踪工具

```python
#!/usr/bin/env python3
# event_tracer.py - 事件流追踪工具

import redis
import json
import sys
from datetime import datetime

class EventTracer:
    def __init__(self, redis_host='localhost', redis_port=6379):
        self.redis = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
        self.streams = [
            'market:quote:realtime',
            'market:alert:price_move',
            'market:indicator:updated',
            'news:intelligence:extracted',
            'ai:decision:made',
            'backend:account:updated'
        ]

    def check_streams(self):
        """检查所有Stream状态"""
        print("=" * 60)
        print("Redis Streams 状态检查")
        print("=" * 60)

        for stream in self.streams:
            try:
                info = self.redis.xinfo_stream(stream)
                groups = self.redis.xinfo_groups(stream)

                print(f"\n📊 {stream}")
                print(f"  长度: {info['length']}")
                print(f"  消费者组: {len(groups)}")

                for group in groups:
                    print(f"    - {group['name']}: 消费者{group['consumers']}个, "
                          f"待处理{group['pending']}条")
            except redis.ResponseError:
                print(f"\n❌ {stream}: Stream不存在")

    def trace_event(self, stream, count=5):
        """追踪最近的事件"""
        print(f"\n{'=' * 60}")
        print(f"最近 {count} 条事件: {stream}")
        print("=" * 60)

        events = self.redis.xrevrange(stream, '+', '-', count=count)

        for event_id, fields in events:
            print(f"\n📝 Event ID: {event_id}")
            print(f"  时间: {datetime.fromtimestamp(int(event_id.split('-')[0])/1000)}")

            # 解析JSON payload
            data = {k: v for k, v in fields.items()}
            if 'payload' in data:
                try:
                    payload = json.loads(data['payload'])
                    print(f"  内容: {json.dumps(payload, indent=2, ensure_ascii=False)}")
                except:
                    print(f"  内容: {data['payload']}")

    def monitor_live(self, stream):
        """实时监控事件流"""
        print(f"\n{'=' * 60}")
        print(f"实时监控: {stream} (Ctrl+C 停止)")
        print("=" * 60)

        last_id = '$'

        try:
            while True:
                events = self.redis.xread({stream: last_id}, block=1000)

                if events:
                    for stream_name, messages in events:
                        for event_id, fields in messages:
                            print(f"\n🔔 新事件: {event_id}")
                            data = {k: v for k, v in fields.items()}
                            print(f"  内容: {data}")
                            last_id = event_id
        except KeyboardInterrupt:
            print("\n监控停止")

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='事件流追踪工具')
    parser.add_argument('--host', default='localhost', help='Redis主机')
    parser.add_argument('--port', type=int, default=6379, help='Redis端口')
    parser.add_argument('command', choices=['check', 'trace', 'monitor'],
                       help='命令: check检查状态, trace追踪事件, monitor实时监控')
    parser.add_argument('--stream', help='Stream名称')

    args = parser.parse_args()

    tracer = EventTracer(args.host, args.port)

    if args.command == 'check':
        tracer.check_streams()
    elif args.command == 'trace':
        if not args.stream:
            print("请指定 --stream 参数")
            sys.exit(1)
        tracer.trace_event(args.stream)
    elif args.command == 'monitor':
        if not args.stream:
            print("请指定 --stream 参数")
            sys.exit(1)
        tracer.monitor_live(args.stream)
```

---

## 五、问题诊断与排查

### 5.1 常见问题排查

| 问题现象 | 可能原因 | 排查方法 | 解决方案 |
|----------|----------|----------|----------|
| WebSocket连接失败 | Market Data未启动/端口错误 | `curl http://localhost:8001/health` | 启动服务，检查端口配置 |
| 行情数据不推送 | 未订阅股票/订阅失败 | 检查WebSocket消息日志 | 确认订阅消息格式正确 |
| Redis Stream为空 | Market Data未发布事件 | 查看Market Data日志 | 检查事件发布配置 |
| 消费者组无消费者 | 服务未启动/消费者组未创建 | `XINFO GROUPS` | 重启服务，自动创建消费者组 |
| 消息堆积 | 消费者处理慢/宕机 | `XPENDING`查看待处理消息 | 检查消费者服务状态 |
| 游客Token无效 | Redis中Token过期/不存在 | `redis-cli GET guest:token:xxx` | 重新获取Token |
| 排行榜数据为空 | 无AI账户/账户无收益 | 检查PostgreSQL ai_accounts表 | 创建测试账户并生成交易数据 |
| AI决策不触发 | Token防抖/模型配置错误 | 查看Trading AI日志 | 检查Token间隔和API Key |

### 5.2 日志查看命令

```bash
# 实时查看所有服务日志
docker-compose logs -f --tail=100

# 查看特定服务日志
docker-compose logs -f backend | grep -E "(error|warn|decision)"
docker-compose logs -f market-data | grep -E "(publish|event|stream)"
docker-compose logs -f trading-ai | grep -E "(decision|consume|event)"
docker-compose logs -f news-service | grep -E "(collect|extract|publish)"

# 查看Redis日志
docker-compose logs -f redis

# 查看PostgreSQL日志
docker-compose logs -f postgres
```

### 5.3 数据验证SQL

```sql
-- 验证AI账户状态
SELECT id, name, status, user_id, created_at
FROM ai_accounts
ORDER BY created_at DESC
LIMIT 10;

-- 验证交易记录
SELECT t.id, t.account_id, t.symbol, t.action, t.quantity, t.price, t.status, t.created_at,
       a.name as account_name
FROM trade_records t
JOIN ai_accounts a ON t.account_id = a.id
ORDER BY t.created_at DESC
LIMIT 10;

-- 验证持仓数据
SELECT p.account_id, p.symbol, p.quantity, p.cost_price, p.current_price,
       (p.current_price - p.cost_price) * p.quantity as profit
FROM positions p
ORDER BY profit DESC
LIMIT 10;

-- 验证游客Token
-- 在Redis中执行
KEYS guest:token:*
GET guest:token:<device_id>
TTL guest:token:<device_id>
```

---

## 六、测试报告模板

### 6.1 测试执行报告

```markdown
# 跨服务链条联调测试报告

**测试日期**: YYYY-MM-DD
**测试人员**: XXX
**测试环境**: 生产环境基准
**服务版本**:
- Backend: vX.X.X
- Market Data: vX.X.X
- Trading AI: vX.X.X
- News Service: vX.X.X
- Miniprogram: vX.X.X

## 执行摘要

| 链条 | 名称 | 状态 | 备注 |
|------|------|------|------|
| 1 | 实时行情推送链 | ✅ 通过 | 延迟<1s |
| 2 | 排行榜数据链 | ✅ 通过 | 缓存生效 |
| ... | ... | ... | ... |

## 详细测试结果

### 链条X: XXX链

**状态**: ✅ 通过 / ❌ 失败 / ⚠️ 部分通过

**测试详情**:
| 步骤 | 操作 | 预期结果 | 实际结果 | 状态 |
|------|------|----------|----------|------|
| X.1 | XXX | XXX | XXX | ✅ |

**问题记录**:
- 问题1: XXX
  - 原因: XXX
  - 解决方案: XXX

## 结论与建议

...
```

### 6.2 签署确认

| 角色 | 姓名 | 签署 | 日期 |
|------|------|------|------|
| 测试负责人 | | | |
| Backend开发 | | | |
| Market Data开发 | | | |
| Trading AI开发 | | | |
| Miniprogram开发 | | | |
| 架构师 | | | |

---

## 七、附录

### 7.1 相关文档

- [六服务架构设计](../architecture/CURRENT/SERVICE_ARCHITECTURE.md)
- [统一数据平台架构](../architecture/CURRENT/DATA_PLATFORM.md)
- [事件总线风险分析](../architecture/CURRENT/DECISIONS/002-EVENT-BUS.md)
- [Backend TODO](../../modules/backend/TODO.md)
- [Market Data TODO](../../modules/market-data-service/TODO.md)
- [Trading AI TODO](../../modules/trading-ai-service/TODO.md)
- [News Service TODO](../../modules/news-service/TODO.md)
- [Miniprogram TODO](../../modules/miniprogram/TODO.md)

### 7.2 术语表

| 术语 | 说明 |
|------|------|
| Redis Streams | Redis 5.0+ 引入的日志数据结构，用于事件总线 |
| 消费者组 | Consumer Group，实现消息负载均衡和消费确认 |
| ACK | Acknowledgment，消息消费确认机制 |
| TTL | Time To Live，数据存活时间 |
| P0/P1/P2 | 优先级，P0为最高 |
| WebSocket | 全双工通信协议，用于实时数据推送 |
| SSE | Server-Sent Events，服务器推送事件 |
| Token防抖 | 限制同一事件在短时间内重复触发 |

### 7.3 修订历史

| 版本 | 日期 | 修订人 | 修订内容 |
|------|------|--------|----------|
| v1.0 | 2026-02-12 | 首席架构师 | 初始版本 |

---

*本文档最后更新于: 2026-02-12*
*维护者: 首席架构师*
*审核状态: 待评审*
