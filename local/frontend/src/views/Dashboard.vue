<template>
  <div class="dashboard">
    <!-- Page Header -->
    <div class="page-header">
      <div class="header-title">
        <h2>Dashboard</h2>
        <span class="header-subtitle">实时监控您的 AI 交易员表现</span>
      </div>
      <div class="header-actions">
        <button class="btn-refresh" @click="refreshData" :disabled="loading">
          <span class="refresh-icon" :class="{ spinning: loading }">↻</span>
          <span>{{ loading ? '刷新中...' : '刷新数据' }}</span>
        </button>
      </div>
    </div>

    <!-- Metrics Grid -->
    <div class="metrics-grid">
      <MetricCard
        label="总资产"
        :value="totalAssets"
        variant="accent"
        size="large"
        prefix="¥"
        :subtitle="assetsSubtitle"
        :loading="loading"
        :formatter="formatLargeMoney"
      />
      <MetricCard
        label="今日收益"
        :value="todayReturn"
        :variant="todayReturn >= 0 ? 'up' : 'down'"
        prefix="¥"
        :trend="todayReturnPercent"
        :loading="loading"
        :formatter="formatMoney"
      />
      <MetricCard
        label="运行中 AI"
        :value="activeAgents.length"
        variant="live"
        icon="🤖"
        :subtitle="`${agents.length} 位交易员总计`"
        :loading="loading"
      />
      <MetricCard
        label="系统状态"
        :value="systemStatusText"
        :variant="systemStatus === 'ok' ? 'up' : 'down'"
        :icon="systemStatus === 'ok' ? '✓' : '✗'"
        :subtitle="version || 'v2.0.0'"
        :loading="loading"
      />
    </div>

    <!-- Charts Section -->
    <div class="section charts-section" v-if="combinedHistory.length > 0">
      <div class="section-header">
        <h3>
          <span class="section-icon">📈</span>
          资产收益曲线
        </h3>
        <div class="section-actions">
          <span class="chart-legend-item">
            <span class="legend-dot" style="background: #667eea;"></span>
            总资产
          </span>
          <span class="chart-legend-item">
            <span class="legend-dot" style="background: #00d084;"></span>
            现金
          </span>
          <span class="chart-legend-item">
            <span class="legend-dot" style="background: #ed8936;"></span>
            持仓
          </span>
        </div>
      </div>
      <div class="chart-container">
        <ReturnsChart
          :data="combinedHistory"
          :show-legend="false"
          :height="320"
        />
      </div>
    </div>

    <!-- Agents Section -->
    <div class="section agents-section" v-if="agents.length > 0">
      <div class="section-header">
        <h3>
          <span class="section-icon">🤖</span>
          AI 交易员表现
        </h3>
        <router-link to="/agents" class="section-link">
          查看全部 →
        </router-link>
      </div>
      <div class="agents-list">
        <AgentCard
          v-for="agent in agents"
          :key="agent.id"
          :agent="agent"
          @click="goToAgent"
        />
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state-card">
      <div class="empty-icon">🌱</div>
      <h3>开始您的 AI 交易之旅</h3>
      <p>创建一个 AI 交易员，让它为您在虚拟市场中自动交易</p>
      <button class="btn-primary" @click="goToAgents">
        <span>+</span>
        创建 AI 交易员
      </button>
    </div>

    <!-- Quick Actions -->
    <div class="quick-actions" v-if="agents.length > 0">
      <button class="action-btn" @click="goToAgents">
        <span class="action-icon">➕</span>
        <span class="action-label">创建新 AI</span>
      </button>
      <button class="action-btn" @click="goToMarket">
        <span class="action-icon">📊</span>
        <span class="action-label">查看行情</span>
      </button>
      <button class="action-btn" @click="goToLeaderboard">
        <span class="action-icon">🏆</span>
        <span class="action-label">排行榜</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentStore } from '../stores/agents'
import { portfolioApi } from '../api/portfolio'
import ReturnsChart from '../components/charts/ReturnsChart.vue'
import AgentCard from '../components/AgentCard.vue'
import MetricCard from '../components/MetricCard.vue'
import { showError } from '../utils/error-handler'
import type { Agent } from '../api/agents'

const router = useRouter()
const agentStore = useAgentStore()

const loading = ref(false)
const systemStatus = ref('unknown')
const version = ref('')
const portfolios = ref<Map<string, { total_value: number; cash: number; market_value: number }>>(new Map())
const histories = ref<Map<string, Array<{ timestamp: string; total_value: number; cash: number; market_value: number }>>>(new Map())

const agents = computed(() => agentStore.agents)
const activeAgents = computed(() => agentStore.activeAgents)

// Calculate total assets
const totalAssets = computed(() => {
  let total = 0
  agents.value.forEach(agent => {
    const portfolio = portfolios.value.get(agent.id)
    if (portfolio) {
      total += portfolio.total_value
    } else {
      total += agent.current_capital
    }
  })
  return total
})

const assetsSubtitle = computed(() => {
  const count = agents.value.length
  if (count === 0) return '暂无交易员'
  return `由 ${count} 位 AI 交易员管理`
})

// Calculate today's return (mock calculation based on history)
const todayReturn = computed(() => {
  if (combinedHistory.value.length < 2) return 0
  const latest = combinedHistory.value[combinedHistory.value.length - 1]
  const previous = combinedHistory.value[combinedHistory.value.length - 2]
  return latest.total_value - previous.total_value
})

const todayReturnPercent = computed(() => {
  if (combinedHistory.value.length < 2) return 0
  const latest = combinedHistory.value[combinedHistory.value.length - 1]
  const previous = combinedHistory.value[combinedHistory.value.length - 2]
  if (previous.total_value === 0) return 0
  return ((latest.total_value - previous.total_value) / previous.total_value) * 100
})

// Combined history for chart
const combinedHistory = computed(() => {
  const allTimestamps = new Set<string>()

  histories.value.forEach((history) => {
    history.forEach((point) => allTimestamps.add(point.timestamp))
  })

  if (allTimestamps.size === 0) return []

  const sortedTimestamps = Array.from(allTimestamps).sort()

  return sortedTimestamps.map((timestamp) => {
    let totalValue = 0
    let totalCash = 0
    let totalMarketValue = 0

    histories.value.forEach((history) => {
      const point = history.find((h) => h.timestamp === timestamp) ||
        history.reduce((closest, current) => {
          const currentDiff = Math.abs(new Date(current.timestamp).getTime() - new Date(timestamp).getTime())
          const closestDiff = Math.abs(new Date(closest.timestamp).getTime() - new Date(timestamp).getTime())
          return currentDiff < closestDiff ? current : closest
        }, history[0])

      if (point) {
        totalValue += point.total_value
        totalCash += point.cash
        totalMarketValue += point.market_value
      }
    })

    return {
      timestamp,
      total_value: totalValue,
      cash: totalCash,
      market_value: totalMarketValue,
    }
  })
})

const systemStatusText = computed(() => {
  return systemStatus.value === 'ok' ? '运行正常' : '连接异常'
})

// Formatters
function formatMoney(value: number): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

function formatLargeMoney(value: number): string {
  if (value >= 100000000) {
    return (value / 100000000).toFixed(2) + '亿'
  } else if (value >= 10000) {
    return (value / 10000).toFixed(1) + '万'
  }
  return value.toLocaleString('zh-CN')
}

function goToAgent(id: string) {
  router.push(`/agents/${id}`)
}

function goToAgents() {
  router.push('/agents')
}

function goToMarket() {
  router.push('/market')
}

function goToLeaderboard() {
  router.push('/leaderboard')
}

async function refreshData() {
  loading.value = true
  try {
    // Check system health
    const response = await fetch('/api/health')
    if (response.ok) {
      const data = await response.json()
      systemStatus.value = 'ok'
      version.value = data.data?.version || ''
    } else {
      systemStatus.value = 'error'
    }

    // Load agents
    await agentStore.fetchAgents()

    // Load portfolio data for each agent
    for (const agent of agentStore.agents) {
      try {
        const portfolioRes = await portfolioApi.getPortfolio(agent.id)
        portfolios.value.set(agent.id, portfolioRes.data)

        const historyRes = await portfolioApi.getHistory(agent.id, 30)
        histories.value.set(agent.id, historyRes.data.history)
      } catch (err) {
        console.error(`Failed to load portfolio for agent ${agent.id}:`, err)
      }
    }
  } catch (err) {
    systemStatus.value = 'error'
    showError('刷新数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshData()
})
</script>

<style scoped>
.dashboard {
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
  gap: var(--space-3);
}

.btn-refresh {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-refresh:hover:not(:disabled) {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(0, 212, 255, 0.1);
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-icon {
  font-size: var(--text-lg);
  display: inline-block;
}

.refresh-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

@media (max-width: 1200px) {
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }
}

/* Section Styles */
.section {
  margin-bottom: var(--space-6);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.section-header h3 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0;
}

.section-icon {
  font-size: var(--text-xl);
}

.section-link {
  color: var(--accent-cyan);
  font-size: var(--text-sm);
  text-decoration: none;
  transition: opacity var(--transition-fast);
}

.section-link:hover {
  opacity: 0.8;
}

/* Charts Section */
.charts-section .section-actions {
  display: flex;
  gap: var(--space-4);
}

.chart-legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.chart-container {
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  overflow: hidden;
}

/* Agents Section */
.agents-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* Empty State */
.empty-state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12);
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  text-align: center;
  margin-bottom: var(--space-6);
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: var(--space-4);
  opacity: 0.8;
}

.empty-state-card h3 {
  font-size: var(--text-xl);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--space-2);
}

.empty-state-card p {
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin: 0 0 var(--space-6);
  max-width: 300px;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  background: linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-purple) 100%);
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 4px 15px rgba(0, 212, 255, 0.3);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 212, 255, 0.4);
}

/* Quick Actions */
.quick-actions {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(0, 212, 255, 0.1);
  transform: translateY(-1px);
}

.action-icon {
  font-size: var(--text-lg);
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-4);
  }

  .charts-section .section-actions {
    display: none;
  }

  .quick-actions {
    justify-content: center;
  }
}
</style>
