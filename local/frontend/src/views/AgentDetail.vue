<template>
  <div class="agent-detail-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <button class="btn-back" @click="goBack">
          ← 返回
        </button>
        <h2 v-if="agent">{{ agent.name }}</h2>
      </div>
      <div class="header-actions" v-if="agent">
        <span class="ws-badge" :class="wsConnected ? 'connected' : 'disconnected'" title="WebSocket 连接状态">
          {{ wsConnected ? '● 实时' : '○ 离线' }}
        </span>
        <span class="status-badge" :class="agent.status">
          {{ agent.status === 'active' ? '运行中' : '已暂停' }}
        </span>
        <button
          v-if="agent.status === 'active'"
          class="btn-warning"
          @click="handlePause"
          :disabled="agentStore.loading"
        >
          暂停
        </button>
        <button
          v-else
          class="btn-success"
          @click="handleResume"
          :disabled="agentStore.loading"
        >
          恢复
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="agentStore.loading && !agent" class="loading-state">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="agentStore.error" class="error-state">
      {{ agentStore.error }}
    </div>

    <!-- Content -->
    <div v-else-if="agent" class="detail-content">
      <!-- Level & Promotion Section -->
      <div class="section level-section">
        <h3>职级与晋升</h3>
        <div class="level-cards">
          <div class="level-card current">
            <div class="level-icon">{{ levelIcon(agent.agent_level) }}</div>
            <div class="level-info">
              <span class="level-label">当前职级</span>
              <span class="level-value">{{ levelText(agent.agent_level) }}</span>
            </div>
          </div>
          <div class="level-card incentive">
            <div class="level-icon">{{ incentiveIcon(agent.incentive_level) }}</div>
            <div class="level-info">
              <span class="level-label">当前档位</span>
              <span class="level-value">{{ incentiveText(agent.incentive_level) }}</span>
            </div>
          </div>
        </div>

        <!-- Promotion Progress -->
        <div class="promotion-progress">
          <div class="progress-header">
            <span>晋升进度</span>
            <span class="progress-text">{{ promotionProgress }}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: promotionProgress + '%' }"></div>
          </div>
          <p class="progress-hint">
            距离 {{ nextLevelText }} 还需 {{ remainingReturn }}% 收益
          </p>
        </div>
      </div>

      <!-- Performance Charts -->
      <div class="section charts-section">
        <h3>业绩表现</h3>
        <div class="charts-grid">
          <div class="chart-item wide">
            <ReturnsChart
              :data="portfolioHistory"
              :show-legend="true"
              :height="250"
            />
          </div>
          <div class="chart-item">
            <PortfolioPieChart
              :positions="portfolio?.positions || []"
              :cash="portfolio?.cash || 0"
            />
          </div>
          <div class="chart-item">
            <PerformanceRadar
              :metrics="performanceMetrics"
            />
          </div>
        </div>
      </div>

      <!-- Token Stats -->
      <div class="section">
        <TokenStatsPanel :agent-id="agent.id" />
      </div>

      <!-- Strategy Config -->
      <div class="section">
        <h3>策略配置</h3>
        <div class="strategy-card">
          <div class="strategy-grid">
            <div class="strategy-item">
              <span class="strategy-label">风险承受能力</span>
              <span class="strategy-value">{{ agent.strategy.risk_tolerance }}</span>
            </div>
            <div class="strategy-item">
              <span class="strategy-label">持仓周期</span>
              <span class="strategy-value">{{ agent.strategy.holding_period }}</span>
            </div>
            <div class="strategy-item">
              <span class="strategy-label">关注行业</span>
              <span class="strategy-value">{{ agent.strategy.sectors.join(', ') || '未选择' }}</span>
            </div>
            <div class="strategy-item">
              <span class="strategy-label">仓位限制</span>
              <span class="strategy-value">{{ agent.strategy.position_limit }}</span>
            </div>
            <div class="strategy-item">
              <span class="strategy-label">止损策略</span>
              <span class="strategy-value">{{ agent.strategy.stop_loss }}</span>
            </div>
            <div class="strategy-item">
              <span class="strategy-label">市场范围</span>
              <span class="strategy-value">{{ agent.strategy.market_scope || '全部' }}</span>
            </div>
          </div>
          <button class="btn-edit" @click="showEditStrategy = true">
            修改策略
          </button>
        </div>
      </div>

      <!-- Recent Decisions -->
      <div class="section">
        <h3>最近决策</h3>
        <div class="decisions-list" v-if="decisions.length">
          <div
            v-for="decision in decisions"
            :key="decision.id"
            class="decision-item"
          >
            <div class="decision-header">
              <span class="decision-time">{{ formatTime(decision.timestamp) }}</span>
              <span
                class="decision-action"
                :class="decision.action"
              >
                {{ actionText(decision.action) }}
              </span>
              <span v-if="decision.symbol" class="decision-symbol">
                {{ decision.symbol }}
              </span>
            </div>
            <div class="decision-reason">
              {{ decision.reason }}
            </div>
            <div class="decision-meta">
              <span>置信度: {{ (decision.confidence * 100).toFixed(0) }}%</span>
              <span>Token: {{ decision.tokens_used }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          暂无决策记录
        </div>
      </div>
    </div>

    <!-- Edit Strategy Modal -->
    <div v-if="showEditStrategy" class="modal-overlay" @click.self="showEditStrategy = false">
      <div class="modal">
        <h3>修改策略配置</h3>
        <StrategyWizard
          :initial-data="agent?.strategy"
          :loading="updatingStrategy"
          @submit="handleUpdateStrategy"
          @change="handleStrategyChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAgentStore } from '../stores/agents'
import { useWebSocketStore, type AgentTradeMessage, type AgentDecisionMessage } from '../stores/websocket'
import { portfolioApi, type Portfolio, type PerformanceMetrics } from '../api/portfolio'
import { decisionApi, type Decision } from '../api/decisions'
import { showSuccess, showNotification } from '../utils/error-handler'
import TokenStatsPanel from '../components/tokens/TokenStatsPanel.vue'
import ReturnsChart from '../components/charts/ReturnsChart.vue'
import PortfolioPieChart from '../components/charts/PortfolioPieChart.vue'
import PerformanceRadar from '../components/charts/PerformanceRadar.vue'
import StrategyWizard, { type StrategyFormData } from '../components/strategy/StrategyWizard.vue'

const route = useRoute()
const router = useRouter()
const agentStore = useAgentStore()
const wsStore = useWebSocketStore()

const agentId = computed(() => route.params.id as string)
const agent = computed(() => agentStore.currentAgent)

const portfolio = ref<Portfolio | null>(null)
const portfolioHistory = ref<{ timestamp: string; total_value: number; cash: number; market_value: number }[]>([])
const performanceMetrics = ref<PerformanceMetrics | null>(null)
const decisions = ref<Decision[]>([])
const showEditStrategy = ref(false)
const updatingStrategy = ref(false)
const wsConnected = ref(false)
let unsubscribeAgent: (() => void) | null = null

// WebSocket 消息处理
function handleTradeNotification(message: AgentTradeMessage) {
  const trade = message.data
  showNotification(
    '交易执行',
    `${trade.action === 'buy' ? '买入' : '卖出'} ${trade.symbol} ${trade.quantity}股 @ ¥${trade.price.toFixed(2)}`,
    trade.action === 'buy' ? 'success' : 'warning'
  )
  // 刷新数据
  loadData()
}

function handleDecisionNotification(message: AgentDecisionMessage) {
  const decision = message.data
  showNotification(
    'AI 决策',
    `${decision.symbol}: ${actionText(decision.action)} (置信度 ${(decision.confidence * 100).toFixed(0)}%)`,
    'info'
  )
  // 刷新决策列表
  loadDecisions()
}

// 连接 WebSocket
async function connectWebSocket() {
  if (!agentId.value) return

  try {
    await wsStore.connectAgent(agentId.value)
    unsubscribeAgent = wsStore.subscribeAgent(
      agentId.value,
      handleTradeNotification,
      handleDecisionNotification
    )
    wsConnected.value = true
    showSuccess('已连接到 AI 交易员实时通知')
  } catch (err) {
    console.error('Failed to connect agent WebSocket:', err)
    wsConnected.value = false
  }
}

// 断开 WebSocket
function disconnectWebSocket() {
  if (unsubscribeAgent) {
    unsubscribeAgent()
    unsubscribeAgent = null
  }
  if (agentId.value) {
    wsStore.disconnectAgent(agentId.value)
  }
  wsConnected.value = false
}

// 加载决策列表
async function loadDecisions() {
  if (!agentId.value) return
  try {
    const decisionsRes = await decisionApi.getHistory(agentId.value, 1, 10)
    decisions.value = decisionsRes.data.decisions
  } catch (err) {
    console.error('Failed to load decisions:', err)
  }
}

// Promotion thresholds
const levelThresholds: Record<string, number> = {
  intern: 20,
  manager: 50,
  partner: 100,
}

const promotionProgress = computed(() => {
  if (!agent.value) return 0
  const currentReturn = ((agent.value.current_capital - agent.value.initial_capital) / agent.value.initial_capital) * 100
  const threshold = levelThresholds[agent.value.agent_level] || 20
  return Math.min(100, Math.max(0, (currentReturn / threshold) * 100))
})

const remainingReturn = computed(() => {
  if (!agent.value) return 0
  const threshold = levelThresholds[agent.value.agent_level] || 20
  const currentReturn = ((agent.value.current_capital - agent.value.initial_capital) / agent.value.initial_capital) * 100
  return Math.max(0, threshold - currentReturn).toFixed(2)
})

const nextLevelText = computed(() => {
  if (!agent.value) return ''
  const levels: Record<string, string> = {
    intern: '经理',
    manager: '合伙人',
    partner: '最高级',
  }
  return levels[agent.value.agent_level] || ''
})

function levelText(level: string): string {
  const map: Record<string, string> = {
    intern: '实习生',
    manager: '经理',
    partner: '合伙人',
  }
  return map[level] || level
}

function levelIcon(level: string): string {
  const map: Record<string, string> = {
    intern: '🌱',
    manager: '💼',
    partner: '👑',
  }
  return map[level] || '🤖'
}

function incentiveText(level: string): string {
  const map: Record<string, string> = {
    standard: '标准',
    active: '积极',
    aggressive: '激进',
  }
  return map[level] || level
}

function incentiveIcon(level: string): string {
  const map: Record<string, string> = {
    standard: '📊',
    active: '📈',
    aggressive: '🚀',
  }
  return map[level] || '📊'
}

function actionText(action: string): string {
  const map: Record<string, string> = {
    buy: '买入',
    sell: '卖出',
    hold: '持有',
  }
  return map[action] || action
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function goBack() {
  router.push('/agents')
}

async function handlePause() {
  if (!agent.value) return
  try {
    await agentStore.pauseAgent(agent.value.id)
  } catch (err) {
    alert('操作失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

async function handleResume() {
  if (!agent.value) return
  try {
    await agentStore.resumeAgent(agent.value.id)
  } catch (err) {
    alert('操作失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

function handleStrategyChange(data: StrategyFormData) {
  // Handle real-time strategy changes if needed
  console.log('Strategy changed:', data)
}

async function handleUpdateStrategy(data: StrategyFormData) {
  if (!agent.value) return
  updatingStrategy.value = true
  try {
    await agentStore.updateAgent(agent.value.id, {
      strategy: data,
    })
    showEditStrategy.value = false
    // Refresh agent data
    await agentStore.fetchAgent(agent.value.id)
  } catch (err) {
    alert('更新策略失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    updatingStrategy.value = false
  }
}

async function loadData() {
  if (!agentId.value) return

  // Load agent details
  await agentStore.fetchAgent(agentId.value)

  // Load portfolio data
  try {
    const portfolioRes = await portfolioApi.getPortfolio(agentId.value)
    portfolio.value = portfolioRes.data
  } catch (err) {
    console.error('Failed to load portfolio:', err)
  }

  // Load portfolio history
  try {
    const historyRes = await portfolioApi.getHistory(agentId.value, 30)
    portfolioHistory.value = historyRes.data.history
  } catch (err) {
    console.error('Failed to load portfolio history:', err)
  }

  // Load performance metrics
  try {
    const perfRes = await portfolioApi.getPerformance(agentId.value)
    performanceMetrics.value = perfRes.data
  } catch (err) {
    console.error('Failed to load performance:', err)
  }

  // Load recent decisions
  await loadDecisions()
}

onMounted(() => {
  loadData()
  connectWebSocket()
})

onUnmounted(() => {
  disconnectWebSocket()
})
</script>

<style scoped>
.agent-detail-page {
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #eee;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn-back {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0.5rem;
}

.btn-back:hover {
  color: #2c3e50;
}

.page-header h2 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.status-badge {
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
}

.status-badge.active {
  background: #e8f5e9;
  color: #388e3c;
}

.status-badge.paused {
  background: #fff3e0;
  color: #f57c00;
}

.ws-badge {
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
}

.ws-badge.connected {
  background: #e3f2fd;
  color: #1976d2;
}

.ws-badge.disconnected {
  background: #f5f5f5;
  color: #9e9e9e;
}

.btn-warning {
  background: #fff3e0;
  color: #f57c00;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-success {
  background: #e8f5e9;
  color: #388e3c;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

/* Sections */
.section {
  margin-bottom: 2rem;
}

.section h3 {
  margin: 0 0 1rem;
  color: #2c3e50;
  font-size: 1.125rem;
}

/* Level Section */
.level-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.level-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.level-card.current {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.level-card.incentive {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
  color: white;
}

.level-icon {
  font-size: 2rem;
}

.level-info {
  display: flex;
  flex-direction: column;
}

.level-label {
  font-size: 0.75rem;
  opacity: 0.8;
}

.level-value {
  font-size: 1.25rem;
  font-weight: bold;
}

/* Promotion Progress */
.promotion-progress {
  background: white;
  border-radius: 8px;
  padding: 1.25rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  font-weight: 500;
  color: #2c3e50;
}

.progress-text {
  color: #667eea;
}

.progress-bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-hint {
  margin: 0;
  font-size: 0.875rem;
  color: #666;
}

/* Charts Section */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

.chart-item {
  min-width: 0;
}

.chart-item.wide {
  grid-column: span 2;
}

/* Strategy Card */
.strategy-card {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.strategy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.strategy-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.strategy-label {
  font-size: 0.75rem;
  color: #666;
}

.strategy-value {
  font-weight: 500;
  color: #2c3e50;
}

.btn-edit {
  background: #f5f5f5;
  border: 1px solid #ddd;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-edit:hover {
  background: #e0e0e0;
}

/* Decisions */
.decisions-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.decision-item {
  background: white;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.decision-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.decision-time {
  font-size: 0.75rem;
  color: #666;
}

.decision-action {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.decision-action.buy {
  background: #e8f5e9;
  color: #388e3c;
}

.decision-action.sell {
  background: #ffebee;
  color: #d32f2f;
}

.decision-action.hold {
  background: #f5f5f5;
  color: #666;
}

.decision-symbol {
  font-weight: 500;
  color: #2c3e50;
}

.decision-reason {
  font-size: 0.875rem;
  color: #333;
  line-height: 1.5;
  margin-bottom: 0.5rem;
}

.decision-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: #666;
}

/* States */
.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 3rem;
  color: #666;
}

.error-state {
  color: #d32f2f;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.5rem;
}

.modal h3 {
  margin: 0 0 1.5rem;
  color: #2c3e50;
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .charts-grid {
    grid-template-columns: 1fr;
  }

  .chart-item.wide {
    grid-column: span 1;
  }

  .level-cards {
    grid-template-columns: 1fr;
  }

  .strategy-grid {
    grid-template-columns: 1fr;
  }
}
</style>
