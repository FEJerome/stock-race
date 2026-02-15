<template>
  <view class="trades-page">
    <!-- 统计卡片 -->
    <view class="stats-card" v-if="tradingStore.overview">
      <view class="stats-item">
        <text class="stats-value">{{ tradingStore.trades.length }}</text>
        <text class="stats-label">总交易次数</text>
      </view>
      <view class="stats-item">
        <text class="stats-value">{{ buyCount }}</text>
        <text class="stats-label">买入</text>
      </view>
      <view class="stats-item">
        <text class="stats-value">{{ sellCount }}</text>
        <text class="stats-label">卖出</text>
      </view>
    </view>

    <!-- 筛选区域 -->
    <view class="filter-section">
      <!-- 时间筛选 -->
      <view class="time-filter">
        <text
          class="filter-chip"
          :class="{ active: timeFilter === 'today' }"
          @click="switchTimeFilter('today')"
        >今日</text>
        <text
          class="filter-chip"
          :class="{ active: timeFilter === 'week' }"
          @click="switchTimeFilter('week')"
        >本周</text>
        <text
          class="filter-chip"
          :class="{ active: timeFilter === 'month' }"
          @click="switchTimeFilter('month')"
        >本月</text>
        <text
          class="filter-chip"
          :class="{ active: timeFilter === 'all' }"
          @click="switchTimeFilter('all')"
        >全部</text>
      </view>

      <!-- 类型筛选 -->
      <view class="type-filter">
        <text
          class="filter-chip"
          :class="{ active: typeFilter === 'all' }"
          @click="switchTypeFilter('all')"
        >全部</text>
        <text
          class="filter-chip"
          :class="{ active: typeFilter === 'buy' }"
          @click="switchTypeFilter('buy')"
        >买入</text>
        <text
          class="filter-chip"
          :class="{ active: typeFilter === 'sell' }"
          @click="switchTypeFilter('sell')"
        >卖出</text>
      </view>
    </view>

    <!-- 交易列表 -->
    <scroll-view
      class="trades-list"
      scroll-y
      refresher-enabled
      :refresher-triggered="isRefreshing"
      @refresherrefresh="onRefresh"
      @scrolltolower="loadMore"
    >
      <view
        class="trade-card"
        v-for="trade in filteredTrades"
        :key="trade.id"
        @click="goToTradeDetail(trade.id)"
      >
        <view class="card-header">
          <view class="trade-type-badge" :class="trade.type">
            <text class="type-text">{{ trade.type === 'buy' ? '买入' : '卖出' }}</text>
          </view>
          <text class="trade-time">{{ formatDateTime(trade.createdAt) }}</text>
        </view>

        <view class="card-body">
          <view class="stock-info">
            <text class="stock-name">{{ trade.stockName }}</text>
            <text class="stock-code">{{ trade.stockCode }}</text>
          </view>

          <view class="trade-detail">
            <view class="detail-row">
              <text class="detail-label">成交价格</text>
              <text class="detail-value">{{ formatPrice(trade.price) }}</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">成交数量</text>
              <text class="detail-value">{{ trade.quantity }} 股</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">成交金额</text>
              <text class="detail-value amount">{{ formatMoney(trade.amount) }}</text>
            </view>
            <view class="detail-row" v-if="trade.fee > 0">
              <text class="detail-label">手续费</text>
              <text class="detail-value fee">{{ formatMoney(trade.fee) }}</text>
            </view>
          </view>
        </view>

        <view class="card-footer" v-if="trade.accountName">
          <text class="account-name">{{ trade.accountName }}</text>
          <text class="view-detail">查看详情 ></text>
        </view>
      </view>

      <!-- 加载更多 -->
      <view class="load-more" v-if="filteredTrades.length > 0">
        <text v-if="loading">加载中...</text>
        <text v-else-if="!hasMore">没有更多了</text>
        <text v-else>上拉加载更多</text>
      </view>

      <!-- 空状态 -->
      <view class="empty-state" v-if="filteredTrades.length === 0 && !loading">
        <text class="empty-text">暂无交易记录</text>
        <text class="empty-desc">AI基金经理将为您执行交易</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTradingStore } from '@/stores/trading'
import { formatMoney, formatPrice, formatDateTime } from '@/utils/formatter'
import type { Trade } from '@/types/trading'

const tradingStore = useTradingStore()

// 筛选状态
const timeFilter = ref<'today' | 'week' | 'month' | 'all'>('all')
const typeFilter = ref<'all' | 'buy' | 'sell'>('all')

// 刷新和加载
const isRefreshing = ref(false)
const loading = ref(false)
const hasMore = ref(true)
const page = ref(1)
const pageSize = 20

// 买入/卖出统计
const buyCount = computed(() => {
  return tradingStore.trades.filter(t => t.type === 'buy').length
})

const sellCount = computed(() => {
  return tradingStore.trades.filter(t => t.type === 'sell').length
})

// 过滤后的交易列表
const filteredTrades = computed(() => {
  let trades = [...tradingStore.trades]

  // 时间筛选
  if (timeFilter.value !== 'all') {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    trades = trades.filter(trade => {
      const tradeDate = new Date(trade.createdAt)

      if (timeFilter.value === 'today') {
        return tradeDate >= today
      } else if (timeFilter.value === 'week') {
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
        return tradeDate >= weekAgo
      } else if (timeFilter.value === 'month') {
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
        return tradeDate >= monthAgo
      }
      return true
    })
  }

  // 类型筛选
  if (typeFilter.value !== 'all') {
    trades = trades.filter(t => t.type === typeFilter.value)
  }

  // 按时间倒序
  return trades.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
})

// 切换时间筛选
function switchTimeFilter(filter: 'today' | 'week' | 'month' | 'all') {
  timeFilter.value = filter
}

// 切换类型筛选
function switchTypeFilter(filter: 'all' | 'buy' | 'sell') {
  typeFilter.value = filter
}

// 刷新
async function onRefresh() {
  isRefreshing.value = true
  await tradingStore.fetchTrades()
  isRefreshing.value = false
  uni.showToast({ title: '刷新成功', icon: 'success' })
}

// 加载更多
async function loadMore() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  page.value++

  // 实际项目中这里应该调用分页API
  setTimeout(() => {
    hasMore.value = false
    loading.value = false
  }, 500)
}

// 跳转交易详情
function goToTradeDetail(id: string) {
  uni.navigateTo({ url: `/pages/trades/detail?id=${id}` })
}

onMounted(() => {
  tradingStore.fetchTrades()
})
</script>

<style lang="scss" scoped>
.trades-page {
  min-height: 100vh;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
}

// 统计卡片
.stats-card {
  display: flex;
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  padding: 40rpx 0;

  .stats-item {
    flex: 1;
    text-align: center;
    color: #ffffff;

    .stats-value {
      display: block;
      font-size: 40rpx;
      font-weight: bold;
      margin-bottom: 8rpx;
    }

    .stats-label {
      display: block;
      font-size: 24rpx;
      opacity: 0.9;
    }
  }
}

// 筛选区域
.filter-section {
  background: #ffffff;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;

  .time-filter,
  .type-filter {
    display: flex;
    gap: 16rpx;
    margin-bottom: 16rpx;

    &:last-child {
      margin-bottom: 0;
    }

    .filter-chip {
      font-size: 24rpx;
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
}

// 交易列表
.trades-list {
  flex: 1;
  padding: 24rpx;

  .trade-card {
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

      .trade-type-badge {
        padding: 8rpx 20rpx;
        border-radius: 8rpx;

        &.buy {
          background: rgba(255, 77, 79, 0.1);

          .type-text {
            color: #ff4d4f;
          }
        }

        &.sell {
          background: rgba(82, 196, 26, 0.1);

          .type-text {
            color: #52c41a;
          }
        }

        .type-text {
          font-size: 24rpx;
          font-weight: 500;
        }
      }

      .trade-time {
        font-size: 24rpx;
        color: #8c8c8c;
      }
    }

    .card-body {
      display: flex;
      margin-bottom: 24rpx;
      padding-bottom: 24rpx;
      border-bottom: 1rpx solid #f0f0f0;

      .stock-info {
        width: 200rpx;

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

      .trade-detail {
        flex: 1;

        .detail-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12rpx;

          &:last-child {
            margin-bottom: 0;
          }

          .detail-label {
            font-size: 24rpx;
            color: #8c8c8c;
          }

          .detail-value {
            font-size: 24rpx;
            color: #262626;
            font-weight: 500;

            &.amount {
              color: #1890ff;
              font-size: 28rpx;
            }

            &.fee {
              color: #8c8c8c;
            }
          }
        }
      }
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .account-name {
        font-size: 24rpx;
        color: #1890ff;
        padding: 8rpx 16rpx;
        background: rgba(24, 144, 255, 0.1);
        border-radius: 8rpx;
      }

      .view-detail {
        font-size: 24rpx;
        color: #8c8c8c;
      }
    }
  }

  .load-more {
    text-align: center;
    padding: 32rpx;
    font-size: 24rpx;
    color: #8c8c8c;
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
    }
  }
}
</style>
