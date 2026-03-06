<template>
  <view class="stock-detail-page">
    <!-- 股票基本信息 -->
    <view class="stock-header" v-if="stockDetail">
      <view class="stock-title">
        <text class="stock-name">{{ stockDetail.name }}</text>
        <text class="stock-code">{{ stockDetail.code }}</text>
        <text class="stock-market">{{ stockDetail.market }}</text>
      </view>
      <view class="stock-price-section">
        <text class="current-price" :class="getPriceClass(stockDetail.quote.change)">
          {{ formatPrice(stockDetail.quote.price) }}
        </text>
        <view class="price-change">
          <text class="change-amount" :class="getPriceClass(stockDetail.quote.change)">
            {{ stockDetail.quote.change >= 0 ? '+' : '' }}{{ formatPrice(stockDetail.quote.change) }}
          </text>
          <text class="change-rate" :class="getPriceClass(stockDetail.quote.change)">
            {{ formatPercent(stockDetail.quote.changeRate / 100) }}
          </text>
        </view>
      </view>
    </view>

    <!-- 行情数据 -->
    <view class="quote-section" v-if="stockDetail">
      <view class="quote-grid">
        <view class="quote-item">
          <text class="quote-label">今开</text>
          <text class="quote-value">{{ formatPrice(stockDetail.quote.open) }}</text>
        </view>
        <view class="quote-item">
          <text class="quote-label">昨收</text>
          <text class="quote-value">{{ formatPrice(stockDetail.quote.preClose) }}</text>
        </view>
        <view class="quote-item">
          <text class="quote-label">最高</text>
          <text class="quote-value" :class="getPriceClass(stockDetail.quote.high - stockDetail.quote.preClose)">
            {{ formatPrice(stockDetail.quote.high) }}
          </text>
        </view>
        <view class="quote-item">
          <text class="quote-label">最低</text>
          <text class="quote-value" :class="getPriceClass(stockDetail.quote.low - stockDetail.quote.preClose)">
            {{ formatPrice(stockDetail.quote.low) }}
          </text>
        </view>
        <view class="quote-item">
          <text class="quote-label">成交量</text>
          <text class="quote-value">{{ formatVolume(stockDetail.quote.volume) }}</text>
        </view>
        <view class="quote-item">
          <text class="quote-label">成交额</text>
          <text class="quote-value">{{ formatAmount(stockDetail.quote.amount) }}</text>
        </view>
      </view>
    </view>

    <!-- K线图 -->
    <view class="chart-section">
      <view class="section-header">
        <text class="section-title">走势图</text>
        <view class="period-tabs">
          <text
            class="tab-item"
            :class="{ active: activePeriod === '1d' }"
            @click="switchPeriod('1d')"
          >日K</text>
          <text
            class="tab-item"
            :class="{ active: activePeriod === '1w' }"
            @click="switchPeriod('1w')"
          >周K</text>
          <text
            class="tab-item"
            :class="{ active: activePeriod === '1m' }"
            @click="switchPeriod('1m')"
          >月K</text>
        </view>
      </view>
      <view class="chart-container">
        <KLineChart
          :data="kLineData"
          :period="activePeriod"
          :height="500"
          canvasId="stock-kline-chart"
          @complete="onChartComplete"
          @error="onChartError"
        />
        <view class="chart-loading" v-if="chartLoading">
          <u-loading-icon mode="circle" size="32"></u-loading-icon>
          <text class="loading-text">加载中...</text>
        </view>
      </view>
    </view>

    <!-- 公司信息 -->
    <view class="company-section" v-if="stockDetail">
      <view class="section-title">公司信息</view>
      <view class="info-grid">
        <view class="info-item">
          <text class="info-label">所属行业</text>
          <text class="info-value">{{ stockDetail.industry || '-' }}</text>
        </view>
        <view class="info-item">
          <text class="info-label">市盈率</text>
          <text class="info-value">{{ stockDetail.pe ? formatPrice(stockDetail.pe) : '-' }}</text>
        </view>
        <view class="info-item">
          <text class="info-label">市净率</text>
          <text class="info-value">{{ stockDetail.pb ? formatPrice(stockDetail.pb) : '-' }}</text>
        </view>
        <view class="info-item">
          <text class="info-label">总市值</text>
          <text class="info-value">{{ stockDetail.marketCap ? formatAmount(stockDetail.marketCap) : '-' }}</text>
        </view>
        <view class="info-item">
          <text class="info-label">流通市值</text>
          <text class="info-value">{{ stockDetail.circulatingCap ? formatAmount(stockDetail.circulatingCap) : '-' }}</text>
        </view>
      </view>
    </view>

    <!-- 操作按钮 -->
    <view class="action-bar">
      <button class="action-btn watchlist" @click="toggleWatchlist">
        <text class="btn-icon">{{ isInWatchlist ? '★' : '☆' }}</text>
        <text class="btn-text">{{ isInWatchlist ? '已自选' : '加自选' }}</text>
      </button>
      <button class="action-btn trade buy" @click="goToTrade('buy')">买入</button>
      <button class="action-btn trade sell" @click="goToTrade('sell')">卖出</button>
    </view>

    <!-- 加载状态 -->
    <view class="loading-state" v-if="loading">
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 错误状态 -->
    <view class="error-state" v-if="error">
      <text class="error-text">{{ error }}</text>
      <button class="retry-btn" @click="fetchStockDetail">重新加载</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { marketApi } from '@/api/market'
import type { StockDetail, KLineData } from '@/types/market'
import { formatPrice, formatPercent, formatVolume, formatAmount } from '@/utils/formatter'
import KLineChart from '@/components/charts/KLineChart.vue'

// 页面参数
const stockCode = ref('')

// 数据状态
const stockDetail = ref<StockDetail | null>(null)
const loading = ref(false)
const error = ref('')
const isInWatchlist = ref(false)
const activePeriod = ref<'1d' | '1w' | '1m'>('1d')

// K线数据
const kLineData = ref<KLineData[]>([])
const chartLoading = ref(false)

// 获取价格样式类
function getPriceClass(change: number): string {
  if (change > 0) return 'text-rise'
  if (change < 0) return 'text-fall'
  return 'text-neutral'
}

// 获取股票详情
async function fetchStockDetail() {
  if (!stockCode.value) return

  loading.value = true
  error.value = ''

  try {
    const detail = await marketApi.getStockDetail(stockCode.value)
    stockDetail.value = detail
  } catch (err) {
    console.error('Fetch stock detail error:', err)
    error.value = '获取股票详情失败'
  } finally {
    loading.value = false
  }
}

// 切换K线周期
function switchPeriod(period: '1d' | '1w' | '1m') {
  activePeriod.value = period
  // 加载对应周期的K线数据
  fetchKLineData()
}

// 获取K线数据
async function fetchKLineData() {
  if (!stockCode.value) return

  chartLoading.value = true
  try {
    const data = await marketApi.getKLineData(stockCode.value, activePeriod.value)
    kLineData.value = data
  } catch (err) {
    console.error('Fetch K-line data error:', err)
    // 使用模拟数据作为降级
    kLineData.value = generateMockKLineData()
  } finally {
    chartLoading.value = false
  }
}

// 生成模拟K线数据
function generateMockKLineData(): KLineData[] {
  const data: KLineData[] = []
  const basePrice = stockDetail.value?.quote?.preClose || 100
  const days = activePeriod.value === '1d' ? 60 : activePeriod.value === '1w' ? 30 : 12

  let currentPrice = basePrice
  const now = new Date()

  for (let i = days; i >= 0; i--) {
    const date = new Date(now)
    if (activePeriod.value === '1d') {
      date.setDate(date.getDate() - i)
    } else if (activePeriod.value === '1w') {
      date.setDate(date.getDate() - i * 7)
    } else {
      date.setMonth(date.getMonth() - i)
    }

    const volatility = 0.02
    const change = (Math.random() - 0.5) * 2 * volatility
    const open = currentPrice
    const close = currentPrice * (1 + change)
    const high = Math.max(open, close) * (1 + Math.random() * 0.01)
    const low = Math.min(open, close) * (1 - Math.random() * 0.01)

    data.push({
      date: date.toISOString().split('T')[0],
      open: parseFloat(open.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000) + 500000
    })

    currentPrice = close
  }

  return data
}

// 切换自选状态
async function toggleWatchlist() {
  if (!stockCode.value) return

  try {
    if (isInWatchlist.value) {
      await marketApi.removeFromWatchlist(stockCode.value)
      isInWatchlist.value = false
      uni.showToast({ title: '已移除自选', icon: 'success' })
    } else {
      await marketApi.addToWatchlist(stockCode.value)
      isInWatchlist.value = true
      uni.showToast({ title: '已添加自选', icon: 'success' })
    }
  } catch (err) {
    console.error('Toggle watchlist error:', err)
    uni.showToast({ title: '操作失败', icon: 'none' })
  }
}

// 跳转交易页面
function goToTrade(type: 'buy' | 'sell') {
  if (!stockCode.value) return
  uni.navigateTo({
    url: `/pages/trades/trade?code=${stockCode.value}&type=${type}`
  })
}

// 图表完成回调
function onChartComplete() {
  console.log('K线图渲染完成')
}

// 图表错误回调
function onChartError(err: any) {
  console.error('K线图渲染错误:', err)
}

onMounted(() => {
  // 获取页面参数
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  stockCode.value = currentPage.options?.code || ''

  if (stockCode.value) {
    fetchStockDetail().then(() => {
      fetchKLineData()
    })
  } else {
    error.value = '股票代码不能为空'
  }
})

// 监听股票详情变化，更新K线数据
watch(() => stockDetail.value?.quote?.preClose, () => {
  if (kLineData.value.length === 0) {
    fetchKLineData()
  }
})
</script>

<style lang="scss" scoped>
.stock-detail-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 120rpx;
}

// 股票头部信息
.stock-header {
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  padding: 40rpx 32rpx;
  color: #ffffff;

  .stock-title {
    display: flex;
    align-items: center;
    margin-bottom: 24rpx;

    .stock-name {
      font-size: 40rpx;
      font-weight: 600;
      margin-right: 16rpx;
    }

    .stock-code {
      font-size: 24rpx;
      opacity: 0.8;
      margin-right: 12rpx;
    }

    .stock-market {
      font-size: 20rpx;
      padding: 4rpx 12rpx;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 8rpx;
    }
  }

  .stock-price-section {
    display: flex;
    align-items: baseline;

    .current-price {
      font-size: 64rpx;
      font-weight: bold;
      margin-right: 24rpx;
    }

    .price-change {
      display: flex;
      gap: 16rpx;

      .change-amount,
      .change-rate {
        font-size: 28rpx;
        padding: 8rpx 16rpx;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 8rpx;
      }
    }
  }
}

// 行情数据
.quote-section {
  background: #ffffff;
  padding: 24rpx 32rpx;
  margin-bottom: 16rpx;

  .quote-grid {
    display: flex;
    flex-wrap: wrap;

    .quote-item {
      width: 33.33%;
      padding: 20rpx 0;
      text-align: center;
      border-bottom: 1rpx solid #f5f5f5;

      &:nth-last-child(-n+3) {
        border-bottom: none;
      }

      .quote-label {
        display: block;
        font-size: 24rpx;
        color: #8c8c8c;
        margin-bottom: 8rpx;
      }

      .quote-value {
        display: block;
        font-size: 28rpx;
        font-weight: 500;
        color: #262626;
      }
    }
  }
}

// 图表区域
.chart-section {
  background: #ffffff;
  padding: 24rpx 32rpx;
  margin-bottom: 16rpx;

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .section-title {
      font-size: 28rpx;
      font-weight: 600;
      color: #262626;
    }

    .period-tabs {
      display: flex;
      gap: 16rpx;

      .tab-item {
        font-size: 24rpx;
        color: #8c8c8c;
        padding: 8rpx 20rpx;
        border-radius: 8rpx;

        &.active {
          color: #1890ff;
          background: rgba(24, 144, 255, 0.1);
        }
      }
    }
  }

  .chart-container {
    position: relative;
    height: 500rpx;
    background: #ffffff;
    border-radius: 12rpx;

    .chart-loading {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.9);

      .loading-text {
        margin-top: 16rpx;
        font-size: 24rpx;
        color: #8c8c8c;
      }
    }
  }

  .chart-placeholder {
    height: 400rpx;
    background: #f5f5f5;
    border-radius: 12rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    .placeholder-text {
      font-size: 32rpx;
      color: #8c8c8c;
      margin-bottom: 12rpx;
    }

    .placeholder-desc {
      font-size: 24rpx;
      color: #bfbfbf;
    }
  }
}

// 公司信息
.company-section {
  background: #ffffff;
  padding: 24rpx 32rpx;
  margin-bottom: 16rpx;

  .section-title {
    font-size: 28rpx;
    font-weight: 600;
    color: #262626;
    margin-bottom: 24rpx;
  }

  .info-grid {
    display: flex;
    flex-wrap: wrap;

    .info-item {
      width: 50%;
      padding: 20rpx 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-right: 32rpx;
      box-sizing: border-box;

      &:nth-child(2n) {
        padding-right: 0;
        padding-left: 32rpx;
        border-left: 1rpx solid #f0f0f0;
      }

      .info-label {
        font-size: 26rpx;
        color: #8c8c8c;
      }

      .info-value {
        font-size: 26rpx;
        color: #262626;
        font-weight: 500;
      }
    }
  }
}

// 操作按钮
.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 16rpx;
  padding: 24rpx 32rpx;
  background: #ffffff;
  border-top: 1rpx solid #f0f0f0;

  .action-btn {
    height: 80rpx;
    line-height: 80rpx;
    border-radius: 40rpx;
    font-size: 28rpx;
    border: none;

    &.watchlist {
      flex: 1;
      background: #f5f5f5;
      color: #595959;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8rpx;

      .btn-icon {
        font-size: 32rpx;
        color: #faad14;
      }
    }

    &.trade {
      flex: 1.5;
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

// 错误状态
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 48rpx;

  .error-text {
    font-size: 28rpx;
    color: #ff4d4f;
    margin-bottom: 24rpx;
  }

  .retry-btn {
    padding: 16rpx 48rpx;
    background: #1890ff;
    color: #ffffff;
    border-radius: 32rpx;
    font-size: 28rpx;
    border: none;
  }
}

.text-rise { color: #ff4d4f; }
.text-fall { color: #52c41a; }
.text-neutral { color: #595959; }
</style>
