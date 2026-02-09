<template>
  <view class="analytics-overview-page">
    <!-- 收益统计卡片（横向滚动） -->
    <view class="profit-stats-section">
      <scroll-view class="profit-stats-scroll" scroll-x>
        <view class="profit-stats-container">
          <view class="profit-card today">
            <text class="card-label">今日收益</text>
            <text
              class="card-value"
              :class="todayProfit >= 0 ? 'text-rise' : 'text-fall'"
            >
              {{ formatChange(todayProfit) }}
            </text>
            <text
              class="card-rate"
              :class="todayProfitRate >= 0 ? 'text-rise' : 'text-fall'"
            >
              {{ formatPercent(todayProfitRate / 100) }}
            </text>
          </view>
          <view class="profit-card week">
            <text class="card-label">本周收益</text>
            <text
              class="card-value"
              :class="weekProfit >= 0 ? 'text-rise' : 'text-fall'"
            >
              {{ formatChange(weekProfit) }}
            </text>
            <text
              class="card-rate"
              :class="weekProfitRate >= 0 ? 'text-rise' : 'text-fall'"
            >
              {{ formatPercent(weekProfitRate / 100) }}
            </text>
          </view>
          <view class="profit-card month">
            <text class="card-label">本月收益</text>
            <text
              class="card-value"
              :class="monthProfit >= 0 ? 'text-rise' : 'text-fall'"
            >
              {{ formatChange(monthProfit) }}
            </text>
            <text
              class="card-rate"
              :class="monthProfitRate >= 0 ? 'text-rise' : 'text-fall'"
            >
              {{ formatPercent(monthProfitRate / 100) }}
            </text>
          </view>
          <view class="profit-card year">
            <text class="card-label">本年收益</text>
            <text
              class="card-value"
              :class="yearProfit >= 0 ? 'text-rise' : 'text-fall'"
            >
              {{ formatChange(yearProfit) }}
            </text>
            <text
              class="card-rate"
              :class="yearProfitRate >= 0 ? 'text-rise' : 'text-fall'"
            >
              {{ formatPercent(yearProfitRate / 100) }}
            </text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 总资产曲线 -->
    <view class="chart-card">
      <view class="card-header">
        <text class="card-title">总资产走势</text>
        <view class="period-tabs">
          <text
            class="tab-item"
            :class="{ active: assetPeriod === '1m' }"
            @click="switchAssetPeriod('1m')"
          >1月</text>
          <text
            class="tab-item"
            :class="{ active: assetPeriod === '3m' }"
            @click="switchAssetPeriod('3m')"
          >3月</text>
          <text
            class="tab-item"
            :class="{ active: assetPeriod === '6m' }"
            @click="switchAssetPeriod('6m')"
          >6月</text>
          <text
            class="tab-item"
            :class="{ active: assetPeriod === '1y' }"
            @click="switchAssetPeriod('1y')"
          >1年</text>
        </view>
      </view>
      <view class="chart-container">
        <LineChart
          :categories="assetCategories"
          :series="assetSeries"
          :height="400"
          :showArea="true"
          canvasId="asset-line-chart"
          @complete="onChartComplete('asset')"
          @error="onChartError('asset', $event)"
        />
        <view class="chart-loading" v-if="chartLoading.asset">
          <u-loading-icon mode="circle" size="32"></u-loading-icon>
          <text class="loading-text">加载中...</text>
        </view>
      </view>
    </view>

    <!-- 收益率曲线 -->
    <view class="chart-card">
      <view class="card-header">
        <text class="card-title">收益率走势</text>
        <view class="period-tabs">
          <text
            class="tab-item"
            :class="{ active: returnPeriod === '1m' }"
            @click="switchReturnPeriod('1m')"
          >1月</text>
          <text
            class="tab-item"
            :class="{ active: returnPeriod === '3m' }"
            @click="switchReturnPeriod('3m')"
          >3月</text>
          <text
            class="tab-item"
            :class="{ active: returnPeriod === '6m' }"
            @click="switchReturnPeriod('6m')"
          >6月</text>
          <text
            class="tab-item"
            :class="{ active: returnPeriod === '1y' }"
            @click="switchReturnPeriod('1y')"
          >1年</text>
        </view>
      </view>
      <view class="chart-container">
        <LineChart
          :categories="returnCategories"
          :series="returnSeries"
          :height="400"
          :showLegend="true"
          canvasId="return-line-chart"
          @complete="onChartComplete('return')"
          @error="onChartError('return', $event)"
        />
        <view class="chart-loading" v-if="chartLoading.return">
          <u-loading-icon mode="circle" size="32"></u-loading-icon>
          <text class="loading-text">加载中...</text>
        </view>
      </view>
    </view>

    <!-- 回撤分析 -->
    <view class="analysis-card">
      <view class="card-header">
        <text class="card-title">回撤分析</text>
      </view>
      <view class="analysis-content">
        <view class="analysis-item">
          <view class="item-left">
            <text class="item-label">最大回撤</text>
            <text class="item-desc">历史最大亏损幅度</text>
          </view>
          <text class="item-value text-fall">{{ formatPercent(maxDrawdown / 100) }}</text>
        </view>
        <view class="analysis-item">
          <view class="item-left">
            <text class="item-label">回撤天数</text>
            <text class="item-desc">当前回撤持续天数</text>
          </view>
          <text class="item-value">{{ drawdownDays }}天</text>
        </view>
        <view class="analysis-item">
          <view class="item-left">
            <text class="item-label">恢复天数</text>
            <text class="item-desc">历史平均恢复天数</text>
          </view>
          <text class="item-value">{{ recoveryDays }}天</text>
        </view>
      </view>
    </view>

    <!-- 风险评估 -->
    <view class="analysis-card">
      <view class="card-header">
        <text class="card-title">风险评估</text>
      </view>
      <view class="analysis-content">
        <view class="analysis-item">
          <view class="item-left">
            <text class="item-label">波动率</text>
            <text class="item-desc">收益率标准差</text>
          </view>
          <view class="item-right">
            <text class="item-value">{{ formatPercent(volatility / 100) }}</text>
            <view class="risk-bar">
              <view class="risk-fill" :style="{ width: volatility + '%' }"></view>
            </view>
          </view>
        </view>
        <view class="analysis-item">
          <view class="item-left">
            <text class="item-label">夏普比率</text>
            <text class="item-desc">风险调整后收益</text>
          </view>
          <text
            class="item-value"
            :class="sharpeRatio >= 1 ? 'text-rise' : sharpeRatio >= 0 ? 'text-neutral' : 'text-fall'"
          >
            {{ sharpeRatio.toFixed(2) }}
          </text>
        </view>
        <view class="analysis-item">
          <view class="item-left">
            <text class="item-label">贝塔系数</text>
            <text class="item-desc">相对于市场波动</text>
          </view>
          <text
            class="item-value"
            :class="beta >= 1 ? 'text-rise' : 'text-neutral'"
          >
            {{ beta.toFixed(2) }}
          </text>
        </view>
      </view>
    </view>

    <!-- 加载状态 -->
    <view class="loading-state" v-if="loading">
      <u-loading-icon mode="circle" size="48"></u-loading-icon>
      <text class="loading-text">加载分析数据中...</text>
    </view>

    <!-- 空状态 -->
    <view class="empty-state" v-if="!loading && !hasData">
      <u-empty mode="data" text="暂无分析数据"></u-empty>
      <text class="empty-desc">开始投资后将生成分析报告</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useTradingStore } from '@/stores/trading'
import { formatChange, formatPercent } from '@/utils/formatter'
import LineChart from '@/components/charts/LineChart.vue'

const tradingStore = useTradingStore()

// 状态
const loading = ref(false)
const assetPeriod = ref<'1m' | '3m' | '6m' | '1y'>('1m')
const returnPeriod = ref<'1m' | '3m' | '6m' | '1y'>('1m')

// 图表数据
const assetCategories = ref<string[]>([])
const assetSeries = ref<{ name: string; data: number[]; color?: string }[]>([])
const returnCategories = ref<string[]>([])
const returnSeries = ref<{ name: string; data: number[]; color?: string }[]>([])
const chartLoading = ref({
  asset: false,
  return: false
})

// 模拟数据 - 后续从API获取
const todayProfit = computed(() => tradingStore.overview?.todayProfit ?? 0)
const todayProfitRate = computed(() => tradingStore.overview?.todayProfitRate ?? 0)
const weekProfit = ref(12580.5)
const weekProfitRate = ref(2.35)
const monthProfit = ref(45680.2)
const monthProfitRate = ref(8.62)
const yearProfit = computed(() => tradingStore.totalProfit)
const yearProfitRate = computed(() => tradingStore.profitRate)

// 回撤数据
const maxDrawdown = ref(15.8)
const drawdownDays = ref(3)
const recoveryDays = ref(12)

// 风险指标
const volatility = ref(22.5)
const sharpeRatio = ref(1.35)
const beta = ref(0.85)

// 是否有数据
const hasData = computed(() => {
  return tradingStore.overview !== null
})

// 切换资产周期
function switchAssetPeriod(period: '1m' | '3m' | '6m' | '1y') {
  assetPeriod.value = period
  fetchAssetData()
}

// 切换收益率周期
function switchReturnPeriod(period: '1m' | '3m' | '6m' | '1y') {
  returnPeriod.value = period
  fetchReturnData()
}

// 获取资产走势数据
async function fetchAssetData() {
  chartLoading.value.asset = true
  try {
    // 模拟API调用，实际项目中替换为真实API
    const data = generateMockAssetData(assetPeriod.value)
    assetCategories.value = data.categories
    assetSeries.value = data.series
  } finally {
    chartLoading.value.asset = false
  }
}

// 获取收益率走势数据
async function fetchReturnData() {
  chartLoading.value.return = true
  try {
    // 模拟API调用，实际项目中替换为真实API
    const data = generateMockReturnData(returnPeriod.value)
    returnCategories.value = data.categories
    returnSeries.value = data.series
  } finally {
    chartLoading.value.return = false
  }
}

// 生成模拟资产数据
function generateMockAssetData(period: string) {
  const days = period === '1m' ? 30 : period === '3m' ? 90 : period === '6m' ? 180 : 365
  const categories: string[] = []
  const data: number[] = []
  const baseAsset = tradingStore.overview?.totalAssets || 1000000

  let currentAsset = baseAsset * 0.9
  const now = new Date()

  for (let i = days; i >= 0; i -= Math.floor(days / 20)) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    categories.push(`${date.getMonth() + 1}/${date.getDate()}`)

    const change = (Math.random() - 0.48) * 0.02
    currentAsset = currentAsset * (1 + change)
    data.push(parseFloat(currentAsset.toFixed(2)))
  }

  return {
    categories,
    series: [{
      name: '总资产',
      data,
      color: '#1890ff'
    }]
  }
}

// 生成模拟收益率数据
function generateMockReturnData(period: string) {
  const days = period === '1m' ? 30 : period === '3m' ? 90 : period === '6m' ? 180 : 365
  const categories: string[] = []
  const data: number[] = []
  const benchmark: number[] = []

  let currentReturn = 0
  let currentBenchmark = 0
  const now = new Date()

  for (let i = days; i >= 0; i -= Math.floor(days / 20)) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    categories.push(`${date.getMonth() + 1}/${date.getDate()}`)

    const change = (Math.random() - 0.48) * 2
    currentReturn += change
    data.push(parseFloat(currentReturn.toFixed(2)))

    const benchmarkChange = (Math.random() - 0.5) * 1.5
    currentBenchmark += benchmarkChange
    benchmark.push(parseFloat(currentBenchmark.toFixed(2)))
  }

  return {
    categories,
    series: [
      {
        name: '我的收益',
        data,
        color: '#1890ff'
      },
      {
        name: '沪深300',
        data: benchmark,
        color: '#faad14'
      }
    ]
  }
}

// 图表完成回调
function onChartComplete(type: 'asset' | 'return') {
  console.log(`${type}图表渲染完成`)
}

// 图表错误回调
function onChartError(type: 'asset' | 'return', error: any) {
  console.error(`${type}图表渲染错误:`, error)
}

// 加载分析数据
async function loadAnalyticsData() {
  loading.value = true
  try {
    await tradingStore.fetchOverview()
    // 加载图表数据
    await Promise.all([
      fetchAssetData(),
      fetchReturnData()
    ])
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadAnalyticsData()
})
</script>

<style lang="scss" scoped>
.analytics-overview-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
}

// 收益统计区域
.profit-stats-section {
  margin-bottom: 24rpx;

  .profit-stats-scroll {
    white-space: nowrap;
  }

  .profit-stats-container {
    display: flex;
    gap: 16rpx;
    padding: 4rpx;
  }

  .profit-card {
    flex-shrink: 0;
    width: 280rpx;
    background: #ffffff;
    border-radius: 16rpx;
    padding: 32rpx;
    box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);

    &.today {
      border-left: 6rpx solid #1890ff;
    }

    &.week {
      border-left: 6rpx solid #52c41a;
    }

    &.month {
      border-left: 6rpx solid #faad14;
    }

    &.year {
      border-left: 6rpx solid #722ed1;
    }

    .card-label {
      display: block;
      font-size: 24rpx;
      color: #8c8c8c;
      margin-bottom: 16rpx;
    }

    .card-value {
      display: block;
      font-size: 36rpx;
      font-weight: 600;
      margin-bottom: 8rpx;
    }

    .card-rate {
      display: block;
      font-size: 26rpx;
      padding: 4rpx 12rpx;
      background: #f5f5f5;
      border-radius: 8rpx;
      display: inline-block;
    }
  }
}

// 图表卡片
.chart-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .card-title {
      font-size: 30rpx;
      font-weight: 600;
      color: #262626;
    }

    .period-tabs {
      display: flex;
      gap: 8rpx;

      .tab-item {
        font-size: 24rpx;
        color: #8c8c8c;
        padding: 8rpx 20rpx;
        border-radius: 8rpx;
        background: #f5f5f5;

        &.active {
          color: #1890ff;
          background: rgba(24, 144, 255, 0.1);
        }
      }
    }
  }

  .chart-container {
    position: relative;
    height: 400rpx;
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

// 分析卡片
.analysis-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;

  .card-header {
    margin-bottom: 24rpx;

    .card-title {
      font-size: 30rpx;
      font-weight: 600;
      color: #262626;
    }
  }

  .analysis-content {
    .analysis-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24rpx 0;
      border-bottom: 1rpx solid #f5f5f5;

      &:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }

      &:first-child {
        padding-top: 0;
      }

      .item-left {
        .item-label {
          display: block;
          font-size: 28rpx;
          color: #262626;
          margin-bottom: 4rpx;
        }

        .item-desc {
          display: block;
          font-size: 22rpx;
          color: #8c8c8c;
        }
      }

      .item-right {
        display: flex;
        align-items: center;
        gap: 16rpx;

        .risk-bar {
          width: 100rpx;
          height: 8rpx;
          background: #f5f5f5;
          border-radius: 4rpx;
          overflow: hidden;

          .risk-fill {
            height: 100%;
            background: linear-gradient(90deg, #52c41a 0%, #faad14 50%, #ff4d4f 100%);
            border-radius: 4rpx;
            transition: width 0.3s ease;
          }
        }
      }

      .item-value {
        font-size: 32rpx;
        font-weight: 600;
        color: #262626;
      }
    }
  }
}

// 加载状态
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 48rpx;

  .loading-text {
    margin-top: 24rpx;
    font-size: 28rpx;
    color: #8c8c8c;
  }
}

// 空状态
.empty-state {
  text-align: center;
  padding: 120rpx 48rpx;

  .empty-desc {
    display: block;
    margin-top: 16rpx;
    font-size: 26rpx;
    color: #8c8c8c;
  }
}

.text-rise { color: #ff4d4f; }
.text-fall { color: #52c41a; }
.text-neutral { color: #8c8c8c; }
</style>
