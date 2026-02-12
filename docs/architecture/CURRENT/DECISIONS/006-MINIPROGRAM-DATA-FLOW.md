# Miniprogram 数据流优化方案分析

> 分析收益计算和实时行情分离的最佳实践，平衡后端负载与数据安全。
>
> **文档版本**: v1.0
> **分析日期**: 2026-02-11
> **分析场景**: AI账户收益实时展示的数据流设计

---

## 目录

1. [需求场景分析](#一需求场景分析)
2. [方案对比分析](#二方案对比分析)
3. [推荐方案设计](#三推荐方案设计)
4. [实施建议](#四实施建议)

---

## 一、需求场景分析

### 1.1 用户场景

用户在微信小程序中查看AI账户时，需要实时看到：

| 数据类型 | 更新频率 | 计算复杂度 | 敏感度 |
|----------|----------|------------|--------|
| **实时股价** | 10秒 | 低（仅展示） | 低 |
| **当日涨跌幅** | 10秒 | 低（当前价-昨收）| 低 |
| **持仓总市值** | 10秒 | 中（Σ持仓×当前价）| 中 |
| **累计收益率** | 交易时更新 | 高（需历史成本）| **高** |
| **累计收益金额** | 交易时更新 | 高（当前市值-成本）| **高** |
| **收益曲线** | 每分钟 | 高（时间序列计算）| **高** |
| **排名数据** | 5分钟 | 高（全账户排序）| 中 |

### 1.2 关键约束

- **数据安全**: 累计收益涉及用户资产，计算逻辑不应暴露给前端
- **实时性**: 股价需要近实时（<10秒延迟）
- **一致性**: 收益数据必须准确，不能出现前端计算与后端不一致
- **网络开销**: 小程序网络不稳定，减少请求次数

---

## 二、方案对比分析

### 方案A：混合分离方案（推荐）

**数据流设计**:
```
┌─────────────────────────────────────────────────────────────┐
│                     方案A：混合分离                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   实时行情流（高频、低计算）                                  │
│   ┌──────────┐         ┌──────────────┐                    │
│   │ Market   │ ──────► │ Miniprogram  │  WebSocket/SSE     │
│   │ Data     │  10秒   │ (展示层)     │  直接连接          │
│   └──────────┘         └──────────────┘                    │
│        │                          ▲                        │
│        │ 原始行情数据              │ 实时股价/涨跌幅         │
│        ▼                          │                        │
│   ┌──────────┐         ┌──────────────┐                    │
│   │ Backend  │ ◄────── │ Miniprogram  │  HTTP API          │
│   │ (计算层) │ 收益数据│ (请求层)     │  按需查询          │
│   └──────────┘         └──────────────┘                    │
│        ▲                                                   │
│        │ 持仓数据+历史成本                                  │
│        │                                                   │
│   ┌──────────┐                                            │
│   │ PostgreSQL│  账户持仓、交易记录、成本计算               │
│   └──────────┘                                            │
│                                                              │
│   收益计算流（低频、高计算、高敏感）                          │
└─────────────────────────────────────────────────────────────┘
```

**职责划分**:

| 服务 | 职责 | 数据 |
|------|------|------|
| **Market Data** | 推送实时行情 | 股票代码、当前价、涨跌幅、成交量 |
| **Backend** | 计算收益数据 | 累计收益率、收益金额、收益曲线、排名 |
| **Miniprogram** | 展示+简单聚合 | 实时股价展示、收益数据展示 |

**优点**:
1. ✅ **安全性高** - 收益计算逻辑和成本数据在Backend，不暴露给前端
2. ✅ **实时性好** - 行情直接推送到前端，无需经过Backend中转
3. ✅ **负载均衡** - Backend只处理收益计算（交易时触发），Market Data处理高频行情
4. ✅ **一致性强** - 收益数据由Backend单一源头计算，不会前后端不一致

**缺点**:
1. ⚠️ 需要两条数据通道（WebSocket/SSE + HTTP）
2. ⚠️ 小程序端需要合并两套数据

---

### 方案B：前端计算方案（不推荐）

**数据流设计**:
```
┌─────────────────────────────────────────────────────────────┐
│                     方案B：前端计算                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Miniprogram ──► Backend ──► 获取持仓列表+成本数据         │
│       │                                              │      │
│       │◄─────────────────────────────────────────────┘      │
│       │  持仓数据+成本                                       │
│       │                                                     │
│       ▼                                                     │
│   本地计算收益                                               │
│   - 累计收益率 = (市值-成本)/成本                            │
│   - 收益曲线计算                                             │
│                                                              │
│   Market Data ──► Miniprogram  实时行情                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**优点**:
1. ✅ Backend负载最低，只提供原始数据
2. ✅ 计算分散到各个客户端

**缺点**:
1. ❌ **安全风险** - 成本数据暴露给前端，用户可能通过调试获取他人数据
2. ❌ **数据不一致** - 前端计算可能与Backend不一致，导致用户困惑
3. ❌ **逻辑泄露** - 收益计算规则（如手续费、分红处理）暴露给前端
4. ❌ **复杂度高** - 时间序列计算（收益曲线）在前端实现复杂
5. ❌ **网络开销大** - 需要下载完整的持仓和交易历史才能计算

**风险评估**: 🔴 **高风险** - 涉及用户资产数据安全，不推荐

---

### 方案C：Backend全托管方案（备选）

**数据流设计**:
```
┌─────────────────────────────────────────────────────────────┐
│                     方案C：Backend全托管                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Market Data ──► Backend ──► Miniprogram                   │
│       │              │                                      │
│       │ 行情数据      │ 合并数据（行情+收益）                 │
│       │              │ 统一WebSocket推送                     │
│       ▼              ▼                                      │
│   Backend订阅行情，计算持仓市值变化后统一推送给前端           │
│                                                              │
│   优点：数据一致性最好，前端最简单                            │
│   缺点：Backend成为瓶颈，所有数据都经过中转                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**优点**:
1. ✅ 数据一致性最好
2. ✅ 前端实现最简单，只需一个WebSocket连接

**缺点**:
1. ❌ Backend负载高，需要处理所有行情数据中转
2. ❌ 延迟增加（Market Data → Backend → Miniprogram）
3. ❌ 违背了解耦初衷

---

## 三、推荐方案设计

### 3.1 推荐：方案A（混合分离）

**理由**:
1. **安全优先** - 涉及用户资产的数据必须由Backend计算
2. **性能平衡** - 高频低敏数据直连，低频高敏数据经Backend
3. **职责清晰** - Market Data专注行情，Backend专注业务计算

### 3.2 详细接口设计

#### 3.2.1 Market Data → Miniprogram 实时行情

```yaml
# WebSocket 连接
wss://market-data-service.example.com/ws/public/quotes

# 订阅消息（小程序发送）
{
  "action": "subscribe",
  "symbols": ["000001.SZ", "000002.SZ", "300750.SZ"]  // AI账户持仓股票
}

# 推送消息（10秒间隔）
{
  "type": "quote_update",
  "timestamp": "2026-02-11T10:30:00Z",
  "data": [
    {
      "symbol": "000001.SZ",
      "name": "平安银行",
      "current": 12.58,
      "change": 0.29,
      "change_percent": 2.35,
      "volume": 152300000,
      "turnover": 1915900000
    }
  ]
}
```

**特点**:
- 公开WebSocket端点，无需认证（行情数据公开）
- 只推送订阅的股票，减少带宽
- 10秒推送一次，与Market Data采集频率一致

#### 3.2.2 Backend → Miniprogram 收益数据

```yaml
# HTTP API（查询时调用）
GET /api/ai-accounts/{id}/performance

# 响应
{
  "account_id": "acc_123456",
  "summary": {
    "total_assets": 125800.50,        # 当前总资产
    "initial_capital": 100000.00,     # 初始资金
    "total_return": 25800.50,         # 累计收益金额
    "total_return_rate": 25.80,       # 累计收益率(%)
    "daily_return": 1200.00,          # 当日收益
    "daily_return_rate": 0.96         # 当日收益率(%)
  },
  "curve": [                          # 收益曲线（近30天）
    {"date": "2026-01-12", "rate": 20.5},
    {"date": "2026-01-13", "rate": 21.2},
    # ...
    {"date": "2026-02-11", "rate": 25.8}
  ],
  "ranking": {
    "current_rank": 15,               # 当前排名
    "total_accounts": 1000,           # 总账户数
    "top_percentile": 1.5             # 超过98.5%的用户
  },
  "holdings": [                       # 持仓列表（带成本）
    {
      "symbol": "000001.SZ",
      "name": "平安银行",
      "quantity": 1000,
      "avg_cost": 12.20,              # 平均成本（Backend计算）
      "current_price": 12.58,         # 当前价（Backend缓存Market Data数据）
      "market_value": 12580.00,
      "return": 380.00,
      "return_rate": 3.11
    }
  ],
  "last_updated": "2026-02-11T10:30:00Z"
}
```

**特点**:
- 需要JWT认证（敏感数据）
- Backend缓存Market Data行情数据（5秒TTL）
- 持仓列表中的当前价由Backend填充，确保与收益计算一致

#### 3.2.3 数据合并策略（小程序端）

```typescript
// 小程序端数据管理（Pinia Store）
const useAIAccountStore = defineStore('aiAccount', {
  state: () => ({
    // WebSocket实时数据（Market Data直连）
    realtimeQuotes: {},  // { "000001.SZ": { current: 12.58, change_percent: 2.35 } }

    // HTTP查询数据（Backend提供）
    performanceData: null,  // 收益数据（含持仓成本）
    lastFetchTime: null
  }),

  getters: {
    // 合并后的持仓列表（实时股价 + 成本数据）
    holdingsWithRealtime(): Holding[] {
      if (!this.performanceData) return []

      return this.performanceData.holdings.map(holding => {
        const realtime = this.realtimeQuotes[holding.symbol]
        if (realtime) {
          // 使用实时行情更新当前价和计算
          const currentPrice = realtime.current
          const marketValue = currentPrice * holding.quantity
          const returnAmount = marketValue - (holding.avg_cost * holding.quantity)
          const returnRate = (returnAmount / (holding.avg_cost * holding.quantity)) * 100

          return {
            ...holding,
            current_price: currentPrice,
            change_percent: realtime.change_percent,
            market_value: marketValue,
            return: returnAmount,
            return_rate: returnRate
          }
        }
        return holding
      })
    },

    // 实时持仓总市值
    realtimeTotalAssets(): number {
      return this.holdingsWithRealtime.reduce((sum, h) => sum + h.market_value, 0)
    },

    // 实时当日收益（基于实时市值重新计算）
    realtimeDailyReturn(): number {
      const yesterdayAssets = this.performanceData?.summary?.yesterday_assets || 0
      return this.realtimeTotalAssets - yesterdayAssets
    }
  },

  actions: {
    // 初始化WebSocket连接（Market Data）
    initRealtimeQuotes(symbols: string[]) {
      const ws = new WebSocket('wss://market-data-service.example.com/ws/public/quotes')
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.type === 'quote_update') {
          message.data.forEach(quote => {
            this.realtimeQuotes[quote.symbol] = quote
          })
        }
      }
      ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'subscribe', symbols }))
      }
    },

    // 获取收益数据（Backend）
    async fetchPerformance(accountId: string) {
      const response = await fetch(`/api/ai-accounts/${accountId}/performance`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      this.performanceData = await response.json()
      this.lastFetchTime = Date.now()
    }
  }
})
```

**合并逻辑**:
1. 成本数据来自Backend（安全，不变）
2. 实时股价来自Market Data WebSocket（快速，10秒更新）
3. 小程序端实时计算市值和收益（轻量计算）
4. 每分钟重新查询Backend获取准确的累计收益

### 3.3 数据一致性保障

| 场景 | 处理策略 |
|------|----------|
| **WebSocket断开** | 使用Backend缓存的行情数据（可能延迟5秒） |
| **Backend查询延迟** | 显示"数据更新中"，使用上次缓存数据 |
| **价格跳变** | WebSocket推送后立即更新，无需等待Backend |
| **交易发生后** | 立即查询Backend获取最新持仓和收益 |

### 3.4 成本收益分析

| 指标 | 优化前（全走Backend） | 优化后（方案A） | 提升 |
|------|----------------------|-----------------|------|
| **Backend QPS** | 500/秒（轮询行情） | 50/秒（仅收益查询） | **-90%** |
| **行情延迟** | 500ms（Backend中转） | 50ms（直连） | **-90%** |
| **前端复杂度** | 低（单一数据源） | 中（需要合并数据） | 可接受 |
| **数据安全性** | 高 | 高 | 一致 |
| **实现成本** | 低 | 中（2天） | 可接受 |

---

## 四、实施建议

### 4.1 实施步骤

**Phase 1: Market Data开放WebSocket（1天）**
- [ ] 启用预留的WebSocket接口
- [ ] 实现公开行情推送（无需认证）
- [ ] 支持股票代码订阅/取消订阅

**Phase 2: Backend优化收益接口（1天）**
- [ ] `/api/ai-accounts/{id}/performance` 接口优化
- [ ] 缓存Market Data行情数据（5秒TTL）
- [ ] 持仓列表填充当前价

**Phase 3: 小程序端实现（1天）**
- [ ] 实现WebSocket连接管理
- [ ] 实现数据合并逻辑（Pinia Store）
- [ ] UI适配（实时价格高亮变化）

### 4.2 风险缓解

| 风险 | 缓解措施 |
|------|----------|
| WebSocket不稳定 | 实现自动重连，降级到HTTP轮询 |
| 数据不一致 | 关键数据（累计收益）只信任Backend |
| 首次加载慢 | 先展示Backend数据，WebSocket连接后更新实时价 |

### 4.3 后续优化

- **边缘计算**: 如果Backend负载仍高，可考虑将排名计算独立为 Ranking Service
- **数据预取**: 小程序启动时预加载用户关注的AI账户数据
- **增量更新**: Backend只推送变化的数据，减少传输量

---

## 五、结论

**推荐方案：方案A（混合分离）**

理由：
1. **安全性** - 成本数据和收益计算逻辑不暴露给前端
2. **实时性** - 行情数据直连，延迟从500ms降至50ms
3. **负载均衡** - Backend负载降低90%
4. **可维护性** - 职责清晰，Market Data专注行情，Backend专注业务

虽然前端需要处理数据合并，但这是合理的权衡。收益数据的准确性比开发便利性更重要。

---

*文档版本: v1.0*
*分析日期: 2026-02-11*
*维护者: 首席架构师*
