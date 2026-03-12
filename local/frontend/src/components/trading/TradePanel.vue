<template>
  <div class="trade-panel">
    <!-- Action Toggle -->
    <div class="trade-tabs">
      <button
        class="trade-tab"
        :class="{ active: action === 'buy' }"
        @click="action = 'buy'"
      >
        买入
      </button>
      <button
        class="trade-tab"
        :class="{ active: action === 'sell' }"
        @click="action = 'sell'"
      >
        卖出
      </button>
    </div>

    <!-- Trade Form -->
    <form class="trade-form" @submit.prevent="handleSubmit">
      <div class="form-group">
        <label>股票代码</label>
        <input
          v-model="form.symbol"
          type="text"
          placeholder="如: 600000.SH"
          required
          :disabled="submitting"
          @input="handleSymbolInput"
          @blur="formatSymbolOnBlur"
        />
        <span v-if="symbolError" class="error-text">{{ symbolError }}</span>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>价格 (¥)</label>
          <input
            v-model.number="form.price"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            required
            :disabled="submitting"
          />
        </div>
        <div class="form-group">
          <label>数量</label>
          <input
            v-model.number="form.quantity"
            type="number"
            min="1"
            step="1"
            placeholder="100"
            required
            :disabled="submitting"
          />
        </div>
      </div>

      <!-- Quick Quantity Buttons -->
      <div class="quick-quantity">
        <button
          v-for="qty in quickQuantities"
          :key="qty"
          type="button"
          class="qty-btn"
          :class="{ disabled: isQuantityDisabled(qty), 'exceeds-position': action === 'sell' && qty > maxSellableQuantity && maxSellableQuantity > 0 }"
          :disabled="submitting || isQuantityDisabled(qty)"
          @click="form.quantity = Math.min(qty, action === 'sell' ? maxSellableQuantity : Infinity)"
        >
          {{ qty }}
        </button>
      </div>

      <!-- Position Info (for Sell) -->
      <div v-if="action === 'sell' && currentPosition" class="position-info">
        <div class="position-row">
          <span class="label">可卖数量:</span>
          <span class="value">{{ currentPosition.quantity }} 股</span>
        </div>
        <div class="position-row">
          <span class="label">持仓成本:</span>
          <span class="value">¥{{ currentPosition.avg_cost.toFixed(2) }}</span>
        </div>
      </div>

      <!-- Total Amount Preview -->
      <div class="total-preview">
        <span class="label">预计金额:</span>
        <span class="value" :class="action">¥{{ totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</span>
      </div>

      <!-- Error Message -->
      <div v-if="error" class="error-message">
        <span class="error-icon">⚠</span>
        {{ error }}
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        class="btn-submit"
        :class="action"
        :disabled="submitting || !isValid"
      >
        <span v-if="submitting" class="spinner-small"></span>
        <span v-else>{{ action === 'buy' ? '买入' : '卖出' }}</span>
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TradeCreate } from '../../api/trading'

interface Position {
  symbol: string
  quantity: number
  avg_cost: number
}

const props = defineProps<{
  agentId: string
  positions: Position[]
  submitting: boolean
  error: string | null
}>()

const emit = defineEmits<{
  submit: [action: 'buy' | 'sell', data: TradeCreate]
  clearError: []
}>()

const action = ref<'buy' | 'sell'>('buy')
const symbolError = ref('')

const form = ref<TradeCreate>({
  symbol: '',
  action: 'buy',
  quantity: 100,
  price: 0,
})

const quickQuantities = [100, 200, 500, 1000]

const currentPosition = computed(() => {
  if (action.value === 'buy') return null
  return props.positions.find(p => p.symbol === form.value.symbol.toUpperCase().trim())
})

const maxSellableQuantity = computed(() => {
  return currentPosition.value?.quantity || 0
})

function isQuantityDisabled(qty: number): boolean {
  if (action.value === 'buy') return false
  return qty > maxSellableQuantity.value
}

const totalAmount = computed(() => {
  return form.value.price * form.value.quantity
})

const isValid = computed(() => {
  return form.value.symbol.trim() &&
    form.value.price > 0 &&
    form.value.quantity > 0 &&
    (action.value === 'buy' || (currentPosition.value && form.value.quantity <= currentPosition.value.quantity))
})

// Watch action change
watch(action, (newAction) => {
  form.value.action = newAction
  emit('clearError')
})

// Watch positions for sell validation
watch(() => props.positions, () => {
  if (action.value === 'sell' && form.value.symbol) {
    validateSellQuantity()
  }
}, { deep: true })

function handleSymbolInput(e: Event) {
  const input = e.target as HTMLInputElement
  // 实时格式化为大写
  form.value.symbol = input.value.toUpperCase()
  symbolError.value = ''
  if (action.value === 'sell') {
    validateSellQuantity()
  }
}

function formatSymbolOnBlur() {
  // 失去焦点时清理格式
  form.value.symbol = form.value.symbol.trim().toUpperCase()
}

function validateSellQuantity() {
  if (!currentPosition.value) {
    symbolError.value = '未持有该股票'
    return false
  }
  if (form.value.quantity > currentPosition.value.quantity) {
    symbolError.value = `最多可卖 ${currentPosition.value.quantity} 股`
    return false
  }
  return true
}

function handleSubmit() {
  if (action.value === 'sell' && !validateSellQuantity()) {
    return
  }

  emit('submit', action.value, {
    symbol: form.value.symbol.toUpperCase().trim(),
    action: action.value,
    quantity: form.value.quantity,
    price: form.value.price,
  })
}
</script>

<style scoped>
.trade-panel {
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
}

/* Tabs */
.trade-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}

.trade-tab {
  padding: var(--space-3) var(--space-4);
  background: var(--surface-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.trade-tab:hover {
  border-color: var(--border-accent);
  color: var(--text-primary);
}

.trade-tab.active {
  background: var(--up-bg);
  border-color: var(--up-primary);
  color: var(--up-primary);
}

.trade-tab.active:nth-child(2) {
  background: var(--down-bg);
  border-color: var(--down-primary);
  color: var(--down-primary);
}

/* Form */
.trade-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.form-group label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-group input {
  padding: var(--space-3);
  background: var(--surface-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--text-base);
  font-family: var(--font-mono);
  transition: all var(--transition-fast);
}

.form-group input:focus {
  outline: none;
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1);
}

.form-group input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.error-text {
  font-size: var(--text-xs);
  color: var(--down-primary);
}

/* Quick Quantity */
.quick-quantity {
  display: flex;
  gap: var(--space-2);
}

.qty-btn {
  flex: 1;
  padding: var(--space-2);
  background: var(--surface-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.qty-btn:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: var(--accent-cyan-bg);
}

.qty-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.qty-btn.exceeds-position {
  background: rgba(255, 71, 87, 0.1);
  border-color: rgba(255, 71, 87, 0.3);
  color: var(--down-primary);
}

.qty-btn.exceeds-position:hover {
  background: rgba(255, 71, 87, 0.15);
}

/* Position Info */
.position-info {
  background: var(--surface-secondary);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.position-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
}

.position-row .label {
  color: var(--text-muted);
}

.position-row .value {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-weight: var(--font-medium);
}

/* Total Preview */
.total-preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4);
  background: var(--surface-secondary);
  border-radius: var(--radius-md);
}

.total-preview .label {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.total-preview .value {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
}

.total-preview .value.buy {
  color: var(--up-primary);
}

.total-preview .value.sell {
  color: var(--down-primary);
}

/* Error Message */
.error-message {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--down-bg);
  border: 1px solid rgba(255, 71, 87, 0.3);
  border-radius: var(--radius-md);
  color: var(--down-primary);
  font-size: var(--text-sm);
}

.error-icon {
  font-size: var(--text-base);
}

/* Submit Button */
.btn-submit {
  padding: var(--space-4);
  border: none;
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  font-weight: var(--font-bold);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}

.btn-submit.buy {
  background: linear-gradient(135deg, var(--up-primary) 0%, var(--up-secondary) 100%);
  color: white;
  box-shadow: 0 4px 15px var(--up-glow);
}

.btn-submit.buy:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px var(--up-glow);
}

.btn-submit.sell {
  background: linear-gradient(135deg, var(--down-primary) 0%, var(--down-secondary) 100%);
  color: white;
  box-shadow: 0 4px 15px var(--down-glow);
}

.btn-submit.sell:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px var(--down-glow);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
