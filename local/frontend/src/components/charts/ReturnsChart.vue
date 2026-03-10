<template>
  <div class="returns-chart">
    <div class="chart-header">
      <h4>收益曲线</h4>
      <div class="chart-legend" v-if="showLegend">
        <div class="legend-item">
          <span class="legend-color" style="background: #667eea;"></span>
          <span>总资产</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #48bb78;"></span>
          <span>现金</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #ed8936;"></span>
          <span>持仓市值</span>
        </div>
      </div>
    </div>

    <div ref="chartContainer" class="chart-container">
      <canvas ref="canvasRef"></canvas>
    </div>

    <div class="chart-stats" v-if="stats">
      <div class="stat-item">
        <span class="stat-label">总收益</span>
        <span class="stat-value" :class="stats.total_return >= 0 ? 'positive' : 'negative'">
          {{ stats.total_return >= 0 ? '+' : '' }}{{ formatPercent(stats.total_return_percent) }}
        </span>
      </div>
      <div class="stat-item">
        <span class="stat-label">当前净值</span>
        <span class="stat-value">{{ formatMoney(stats.current_value) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

interface HistoryPoint {
  timestamp: string
  total_value: number
  cash: number
  market_value: number
}

interface ChartStats {
  total_return: number
  total_return_percent: number
  current_value: number
}

const props = defineProps<{
  data: HistoryPoint[]
  showLegend?: boolean
  height?: number
}>()

const chartContainer = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const stats = computed<ChartStats | null>(() => {
  if (!props.data?.length) return null

  const first = props.data[0]
  const last = props.data[props.data.length - 1]
  const totalReturn = last.total_value - first.total_value
  const totalReturnPercent = (totalReturn / first.total_value) * 100

  return {
    total_return: totalReturn,
    total_return_percent: totalReturnPercent,
    current_value: last.total_value,
  }
})

function formatMoney(value: number): string {
  return '¥' + value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

function formatPercent(value: number): string {
  return value.toFixed(2) + '%'
}

function drawChart() {
  const canvas = canvasRef.value
  const container = chartContainer.value
  if (!canvas || !container || !props.data?.length) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Set canvas size
  const dpr = window.devicePixelRatio || 1
  const rect = container.getBoundingClientRect()
  const height = props.height || 300

  canvas.width = rect.width * dpr
  canvas.height = height * dpr
  canvas.style.width = rect.width + 'px'
  canvas.style.height = height + 'px'

  ctx.scale(dpr, dpr)

  const padding = { top: 20, right: 20, bottom: 40, left: 60 }
  const chartWidth = rect.width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // Clear canvas
  ctx.clearRect(0, 0, rect.width, height)

  // Calculate scales
  const values = props.data.flatMap(d => [d.total_value, d.cash, d.market_value])
  const minValue = Math.min(...values) * 0.95
  const maxValue = Math.max(...values) * 1.05
  const valueRange = maxValue - minValue

  const xScale = (index: number) => padding.left + (index / (props.data.length - 1)) * chartWidth
  const yScale = (value: number) => padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight

  // Draw grid lines
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1

  // Horizontal grid lines
  for (let i = 0; i <= 5; i++) {
    const y = padding.top + (chartHeight / 5) * i
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(padding.left + chartWidth, y)
    ctx.stroke()

    // Y-axis labels
    const value = maxValue - (valueRange / 5) * i
    ctx.fillStyle = '#666'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(formatMoney(value).replace('¥', ''), padding.left - 10, y + 4)
  }

  // X-axis labels
  const labelCount = Math.min(6, props.data.length)
  const labelStep = Math.floor(props.data.length / labelCount)

  ctx.textAlign = 'center'
  for (let i = 0; i < labelCount; i++) {
    const index = i * labelStep
    const x = xScale(index)
    const date = new Date(props.data[index].timestamp)
    const label = `${date.getMonth() + 1}/${date.getDate()}`
    ctx.fillText(label, x, padding.top + chartHeight + 20)
  }

  // Draw lines
  const drawLine = (key: keyof HistoryPoint, color: string) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()

    props.data.forEach((point, index) => {
      const x = xScale(index)
      const y = yScale(point[key] as number)

      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })

    ctx.stroke()

    // Draw area under line for total_value
    if (key === 'total_value') {
      ctx.fillStyle = color + '20' // Add transparency
      ctx.lineTo(xScale(props.data.length - 1), padding.top + chartHeight)
      ctx.lineTo(padding.left, padding.top + chartHeight)
      ctx.closePath()
      ctx.fill()
    }
  }

  drawLine('total_value', '#667eea')
  drawLine('cash', '#48bb78')
  drawLine('market_value', '#ed8936')

  // Draw axes
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 1

  // Y-axis
  ctx.beginPath()
  ctx.moveTo(padding.left, padding.top)
  ctx.lineTo(padding.left, padding.top + chartHeight)
  ctx.stroke()

  // X-axis
  ctx.beginPath()
  ctx.moveTo(padding.left, padding.top + chartHeight)
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight)
  ctx.stroke()
}

// Redraw on data change or resize
watch(() => props.data, drawChart, { deep: true })

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  drawChart()

  // Watch for container resize
  if (chartContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      drawChart()
    })
    resizeObserver.observe(chartContainer.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<style scoped>
.returns-chart {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.chart-header h4 {
  margin: 0;
  color: #2c3e50;
  font-size: 1rem;
}

.chart-legend {
  display: flex;
  gap: 1rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #666;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.chart-container {
  width: 100%;
  overflow: hidden;
}

.chart-container canvas {
  display: block;
}

.chart-stats {
  display: flex;
  gap: 2rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  color: #666;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: bold;
  color: #2c3e50;
}

.stat-value.positive {
  color: #48bb78;
}

.stat-value.negative {
  color: #f56565;
}

@media (max-width: 768px) {
  .chart-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .chart-legend {
    flex-wrap: wrap;
  }

  .chart-stats {
    flex-direction: column;
    gap: 1rem;
  }
}
</style>
