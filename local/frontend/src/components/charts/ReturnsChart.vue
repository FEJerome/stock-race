<template>
  <div class="returns-chart">
    <div class="chart-header" v-if="showHeader">
      <h4>收益曲线</h4>
      <div class="chart-legend" v-if="showLegend">
        <div class="legend-item">
          <span class="legend-line" style="background: #667eea;"></span>
          <span>总资产</span>
        </div>
        <div class="legend-item">
          <span class="legend-line" style="background: #00d084;"></span>
          <span>现金</span>
        </div>
        <div class="legend-item">
          <span class="legend-line" style="background: #ed8936;"></span>
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
        <span class="stat-value" :class="stats.total_return >= 0 ? 'up' : 'down'">
          {{ stats.total_return >= 0 ? '+' : '' }}{{ formatPercent(stats.total_return_percent) }}
        </span>
      </div>
      <div class="stat-item">
        <span class="stat-label">当前净值</span>
        <span class="stat-value">{{ formatMoney(stats.current_value) }}</span>
      </div>
      <div class="stat-item" v-if="stats.max_drawdown !== undefined">
        <span class="stat-label">最大回撤</span>
        <span class="stat-value down">{{ formatPercent(stats.max_drawdown) }}</span>
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
  max_drawdown?: number
}

const props = withDefaults(defineProps<{
  data: HistoryPoint[]
  showLegend?: boolean
  showHeader?: boolean
  height?: number
}>(), {
  showLegend: true,
  showHeader: false,
  height: 300,
})

const chartContainer = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const stats = computed<ChartStats | null>(() => {
  if (!props.data?.length) return null

  const first = props.data[0]
  const last = props.data[props.data.length - 1]
  const totalReturn = last.total_value - first.total_value
  const totalReturnPercent = (totalReturn / first.total_value) * 100

  // Calculate max drawdown
  let maxDrawdown = 0
  let peak = first.total_value
  for (const point of props.data) {
    if (point.total_value > peak) {
      peak = point.total_value
    }
    const drawdown = (peak - point.total_value) / peak
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
    }
  }

  return {
    total_return: totalReturn,
    total_return_percent: totalReturnPercent,
    current_value: last.total_value,
    max_drawdown: maxDrawdown * 100,
  }
})

function formatMoney(value: number): string {
  if (value >= 100000000) {
    return '¥' + (value / 100000000).toFixed(2) + '亿'
  } else if (value >= 10000) {
    return '¥' + (value / 10000).toFixed(1) + '万'
  }
  return '¥' + value.toLocaleString('zh-CN')
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
  const height = props.height

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
  const minValue = Math.min(...values) * 0.98
  const maxValue = Math.max(...values) * 1.02
  const valueRange = maxValue - minValue

  const xScale = (index: number) => padding.left + (index / (props.data.length - 1)) * chartWidth
  const yScale = (value: number) => padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight

  // Draw grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
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
    ctx.fillStyle = '#5a6a8a'
    ctx.font = '11px Roboto Mono, monospace'
    ctx.textAlign = 'right'
    ctx.fillText(formatMoney(value).replace('¥', ''), padding.left - 10, y + 4)
  }

  // X-axis labels
  const labelCount = Math.min(6, props.data.length)
  const labelStep = Math.floor(props.data.length / labelCount)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#5a6a8a'
  for (let i = 0; i < labelCount; i++) {
    const index = i * labelStep
    const x = xScale(index)
    const date = new Date(props.data[index].timestamp)
    const label = `${date.getMonth() + 1}/${date.getDate()}`
    ctx.fillText(label, x, padding.top + chartHeight + 20)
  }

  // Draw lines with glow effect
  const drawLine = (key: keyof HistoryPoint, color: string, glowColor: string) => {
    // Draw glow
    ctx.shadowColor = glowColor
    ctx.shadowBlur = 10
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
    ctx.shadowBlur = 0

    // Draw area under line for total_value
    if (key === 'total_value') {
      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight)
      gradient.addColorStop(0, color + '40')
      gradient.addColorStop(1, color + '05')

      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.moveTo(xScale(0), yScale(props.data[0][key] as number))

      props.data.forEach((point, index) => {
        ctx.lineTo(xScale(index), yScale(point[key] as number))
      })

      ctx.lineTo(xScale(props.data.length - 1), padding.top + chartHeight)
      ctx.lineTo(xScale(0), padding.top + chartHeight)
      ctx.closePath()
      ctx.fill()
    }
  }

  drawLine('total_value', '#667eea', 'rgba(102, 126, 234, 0.5)')
  drawLine('cash', '#00d084', 'rgba(0, 208, 132, 0.5)')
  drawLine('market_value', '#ed8936', 'rgba(237, 137, 54, 0.5)')

  // Draw data points for total_value
  ctx.fillStyle = '#667eea'
  props.data.forEach((point, index) => {
    if (index % Math.ceil(props.data.length / 10) === 0 || index === props.data.length - 1) {
      const x = xScale(index)
      const y = yScale(point.total_value)
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()

      // Draw glow around point
      ctx.shadowColor = 'rgba(102, 126, 234, 0.5)'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }
  })
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
  width: 100%;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.chart-header h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
}

.chart-legend {
  display: flex;
  gap: var(--space-4);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.legend-line {
  width: 16px;
  height: 2px;
  border-radius: var(--radius-full);
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
  gap: var(--space-6);
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-secondary);
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.stat-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  color: var(--text-primary);
}

.stat-value.up {
  color: var(--up-primary);
  text-shadow: 0 0 10px var(--up-glow);
}

.stat-value.down {
  color: var(--down-primary);
  text-shadow: 0 0 10px var(--down-glow);
}

@media (max-width: 768px) {
  .chart-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .chart-legend {
    flex-wrap: wrap;
  }

  .chart-stats {
    flex-direction: column;
    gap: var(--space-3);
  }
}
</style>
