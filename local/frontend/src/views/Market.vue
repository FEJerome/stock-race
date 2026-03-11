<template>
  <div class="market-page">
    <!-- Page Header -->
    <div class="page-header">
      <div class="header-title">
        <h2>行情数据</h2>
        <span class="header-subtitle">实时股票行情监控</span>
      </div>
      <div class="header-actions">
        <div class="connection-status" :class="{ connected: useWebSocket }">
          <span class="status-dot"></span>
          <span class="status-text">{{ useWebSocket ? '实时推送' : '轮询模式' }}</span>
        </div>
        <button
          class="btn-ws"
          :class="{ active: useWebSocket }"
          @click="toggleWebSocket"
        >
          {{ useWebSocket ? '断开' : '连接' }}
        </button>
        <button
          class="btn-refresh"
          @click="refreshData"
          :disabled="marketStore.loading"
        >
          <span class="refresh-icon" :class="{ spinning: marketStore.loading }">↻</span>
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{{ marketStore.quotes.length }}</span>
        <span class="stat-label">股票总数</span>
      </div>
      <div class="stat-card up">
        <span class="stat-value">{{ marketStore.gainers.length }}</span>
        <span class="stat-label">上涨</span>
      </div>
      <div class="stat-card down">
        <span class="stat-value">{{ marketStore.losers.length }}</span>
        <span class="stat-label">下跌</span>
      </div>
      <div class="stat-card neutral">
        <span class="stat-value">{{ marketStore.flat.length }}</span>
        <span class="stat-label">平盘</span>
      </div>
    </div>

    <!-- Data Source Status -->
    <div class="source-panel" v-if="Object.keys(marketStore.dataSourceHealth).length > 0">
      <div class="source-header">
        <span class="source-title">📡 数据源状态</span>
        <span class="last-updated" v-if="marketStore.lastUpdated">
          更新于 {{ formatTime(marketStore.lastUpdated) }}
        </span>
      </div>
      <div class="source-badges">
        <span
          v-for="(health, name) in marketStore.dataSourceHealth"
          :key="name"
          class="source-badge"
          :class="health.status"
        >
          <span class="badge-dot"></span>
          <span class="badge-name">{{ name }}</span>
          <span class="badge-latency">{{ Math.round(health.latency_ms) }}ms</span>
        </span>
      </div>
    </div>

    <!-- Quotes Table -->
    <div class="table-container">
      <div v-if="marketStore.loading && marketStore.quotes.length === 0" class="loading-state">
        <div class="spinner"></div>
        <span>加载行情数据...</span>
      </div>
      <div v-else-if="marketStore.error" class="error-state">{{ marketStore.error }}</div>
      <div v-else-if="marketStore.quotes.length > 0" class="table-wrapper">
        <table class="quotes-table">
          <thead>
            <tr>
              <th @click="sortBy = 'symbol'" class="sortable">
                代码
                <span class="sort-icon" v-if="sortBy === 'symbol'">↓</span>
              </th>
              <th @click="sortBy = 'name'" class="sortable">
                名称
                <span class="sort-icon" v-if="sortBy === 'name'">↓</span>
              </th>
              <th @click="sortBy = 'price'" class="sortable numeric">
                最新价
                <span class="sort-icon" v-if="sortBy === 'price'">↓</span>
              </th>
              <th @click="sortBy = 'change'" class="sortable numeric">
                涨跌额
                <span class="sort-icon" v-if="sortBy === 'change'">↓</span>
              </th>
              <th @click="sortBy = 'change_percent'" class="sortable numeric">
                涨跌幅
                <span class="sort-icon" v-if="sortBy === 'change_percent'">↓</span>
              </th>
              <th @click="sortBy = 'volume'" class="sortable numeric">
                成交量
                <span class="sort-icon" v-if="sortBy === 'volume'">↓</span>
              </th>
              <th class="numeric">数据源</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="quote in sortedQuotesList"
              :key="quote.symbol"
              :class="{ flash: quote.isFlash }"
            >
              <td class="symbol-cell">{{ quote.symbol }}</td>
              <td class="name-cell">{{ quote.name }}</td>
              <td class="numeric price">{{ formatPrice(quote.price) }}</td>
              <td class="numeric" :class="getChangeClass(quote.change)">
                {{ formatChange(quote.change) }}
              </td>
              <td class="numeric">
                <span class="change-badge" :class="getChangeClass(quote.change_percent)">
                  {{ formatChangePercent(quote.change_percent) }}
                </span>
              </td>
              <td class="numeric volume">{{ formatVolume(quote.volume) }}</td>
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
      </div>
      <div v-else class="empty-state">
        <div class="empty-icon">📊</div>
        <h3>暂无行情数据</h3>
        <p>请检查数据源连接或稍后再试</p>
      </div>
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

// Handle WebSocket quote updates
function handleQuoteUpdate(message: MarketQuoteMessage) {
  const quote = message.data
  const existingIndex = marketStore.quotes.findIndex(q => q.symbol === quote.symbol)

  if (existingIndex >= 0) {
    // Flash effect for updated quote
    marketStore.quotes[existingIndex] = {
      ...marketStore.quotes[existingIndex],
      price: quote.price,
      change: quote.change,
      change_percent: quote.change_percent,
      volume: quote.volume,
      isFlash: true,
    }
    // Remove flash after animation
    setTimeout(() => {
      if (marketStore.quotes[existingIndex]) {
        marketStore.quotes[existingIndex].isFlash = false
      }
    }, 500)
  } else {
    marketStore.quotes.push({
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      change_percent: quote.change_percent,
      volume: quote.volume,
      timestamp: new Date().toISOString(),
      source: 'websocket',
      isFlash: true,
    })
  }
  marketStore.lastUpdated = new Date()
}

// Start WebSocket connection
async function startWebSocket() {
  try {
    await wsStore.connectMarket()

    subscribedSymbols.value = marketStore.quotes.map(q => q.symbol)
    if (subscribedSymbols.value.length === 0) {
      subscribedSymbols.value = ['000001', '000002', '600000', '600519']
    }

    unsubscribeMarket = wsStore.subscribeMarket(subscribedSymbols.value, handleQuoteUpdate)
    useWebSocket.value = true
    showSuccess('已连接到实时行情推送')
  } catch (err) {
    console.error('Failed to connect WebSocket:', err)
    showError('实时行情连接失败，将使用轮询模式')
    useWebSocket.value = false
  }
}

// Stop WebSocket connection
function stopWebSocket() {
  if (unsubscribeMarket) {
    unsubscribeMarket()
    unsubscribeMarket = null
  }
  wsStore.disconnectMarket()
  useWebSocket.value = false
}

// Toggle WebSocket connection
function toggleWebSocket() {
  if (useWebSocket.value) {
    stopWebSocket()
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

function formatChangePercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function formatPrice(value: number): string {
  return value.toFixed(2)
}

function formatVolume(value: number): string {
  if (value >= 100000000) {
    return (value / 100000000).toFixed(1) + '亿'
  } else if (value >= 10000) {
    return (value / 10000).toFixed(1) + '万'
  }
  return value.toString()
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function refreshData() {
  marketStore.fetchQuotes()
  marketStore.fetchHealth()
}

onMounted(() => {
  refreshData()
  startWebSocket()
})

onUnmounted(() => {
  marketStore.stopAutoRefresh()
  stopWebSocket()
})
</script>

<style scoped>
.market-page {
  max-width: 1400px;
  margin: 0 auto;
}

/* Page Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-6);
}

.header-title h2 {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  margin: 0;
}

.header-subtitle {
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin-top: var(--space-1);
  display: block;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.connection-status.connected {
  border-color: var(--up-primary);
  background: rgba(0, 208, 132, 0.1);
  color: var(--up-primary);
}

.connection-status .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--neutral-muted);
}

.connection-status.connected .status-dot {
  background: var(--up-primary);
  box-shadow: 0 0 5px var(--up-primary);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.btn-ws {
  padding: var(--space-2) var(--space-3);
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-ws:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
}

.btn-ws.active {
  background: var(--up-primary);
  border-color: var(--up-primary);
  color: var(--text-on-dark);
}

.btn-refresh {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-refresh:hover:not(:disabled) {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-icon {
  display: inline-block;
}

.refresh-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  transition: all var(--transition-fast);
}

.stat-card:hover {
  border-color: var(--border-accent);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.stat-card.up {
  border-left: 3px solid var(--up-primary);
}

.stat-card.down {
  border-left: 3px solid var(--down-primary);
}

.stat-card.neutral {
  border-left: 3px solid var(--neutral-muted);
}

.stat-value {
  font-family: var(--font-mono);
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
}

.stat-card.up .stat-value {
  color: var(--up-primary);
  text-shadow: 0 0 10px var(--up-glow);
}

.stat-card.down .stat-value {
  color: var(--down-primary);
  text-shadow: 0 0 10px var(--down-glow);
}

.stat-label {
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin-top: var(--space-1);
}

/* Source Panel */
.source-panel {
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  margin-bottom: var(--space-6);
}

.source-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.source-title {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

.last-updated {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.source-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.source-badge {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
}

.source-badge .badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.source-badge.healthy {
  background: rgba(0, 208, 132, 0.15);
  color: var(--up-primary);
  border: 1px solid rgba(0, 208, 132, 0.3);
}

.source-badge.healthy .badge-dot {
  background: var(--up-primary);
  box-shadow: 0 0 5px var(--up-primary);
}

.source-badge.degraded {
  background: rgba(245, 124, 0, 0.15);
  color: #f57c00;
  border: 1px solid rgba(245, 124, 0, 0.3);
}

.source-badge.degraded .badge-dot {
  background: #f57c00;
}

.source-badge.unavailable {
  background: rgba(255, 71, 87, 0.15);
  color: var(--down-primary);
  border: 1px solid rgba(255, 71, 87, 0.3);
}

.source-badge.unavailable .badge-dot {
  background: var(--down-primary);
}

.badge-latency {
  font-family: var(--font-mono);
  opacity: 0.7;
}

/* Table */
.table-container {
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.table-wrapper {
  overflow-x: auto;
}

.quotes-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
}

.quotes-table th,
.quotes-table td {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-secondary);
}

.quotes-table th {
  background: var(--surface-secondary);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.quotes-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.quotes-table th.sortable:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.sort-icon {
  margin-left: var(--space-1);
}

.quotes-table th.numeric,
.quotes-table td.numeric {
  text-align: right;
}

.quotes-table tr:hover td {
  background: var(--surface-hover);
}

.quotes-table tr.flash td {
  animation: flash 0.5s ease-out;
}

@keyframes flash {
  0% { background: rgba(0, 212, 255, 0.2); }
  100% { background: transparent; }
}

.symbol-cell {
  font-family: var(--font-mono);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
}

.name-cell {
  font-weight: var(--font-medium);
  color: var(--text-primary);
}

.price {
  font-family: var(--font-mono);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

.volume {
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.up {
  color: var(--up-primary);
}

.down {
  color: var(--down-primary);
}

.flat {
  color: var(--text-muted);
}

.change-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 70px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}

.change-badge.up {
  background: var(--up-bg);
  border: 1px solid rgba(0, 208, 132, 0.3);
}

.change-badge.down {
  background: var(--down-bg);
  border: 1px solid rgba(255, 71, 87, 0.3);
}

.change-badge.flat {
  background: var(--surface-secondary);
  border: 1px solid var(--border-secondary);
}

.source-tag {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  background: var(--surface-secondary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

/* Loading & Error States */
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12);
  color: var(--text-muted);
  gap: var(--space-3);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--surface-elevated);
  border-top-color: var(--accent-cyan);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-state {
  color: var(--down-primary);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12);
  text-align: center;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: var(--space-4);
  opacity: 0.8;
}

.empty-state h3 {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--space-2);
}

.empty-state p {
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .quotes-table {
    font-size: var(--text-xs);
  }

  .quotes-table th,
  .quotes-table td {
    padding: var(--space-2);
  }

  .change-badge {
    min-width: auto;
    padding: 2px 4px;
  }
}
</style>
