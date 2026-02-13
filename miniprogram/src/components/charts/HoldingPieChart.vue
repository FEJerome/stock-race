<template>
  <view class="holding-pie-chart">
    <view class="chart-header" v-if="showHeader">
      <text class="chart-title">{{ title }}</text>
      <text class="holding-count" v-if="holdings.length > 0">{{ holdings.length }} 只持仓</text>
    </view>

    <view class="chart-container">
      <qiun-data-charts
        type="pie"
        :opts="chartOpts"
        :chartData="chartData"
        :canvas2d="true"
        :canvasId="canvasId"
        :width="chartWidth"
        :height="chartHeight"
        @complete="onChartComplete"
        @error="onChartError"
      />
    </view>

    <!-- 持仓列表 -->
    <view class="holding-list" v-if="showList && holdings.length > 0">
      <view class="holding-item" v-for="(item, index) in topHoldings" :key="item.stockCode">
        <view class="item-left">
          <view class="color-dot" :style="{ backgroundColor: getColor(index) }"></view>
          <text class="stock-name">{{ item.stockName }}</text>
          <text class="stock-code">{{ item.stockCode }}</text>
        </view>
        <view class="item-right">
          <text class="market-value">{{ formatCurrency(item.marketValue) }}</text>
          <text class="holding-ratio">{{ item.ratio }}%</text>
        </view>
      </view>
      <view class="more-holdings" v-if="holdings.length > maxDisplayCount">
        <text class="more-text">还有 {{ holdings.length - maxDisplayCount }} 只持仓...</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { formatCurrency } from '@/utils/formatter'

// 持仓数据项
interface HoldingItem {
  stockCode: string
  stockName: string
  marketValue: number
  ratio?: number
}

// Props
interface Props {
  holdings: HoldingItem[]
  title?: string
  canvasId?: string
  width?: string | number
  height?: string | number
  showHeader?: boolean
  showList?: boolean
  maxDisplayCount?: number
}

const props = withDefaults(defineProps<Props>(), {
  holdings: () => [],
  title: '持仓分布',
  canvasId: 'holding-pie-chart',
  width: '100%',
  height: 280,
  showHeader: true,
  showList: true,
  maxDisplayCount: 5
})

const emit = defineEmits<{
  (e: 'complete'): void
  (e: 'error', error: any): void
  (e: 'click', data: HoldingItem): void
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

// 颜色配置 - 西式复古精英风格
const COLORS = [
  '#1E3A5F', // 深海蓝
  '#8B4513', // 马鞍棕
  '#2F4F4F', // 深石板灰
  '#800020', // 勃艮第红
  '#4A6741', // 森林绿
  '#5B4E4E', // 深灰褐
  '#2C3E50', // 午夜蓝
  '#8B7355', // 暖灰棕
]

// 获取颜色
function getColor(index: number): string {
  return COLORS[index % COLORS.length]
}

// 处理持仓数据（排序并计算比例）
const processedHoldings = computed(() => {
  if (!props.holdings || props.holdings.length === 0) return []

  const total = props.holdings.reduce((sum, h) => sum + h.marketValue, 0)

  return props.holdings
    .map(h => ({
      ...h,
      ratio: total > 0 ? Math.round((h.marketValue / total) * 100 * 100) / 100 : 0
    }))
    .sort((a, b) => b.marketValue - a.marketValue)
})

// 前N只持仓
const topHoldings = computed(() => {
  return processedHoldings.value.slice(0, props.maxDisplayCount)
})

// 图表配置
const chartOpts = computed(() => {
  return {
    color: COLORS,
    padding: [10, 10, 10, 10],
    dataLabel: true,
    dataPointShape: false,
    legend: {
      show: false // 使用自定义列表替代
    },
    title: {
      name: '持仓',
      fontSize: 12,
      color: '#8c8c8c'
    },
    subtitle: {
      name: `${props.holdings.length}只`,
      fontSize: 16,
      color: '#1f1f1f'
    },
    extra: {
      pie: {
        activeOpacity: 0.8,
        offsetAngle: 0,
        labelWidth: 15,
        border: true,
        borderWidth: 2,
        borderColor: '#ffffff',
        customRadius: 0,
        linearType: 'none'
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
        arrowSize: 6
      }
    }
  }
})

// 处理图表数据
function processChartData() {
  if (!processedHoldings.value || processedHoldings.value.length === 0) {
    return {
      series: []
    }
  }

  const series = processedHoldings.value.slice(0, props.maxDisplayCount).map((item, index) => ({
    name: item.stockName,
    data: item.marketValue,
    legendShape: 'circle'
  }))

  // 如果有更多持仓，合并为"其他"
  if (processedHoldings.value.length > props.maxDisplayCount) {
    const otherValue = processedHoldings.value
      .slice(props.maxDisplayCount)
      .reduce((sum, h) => sum + h.marketValue, 0)

    series.push({
      name: '其他',
      data: otherValue,
      legendShape: 'circle'
    })
  }

  return { series }
}

// 更新图表数据
function updateChartData() {
  chartData.value = processChartData()
}

// 监听数据变化
watch(() => props.holdings, () => {
  updateChartData()
}, { deep: true, immediate: true })

// 图表完成回调
function onChartComplete() {
  emit('complete')
}

// 图表错误回调
function onChartError(error: any) {
  console.error('持仓分布图渲染错误:', error)
  emit('error', error)
}
</script>

<style lang="scss" scoped>
.holding-pie-chart {
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

.holding-count {
  font-size: 24rpx;
  color: #8c8c8c;
}

.chart-container {
  width: 100%;
  display: flex;
  justify-content: center;
}

.holding-list {
  margin-top: 20rpx;
  border-top: 1rpx solid #f0f0f0;
  padding-top: 20rpx;
}

.holding-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 0;
}

.item-left {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.color-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
}

.stock-name {
  font-size: 26rpx;
  color: #262626;
  font-weight: 500;
}

.stock-code {
  font-size: 22rpx;
  color: #8c8c8c;
  background: #f5f5f5;
  padding: 2rpx 8rpx;
  border-radius: 4rpx;
}

.item-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
}

.market-value {
  font-size: 26rpx;
  color: #262626;
  font-weight: 500;
}

.holding-ratio {
  font-size: 22rpx;
  color: #8c8c8c;
}

.more-holdings {
  text-align: center;
  padding: 16rpx 0;
  border-top: 1rpx dashed #f0f0f0;
  margin-top: 12rpx;
}

.more-text {
  font-size: 22rpx;
  color: #bfbfbf;
}
</style>
