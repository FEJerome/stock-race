<template>
  <div class="agent-detail-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <button class="btn-back" @click="goBack">
          <span class="back-icon">←</span>
          返回
        </button>
        <div class="header-info" v-if="agent">
          <div class="agent-avatar" :style="avatarStyle">{{ agent.name.charAt(0).toUpperCase() }}</div>
          <h2>{{ agent.name }}</h2>
        </div>
      </div>
      <div class="header-actions" v-if="agent">
        <span class="ws-badge" :class="wsConnected ? 'connected' : 'disconnected'" title="WebSocket 连接状态">
          <span class="ws-dot"></span>
          {{ wsConnected ? '实时' : '离线' }}
        </span>
        <span class="status-badge" :class="agent.status">
          <span class="status-dot"></span>
          {{ agent.status === 'active' ? '运行中' : '已暂停' }}
        </span>
        <button
          v-if="agent.status === 'active'"
          class="btn-action warning"
          @click="handlePause"
          :disabled="agentStore.loading"
        >
          暂停
        </button>
        <button
          v-else
          class="btn-action success"
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
      <span class="error-icon">⚠</span>
      {{ agentStore.error }}
    </div>

    <!-- Content -->
    <div v-else-if="agent" class="detail-content">
      <!-- Level & Promotion Section -->
      <div class="section level-section">
        <div class="section-header">
          <h3>
            <span class="section-icon">🏆</span>
            职级与晋升
          </h3>
        </div>
        <div class="level-cards">
          <div class="level-card" :class="`level-${agent.agent_level}`">
            <div class="level-badge-icon">{{ levelIcon(agent.agent_level) }}</div>
            <div class="level-info">
              <span class="level-label">当前职级</span>
              <span class="level-value">{{ levelText(agent.agent_level) }}</span>
            </div>
          </div>
          <div class="level-card incentive">
            <div class="level-badge-icon">{{ incentiveIcon(agent.incentive_level) }}</div>
            <div class="level-info">
              <span class="level-label">当前档位</span>
              <span class="level-value">{{ incentiveText(agent.incentive_level) }}</span>
            </div>
          </div>
        </div>

        <!-- Promotion Progress -->
        <div class="promotion-progress">
          <div class="progress-header">
            <div class="progress-info">
              <span class="progress-label">晋升进度</span>
              <span class="progress-target">目标: {{ nextLevelText }}</span>
            </div>
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
        <div class="section-header">
          <h3>
            <span class="section-icon">📈</span>
            业绩表现
          </h3>
        </div>
        <div class="charts-grid">
          <div class="chart-item wide">
            <div class="chart-card">
              <ReturnsChart
                :data="portfolioHistory"
                :show-legend="true"
                :height="280"
              />
            </div>
          </div>
          <div class="chart-item">
            <div class="chart-card">
              <PortfolioPieChart
                :positions="portfolio?.positions || []"
                :cash="portfolio?.cash || 0"
              />
            </div>
          </div>
          <div class="chart-item">
            <div class="chart-card">
              <PerformanceRadar
                :metrics="performanceMetrics"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Token Stats -->
      <div class="section">
        <TokenStatsPanel :agent-id="agent.id" />
      </div>

      <!-- Strategy Config -->
      <div class="section">
        <div class="section-header">
          <h3>
            <span class="section-icon">📋</span>
            策略配置
          </h3>
          <button class="btn-edit" @click="showEditStrategy = true">
            修改策略
          </button>
        </div>
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
        </div>
      </div>

      <!-- Recent Decisions -->
      <div class="section">
        <div class="section-header">
          <h3>
            <span class="section-icon">🤔</span>
            最近决策
          </h3>
        </div>
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
              <span class="meta-item">
                <span class="meta-label">置信度:</span>
                {{ (decision.confidence * 100).toFixed(0) }}%
              </span>
              <span class="meta-item">
                <span class="meta-label">Token:</span>
                {{ decision.tokens_used }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-icon">📭</div>
          <p>暂无决策记录</p>
        </div>
      </div>
    </div>

    <!-- Edit Strategy Modal -->
    <div v-if="showEditStrategy" class="modal-overlay" @click.self="showEditStrategy = false">
      <div class="modal">
        <div class="modal-header">
          <h3>修改策略配置</h3>
          <button class="btn-close" @click="showEditStrategy = false">×</button>
        </div>
        <div class="modal-body">
          <StrategyWizard
            :initial-data="agent?.strategy"
            :loading="updatingStrategy"
            @submit="handleUpdateStrategy"
            @change="handleStrategyChange"
          />
        </div>
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

// Avatar style generation
const avatarStyle = computed(() => {
  if (!agent.value) return {}
  const hash = agent.value.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const hue1 = hash % 360
  const hue2 = (hash * 7) % 360
  return {
    background: `linear-gradient(135deg, hsl(${hue1}, 70%, 50%), hsl(${hue2}, 70%, 40%))`,
    boxShadow: `0 0 20px hsla(${hue1}, 70%, 50%, 0.4)`,
  }
})

// WebSocket handlers
function handleTradeNotification(message: AgentTradeMessage) {
  const trade = message.data
  showNotification(
    '交易执行',
    `${trade.action === 'buy' ? '买入' : '卖出'} ${trade.symbol} ${trade.quantity}股 @ ¥${trade.price.toFixed(2)}`,
    trade.action === 'buy' ? 'success' : 'warning'
  )
  loadData()
}

function handleDecisionNotification(message: AgentDecisionMessage) {
  const decision = message.data
  showNotification(
    'AI 决策',
    `${decision.symbol}: ${actionText(decision.action)} (置信度 ${(decision.confidence * 100).toFixed(0)}%)`,
    'info'
  )
  loadDecisions()
}

// Connect WebSocket
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
  } catch (err) {
    console.error('Failed to connect agent WebSocket:', err)
    wsConnected.value = false
  }
}

// Disconnect WebSocket
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

// Load decisions
async function loadDecisions() {
  if (!agentId.value) return
  try {
    const decisionsRes = await decisionApi.getHistory(agentId.value, 1, 10)
    decisions.value = decisionsRes.data.decisions
  } catch (err) {
    console.error('Failed to load decisions:', err)
  }
}

// Promotion calculations
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
    await agentStore.fetchAgent(agent.value.id)
  } catch (err) {
    alert('更新策略失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    updatingStrategy.value = false
  }
}

async function loadData() {
  if (!agentId.value) return

  await agentStore.fetchAgent(agentId.value)

  try {
    const portfolioRes = await portfolioApi.getPortfolio(agentId.value)
    portfolio.value = portfolioRes.data
  } catch (err) {
    console.error('Failed to load portfolio:', err)
  }

  try {
    const historyRes = await portfolioApi.getHistory(agentId.value, 30)
    portfolioHistory.value = historyRes.data.history
  } catch (err) {
    console.error('Failed to load portfolio history:', err)
  }

  try {
    const perfRes = await portfolioApi.getPerformance(agentId.value)
    performanceMetrics.value = perfRes.data
  } catch (err) {
    console.error('Failed to load performance:', err)
  }

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
  max-width: 1200px;
  margin: 0 auto;
}

/* Page Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-6);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-secondary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.btn-back {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-back:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
}

.back-icon {
  font-size: var(--text-lg);
}

.header-info {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.agent-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--font-bold);
  font-size: var(--text-lg);
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.page-header h2 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.ws-badge {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
}

.ws-badge.connected {
  background: rgba(0, 208, 132, 0.15);
  color: var(--up-primary);
  border: 1px solid rgba(0, 208, 132, 0.3);
}

.ws-badge.disconnected {
  background: var(--surface-secondary);
  color: var(--text-muted);
  border: 1px solid var(--border-secondary);
}

.ws-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.ws-badge.connected .ws-dot {
  box-shadow: 0 0 5px currentColor;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-badge {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
}

.status-badge.active {
  background: rgba(0, 208, 132, 0.15);
  color: var(--up-primary);
  border: 1px solid rgba(0, 208, 132, 0.3);
}

.status-badge.paused {
  background: var(--surface-secondary);
  color: var(--text-muted);
  border: 1px solid var(--border-secondary);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-badge.active .status-dot {
  box-shadow: 0 0 5px currentColor;
  animation: pulse 2s infinite;
}

.btn-action {
  padding: var(--space-2) var(--space-4);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-action.warning {
  background: rgba(245, 124, 0, 0.15);
  color: #f57c00;
  border: 1px solid rgba(245, 124, 0, 0.3);
}

.btn-action.warning:hover {
  background: rgba(245, 124, 0, 0.25);
}

.btn-action.success {
  background: rgba(0, 208, 132, 0.15);
  color: var(--up-primary);
  border: 1px solid rgba(0, 208, 132, 0.3);
}

.btn-action.success:hover {
  background: rgba(0, 208, 132, 0.25);
}

.btn-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Sections */
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

/* Level Section */
.level-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.level-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  transition: all var(--transition-fast);
}

.level-card:hover {
  border-color: var(--border-accent);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.level-card.level-intern {
  border-left: 3px solid #cd7f32;
}

.level-card.level-manager {
  border-left: 3px solid #c0c0c0;
}

.level-card.level-partner {
  border-left: 3px solid #ffd700;
}

.level-card.incentive {
  border-left: 3px solid var(--accent-cyan);
}

.level-badge-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-secondary);
  border-radius: var(--radius-lg);
  font-size: var(--text-2xl);
}

.level-info {
  display: flex;
  flex-direction: column;
}

.level-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.level-value {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  color: var(--text-primary);
}

/* Promotion Progress */
.promotion-progress {
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.progress-info {
  display: flex;
  flex-direction: column;
}

.progress-label {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
}

.progress-target {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.progress-text {
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  color: var(--accent-cyan);
}

.progress-bar {
  height: 10px;
  background: var(--surface-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--space-3);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-cyan), var(--accent-purple));
  border-radius: var(--radius-full);
  transition: width 0.5s var(--transition-bounce);
  box-shadow: 0 0 10px var(--accent-cyan-glow);
}

.progress-hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-muted);
}

/* Charts Section */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}

.chart-item {
  min-width: 0;
}

.chart-item.wide {
  grid-column: span 2;
}

.chart-card {
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  height: 100%;
}

/* Strategy Card */
.btn-edit {
  padding: var(--space-2) var(--space-4);
  background: var(--surface-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-edit:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(0, 212, 255, 0.1);
}

.strategy-card {
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
}

.strategy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-4);
}

.strategy-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.strategy-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.strategy-value {
  font-weight: var(--font-medium);
  color: var(--text-primary);
}

/* Decisions */
.decisions-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.decision-item {
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  transition: all var(--transition-fast);
}

.decision-item:hover {
  border-color: var(--border-accent);
}

.decision-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.decision-time {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.decision-action {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}

.decision-action.buy {
  background: var(--up-bg);
  color: var(--up-primary);
  border: 1px solid rgba(0, 208, 132, 0.3);
}

.decision-action.sell {
  background: var(--down-bg);
  color: var(--down-primary);
  border: 1px solid rgba(255, 71, 87, 0.3);
}

.decision-action.hold {
  background: var(--surface-secondary);
  color: var(--text-muted);
  border: 1px solid var(--border-secondary);
}

.decision-symbol {
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.decision-reason {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: var(--space-2);
}

.decision-meta {
  display: flex;
  gap: var(--space-4);
}

.meta-item {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.meta-label {
  margin-right: var(--space-1);
}

/* States */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12);
  color: var(--text-muted);
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--surface-elevated);
  border-top-color: var(--accent-cyan);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: var(--space-3);
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-state {
  color: var(--down-primary);
}

.error-icon {
  font-size: 2rem;
  margin-bottom: var(--space-2);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: var(--space-2);
  opacity: 0.5;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: var(--space-4);
}

.modal {
  background: var(--surface-elevated);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-xl);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5);
  border-bottom: 1px solid var(--border-secondary);
}

.modal-header h3 {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

.btn-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-secondary);
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: var(--text-xl);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-close:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.modal-body {
  padding: var(--space-5);
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
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
