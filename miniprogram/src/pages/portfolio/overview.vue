<template>
  <view class="portfolio-overview-page">
    <!-- 资产总览卡片 -->
    <view class="asset-card" v-if="tradingStore.overview">
      <view class="asset-header">
        <text class="asset-label">总资产</text>
        <text class="update-time">{{ formatUpdateTime }}</text>
      </view>
      <text class="total-assets">{{ formatMoney(tradingStore.totalAssets) }}</text>
      <view class="profit-section">
        <view class="profit-item">
          <text class="profit-label">累计收益</text>
          <text
            class="profit-value"
            :class="tradingStore.totalProfit >= 0 ? 'text-rise' : 'text-fall'"
          >
            {{ formatChange(tradingStore.totalProfit) }}
          </text>
        </view>
        <view class="profit-item">
          <text class="profit-label">收益率</text>
          <text
            class="profit-value"
            :class="tradingStore.profitRate >= 0 ? 'text-rise' : 'text-fall'"
          >
            {{ formatPercent(tradingStore.profitRate / 100) }}
          </text>
        </view>
      </view>

      <!-- 资产分布 -->
      <view class="asset-distribution">
        <view class="distribution-item">
          <text class="distribution-label">现金</text>
          <text class="distribution-value">{{ formatMoney(tradingStore.cashBalance) }}</text>
          <text class="distribution-ratio">{{ cashRatio }}%</text>
        </view>
        <view class="distribution-bar">
          <view class="bar-bg"></view>
          <view class="bar-fill" :style="{ width: stockRatio + '%' }"></view>
        </view>
        <view class="distribution-item">
          <text class="distribution-label">持仓</text>
          <text class="distribution-value">{{ formatMoney(tradingStore.holdingsValue) }}</text>
          <text class="distribution-ratio">{{ stockRatio }}%</text>
        </view>
      </view>
    </view>

    <!-- 今日收益 -->
    <view class="today-profit-card" v-if="tradingStore.overview">
      <view class="today-header">
        <text class="today-label">今日收益</text>
        <text
          class="today-value"
          :class="tradingStore.overview.todayProfit >= 0 ? 'text-rise' : 'text-fall'"
        >
          {{ tradingStore.overview.todayProfit >= 0 ? '+' : '' }}{{ formatChange(tradingStore.overview.todayProfit) }}
        </text>
      </view>
      <text
        class="today-rate"
        :class="tradingStore.overview.todayProfitRate >= 0 ? 'text-rise' : 'text-fall'"
      >
        {{ formatPercent(tradingStore.overview.todayProfitRate / 100) }}
      </text>
    </view>

    <!-- 持仓统计 -->
    <view class="holding-stats">
      <view class="stats-item">
        <text class="stats-value">{{ tradingStore.overview?.holdingCount || 0 }}</text>
        <text class="stats-label">持仓股票</text>
      </view>
      <view class="stats-item">
        <text class="stats-value">{{ aiStore.accounts.length }}</text>
        <text class="stats-label">AI经理</text>
      </view>
      <view class="stats-item">
        <text class="stats-value">{{ tradingStore.trades.length }}</text>
        <text class="stats-label">交易记录</text>
      </view>
    </view>

    <!-- 最近持仓 -->
    <view class="recent-holdings">
      <view class="section-header">
        <text class="section-title">最近持仓</text>
        <text class="view-all" @click="goToHoldings">查看全部 ></text>
      </view>

      <view class="holding-list" v-if="tradingStore.holdings.length > 0">
        <view
          class="holding-item"
          v-for="holding in recentHoldings"
          :key="holding.id"
          @click="goToStockDetail(holding.stockCode)"
        >
          <view class="holding-info">
            <text class="stock-name">{{ holding.stockName }}</text>
            <text class="stock-code">{{ holding.stockCode }}</text>
          </view>
          <view class="holding-detail">
            <text class="holding-quantity">{{ holding.quantity }}股</text>
            <text class="holding-value">{{ formatMoney(holding.marketValue) }}</text>
          </view>
          <view class="holding-profit" :class="holding.profit >= 0 ? 'text-rise' : 'text-fall'">
            <text class="profit-rate">{{ formatPercent(holding.profitRate / 100) }}</text>
            <text class="profit-amount">{{ formatChange(holding.profit) }}</text>
          </view>
        </view>
      </view>

      <!-- 空状态 -->
      <view class="empty-state" v-else>
        <text class="empty-text">暂无持仓</text>
        <text class="empty-desc">AI基金经理正在为您寻找投资机会</text>
      </view>
    </view>

    <!-- 快捷操作 -->
    <view class="quick-actions">
      <view class="action-item" @click="goToHoldings">
        <view class="action-icon">📊</view>
        <text class="action-text">持仓明细</text>
      </view>
      <view class="action-item" @click="goToTrades">
        <view class="action-icon">📋</view>
        <text class="action-text">交易记录</text>
      </view>
      <view class="action-item" @click="goToAIAccounts">
        <view class="action-icon">🤖</view>
        <text class="action-text">AI经理</text>
      </view>
      <view class="action-item" @click="goToMarket">
        <view class="action-icon">📈</view>
        <text class="action-text">市场行情</text>
      </view>
    </view>

    <!-- 加载状态 -->
    <view class="loading-state" v-if="tradingStore.loading">
      <text class="loading-text">加载中...</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useTradingStore } from '@/stores/trading'
import { useAIStore } from '@/stores/ai'
import { formatMoney, formatPercent, formatChange } from '@/utils/formatter'

const tradingStore = useTradingStore()
const aiStore = useAIStore()

// 更新时间
const formatUpdateTime = computed(() => {
  return '刚刚更新'
})

// 现金和持仓比例
const cashRatio = computed(() => {
  if (!tradingStore.overview || tradingStore.totalAssets === 0) return 0
  return Math.round((tradingStore.cashBalance / tradingStore.totalAssets) * 100)
})

const stockRatio = computed(() => {
  if (!tradingStore.overview || tradingStore.totalAssets === 0) return 0
  return Math.round((tradingStore.holdingsValue / tradingStore.totalAssets) * 100)
})

// 最近持仓（最多显示5条）
const recentHoldings = computed(() => {
  return tradingStore.holdings.slice(0, 5)
})

// 页面跳转
function goToHoldings() {
  uni.navigateTo({ url: '/pages/portfolio/holdings' })
}

function goToTrades() {
  uni.navigateTo({ url: '/pages/trades/list' })
}

function goToAIAccounts() {
  uni.switchTab({ url: '/pages/ai-managers/list' })
}

function goToMarket() {
  uni.switchTab({ url: '/pages/market/quotes' })
}

function goToStockDetail(code: string) {
  uni.navigateTo({ url: `/pages/market/stock-detail?code=${code}` })
}

onMounted(() => {
  tradingStore.refreshAll()
  aiStore.fetchAccounts()
})
</script>

<style lang="scss" scoped>
.portfolio-overview-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
}

// 资产总览卡片
.asset-card {
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 24rpx;
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

    .update-time {
      font-size: 22rpx;
      opacity: 0.7;
    }
  }

  .total-assets {
    display: block;
    font-size: 56rpx;
    font-weight: bold;
    margin-bottom: 32rpx;
  }

  .profit-section {
    display: flex;
    gap: 48rpx;
    margin-bottom: 32rpx;
    padding-bottom: 32rpx;
    border-bottom: 1rpx solid rgba(255, 255, 255, 0.2);

    .profit-item {
      .profit-label {
        display: block;
        font-size: 24rpx;
        opacity: 0.8;
        margin-bottom: 8rpx;
      }

      .profit-value {
        display: block;
        font-size: 32rpx;
        font-weight: 600;
      }
    }
  }

  .asset-distribution {
    .distribution-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12rpx;

      .distribution-label {
        font-size: 24rpx;
        opacity: 0.8;
      }

      .distribution-value {
        font-size: 26rpx;
        font-weight: 500;
      }

      .distribution-ratio {
        font-size: 24rpx;
        opacity: 0.8;
        margin-left: 16rpx;
      }
    }

    .distribution-bar {
      position: relative;
      height: 8rpx;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4rpx;
      margin: 16rpx 0;

      .bar-fill {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 4rpx;
        transition: width 0.3s ease;
      }
    }
  }
}

// 今日收益卡片
.today-profit-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .today-header {
    .today-label {
      display: block;
      font-size: 26rpx;
      color: #8c8c8c;
      margin-bottom: 8rpx;
    }

    .today-value {
      display: block;
      font-size: 40rpx;
      font-weight: 600;
    }
  }

  .today-rate {
    font-size: 32rpx;
    font-weight: 500;
    padding: 12rpx 24rpx;
    background: #f5f5f5;
    border-radius: 32rpx;
  }
}

// 持仓统计
.holding-stats {
  display: flex;
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx 0;
  margin-bottom: 24rpx;

  .stats-item {
    flex: 1;
    text-align: center;
    border-right: 1rpx solid #f0f0f0;

    &:last-child {
      border-right: none;
    }

    .stats-value {
      display: block;
      font-size: 36rpx;
      font-weight: 600;
      color: #262626;
      margin-bottom: 8rpx;
    }

    .stats-label {
      display: block;
      font-size: 24rpx;
      color: #8c8c8c;
    }
  }
}

// 最近持仓
.recent-holdings {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .section-title {
      font-size: 30rpx;
      font-weight: 600;
      color: #262626;
    }

    .view-all {
      font-size: 26rpx;
      color: #1890ff;
    }
  }

  .holding-list {
    .holding-item {
      display: flex;
      align-items: center;
      padding: 24rpx 0;
      border-bottom: 1rpx solid #f5f5f5;

      &:last-child {
        border-bottom: none;
      }

      &:active {
        background: #f5f5f5;
      }

      .holding-info {
        flex: 1;

        .stock-name {
          display: block;
          font-size: 28rpx;
          font-weight: 500;
          color: #262626;
          margin-bottom: 4rpx;
        }

        .stock-code {
          display: block;
          font-size: 22rpx;
          color: #8c8c8c;
        }
      }

      .holding-detail {
        flex: 1;
        text-align: right;
        margin-right: 24rpx;

        .holding-quantity {
          display: block;
          font-size: 24rpx;
          color: #595959;
          margin-bottom: 4rpx;
        }

        .holding-value {
          display: block;
          font-size: 26rpx;
          color: #262626;
          font-weight: 500;
        }
      }

      .holding-profit {
        text-align: right;
        min-width: 140rpx;

        .profit-rate {
          display: block;
          font-size: 28rpx;
          font-weight: 600;
          margin-bottom: 4rpx;
        }

        .profit-amount {
          display: block;
          font-size: 22rpx;
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
      margin-bottom: 8rpx;
    }

    .empty-desc {
      display: block;
      font-size: 24rpx;
      color: #bfbfbf;
    }
  }
}

// 快捷操作
.quick-actions {
  display: flex;
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx 0;

  .action-item {
    flex: 1;
    text-align: center;

    &:active {
      opacity: 0.7;
    }

    .action-icon {
      font-size: 48rpx;
      margin-bottom: 12rpx;
    }

    .action-text {
      display: block;
      font-size: 24rpx;
      color: #595959;
    }
  }
}

// 加载状态
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 120rpx 48rpx;

  .loading-text {
    font-size: 28rpx;
    color: #8c8c8c;
  }
}

.text-rise { color: #ff4d4f; }
.text-fall { color: #52c41a; }
</style>
