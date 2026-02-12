<template>
  <view class="create-manager-page">
    <view class="form-card">
      <view class="form-item">
        <text class="label required">基金经理名称</text>
        <input
          class="input"
          v-model="form.name"
          placeholder="请输入基金经理名称"
          maxlength="20"
        />
      </view>

      <view class="form-item">
        <text class="label required">毕业院校</text>
        <picker mode="selector" :range="providerOptions" :value="providerIndex" @change="onProviderChange">
          <view class="picker" :class="{ 'placeholder': providerIndex === -1 }">
            {{ providerIndex === -1 ? '请选择毕业院校' : providerOptions[providerIndex] }}
            <text class="arrow">></text>
          </view>
        </picker>
      </view>

      <view class="form-item">
        <text class="label required">初始资金</text>
        <view class="input-with-unit">
          <input
            class="input"
            v-model="form.initialBalance"
            placeholder="请输入初始资金"
            type="digit"
          />
          <text class="unit">元</text>
        </view>
        <text class="hint">可用资金: {{ formatMoney(availableBalance) }}</text>
      </view>

      <view class="form-item">
        <text class="label required">风险等级</text>
        <view class="risk-options">
          <view
            class="risk-item"
            v-for="risk in riskLevels"
            :key="risk.value"
            :class="{ active: form.riskLevel === risk.value }"
            @click="form.riskLevel = risk.value"
          >
            <text class="risk-name">{{ risk.label }}</text>
            <text class="risk-desc">{{ risk.desc }}</text>
          </view>
        </view>
      </view>

      <view class="form-item">
        <text class="label">每日最大决策次数</text>
        <slider
          class="slider"
          :value="form.maxDailyDecisions"
          :min="1"
          :max="20"
          :show-value="true"
          @change="onSliderChange"
        />
      </view>

      <view class="form-item">
        <text class="label">API密钥 (可选)</text>
        <input
          class="input"
          v-model="form.apiKey"
          placeholder="如需使用自己的API密钥，请在此输入"
          password
        />
        <text class="hint">不填写则使用系统默认API</text>
      </view>
    </view>

    <view class="tips-card">
      <text class="tips-title">💡 温馨提示</text>
      <text class="tips-item">• 基金经理创建后不可更改毕业院校</text>
      <text class="tips-item">• 初始资金将从您的基金可用资金中扣除</text>
      <text class="tips-item">• 不同院校的AI模型有不同的投资风格</text>
    </view>

    <button
      class="submit-btn"
      :class="{ 'btn-disabled': !canSubmit || loading }"
      :disabled="!canSubmit || loading"
      @click="handleSubmit"
    >
      <text v-if="!loading">确认聘任</text>
      <text v-else>创建中...</text>
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useTradingStore } from '@/stores/trading'
import { formatMoney } from '@/utils/formatter'
import { MODEL_PROVIDERS, RISK_LEVELS } from '@/utils/constants'
import { validateManagerName, validateInitialBalance } from '@/utils/validator'
import type { ModelProvider, RiskLevel } from '@/types/ai'

const aiStore = useAIStore()
const tradingStore = useTradingStore()
const loading = ref(false)

const providerOptions = MODEL_PROVIDERS.map(p => `${p.label} - ${p.university}`)
const riskLevels = RISK_LEVELS

const form = ref({
  name: '',
  modelProvider: '' as ModelProvider,
  modelName: '',
  initialBalance: '',
  riskLevel: 'moderate' as RiskLevel,
  maxDailyDecisions: 5,
  apiKey: '',
})

const providerIndex = ref(-1)
const availableBalance = computed(() => tradingStore.cashBalance)

const canSubmit = computed(() => {
  return form.value.name &&
         form.value.modelProvider &&
         form.value.initialBalance &&
         form.value.riskLevel
})

function onProviderChange(e: any) {
  providerIndex.value = e.detail.value
  const provider = MODEL_PROVIDERS[e.detail.value]
  form.value.modelProvider = provider.value as ModelProvider
  form.value.modelName = provider.label
}

function onSliderChange(e: any) {
  form.value.maxDailyDecisions = e.detail.value
}

async function handleSubmit() {
  // 验证名称
  const nameValid = validateManagerName(form.value.name)
  if (!nameValid.valid) {
    uni.showToast({ title: nameValid.message, icon: 'none' })
    return
  }

  // 验证资金
  const balance = parseFloat(form.value.initialBalance)
  const balanceValid = validateInitialBalance(balance, availableBalance.value)
  if (!balanceValid.valid) {
    uni.showToast({ title: balanceValid.message, icon: 'none' })
    return
  }

  loading.value = true
  const success = await aiStore.createAccount({
    name: form.value.name,
    modelProvider: form.value.modelProvider,
    modelName: form.value.modelName,
    initialBalance: balance,
    riskLevel: form.value.riskLevel,
    maxDailyDecisions: form.value.maxDailyDecisions,
    apiKey: form.value.apiKey || undefined,
  })
  loading.value = false

  if (success) {
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
  }
}
</script>

<style lang="scss" scoped>
.create-manager-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
  padding-bottom: 160rpx;
}

.form-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
}

.form-item {
  margin-bottom: 32rpx;

  &:last-child {
    margin-bottom: 0;
  }

  .label {
    display: block;
    font-size: 28rpx;
    color: #262626;
    margin-bottom: 16rpx;
    font-weight: 500;

    &.required::after {
      content: '*';
      color: #ff4d4f;
      margin-left: 8rpx;
    }
  }

  .input {
    height: 88rpx;
    background: #f5f5f5;
    border-radius: 12rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    color: #262626;
  }

  .input-with-unit {
    display: flex;
    align-items: center;
    background: #f5f5f5;
    border-radius: 12rpx;
    padding-right: 24rpx;

    .input {
      flex: 1;
      background: transparent;
    }

    .unit {
      font-size: 28rpx;
      color: #8c8c8c;
    }
  }

  .picker {
    height: 88rpx;
    line-height: 88rpx;
    background: #f5f5f5;
    border-radius: 12rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    color: #262626;
    display: flex;
    justify-content: space-between;
    align-items: center;

    &.placeholder {
      color: #999999;
    }

    .arrow {
      color: #999999;
      font-size: 28rpx;
    }
  }

  .hint {
    display: block;
    font-size: 24rpx;
    color: #8c8c8c;
    margin-top: 12rpx;
  }
}

.risk-options {
  display: flex;
  flex-direction: column;
  gap: 16rpx;

  .risk-item {
    padding: 24rpx;
    background: #f5f5f5;
    border-radius: 12rpx;
    border: 2rpx solid transparent;

    &.active {
      background: rgba(24, 144, 255, 0.05);
      border-color: #1890ff;
    }

    .risk-name {
      display: block;
      font-size: 30rpx;
      font-weight: 500;
      color: #262626;
      margin-bottom: 8rpx;
    }

    .risk-desc {
      display: block;
      font-size: 24rpx;
      color: #8c8c8c;
    }
  }
}

.slider {
  margin: 16rpx 0;
}

.tips-card {
  background: rgba(24, 144, 255, 0.05);
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 48rpx;

  .tips-title {
    display: block;
    font-size: 28rpx;
    font-weight: 500;
    color: #1890ff;
    margin-bottom: 16rpx;
  }

  .tips-item {
    display: block;
    font-size: 26rpx;
    color: #595959;
    line-height: 1.8;
  }
}

.submit-btn {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: 48rpx;
  height: 96rpx;
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  border-radius: 48rpx;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;

  &:active {
    opacity: 0.9;
  }

  &.btn-disabled {
    background: #d9d9d9;
  }
}
</style>
