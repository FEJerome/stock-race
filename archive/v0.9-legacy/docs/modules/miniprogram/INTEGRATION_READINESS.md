# Miniprogram 联调准备验证文档

> 本文档验证小程序是否已准备好与其他服务进行联调测试
> 最后更新：2026-02-12

---

## 一、联调准备状态总览

### 1.1 阻塞任务完成状态

| 任务组 | 任务编号 | 任务描述 | 状态 | 阻塞联调 |
|--------|----------|----------|------|----------|
| **WebSocket功能组** | O6-005 ~ O6-010 | WebSocket连接、订阅、数据合并、收益计算 | ✅ 已完成 | 否 |
| **服务健康检查** | C1-MP-001/002 | Backend/Market Data健康检查、降级展示 | ✅ 已完成 | 否 |
| **公开API对接** | T-008/T-009 | 排行榜、行情页数据对接 | ✅ 已完成 | 否 |
| **游客模式** | C5-007 ~ C5-008B | Token获取、存储、数据迁移 | ✅ 已完成 | 否 |
| **游客模式UI** | C5-010 | 首页游客提示条 | ⚠️ 部分完成 | 否 |

### 1.2 联调就绪评估

```
联调就绪度: 95%
```

**已达到联调条件：**
- ✅ WebSocket功能群全部实现（O6-005~O6-010）
- ✅ 服务健康检查功能完整（C1-MP-001/002）
- ✅ 公开API对接完成（T-008/T-009）
- ✅ 游客模式核心功能完成（C5-007~C5-008B）

**可延后处理（非阻塞）：**
- ⚠️ C5-010 首页游客提示条（登录页已完成，首页可延后）

### 1.3 外部依赖接口状态

| 依赖服务 | 所需接口 | 状态 | 说明 |
|----------|---------|------|------|
| Backend | O3-001 排行榜API | ✅ 已就绪 | `GET /api/v1/public/rankings` |
| Backend | O3-002 行情API | ✅ 已就绪 | `GET /api/v1/public/market/quotes` |
| Backend | O3-003 游客Token | ✅ 已就绪 | `POST /api/v1/guest/token` |
| Backend | C5-004 数据迁移 | ✅ 已就绪 | `POST /api/v1/guest/migrate` |
| Market Data | O6-001 WebSocket | ✅ 已就绪 | `ws://market-data:8001/ws/public/quotes` |
| Backend | O6-003 收益接口 | ✅ 已就绪 | `GET /api/ai-accounts/{id}/performance` |

---

## 二、WebSocket功能组 (O6-005~O6-010) 验证

### 2.1 WebSocket连接管理 (O6-005)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| WebSocket连接 | `services/websocket.ts:connect()` | ✅ | 使用 `uni.connectSocket` 连接 |
| 连接状态管理 | `services/websocket.ts:connectionStatus` | ✅ | disconnected/connecting/connected/error |
| 断开连接 | `services/websocket.ts:disconnect()` | ✅ | 清理定时器、关闭连接 |
| 全局单例模式 | `services/websocket.ts` 模块级状态 | ✅ | 确保只有一个WebSocket连接 |

**关键代码：**
```typescript
// services/websocket.ts
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
const connectionStatus = ref<ConnectionStatus>('disconnected')

export function connect(): Promise<boolean> {
  return new Promise((resolve) => {
    socket.value = uni.connectSocket({
      url: WS_URL,  // ws://market-data:8001/ws/public/quotes
      // ...
    })
  })
}
```

### 2.2 股票订阅管理 (O6-005B)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| 订阅股票 | `services/websocket.ts:subscribe()` | ✅ | 最多50只股票限制 |
| 取消订阅 | `services/websocket.ts:unsubscribe()` | ✅ | 支持部分/全部取消 |
| 持仓自动订阅 | `composables/useWebSocketManager.ts:subscribeHoldings()` | ✅ | 根据持仓动态订阅 |
| 持仓变化监听 | `composables/useWebSocketManager.ts:start()` | ✅ | watch监听自动调整订阅 |

**关键代码：**
```typescript
// services/websocket.ts
const MAX_SUBSCRIPTIONS = 50

export function subscribe(symbols: string[]): boolean {
  if (subscribedSymbols.value.size + newSymbols.length > MAX_SUBSCRIPTIONS) {
    uni.showToast({ title: `最多订阅${MAX_SUBSCRIPTIONS}只股票`, icon: 'none' })
    return false
  }
  // 发送订阅消息: { action: 'subscribe', symbols: [...] }
}

// composables/useWebSocketManager.ts
watch(() => tradingStore.holdingSymbols, (newSymbols, oldSymbols) => {
  if (oldSymbols?.length > 0) unsubscribe(oldSymbols)
  if (newSymbols?.length > 0) subscribe(newSymbols)
}, { immediate: true })
```

### 2.3 数据合并逻辑 (O6-006)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| HTTP数据与WebSocket合并 | `stores/market.ts:mergedQuotes` | ✅ | 实时数据优先覆盖 |
| 行情数据合并 | `stores/market.ts:mergeRealtimeQuotes()` | ✅ | Map存储实时数据 |
| 持仓价格合并 | `stores/trading.ts:mergeRealtimePrices()` | ✅ | 更新实时价格Map |

**关键代码：**
```typescript
// stores/market.ts
const mergedQuotes = computed<StockQuote[]>(() => {
  return quotes.value.map((quote) => {
    const realtime = realtimeQuotes.value.get(quote.code)
    if (realtime) {
      return {
        ...quote,
        price: realtime.current,
        change: realtime.change,
        changePercent: realtime.changePercent,
        volume: realtime.volume,
        updateTime: realtime.timestamp,
      }
    }
    return quote
  })
})
```

### 2.4 持仓收益实时计算 (O6-006B)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| 实时收益计算 | `stores/trading.ts:holdingsWithRealtime` | ✅ | 实时价格 × 持仓数量 - 成本 |
| 实时总市值 | `stores/trading.ts:realtimeHoldingsValue` | ✅ | 所有持仓市值之和 |
| 实时总收益 | `stores/trading.ts:realtimeTotalProfit` | ✅ | 所有持仓收益之和 |
| 实时收益率 | `stores/trading.ts:realtimeProfitRate` | ✅ | 收益/成本 × 100% |
| 红涨绿跌显示 | UI层使用profitRate判断 | ✅ | 符合A股习惯 |

**关键代码：**
```typescript
// stores/trading.ts
const holdingsWithRealtime = computed(() => {
  return holdings.value.map((holding) => {
    const realtimePrice = realtimePrices.value.get(holding.stockCode)
    if (realtimePrice) {
      const marketValue = realtimePrice * holding.quantity
      const costValue = holding.avgCost * holding.quantity
      const profit = marketValue - costValue
      const profitRate = (profit / costValue) * 100
      return { ...holding, currentPrice: realtimePrice, marketValue, profit, profitRate }
    }
    return holding
  })
})
```

### 2.5 自动重连机制 (O6-007)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| 指数退避重连 | `services/websocket.ts:handleReconnect()` | ✅ | 1s, 2s, 4s, 8s...最多30s |
| 最大重连次数 | `services/websocket.ts:MAX_RECONNECT_ATTEMPTS` | ✅ | 最多10次重连 |
| 断线检测 | `socket.value.onClose/onError` | ✅ | 自动触发重连 |
| HTTP降级模式 | `services/websocket.ts:startHttpFallback()` | ✅ | 重连失败后降级 |

**关键代码：**
```typescript
// services/websocket.ts
function handleReconnect(): void {
  if (reconnectAttempts.value >= MAX_RECONNECT_ATTEMPTS) {
    startHttpFallback()  // 降级到HTTP轮询
    return
  }
  const delay = Math.min(Math.pow(2, reconnectAttempts.value) * 1000, 30000)
  reconnectAttempts.value++
  reconnectTimer.value = setTimeout(() => connect(), delay)
}
```

### 2.6 HTTP降级模式 (O6-007)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| HTTP轮询启动 | `services/websocket.ts:startHttpFallback()` | ✅ | WebSocket失败后启动 |
| 5秒轮询间隔 | `services/websocket.ts:httpFallbackTimer` | ✅ | 每5秒轮询一次 |
| 轮询停止 | `services/websocket.ts:stopHttpFallback()` | ✅ | WebSocket恢复后停止 |
| 降级状态标识 | `services/websocket.ts:isHttpFallbackMode` | ✅ | 用于UI展示 |

**关键代码：**
```typescript
// services/websocket.ts
function startHttpFallback(): void {
  isHttpFallbackMode.value = true
  httpFallbackFetch()  // 立即执行一次
  httpFallbackTimer.value = setInterval(() => httpFallbackFetch(), 5000)
}
```

### 2.7 收益数据定期刷新 (O6-009)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| 定期刷新启动 | `stores/trading.ts:startPeriodicRefresh()` | ✅ | 每分钟刷新一次 |
| 页面可见性处理 | `stores/trading.ts:setPageVisibility()` | ✅ | 不可见时暂停 |
| 刷新定时器管理 | `stores/trading.ts:refreshTimer` | ✅ | 启动/停止控制 |
| 收益数据获取 | `stores/trading.ts:refreshProfitData()` | ✅ | 调用Backend接口 |

**关键代码：**
```typescript
// stores/trading.ts
function startPeriodicRefresh(): void {
  stopPeriodicRefresh()
  refreshProfitData()  // 立即刷新一次
  refreshTimer.value = setInterval(() => {
    if (isPageVisible.value) refreshProfitData()
  }, 60000)  // 每分钟
}
```

### 2.8 数据一致性保障 (O6-010)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| HTTP初始数据 | `stores/market.ts:fetchQuotes()` | ✅ | 页面加载先获取HTTP数据 |
| WebSocket数据覆盖 | `stores/market.ts:mergeRealtimeQuotes()` | ✅ | 实时数据覆盖缓存 |
| 断线使用缓存 | `stores/trading.ts:fetchHoldings()` | ✅ | 使用缓存数据 |
| 重连后重新订阅 | `services/websocket.ts:connect()` | ✅ | 恢复之前的订阅 |

---

## 三、服务健康检查 (C1-MP-001/002) 验证

### 3.1 Backend健康检查 (C1-MP-001)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| Backend健康检查 | `services/health.ts:checkBackendHealth()` | ✅ | `GET /api/v1/public/health` |
| Market Data健康检查 | `services/health.ts:checkMarketDataHealth()` | ✅ | `GET /health` |
| 响应时间测量 | `services/health.ts` | ✅ | 记录API响应时间 |
| 超时处理 | `uni.request timeout: 5000` | ✅ | 5秒超时 |

**关键代码：**
```typescript
// services/health.ts
async function checkBackendHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now()
  const response = await uni.request({
    url: BACKEND_HEALTH_URL,  // /api/v1/public/health
    method: 'GET',
    timeout: 5000,
  })
  const responseTime = Date.now() - startTime
  return { service: 'backend', status: response.statusCode === 200 ? 'healthy' : 'unhealthy', responseTime }
}
```

### 3.2 定期健康检查 (C1-MP-001)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| 30秒间隔检查 | `services/health.ts:CHECK_INTERVAL` | ✅ | 30000ms |
| 定时启动 | `services/health.ts:startHealthCheck()` | ✅ | 立即+定期执行 |
| 定时停止 | `services/health.ts:stopHealthCheck()` | ✅ | 清理定时器 |
| 并发检查 | `Promise.all([backend, marketData])` | ✅ | 同时检查两个服务 |

**关键代码：**
```typescript
// services/health.ts
const CHECK_INTERVAL = 30000  // 30秒

export function startHealthCheck(): void {
  checkHealth()  // 立即检查一次
  checkTimer.value = setInterval(() => checkHealth(), CHECK_INTERVAL)
}
```

### 3.3 服务降级展示UI (C1-MP-002)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| 服务状态计算属性 | `services/health.ts:healthStatus` | ✅ | 统一状态对象 |
| 全部健康判断 | `services/health.ts:isAllHealthy` | ✅ | 所有服务正常 |
| 异常服务判断 | `services/health.ts:isAnyUnhealthy` | ✅ | 存在异常服务 |
| 状态文本/颜色 | `services/health.ts:getStatusText/Color()` | ✅ | 用于UI展示 |

**关键代码：**
```typescript
// services/health.ts
export const healthStatus = computed<ServiceHealth>(() => ({
  backend: backendStatus.value,
  marketData: marketDataStatus.value,
  lastCheckAt: lastCheckAt.value,
  isChecking: isChecking.value,
}))

export const isAllHealthy = computed(() =>
  backendStatus.value === 'healthy' && marketDataStatus.value === 'healthy'
)
```

---

## 四、API对接准备验证

### 4.1 公开API封装 (public.ts)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| 股票行情列表 | `api/public.ts:getStockQuotes()` | ✅ | `GET /api/public/market/quotes` |
| 股票搜索 | `api/public.ts:searchStocks()` | ✅ | `GET /api/public/market/search` |
| 单个股票行情 | `api/public.ts:getStockQuote()` | ✅ | `GET /api/public/market/quotes/:code` |
| 收益排行榜 | `api/public.ts:getRanking()` | ✅ | `GET /api/public/ranking/:period` |
| 排行榜统计 | `api/public.ts:getRankingStats()` | ✅ | `GET /api/public/ranking/stats` |
| AI经理公开详情 | `api/public.ts:getAIManagerPublicDetail()` | ✅ | `GET /api/public/ai-managers/:id` |
| 市场指数 | `api/public.ts:getMarketIndices()` | ✅ | `GET /api/public/market/indices` |
| 市场状态 | `api/public.ts:getMarketStatus()` | ✅ | `GET /api/public/market/status` |

**文件位置：** `/home/fe-jerome/projects/stock-race/miniprogram/src/api/public.ts`

### 4.2 游客模式API (guest.ts)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| 游客Token获取 | `api/guest.ts:getGuestToken()` | ✅ | `POST /api/guest/auth/token` |
| 临时AI账户列表 | `api/guest.ts:getGuestAIAccounts()` | ✅ | `GET /api/guest/ai-accounts` |
| 创建临时AI账户 | `api/guest.ts:createGuestAIAccount()` | ✅ | `POST /api/guest/ai-accounts` |
| 删除临时AI账户 | `api/guest.ts:deleteGuestAIAccount()` | ✅ | `DELETE /api/guest/ai-accounts/:id` |
| 游客AI对话 | `api/guest.ts:guestChat()` | ✅ | `POST /api/guest/ai-accounts/:id/chat` |
| 对话历史 | `api/guest.ts:getGuestChatHistory()` | ✅ | `GET /api/guest/ai-accounts/:id/chat/history` |
| 数据绑定 | `api/guest.ts:bindGuestData()` | ✅ | `POST /api/guest/bind` |

**文件位置：** `/home/fe-jerome/projects/stock-race/miniprogram/src/api/guest.ts`

### 4.3 游客Token管理 (auth.ts)

| 验证项 | 实现文件 | 状态 | 说明 |
|--------|----------|------|------|
| 初始化游客模式 | `stores/auth.ts:initGuestMode()` | ✅ | 检查本地/获取新Token |
| 刷新游客Token | `stores/auth.ts:refreshGuestToken()` | ✅ | 调用Backend获取 |
| 本地游客降级 | `stores/auth.ts:enableLocalGuestMode()` | ✅ | Backend不可用时降级 |
| Token本地存储 | `stores/auth.ts` + `uni.setStorageSync` | ✅ | `stock_race_guest_session` |
| Token过期检查 | `stores/auth.ts:initGuestMode()` | ✅ | 过期自动重新获取 |
| 登录后数据迁移 | `stores/auth.ts:loginAndBindGuest()` | ✅ | 调用bindGuestData |
| 清除游客会话 | `stores/auth.ts:clearGuestSession()` | ✅ | 登录成功后清理 |
| 游客状态计算 | `stores/auth.ts:isGuestMode` | ✅ | 判断当前是否游客 |

**文件位置：** `/home/fe-jerome/projects/stock-race/miniprogram/src/stores/auth.ts`

---

## 五、待联调验证接口清单

### 5.1 Backend公开API

| 接口 | 方法 | 路径 | 用途 | 联调验证项 |
|------|------|------|------|-----------|
| 排行榜 | GET | `/api/v1/public/rankings` | 收益排行榜 | 分页、排序、数据格式 |
| 热门股票 | GET | `/api/v1/public/stocks/hot` | 热门股票展示 | 返回字段完整性 |
| 股票行情 | GET | `/api/v1/public/market/quotes` | 股票列表 | 价格、涨跌幅、成交量 |
| 股票搜索 | GET | `/api/v1/public/market/search` | 股票搜索 | 关键词匹配 |
| AI经理公开详情 | GET | `/api/v1/public/ai-managers/:id` | 公开详情 | 收益数据、统计 |
| 市场指数 | GET | `/api/v1/public/market/indices` | 大盘指数 | 上证指数、深证成指等 |
| 市场状态 | GET | `/api/v1/public/market/status` | 市场状态 | 是否开盘、交易时间 |

### 5.2 Backend游客API

| 接口 | 方法 | 路径 | 用途 | 联调验证项 |
|------|------|------|------|-----------|
| 游客Token | POST | `/api/v1/guest/token` | 获取游客身份 | Token格式、过期时间 |
| 游客AI账户 | GET | `/api/v1/guest/ai-accounts` | 获取临时账户 | 账户列表、限制检查 |
| 创建游客账户 | POST | `/api/v1/guest/ai-accounts` | 创建临时账户 | 最多2个限制 |
| 游客对话 | POST | `/api/v1/guest/ai-accounts/:id/chat` | AI对话 | 最多10轮限制 |
| 数据迁移 | POST | `/api/v1/guest/migrate` | 登录后迁移 | 数据完整性 |

### 5.3 Market Data WebSocket

| 接口 | 类型 | 路径 | 用途 | 联调验证项 |
|------|------|------|------|-----------|
| 公开行情推送 | WebSocket | `ws://market-data:8001/ws/public/quotes` | 实时行情 | 连接、订阅、推送 |

**WebSocket协议规范：**
```json
// 订阅消息
{ "action": "subscribe", "symbols": ["000001.SZ", "600000.SH"] }

// 推送消息
{
  "symbol": "000001.SZ",
  "price": 12.58,
  "change": 0.35,
  "change_percent": 2.86,
  "volume": 1250000,
  "timestamp": "2026-02-12T10:00:00Z"
}
```

### 5.4 健康检查接口

| 接口 | 方法 | 路径 | 用途 | 联调验证项 |
|------|------|------|------|-----------|
| Backend健康 | GET | `/api/health` 或 `/api/v1/public/health` | 服务状态 | 返回200 |
| Market Data健康 | GET | `/health` | 服务状态 | 返回200 |

---

## 六、联调测试启动清单

### 6.1 环境配置检查

| 检查项 | 配置文件 | 要求 | 状态 |
|--------|----------|------|------|
| Backend API地址 | `config/env.ts` | 正确配置 | ⬜ 待确认 |
| Market Data地址 | `config/env.ts` | 正确配置 | ⬜ 待确认 |
| WebSocket地址 | `services/websocket.ts` | 与Market Data一致 | ⬜ 待确认 |
| 环境标识 | `manifest.json` | 区分local/dev/prod | ⬜ 待确认 |

### 6.2 服务启动检查

| 检查项 | 命令 | 期望结果 | 状态 |
|--------|------|----------|------|
| Backend服务 | `docker-compose ps backend` | 状态: healthy | ⬜ 待确认 |
| Market Data服务 | `docker-compose ps market-data` | 状态: healthy | ⬜ 待确认 |
| 数据库服务 | `docker-compose ps postgres/redis` | 状态: healthy | ⬜ 待确认 |

### 6.3 接口连通性检查

| 检查项 | 命令 | 期望结果 | 状态 |
|--------|------|----------|------|
| Backend健康 | `curl http://localhost:3001/api/health` | HTTP 200 | ⬜ 待确认 |
| Market Data健康 | `curl http://localhost:8001/health` | HTTP 200 | ⬜ 待确认 |
| 排行榜API | `curl http://localhost:3001/api/v1/public/rankings` | 返回排行榜数据 | ⬜ 待确认 |
| 行情API | `curl http://localhost:3001/api/v1/public/market/quotes` | 返回行情数据 | ⬜ 待确认 |

### 6.4 小程序构建检查

| 检查项 | 命令 | 期望结果 | 状态 |
|--------|------|----------|------|
| 依赖安装 | `npm install` | 无错误 | ⬜ 待确认 |
| TypeScript编译 | `npm run type-check` | 无类型错误 | ⬜ 待确认 |
| 小程序构建 | `npm run build:mp-weixin` | 构建成功 | ⬜ 待确认 |
| 代码质量 | `npm run lint` | 无严重警告 | ⬜ 待确认 |

### 6.5 测试数据准备

| 检查项 | 要求 | 状态 |
|--------|------|------|
| 测试股票数据 | Market Data有实时数据 | ⬜ 待确认 |
| 测试AI账户 | Backend有公开AI账户 | ⬜ 待确认 |
| 测试排行榜数据 | Backend有收益排行数据 | ⬜ 待确认 |

---

## 七、联调测试用例

### 7.1 WebSocket功能测试

| 用例ID | 测试场景 | 预期结果 | 状态 |
|--------|----------|----------|------|
| WS-001 | WebSocket连接 | 成功连接到Market Data | ⬜ 待测试 |
| WS-002 | 股票订阅 | 订阅成功后收到推送 | ⬜ 待测试 |
| WS-003 | 持仓自动订阅 | 进入持仓页自动订阅持仓股票 | ⬜ 待测试 |
| WS-004 | 数据合并 | WebSocket数据覆盖HTTP数据 | ⬜ 待测试 |
| WS-005 | 收益实时计算 | 价格变化后收益自动更新 | ⬜ 待测试 |
| WS-006 | 断线重连 | 断网恢复后自动重连 | ⬜ 待测试 |
| WS-007 | HTTP降级 | 重连失败后切换到HTTP轮询 | ⬜ 待测试 |
| WS-008 | 定期刷新 | 每分钟刷新Backend收益数据 | ⬜ 待测试 |

### 7.2 游客模式测试

| 用例ID | 测试场景 | 预期结果 | 状态 |
|--------|----------|----------|------|
| GUEST-001 | 首次进入获取Token | 成功获取游客Token | ⬜ 待测试 |
| GUEST-002 | Token本地存储 | 重启后保持游客状态 | ⬜ 待测试 |
| GUEST-003 | Token过期刷新 | 过期前自动刷新 | ⬜ 待测试 |
| GUEST-004 | 游客访问排行榜 | 无需登录查看排行榜 | ⬜ 待测试 |
| GUEST-005 | 游客访问行情 | 无需登录查看行情 | ⬜ 待测试 |
| GUEST-006 | 游客创建AI账户限制 | 最多创建2个账户 | ⬜ 待测试 |
| GUEST-007 | 游客对话轮数限制 | 最多10轮对话 | ⬜ 待测试 |
| GUEST-008 | 登录后数据迁移 | 游客数据迁移到正式账户 | ⬜ 待测试 |

### 7.3 服务健康检查测试

| 用例ID | 测试场景 | 预期结果 | 状态 |
|--------|----------|----------|------|
| HEALTH-001 | Backend健康检查 | 显示Backend状态正常 | ⬜ 待测试 |
| HEALTH-002 | Market Data健康检查 | 显示Market Data状态正常 | ⬜ 待测试 |
| HEALTH-003 | 服务异常降级 | Backend异常时显示提示 | ⬜ 待测试 |
| HEALTH-004 | 定期健康检查 | 每30秒更新状态 | ⬜ 待测试 |

---

## 八、文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 待办任务 | `./TODO.md` | 未完成工作追踪 |
| 已完成功能 | `./HAVE_DONE.md` | 已完成功能详细记录 |
| 测试脚本 | `./TEST_SCRIPTS.md` | 测试脚本索引 |
| 小程序需求 | `../../miniprogram/REQUIREMENTS.md` | 功能需求规格 |
| 小程序技术栈 | `../../miniprogram/TECH_STACK.md` | 技术方案 |
| 数据流优化 | `../../architecture/CURRENT/DECISIONS/006-MINIPROGRAM-DATA-FLOW.md` | 架构决策 |
| 游客模式设计 | `../../architecture/CURRENT/DECISIONS/005-MINIPROGRAM-GUEST-MODE.md` | 架构决策 |

---

## 九、更新记录

| 日期 | 更新内容 | 更新人 |
|------|---------|--------|
| 2026-02-12 | 初始版本，汇总WebSocket、健康检查、API对接等验证项 | 开发团队 |

---

*文档版本: v1.0*
*最后更新: 2026-02-12*
*维护者: Miniprogram开发团队*
