<template>
  <view class="holding-pie-chart">
    <view class="chart-header" v-if="showHeader">
      <text class="chart-title">{{ title }}</text>
      <text class="holding-count" v-if="holdings.length > 0">{{ holdings.length }} 只持仓</text>
    </view>

    <view class="chart-container">
      <!-- Empty State -->
      <view v-if="!hasHoldings" class="empty-placeholder">
        <text class="empty-text">暂无持仓</text>
      </view>

      <!-- uCharts v2.x Canvas -->
      <canvas
        v-else
        :id="canvasId"
        :canvas-id="canvasId"
        class="chart-canvas"
        :style="canvasStyle"
        @tap="handleCanvasTap"
      />
    </view>

    <!-- 持仓列表 -->
    <view class="holding-list" v-if="showList && hasHoldings">
      <view
        class="holding-item"
        v-for="(item, index) in displayHoldings"
        :key="item.stockCode"
        @tap="handleItemClick(item)"
      >
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
      <view class="more-holdings" v-if="hasMore">
        <text class="more-text">还有 {{ otherCount }} 只持仓...</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { formatCurrency } from '@/utils/formatter'
import { createUChart, disposeChart, updateChartData, type ChartInstance } from '@/utils/ucharts'

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

// 图表实例
const chartInstance = ref<ChartInstance | null>(null)
const isChartReady = ref(false)

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

// 计算属性
const hasHoldings = computed(() => props.holdings && props.holdings.length > 0)

const canvasStyle = computed(() => {
  const width = typeof props.width === 'number' ? `${props.width}px` : props.width
  const height = typeof props.height === 'number' ? `${props.height}px` : `${props.height}px`
  return `width:${width};height:${height};`
})

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

// 显示持仓数据（前N个 + 其他）
const displayHoldings = computed(() => {
  const topHoldings = processedHoldings.value.slice(0, props.maxDisplayCount)

  // 如果有更多持仓，添加"其他"
  if (processedHoldings.value.length > props.maxDisplayCount) {
    const otherValue = processedHoldings.value
      .slice(props.maxDisplayCount)
      .reduce((sum, h) => sum + h.marketValue, 0)

    const total = processedHoldings.value.reduce((sum, h) => sum + h.marketValue, 0)

    topHoldings.push({
      stockCode: 'OTHER',
      stockName: '其他',
      marketValue: otherValue,
      ratio: total > 0 ? Math.round((otherValue / total) * 100 * 100) / 100 : 0
    })
  }

  return topHoldings
})

const hasMore = computed(() => props.holdings.length > props.maxDisplayCount)
const otherCount = computed(() => props.holdings.length - props.maxDisplayCount)

// 获取颜色
function getColor(index: number): string {
  return COLORS[index % COLORS.length]
}

// 初始化图表
async function initChart() {
  if (!hasHoldings.value) return

  try {
    // 等待 DOM 更新
    await new Promise(resolve => setTimeout(resolve, 100))

    const chartData = {
      series: [{
        data: displayHoldings.value.map((item, index) => ({
          name: item.stockName,
          value: item.marketValue,
          color: getColor(index)
        }))
      }]
    }

    chartInstance.value = await createUChart(props.canvasId, {
      type: 'pie',
      width: typeof props.width === 'number' ? props.width : 300,
      height: typeof props.height === 'number' ? props.height : 280,
      series: chartData.series,
      color: COLORS,
      padding: [10, 10, 10, 10],
      dataLabel: true,
      dataPointShape: false,
      legend: {
        show: false
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
      animation: true,
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
    })

    isChartReady.value = true
    emit('complete')
  } catch (error) {
    console.error('[HoldingPieChart] 初始化图表失败:', error)
    emit('error', error)
  }
}

// 更新图表数据
async function updateChart() {
  if (!chartInstance.value || !isChartReady.value) {
    // 如果图表未初始化，尝试初始化
    if (hasHoldings.value) {
      await initChart()
    }
    return
  }

  try {
    const chartData = {
      series: [{
        data: displayHoldings.value.map((item, index) => ({
          name: item.stockName,
          value: item.marketValue,
          color: getColor(index)
        }))
      }]
    }

    updateChartData(props.canvasId, chartData)
  } catch (error) {
    console.error('[HoldingPieChart] 更新图表失败:', error)
  }
}

// 处理 Canvas 点击
function handleCanvasTap(e: any) {
  // 可以在这里处理图表区域的点击事件
  console.log('[HoldingPieChart] Canvas tapped:', e)
}

// 处理持仓项点击
function handleItemClick(item: HoldingItem) {
  emit('click', item)
}

// 生命周期
onMounted(() => {
  if (hasHoldings.value) {
    initChart()
  }
})

onUnmounted(() => {
  // 清理图表实例
  disposeChart(props.canvasId)
  chartInstance.value = null
  isChartReady.value = false
})

// 监听数据变化
watch(() => props.holdings, () => {
  if (hasHoldings.value) {
    updateChart()
  } else {
    // 清空图表
    disposeChart(props.canvasId)
    chartInstance.value = null
    isChartReady.value = false
  }
}, { deep: true })
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
  align-items: center;
  min-height: 280rpx;
}

.chart-canvas {
  width: 100%;
  height: 280px;
}

.empty-placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 280rpx;
}

.empty-text {
  font-size: 28rpx;
  color: #bfbfbf;
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