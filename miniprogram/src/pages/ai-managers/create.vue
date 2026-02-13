<template>
  <view class="hire-trader-page">
    <view class="header-section">
      <view class="header-bg"></view>
      <view class="header-content">
        <text class="page-title">招聘交易员</text>
        <text class="page-subtitle">为您的投资团队注入AI力量</text>
      </view>
    </view>

    <view class="content-section">
      <view class="avatar-selection">
        <text class="section-title">选择交易员形象</text>
        <view class="avatar-grid">
          <view
            class="avatar-item"
            v-for="(avatar, index) in avatars"
            :key="index"
            :class="{ active: selectedAvatar === index }"
            @click="selectAvatar(index)"
          >
            <view class="avatar-wrapper">
              <text class="avatar-emoji">{{ avatar.emoji }}</text>
              <view class="avatar-badge" v-if="selectedAvatar === index">
                <text class="badge-icon">✓</text>
              </view>
            </view>
            <text class="avatar-name">{{ avatar.name }}</text>
            <text class="avatar-style">{{ avatar.style }}</text>
          </view>
        </view>
      </view>

      <view class="form-card">
        <view class="form-item">
          <text class="label required">交易员姓名</text>
          <input
            class="input"
            v-model="form.name"
            placeholder="给您的交易员起个名字"
            maxlength="20"
          />
        </view>

        <view class="form-item">
          <text class="label required">毕业院校</text>
          <picker mode="selector" :range="providerOptions" :value="providerIndex" @change="onProviderChange">
            <view class="picker" :class="{ 'placeholder': providerIndex === -1 }">
              <view class="picker-content">
                <text class="picker-icon">{{ providerIndex === -1 ? '🎓' : getProviderIcon(providerIndex) }}</text>
                <text class="picker-text">{{ providerIndex === -1 ? '请选择毕业院校' : providerOptions[providerIndex] }}</text>
              </view>
              <text class="arrow">›</text>
            </view>
          </picker>
          <view class="provider-preview" v-if="providerIndex !== -1">
            <text class="preview-title">院校特色</text>
            <view class="preview-tags">
              <text class="preview-tag" v-for="tag in getProviderTags(providerIndex)" :key="tag">{{ tag }}</text>
            </view>
          </view>
        </view>

        <view class="form-item">
          <text class="label required">启动元宝</text>
          <view class="balance-card">
            <view class="balance-input">
              <text class="currency-symbol">💰</text>
              <input
                class="input"
                v-model="form.initialBalance"
                placeholder="0"
                type="digit"
              />
            </view>
            <view class="balance-info">
              <text class="available-text">可用元宝</text>
              <text class="available-amount">{{ formatMoney(availableBalance) }}</text>
            </view>
          </view>
        </view>

        <view class="form-item">
          <text class="label required">性格特征</text>
          <view class="personality-grid">
            <view
              class="personality-card"
              v-for="personality in personalities"
              :key="personality.value"
              :class="{ active: form.riskLevel === personality.value }"
              @click="form.riskLevel = personality.value as RiskLevel"
            >
              <text class="personality-icon">{{ personality.icon }}</text>
              <text class="personality-name">{{ personality.name }}</text>
              <text class="personality-desc">{{ personality.desc }}</text>
              <view class="personality-stats">
                <view class="stat-item">
                  <text class="stat-label">风险</text>
                  <view class="stat-bar">
                    <view class="stat-fill" :style="{ width: personality.riskLevel + '%' }"></view>
                  </view>
                </view>
                <view class="stat-item">
                  <text class="stat-label">收益</text>
                  <view class="stat-bar">
                    <view class="stat-fill" :style="{ width: personality.profitLevel + '%' }"></view>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view class="form-item">
          <text class="label">工作强度</text>
          <view class="intensity-slider">
            <view class="slider-header">
              <text class="slider-label">每日最大决策次数</text>
              <text class="slider-value">{{ form.maxDailyDecisions }}次</text>
            </view>
            <slider
              class="slider"
              :value="form.maxDailyDecisions"
              :min="1"
              :max="20"
              activeColor="#667eea"
              backgroundColor="#e0e0e0"
              block-size="20"
              @change="onSliderChange"
            />
            <view class="slider-labels">
              <text class="label-item">轻松</text>
              <text class="label-item">适中</text>
              <text class="label-item">勤奋</text>
            </view>
          </view>
        </view>

        <view class="form-item">
          <text class="label">API密钥 (可选)</text>
          <view class="api-key-card">
            <input
              class="input"
              v-model="form.apiKey"
              placeholder="使用自己的API密钥"
              password
            />
            <text class="api-hint">不填写则使用系统默认API</text>
          </view>
        </view>
      </view>

      <view class="summary-card">
        <text class="summary-title">招聘概览</text>
        <view class="summary-item">
          <text class="summary-label">交易员</text>
          <text class="summary-value">{{ form.name || '未命名' }}</text>
        </view>
        <view class="summary-item">
          <text class="summary-label">院校</text>
          <text class="summary-value">{{ providerIndex === -1 ? '未选择' : providerOptions[providerIndex].split(' - ')[0] }}</text>
        </view>
        <view class="summary-item">
          <text class="summary-label">启动元宝</text>
          <text class="summary-value highlight">{{ form.initialBalance ? '💰 ' + formatMoney(parseFloat(form.initialBalance)) + ' 元宝' : '💰 0 元宝' }}</text>
        </view>
        <view class="summary-item">
          <text class="summary-label">性格</text>
          <text class="summary-value">{{ getSelectedPersonality()?.name || '未选择' }}</text>
        </view>
      </view>

      <view class="tips-card">
        <text class="tips-title">💡 招聘小贴士</text>
        <text class="tips-item">• 交易员聘任后不可更改毕业院校</text>
        <text class="tips-item">• 启动元宝将从您的可用元宝中扣除</text>
        <text class="tips-item">• 不同院校的AI模型有不同的投资风格</text>
        <text class="tips-item">• 性格特征会影响交易员的决策风格</text>
      </view>
    </view>

    <view class="footer-section">
      <button
        class="submit-btn"
        :class="{ 'btn-disabled': !canSubmit || loading }"
        :disabled="!canSubmit || loading"
        @click="handleSubmit"
      >
        <text v-if="!loading" class="btn-text">确认聘任</text>
        <view v-else class="btn-loading">
          <text class="loading-icon">⟳</text>
          <text class="loading-text">正在聘任...</text>
        </view>
      </button>
    </view>
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

const avatars = [
  { emoji: '👨‍💼', name: '稳重型', style: '保守稳健' },
  { emoji: '👨‍💻', name: '技术型', style: '数据驱动' },
  { emoji: '👨‍🎓', name: '学者型', style: '理性分析' },
  { emoji: '👨‍🔬', name: '研究型', style: '深度调研' },
  { emoji: '👨‍🚀', name: '激进型', style: '快速反应' },
  { emoji: '👨‍⚖️', name: '平衡型', style: '稳健进取' },
]

const personalities = [
  { 
    value: 'conservative', 
    name: '保守稳健', 
    icon: '🛡️', 
    desc: '优先保护本金，追求稳定收益',
    riskLevel: 30,
    profitLevel: 40,
  },
  { 
    value: 'moderate', 
    name: '稳健进取', 
    icon: '⚖️', 
    desc: '平衡风险与收益，稳健增长',
    riskLevel: 50,
    profitLevel: 60,
  },
  { 
    value: 'aggressive', 
    name: '激进成长', 
    icon: '🚀', 
    desc: '追求高收益，承担较高风险',
    riskLevel: 80,
    profitLevel: 85,
  },
]

const form = ref({
  name: '',
  modelProvider: '' as ModelProvider,
  modelName: '',
  initialBalance: '',
  riskLevel: 'moderate' as RiskLevel,
  maxDailyDecisions: 5,
  apiKey: '',
})

const selectedAvatar = ref(0)
const providerIndex = ref(-1)
const availableBalance = computed(() => tradingStore.cashBalance)

const canSubmit = computed(() => {
  return form.value.name &&
         form.value.modelProvider &&
         form.value.initialBalance &&
         form.value.riskLevel
})

function selectAvatar(index: number) {
  selectedAvatar.value = index
}

function onProviderChange(e: any) {
  providerIndex.value = e.detail.value
  const provider = MODEL_PROVIDERS[e.detail.value]
  form.value.modelProvider = provider.value as ModelProvider
  form.value.modelName = provider.label
}

function onSliderChange(e: any) {
  form.value.maxDailyDecisions = e.detail.value
}

function getProviderIcon(index: number): string {
  const icons = ['🏛️', '🎓', '🔬', '💻', '🌐', '🧠']
  return icons[index % icons.length]
}

function getProviderTags(index: number): string[] {
  const tags = [
    ['稳健', '保守'],
    ['创新', '激进'],
    ['技术', '数据'],
    ['分析', '研究'],
    ['智能', '学习'],
    ['平衡', '全面'],
  ]
  return tags[index % tags.length]
}

function getSelectedPersonality() {
  return personalities.find(p => p.value === form.value.riskLevel)
}

async function handleSubmit() {
  const nameValid = validateManagerName(form.value.name)
  if (!nameValid.valid) {
    uni.showToast({ title: nameValid.message, icon: 'none' })
    return
  }

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
    uni.showToast({ 
      title: '聘任成功！', 
      icon: 'success',
      duration: 2000,
    })
    setTimeout(() => {
      uni.navigateBack()
    }, 2000)
  }
}
</script>

<style lang="scss" scoped>
.hire-trader-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0f4ff 0%, #ffffff 100%);
  padding-bottom: 180rpx;
}

.header-section {
  position: relative;
  padding: 60rpx 32rpx 40rpx;
  overflow: hidden;

  .header-bg {
    position: absolute;
    top: -200rpx;
    left: -200rpx;
    right: -200rpx;
    height: 400rpx;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    filter: blur(60rpx);
    opacity: 0.3;
  }

  .header-content {
    position: relative;
    z-index: 1;

    .page-title {
      display: block;
      font-size: 48rpx;
      font-weight: bold;
      color: #1a1a2e;
      margin-bottom: 12rpx;
    }

    .page-subtitle {
      display: block;
      font-size: 28rpx;
      color: #666680;
    }
  }
}

.content-section {
  padding: 0 32rpx;
}

.avatar-selection {
  margin-bottom: 32rpx;

  .section-title {
    display: block;
    font-size: 32rpx;
    font-weight: 600;
    color: #1a1a2e;
    margin-bottom: 24rpx;
  }

  .avatar-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20rpx;

    .avatar-item {
      background: #ffffff;
      border-radius: 20rpx;
      padding: 24rpx 16rpx;
      text-align: center;
      border: 3rpx solid transparent;
      transition: all 0.3s ease;
      box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);

      &.active {
        border-color: #667eea;
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
        transform: translateY(-4rpx);
        box-shadow: 0 8rpx 24rpx rgba(102, 126, 234, 0.2);
      }

      &:active {
        transform: scale(0.96);
      }

      .avatar-wrapper {
        position: relative;
        margin-bottom: 12rpx;

        .avatar-emoji {
          font-size: 72rpx;
          display: block;
        }

        .avatar-badge {
          position: absolute;
          top: -8rpx;
          right: -8rpx;
          width: 40rpx;
          height: 40rpx;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.4);

          .badge-icon {
            color: #ffffff;
            font-size: 24rpx;
            font-weight: bold;
          }
        }
      }

      .avatar-name {
        display: block;
        font-size: 26rpx;
        font-weight: 600;
        color: #1a1a2e;
        margin-bottom: 4rpx;
      }

      .avatar-style {
        display: block;
        font-size: 22rpx;
        color: #8c8c9c;
      }
    }
  }
}

.form-card {
  background: #ffffff;
  border-radius: 24rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.06);
}

.form-item {
  margin-bottom: 40rpx;

  &:last-child {
    margin-bottom: 0;
  }

  .label {
    display: block;
    font-size: 30rpx;
    color: #1a1a2e;
    margin-bottom: 20rpx;
    font-weight: 600;

    &.required::after {
      content: '*';
      color: #ff4757;
      margin-left: 8rpx;
    }
  }

  .input {
    height: 96rpx;
    background: #f8f9fa;
    border-radius: 16rpx;
    padding: 0 28rpx;
    font-size: 30rpx;
    color: #1a1a2e;
    border: 2rpx solid transparent;
    transition: all 0.3s ease;

    &:focus {
      background: #ffffff;
      border-color: #667eea;
      box-shadow: 0 0 0 4rpx rgba(102, 126, 234, 0.1);
    }
  }

  .picker {
    height: 96rpx;
    background: #f8f9fa;
    border-radius: 16rpx;
    padding: 0 28rpx;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border: 2rpx solid transparent;
    transition: all 0.3s ease;

    &.placeholder {
      .picker-text {
        color: #8c8c9c;
      }
    }

    &:active {
      background: #ffffff;
      border-color: #667eea;
    }

    .picker-content {
      display: flex;
      align-items: center;
      gap: 16rpx;

      .picker-icon {
        font-size: 36rpx;
      }

      .picker-text {
        font-size: 30rpx;
        color: #1a1a2e;
      }
    }

    .arrow {
      font-size: 36rpx;
      color: #8c8c9c;
      font-weight: 300;
    }
  }

  .provider-preview {
    margin-top: 16rpx;
    padding: 20rpx;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
    border-radius: 12rpx;

    .preview-title {
      display: block;
      font-size: 24rpx;
      color: #666680;
      margin-bottom: 12rpx;
    }

    .preview-tags {
      display: flex;
      gap: 12rpx;
      flex-wrap: wrap;

      .preview-tag {
        padding: 8rpx 16rpx;
        background: rgba(102, 126, 234, 0.1);
        color: #667eea;
        border-radius: 8rpx;
        font-size: 22rpx;
        font-weight: 500;
      }
    }
  }

  .balance-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 20rpx;
    padding: 28rpx;
    box-shadow: 0 8rpx 24rpx rgba(102, 126, 234, 0.3);

    .balance-input {
      display: flex;
      align-items: center;
      margin-bottom: 16rpx;

      .currency-symbol {
        font-size: 48rpx;
        font-weight: bold;
        color: #ffffff;
        margin-right: 16rpx;
      }

      .input {
        flex: 1;
        height: auto;
        background: transparent;
        padding: 0;
        font-size: 48rpx;
        font-weight: bold;
        color: #ffffff;
        border: none;

        &:focus {
          background: transparent;
          border: none;
          box-shadow: none;
        }
      }
    }

    .balance-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 16rpx;
      border-top: 1rpx solid rgba(255, 255, 255, 0.2);

      .available-text {
        font-size: 24rpx;
        color: rgba(255, 255, 255, 0.8);
      }

      .available-amount {
        font-size: 28rpx;
        font-weight: 600;
        color: #ffffff;
      }
    }
  }

  .personality-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16rpx;

    .personality-card {
      background: #f8f9fa;
      border-radius: 16rpx;
      padding: 24rpx;
      border: 3rpx solid transparent;
      transition: all 0.3s ease;

      &.active {
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
        border-color: #667eea;
        box-shadow: 0 4rpx 16rpx rgba(102, 126, 234, 0.15);
      }

      &:active {
        transform: scale(0.98);
      }

      .personality-icon {
        display: block;
        font-size: 48rpx;
        margin-bottom: 12rpx;
      }

      .personality-name {
        display: block;
        font-size: 30rpx;
        font-weight: 600;
        color: #1a1a2e;
        margin-bottom: 8rpx;
      }

      .personality-desc {
        display: block;
        font-size: 24rpx;
        color: #666680;
        margin-bottom: 20rpx;
        line-height: 1.5;
      }

      .personality-stats {
        display: flex;
        gap: 24rpx;

        .stat-item {
          flex: 1;

          .stat-label {
            display: block;
            font-size: 22rpx;
            color: #8c8c9c;
            margin-bottom: 8rpx;
          }

          .stat-bar {
            height: 12rpx;
            background: #e0e0e0;
            border-radius: 6rpx;
            overflow: hidden;

            .stat-fill {
              height: 100%;
              background: linear-gradient(90deg, #667eea, #764ba2);
              border-radius: 6rpx;
              transition: width 0.5s ease;
            }
          }
        }
      }
    }
  }

  .intensity-slider {
    .slider-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16rpx;

      .slider-label {
        font-size: 28rpx;
        color: #1a1a2e;
        font-weight: 500;
      }

      .slider-value {
        font-size: 32rpx;
        font-weight: bold;
        color: #667eea;
      }
    }

    .slider {
      margin: 0 0 20rpx;
    }

    .slider-labels {
      display: flex;
      justify-content: space-between;

      .label-item {
        font-size: 22rpx;
        color: #8c8c9c;
      }
    }
  }

  .api-key-card {
    background: #f8f9fa;
    border-radius: 16rpx;
    padding: 20rpx;

    .input {
      height: 88rpx;
      background: transparent;
      padding: 0;
      border: none;
      margin-bottom: 8rpx;

      &:focus {
        background: transparent;
        border: none;
        box-shadow: none;
      }
    }

    .api-hint {
      display: block;
      font-size: 24rpx;
      color: #8c8c9c;
    }
  }
}

.summary-card {
  background: #ffffff;
  border-radius: 24rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.06);

  .summary-title {
    display: block;
    font-size: 32rpx;
    font-weight: 600;
    color: #1a1a2e;
    margin-bottom: 24rpx;
  }

  .summary-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20rpx 0;
    border-bottom: 1rpx solid #f0f0f0;

    &:last-child {
      border-bottom: none;
    }

    .summary-label {
      font-size: 28rpx;
      color: #666680;
    }

    .summary-value {
      font-size: 28rpx;
      color: #1a1a2e;
      font-weight: 500;

      &.highlight {
        color: #667eea;
        font-weight: bold;
        font-size: 32rpx;
      }
    }
  }
}

.tips-card {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
  border-radius: 20rpx;
  padding: 28rpx;
  border-left: 4rpx solid #667eea;

  .tips-title {
    display: block;
    font-size: 28rpx;
    font-weight: 600;
    color: #667eea;
    margin-bottom: 16rpx;
  }

  .tips-item {
    display: block;
    font-size: 26rpx;
    color: #666680;
    line-height: 1.8;
    margin-bottom: 8rpx;
  }
}

.footer-section {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 24rpx 32rpx;
  background: #ffffff;
  box-shadow: 0 -4rpx 24rpx rgba(0, 0, 0, 0.08);
  z-index: 100;

  .submit-btn {
    height: 104rpx;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 52rpx;
    color: #ffffff;
    font-size: 32rpx;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    box-shadow: 0 8rpx 24rpx rgba(102, 126, 234, 0.4);
    transition: all 0.3s ease;

    &:active:not(.btn-disabled) {
      transform: scale(0.98);
      box-shadow: 0 4rpx 16rpx rgba(102, 126, 234, 0.3);
    }

    &.btn-disabled {
      background: #e0e0e0;
      box-shadow: none;
      color: #8c8c9c;
    }

    .btn-text {
      font-size: 32rpx;
      font-weight: 600;
    }

    .btn-loading {
      display: flex;
      align-items: center;
      gap: 12rpx;

      .loading-icon {
        font-size: 32rpx;
        animation: rotate 1s linear infinite;
      }

      .loading-text {
        font-size: 28rpx;
      }
    }
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
