<template>
  <div class="market-page">
    <div class="page-header">
      <h2>行情数据</h2>
      <div class="header-actions">
        <div class="last-updated" v-if="marketStore.lastUpdated">
          最后更新: {{ formatTime(marketStore.lastUpdated) }}
        </div>
        <button
          class="btn-refresh"
          :class="{ 'auto-refresh': marketStore.autoRefresh && !useWebSocket, 'ws-connected': useWebSocket }"
          @click="toggleAutoRefresh"
          :disabled="marketStore.loading"
        >
          {{ useWebSocket ? '实时推送中' : (marketStore.autoRefresh ? '自动刷新中' : '自动刷新') }}
        </button>
        <button
          class="btn-ws"
          :class="{ 'ws-active': useWebSocket }"
          @click="toggleWebSocket"
        >
          {{ useWebSocket ? '断开实时' : '连接实时' }}
        </button>
        <button
          class="btn-primary"
          @click="refreshData"
          :disabled="marketStore.loading"
        >
          {{ marketStore.loading ? '刷新中...' : '立即刷新' }}
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{{ marketStore.quotes.length }}</div>
        <div class="stat-label">股票总数</div>
      </div>
      <div class="stat-card up">
        <div class="stat-value">{{ marketStore.gainers.length }}</div>
        <div class="stat-label">上涨</div>
      </div>
      <div class="stat-card down">
        <div class="stat-value">{{ marketStore.losers.length }}</div>
        <div class="stat-label">下跌</div>
      </div>
      <div class="stat-card flat">
        <div class="stat-value">{{ marketStore.flat.length }}</div>
        <div class="stat-label">平盘</div>
      </div>
    </div>

    <!-- Data Source Status -->
    <div class="source-status" v-if="Object.keys(marketStore.dataSourceHealth).length > 0">
      <span class="source-label">数据源:</span>
      <span
        v-for="(health, name) in marketStore.dataSourceHealth"
        :key="name"
        class="source-badge"
        :class="health.status"
      >
        {{ name }} ({{ Math.round(health.latency_ms) }}ms)
      </span>
    </div>

    <!-- Quotes Table -->
    <div class="table-container">
      <div v-if="marketStore.loading && marketStore.quotes.length === 0" class="loading">
        加载中...
      </div>
      <div v-else-if="marketStore.error" class="error">
        {{ marketStore.error }}
      </div>
      <table v-else-if="marketStore.quotes.length > 0" class="quotes-table">
        <thead>
          <tr>
            <th @click="sortBy = 'symbol'">代码</th>
            <th @click="sortBy = 'name'">名称</th>
            <th @click="sortBy = 'price'" class="numeric">最新价</th>
            <th @click="sortBy = 'change'" class="numeric">涨跌额</th>
            <th @click="sortBy = 'change_percent'" class="numeric">涨跌幅</th>
            <th @click="sortBy = 'volume'" class="numeric">成交量</th>
            <th class="numeric">数据源</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="quote in sortedQuotesList"
            :key="quote.symbol"
            :class="{ 'highlight-up': quote.change_percent > 0, 'highlight-down': quote.change_percent < 0 }"
          >
            <td class="symbol-cell">{{ quote.symbol }}</td>
            <td class="name-cell">{{ quote.name }}</td>
            <td class="numeric">{{ marketStore.formatPrice(quote.price) }}</td>
            <td class="numeric" :class="getChangeClass(quote.change)">
              {{ formatChange(quote.change) }}
            </td>
            <td class="numeric" :class="getChangeClass(quote.change_percent)">
              <span class="change-badge" :class="getChangeClass(quote.change_percent)">
                {{ marketStore.formatChangePercent(quote.change_percent) }}
              </span>
            </td>
            <td class="numeric">{{ marketStore.formatVolume(quote.volume) }}</td>
            <td class="numeric">
              <span class="source-tag" v-if="quote.sources">
                {{ quote.sources.join(', ') }}
              </span>
              <span class="source-tag" v-else-if="quote.source">
                {{ quote.source }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">暂无行情数据</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMarketStore } from '../stores/market'
import { useWebSocketStore, type MarketQuoteMessage } from '../stores/websocket'
import { showSuccess, showError } from '../utils/error-handler'
import type { Quote } from '../api/market'

const marketStore = useMarketStore()
const wsStore = useWebSocketStore()
const sortBy = ref('change_percent')
const sortDesc = ref(true)
const useWebSocket = ref(false)
const subscribedSymbols = ref<string[]>([])
let unsubscribeMarket: (() => void) | null = null

const sortedQuotesList = computed(() => {
  const list = [...marketStore.quotes]
  list.sort((a, b) => {
    let aVal = a[sortBy.value as keyof Quote]
    let bVal = b[sortBy.value as keyof Quote]
    if (typeof aVal === 'string') {
      aVal = parseFloat(aVal) || 0
      bVal = parseFloat(bVal as string) || 0
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDesc.value ? bVal - aVal : aVal - bVal
    }
    return 0
  })
  return list
})

// 处理 WebSocket 行情更新
function handleQuoteUpdate(message: MarketQuoteMessage) {
  const quote = message.data
  const existingIndex = marketStore.quotes.findIndex(q => q.symbol === quote.symbol)

  if (existingIndex >= 0) {
    // 更新现有行情
    marketStore.quotes[existingIndex] = {
      ...marketStore.quotes[existingIndex],
      price: quote.price,
      change: quote.change,
      change_percent: quote.change_percent,
      volume: quote.volume,
    }
  } else {
    // 添加新行情
    marketStore.quotes.push({
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      change_percent: quote.change_percent,
      volume: quote.volume,
      timestamp: new Date().toISOString(),
      source: 'websocket',
    })
  }
  marketStore.lastUpdated = new Date()
}

// 启动 WebSocket 连接
async function startWebSocket() {
  try {
    await wsStore.connectMarket()

    // 获取当前显示的股票代码
    subscribedSymbols.value = marketStore.quotes.map(q => q.symbol)
    if (subscribedSymbols.value.length === 0) {
      // 默认订阅一些热门股票
      subscribedSymbols.value = ['000001', '000002', '600000', '600519']
    }

    // 订阅行情
    unsubscribeMarket = wsStore.subscribeMarket(subscribedSymbols.value, handleQuoteUpdate)
    useWebSocket.value = true
    showSuccess('已连接到实时行情推送')
  } catch (err) {
    console.error('Failed to connect WebSocket:', err)
    showError('实时行情连接失败，将使用轮询模式')
    useWebSocket.value = false
  }
}

// 停止 WebSocket 连接
function stopWebSocket() {
  if (unsubscribeMarket) {
    unsubscribeMarket()
    unsubscribeMarket = null
  }
  wsStore.disconnectMarket()
  useWebSocket.value = false
}

// 切换 WebSocket 连接
function toggleWebSocket() {
  if (useWebSocket.value) {
    stopWebSocket()
    // 切换到轮询模式
    marketStore.startAutoRefresh(5000)
  } else {
    marketStore.stopAutoRefresh()
    startWebSocket()
  }
}

function getChangeClass(value: number): string {
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'flat'
}

function formatChange(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function refreshData() {
  marketStore.fetchQuotes()
  marketStore.fetchHealth()
}

function toggleAutoRefresh() {
  if (marketStore.autoRefresh) {
    marketStore.stopAutoRefresh()
  } else {
    // 如果 WebSocket 已连接，先断开
    if (useWebSocket.value) {
      stopWebSocket()
    }
    marketStore.startAutoRefresh(5000)
  }
}

onMounted(() => {
  refreshData()
  // 尝试连接 WebSocket
  startWebSocket()
})

onUnmounted(() => {
  marketStore.stopAutoRefresh()
  stopWebSocket()
})
</script>

<style scoped>
.market-page {
  padding: 1rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-header h2 {
  font-size: 1.5rem;
  color: #2c3e50;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.last-updated {
  color: #666;
  font-size: 0.875rem;
}

.btn-refresh {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-refresh.auto-refresh {
  background: #e8f5e9;
  border-color: #4caf50;
  color: #4caf50;
}

.btn-refresh.ws-connected {
  background: #e3f2fd;
  border-color: #2196f3;
  color: #2196f3;
}

.btn-ws {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-ws.ws-active {
  background: #e3f2fd;
  border-color: #2196f3;
  color: #2196f3;
}

.btn-primary {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-primary:hover:not(:disabled) {
  background: #34495e;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.stat-card.up {
  border-left: 4px solid #f44336;
}

.stat-card.down {
  border-left: 4px solid #4caf50;
}

.stat-card.flat {
  border-left: 4px solid #9e9e9e;
}

.stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: #2c3e50;
}

.stat-card.up .stat-value {
  color: #f44336;
}

.stat-card.down .stat-value {
  color: #4caf50;
}

.stat-label {
  color: #666;
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.source-status {
  background: white;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.source-label {
  color: #666;
  font-size: 0.875rem;
}

.source-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.source-badge.healthy {
  background: #e8f5e9;
  color: #4caf50;
}

.source-badge.degraded {
  background: #fff3e0;
  color: #f57c00;
}

.source-badge.unavailable {
  background: #ffebee;
  color: #f44336;
}

.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.quotes-table {
  width: 100%;
  border-collapse: collapse;
}

.quotes-table th,
.quotes-table td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.quotes-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #2c3e50;
  cursor: pointer;
  user-select: none;
}

.quotes-table th:hover {
  background: #e9ecef;
}

.quotes-table th.numeric,
.quotes-table td.numeric {
  text-align: right;
}

.quotes-table tr:hover {
  background: #f8f9fa;
}

.symbol-cell {
  font-family: monospace;
  font-weight: 500;
  color: #666;
}

.name-cell {
  font-weight: 500;
  color: #2c3e50;
}

.up {
  color: #f44336;
}

.down {
  color: #4caf50;
}

.flat {
  color: #666;
}

.change-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
}

.change-badge.up {
  background: #ffebee;
}

.change-badge.down {
  background: #e8f5e9;
}

.source-tag {
  font-size: 0.75rem;
  color: #666;
  background: #f5f5f5;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.loading,
.error,
.empty {
  padding: 3rem;
  text-align: center;
  color: #666;
}

.error {
  color: #f44336;
}
</style>