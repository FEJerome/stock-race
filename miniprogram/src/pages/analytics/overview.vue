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
      <view class="chart-placeholder">
        <text class="placeholder-text">总资产曲线</text>
        <text class="placeholder-desc">后续集成ucharts图表组件</text>
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
      <view class="chart-placeholder">
        <text class="placeholder-text">收益率曲线</text>
        <text class="placeholder-desc">后续集成ucharts图表组件</text>
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
import { ref, computed, onMounted } from 'vue'
import { useTradingStore } from '@/stores/trading'
import { formatChange, formatPercent } from '@/utils/formatter'

const tradingStore = useTradingStore()

// 状态
const loading = ref(false)
const assetPeriod = ref<'1m' | '3m' | '6m' | '1y'>('1m')
const returnPeriod = ref<'1m' | '3m' | '6m' | '1y'>('1m')

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
  // 这里可以触发数据重新加载
}

// 切换收益率周期
function switchReturnPeriod(period: '1m' | '3m' | '6m' | '1y') {
  returnPeriod.value = period
  // 这里可以触发数据重新加载
}

// 加载分析数据
async function loadAnalyticsData() {
  loading.value = true
  try {
    await tradingStore.fetchOverview()
    // 这里可以加载更多分析数据
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
