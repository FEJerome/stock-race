<template>
  <view class="profit-curve-chart">
    <view class="chart-header" v-if="showHeader">
      <text class="chart-title">{{ title }}</text>
      <view class="profit-info" v-if="showProfitInfo">
        <text class="profit-label">累计收益</text>
        <text class="profit-value" :class="{ 'profit-positive': totalProfit >= 0, 'profit-negative': totalProfit < 0 }">
          {{ formatProfit(totalProfit) }}
        </text>
        <text class="profit-rate" :class="{ 'profit-positive': totalProfitRate >= 0, 'profit-negative': totalProfitRate < 0 }">
          {{ formatProfitRate(totalProfitRate) }}
        </text>
      </view>
    </view>
    <view class="chart-container">
      <qiun-data-charts
        type="line"
        :opts="chartOpts"
        :chartData="chartData"
        :canvas2d="false"
        :canvasId="canvasId"
        :width="chartWidth"
        :height="chartHeight"
        @complete="onChartComplete"
        @error="onChartError"
      />
    </view>
    <view class="chart-footer" v-if="showTimeRange">
      <text class="time-range">{{ timeRangeText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { formatCurrency, formatPercentage } from '@/utils/formatter'

// 收益数据点
interface ProfitPoint {
  date: string
  value: number
  profit: number
  profitRate: number
}

// Props
interface Props {
  // 数据
  data: ProfitPoint[]
  // 配置
  title?: string
  canvasId?: string
  width?: string | number
  height?: string | number
  showHeader?: boolean
  showProfitInfo?: boolean
  showTimeRange?: boolean
  // 样式
  positiveColor?: string
  negativeColor?: string
  showArea?: boolean
  smooth?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  data: () => [],
  title: '收益曲线',
  canvasId: 'profit-curve-chart',
  width: '100%',
  height: 300,
  showHeader: true,
  showProfitInfo: true,
  showTimeRange: true,
  positiveColor: '#FF4D4F',  // A股红色表示涨
  negativeColor: '#52C41A',  // A股绿色表示跌
  showArea: true,
  smooth: true
})

const emit = defineEmits<{
  (e: 'complete'): void
  (e: 'error', error: any): void
}>()

// 图表数据
const chartData = ref<any>({})

// 图表尺寸
const chartWidth = computed(() => {
  if (typeof props.width === 'number') {
    return uni.upx2px(props.width)
  }
  return props.width
})

const chartHeight = computed(() => {
  if (typeof props.height === 'number') {
    return uni.upx2px(props.height)
  }
  return props.height
})

// 总收益
const totalProfit = computed(() => {
  if (props.data.length === 0) return 0
  return props.data[props.data.length - 1].profit
})

// 总收益率
const totalProfitRate = computed(() => {
  if (props.data.length === 0) return 0
  return props.data[props.data.length - 1].profitRate
})

// 时间范围文本
const timeRangeText = computed(() => {
  if (props.data.length === 0) return ''
  const start = props.data[0].date
  const end = props.data[props.data.length - 1].date
  return `${start} 至 ${end}`
})

// 格式化收益
function formatProfit(value: number): string {
  const formatted = formatCurrency(value)
  return value >= 0 ? `+${formatted}` : formatted
}

// 格式化收益率
function formatProfitRate(value: number): string {
  const formatted = formatPercentage(value)
  return value >= 0 ? `+${formatted}` : formatted
}

// 图表配置
const chartOpts = computed(() => {
  const isProfit = totalProfit.value >= 0
  const lineColor = isProfit ? props.positiveColor : props.negativeColor
  const areaColor = isProfit
    ? 'rgba(255, 77, 79, 0.1)'  // 红色半透明
    : 'rgba(82, 196, 26, 0.1)'  // 绿色半透明

  return {
    color: [lineColor],
    padding: [15, 15, 0, 15],
    enableScroll: props.data.length > 30, // 数据点多时启用滚动
    enableMarkLine: false,
    dataLabel: false,
    dataPointShape: false,
    background: '#ffffff',
    legend: { show: false },
    xAxis: {
      disableGrid: true,
      labelCount: 5,
      fontSize: 10,
      color: '#8c8c8c',
      boundaryGap: 'justify',
      rotateLabel: false,
      format: 'xAxisFormat'
    },
    yAxis: {
      gridType: 'dash',
      dashLength: 4,
      gridColor: '#f0f0f0',
      fontSize: 10,
      color: '#8c8c8c',
      showTitle: false,
      format: 'yAxisFormat'
    },
    extra: {
      line: {
        type: props.smooth ? 'curve' : 'straight',
        width: 2,
        activeType: 'none',
        linearType: 'custom'
      },
      area: {
        type: props.smooth ? 'curve' : 'straight',
        opacity: 0.2,
        addGradient: true
      },
      tooltip: {
        showBox: true,
        bgColor: '#000000',
        bgOpacity: 0.7,
        fontSize: 12,
        lineHeight: 18,
        color: '#ffffff',
        padding: 10,
        showArrow: true,
        arrowSize: 6,
        format: 'tooltipFormat'
      }
    }
  }
})

// 处理图表数据
function processChartData() {
  if (!props.data || props.data.length === 0) {
    return {
      categories: [],
      series: []
    }
  }

  const categories = props.data.map(item => item.date)
  const values = props.data.map(item => item.value)

  return {
    categories,
    series: [{
      name: '总资产',
      data: values
    }]
  }
}

// 更新图表数据
function updateChartData() {
  chartData.value = processChartData()
}

// 监听数据变化
watch(() => props.data, () => {
  updateChartData()
}, { deep: true, immediate: true })

// 图表完成回调
function onChartComplete() {
  emit('complete')
}

// 图表错误回调
function onChartError(error: any) {
  console.error('收益曲线图渲染错误:', error)
  emit('error', error)
}
</script>

<style lang="scss" scoped>
.profit-curve-chart {
  background: #ffffff;
  border-radius: 12rpx;
  padding: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.06);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.chart-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1f1f1f;
}

.profit-info {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.profit-label {
  font-size: 22rpx;
  color: #8c8c8c;
}

.profit-value {
  font-size: 28rpx;
  font-weight: 600;
}

.profit-rate {
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  background: #f5f5f5;
}

.profit-positive {
  color: #FF4D4F;  // A股红色表示涨
}

.profit-negative {
  color: #52C41A;  // A股绿色表示跌
}

.chart-container {
  width: 100%;
}

.chart-footer {
  margin-top: 16rpx;
  text-align: center;
}

.time-range {
  font-size: 20rpx;
  color: #bfbfbf;
}
</style>
