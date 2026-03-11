<template>
  <div class="agents-page">
    <!-- Page Header -->
    <div class="page-header">
      <div class="header-title">
        <h2>AI 交易员管理</h2>
        <span class="header-subtitle">管理您的 AI 交易团队</span>
      </div>
      <button class="btn-create" @click="showCreateModal = true">
        <span class="btn-icon">+</span>
        <span>创建 AI 交易员</span>
      </button>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">🤖</div>
        <div class="stat-info">
          <span class="stat-value">{{ agentStore.agents.length }}</span>
          <span class="stat-label">总交易员数</span>
        </div>
      </div>
      <div class="stat-card up">
        <div class="stat-icon">✓</div>
        <div class="stat-info">
          <span class="stat-value">{{ agentStore.activeAgents.length }}</span>
          <span class="stat-label">运行中</span>
        </div>
      </div>
      <div class="stat-card warning">
        <div class="stat-icon">⏸</div>
        <div class="stat-info">
          <span class="stat-value">{{ agentStore.pausedAgents.length }}</span>
          <span class="stat-label">已暂停</span>
        </div>
      </div>
    </div>

    <!-- Agents Table -->
    <div class="table-container">
      <div v-if="agentStore.loading" class="loading-state">
        <div class="spinner"></div>
        <span>加载中...</span>
      </div>
      <div v-else-if="agentStore.error" class="error-state">{{ agentStore.error }}</div>
      <table v-else-if="agentStore.agents.length > 0" class="agents-table">
        <thead>
          <tr>
            <th>AI 名称</th>
            <th>职级</th>
            <th>档位</th>
            <th class="numeric">初始资金</th>
            <th class="numeric">当前资金</th>
            <th class="numeric">收益率</th>
            <th>状态</th>
            <th>模型</th>
            <th class="actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="agent in agentStore.agents"
            :key="agent.id"
            @click="goToDetail(agent.id)"
            class="agent-row"
          >
            <td class="name-cell">
              <div class="agent-avatar-small" :style="getAvatarStyle(agent.name)">
                {{ agent.name.charAt(0).toUpperCase() }}
              </div>
              <router-link :to="`/agents/${agent.id}`" @click.stop>{{ agent.name }}</router-link>
            </td>
            <td>
              <span class="badge level" :class="`level-${agent.agent_level}`">
                <span class="level-icon">{{ getLevelIcon(agent.agent_level) }}</span>
                {{ levelText(agent.agent_level) }}
              </span>
            </td>
            <td>
              <span class="badge incentive" :class="`incentive-${agent.incentive_level}`">
                {{ incentiveText(agent.incentive_level) }}
              </span>
            </td>
            <td class="numeric">{{ formatMoney(agent.initial_capital) }}</td>
            <td class="numeric">{{ formatMoney(agent.current_capital) }}</td>
            <td class="numeric">
              <span class="return-badge" :class="returnClass(agent)">
                {{ formatReturn(agent) }}
              </span>
            </td>
            <td>
              <span class="status-badge" :class="agent.status">
                <span class="status-dot"></span>
                {{ agent.status === 'active' ? '运行中' : '已暂停' }}
              </span>
            </td>
            <td>
              <span class="model-tag">{{ agent.model_name }}</span>
            </td>
            <td class="actions">
              <button
                v-if="agent.status === 'active'"
                class="btn-action warning"
                @click="handlePause(agent.id)"
                title="暂停"
              >
                ⏸
              </button>
              <button
                v-else
                class="btn-action success"
                @click="handleResume(agent.id)"
                title="恢复"
              >
                ▶
              </button>
              <button
                class="btn-action danger"
                @click="handleDelete(agent.id)"
                title="删除"
              >
                🗑
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-state">
        <div class="empty-icon">🌱</div>
        <h3>还没有 AI 交易员</h3>
        <p>点击上方按钮创建您的第一个 AI 交易员</p>
      </div>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>创建 AI 交易员</h3>
          <button class="btn-close" @click="showCreateModal = false">×</button>
        </div>
        <form @submit.prevent="handleCreate">
          <div class="form-group">
            <label>名称 <span class="required">*</span></label>
            <input v-model="createForm.name" type="text" required minlength="2" maxlength="20" placeholder="给您的 AI 起个名字" />
          </div>

          <div class="form-group">
            <label>初始资金 <span class="required">*</span></label>
            <input
              v-model.number="createForm.initial_capital"
              type="number"
              required
              min="10000"
              max="1000000000"
              step="10000"
            />
            <span class="form-hint">10,000 - 1,000,000,000</span>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>职级</label>
              <select v-model="createForm.agent_level">
                <option value="intern">🌱 实习生</option>
                <option value="manager">💼 经理</option>
                <option value="partner">👑 合伙人</option>
              </select>
            </div>
            <div class="form-group">
              <label>档位</label>
              <select v-model="createForm.incentive_level">
                <option value="standard">标准</option>
                <option value="active">积极</option>
                <option value="aggressive">激进</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>AI 模型</label>
            <select v-model="createForm.model_name">
              <option value="kimi-k2-5">Kimi K2.5</option>
              <option value="deepseek-chat">DeepSeek Chat</option>
              <option value="qwen-max">通义千问 Max</option>
            </select>
          </div>

          <div class="section-title">
            <span class="section-icon">📋</span>
            策略配置
          </div>

          <div class="strategy-section">
            <div class="strategy-preview" v-if="!showStrategyWizard">
              <div class="preview-grid">
                <div class="preview-item">
                  <span class="preview-label">风险承受:</span>
                  <span class="preview-value">{{ strategyForm.risk_tolerance }}</span>
                </div>
                <div class="preview-item">
                  <span class="preview-label">持仓周期:</span>
                  <span class="preview-value">{{ strategyForm.holding_period }}</span>
                </div>
                <div class="preview-item">
                  <span class="preview-label">关注行业:</span>
                  <span class="preview-value">{{ strategyForm.sectors.join(', ') || '未选择' }}</span>
                </div>
                <div class="preview-item">
                  <span class="preview-label">仓位限制:</span>
                  <span class="preview-value">{{ strategyForm.position_limit }}</span>
                </div>
              </div>
              <button type="button" class="btn-configure" @click="showStrategyWizard = true">
                配置策略
              </button>
            </div>
            <div v-else class="strategy-wizard-wrapper">
              <StrategyWizard
                :initial-data="strategyForm"
                :loading="agentStore.loading"
                @submit="handleStrategySubmit"
                @change="handleStrategyChange"
              />
              <button type="button" class="btn-close-wizard" @click="showStrategyWizard = false">
                收起向导
              </button>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showCreateModal = false">
              取消
            </button>
            <button type="submit" class="btn-primary" :disabled="agentStore.loading">
              {{ agentStore.loading ? '创建中...' : '创建 AI 交易员' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentStore } from '../stores/agents'
import StrategyWizard, { type StrategyFormData } from '../components/strategy/StrategyWizard.vue'
import { showSuccess, showError } from '../utils/error-handler'
import type { CreateAgentRequest } from '../api/agents'

const agentStore = useAgentStore()
const router = useRouter()
const showCreateModal = ref(false)

function goToDetail(id: string) {
  router.push(`/agents/${id}`)
}

// Avatar style generation
function getAvatarStyle(name: string) {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const hue1 = hash % 360
  const hue2 = (hash * 7) % 360
  return {
    background: `linear-gradient(135deg, hsl(${hue1}, 70%, 50%), hsl(${hue2}, 70%, 40%))`,
  }
}

function getLevelIcon(level: string) {
  const map: Record<string, string> = {
    intern: '🌱',
    manager: '💼',
    partner: '👑',
  }
  return map[level] || '🤖'
}

const sectorOptions = ['科技', '消费', '医药', '金融', '能源', '地产', '材料', '工业']
void sectorOptions

const createForm = reactive<CreateAgentRequest>({
  name: '',
  initial_capital: 500000,
  agent_level: 'intern',
  incentive_level: 'standard',
  model_name: 'kimi-k2-5',
  strategy: {
    risk_tolerance: '稳健',
    sectors: [],
    holding_period: '中线',
    position_limit: '单股不超过30%',
    stop_loss: '8%止损',
    market_scope: '主板+创业板',
  },
})

const showStrategyWizard = ref(false)
const strategyForm = ref<StrategyFormData>({
  risk_tolerance: '稳健',
  holding_period: '中线',
  sectors: [],
  position_limit: '单股不超过30%',
  stop_loss: '8%止损',
  market_scope: '主板+创业板',
})

function handleStrategySubmit(data: StrategyFormData) {
  strategyForm.value = data
  createForm.strategy = data
  showStrategyWizard.value = false
}

function handleStrategyChange(data: StrategyFormData) {
  strategyForm.value = data
  createForm.strategy = data
}

function levelText(level: string) {
  const map: Record<string, string> = {
    intern: '实习生',
    manager: '经理',
    partner: '合伙人',
  }
  return map[level] || level
}

function incentiveText(level: string) {
  const map: Record<string, string> = {
    standard: '标准',
    active: '积极',
    aggressive: '激进',
  }
  return map[level] || level
}

function formatMoney(value: number) {
  return '¥' + value.toLocaleString('zh-CN')
}

function formatReturn(agent: { initial_capital: number; current_capital: number }) {
  const ret = ((agent.current_capital - agent.initial_capital) / agent.initial_capital) * 100
  return (ret >= 0 ? '+' : '') + ret.toFixed(2) + '%'
}

function returnClass(agent: { initial_capital: number; current_capital: number }) {
  const ret = agent.current_capital - agent.initial_capital
  return ret >= 0 ? 'up' : 'down'
}

async function handleCreate() {
  try {
    const modelName = createForm.model_name || 'kimi-k2-5'
    await agentStore.createAgent({
      ...createForm,
      strategy: strategyForm.value,
      model_name: modelName,
      model_provider: modelName.startsWith('kimi')
        ? 'kimi'
        : modelName.startsWith('deepseek')
          ? 'deepseek'
          : 'qwen',
    })
    showSuccess('AI 交易员创建成功')
    showCreateModal.value = false
    resetForm()
  } catch (err) {
    showError(err, { showDetail: true })
  }
}

async function handlePause(id: string) {
  if (!confirm('确定要暂停该 AI 交易员吗？')) return
  try {
    await agentStore.pauseAgent(id)
    showSuccess('已暂停')
  } catch (err) {
    showError(err, { showDetail: true })
  }
}

async function handleResume(id: string) {
  try {
    await agentStore.resumeAgent(id)
    showSuccess('已恢复运行')
  } catch (err) {
    showError(err, { showDetail: true })
  }
}

async function handleDelete(id: string) {
  if (!confirm('确定要删除该 AI 交易员吗？此操作不可恢复。')) return
  try {
    await agentStore.deleteAgent(id)
    showSuccess('删除成功')
  } catch (err) {
    showError(err, { showDetail: true })
  }
}

function resetForm() {
  createForm.name = ''
  createForm.initial_capital = 500000
  createForm.agent_level = 'intern'
  createForm.incentive_level = 'standard'
  createForm.model_name = 'kimi-k2-5'
  createForm.strategy = {
    risk_tolerance: '稳健',
    sectors: [],
    holding_period: '中线',
    position_limit: '单股不超过30%',
    stop_loss: '8%止损',
    market_scope: '主板+创业板',
  }
  strategyForm.value = { ...createForm.strategy }
  showStrategyWizard.value = false
}

onMounted(() => {
  agentStore.fetchAgents()
})
</script>

<style scoped>
.agents-page {
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

.btn-create {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
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

.btn-create:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 212, 255, 0.4);
}

.btn-icon {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
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

.stat-card.warning {
  border-left: 3px solid #f57c00;
}

.stat-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-secondary);
  border-radius: var(--radius-lg);
  font-size: var(--text-2xl);
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
}

.stat-label {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

/* Table */
.table-container {
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.agents-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.agents-table th,
.agents-table td {
  padding: var(--space-4);
  text-align: left;
  border-bottom: 1px solid var(--border-secondary);
}

.agents-table th {
  background: var(--surface-secondary);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.agents-table tr:hover td {
  background: var(--surface-hover);
}

.agent-row {
  cursor: pointer;
  transition: background var(--transition-fast);
}

.name-cell {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-weight: var(--font-medium);
}

.agent-avatar-small {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--font-bold);
  font-size: var(--text-sm);
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.name-cell a {
  color: var(--text-primary);
  text-decoration: none;
}

.name-cell a:hover {
  color: var(--accent-cyan);
}

.numeric {
  text-align: right;
}

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}

.level-icon {
  font-size: 10px;
}

.badge.level-intern {
  background: linear-gradient(135deg, #cd7f32 0%, #e6a855 100%);
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.badge.level-manager {
  background: linear-gradient(135deg, #9ca3af 0%, #d1d5db 50%, #9ca3af 100%);
  color: #374151;
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.5);
}

.badge.level-partner {
  background: linear-gradient(135deg, #fbbf24 0%, #fcd34d 50%, #f59e0b 100%);
  color: #78350f;
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.5);
}

.badge.incentive-standard {
  background: var(--surface-secondary);
  color: var(--text-muted);
}

.badge.incentive-active {
  background: rgba(0, 208, 132, 0.15);
  color: var(--up-primary);
  border: 1px solid rgba(0, 208, 132, 0.3);
}

.badge.incentive-aggressive {
  background: rgba(255, 71, 87, 0.15);
  color: var(--down-primary);
  border: 1px solid rgba(255, 71, 87, 0.3);
}

/* Return Badge */
.return-badge {
  font-family: var(--font-mono);
  font-weight: var(--font-semibold);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
}

.return-badge.up {
  background: var(--up-bg);
  color: var(--up-primary);
  border: 1px solid rgba(0, 208, 132, 0.3);
}

.return-badge.down {
  background: var(--down-bg);
  color: var(--down-primary);
  border: 1px solid rgba(255, 71, 87, 0.3);
}

/* Status Badge */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
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
}

.status-badge.active .status-dot {
  background: var(--up-primary);
  box-shadow: 0 0 5px var(--up-primary);
  animation: pulse 2s infinite;
}

.status-badge.paused .status-dot {
  background: var(--neutral-muted);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Model Tag */
.model-tag {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  background: var(--surface-secondary);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

/* Actions */
.actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}

.btn-action {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-secondary);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-action:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.btn-action.success:hover {
  border-color: var(--up-primary);
  background: rgba(0, 208, 132, 0.1);
}

.btn-action.warning:hover {
  border-color: #f57c00;
  background: rgba(245, 124, 0, 0.1);
}

.btn-action.danger:hover {
  border-color: var(--down-primary);
  background: rgba(255, 71, 87, 0.1);
}

/* Loading State */
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
  max-width: 520px;
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

.modal form {
  padding: var(--space-5);
}

/* Form */
.form-group {
  margin-bottom: var(--space-4);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.form-group label {
  display: block;
  margin-bottom: var(--space-2);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
}

.form-group label .required {
  color: var(--down-primary);
  margin-left: 2px;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: var(--space-3);
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--text-sm);
  transition: all var(--transition-fast);
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1);
}

.form-group input::placeholder {
  color: var(--text-muted);
}

.form-hint {
  display: block;
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-6) 0 var(--space-4);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  border-top: 1px solid var(--border-secondary);
  padding-top: var(--space-4);
}

.section-icon {
  font-size: var(--text-base);
}

/* Strategy Section */
.strategy-section {
  margin-bottom: var(--space-4);
}

.strategy-preview {
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.preview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.preview-item {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
}

.preview-label {
  color: var(--text-muted);
}

.preview-value {
  color: var(--text-primary);
  font-weight: var(--font-medium);
}

.btn-configure {
  width: 100%;
  padding: var(--space-3);
  background: var(--surface-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-configure:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(0, 212, 255, 0.1);
}

.strategy-wizard-wrapper {
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.btn-close-wizard {
  width: 100%;
  padding: var(--space-3);
  background: var(--surface-secondary);
  border: none;
  border-top: 1px solid var(--border-primary);
  color: var(--text-muted);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-close-wizard:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

/* Modal Actions */
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-secondary);
}

.btn-secondary {
  padding: var(--space-3) var(--space-5);
  background: var(--surface-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-secondary:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

.btn-primary {
  padding: var(--space-3) var(--space-5);
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

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0, 212, 255, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Responsive */
@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .preview-grid {
    grid-template-columns: 1fr;
  }

  .agents-table {
    font-size: var(--text-xs);
  }

  .agents-table th,
  .agents-table td {
    padding: var(--space-2);
  }
}
</style>
