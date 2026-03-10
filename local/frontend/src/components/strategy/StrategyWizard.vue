<template>
  <div class="strategy-wizard">
    <div class="wizard-header">
      <h3>策略配置向导</h3>
      <p class="subtitle">配置您的 AI 交易员投资策略</p>
    </div>

    <!-- Preset Templates -->
    <div class="preset-section">
      <h4>快速选择策略套餐</h4>
      <div class="preset-cards">
        <div
          v-for="preset in presets"
          :key="preset.id"
          class="preset-card"
          :class="{ active: selectedPreset === preset.id }"
          @click="applyPreset(preset)"
        >
          <div class="preset-icon">{{ preset.icon }}</div>
          <div class="preset-name">{{ preset.name }}</div>
          <div class="preset-desc">{{ preset.description }}</div>
        </div>
      </div>
    </div>

    <!-- Five Dimension Form -->
    <div class="form-section">
      <h4>五维度策略配置</h4>

      <!-- 1. Risk Tolerance -->
      <div class="form-group">
        <label class="form-label">
          <span class="dimension-number">1</span>
          风险承受能力
          <span class="required">*</span>
        </label>
        <div class="radio-group">
          <label
            v-for="option in riskOptions"
            :key="option.value"
            class="radio-card"
            :class="{ active: form.risk_tolerance === option.value }"
          >
            <input
              type="radio"
              v-model="form.risk_tolerance"
              :value="option.value"
              required
            />
            <span class="radio-icon">{{ option.icon }}</span>
            <span class="radio-text">{{ option.label }}</span>
            <span class="radio-desc">{{ option.description }}</span>
          </label>
        </div>
      </div>

      <!-- 2. Holding Period -->
      <div class="form-group">
        <label class="form-label">
          <span class="dimension-number">2</span>
          持仓周期
          <span class="required">*</span>
        </label>
        <div class="radio-group">
          <label
            v-for="option in holdingPeriodOptions"
            :key="option.value"
            class="radio-card"
            :class="{ active: form.holding_period === option.value }"
          >
            <input
              type="radio"
              v-model="form.holding_period"
              :value="option.value"
              required
            />
            <span class="radio-text">{{ option.label }}</span>
            <span class="radio-desc">{{ option.description }}</span>
          </label>
        </div>
      </div>

      <!-- 3. Sectors -->
      <div class="form-group">
        <label class="form-label">
          <span class="dimension-number">3</span>
          关注行业
          <span class="hint">(可多选)</span>
        </label>
        <div class="checkbox-grid">
          <label
            v-for="sector in sectorOptions"
            :key="sector.value"
            class="checkbox-card"
            :class="{ active: form.sectors.includes(sector.value) }"
          >
            <input
              type="checkbox"
              :value="sector.value"
              v-model="form.sectors"
            />
            <span class="checkbox-icon">{{ sector.icon }}</span>
            <span class="checkbox-text">{{ sector.label }}</span>
          </label>
        </div>
      </div>

      <!-- 4. Position Limit -->
      <div class="form-group">
        <label class="form-label">
          <span class="dimension-number">4</span>
          仓位限制
          <span class="required">*</span>
        </label>
        <div class="slider-group">
          <input
            type="range"
            v-model.number="positionLimitPercent"
            min="10"
            max="100"
            step="5"
            class="slider"
          />
          <div class="slider-labels">
            <span>10%</span>
            <span class="slider-value">单股不超过 {{ positionLimitPercent }}%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      <!-- 5. Stop Loss -->
      <div class="form-group">
        <label class="form-label">
          <span class="dimension-number">5</span>
          止损策略
          <span class="required">*</span>
        </label>
        <div class="slider-group">
          <input
            type="range"
            v-model.number="stopLossPercent"
            min="3"
            max="20"
            step="1"
            class="slider"
          />
          <div class="slider-labels">
            <span>3%</span>
            <span class="slider-value">{{ stopLossPercent }}% 止损</span>
            <span>20%</span>
          </div>
        </div>
      </div>

      <!-- Market Scope -->
      <div class="form-group">
        <label class="form-label">
          <span class="dimension-number">6</span>
          市场范围
        </label>
        <div class="checkbox-group">
          <label
            v-for="market in marketOptions"
            :key="market.value"
            class="checkbox-inline"
          >
            <input
              type="checkbox"
              :value="market.value"
              v-model="selectedMarkets"
            />
            <span>{{ market.label }}</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Summary -->
    <div class="summary-section">
      <h4>策略摘要</h4>
      <div class="summary-card">
        <div class="summary-item">
          <span class="summary-label">风险偏好:</span>
          <span class="summary-value">{{ form.risk_tolerance }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">持仓周期:</span>
          <span class="summary-value">{{ form.holding_period }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">关注行业:</span>
          <span class="summary-value">{{ form.sectors.join(', ') || '未选择' }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">仓位限制:</span>
          <span class="summary-value">单股不超过 {{ positionLimitPercent }}%</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">止损线:</span>
          <span class="summary-value">{{ stopLossPercent }}%</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">市场范围:</span>
          <span class="summary-value">{{ form.market_scope || '全部' }}</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="wizard-actions">
      <button
        type="button"
        class="btn-secondary"
        @click="resetForm"
        :disabled="loading"
      >
        重置
      </button>
      <button
        type="button"
        class="btn-primary"
        @click="submitForm"
        :disabled="!isValid || loading"
      >
        {{ loading ? '保存中...' : '保存策略' }}
      </button>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'

export interface StrategyFormData {
  risk_tolerance: string
  holding_period: string
  sectors: string[]
  position_limit: string
  stop_loss: string
  market_scope: string
}

interface Preset {
  id: string
  name: string
  description: string
  icon: string
  config: Partial<StrategyFormData>
}

const props = defineProps<{
  initialData?: Partial<StrategyFormData>
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [data: StrategyFormData]
  change: [data: StrategyFormData]
}>()

// Presets
const presets: Preset[] = [
  {
    id: 'conservative',
    name: '保守型',
    description: '低风险，稳健收益',
    icon: '🛡️',
    config: {
      risk_tolerance: '保守',
      holding_period: '长线',
      sectors: ['金融', '医药'],
      position_limit: '单股不超过20%',
      stop_loss: '5%止损',
    },
  },
  {
    id: 'balanced',
    name: '稳健型',
    description: '平衡风险与收益',
    icon: '⚖️',
    config: {
      risk_tolerance: '稳健',
      holding_period: '中线',
      sectors: ['科技', '消费', '医药'],
      position_limit: '单股不超过30%',
      stop_loss: '8%止损',
    },
  },
  {
    id: 'aggressive',
    name: '激进型',
    description: '高风险，追求高收益',
    icon: '🚀',
    config: {
      risk_tolerance: '积极',
      holding_period: '短线',
      sectors: ['科技', '能源', '材料'],
      position_limit: '单股不超过50%',
      stop_loss: '15%止损',
    },
  },
]

// Options
const riskOptions = [
  { value: '保守', label: '保守', icon: '🛡️', description: '优先保本，低风险承受' },
  { value: '稳健', label: '稳健', icon: '⚖️', description: '平衡配置，中等风险' },
  { value: '积极', label: '积极', icon: '🚀', description: '追求收益，较高风险承受' },
]

const holdingPeriodOptions = [
  { value: '短线', label: '短线', description: '1-5天，高频交易' },
  { value: '中线', label: '中线', description: '1-4周，波段操作' },
  { value: '长线', label: '长线', description: '1月以上，价值投资' },
]

const sectorOptions = [
  { value: '金融', label: '金融', icon: '🏦' },
  { value: '科技', label: '科技', icon: '💻' },
  { value: '医药', label: '医药', icon: '💊' },
  { value: '消费', label: '消费', icon: '🛒' },
  { value: '能源', label: '能源', icon: '⚡' },
  { value: '材料', label: '材料', icon: '🏭' },
  { value: '工业', label: '工业', icon: '🔧' },
  { value: '地产', label: '地产', icon: '🏠' },
]

const marketOptions = [
  { value: '主板', label: '主板' },
  { value: '创业板', label: '创业板' },
  { value: '科创板', label: '科创板' },
  { value: '北交所', label: '北交所' },
]

// State
const selectedPreset = ref<string | null>(null)
const positionLimitPercent = ref(30)
const stopLossPercent = ref(8)
const selectedMarkets = ref<string[]>(['主板', '创业板'])
const error = ref<string | null>(null)

const form = reactive<StrategyFormData>({
  risk_tolerance: '稳健',
  holding_period: '中线',
  sectors: [],
  position_limit: '单股不超过30%',
  stop_loss: '8%止损',
  market_scope: '主板+创业板',
})

// Initialize from props
if (props.initialData) {
  Object.assign(form, props.initialData)
}

// Computed
const isValid = computed(() => {
  return (
    form.risk_tolerance &&
    form.holding_period &&
    form.position_limit &&
    form.stop_loss
  )
})

// Watchers
watch(positionLimitPercent, (val) => {
  form.position_limit = `单股不超过${val}%`
})

watch(stopLossPercent, (val) => {
  form.stop_loss = `${val}%止损`
})

watch(selectedMarkets, (val) => {
  form.market_scope = val.join('+')
}, { immediate: true })

watch(form, (val) => {
  emit('change', { ...val })
}, { deep: true })

// Methods
function applyPreset(preset: Preset) {
  selectedPreset.value = preset.id
  if (preset.config.risk_tolerance) {
    form.risk_tolerance = preset.config.risk_tolerance
  }
  if (preset.config.holding_period) {
    form.holding_period = preset.config.holding_period
  }
  if (preset.config.sectors) {
    form.sectors = [...preset.config.sectors]
  }
  if (preset.config.position_limit) {
    form.position_limit = preset.config.position_limit
    const match = preset.config.position_limit.match(/(\d+)/)
    if (match) {
      positionLimitPercent.value = parseInt(match[1])
    }
  }
  if (preset.config.stop_loss) {
    form.stop_loss = preset.config.stop_loss
    const match = preset.config.stop_loss.match(/(\d+)/)
    if (match) {
      stopLossPercent.value = parseInt(match[1])
    }
  }
}

function resetForm() {
  selectedPreset.value = null
  form.risk_tolerance = '稳健'
  form.holding_period = '中线'
  form.sectors = []
  positionLimitPercent.value = 30
  stopLossPercent.value = 8
  selectedMarkets.value = ['主板', '创业板']
  error.value = null
}

function submitForm() {
  if (!isValid.value) {
    error.value = '请填写所有必填项'
    return
  }
  error.value = null
  emit('submit', { ...form })
}
</script>

<style scoped>
.strategy-wizard {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.wizard-header {
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #eee;
}

.wizard-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.25rem;
}

.subtitle {
  margin: 0.5rem 0 0;
  color: #666;
  font-size: 0.875rem;
}

/* Preset Section */
.preset-section {
  margin-bottom: 2rem;
}

.preset-section h4 {
  margin: 0 0 1rem;
  color: #2c3e50;
  font-size: 1rem;
}

.preset-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
}

.preset-card {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-card:hover {
  border-color: #2c3e50;
}

.preset-card.active {
  border-color: #2c3e50;
  background: #f8f9fa;
}

.preset-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.preset-name {
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 0.25rem;
}

.preset-desc {
  font-size: 0.75rem;
  color: #666;
}

/* Form Section */
.form-section {
  margin-bottom: 2rem;
}

.form-section h4 {
  margin: 0 0 1.5rem;
  color: #2c3e50;
  font-size: 1rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-weight: 500;
  color: #333;
}

.dimension-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: #2c3e50;
  color: white;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 600;
}

.required {
  color: #f44336;
}

.hint {
  color: #666;
  font-size: 0.75rem;
  font-weight: normal;
}

/* Radio Group */
.radio-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
}

.radio-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.radio-card:hover {
  border-color: #2c3e50;
}

.radio-card.active {
  border-color: #2c3e50;
  background: #f8f9fa;
}

.radio-card input {
  display: none;
}

.radio-icon {
  font-size: 1.5rem;
}

.radio-text {
  font-weight: 500;
  color: #2c3e50;
}

.radio-desc {
  font-size: 0.75rem;
  color: #666;
}

/* Checkbox Grid */
.checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 0.75rem;
}

.checkbox-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.checkbox-card:hover {
  border-color: #2c3e50;
}

.checkbox-card.active {
  border-color: #2c3e50;
  background: #f8f9fa;
}

.checkbox-card input {
  display: none;
}

.checkbox-icon {
  font-size: 1.25rem;
}

.checkbox-text {
  font-size: 0.875rem;
  color: #333;
}

/* Slider */
.slider-group {
  padding: 0.5rem 0;
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #e0e0e0;
  outline: none;
  -webkit-appearance: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2c3e50;
  cursor: pointer;
}

.slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2c3e50;
  cursor: pointer;
  border: none;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #666;
}

.slider-value {
  font-weight: 600;
  color: #2c3e50;
}

/* Checkbox Group */
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.checkbox-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.checkbox-inline input {
  width: 16px;
  height: 16px;
}

/* Summary */
.summary-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.summary-section h4 {
  margin: 0 0 1rem;
  color: #2c3e50;
  font-size: 1rem;
}

.summary-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}

.summary-label {
  color: #666;
}

.summary-value {
  font-weight: 500;
  color: #2c3e50;
}

/* Actions */
.wizard-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.btn-primary {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: #34495e;
}

.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
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

.btn-secondary:hover:not(:disabled) {
  background: #d0d0d0;
}

/* Error */
.error-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #ffebee;
  color: #d32f2f;
  border-radius: 4px;
  font-size: 0.875rem;
}

/* Responsive */
@media (max-width: 768px) {
  .preset-cards {
    grid-template-columns: 1fr;
  }

  .radio-group {
    grid-template-columns: 1fr;
  }

  .summary-card {
    grid-template-columns: 1fr;
  }

  .wizard-actions {
    flex-direction: column;
  }

  .btn-primary,
  .btn-secondary {
    width: 100%;
  }
}
</style>
