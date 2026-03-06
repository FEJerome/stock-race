<template>
  <view class="kline-chart-container">
    <qiun-data-charts
      type="candle"
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
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

// 定义K线数据点类型
interface KLineDataPoint {
  date?: string
  time?: string
  open: number
  close: number
  low: number
  high: number
  volume?: number
}

// Props定义
interface Props {
  data: KLineDataPoint[]
  canvasId?: string
  width?: string | number
  height?: string | number
  upColor?: string
  downColor?: string
  showVolume?: boolean
  period?: '1d' | '1w' | '1m'
}

const props = withDefaults(defineProps<Props>(), {
  data: () => [],
  canvasId: 'kline-chart',
  width: '100%',
  height: 400,
  upColor: '#ff4d4f',
  downColor: '#52c41a',
  showVolume: true,
  period: '1d'
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

// 图表配置
const chartOpts = computed(() => {
  return {
    color: [props.upColor, props.downColor, '#1890ff'],
    padding: [15, 15, 0, 15],
    enableScroll: true,
    enableMarkLine: false,
    dataLabel: false,
    dataPointShape: false,
    background: '#ffffff',
    legend: {
      show: false
    },
    xAxis: {
      disableGrid: true,
      labelCount: 5,
      itemCount: props.period === '1d' ? 60 : props.period === '1w' ? 30 : 20,
      fontSize: 10,
      color: '#8c8c8c',
      boundaryGap: 'justify'
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
      candle: {
        color: {
          upLine: props.upColor,
          upFill: props.upColor,
          downLine: props.downColor,
          downFill: props.downColor
        },
        average: {
          show: true,
          name: ['MA5', 'MA10', 'MA20'],
          day: [5, 10, 20],
          color: ['#1890ff', '#faad14', '#722ed1']
        }
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

// 处理K线数据
function processKLineData(data: KLineDataPoint[]) {
  if (!data || data.length === 0) {
    return {
      categories: [],
      series: []
    }
  }

  const categories = data.map(item => {
    // 根据周期格式化日期显示，支持date或time字段
    const dateStr = item.date || item.time || ''
    if (props.period === '1d') {
      // 日K显示 MM-DD
      return dateStr.slice(5, 10)
    } else if (props.period === '1w') {
      // 周K显示 MM-DD
      return dateStr.slice(5, 10)
    } else {
      // 月K显示 YYYY-MM
      return dateStr.slice(0, 7)
    }
  })

  const series = [
    {
      name: 'K线',
      data: data.map(item => [item.open, item.close, item.low, item.high])
    }
  ]

  return {
    categories,
    series
  }
}

// 更新图表数据
function updateChartData() {
  const processed = processKLineData(props.data)
  chartData.value = processed
}

// 监听数据变化
watch(() => props.data, () => {
  updateChartData()
}, { deep: true, immediate: true })

// 监听周期变化
watch(() => props.period, () => {
  updateChartData()
})

// 图表完成回调
function onChartComplete() {
  emit('complete')
}

// 图表错误回调
function onChartError(error: any) {
  console.error('K线图渲染错误:', error)
  emit('error', error)
}

onMounted(() => {
  updateChartData()
})
</script>

<style lang="scss" scoped>
.kline-chart-container {
  width: 100%;
  height: 100%;
}
</style>
