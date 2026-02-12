# AI股票竞赛平台 - API接口规范

## 1. API设计原则

### 1.1 通用原则
- **RESTful设计**：资源导向，HTTP方法语义化
- **版本控制**：URL路径版本控制（/api/v1/...）
- **认证授权**：JWT令牌，Bearer认证
- **错误处理**：统一错误响应格式
- **速率限制**：基于用户/IP的API调用限制
- **数据格式**：JSON请求/响应，UTF-8编码

### 1.2 响应格式
```json
{
  "success": true,
  "data": {
    // 成功响应数据
  },
  "error": null,
  "message": "操作成功",
  "timestamp": "2026-02-02T10:30:00Z",
  "requestId": "req_1234567890"
}
```

### 1.3 错误响应格式
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": [
      {
        "field": "username",
        "message": "用户名不能为空"
      }
    ]
  },
  "message": "请求参数验证失败",
  "timestamp": "2026-02-02T10:30:00Z",
  "requestId": "req_1234567890"
}
```

### 1.4 HTTP状态码
- `200`：成功
- `201`：创建成功
- `400`：请求参数错误
- `401`：未认证
- `403`：权限不足
- `404`：资源不存在
- `429`：请求过于频繁
- `500`：服务器内部错误

## 2. 认证API

### 2.1 用户注册
```
POST /api/v1/auth/register
```

**请求体**：
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "confirmPassword": "SecurePass123!"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "john_doe",
      "email": "john@example.com",
      "createdAt": "2026-02-02T10:30:00Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "注册成功"
}
```

### 2.2 用户登录
```
POST /api/v1/auth/login
```

**请求体**：
```json
{
  "username": "john_doe",
  "password": "SecurePass123!"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "john_doe",
      "email": "john@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400
  },
  "message": "登录成功"
}
```

### 2.3 刷新令牌
```
POST /api/v1/auth/refresh
```

**请求头**：
```
Authorization: Bearer {refresh_token}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400
  },
  "message": "令牌刷新成功"
}
```

### 2.4 退出登录
```
POST /api/v1/auth/logout
```

**请求头**：
```
Authorization: Bearer {access_token}
```

**响应**：
```json
{
  "success": true,
  "data": null,
  "message": "退出成功"
}
```

## 3. 用户管理API

### 3.1 获取当前用户信息
```
GET /api/v1/users/me
```

**请求头**：
```
Authorization: Bearer {access_token}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "status": "active",
    "lastLoginAt": "2026-02-02T10:30:00Z",
    "createdAt": "2026-02-01T09:00:00Z",
    "settings": {
      "theme": "light",
      "language": "zh-CN",
      "notifications": {
        "tradeExecuted": true,
        "aiDecision": true
      }
    }
  },
  "message": "获取用户信息成功"
}
```

### 3.2 更新用户信息
```
PATCH /api/v1/users/me
```

**请求头**：
```
Authorization: Bearer {access_token}
```

**请求体**：
```json
{
  "email": "newemail@example.com",
  "settings": {
    "theme": "dark",
    "language": "en-US"
  }
}
```

### 3.3 修改密码
```
POST /api/v1/users/me/change-password
```

**请求头**：
```
Authorization: Bearer {access_token}
```

**请求体**：
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!",
  "confirmPassword": "NewPass456!"
}
```

## 4. AI账户管理API

### 4.1 获取AI账户列表
```
GET /api/v1/ai-accounts
```

**查询参数**：
- `status`：账户状态（active, paused, stopped）
- `page`：页码（默认1）
- `limit`：每页数量（默认20）

**响应**：
```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "id": 1,
        "name": "保守型AI",
        "modelType": "openai_gpt4",
        "initialBalance": 100000.00,
        "currentBalance": 105432.10,
        "totalValue": 108765.43,
        "status": "active",
        "tradingFrequency": "daily",
        "riskLevel": "low",
        "createdAt": "2026-02-01T09:00:00Z",
        "performance": {
          "totalReturn": 8.76,
          "todayReturn": 1.23,
          "winRate": 65.4
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "pages": 3
    }
  },
  "message": "获取AI账户列表成功"
}
```

### 4.2 创建AI账户
```
POST /api/v1/ai-accounts
```

**请求体**：
```json
{
  "name": "激进型AI",
  "modelType": "claude",
  "initialBalance": 100000.00,
  "tradingFrequency": "hourly",
  "riskLevel": "high",
  "promptTemplate": "custom_prompt_v1",
  "config": {
    "maxPositionSize": 0.3,
    "stopLoss": 0.05,
    "takeProfit": 0.15
  }
}
```

### 4.3 获取AI账户详情
```
GET /api/v1/ai-accounts/{accountId}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "保守型AI",
    "description": "基于价值投资的保守策略",
    "modelType": "openai_gpt4",
    "initialBalance": 100000.00,
    "currentBalance": 105432.10,
    "totalValue": 108765.43,
    "status": "active",
    "tradingFrequency": "daily",
    "riskLevel": "low",
    "promptTemplate": "value_investing_v1",
    "config": {
      "maxPositionSize": 0.2,
      "stopLoss": 0.03,
      "takeProfit": 0.1
    },
    "performance": {
      "totalReturn": 8.76,
      "annualizedReturn": 12.34,
      "sharpeRatio": 1.23,
      "maxDrawdown": -5.67,
      "winRate": 65.4,
      "profitFactor": 1.89,
      "totalTrades": 45,
      "totalVolume": 1250000.00
    },
    "createdAt": "2026-02-01T09:00:00Z",
    "updatedAt": "2026-02-02T10:30:00Z"
  },
  "message": "获取AI账户详情成功"
}
```

### 4.4 更新AI账户
```
PATCH /api/v1/ai-accounts/{accountId}
```

**请求体**：
```json
{
  "name": "更新后的名称",
  "status": "paused",
  "config": {
    "maxPositionSize": 0.25
  }
}
```

### 4.5 删除AI账户
```
DELETE /api/v1/ai-accounts/{accountId}
```

## 5. 交易API

### 5.1 获取交易记录
```
GET /api/v1/trades
```

**查询参数**：
- `accountId`：AI账户ID
- `stockCode`：股票代码
- `tradeType`：交易类型（buy, sell）
- `status`：交易状态
- `startDate`：开始日期（ISO格式）
- `endDate`：结束日期（ISO格式）
- `page`：页码
- `limit`：每页数量

**响应**：
```json
{
  "success": true,
  "data": {
    "trades": [
      {
        "id": 123,
        "accountId": 1,
        "accountName": "保守型AI",
        "stockCode": "000001",
        "stockName": "平安银行",
        "tradeType": "buy",
        "orderType": "market",
        "quantity": 1000,
        "price": 15.23,
        "amount": 15230.00,
        "fee": 15.23,
        "netAmount": 15245.23,
        "status": "executed",
        "reason": "AI决策：技术面看好",
        "executedAt": "2026-02-02T10:15:30Z",
        "createdAt": "2026-02-02T10:15:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 156,
      "pages": 8
    }
  },
  "message": "获取交易记录成功"
}
```

### 5.2 创建交易订单（手动交易）
```
POST /api/v1/trades
```

**请求体**：
```json
{
  "accountId": 1,
  "stockCode": "000001",
  "tradeType": "buy",
  "orderType": "market",
  "quantity": 100,
  "price": 15.50,
  "reason": "手动买入"
}
```

### 5.3 获取交易详情
```
GET /api/v1/trades/{tradeId}
```

### 5.4 取消交易订单
```
POST /api/v1/trades/{tradeId}/cancel
```

## 6. 持仓管理API

### 6.1 获取持仓列表
```
GET /api/v1/portfolios
```

**查询参数**：
- `accountId`：AI账户ID

**响应**：
```json
{
  "success": true,
  "data": {
    "portfolio": [
      {
        "stockCode": "000001",
        "stockName": "平安银行",
        "quantity": 1000,
        "avgCost": 15.23,
        "currentPrice": 16.50,
        "marketValue": 16500.00,
        "profitLoss": 1270.00,
        "profitLossRate": 8.34,
        "weight": 15.2,
        "firstBoughtAt": "2026-01-15T09:30:00Z",
        "lastTradedAt": "2026-02-02T10:15:30Z"
      }
    ],
    "summary": {
      "totalValue": 108765.43,
      "totalCost": 100000.00,
      "totalProfitLoss": 8765.43,
      "totalProfitLossRate": 8.76,
      "cashBalance": 105432.10,
      "stockValue": 3333.33
    }
  },
  "message": "获取持仓信息成功"
}
```

### 6.2 获取持仓详情
```
GET /api/v1/portfolios/{stockCode}
```

**查询参数**：
- `accountId`：AI账户ID

## 7. 市场数据API

### 7.1 获取股票列表
```
GET /api/v1/stocks
```

**查询参数**：
- `market`：市场（sh, sz, bj, hk）
- `industry`：行业
- `search`：搜索关键词（代码或名称）
- `page`：页码
- `limit`：每页数量

**响应**：
```json
{
  "success": true,
  "data": {
    "stocks": [
      {
        "code": "000001",
        "name": "平安银行",
        "market": "sz",
        "industry": "银行",
        "currentPrice": 16.50,
        "change": 0.45,
        "changePercent": 2.80,
        "volume": 12345678,
        "amount": 203765432.10,
        "peRatio": 8.23,
        "pbRatio": 0.89,
        "marketCap": 320000000000.00,
        "circulatingMarketCap": 280000000000.00
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 5000,
      "pages": 100
    }
  },
  "message": "获取股票列表成功"
}
```

### 7.2 获取股票详情
```
GET /api/v1/stocks/{stockCode}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "code": "000001",
    "name": "平安银行",
    "fullName": "平安银行股份有限公司",
    "market": "sz",
    "industry": "银行",
    "subIndustry": "股份制银行",
    "listingDate": "1991-04-03",
    "totalShares": 19400000000,
    "circulatingShares": 17000000000,
    "status": "normal",
    "currentPrice": 16.50,
    "change": 0.45,
    "changePercent": 2.80,
    "open": 16.10,
    "high": 16.65,
    "low": 16.05,
    "close": 16.50,
    "volume": 12345678,
    "amount": 203765432.10,
    "peRatio": 8.23,
    "pbRatio": 0.89,
    "dividendYield": 2.34,
    "marketCap": 320000000000.00,
    "circulatingMarketCap": 280000000000.00,
    "technicalIndicators": {
      "ma5": 16.23,
      "ma10": 16.05,
      "ma20": 15.89,
      "rsi": 65.4,
      "macd": 0.12
    }
  },
  "message": "获取股票详情成功"
}
```

### 7.3 获取K线数据
```
GET /api/v1/stocks/{stockCode}/kline
```

**查询参数**：
- `interval`：时间间隔（1m, 5m, 15m, 30m, 1h, 1d, 1w, 1M）
- `startTime`：开始时间（ISO格式）
- `endTime`：结束时间（ISO格式）
- `limit`：数据条数（默认100）

**响应**：
```json
{
  "success": true,
  "data": {
    "stockCode": "000001",
    "stockName": "平安银行",
    "interval": "1d",
    "kline": [
      {
        "time": "2026-02-02T00:00:00Z",
        "open": 16.10,
        "high": 16.65,
        "low": 16.05,
        "close": 16.50,
        "volume": 12345678,
        "amount": 203765432.10
      }
    ]
  },
  "message": "获取K线数据成功"
}
```

### 7.4 获取实时行情
```
GET /api/v1/stocks/{stockCode}/realtime
```

**响应**：
```json
{
  "success": true,
  "data": {
    "stockCode": "000001",
    "stockName": "平安银行",
    "price": 16.50,
    "change": 0.45,
    "changePercent": 2.80,
    "volume": 12345678,
    "amount": 203765432.10,
    "timestamp": "2026-02-02T10:30:00.123Z",
    "bidAsk": {
      "bid1": { "price": 16.49, "volume": 500 },
      "bid2": { "price": 16.48, "volume": 800 },
      "ask1": { "price": 16.51, "volume": 300 },
      "ask2": { "price": 16.52, "volume": 600 }
    }
  },
  "message": "获取实时行情成功"
}
```

## 8. AI决策API

### 8.1 请求AI决策
```
POST /api/v1/ai/decisions
```

**请求体**：
```json
{
  "accountId": 1,
  "action": "analyze",  // analyze, trade
  "data": {
    "stockCode": "000001",
    "currentPrice": 16.50,
    "position": {
      "quantity": 1000,
      "avgCost": 15.23
    },
    "marketContext": {
      "marketTrend": "up",
      "sectorPerformance": "neutral"
    }
  }
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "decisionId": "dec_1234567890",
    "accountId": 1,
    "action": "analyze",
    "recommendation": "hold",
    "confidence": 0.78,
    "reasoning": "基于技术分析，该股票目前处于上升通道，但RSI指标显示超买，建议持有观望。",
    "riskLevel": "medium",
    "analysis": {
      "technical": "MACD金叉，但RSI超买",
      "fundamental": "市盈率合理，股息率有吸引力",
      "sentiment": "市场情绪偏乐观"
    },
    "suggestedActions": [
      {
        "action": "hold",
        "targetPrice": 17.00,
        "stopLoss": 15.80
      }
    ],
    "processingTime": 2450,
    "modelUsed": "openai_gpt4",
    "createdAt": "2026-02-02T10:30:00Z"
  },
  "message": "AI决策生成成功"
}
```

### 8.2 获取AI决策历史
```
GET /api/v1/ai/decisions
```

**查询参数**：
- `accountId`：AI账户ID
- `action`：决策类型
- `startDate`：开始日期
- `endDate`：结束日期
- `page`：页码
- `limit`：每页数量

### 8.3 获取决策详情
```
GET /api/v1/ai/decisions/{decisionId}
```

## 9. 排行榜API

### 9.1 获取排行榜
```
GET /api/v1/rankings
```

**查询参数**：
- `period`：统计周期（daily, weekly, monthly, total）
- `date`：统计日期（YYYY-MM-DD格式）
- `metric`：排名指标（return, sharpe, winRate）
- `page`：页码
- `limit`：每页数量

**响应**：
```json
{
  "success": true,
  "data": {
    "period": "weekly",
    "date": "2026-02-02",
    "rankings": [
      {
        "rank": 1,
        "accountId": 45,
        "accountName": "量化之王",
        "userName": "quant_master",
        "totalReturn": 12.34,
        "annualizedReturn": 156.78,
        "sharpeRatio": 2.34,
        "maxDrawdown": -3.45,
        "winRate": 78.9,
        "totalTrades": 23,
        "totalVolume": 456789.00
      }
    ],
    "myRanking": {
      "rank": 15,
      "accountId": 1,
      "accountName": "保守型AI",
      "totalReturn": 5.67,
      "annualizedReturn": 89.01,
      "sharpeRatio": 1.23,
      "maxDrawdown": -4.56,
      "winRate": 65.4,
      "totalTrades": 12,
      "totalVolume": 123456.00
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  },
  "message": "获取排行榜成功"
}
```

## 10. WebSocket接口

### 10.1 连接建立
```
ws://localhost:3001/ws
```

**连接参数**：
```javascript
const socket = io('http://localhost:3001', {
  auth: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

### 10.2 事件订阅
```javascript
// 订阅事件
socket.emit('subscribe', {
  channels: ['market', 'trades', 'portfolio', 'decisions']
});

// 订阅特定股票
socket.emit('subscribe:stock', {
  stockCodes: ['000001', '000002', '600000']
});
```

### 10.3 事件类型

#### 10.3.1 市场数据更新
```json
{
  "event": "market:update",
  "data": {
    "stockCode": "000001",
    "price": 16.50,
    "change": 0.45,
    "changePercent": 2.80,
    "volume": 12345678,
    "amount": 203765432.10,
    "timestamp": "2026-02-02T10:30:00.123Z"
  }
}
```

#### 10.3.2 交易执行通知
```json
{
  "event": "trade:executed",
  "data": {
    "tradeId": 123,
    "accountId": 1,
    "accountName": "保守型AI",
    "stockCode": "000001",
    "stockName": "平安银行",
    "tradeType": "buy",
    "quantity": 1000,
    "price": 15.23,
    "amount": 15230.00,
    "status": "executed",
    "executedAt": "2026-02-02T10:15:30Z"
  }
}
```

#### 10.3.3 AI决策通知
```json
{
  "event": "ai:decision",
  "data": {
    "decisionId": "dec_1234567890",
    "accountId": 1,
    "accountName": "保守型AI",
    "recommendation": "hold",
    "confidence": 0.78,
    "reasoning": "基于技术分析，建议持有观望...",
    "riskLevel": "medium",
    "createdAt": "2026-02-02T10:30:00Z"
  }
}
```

#### 10.3.4 持仓更新
```json
{
  "event": "portfolio:update",
  "data": {
    "accountId": 1,
    "totalValue": 108765.43,
    "totalProfitLoss": 8765.43,
    "totalProfitLossRate": 8.76,
    "positions": [
      {
        "stockCode": "000001",
        "quantity": 1000,
        "marketValue": 16500.00,
        "profitLoss": 1270.00
      }
    ],
    "timestamp": "2026-02-02T10:30:00Z"
  }
}
```

#### 10.3.5 系统通知
```json
{
  "event": "system:notification",
  "data": {
    "type": "info",  // info, warning, error
    "title": "系统维护通知",
    "message": "系统将于今晚23:00-01:00进行维护",
    "timestamp": "2026-02-02T10:30:00Z"
  }
}
```

### 10.4 心跳机制
```javascript
// 服务器每30秒发送心跳
{
  "event": "heartbeat",
  "data": {
    "timestamp": "2026-02-02T10:30:00Z"
  }
}

// 客户端响应心跳
socket.emit('heartbeat:ack', {
  timestamp: Date.now()
});
```

## 11. 服务间API（Node.js ↔ Python AI服务）

### 11.1 AI决策请求
```
POST http://ai-service:8000/api/v1/decisions
```

**请求头**：
```
X-API-Key: {service_api_key}
Content-Type: application/json
```

**请求体**：
```json
{
  "request_id": "req_1234567890",
  "account_id": 1,
  "model_type": "openai_gpt4",
  "prompt_template": "trading_analysis_v1",
  "input_data": {
    "stock_data": {
      "code": "000001",
      "name": "平安银行",
      "current_price": 16.50,
      "historical_prices": [
        {"time": "2026-02-01", "close": 16.05},
        {"time": "2026-02-02", "close": 16.50}
      ],
      "technical_indicators": {
        "ma5": 16.23,
        "ma10": 16.05,
        "rsi": 65.4
      }
    },
    "portfolio_data": {
      "current_positions": [
        {"stock_code": "000001", "quantity": 1000, "avg_cost": 15.23}
      ],
      "cash_balance": 105432.10,
      "total_value": 108765.43
    },
    "market_context": {
      "market_trend": "up",
      "sector_performance": "neutral",
      "economic_indicators": {
        "cpi": 2.1,
        "interest_rate": 3.5
      }
    },
    "trading_constraints": {
      "max_position_size": 0.2,
      "stop_loss": 0.03,
      "take_profit": 0.1
    }
  },
  "config": {
    "temperature": 0.7,
    "max_tokens": 1000,
    "timeout": 30000
  }
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "request_id": "req_1234567890",
    "decision": {
      "recommendation": "hold",
      "confidence": 0.78,
      "reasoning": "基于技术分析，该股票目前处于上升通道，但RSI指标显示超买，建议持有观望。",
      "risk_assessment": {
        "level": "medium",
        "factors": ["RSI超买", "市场波动性增加"]
      },
      "analysis": {
        "technical": "MACD金叉，但RSI超买，短期可能有回调压力",
        "fundamental": "市盈率8.23倍，低于行业平均，股息率2.34%有吸引力",
        "sentiment": "市场情绪偏乐观，但需关注政策风险"
      },
      "suggested_actions": [
        {
          "action": "hold",
          "target_price": 17.00,
          "stop_loss": 15.80,
          "time_horizon": "1-2周"
        }
      ]
    },
    "metadata": {
      "model_used": "openai_gpt4",
      "prompt_version": "trading_analysis_v1",
      "processing_time_ms": 2450,
      "api_cost_usd": 0.0123,
      "tokens_used": 456
    }
  },
  "error": null,
  "timestamp": "2026-02-02T10:30:00Z"
}
```

### 11.2 AI服务健康检查
```
GET http://ai-service:8000/api/v1/health
```

**响应**：
```json
{
  "status": "healthy",
  "timestamp": "2026-02-02T10:30:00Z",
  "services": {
    "openai": "available",
    "claude": "available",
    "wenxin": "available",
    "qwen": "available"
  },
  "metrics": {
    "total_requests": 12345,
    "success_rate": 99.8,
    "avg_response_time_ms": 2345
  }
}
```

### 11.3 批量决策请求
```
POST http://ai-service:8000/api/v1/decisions/batch
```

**请求体**：
```json
{
  "requests": [
    {
      "request_id": "req_1",
      "account_id": 1,
      "model_type": "openai_gpt4",
      "input_data": { ... }
    },
    {
      "request_id": "req_2",
      "account_id": 2,
      "model_type": "claude",
      "input_data": { ... }
    }
  ],
  "config": {
    "concurrency": 5,
    "timeout": 60000
  }
}
```

## 12. 数据服务API

### 12.1 数据采集状态
```
GET http://data-service:8001/api/v1/status
```

**响应**：
```json
{
  "status": "running",
  "last_update": "2026-02-02T10:30:00Z",
  "data_sources": {
    "sina": {
      "status": "active",
      "last_success": "2026-02-02T10:29:30Z",
      "success_rate": 99.5
    },
    "tencent": {
      "status": "active",
      "last_success": "2026-02-02T10:29:45Z",
      "success_rate": 98.7
    }
  },
  "metrics": {
    "stocks_updated": 4500,
    "update_frequency_seconds": 60,
    "data_latency_seconds": 3
  }
}
```

### 12.2 触发数据更新
```
POST http://data-service:8001/api/v1/update
```

**请求体**：
```json
{
  "stock_codes": ["000001", "000002", "600000"],
  "force": false
}
```

## 13. 速率限制

### 13.1 限制规则
- **认证API**：10次/分钟/IP
- **交易API**：30次/分钟/用户
- **数据查询API**：60次/分钟/用户
- **AI决策API**：20次/分钟/用户
- **WebSocket连接**：10次/分钟/IP

### 13.2 速率限制响应头
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1672531200
Retry-After: 30
```

## 14. 错误码定义

### 14.1 通用错误码
- `AUTH_001`：认证失败
- `AUTH_002`：令牌过期
- `AUTH_003`：权限不足
- `VALIDATION_001`：请求参数验证失败
- `VALIDATION_002`：数据格式错误
- `RATE_LIMIT_001`：请求过于频繁
- `NOT_FOUND_001`：资源不存在
- `DATABASE_001`：数据库操作失败
- `EXTERNAL_001`：外部服务调用失败

### 14.2 业务错误码
- `TRADING_001`：资金不足
- `TRADING_002`：股票不可交易
- `TRADING_003`：交易时间限制
- `AI_001`：AI服务不可用
- `AI_002`：AI决策超时
- `AI_003`：AI模型配额不足
- `DATA_001`：数据源不可用
- `DATA_002`：数据延迟过高

---

*文档版本：v1.0*
*创建日期：2026-02-02*
*最后更新：2026-02-02*
*维护者：架构设计智能体*