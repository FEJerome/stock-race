<template>
  <view class="holdings-page">
    <!-- 资产概览 -->
    <view class="asset-overview" v-if="tradingStore.overview">
      <view class="overview-item">
        <text class="overview-label">总资产</text>
        <text class="overview-value">{{ formatMoney(tradingStore.totalAssets) }}</text>
      </view>
      <view class="overview-item">
        <text class="overview-label">持仓市值</text>
        <text class="overview-value">{{ formatMoney(tradingStore.holdingsValue) }}</text>
      </view>
      <view class="overview-item">
        <text class="overview-label">累计盈亏</text>
        <text class="overview-value" :class="tradingStore.totalProfit >= 0 ? 'text-rise' : 'text-fall'">
          {{ formatChange(tradingStore.totalProfit) }}
        </text>
      </view>
    </view>

    <!-- 筛选标签 -->
    <view class="filter-section">
      <view class="filter-tabs">
        <text
          class="tab-item"
          :class="{ active: activeFilter === 'all' }"
          @click="switchFilter('all')"
        >全部</text>
        <text
          class="tab-item"
          :class="{ active: activeFilter === 'profit' }"
          @click="switchFilter('profit')"
        >盈利</text>
        <text
          class="tab-item"
          :class="{ active: activeFilter === 'loss' }"
          @click="switchFilter('loss')"
        >亏损</text>
      </view>
      <text class="holding-count">共 {{ filteredHoldings.length }} 只</text>
    </view>

    <!-- 持仓列表 -->
    <scroll-view
      class="holdings-list"
      scroll-y
      refresher-enabled
      :refresher-triggered="isRefreshing"
      @refresherrefresh="onRefresh"
    >
      <view
        class="holding-card"
        v-for="holding in filteredHoldings"
        :key="holding.id"
        @click="goToStockDetail(holding.stockCode)"
      >
        <view class="card-header">
          <view class="stock-info">
            <text class="stock-name">{{ holding.stockName }}</text>
            <text class="stock-code">{{ holding.stockCode }}</text>
          </view>
          <view class="profit-badge" :class="holding.profit >= 0 ? 'profit' : 'loss'">
            <text class="profit-rate">{{ formatPercent(holding.profitRate / 100) }}</text>
          </view>
        </view>

        <view class="card-body">
          <view class="info-row">
            <view class="info-item">
              <text class="info-label">持仓数量</text>
              <text class="info-value">{{ holding.quantity }} 股</text>
            </view>
            <view class="info-item">
              <text class="info-label">成本价</text>
              <text class="info-value">{{ formatPrice(holding.avgCost) }}</text>
            </view>
            <view class="info-item">
              <text class="info-label">当前价</text>
              <text class="info-value" :class="getPriceClass(holding.currentPrice - holding.avgCost)">
                {{ formatPrice(holding.currentPrice) }}
              </text>
            </view>
          </view>

          <view class="info-row">
            <view class="info-item">
              <text class="info-label">市值</text>
              <text class="info-value">{{ formatMoney(holding.marketValue) }}</text>
            </view>
            <view class="info-item">
              <text class="info-label">盈亏金额</text>
              <text class="info-value" :class="holding.profit >= 0 ? 'text-rise' : 'text-fall'">
                {{ formatChange(holding.profit) }}
              </text>
            </view>
            <view class="info-item" v-if="holding.accountName">
              <text class="info-label">基金经理</text>
              <text class="info-value account">{{ holding.accountName }}</text>
            </view>
          </view>
        </view>

        <view class="card-footer">
          <text class="update-time">更新于 {{ formatTime(holding.updatedAt) }}</text>
          <view class="action-btns">
            <button class="mini-btn buy" @click.stop="goToTrade(holding.stockCode, 'buy')">买入</button>
            <button class="mini-btn sell" @click.stop="goToTrade(holding.stockCode, 'sell')">卖出</button>
          </view>
        </view>
      </view>

      <!-- 空状态 -->
      <view class="empty-state" v-if="filteredHoldings.length === 0 && !tradingStore.loading">
        <text class="empty-text">暂无持仓</text>
        <text class="empty-desc">AI基金经理正在为您寻找投资机会</text>
        <button class="action-btn" @click="goToMarket">查看市场行情</button>
      </view>
    </scroll-view>

    <!-- 底部统计 -->
    <view class="bottom-stats" v-if="filteredHoldings.length > 0">
      <text class="stats-text">
        持仓 {{ filteredHoldings.length }} 只 |
        盈利 {{ profitCount }} 只 |
        亏损 {{ lossCount }} 只
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTradingStore } from '@/stores/trading'
import { formatMoney, formatPrice, formatPercent, formatChange } from '@/utils/formatter'

const tradingStore = useTradingStore()

// 筛选状态
const activeFilter = ref<'all' | 'profit' | 'loss'>('all')
const isRefreshing = ref(false)

// 过滤后的持仓列表
const filteredHoldings = computed(() => {
  let holdings = tradingStore.holdings

  if (activeFilter.value === 'profit') {
    holdings = holdings.filter(h => h.profit >= 0)
  } else if (activeFilter.value === 'loss') {
    holdings = holdings.filter(h => h.profit < 0)
  }

  // 按市值排序
  return holdings.sort((a, b) => b.marketValue - a.marketValue)
})

// 盈亏统计
const profitCount = computed(() => {
  return tradingStore.holdings.filter(h => h.profit >= 0).length
})

const lossCount = computed(() => {
  return tradingStore.holdings.filter(h => h.profit < 0).length
})

// 获取价格样式类
function getPriceClass(change: number): string {
  if (change > 0) return 'text-rise'
  if (change < 0) return 'text-fall'
  return 'text-neutral'
}

// 格式化时间
function formatTime(timeStr: string): string {
  if (!timeStr) return '-'
  const date = new Date(timeStr)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

// 切换筛选
function switchFilter(filter: 'all' | 'profit' | 'loss') {
  activeFilter.value = filter
}

// 刷新
async function onRefresh() {
  isRefreshing.value = true
  await tradingStore.refreshAll()
  isRefreshing.value = false
  uni.showToast({ title: '刷新成功', icon: 'success' })
}

// 页面跳转
function goToStockDetail(code: string) {
  uni.navigateTo({ url: `/pages/market/stock-detail?code=${code}` })
}

function goToTrade(code: string, type: 'buy' | 'sell') {
  uni.navigateTo({ url: `/pages/trades/trade?code=${code}&type=${type}` })
}

function goToMarket() {
  uni.switchTab({ url: '/pages/market/quotes' })
}

onMounted(() => {
  tradingStore.fetchHoldings()
  tradingStore.fetchOverview()
})
</script>

<style lang="scss" scoped>
.holdings-page {
  min-height: 100vh;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
}

// 资产概览
.asset-overview {
  display: flex;
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  padding: 32rpx 0;

  .overview-item {
    flex: 1;
    text-align: center;
    color: #ffffff;

    .overview-label {
      display: block;
      font-size: 24rpx;
      opacity: 0.9;
      margin-bottom: 12rpx;
    }

    .overview-value {
      display: block;
      font-size: 32rpx;
      font-weight: 600;
    }
  }
}

// 筛选区域
.filter-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #ffffff;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;

  .filter-tabs {
    display: flex;
    gap: 16rpx;

    .tab-item {
      font-size: 26rpx;
      color: #595959;
      padding: 12rpx 24rpx;
      background: #f5f5f5;
      border-radius: 28rpx;

      &.active {
        color: #ffffff;
        background: #1890ff;
      }
    }
  }

  .holding-count {
    font-size: 24rpx;
    color: #8c8c8c;
  }
}

// 持仓列表
.holdings-list {
  flex: 1;
  padding: 24rpx;

  .holding-card {
    background: #ffffff;
    border-radius: 16rpx;
    padding: 32rpx;
    margin-bottom: 24rpx;

    &:active {
      background: #fafafa;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24rpx;
      padding-bottom: 24rpx;
      border-bottom: 1rpx solid #f0f0f0;

      .stock-info {
        .stock-name {
          display: block;
          font-size: 32rpx;
          font-weight: 600;
          color: #262626;
          margin-bottom: 8rpx;
        }

        .stock-code {
          display: block;
          font-size: 24rpx;
          color: #8c8c8c;
        }
      }

      .profit-badge {
        padding: 12rpx 24rpx;
        border-radius: 28rpx;

        &.profit {
          background: rgba(255, 77, 79, 0.1);

          .profit-rate {
            color: #ff4d4f;
          }
        }

        &.loss {
          background: rgba(82, 196, 26, 0.1);

          .profit-rate {
            color: #52c41a;
          }
        }

        .profit-rate {
          font-size: 28rpx;
          font-weight: 600;
        }
      }
    }

    .card-body {
      margin-bottom: 24rpx;

      .info-row {
        display: flex;
        margin-bottom: 20rpx;

        &:last-child {
          margin-bottom: 0;
        }

        .info-item {
          flex: 1;
          text-align: center;

          .info-label {
            display: block;
            font-size: 22rpx;
            color: #8c8c8c;
            margin-bottom: 8rpx;
          }

          .info-value {
            display: block;
            font-size: 26rpx;
            color: #262626;
            font-weight: 500;

            &.account {
              color: #1890ff;
            }
          }
        }
      }
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 24rpx;
      border-top: 1rpx solid #f0f0f0;

      .update-time {
        font-size: 22rpx;
        color: #8c8c8c;
      }

      .action-btns {
        display: flex;
        gap: 16rpx;

        .mini-btn {
          padding: 12rpx 32rpx;
          font-size: 24rpx;
          border-radius: 24rpx;
          border: none;
          color: #ffffff;

          &.buy {
            background: #ff4d4f;
          }

          &.sell {
            background: #52c41a;
          }
        }
      }
    }
  }

  .empty-state {
    text-align: center;
    padding: 120rpx 48rpx;

    .empty-text {
      display: block;
      font-size: 32rpx;
      color: #262626;
      margin-bottom: 16rpx;
    }

    .empty-desc {
      display: block;
      font-size: 26rpx;
      color: #8c8c8c;
      margin-bottom: 32rpx;
    }

    .action-btn {
      padding: 20rpx 48rpx;
      background: #1890ff;
      color: #ffffff;
      border-radius: 36rpx;
      font-size: 28rpx;
      border: none;
    }
  }
}

// 底部统计
.bottom-stats {
  background: #ffffff;
  padding: 24rpx 32rpx;
  border-top: 1rpx solid #f0f0f0;
  text-align: center;

  .stats-text {
    font-size: 24rpx;
    color: #8c8c8c;
  }
}

.text-rise { color: #ff4d4f; }
.text-fall { color: #52c41a; }
.text-neutral { color: #595959; }
</style>
