<template>
  <view class="quotes-page">
    <!-- 搜索栏 -->
    <view class="search-bar">
      <view class="search-input-wrapper">
        <text class="search-icon">🔍</text>
        <input
          class="search-input"
          type="text"
          placeholder="搜索股票代码/名称"
          v-model="searchKeyword"
          @confirm="handleSearch"
        />
        <text class="clear-icon" v-if="searchKeyword" @click="clearSearch">×</text>
      </view>
    </view>

    <!-- 市场指数 -->
    <view class="indices-section">
      <view class="section-title">市场指数</view>
      <view class="indices-grid">
        <view
          class="index-card"
          v-for="index in marketStore.indices"
          :key="index.code"
          @click="goToStockDetail(index.code)"
        >
          <text class="index-name">{{ index.name }}</text>
          <text class="index-price">{{ formatPrice(index.price) }}</text>
          <text
            class="index-change"
            :class="index.change >= 0 ? 'text-rise' : 'text-fall'"
          >
            {{ index.change >= 0 ? '+' : '' }}{{ formatPrice(index.change) }} ({{ formatPercent(index.changeRate / 100) }})
          </text>
        </view>
      </view>
    </view>

    <!-- 市场状态 -->
    <view class="market-status-bar">
      <view class="status-item">
        <text class="status-dot" :class="marketStore.isMarketOpen ? 'open' : 'closed'"></text>
        <text class="status-text">{{ marketStore.isMarketOpen ? '交易中' : '已收盘' }}</text>
      </view>
      <text class="update-time">{{ formatUpdateTime }}</text>
    </view>

    <!-- 股票列表 -->
    <view class="stock-list-section">
      <view class="section-header">
        <text class="section-title">股票行情</text>
        <view class="filter-tabs">
          <text
            class="tab-item"
            :class="{ active: activeTab === 'all' }"
            @click="switchTab('all')"
          >全部</text>
          <text
            class="tab-item"
            :class="{ active: activeTab === 'rise' }"
            @click="switchTab('rise')"
          >涨幅榜</text>
          <text
            class="tab-item"
            :class="{ active: activeTab === 'fall' }"
            @click="switchTab('fall')"
          >跌幅榜</text>
        </view>
      </view>

      <!-- 列表表头 -->
      <view class="list-header">
        <text class="header-cell name">股票</text>
        <text class="header-cell price">最新价</text>
        <text class="header-cell change">涨跌幅</text>
        <text class="header-cell volume">成交量</text>
      </view>

      <!-- 股票列表 -->
      <scroll-view
        class="stock-list"
        scroll-y
        refresher-enabled
        :refresher-triggered="isRefreshing"
        @refresherrefresh="onRefresh"
        @scrolltolower="loadMore"
      >
        <view
          class="stock-item"
          v-for="stock in filteredStocks"
          :key="stock.code"
          @click="goToStockDetail(stock.code)"
        >
          <view class="stock-info">
            <text class="stock-name">{{ stock.name }}</text>
            <text class="stock-code">{{ stock.code }}</text>
          </view>
          <text class="stock-price" :class="getPriceClass(stock.change)">
            {{ formatPrice(stock.price) }}
          </text>
          <view class="stock-change" :class="getPriceClass(stock.change)">
            <text class="change-rate">{{ formatPercent(stock.changeRate / 100) }}</text>
            <text class="change-amount">{{ stock.change >= 0 ? '+' : '' }}{{ formatPrice(stock.change) }}</text>
          </view>
          <text class="stock-volume">{{ formatVolume(stock.volume) }}</text>
        </view>

        <!-- 加载更多 -->
        <view class="load-more" v-if="filteredStocks.length > 0">
          <text v-if="loading">加载中...</text>
          <text v-else-if="!hasMore">没有更多了</text>
          <text v-else>上拉加载更多</text>
        </view>

        <!-- 空状态 -->
        <view class="empty-state" v-if="filteredStocks.length === 0 && !loading">
          <text class="empty-text">暂无股票数据</text>
          <text class="empty-desc">请检查网络连接或稍后重试</text>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMarketStore } from '@/stores/market'
import { formatPrice, formatPercent, formatVolume } from '@/utils/formatter'

const marketStore = useMarketStore()

// 搜索
const searchKeyword = ref('')
const isSearching = ref(false)

// 标签页
const activeTab = ref<'all' | 'rise' | 'fall'>('all')

// 刷新和加载
const isRefreshing = ref(false)
const loading = ref(false)
const hasMore = ref(true)
const page = ref(1)
const pageSize = 20

// 更新时间
const formatUpdateTime = computed(() => {
  if (!marketStore.lastUpdateTime) return ''
  const date = new Date(marketStore.lastUpdateTime)
  return `更新于 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
})

// 过滤后的股票列表
const filteredStocks = computed(() => {
  let stocks = marketStore.quotes

  // 搜索过滤
  if (searchKeyword.value && isSearching.value) {
    const keyword = searchKeyword.value.toLowerCase()
    stocks = stocks.filter(s =>
      s.name.toLowerCase().includes(keyword) ||
      s.code.toLowerCase().includes(keyword)
    )
  }

  // 标签页过滤
  if (activeTab.value === 'rise') {
    stocks = [...stocks].sort((a, b) => b.changeRate - a.changeRate)
  } else if (activeTab.value === 'fall') {
    stocks = [...stocks].sort((a, b) => a.changeRate - b.changeRate)
  }

  return stocks
})

// 获取价格样式类
function getPriceClass(change: number): string {
  if (change > 0) return 'text-rise'
  if (change < 0) return 'text-fall'
  return 'text-neutral'
}

// 搜索
function handleSearch() {
  if (!searchKeyword.value.trim()) {
    isSearching.value = false
    return
  }
  isSearching.value = true
}

function clearSearch() {
  searchKeyword.value = ''
  isSearching.value = false
}

// 切换标签
function switchTab(tab: 'all' | 'rise' | 'fall') {
  activeTab.value = tab
}

// 刷新
async function onRefresh() {
  isRefreshing.value = true
  await marketStore.refreshAllMarketData()
  isRefreshing.value = false
  uni.showToast({ title: '刷新成功', icon: 'success' })
}

// 加载更多
async function loadMore() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  page.value++

  // 实际项目中这里应该调用分页API
  // 目前使用模拟数据，所以直接设置hasMore为false
  setTimeout(() => {
    hasMore.value = false
    loading.value = false
  }, 500)
}

// 跳转股票详情
function goToStockDetail(code: string) {
  uni.navigateTo({ url: `/pages/market/stock-detail?code=${code}` })
}

onMounted(() => {
  marketStore.refreshAllMarketData()
})
</script>

<style lang="scss" scoped>
.quotes-page {
  min-height: 100vh;
  background: #f5f5f5;
}

// 搜索栏
.search-bar {
  background: #ffffff;
  padding: 24rpx 32rpx;

  .search-input-wrapper {
    display: flex;
    align-items: center;
    background: #f5f5f5;
    border-radius: 36rpx;
    padding: 16rpx 24rpx;

    .search-icon {
      font-size: 28rpx;
      margin-right: 16rpx;
      color: #8c8c8c;
    }

    .search-input {
      flex: 1;
      font-size: 28rpx;
      color: #262626;
    }

    .clear-icon {
      font-size: 32rpx;
      color: #8c8c8c;
      padding: 0 8rpx;
    }
  }
}

// 市场指数
.indices-section {
  background: #ffffff;
  padding: 24rpx 32rpx;
  margin-bottom: 16rpx;

  .section-title {
    font-size: 28rpx;
    font-weight: 600;
    color: #262626;
    margin-bottom: 24rpx;
  }

  .indices-grid {
    display: flex;
    gap: 16rpx;

    .index-card {
      flex: 1;
      background: #f5f5f5;
      border-radius: 12rpx;
      padding: 24rpx;
      text-align: center;

      .index-name {
        display: block;
        font-size: 24rpx;
        color: #8c8c8c;
        margin-bottom: 12rpx;
      }

      .index-price {
        display: block;
        font-size: 32rpx;
        font-weight: 600;
        color: #262626;
        margin-bottom: 8rpx;
      }

      .index-change {
        display: block;
        font-size: 22rpx;
      }
    }
  }
}

// 市场状态栏
.market-status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #ffffff;
  padding: 16rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;

  .status-item {
    display: flex;
    align-items: center;

    .status-dot {
      width: 16rpx;
      height: 16rpx;
      border-radius: 50%;
      margin-right: 12rpx;

      &.open {
        background: #52c41a;
      }

      &.closed {
        background: #8c8c8c;
      }
    }

    .status-text {
      font-size: 24rpx;
      color: #595959;
    }
  }

  .update-time {
    font-size: 22rpx;
    color: #8c8c8c;
  }
}

// 股票列表区域
.stock-list-section {
  background: #ffffff;

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24rpx 32rpx;
    border-bottom: 1rpx solid #f0f0f0;

    .section-title {
      font-size: 28rpx;
      font-weight: 600;
      color: #262626;
    }

    .filter-tabs {
      display: flex;
      gap: 24rpx;

      .tab-item {
        font-size: 24rpx;
        color: #8c8c8c;
        padding: 8rpx 0;
        position: relative;

        &.active {
          color: #1890ff;
          font-weight: 500;

          &::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 4rpx;
            background: #1890ff;
            border-radius: 2rpx;
          }
        }
      }
    }
  }

  // 列表表头
  .list-header {
    display: flex;
    padding: 20rpx 32rpx;
    background: #fafafa;
    border-bottom: 1rpx solid #f0f0f0;

    .header-cell {
      font-size: 22rpx;
      color: #8c8c8c;

      &.name {
        flex: 2;
      }

      &.price,
      &.change {
        flex: 1.5;
        text-align: right;
      }

      &.volume {
        flex: 1.5;
        text-align: right;
      }
    }
  }

  // 股票列表
  .stock-list {
    height: calc(100vh - 600rpx);

    .stock-item {
      display: flex;
      align-items: center;
      padding: 24rpx 32rpx;
      border-bottom: 1rpx solid #f5f5f5;

      &:active {
        background: #f5f5f5;
      }

      .stock-info {
        flex: 2;

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

      .stock-price {
        flex: 1.5;
        text-align: right;
        font-size: 28rpx;
        font-weight: 500;
      }

      .stock-change {
        flex: 1.5;
        text-align: right;

        .change-rate {
          display: block;
          font-size: 26rpx;
          font-weight: 500;
          margin-bottom: 4rpx;
        }

        .change-amount {
          display: block;
          font-size: 20rpx;
        }
      }

      .stock-volume {
        flex: 1.5;
        text-align: right;
        font-size: 24rpx;
        color: #595959;
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
        font-size: 28rpx;
        color: #262626;
        margin-bottom: 12rpx;
      }

      .empty-desc {
        display: block;
        font-size: 24rpx;
        color: #8c8c8c;
      }
    }
  }
}

.text-rise { color: #ff4d4f; }
.text-fall { color: #52c41a; }
.text-neutral { color: #595959; }
</style>
