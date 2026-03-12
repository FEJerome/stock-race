# Local 形态 API 接口规范

本文档定义 Local 版本的完整 REST API 和 WebSocket 协议。

> **适用范围**：Local 形态（FastAPI + Vue 3 + SQLite）
> **版本**：v1.0
> **最后更新**：2026-03-09

---

## 目录

- [1. 通用规范](#1-通用规范)
- [2. REST API](#2-rest-api)
- [3. WebSocket 协议](#3-websocket-协议)
- [4. 错误码定义](#4-错误码定义)
- [5. 数据模型](#5-数据模型)

---

## 1. 通用规范

### 1.1 基础信息

| 项目 | 值 |
|------|---|
| Base URL | `http://localhost:8000` |
| WebSocket | `ws://localhost:8000/ws/market` |
| Content-Type | `application/json` |
| 字符编码 | UTF-8 |

### 1.2 响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": { }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | int | 0=成功，非0=错误码 |
| `message` | string | 错误描述（成功时为"success"） |
| `data` | object/array | 响应数据 |

### 1.3 分页参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 1 | 页码（从1开始） |
| `page_size` | int | 20 | 每页条数（最大100） |

分页响应：
```json
{
  "code": 0,
  "data": {
    "items": [],
    "total": 100,
    "page": 1,
    "page_size": 20,
    "total_pages": 5
  }
}
```

---

## 2. REST API

### 2.1 健康检查

#### GET /health

健康检查端点。

**响应**：
```json
{
  "code": 0,
  "data": {
    "status": "ok",
    "version": "0.1.0",
    "timestamp": "2026-03-09T14:30:00Z"
  }
}
```

---

### 2.2 AI 交易员管理

#### POST /api/agents

创建 AI 交易员。

**请求体**：
```json
{
  "name": "小A",
  "initial_capital": 500000,
  "strategy": {
    "risk_tolerance": "稳健",
    "sectors": ["科技", "消费"],
    "holding_period": "中期",
    "position_limit": "单股不超过30%",
    "stop_loss": "8%止损",
    "market_scope": "主板+创业板"
  },
  "model_provider": "deepseek",
  "model_name": "deepseek-chat",
  "agent_level": "intern",
  "incentive_level": "standard"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | AI名称（2-20字符） |
| `initial_capital` | decimal | 是 | 初始资金（1万-10亿） |
| `strategy` | object | 是 | 策略配置（五维度） |
| `model_provider` | string | 否 | 模型提供商，默认deepseek |
| `model_name` | string | 否 | 模型名称 |
| `agent_level` | string | 否 | 职级：intern/manager/partner |
| `incentive_level` | string | 否 | 档位：standard/active/aggressive |

**响应**：
```json
{
  "code": 0,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "小A",
    "initial_capital": 500000,
    "current_capital": 500000,
    "strategy": { },
    "model_provider": "deepseek",
    "model_name": "deepseek-chat",
    "agent_level": "intern",
    "incentive_level": "standard",
    "status": "active",
    "created_at": "2026-03-09T14:30:00Z",
    "updated_at": "2026-03-09T14:30:00Z"
  }
}
```

**错误码**：
- `1001` - 初始资金超出范围
- `1002` - AI名称重复

#### GET /api/agents

获取 AI 交易员列表。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `status` | string | 筛选状态：active/paused |
| `page` | int | 页码 |
| `page_size` | int | 每页条数 |

**响应**：
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "小A",
        "agent_level": "intern",
        "incentive_level": "standard",
        "current_capital": 525000,
        "total_return": "+5%",
        "status": "active",
        "created_at": "2026-03-09T14:30:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20
  }
}
```

#### GET /api/agents/{agent_id}

获取 AI 交易员详情。

**响应**：
```json
{
  "code": 0,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "小A",
    "initial_capital": 500000,
    "current_capital": 525000,
    "total_return": "+5%",
    "strategy": { },
    "model_provider": "deepseek",
    "agent_level": "intern",
    "level_progress": {
      "current_level": 3,
      "max_level": 6,
      "days_to_next": 10
    },
    "incentive_level": "standard",
    "status": "active",
    "created_at": "2026-03-09T14:30:00Z",
    "positions": [
      {
        "symbol": "000001.SZ",
        "name": "平安银行",
        "quantity": 1000,
        "avg_cost": 12.5,
        "current_price": 13.2,
        "market_value": 13200,
        "unrealized_pnl": "+5.6%"
      }
    ],
    "metrics": {
      "total_return": 0.05,
      "daily_return": 0.01,
      "max_drawdown": 0.03,
      "sharpe_ratio": 1.2,
      "win_rate": 0.6,
      "profit_loss_ratio": 1.5
    }
  }
}
```

#### PUT /api/agents/{agent_id}/incentive

调整激励档位。

**请求体**：
```json
{
  "incentive_level": "active"
}
```

**响应**：
```json
{
  "code": 0,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "incentive_level": "active",
    "next_decision_time": "2026-03-09T15:00:00Z"
  }
}
```

**错误码**：
- `1003` - 当前等级不足，无法切换到积极档

#### DELETE /api/agents/{agent_id}

删除 AI 交易员。

**响应**：
```json
{
  "code": 0,
  "message": "AI交易员已删除"
}
```

---

### 2.3 交易执行

#### POST /api/trades

执行交易。

**请求体**：
```json
{
  "agent_id": "550e8400-e29b-41d4-a716-446655440000",
  "symbol": "000001.SZ",
  "action": "buy",
  "quantity": 500
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agent_id` | string(UUID) | 是 | AI交易员ID |
| `symbol` | string | 是 | 股票代码（如000001.SZ） |
| `action` | string | 是 | buy/sell |
| `quantity` | int | 是 | 交易数量 |

**响应**：
```json
{
  "code": 0,
  "data": {
    "trade_id": "660e8400-e29b-41d4-a716-446655440001",
    "agent_id": "550e8400-e29b-41d4-a716-446655440000",
    "symbol": "000001.SZ",
    "action": "buy",
    "quantity": 500,
    "price": 13.2,
    "total_amount": 6600,
    "realized_pnl": null,
    "timestamp": "2026-03-09T14:30:00Z",
    "decision_reason": "银行股估值修复，技术面突破"
  }
}
```

**错误码**：
- `2001` - 非交易时间
- `2002` - 资金不足
- `2003` - 持仓不足（卖出时）
- `2004` - 超出仓位限制

#### GET /api/trades

获取交易历史。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `agent_id` | string | AI交易员ID（必填） |
| `start_date` | string | 开始日期（YYYY-MM-DD） |
| `end_date` | string | 结束日期 |
| `page` | int | 页码 |
| `page_size` | int | 每页条数 |

**响应**：
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "trade_id": "660e8400-e29b-41d4-a716-446655440001",
        "symbol": "000001.SZ",
        "action": "buy",
        "quantity": 500,
        "price": 13.2,
        "total_amount": 6600,
        "realized_pnl": null,
        "timestamp": "2026-03-09T14:30:00Z"
      }
    ],
    "total": 10
  }
}
```

#### GET /api/portfolio/{agent_id}

获取持仓详情。

**响应**：
```json
{
  "code": 0,
  "data": {
    "agent_id": "550e8400-e29b-41d4-a716-446655440000",
    "cash": 493400,
    "total_value": 506600,
    "total_return": "+1.32%",
    "positions": [
      {
        "symbol": "000001.SZ",
        "name": "平安银行",
        "quantity": 1000,
        "avg_cost": 12.5,
        "current_price": 13.2,
        "market_value": 13200,
        "weight": "2.6%",
        "unrealized_pnl": 700,
        "unrealized_pnl_pct": "+5.6%"
      }
    ]
  }
}
```

---

### 2.4 行情数据

#### GET /api/market/quotes

获取实时行情。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `symbols` | string | 股票代码列表（逗号分隔，如"000001.SZ,000002.SZ"） |

**响应**：
```json
{
  "code": 0,
  "data": {
    "quotes": [
      {
        "symbol": "000001.SZ",
        "name": "平安银行",
        "price": 13.2,
        "open": 13.0,
        "high": 13.35,
        "low": 12.95,
        "prev_close": 13.05,
        "change": 0.15,
        "change_percent": 1.15,
        "volume": 1520000,
        "amount": 20060000,
        "timestamp": "2026-03-09T14:30:00Z"
      }
    ],
    "source": "sina",
    "latency_ms": 45
  }
}
```

#### GET /api/market/search

搜索股票。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `keyword` | string | 股票代码或名称 |

**响应**：
```json
{
  "code": 0,
  "data": [
    {
      "symbol": "000001.SZ",
      "name": "平安银行",
      "exchange": "SZSE",
      "type": "stock"
    }
  ]
}
```

---

### 2.5 AI 决策

#### POST /api/agents/{agent_id}/decide

获取 AI 决策（手动触发）。

**响应**：
```json
{
  "code": 0,
  "data": {
    "decision_id": "770e8400-e29b-41d4-a716-446655440002",
    "agent_id": "550e8400-e29b-41d4-a716-446655440000",
    "action": "buy",
    "symbol": "000001.SZ",
    "quantity": 500,
    "confidence": 0.75,
    "reason": "银行股估值修复，技术面突破，符合稳健策略",
    "analysis": "详细分析内容...",
    "risk_assessment": "中等风险，建议控制仓位",
    "suggested_position_size": "不超过总资金5%",
    "input_tokens": 3200,
    "output_tokens": 450,
    "cost": 0.015,
    "latency_ms": 2500,
    "timestamp": "2026-03-09T14:30:00Z"
  }
}
```

#### GET /api/agents/{agent_id}/decisions

获取决策历史。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `limit` | int | 返回条数（默认10，最大50） |

**响应**：
```json
{
  "code": 0,
  "data": [
    {
      "decision_id": "770e8400-e29b-41d4-a716-446655440002",
      "action": "buy",
      "symbol": "000001.SZ",
      "confidence": 0.75,
      "reason": "银行股估值修复...",
      "executed": true,
      "timestamp": "2026-03-09T14:30:00Z"
    }
  ]
}
```

---

### 2.6 Token 统计

#### GET /api/tokens/stats

获取 Token 消耗统计。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `agent_id` | string | AI交易员ID（可选，不传则查全部） |
| `period` | string | 周期：today/week/month |

**响应**：
```json
{
  "code": 0,
  "data": {
    "period": "today",
    "start_date": "2026-03-09T00:00:00Z",
    "end_date": "2026-03-09T23:59:59Z",
    "total_input_tokens": 15000,
    "total_output_tokens": 2500,
    "total_cost": 0.085,
    "by_model": {
      "deepseek-chat": {
        "input_tokens": 15000,
        "output_tokens": 2500,
        "cost": 0.085
      }
    },
    "by_action": {
      "decision": {
        "count": 5,
        "input_tokens": 15000,
        "output_tokens": 2500,
        "cost": 0.085
      }
    }
  }
}
```

---

### 2.7 设置

#### GET /api/settings

获取用户设置。

**响应**：
```json
{
  "code": 0,
  "data": {
    "api_keys": {
      "deepseek": {
        "masked": "sk-...abc123",
        "has_key": true
      }
    },
    "ai_config": {
      "timeout": 30,
      "max_retries": 2,
      "token_budget_per_day": 1000000,
      "daily_cost_alert_threshold": 50.0
    },
    "theme": "light"
  }
}
```

#### PUT /api/settings/api-key

设置 API Key。

**请求体**：
```json
{
  "provider": "deepseek",
  "api_key": "sk-xxxxxxxxxxxxxxxx"
}
```

**响应**：
```json
{
  "code": 0,
  "message": "API Key 已更新"
}
```

#### PUT /api/settings/ai-config

更新 AI 配置。

**请求体**：
```json
{
  "timeout": 30,
  "max_retries": 2,
  "token_budget_per_day": 1000000,
  "daily_cost_alert_threshold": 50.0
}
```

---

## 3. WebSocket 协议

### 3.1 连接建立

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/market');
```

### 3.2 客户端→服务端消息

#### 订阅行情

```json
{
  "action": "subscribe",
  "symbols": ["000001.SZ", "000002.SZ", "sh000001"]
}
```

#### 取消订阅

```json
{
  "action": "unsubscribe",
  "symbols": ["000002.SZ"]
}
```

#### 心跳响应

```json
{
  "type": "pong",
  "timestamp": 1709998800000
}
```

### 3.3 服务端→客户端消息

#### 行情更新

```json
{
  "type": "quote_update",
  "data": [
    {
      "symbol": "000001.SZ",
      "price": 13.2,
      "change": 0.15,
      "change_percent": 1.15,
      "volume": 1520000,
      "timestamp": "2026-03-09T14:30:05Z"
    }
  ],
  "timestamp": "2026-03-09T14:30:05Z"
}
```

#### 心跳检测

```json
{
  "type": "ping",
  "timestamp": 1709998800000
}
```

#### 重连数据补偿

```json
{
  "type": "batch_update",
  "data": [
    {
      "symbol": "000001.SZ",
      "price": 13.25,
      "change": 0.2,
      "change_percent": 1.53,
      "volume": 1580000,
      "timestamp": "2026-03-09T14:30:00Z"
    }
  ],
  "message": "重连后数据补偿",
  "timestamp": "2026-03-09T14:30:10Z"
}
```

#### 交易执行通知

```json
{
  "type": "trade_update",
  "data": {
    "trade_id": "660e8400-e29b-41d4-a716-446655440001",
    "agent_id": "550e8400-e29b-41d4-a716-446655440000",
    "symbol": "000001.SZ",
    "action": "buy",
    "quantity": 500,
    "price": 13.2,
    "timestamp": "2026-03-09T14:30:00Z"
  },
  "timestamp": "2026-03-09T14:30:00Z"
}
```

#### 错误通知

```json
{
  "type": "error",
  "code": 3001,
  "message": "WebSocket订阅数量超过限制（最大100只）",
  "timestamp": "2026-03-09T14:30:00Z"
}
```

### 3.4 连接管理

| 事件 | 说明 |
|------|------|
| 心跳间隔 | 15秒 |
| 心跳超时 | 5秒 |
| 最大订阅 | 100只股票 |
| 重连策略 | 固定3秒间隔（Local单机版，无需指数退避） |

---

## 4. 错误码定义

### 4.1 通用错误码

| 错误码 | 说明 | HTTP状态码 |
|--------|------|-----------|
| `0` | 成功 | 200 |
| `1` | 系统错误 | 500 |
| `2` | 参数错误 | 400 |
| `3` | 未找到资源 | 404 |
| `4` | 权限不足 | 403 |
| `5` | 请求过于频繁 | 429 |

### 4.2 AI 交易员错误码

| 错误码 | 说明 |
|--------|------|
| `1001` | 初始资金超出范围（1万-10亿） |
| `1002` | AI名称重复 |
| `1003` | 当前等级不足，无法切换激励档位 |
| `1004` | AI交易员不存在 |
| `1005` | AI交易员状态不允许此操作 |

### 4.3 交易错误码

| 错误码 | 说明 |
|--------|------|
| `2001` | 非交易时间 |
| `2002` | 资金不足 |
| `2003` | 持仓不足 |
| `2004` | 超出仓位限制 |
| `2005` | 股票代码不存在 |
| `2006` | 交易价格超出涨跌停限制 |

### 4.4 行情错误码

| 错误码 | 说明 |
|--------|------|
| `3001` | 订阅数量超过限制 |
| `3002` | 股票代码不存在 |
| `3003` | 数据源不可用 |

### 4.5 AI 决策错误码

| 错误码 | 说明 |
|--------|------|
| `4001` | AI 适配器调用失败 |
| `4002` | Token 预算已用完 |
| `4003` | 决策频率限制（按档位） |
| `4004` | API Key 未配置 |

---

## 5. 数据模型

### 5.1 Agent（AI交易员）

```typescript
interface Agent {
  id: string;                    // UUID
  name: string;                  // 名称
  initial_capital: number;       // 初始资金
  current_capital: number;       // 当前资金
  strategy: Strategy;            // 策略配置
  model_provider: string;        // 模型提供商
  model_name: string;            // 模型名称
  agent_level: 'intern' | 'manager' | 'partner';
  incentive_level: 'standard' | 'active' | 'aggressive';
  status: 'active' | 'paused';
  created_at: string;
  updated_at: string;
}
```

### 5.2 Strategy（策略）

```typescript
interface Strategy {
  risk_tolerance: string;        // 风险承受
  sectors: string[];             // 关注板块
  holding_period: string;        // 持仓周期
  position_limit: string;        // 仓位控制
  stop_loss: string;             // 止损纪律
  market_scope: string;          // 交易范围
}
```

### 5.3 Trade（交易）

```typescript
interface Trade {
  trade_id: string;
  agent_id: string;
  symbol: string;
  action: 'buy' | 'sell';
  quantity: number;
  price: number;
  total_amount: number;
  realized_pnl: number | null;
  decision_reason: string | null;
  timestamp: string;
}
```

### 5.4 Position（持仓）

```typescript
interface Position {
  symbol: string;
  name: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: string;
}
```

### 5.5 Quote（行情）

```typescript
interface Quote {
  symbol: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  change: number;
  change_percent: number;
  volume: number;
  amount: number;
  timestamp: string;
}
```

### 5.6 Decision（决策）

```typescript
interface Decision {
  decision_id: string;
  agent_id: string;
  action: 'buy' | 'sell' | 'hold' | 'watch';
  symbol: string | null;
  quantity: number | null;
  confidence: number;
  reason: string;
  analysis: string;
  risk_assessment: string;
  suggested_position_size: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  latency_ms: number;
  timestamp: string;
}
```

---

*本文档由 ARCHITECTURE.md 和 IMPLEMENTATION_PLAN.md 派生*
