<template>
  <div class="leaderboard-page">
    <div class="page-header">
      <h2>AI 交易员排行榜</h2>
      <div class="header-actions">
        <select v-model="sortBy" class="sort-select">
          <option value="total_return">按收益率排名</option>
          <option value="sharpe_ratio">按夏普比率排名</option>
          <option value="win_rate">按胜率排名</option>
          <option value="max_drawdown">按最大回撤排名</option>
        </select>
        <button class="btn-refresh" @click="refreshData" :disabled="loading">
          {{ loading ? '刷新中...' : '🔄 刷新' }}
        </button>
      </div>
    </div>

    <!-- Stats Overview -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">🏆</div>
        <div class="stat-value">{{ topPerformer?.name || '-' }}</div>
        <div class="stat-label">收益冠军</div>
        <div class="stat-sublabel" v-if="topPerformer">
          {{ formatReturn(topPerformer.total_return_percent) }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-value">{{ avgReturn }}</div>
        <div class="stat-label">平均收益率</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🎯</div>
        <div class="stat-value">{{ avgWinRate }}</div>
        <div class="stat-label">平均胜率</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💰</div>
        <div class="stat-value">{{ formatMoney(totalCapital) }}</div>
        <div class="stat-label">总管理资金</div>
      </div>
    </div>

    <!-- Leaderboard Table -->
    <div class="leaderboard-container">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>加载排行榜数据...</p>
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="btn-retry" @click="refreshData">重试</button>
      </div>

      <div v-else-if="rankings.length === 0" class="empty-state">
        <div class="empty-icon">📈</div>
        <h3>暂无排行榜数据</h3>
        <p>创建 AI 交易员并开始交易后，排行榜将显示在这里</p>
        <router-link to="/agents" class="btn-primary">创建 AI 交易员</router-link>
      </div>

      <table v-else class="leaderboard-table">
        <thead>
          <tr>
            <th class="rank-col">排名</th>
            <th>交易员</th>
            <th>职级</th>
            <th class="numeric">初始资金</th>
            <th class="numeric">当前资金</th>
            <th class="numeric" :class="{ active: sortBy === 'total_return' }">
              收益率
              <span v-if="sortBy === 'total_return'" class="sort-indicator">↓</span>
            </th>
            <th class="numeric" :class="{ active: sortBy === 'sharpe_ratio' }">
              夏普比率
              <span v-if="sortBy === 'sharpe_ratio'" class="sort-indicator">↓</span>
            </th>
            <th class="numeric" :class="{ active: sortBy === 'max_drawdown' }">
              最大回撤
              <span v-if="sortBy === 'max_drawdown'" class="sort-indicator">↓</span>
            </th>
            <th class="numeric" :class="{ active: sortBy === 'win_rate' }">
              胜率
              <span v-if="sortBy === 'win_rate'" class="sort-indicator">↓</span>
            </th>
            <th class="numeric">交易次数</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(item, index) in rankings"
            :key="item.agent.id"
            :class="{
              'top-1': index === 0,
              'top-2': index === 1,
              'top-3': index === 2,
            }"
          >
            <td class="rank-col">
              <div class="rank-badge" :class="`rank-${index + 1}`">
                <template v-if="index < 3">
                  {{ ['🥇', '🥈', '🥉'][index] }}
                </template>
                <template v-else>
                  {{ index + 1 }}
                </template>
              </div>
            </td>
            <td>
              <div class="agent-info">
                <router-link :to="`/agents/${item.agent.id}`" class="agent-name">
                  {{ item.agent.name }}
                </router-link>
                <span class="model-tag">{{ item.agent.model_name }}</span>
              </div>
            </td>
            <td>
              <span class="badge" :class="`level-${item.agent.agent_level}`">
                {{ levelText(item.agent.agent_level) }}
              </span>
            </td>
            <td class="numeric">{{ formatMoney(item.agent.initial_capital) }}</td>
            <td class="numeric">{{ formatMoney(item.performance.total_value) }}</td>
            <td class="numeric" :class="returnClass(item.performance.total_return)">
              {{ formatReturn(item.performance.total_return_percent) }}
            </td>
            <td class="numeric">
              {{ item.metrics?.sharpe_ratio?.toFixed(2) || '-' }}
            </td>
            <td class="numeric negative">
              {{ item.metrics?.max_drawdown_percent?.toFixed(2) || '0.00' }}%
            </td>
            <td class="numeric">
              {{ item.metrics?.win_rate ? (item.metrics.win_rate * 100).toFixed(1) + '%' : '-' }}
            </td>
            <td class="numeric">{{ item.trade_count || 0 }}</td>
            <td>
              <router-link :to="`/agents/${item.agent.id}`" class="btn-view">
                查看
              </router-link>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Performance Distribution Chart -->
    <div v-if="rankings.length > 0" class="chart-section">
      <h3>收益分布</h3>
      <div class="distribution-chart">
        <div
          v-for="(item, index) in rankings.slice(0, 10)"
          :key="item.agent.id"
          class="bar-item"
        >
          <div class="bar-label">{{ truncateName(item.agent.name) }}</div>
          <div class="bar-wrapper">
            <div
              class="bar"
              :class="{ positive: item.performance.total_return >= 0, negative: item.performance.total_return < 0 }"
              :style="{ width: barWidth(item.performance.total_return_percent) }"
            ></div>
          </div>
          <div class="bar-value" :class="returnClass(item.performance.total_return)">
            {{ formatReturn(item.performance.total_return_percent) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAgentStore } from '../stores/agents'
import { portfolioApi, type PerformanceMetrics } from '../api/portfolio'
import { showError } from '../utils/error-handler'

interface AgentRanking {
  agent: {
    id: string
    name: string
    agent_level: string
    model_name: string
    initial_capital: number
  }
  performance: {
    total_value: number
    total_return: number
    total_return_percent: number
  }
  metrics?: PerformanceMetrics
  trade_count: number
}

const agentStore = useAgentStore()
const loading = ref(false)
const error = ref('')
const rankings = ref<AgentRanking[]>([])
const sortBy = ref<'total_return' | 'sharpe_ratio' | 'win_rate' | 'max_drawdown'>('total_return')

// Computed stats
const topPerformer = computed(() => {
  if (rankings.value.length === 0) return null
  return rankings.value[0]
})

const avgReturn = computed(() => {
  if (rankings.value.length === 0) return '-'
  const avg = rankings.value.reduce((sum, r) => sum + r.performance.total_return_percent, 0) / rankings.value.length
  return formatReturn(avg)
})

const avgWinRate = computed(() => {
  const validRates = rankings.value.filter(r => r.metrics?.win_rate != null)
  if (validRates.length === 0) return '-'
  const avg = validRates.reduce((sum, r) => sum + (r.metrics!.win_rate || 0), 0) / validRates.length
  return (avg * 100).toFixed(1) + '%'
})

const totalCapital = computed(() => {
  return rankings.value.reduce((sum, r) => sum + r.agent.initial_capital, 0)
})

function formatMoney(value: number): string {
  if (value >= 100000000) {
    return '¥' + (value / 100000000).toFixed(2) + '亿'
  } else if (value >= 10000) {
    return '¥' + (value / 10000).toFixed(1) + '万'
  }
  return '¥' + value.toLocaleString('zh-CN')
}

function formatReturn(value: number): string {
  if (value == null) return '-'
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%'
}

function returnClass(returnValue: number): string {
  if (returnValue == null) return ''
  return returnValue >= 0 ? 'positive' : 'negative'
}

function levelText(level: string): string {
  const map: Record<string, string> = {
    intern: '实习生',
    manager: '经理',
    partner: '合伙人',
  }
  return map[level] || level
}

function truncateName(name: string): string {
  return name.length > 6 ? name.slice(0, 6) + '...' : name
}

function barWidth(percent: number): string {
  // Normalize to 0-100% for display, cap at 100%
  const absPercent = Math.abs(percent)
  const normalized = Math.min(absPercent, 100)
  return normalized + '%'
}

async function refreshData() {
  loading.value = true
  error.value = ''

  try {
    // Fetch agents
    await agentStore.fetchAgents()

    // Fetch performance data for each agent
    const agentRankings: AgentRanking[] = []

    for (const agent of agentStore.agents) {
      try {
        // Get portfolio performance
        const [portfolioRes, metricsRes, tradesRes] = await Promise.all([
          portfolioApi.getPortfolio(agent.id).catch(() => null),
          portfolioApi.getPerformance(agent.id).catch(() => null),
          fetch(`/api/trading/${agent.id}/trades?limit=1000`).then(r => r.json()).catch(() => null),
        ])

        const portfolio = portfolioRes?.data
        const metrics = metricsRes?.data
        const trades = tradesRes?.data?.items || []

        if (portfolio) {
          agentRankings.push({
            agent: {
              id: agent.id,
              name: agent.name,
              agent_level: agent.agent_level,
              model_name: agent.model_name,
              initial_capital: agent.initial_capital,
            },
            performance: {
              total_value: portfolio.total_value || agent.current_capital,
              total_return: portfolio.total_return || (agent.current_capital - agent.initial_capital),
              total_return_percent: portfolio.total_return_percent || ((agent.current_capital - agent.initial_capital) / agent.initial_capital * 100),
            },
            metrics,
            trade_count: trades.length,
          })
        }
      } catch (err) {
        console.error(`Failed to fetch data for agent ${agent.id}:`, err)
      }
    }

    // Sort based on selected criteria
    sortRankings(agentRankings)

    rankings.value = agentRankings
  } catch (err) {
    error.value = '加载排行榜失败'
    showError(err, { defaultMessage: '加载排行榜失败' })
  } finally {
    loading.value = false
  }
}

function sortRankings(list: AgentRanking[]) {
  list.sort((a, b) => {
    switch (sortBy.value) {
      case 'total_return':
        return b.performance.total_return_percent - a.performance.total_return_percent
      case 'sharpe_ratio':
        return (b.metrics?.sharpe_ratio || 0) - (a.metrics?.sharpe_ratio || 0)
      case 'win_rate':
        return (b.metrics?.win_rate || 0) - (a.metrics?.win_rate || 0)
      case 'max_drawdown':
        // Lower drawdown is better
        return (a.metrics?.max_drawdown_percent || 0) - (b.metrics?.max_drawdown_percent || 0)
      default:
        return 0
    }
  })
}

// Watch for sort changes
watch(sortBy, () => {
  const newRankings = [...rankings.value]
  sortRankings(newRankings)
  rankings.value = newRankings
})

onMounted(() => {
  refreshData()
})
</script>

<style scoped>
.leaderboard-page {
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.page-header h2 {
  font-size: 1.5rem;
  color: #2c3e50;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.sort-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  background: white;
  cursor: pointer;
}

.btn-refresh {
  padding: 0.5rem 1rem;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  background: #e8e8e8;
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: white;
  padding: 1.25rem;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  text-align: center;
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
}

.stat-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 0.25rem;
}

.stat-label {
  color: #666;
  font-size: 0.875rem;
}

.stat-sublabel {
  color: #4caf50;
  font-size: 0.875rem;
  font-weight: 500;
  margin-top: 0.25rem;
}

/* Leaderboard Container */
.leaderboard-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  margin-bottom: 1.5rem;
}

.loading-state,
.error-state,
.empty-state {
  padding: 4rem 2rem;
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f0f0f0;
  border-top-color: #2c3e50;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.empty-state p {
  color: #666;
  margin-bottom: 1.5rem;
}

.btn-primary {
  display: inline-block;
  background: #2c3e50;
  color: white;
  padding: 0.625rem 1.25rem;
  border-radius: 6px;
  text-decoration: none;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #34495e;
}

.btn-retry {
  background: #f5f5f5;
  border: 1px solid #ddd;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  margin-top: 1rem;
}

/* Table */
.leaderboard-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.leaderboard-table th,
.leaderboard-table td {
  padding: 0.875rem 1rem;
  text-align: left;
  border-bottom: 1px solid #f0f0f0;
}

.leaderboard-table th {
  background: #fafafa;
  font-weight: 600;
  color: #666;
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.leaderboard-table th.active {
  color: #2c3e50;
}

.sort-indicator {
  margin-left: 0.25rem;
}

.leaderboard-table tr:hover {
  background: #f8f9fa;
}

.leaderboard-table tr.top-1 {
  background: linear-gradient(90deg, #fff8e1 0%, #ffffff 100%);
}

.leaderboard-table tr.top-2 {
  background: linear-gradient(90deg, #f5f5f5 0%, #ffffff 100%);
}

.leaderboard-table tr.top-3 {
  background: linear-gradient(90deg, #fff3e0 0%, #ffffff 100%);
}

.rank-col {
  width: 60px;
  text-align: center;
}

.rank-badge {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.875rem;
  margin: 0 auto;
}

.rank-badge.rank-1 {
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  font-size: 1.25rem;
}

.rank-badge.rank-2 {
  background: linear-gradient(135deg, #e0e0e0, #bdbdbd);
  font-size: 1.25rem;
}

.rank-badge.rank-3 {
  background: linear-gradient(135deg, #cd7f32, #a0522d);
  font-size: 1.25rem;
}

.rank-badge:not(.rank-1):not(.rank-2):not(.rank-3) {
  background: #f5f5f5;
  color: #666;
}

.agent-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.agent-name {
  font-weight: 500;
  color: #2c3e50;
  text-decoration: none;
}

.agent-name:hover {
  color: #667eea;
  text-decoration: underline;
}

.model-tag {
  font-size: 0.75rem;
  color: #999;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.badge.level-intern {
  background: #e3f2fd;
  color: #1976d2;
}

.badge.level-manager {
  background: #f3e5f5;
  color: #7b1fa2;
}

.badge.level-partner {
  background: #fff3e0;
  color: #f57c00;
}

.numeric {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.positive {
  color: #4caf50;
  font-weight: 500;
}

.negative {
  color: #f44336;
  font-weight: 500;
}

.btn-view {
  padding: 0.375rem 0.75rem;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 4px;
  text-decoration: none;
  font-size: 0.75rem;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-view:hover {
  background: #bbdefb;
}

/* Chart Section */
.chart-section {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 1.5rem;
}

.chart-section h3 {
  margin: 0 0 1.5rem;
  font-size: 1.1rem;
  color: #2c3e50;
}

.distribution-chart {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bar-item {
  display: grid;
  grid-template-columns: 100px 1fr 80px;
  align-items: center;
  gap: 1rem;
}

.bar-label {
  font-size: 0.875rem;
  color: #666;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-wrapper {
  height: 24px;
  background: #f5f5f5;
  border-radius: 4px;
  overflow: hidden;
}

.bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.bar.positive {
  background: linear-gradient(90deg, #4caf50, #81c784);
}

.bar.negative {
  background: linear-gradient(90deg, #f44336, #ef5350);
}

.bar-value {
  font-size: 0.875rem;
  font-weight: 500;
  text-align: right;
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .leaderboard-table {
    font-size: 0.75rem;
  }

  .leaderboard-table th,
  .leaderboard-table td {
    padding: 0.625rem 0.5rem;
  }

  .bar-item {
    grid-template-columns: 80px 1fr 60px;
  }
}
</style>
