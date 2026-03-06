<template>
  <view class="line-chart-container">
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
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

// 定义数据点类型
interface LineDataPoint {
  date: string
  value: number
  label?: string
}

// 定义系列数据类型
interface SeriesData {
  name: string
  data: number[]
  color?: string
}

// Props定义
interface Props {
  categories: string[]
  series: SeriesData[]
  canvasId?: string
  width?: string | number
  height?: string | number
  lineColor?: string
  areaColor?: string
  showArea?: boolean
  showLegend?: boolean
  yAxisFormat?: string
  xAxisLabelCount?: number
  smooth?: boolean
  enableScroll?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  categories: () => [],
  series: () => [],
  canvasId: 'line-chart',
  width: '100%',
  height: 350,
  lineColor: '#1890ff',
  areaColor: 'rgba(24, 144, 255, 0.1)',
  showArea: false,
  showLegend: false,
  yAxisFormat: '',
  xAxisLabelCount: 5,
  smooth: true,
  enableScroll: false
})

const emit = defineEmits<{
  (e: 'complete'): void
  (e: 'error', error: any): void
  (e: 'click', data: any): void
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
  // 生成颜色数组
  const colors = ['#1890ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2']

  const seriesConfig = props.series.map((item, index) => ({
    ...item,
    color: item.color || colors[index % colors.length]
  }))

  return {
    color: seriesConfig.map(s => s.color),
    padding: [15, 15, 0, 15],
    enableScroll: props.enableScroll,
    enableMarkLine: false,
    dataLabel: false,
    dataPointShape: true,
    dataPointShapeType: 'hollow',
    background: '#ffffff',
    legend: {
      show: props.showLegend,
      position: 'top',
      float: 'right',
      padding: 5,
      margin: 5,
      fontSize: 11,
      color: '#595959'
    },
    xAxis: {
      disableGrid: true,
      labelCount: props.xAxisLabelCount,
      fontSize: 10,
      color: '#8c8c8c',
      boundaryGap: 'justify',
      rotateLabel: false
    },
    yAxis: {
      gridType: 'dash',
      dashLength: 4,
      gridColor: '#f0f0f0',
      fontSize: 10,
      color: '#8c8c8c',
      showTitle: false,
      format: props.yAxisFormat || 'yAxisFormat'
    },
    extra: {
      line: {
        type: props.smooth ? 'curve' : 'straight',
        width: 2,
        activeType: 'hollow',
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
        arrowSize: 6
      }
    }
  }
})

// 处理折线数据
function processLineData() {
  if (!props.categories || props.categories.length === 0 || !props.series || props.series.length === 0) {
    return {
      categories: [],
      series: []
    }
  }

  // 格式化数据
  const formattedSeries = props.series.map((item, index) => {
    const colors = ['#1890ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2']
    return {
      name: item.name,
      data: item.data,
      color: item.color || colors[index % colors.length]
    }
  })

  return {
    categories: props.categories,
    series: formattedSeries
  }
}

// 更新图表数据
function updateChartData() {
  const processed = processLineData()
  chartData.value = processed
}

// 监听数据变化
watch(() => [props.categories, props.series], () => {
  updateChartData()
}, { deep: true, immediate: true })

// 图表完成回调
function onChartComplete() {
  emit('complete')
}

// 图表错误回调
function onChartError(error: any) {
  console.error('折线图渲染错误:', error)
  emit('error', error)
}

onMounted(() => {
  updateChartData()
})
</script>

<style lang="scss" scoped>
.line-chart-container {
  width: 100%;
  height: 100%;
}
</style>
