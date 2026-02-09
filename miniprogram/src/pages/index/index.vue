<template>
  <view class="index-page">
    <!-- 自定义导航栏 -->
    <view class="custom-nav">
      <text class="nav-title">基金总览</text>
    </view>

    <!-- 总资产卡片 -->
    <view class="asset-card">
      <view class="asset-header">
        <text class="asset-label">总资产 (元)</text>
        <view class="refresh-btn" @click="refreshData">
          <text class="refresh-icon" :class="{ 'rotating': loading }">↻</text>
        </view>
      </view>
      <text class="asset-value">{{ formatMoney(totalAssets) }}</text>
      <view class="asset-profit">
        <text class="profit-label">总收益</text>
        <text class="profit-value" :class="totalProfit >= 0 ? 'text-rise' : 'text-fall'">
          {{ formatChange(totalProfit) }} ({{ formatPercent(profitRate) }})
        </text>
      </view>
      <view class="asset-detail">
        <view class="detail-item">
          <text class="detail-label">现金</text>
          <text class="detail-value">{{ formatMoney(cashBalance) }}</text>
        </view>
        <view class="detail-item">
          <text class="detail-label">持仓</text>
          <text class="detail-value">{{ formatMoney(holdingsValue) }}</text>
        </view>
      </view>
    </view>

    <!-- 董事长指令卡片 -->
    <view class="chairman-card">
      <view class="card-header">
        <text class="card-title">📋 董事长指令</text>
        <text class="status-tag" :class="getStatusClass">{{ chairmanStatus }}</text>
      </view>
      <view class="instruction-list">
        <view class="instruction-item">
          <text class="instruction-label">本月目标收益率</text>
          <text class="instruction-value">10%</text>
        </view>
        <view class="instruction-item">
          <text class="instruction-label">当前完成进度</text>
          <text class="instruction-value" :class="profitRate >= 0.1 ? 'text-success' : 'text-warning'">
            {{ formatPercent(profitRate / 0.1) }}
          </text>
        </view>
      </view>
      <view class="chairman-message">
        <text class="message-text">"{{ chairmanMessage }}"</text>
        <text class="message-signature">—— 投资董事长</text>
      </view>
    </view>

    <!-- AI基金经理概览 -->
    <view class="section-card">
      <view class="section-header" @click="goToAIManagers">
        <text class="section-title">🤖 AI基金经理</text>
        <text class="section-more">查看全部 ></text>
      </view>
      <view class="manager-list" v-if="aiStore.accounts.length > 0">
        <view
          class="manager-item"
          v-for="account in aiStore.accounts.slice(0, 3)"
          :key="account.id"
          @click="goToManagerDetail(account.id)"
        >
          <view class="manager-info">
            <text class="manager-name">{{ account.name }}</text>
            <text class="manager-school">{{ getUniversity(account.modelProvider) }}</text>
          </view>
          <view class="manager-profit">
            <text class="profit-amount" :class="account.totalProfit >= 0 ? 'text-rise' : 'text-fall'">
              {{ formatChange(account.totalProfit) }}
            </text>
            <text class="profit-rate" :class="account.profitRate >= 0 ? 'text-rise' : 'text-fall'">
              {{ formatPercent(account.profitRate / 100) }}
            </text>
          </view>
        </view>
      </view>
      <view class="empty-state" v-else>
        <text class="empty-text">暂无AI基金经理</text>
        <button class="create-btn" @click="goToCreateManager">立即聘任</button>
      </view>
    </view>

    <!-- 持仓概览 -->
    <view class="section-card">
      <view class="section-header" @click="goToPortfolio">
        <text class="section-title">📊 持仓概览</text>
        <text class="section-more">查看全部 ></text>
      </view>
      <view class="holding-list" v-if="tradingStore.holdings.length > 0">
        <view
          class="holding-item"
          v-for="holding in tradingStore.holdings.slice(0, 3)"
          :key="holding.id"
        >
          <view class="holding-info">
            <text class="stock-name">{{ holding.stockName }}</text>
            <text class="stock-code">{{ holding.stockCode }}</text>
          </view>
          <view class="holding-profit">
            <text class="profit-amount" :class="holding.profit >= 0 ? 'text-rise' : 'text-fall'">
              {{ formatChange(holding.profit) }}
            </text>
            <text class="profit-rate" :class="holding.profitRate >= 0 ? 'text-rise' : 'text-fall'">
              {{ formatPercent(holding.profitRate / 100) }}
            </text>
          </view>
        </view>
      </view>
      <view class="empty-state" v-else>
        <text class="empty-text">暂无持仓</text>
      </view>
    </view>

    <!-- 快捷操作 -->
    <view class="quick-actions">
      <view class="action-item" @click="goToMarket">
        <view class="action-icon market">📈</view>
        <text class="action-label">市场行情</text>
      </view>
      <view class="action-item" @click="goToRanking">
        <view class="action-icon ranking">🏆</view>
        <text class="action-label">竞赛排行</text>
      </view>
      <view class="action-item" @click="goToTrades">
        <view class="action-icon trades">📋</view>
        <text class="action-label">交易记录</text>
      </view>
      <view class="action-item" @click="goToSettings">
        <view class="action-icon settings">⚙️</view>
        <text class="action-label">设置</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTradingStore } from '@/stores/trading'
import { useAIStore } from '@/stores/ai'
import { formatMoney, formatPercent, formatChange } from '@/utils/formatter'
import { MODEL_PROVIDERS } from '@/utils/constants'

const authStore = useAuthStore()
const tradingStore = useTradingStore()
const aiStore = useAIStore()
const loading = ref(false)

// 计算属性
const totalAssets = computed(() => tradingStore.totalAssets)
const cashBalance = computed(() => tradingStore.cashBalance)
const holdingsValue = computed(() => tradingStore.holdingsValue)
const totalProfit = computed(() => tradingStore.totalProfit)
const profitRate = computed(() => tradingStore.profitRate)

// 董事长状态
const chairmanStatus = computed(() => {
  if (profitRate.value >= 0.1) return '优秀'
  if (profitRate.value >= 0.05) return '良好'
  if (profitRate.value >= 0) return '一般'
  return '需改进'
})

const getStatusClass = computed(() => {
  if (profitRate.value >= 0.1) return 'status-excellent'
  if (profitRate.value >= 0.05) return 'status-good'
  if (profitRate.value >= 0) return 'status-normal'
  return 'status-poor'
})

const chairmanMessage = computed(() => {
  if (profitRate.value >= 0.1) return '表现优异，继续保持！'
  if (profitRate.value >= 0.05) return '做得不错，再接再厉！'
  if (profitRate.value >= 0) return '还需努力，争取更好成绩。'
  return '当前表现欠佳，请调整策略。'
})

// 获取大学名称
function getUniversity(provider: string): string {
  return MODEL_PROVIDERS.find(p => p.value === provider)?.university || provider
}

// 刷新数据
async function refreshData() {
  if (loading.value) return
  loading.value = true
  await Promise.all([
    tradingStore.refreshAll(),
    aiStore.fetchAccounts(),
  ])
  loading.value = false
  uni.showToast({ title: '刷新成功', icon: 'success' })
}

// 页面跳转
function goToAIManagers() {
  uni.switchTab({ url: '/pages/ai-managers/list' })
}

function goToManagerDetail(id: string) {
  uni.navigateTo({ url: `/pages/ai-managers/detail?id=${id}` })
}

function goToCreateManager() {
  uni.navigateTo({ url: '/pages/ai-managers/create' })
}

function goToPortfolio() {
  uni.switchTab({ url: '/pages/portfolio/overview' })
}

function goToMarket() {
  uni.switchTab({ url: '/pages/market/quotes' })
}

function goToRanking() {
  uni.navigateTo({ url: '/pages/competition/ranking' })
}

function goToTrades() {
  uni.navigateTo({ url: '/pages/trades/list' })
}

function goToSettings() {
  uni.switchTab({ url: '/pages/settings/profile' })
}

// 初始化
onMounted(() => {
  // 检查登录状态
  if (!authStore.isLoggedIn) {
    uni.redirectTo({ url: '/pages/login/login' })
    return
  }
  // 加载数据
  refreshData()
})
</script>

<style lang="scss" scoped>
.index-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 40rpx;
}

.custom-nav {
  height: 88rpx;
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;

  .nav-title {
    font-size: 36rpx;
    font-weight: 600;
    color: #ffffff;
  }
}

.asset-card {
  margin: 24rpx;
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
  color: #ffffff;

  .asset-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16rpx;

    .asset-label {
      font-size: 26rpx;
      opacity: 0.9;
    }

    .refresh-btn {
      width: 56rpx;
      height: 56rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 28rpx;

      .refresh-icon {
        font-size: 28rpx;
        color: #ffffff;

        &.rotating {
          animation: rotate 1s linear infinite;
        }
      }
    }
  }

  .asset-value {
    font-size: 56rpx;
    font-weight: bold;
    margin-bottom: 24rpx;
  }

  .asset-profit {
    display: flex;
    align-items: center;
    margin-bottom: 32rpx;

    .profit-label {
      font-size: 24rpx;
      opacity: 0.8;
      margin-right: 16rpx;
    }

    .profit-value {
      font-size: 28rpx;
      font-weight: 500;
    }
  }

  .asset-detail {
    display: flex;
    border-top: 1rpx solid rgba(255, 255, 255, 0.2);
    padding-top: 24rpx;

    .detail-item {
      flex: 1;

      .detail-label {
        display: block;
        font-size: 24rpx;
        opacity: 0.8;
        margin-bottom: 8rpx;
      }

      .detail-value {
        font-size: 32rpx;
        font-weight: 500;
      }
    }
  }
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.chairman-card {
  margin: 0 24rpx 24rpx;
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .card-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #262626;
    }

    .status-tag {
      padding: 6rpx 16rpx;
      border-radius: 8rpx;
      font-size: 24rpx;
      font-weight: 500;

      &.status-excellent {
        background: rgba(82, 196, 26, 0.1);
        color: #52c41a;
      }

      &.status-good {
        background: rgba(24, 144, 255, 0.1);
        color: #1890ff;
      }

      &.status-normal {
        background: rgba(250, 173, 20, 0.1);
        color: #faad14;
      }

      &.status-poor {
        background: rgba(255, 77, 79, 0.1);
        color: #ff4d4f;
      }
    }
  }

  .instruction-list {
    margin-bottom: 24rpx;

    .instruction-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16rpx 0;
      border-bottom: 1rpx solid #f0f0f0;

      &:last-child {
        border-bottom: none;
      }

      .instruction-label {
        font-size: 28rpx;
        color: #595959;
      }

      .instruction-value {
        font-size: 28rpx;
        font-weight: 500;
        color: #262626;
      }
    }
  }

  .chairman-message {
    background: #f5f5f5;
    border-radius: 12rpx;
    padding: 24rpx;

    .message-text {
      display: block;
      font-size: 28rpx;
      color: #595959;
      font-style: italic;
      margin-bottom: 12rpx;
    }

    .message-signature {
      display: block;
      font-size: 24rpx;
      color: #8c8c8c;
      text-align: right;
    }
  }
}

.section-card {
  margin: 0 24rpx 24rpx;
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx;

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .section-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #262626;
    }

    .section-more {
      font-size: 26rpx;
      color: #1890ff;
    }
  }
}

.manager-list, .holding-list {
  .manager-item, .holding-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24rpx 0;
    border-bottom: 1rpx solid #f0f0f0;

    &:last-child {
      border-bottom: none;
    }

    .manager-info, .holding-info {
      .manager-name, .stock-name {
        display: block;
        font-size: 30rpx;
        font-weight: 500;
        color: #262626;
        margin-bottom: 8rpx;
      }

      .manager-school, .stock-code {
        display: block;
        font-size: 24rpx;
        color: #8c8c8c;
      }
    }

    .manager-profit, .holding-profit {
      text-align: right;

      .profit-amount {
        display: block;
        font-size: 30rpx;
        font-weight: 500;
        margin-bottom: 4rpx;
      }

      .profit-rate {
        display: block;
        font-size: 24rpx;
      }
    }
  }
}

.empty-state {
  text-align: center;
  padding: 48rpx 0;

  .empty-text {
    display: block;
    font-size: 28rpx;
    color: #8c8c8c;
    margin-bottom: 24rpx;
  }

  .create-btn {
    display: inline-block;
    padding: 16rpx 48rpx;
    background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
    color: #ffffff;
    border-radius: 32rpx;
    font-size: 28rpx;
    border: none;
  }
}

.quick-actions {
  display: flex;
  justify-content: space-around;
  margin: 0 24rpx;
  padding: 32rpx;
  background: #ffffff;
  border-radius: 16rpx;

  .action-item {
    display: flex;
    flex-direction: column;
    align-items: center;

    .action-icon {
      width: 96rpx;
      height: 96rpx;
      border-radius: 48rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48rpx;
      margin-bottom: 12rpx;

      &.market { background: rgba(24, 144, 255, 0.1); }
      &.ranking { background: rgba(250, 173, 20, 0.1); }
      &.trades { background: rgba(82, 196, 26, 0.1); }
      &.settings { background: rgba(140, 140, 140, 0.1); }
    }

    .action-label {
      font-size: 24rpx;
      color: #595959;
    }
  }
}

.text-rise { color: #ff4d4f; }
.text-fall { color: #52c41a; }
.text-success { color: #52c41a; }
.text-warning { color: #faad14; }
</style>
