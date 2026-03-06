<template>
  <view class="market-arena">
    <view class="arena-bg"></view>
    
    <view class="arena-container">
      <view class="arena-header">
        <text class="arena-title">🏟️ 市场竞技场</text>
        <view class="market-status">
          <view class="status-dot" :class="marketOpen ? 'open' : 'closed'"></view>
          <text class="status-text">{{ marketOpen ? '交易中' : '已收盘' }}</text>
        </view>
      </view>

      <view class="market-indices">
        <view
          v-for="index in marketIndices"
          :key="index.code"
          class="index-card"
          :class="{ 'rising': index.change >= 0, 'falling': index.change < 0 }"
        >
          <view class="index-info">
            <text class="index-name">{{ index.name }}</text>
            <text class="index-code">{{ index.code }}</text>
          </view>
          <view class="index-value">
            <text class="value-text">{{ index.current.toFixed(2) }}</text>
            <view class="value-change">
              <text class="change-icon">{{ index.change >= 0 ? '📈' : '📉' }}</text>
              <text class="change-text">{{ index.change >= 0 ? '+' : '' }}{{ index.changePercent.toFixed(2) }}%</text>
            </view>
          </view>
        </view>
      </view>

      <view class="search-section">
        <view class="search-bar">
          <text class="search-icon">🔍</text>
          <input
            class="search-input"
            type="text"
            v-model="searchKeyword"
            placeholder="搜索股票代码/名称"
            confirm-type="search"
            @confirm="onSearch"
          />
          <text class="clear-icon" v-if="searchKeyword" @tap="clearSearch">×</text>
        </view>
        <view class="filter-tags">
          <view
            v-for="filter in filters"
            :key="filter.value"
            class="filter-tag"
            :class="{ 'active': currentFilter === filter.value }"
            @tap="switchFilter(filter.value)"
          >
            <text class="tag-icon">{{ filter.icon }}</text>
            <text class="tag-text">{{ filter.label }}</text>
          </view>
        </view>
      </view>

      <view class="stock-arena">
        <view class="arena-stats">
          <view class="stat-item">
            <text class="stat-icon">📊</text>
            <text class="stat-value">{{ stockList.length }}</text>
            <text class="stat-label">股票数量</text>
          </view>
          <view class="stat-item">
            <text class="stat-icon">🔴</text>
            <text class="stat-value">{{ risingCount }}</text>
            <text class="stat-label">上涨</text>
          </view>
          <view class="stat-item">
            <text class="stat-icon">🟢</text>
            <text class="stat-value">{{ fallingCount }}</text>
            <text class="stat-label">下跌</text>
          </view>
          <view class="stat-item">
            <text class="stat-icon">⚪</text>
            <text class="stat-value">{{ flatCount }}</text>
            <text class="stat-label">平盘</text>
          </view>
        </view>

        <scroll-view
          class="stock-list"
          scroll-y
          :refresher-enabled="true"
          :refresher-triggered="isRefreshing"
          @refresherrefresh="onRefresh"
          @scrolltolower="onLoadMore"
        >
          <view
            v-for="stock in stockList"
            :key="stock.code"
            class="stock-card"
            :class="{ 
              'rising': stock.change > 0,
              'falling': stock.change < 0,
              'flat': stock.change === 0
            }"
            @tap="viewStockDetail(stock)"
          >
            <view class="stock-header">
              <view class="stock-info">
                <text class="stock-name">{{ stock.name }}</text>
                <text class="stock-code">{{ stock.code }}</text>
              </view>
              <view class="stock-trend" :class="getTrendClass(stock)">
                <text class="trend-icon">{{ getTrendIcon(stock) }}</text>
                <text class="trend-text">{{ getTrendText(stock) }}</text>
              </view>
            </view>
            <view class="stock-body">
              <view class="price-section">
                <text class="price-label">最新价</text>
                <text class="price-value" :class="stock.change >= 0 ? 'text-rise' : 'text-fall'">
                  {{ stock.price.toFixed(2) }}
                </text>
              </view>
              <view class="change-section">
                <text class="change-label">涨跌幅</text>
                <text class="change-value" :class="stock.change >= 0 ? 'text-rise' : 'text-fall'">
                  {{ stock.change >= 0 ? '+' : '' }}{{ stock.changePercent.toFixed(2) }}%
                </text>
              </view>
              <view class="volume-section">
                <text class="volume-label">成交量</text>
                <text class="volume-value">{{ formatVolume(stock.volume) }}</text>
              </view>
            </view>
            <view class="stock-footer">
              <view class="mini-chart">
                <view
                  v-for="(point, index) in stock.miniChart"
                  :key="index"
                  class="chart-point"
                  :class="{ 'up': point >= stock.price, 'down': point < stock.price }"
                  :style="{ height: getChartHeight(point, stock) + '%' }"
                ></view>
              </view>
              <view class="action-hint">
                <text class="hint-text">点击查看详情</text>
              </view>
            </view>
          </view>

          <view class="load-more" v-if="loading">
            <text class="load-text">加载中...</text>
          </view>
          <view class="load-more" v-else-if="!hasMore && stockList.length > 0">
            <text class="load-text">已经到底了</text>
          </view>

          <view class="empty-state" v-if="!loading && stockList.length === 0">
            <text class="empty-emoji">📊</text>
            <text class="empty-text">{{ searchKeyword ? '未找到相关股票' : '暂无行情数据' }}</text>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const searchKeyword = ref('')
const isRefreshing = ref(false)
const loading = ref(false)
const hasMore = ref(true)
const marketOpen = ref(true)
const currentFilter = ref('all')

const filters = [
  { value: 'all', label: '全部', icon: '📊' },
  { value: 'rising', label: '上涨', icon: '📈' },
  { value: 'falling', label: '下跌', icon: '📉' },
  { value: 'hot', label: '热门', icon: '🔥' },
]

const marketIndices = ref([
  { code: '000001', name: '上证指数', current: 3089.26, change: 15.32, changePercent: 0.50 },
  { code: '399001', name: '深证成指', current: 10087.52, change: -23.45, changePercent: -0.23 },
  { code: '399006', name: '创业板指', current: 1987.36, change: 8.67, changePercent: 0.44 },
])

const stockList = ref([
  {
    code: '600519',
    name: '贵州茅台',
    price: 1850.00,
    change: 25.00,
    changePercent: 1.37,
    volume: 125000,
    miniChart: [1830, 1835, 1828, 1840, 1845, 1838, 1850],
  },
  {
    code: '000858',
    name: '五粮液',
    price: 168.50,
    change: -2.30,
    changePercent: -1.35,
    volume: 89000,
    miniChart: [170, 169, 168.5, 169.5, 168, 168.5, 168.5],
  },
  {
    code: '300750',
    name: '宁德时代',
    price: 180.50,
    change: 5.80,
    changePercent: 3.32,
    volume: 156000,
    miniChart: [175, 176, 178, 179, 180, 180.5, 180.5],
  },
  {
    code: '002594',
    name: '比亚迪',
    price: 260.00,
    change: 8.50,
    changePercent: 3.38,
    volume: 134000,
    miniChart: [252, 254, 256, 258, 259, 260, 260],
  },
  {
    code: '601318',
    name: '中国平安',
    price: 45.20,
    change: -0.80,
    changePercent: -1.74,
    volume: 67000,
    miniChart: [46, 45.8, 45.5, 45.3, 45.5, 45.2, 45.2],
  },
  {
    code: '600036',
    name: '招商银行',
    price: 32.50,
    change: 0.45,
    changePercent: 1.40,
    volume: 98000,
    miniChart: [32.1, 32.2, 32.3, 32.4, 32.4, 32.5, 32.5],
  },
])

const risingCount = computed(() => stockList.value.filter(s => s.change > 0).length)
const fallingCount = computed(() => stockList.value.filter(s => s.change < 0).length)
const flatCount = computed(() => stockList.value.filter(s => s.change === 0).length)

function getTrendClass(stock: any): string {
  if (stock.change > 0) return 'rising'
  if (stock.change < 0) return 'falling'
  return 'flat'
}

function getTrendIcon(stock: any): string {
  if (stock.change > 0) return '📈'
  if (stock.change < 0) return '📉'
  return '➡️'
}

function getTrendText(stock: any): string {
  if (stock.change > 0) return '上涨'
  if (stock.change < 0) return '下跌'
  return '平盘'
}

function formatVolume(volume: number): string {
  if (volume >= 100000000) return (volume / 100000000).toFixed(2) + '亿'
  if (volume >= 10000) return (volume / 10000).toFixed(2) + '万'
  return volume.toString()
}

function getChartHeight(point: number, stock: any): number {
  const min = Math.min(...stock.miniChart)
  const max = Math.max(...stock.miniChart)
  const range = max - min || 1
  return ((point - min) / range) * 100
}

function onSearch() {
  console.log('搜索:', searchKeyword.value)
}

function clearSearch() {
  searchKeyword.value = ''
}

function switchFilter(filter: string) {
  currentFilter.value = filter
}

function onRefresh() {
  isRefreshing.value = true
  setTimeout(() => {
    isRefreshing.value = false
  }, 1000)
}

function onLoadMore() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  setTimeout(() => {
    loading.value = false
    hasMore.value = false
  }, 1000)
}

function viewStockDetail(stock: any) {
  uni.navigateTo({
    url: `/pages/market/stock-detail?code=${stock.code}`,
  })
}

onMounted(() => {
  console.log('市场竞技场已加载')
})
</script>

<style lang="scss" scoped>
.market-arena {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  position: relative;
  overflow: hidden;

  .arena-bg {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: 
      radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.1) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
  }

  .arena-container {
    position: relative;
    z-index: 1;
    padding: 24rpx;
  }
}

.arena-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32rpx;

  .arena-title {
    font-size: 40rpx;
    font-weight: bold;
    color: #ffffff;
  }

  .market-status {
    display: flex;
    align-items: center;
    gap: 12rpx;
    padding: 8rpx 20rpx;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 24rpx;

    .status-dot {
      width: 16rpx;
      height: 16rpx;
      border-radius: 8rpx;

      &.open {
        background: #52c41a;
        box-shadow: 0 0 12rpx rgba(82, 196, 26, 0.6);
      }

      &.closed {
        background: #8c8c8c;
      }
    }

    .status-text {
      font-size: 24rpx;
      color: rgba(255, 255, 255, 0.8);
    }
  }
}

.market-indices {
  display: flex;
  gap: 16rpx;
  margin-bottom: 32rpx;
  overflow-x: auto;
  padding-bottom: 8rpx;

  .index-card {
    flex-shrink: 0;
    width: 240rpx;
    padding: 24rpx;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20rpx);
    border-radius: 20rpx;
    border: 1rpx solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;

    &.rising {
      background: rgba(82, 196, 26, 0.1);
      border-color: rgba(82, 196, 26, 0.3);
    }

    &.falling {
      background: rgba(255, 77, 79, 0.1);
      border-color: rgba(255, 77, 79, 0.3);
    }

    .index-info {
      margin-bottom: 16rpx;

      .index-name {
        display: block;
        font-size: 28rpx;
        font-weight: 600;
        color: #ffffff;
        margin-bottom: 4rpx;
      }

      .index-code {
        display: block;
        font-size: 20rpx;
        color: rgba(255, 255, 255, 0.5);
      }
    }

    .index-value {
      .value-text {
        display: block;
        font-size: 36rpx;
        font-weight: bold;
        color: #ffffff;
        margin-bottom: 8rpx;
      }

      .value-change {
        display: flex;
        align-items: center;
        gap: 8rpx;

        .change-icon {
          font-size: 24rpx;
        }

        .change-text {
          font-size: 24rpx;
          font-weight: 600;
        }
      }
    }
  }
}

.search-section {
  margin-bottom: 32rpx;

  .search-bar {
    display: flex;
    align-items: center;
    gap: 16rpx;
    padding: 20rpx 24rpx;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20rpx);
    border-radius: 24rpx;
    border: 1rpx solid rgba(255, 255, 255, 0.1);
    margin-bottom: 16rpx;

    .search-icon {
      font-size: 32rpx;
      color: rgba(255, 255, 255, 0.5);
    }

    .search-input {
      flex: 1;
      font-size: 28rpx;
      color: #ffffff;
    }

    .clear-icon {
      font-size: 36rpx;
      color: rgba(255, 255, 255, 0.5);
      padding: 0 8rpx;
    }
  }

  .filter-tags {
    display: flex;
    gap: 12rpx;
    overflow-x: auto;
    padding-bottom: 8rpx;

    .filter-tag {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8rpx;
      padding: 12rpx 20rpx;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 20rpx;
      border: 1rpx solid rgba(255, 255, 255, 0.1);
      transition: all 0.3s ease;

      &.active {
        background: rgba(102, 126, 234, 0.2);
        border-color: rgba(102, 126, 234, 0.5);
      }

      .tag-icon {
        font-size: 24rpx;
      }

      .tag-text {
        font-size: 24rpx;
        color: rgba(255, 255, 255, 0.8);
      }
    }
  }
}

.stock-arena {
  .arena-stats {
    display: flex;
    gap: 12rpx;
    margin-bottom: 24rpx;

    .stat-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8rpx;
      padding: 20rpx 12rpx;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20rpx);
      border-radius: 16rpx;
      border: 1rpx solid rgba(255, 255, 255, 0.1);

      .stat-icon {
        font-size: 32rpx;
      }

      .stat-value {
        font-size: 28rpx;
        font-weight: bold;
        color: #ffffff;
      }

      .stat-label {
        font-size: 20rpx;
        color: rgba(255, 255, 255, 0.5);
      }
    }
  }

  .stock-list {
    height: calc(100vh - 600rpx);
  }
}

.stock-card {
  margin-bottom: 16rpx;
  padding: 24rpx;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20rpx);
  border-radius: 20rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;

  &.rising {
    border-color: rgba(82, 196, 26, 0.3);
  }

  &.falling {
    border-color: rgba(255, 77, 79, 0.3);
  }

  &.flat {
    border-color: rgba(140, 140, 140, 0.3);
  }

  .stock-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20rpx;

    .stock-info {
      .stock-name {
        display: block;
        font-size: 32rpx;
        font-weight: 600;
        color: #ffffff;
        margin-bottom: 4rpx;
      }

      .stock-code {
        display: block;
        font-size: 22rpx;
        color: rgba(255, 255, 255, 0.5);
      }
    }

    .stock-trend {
      display: flex;
      align-items: center;
      gap: 8rpx;
      padding: 8rpx 16rpx;
      border-radius: 16rpx;
      font-size: 22rpx;

      &.rising {
        background: rgba(82, 196, 26, 0.2);
        color: #52c41a;
      }

      &.falling {
        background: rgba(255, 77, 79, 0.2);
        color: #ff4d4f;
      }

      &.flat {
        background: rgba(140, 140, 140, 0.2);
        color: #8c8c8c;
      }

      .trend-icon {
        font-size: 20rpx;
      }

      .trend-text {
        font-size: 22rpx;
        font-weight: 600;
      }
    }
  }

  .stock-body {
    display: flex;
    justify-content: space-around;
    margin-bottom: 20rpx;
    padding: 16rpx 0;
    border-top: 1rpx solid rgba(255, 255, 255, 0.1);
    border-bottom: 1rpx solid rgba(255, 255, 255, 0.1);

    .price-section,
    .change-section,
    .volume-section {
      text-align: center;

      .price-label,
      .change-label,
      .volume-label {
        display: block;
        font-size: 20rpx;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 8rpx;
      }

      .price-value,
      .change-value,
      .volume-value {
        display: block;
        font-size: 32rpx;
        font-weight: bold;
        color: #ffffff;
      }
    }
  }

  .stock-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .mini-chart {
      display: flex;
      gap: 6rpx;
      align-items: flex-end;
      height: 60rpx;
      flex: 1;

      .chart-point {
        flex: 1;
        min-width: 4rpx;
        border-radius: 2rpx;
        transition: all 0.3s ease;

        &.up {
          background: linear-gradient(180deg, #52c41a 0%, #73d13d 100%);
        }

        &.down {
          background: linear-gradient(180deg, #ff4d4f 0%, #ff7875 100%);
        }
      }
    }

    .action-hint {
      .hint-text {
        font-size: 20rpx;
        color: rgba(255, 255, 255, 0.4);
      }
    }
  }
}

.load-more {
  text-align: center;
  padding: 32rpx 0;

  .load-text {
    font-size: 24rpx;
    color: rgba(255, 255, 255, 0.5);
  }
}

.empty-state {
  text-align: center;
  padding: 120rpx 32rpx;

  .empty-emoji {
    display: block;
    font-size: 120rpx;
    margin-bottom: 24rpx;
    opacity: 0.5;
  }

  .empty-text {
    display: block;
    font-size: 28rpx;
    color: rgba(255, 255, 255, 0.6);
  }
}

.text-rise { color: #ff4d4f; }
.text-fall { color: #52c41a; }
</style>
