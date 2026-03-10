<template>
  <div class="token-stats-panel">
    <div class="panel-header">
      <h3>Token 消耗统计</h3>
      <div class="header-actions">
        <button
          class="btn-refresh"
          @click="refreshStats"
          :disabled="loading"
        >
          {{ loading ? '刷新中...' : '刷新' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="stats" class="stats-content">
      <!-- Summary Cards -->
      <div class="summary-grid">
        <div class="summary-card primary">
          <div class="card-icon">🪙</div>
          <div class="card-value">{{ formatNumber(stats.total_tokens) }}</div>
          <div class="card-label">累计 Token 消耗</div>
        </div>

        <div class="summary-card">
          <div class="card-icon">💵</div>
          <div class="card-value">${{ formatCost(stats.total_cost_usd) }}</div>
          <div class="card-label">总成本 (USD)</div>
        </div>

        <div class="summary-card">
          <div class="card-icon">💴</div>
          <div class="card-value">¥{{ formatCost(stats.total_cost_cny) }}</div>
          <div class="card-label">总成本 (CNY)</div>
        </div>

        <div class="summary-card">
          <div class="card-icon">📊</div>
          <div class="card-value">${{ formatCost(stats.avg_cost_per_decision) }}</div>
          <div class="card-label">平均每次决策</div>
        </div>

        <div class="summary-card">
          <div class="card-icon">🤖</div>
          <div class="card-value">{{ stats.decision_count }}</div>
          <div class="card-label">决策次数</div>
        </div>
      </div>

      <!-- Model Breakdown -->
      <div class="section">
        <h4>按模型统计</h4>
        <div class="model-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>模型</th>
                <th class="numeric">Token 数</th>
                <th class="numeric">输入/输出</th>
                <th class="numeric">成本 (USD)</th>
                <th class="numeric">决策数</th>
                <th class="numeric">占比</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="model in sortedModelStats"
                :key="model.model_name"
              >
                <td>
                  <div class="model-info">
                    <span class="model-name">{{ model.model_name }}</span>
                    <span class="model-provider">{{ model.provider }}</span>
                  </div>
                </td>
                <td class="numeric">{{ formatNumber(model.total_tokens) }}</td>
                <td class="numeric">
                  <span class="token-breakdown">
                    {{ formatNumber(model.input_tokens) }} / {{ formatNumber(model.output_tokens) }}
                  </span>
                </td>
                <td class="numeric">${{ formatCost(model.cost_usd) }}</td>
                <td class="numeric">{{ model.decision_count }}</td>
                <td class="numeric">
                  <div class="percentage-bar">
                    <div
                      class="percentage-fill"
                      :style="{ width: getModelPercentage(model.total_tokens) + '%' }"
                    ></div>
                    <span>{{ getModelPercentage(model.total_tokens).toFixed(1) }}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Agent Breakdown (if showing overall stats) -->
      <div v-if="!agentId && stats.by_agent?.length" class="section">
        <h4>按交易员统计</h4>
        <div class="agent-list">
          <div
            v-for="agent in sortedAgentStats"
            :key="agent.agent_id"
            class="agent-item"
          >
            <div class="agent-info">
              <span class="agent-name">{{ agent.agent_name }}</span>
            </div>
            <div class="agent-stats">
              <span class="stat">{{ formatNumber(agent.total_tokens) }} tokens</span>
              <span class="stat">${{ formatCost(agent.cost_usd) }}</span>
              <span class="stat">{{ agent.decision_count }} 次决策</span>
            </div>
            <div class="agent-bar">
              <div
                class="agent-bar-fill"
                :style="{ width: getAgentPercentage(agent.total_tokens) + '%' }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Daily Trend Chart (placeholder for ECharts integration) -->
      <div v-if="stats.daily_stats?.length" class="section">
        <h4>每日趋势</h4>
        <div class="daily-chart">
          <div
            v-for="day in stats.daily_stats.slice(-14)"
            :key="day.date"
            class="daily-bar"
          >
            <div
              class="bar-fill"
              :style="{ height: getDailyHeight(day.total_tokens) + '%' }"
              :title="`${day.date}: ${formatNumber(day.total_tokens)} tokens, $${formatCost(day.cost_usd)}`"
            ></div>
            <span class="bar-label">{{ formatDate(day.date) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <div v-else class="empty-state">
      <p>暂无 Token 统计数据</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { tokenApi, type TokenStats } from '../../api/tokens'

const props = defineProps<{
  agentId?: string
}>()

const stats = ref<TokenStats | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const sortedModelStats = computed(() => {
  if (!stats.value?.by_model) return []
  return [...stats.value.by_model].sort((a, b) => b.total_tokens - a.total_tokens)
})

const sortedAgentStats = computed(() => {
  if (!stats.value?.by_agent) return []
  return [...stats.value.by_agent].sort((a, b) => b.total_tokens - a.total_tokens)
})

const maxDailyTokens = computed(() => {
  if (!stats.value?.daily_stats?.length) return 0
  return Math.max(...stats.value.daily_stats.map(d => d.total_tokens))
})

async function fetchStats() {
  loading.value = true
  error.value = null
  try {
    const response = props.agentId
      ? await tokenApi.getAgentStats(props.agentId)
      : await tokenApi.getStats()
    stats.value = response.data
  } catch (err) {
    error.value = err instanceof Error ? err.message : '获取统计数据失败'
    console.error('Failed to fetch token stats:', err)
  } finally {
    loading.value = false
  }
}

function refreshStats() {
  fetchStats()
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return cost.toFixed(4)
  }
  return cost.toFixed(2)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function getModelPercentage(tokens: number): number {
  if (!stats.value?.total_tokens) return 0
  return (tokens / stats.value.total_tokens) * 100
}

function getAgentPercentage(tokens: number): number {
  if (!stats.value?.total_tokens) return 0
  return (tokens / stats.value.total_tokens) * 100
}

function getDailyHeight(tokens: number): number {
  if (!maxDailyTokens.value) return 0
  return (tokens / maxDailyTokens.value) * 100
}

onMounted(() => {
  fetchStats()
})
</script>

<style scoped>
.token-stats-panel {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #eee;
}

.panel-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.25rem;
}

.btn-refresh {
  background: #f5f5f5;
  border: 1px solid #ddd;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  background: #e0e0e0;
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Summary Grid */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.summary-card {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1.25rem;
  text-align: center;
  transition: transform 0.2s;
}

.summary-card:hover {
  transform: translateY(-2px);
}

.summary-card.primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.card-icon {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.card-value {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 0.25rem;
}

.card-label {
  font-size: 0.75rem;
  color: #666;
}

.summary-card.primary .card-label {
  color: rgba(255, 255, 255, 0.8);
}

/* Sections */
.section {
  margin-bottom: 2rem;
}

.section h4 {
  margin: 0 0 1rem;
  color: #2c3e50;
  font-size: 1rem;
}

/* Data Table */
.model-table-container {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.data-table th,
.data-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.data-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #2c3e50;
}

.data-table th.numeric,
.data-table td.numeric {
  text-align: right;
}

.model-info {
  display: flex;
  flex-direction: column;
}

.model-name {
  font-weight: 500;
  color: #2c3e50;
}

.model-provider {
  font-size: 0.75rem;
  color: #666;
}

.token-breakdown {
  font-size: 0.75rem;
  color: #666;
}

.percentage-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: flex-end;
}

.percentage-fill {
  height: 6px;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 3px;
  min-width: 4px;
}

/* Agent List */
.agent-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.agent-item {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
}

.agent-info {
  margin-bottom: 0.5rem;
}

.agent-name {
  font-weight: 500;
  color: #2c3e50;
}

.agent-stats {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: #666;
}

.agent-bar {
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
}

.agent-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
}

/* Daily Chart */
.daily-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 120px;
  padding: 1rem 0;
  overflow-x: auto;
}

.daily-bar {
  flex: 1;
  min-width: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.bar-fill {
  width: 100%;
  background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  border-radius: 2px 2px 0 0;
  min-height: 4px;
  transition: height 0.3s ease;
}

.bar-label {
  font-size: 0.625rem;
  color: #666;
  white-space: nowrap;
}

/* States */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #666;
}

.error-message {
  padding: 1rem;
  background: #ffebee;
  color: #d32f2f;
  border-radius: 8px;
  margin-bottom: 1rem;
}

/* Responsive */
@media (max-width: 768px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .data-table {
    font-size: 0.75rem;
  }

  .data-table th,
  .data-table td {
    padding: 0.5rem;
  }

  .agent-stats {
    flex-direction: column;
    gap: 0.25rem;
  }
}
</style>
