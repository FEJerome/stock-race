<template>
  <div class="dashboard">
    <div class="page-header">
      <h2>Dashboard</h2>
      <div class="header-actions">
        <button class="btn-refresh" @click="refreshData" :disabled="loading">
          {{ loading ? '刷新中...' : '刷新数据' }}
        </button>
      </div>
    </div>

    <!-- System Status -->
    <div class="status-grid">
      <div class="status-card" :class="systemStatus">
        <div class="status-icon">{{ systemStatus === 'ok' ? '✓' : '✗' }}</div>
        <div class="status-info">
          <span class="status-label">系统状态</span>
          <span class="status-value">{{ systemStatus === 'ok' ? '运行正常' : '连接异常' }}</span>
        </div>
      </div>
      <div class="status-card">
        <div class="status-value">{{ agents.length }}</div>
        <div class="status-label">AI 交易员</div>
      </div>
      <div class="status-card">
        <div class="status-value">{{ activeAgents.length }}</div>
        <div class="status-label">运行中</div>
      </div>
      <div class="status-card">
        <div class="status-value">{{ formatMoney(totalAssets) }}</div>
        <div class="status-label">总资产</div>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="charts-section" v-if="combinedHistory.length > 0">
      <h3>资产收益曲线</h3>
      <div class="chart-container">
        <ReturnsChart
          :data="combinedHistory"
          :show-legend="true"
          :height="300"
        />
      </div>
    </div>

    <!-- Agent Performance Grid -->
    <div class="agents-section" v-if="agents.length > 0">
      <h3>AI 交易员表现</h3>
      <div class="agents-grid">
        <div
          v-for="agent in agents"
          :key="agent.id"
          class="agent-card"
          @click="goToAgent(agent.id)"
        >
          <div class="agent-header">
            <span class="agent-name">{{ agent.name }}</span>
            <span class="agent-status" :class="agent.status">
              {{ agent.status === 'active' ? '运行中' : '已暂停' }}
            </span>
          </div>
          <div class="agent-stats">
            <div class="stat">
              <span class="stat-label">当前资金</span>
              <span class="stat-value">{{ formatMoney(agent.current_capital) }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">收益率</span>
              <span class="stat-value" :class="getReturnClass(agent)">
                {{ formatReturn(agent) }}
              </span>
            </div>
          </div>
          <div class="agent-levels">
            <span class="badge level">{{ levelText(agent.agent_level) }}</span>
            <span class="badge incentive">{{ incentiveText(agent.incentive_level) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <p>暂无 AI 交易员，请先创建一个</p>
      <button class="btn-primary" @click="goToAgents">创建 AI 交易员</button>
    </div>

    <!-- Version Info -->
    <div class="version-info" v-if="version">
      Server Version: {{ version }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentStore } from '../stores/agents'
import { portfolioApi } from '../api/portfolio'
import ReturnsChart from '../components/charts/ReturnsChart.vue'
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

// 计算总资产
const totalAssets = computed(() => {
  return agents.value.reduce((sum, agent) => {
    return sum + (agent.current_capital || agent.initial_capital)
  }, 0)
})

// 合并所有 Agent 的历史数据
const combinedHistory = computed(() => {
  const allTimestamps = new Set<string>()

  // 收集所有时间点
  histories.value.forEach((history) => {
    history.forEach((point) => allTimestamps.add(point.timestamp))
  })

  if (allTimestamps.size === 0) return []

  // 按时间排序
  const sortedTimestamps = Array.from(allTimestamps).sort()

  // 合并数据
  return sortedTimestamps.map((timestamp) => {
    let totalValue = 0
    let totalCash = 0
    let totalMarketValue = 0

    histories.value.forEach((history) => {
      // 找到最接近该时间点的数据
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

function formatMoney(value: number): string {
  if (value >= 100000000) {
    return '¥' + (value / 100000000).toFixed(2) + '亿'
  } else if (value >= 10000) {
    return '¥' + (value / 10000).toFixed(2) + '万'
  }
  return '¥' + value.toLocaleString('zh-CN')
}

function formatReturn(agent: Agent): string {
  const ret = ((agent.current_capital - agent.initial_capital) / agent.initial_capital) * 100
  return (ret >= 0 ? '+' : '') + ret.toFixed(2) + '%'
}

function getReturnClass(agent: Agent): string {
  const ret = agent.current_capital - agent.initial_capital
  return ret >= 0 ? 'positive' : 'negative'
}

function levelText(level: string): string {
  const map: Record<string, string> = {
    intern: '实习生',
    manager: '经理',
    partner: '合伙人',
  }
  return map[level] || level
}

function incentiveText(level: string): string {
  const map: Record<string, string> = {
    standard: '标准',
    active: '积极',
    aggressive: '激进',
  }
  return map[level] || level
}

function goToAgent(id: string) {
  router.push(`/agents/${id}`)
}

function goToAgents() {
  router.push('/agents')
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
  padding: 1rem;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-header h2 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.header-actions {
  display: flex;
  gap: 1rem;
}

.btn-refresh {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-refresh:hover:not(:disabled) {
  background: #34495e;
}

.btn-refresh:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* Status Grid */
.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.status-card {
  background: white;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 1rem;
}

.status-card.ok {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
  color: white;
}

.status-card.error {
  background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%);
  color: white;
}

.status-icon {
  font-size: 2rem;
  font-weight: bold;
}

.status-info {
  display: flex;
  flex-direction: column;
}

.status-label {
  font-size: 0.875rem;
  opacity: 0.8;
}

.status-value {
  font-size: 1.25rem;
  font-weight: bold;
}

/* Charts Section */
.charts-section {
  margin-bottom: 2rem;
}

.charts-section h3 {
  margin: 0 0 1rem;
  color: #2c3e50;
  font-size: 1.125rem;
}

.chart-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

/* Agents Section */
.agents-section {
  margin-bottom: 2rem;
}

.agents-section h3 {
  margin: 0 0 1rem;
  color: #2c3e50;
  font-size: 1.125rem;
}

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.agent-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.agent-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.agent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.agent-name {
  font-weight: 600;
  color: #2c3e50;
  font-size: 1.125rem;
}

.agent-status {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.agent-status.active {
  background: #e8f5e9;
  color: #388e3c;
}

.agent-status.paused {
  background: #fff3e0;
  color: #f57c00;
}

.agent-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.stat {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.75rem;
  color: #666;
}

.stat-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: #2c3e50;
}

.stat-value.positive {
  color: #48bb78;
}

.stat-value.negative {
  color: #f56565;
}

.agent-levels {
  display: flex;
  gap: 0.5rem;
}

.badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.badge.level {
  background: #e3f2fd;
  color: #1976d2;
}

.badge.incentive {
  background: #f3e5f5;
  color: #7b1fa2;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 3rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.empty-state p {
  color: #666;
  margin-bottom: 1rem;
}

.btn-primary {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-primary:hover {
  background: #34495e;
}

/* Version Info */
.version-info {
  text-align: center;
  color: #999;
  font-size: 0.75rem;
  margin-top: 2rem;
}
</style>
