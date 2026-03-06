<template>
  <view class="edit-manager-page">
    <!-- 头部只读信息卡片 -->
    <view class="info-card" v-if="account">
      <view class="info-header">
        <text class="manager-name">{{ account.name }}</text>
        <text class="status-tag" :class="account.status">{{ getStatusLabel(account.status) }}</text>
      </view>
      <view class="info-body">
        <view class="info-item">
          <text class="label">毕业院校</text>
          <text class="value">{{ getUniversity(account.modelProvider) }}</text>
        </view>
        <view class="info-item">
          <text class="label">初始资金</text>
          <text class="value">{{ formatMoney(account.initialBalance) }}</text>
        </view>
        <view class="info-item">
          <text class="label">当前资金</text>
          <text class="value" :class="account.totalProfit >= 0 ? 'text-rise' : 'text-fall'">
            {{ formatMoney(account.currentBalance) }}
          </text>
        </view>
      </view>
    </view>

    <!-- 编辑表单 -->
    <view class="form-card">
      <view class="form-title">编辑设置</view>

      <!-- 风险等级 -->
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

      <!-- 每日最大决策次数 -->
      <view class="form-item">
        <text class="label required">每日最大决策次数</text>
        <view class="number-input-wrapper">
          <input
            class="number-input"
            v-model="form.maxDailyDecisions"
            type="number"
            placeholder="请输入1-100之间的数字"
          />
          <text class="unit">次</text>
        </view>
        <text class="hint">当前今日已决策: {{ account?.todayDecisions || 0 }} 次</text>
      </view>

      <!-- API密钥 -->
      <view class="form-item">
        <text class="label">API密钥</text>
        <input
          class="input"
          v-model="form.apiKey"
          placeholder="如需使用自己的API密钥，请在此输入"
          password
        />
        <text class="hint">不填写则使用系统默认API，留空表示不修改现有密钥</text>
      </view>
    </view>

    <!-- 底部按钮 -->
    <view class="button-group">
      <button class="btn-cancel" @click="handleCancel">取消</button>
      <button
        class="btn-save"
        :class="{ 'btn-disabled': !canSubmit || loading }"
        :disabled="!canSubmit || loading"
        @click="handleSave"
      >
        <text v-if="!loading">保存</text>
        <text v-else>保存中...</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import { formatMoney } from '@/utils/formatter'
import { MODEL_PROVIDERS, RISK_LEVELS, AI_ACCOUNT_STATUS } from '@/utils/constants'
import type { AIAccount, RiskLevel } from '@/types/ai'

const aiStore = useAIStore()
const loading = ref(false)
const account = ref<AIAccount | null>(null)
const accountId = ref('')

const riskLevels = RISK_LEVELS

const form = ref({
  riskLevel: 'moderate' as RiskLevel,
  maxDailyDecisions: 5,
  apiKey: '',
})

// 获取状态标签
function getStatusLabel(status: string): string {
  return AI_ACCOUNT_STATUS[status as keyof typeof AI_ACCOUNT_STATUS]?.label || status
}

// 获取院校名称
function getUniversity(provider: string): string {
  return MODEL_PROVIDERS.find(p => p.value === provider)?.university || provider
}

// 是否可以提交
const canSubmit = computed(() => {
  return form.value.riskLevel &&
         form.value.maxDailyDecisions >= 1 &&
         form.value.maxDailyDecisions <= 100
})

// 页面加载时获取数据
onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  const id = currentPage.options?.id

  if (!id) {
    uni.showToast({ title: '参数错误', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 1500)
    return
  }

  accountId.value = id
  loadAccountData(id)
})

// 加载账户数据
async function loadAccountData(id: string) {
  uni.showLoading({ title: '加载中...' })

  // 先从store中查找
  const existingAccount = aiStore.accounts.find(a => a.id === id)
  if (existingAccount) {
    account.value = existingAccount
    initForm(existingAccount)
    uni.hideLoading()
    return
  }

  // 如果store中没有，从API获取
  const success = await aiStore.fetchAccountDetail(id)
  uni.hideLoading()

  if (success && aiStore.currentAccount) {
    account.value = aiStore.currentAccount
    initForm(aiStore.currentAccount)
  } else {
    uni.showToast({ title: '获取数据失败', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 1500)
  }
}

// 初始化表单数据
function initForm(data: AIAccount) {
  form.value.riskLevel = data.riskLevel
  form.value.maxDailyDecisions = data.maxDailyDecisions
  form.value.apiKey = '' // API密钥不回显，留空表示不修改
}

// 验证表单
function validateForm(): boolean {
  const decisions = Number(form.value.maxDailyDecisions)

  if (isNaN(decisions) || decisions < 1 || decisions > 100) {
    uni.showToast({ title: '每日最大决策次数必须在1-100之间', icon: 'none' })
    return false
  }

  return true
}

// 保存
async function handleSave() {
  if (!validateForm()) return

  loading.value = true
  uni.showLoading({ title: '保存中...' })

  const updateData: {
    riskLevel: RiskLevel
    maxDailyDecisions: number
    apiKey?: string
  } = {
    riskLevel: form.value.riskLevel,
    maxDailyDecisions: Number(form.value.maxDailyDecisions),
  }

  // 如果填写了API密钥，则包含在更新数据中
  if (form.value.apiKey.trim()) {
    updateData.apiKey = form.value.apiKey.trim()
  }

  const success = await aiStore.updateAccount(accountId.value, updateData)

  uni.hideLoading()
  loading.value = false

  if (success) {
    // 刷新账户列表
    aiStore.fetchAccounts(true)
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
  }
}

// 取消
function handleCancel() {
  uni.navigateBack()
}
</script>

<style lang="scss" scoped>
.edit-manager-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
  padding-bottom: 160rpx;
}

// 只读信息卡片
.info-card {
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;

  .info-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;
    padding-bottom: 24rpx;
    border-bottom: 1rpx solid rgba(255, 255, 255, 0.2);

    .manager-name {
      font-size: 36rpx;
      font-weight: 600;
      color: #ffffff;
    }

    .status-tag {
      padding: 6rpx 16rpx;
      border-radius: 8rpx;
      font-size: 24rpx;
      background: rgba(255, 255, 255, 0.2);
      color: #ffffff;

      &.active {
        background: rgba(82, 196, 26, 0.3);
      }

      &.inactive {
        background: rgba(140, 140, 140, 0.3);
      }

      &.deciding {
        background: rgba(250, 173, 20, 0.3);
      }

      &.error {
        background: rgba(255, 77, 79, 0.3);
      }
    }
  }

  .info-body {
    .info-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12rpx 0;

      .label {
        font-size: 26rpx;
        color: rgba(255, 255, 255, 0.8);
      }

      .value {
        font-size: 28rpx;
        color: #ffffff;
        font-weight: 500;

        &.text-rise {
          color: #ffccc7;
        }

        &.text-fall {
          color: #d9f7be;
        }
      }
    }
  }
}

// 表单卡片
.form-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx;

  .form-title {
    font-size: 32rpx;
    font-weight: 600;
    color: #262626;
    margin-bottom: 32rpx;
    padding-bottom: 24rpx;
    border-bottom: 1rpx solid #f0f0f0;
  }
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

  .hint {
    display: block;
    font-size: 24rpx;
    color: #8c8c8c;
    margin-top: 12rpx;
  }
}

// 风险等级选项
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

// 数字输入框
.number-input-wrapper {
  display: flex;
  align-items: center;
  background: #f5f5f5;
  border-radius: 12rpx;
  padding-right: 24rpx;

  .number-input {
    flex: 1;
    height: 88rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    color: #262626;
  }

  .unit {
    font-size: 28rpx;
    color: #8c8c8c;
  }
}

// 底部按钮
.button-group {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: 48rpx;
  display: flex;
  gap: 24rpx;

  .btn-cancel {
    flex: 1;
    height: 96rpx;
    background: #f5f5f5;
    border-radius: 48rpx;
    color: #595959;
    font-size: 32rpx;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;

    &:active {
      background: #e8e8e8;
    }
  }

  .btn-save {
    flex: 2;
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
}

.text-rise { color: #ff4d4f; }
.text-fall { color: #52c41a; }
</style>
