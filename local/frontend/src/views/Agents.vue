<template>
  <div class="agents-page">
    <div class="page-header">
      <h2>AI 交易员管理</h2>
      <button class="btn-primary" @click="showCreateModal = true">
        + 创建 AI 交易员
      </button>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{{ agentStore.agents.length }}</div>
        <div class="stat-label">总交易员数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ agentStore.activeAgents.length }}</div>
        <div class="stat-label">运行中</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ agentStore.pausedAgents.length }}</div>
        <div class="stat-label">已暂停</div>
      </div>
    </div>

    <!-- Agents Table -->
    <div class="table-container">
      <div v-if="agentStore.loading" class="loading">加载中...</div>
      <div v-else-if="agentStore.error" class="error">{{ agentStore.error }}</div>
      <table v-else-if="agentStore.agents.length > 0" class="agents-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>职级</th>
            <th>档位</th>
            <th>初始资金</th>
            <th>当前资金</th>
            <th>收益率</th>
            <th>状态</th>
            <th>模型</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="agent in agentStore.agents" :key="agent.id" @click="goToDetail(agent.id)" class="agent-row">
            <td class="name-cell">
              <router-link :to="`/agents/${agent.id}`" @click.stop>{{ agent.name }}</router-link>
            </td>
            <td>
              <span class="badge" :class="`level-${agent.agent_level}`">
                {{ levelText(agent.agent_level) }}
              </span>
            </td>
            <td>
              <span class="badge" :class="`incentive-${agent.incentive_level}`">
                {{ incentiveText(agent.incentive_level) }}
              </span>
            </td>
            <td>{{ formatMoney(agent.initial_capital) }}</td>
            <td>{{ formatMoney(agent.current_capital) }}</td>
            <td :class="returnClass(agent)">
              {{ formatReturn(agent) }}
            </td>
            <td>
              <span class="status" :class="agent.status">
                {{ agent.status === 'active' ? '运行中' : '已暂停' }}
              </span>
            </td>
            <td>{{ agent.model_name }}</td>
            <td class="actions">
              <button
                v-if="agent.status === 'active'"
                class="btn-small btn-warning"
                @click="handlePause(agent.id)"
              >
                暂停
              </button>
              <button
                v-else
                class="btn-small btn-success"
                @click="handleResume(agent.id)"
              >
                恢复
              </button>
              <button class="btn-small btn-danger" @click="handleDelete(agent.id)">
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">暂无 AI 交易员，点击上方按钮创建</div>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <h3>创建 AI 交易员</h3>
        <form @submit.prevent="handleCreate">
          <div class="form-group">
            <label>名称 *</label>
            <input v-model="createForm.name" type="text" required minlength="2" maxlength="20" />
          </div>

          <div class="form-group">
            <label>初始资金 * (10,000 - 1,000,000,000)</label>
            <input
              v-model.number="createForm.initial_capital"
              type="number"
              required
              min="10000"
              max="1000000000"
              step="10000"
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>职级</label>
              <select v-model="createForm.agent_level">
                <option value="intern">实习生</option>
                <option value="manager">经理</option>
                <option value="partner">合伙人</option>
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

          <h4 class="section-title">策略配置</h4>

          <div class="strategy-section">
            <div class="strategy-preview" v-if="!showStrategyWizard">
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
              <div class="preview-item">
                <span class="preview-label">止损策略:</span>
                <span class="preview-value">{{ strategyForm.stop_loss }}</span>
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
              {{ agentStore.loading ? '创建中...' : '创建' }}
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

// 行业选项（用于显示）
const sectorOptions = ['科技', '消费', '医药', '金融', '能源', '地产', '材料', '工业']
// 防止未使用变量警告
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
  return ret >= 0 ? 'positive' : 'negative'
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

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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

.stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: #2c3e50;
}

.stat-label {
  color: #666;
  margin-top: 0.5rem;
}

.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.agents-table {
  width: 100%;
  border-collapse: collapse;
}

.agents-table th,
.agents-table td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.agents-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #2c3e50;
}

.agents-table tr:hover {
  background: #f8f9fa;
}

.agent-row {
  cursor: pointer;
}

.name-cell {
  font-weight: 500;
  color: #2c3e50;
}

.name-cell a {
  color: #2c3e50;
  text-decoration: none;
}

.name-cell a:hover {
  color: #667eea;
  text-decoration: underline;
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

.badge.incentive-standard {
  background: #f5f5f5;
  color: #616161;
}

.badge.incentive-active {
  background: #e8f5e9;
  color: #388e3c;
}

.badge.incentive-aggressive {
  background: #ffebee;
  color: #d32f2f;
}

.status {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.status.active {
  background: #e8f5e9;
  color: #388e3c;
}

.status.paused {
  background: #fff3e0;
  color: #f57c00;
}

.positive {
  color: #4caf50;
  font-weight: 500;
}

.negative {
  color: #f44336;
  font-weight: 500;
}

.actions {
  display: flex;
  gap: 0.5rem;
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

.btn-primary:hover:not(:disabled) {
  background: #34495e;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-secondary:hover {
  background: #d0d0d0;
}

.btn-small {
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

.btn-warning {
  background: #fff3e0;
  color: #f57c00;
}

.btn-success {
  background: #e8f5e9;
  color: #388e3c;
}

.btn-danger {
  background: #ffebee;
  color: #d32f2f;
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
}

.modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.5rem;
}

.modal h3 {
  margin-bottom: 1.5rem;
  color: #2c3e50;
}

.section-title {
  margin: 1.5rem 0 1rem;
  font-size: 1rem;
  color: #2c3e50;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: #555;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.875rem;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #2c3e50;
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  cursor: pointer;
}

.checkbox input {
  width: auto;
}

/* Strategy Section */
.strategy-section {
  margin-bottom: 1.5rem;
}

.strategy-preview {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
}

.preview-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.preview-label {
  color: #666;
}

.preview-value {
  font-weight: 500;
  color: #2c3e50;
}

.btn-configure {
  width: 100%;
  margin-top: 1rem;
  padding: 0.5rem;
  background: #2c3e50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-configure:hover {
  background: #34495e;
}

.strategy-wizard-wrapper {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
}

.btn-close-wizard {
  width: 100%;
  padding: 0.5rem;
  background: #f5f5f5;
  border: none;
  border-top: 1px solid #e0e0e0;
  cursor: pointer;
  font-size: 0.875rem;
  color: #666;
}

.btn-close-wizard:hover {
  background: #e0e0e0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}
</style>
