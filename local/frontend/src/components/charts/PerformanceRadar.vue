<template>
  <div class="performance-radar">
    <div class="chart-header">
      <h4>收益指标雷达</h4>
      <div class="score-badge" v-if="compositeScore !== null">
        综合评分: {{ compositeScore.toFixed(1) }}
      </div>
    </div>

    <div ref="chartContainer" class="radar-container">
      <canvas ref="canvasRef"></canvas>
      <div v-if="!metrics" class="empty-state">
        <p>暂无数据</p>
      </div>
    </div>

    <div class="metrics-grid" v-if="metrics">
      <div class="metric-item">
        <span class="metric-label">总收益率</span>
        <span class="metric-value" :class="metrics.total_return_percent >= 0 ? 'positive' : 'negative'">
          {{ formatPercent(metrics.total_return_percent) }}
        </span>
      </div>
      <div class="metric-item">
        <span class="metric-label">夏普比率</span>
        <span class="metric-value" :class="getSharpeClass(metrics.sharpe_ratio)">
          {{ metrics.sharpe_ratio.toFixed(2) }}
        </span>
      </div>
      <div class="metric-item">
        <span class="metric-label">最大回撤</span>
        <span class="metric-value negative">
          {{ formatPercent(-metrics.max_drawdown_percent) }}
        </span>
      </div>
      <div class="metric-item">
        <span class="metric-label">胜率</span>
        <span class="metric-value" :class="getWinRateClass(metrics.win_rate)">
          {{ formatPercent(metrics.win_rate * 100) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

interface PerformanceMetrics {
  total_return: number
  total_return_percent: number
  sharpe_ratio: number
  max_drawdown: number
  max_drawdown_percent: number
  win_rate: number
  profit_factor: number
  volatility: number
  alpha: number
  beta: number
}

const props = defineProps<{
  metrics: PerformanceMetrics | null
}>()

const chartContainer = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// Radar dimensions
const dimensions = [
  { key: 'total_return_percent', label: '收益率', max: 50, min: -20 },
  { key: 'sharpe_ratio', label: '夏普比率', max: 3, min: -1 },
  { key: 'max_drawdown_percent', label: '回撤控制', max: 0, min: -30 },
  { key: 'win_rate', label: '胜率', max: 100, min: 0 },
  { key: 'profit_factor', label: '盈亏比', max: 3, min: 0 },
]

const compositeScore = computed(() => {
  if (!props.metrics) return null

  // Normalize each metric to 0-100 scale
  const scores = [
    normalize(props.metrics.total_return_percent, -20, 50) * 100,
    normalize(props.metrics.sharpe_ratio, -1, 3) * 100,
    normalize(-props.metrics.max_drawdown_percent, 0, 30) * 100, // Inverted: less drawdown is better
    props.metrics.win_rate * 100,
    normalize(props.metrics.profit_factor, 0, 3) * 100,
  ]

  return scores.reduce((a, b) => a + b, 0) / scores.length
})

function normalize(value: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function getSharpeClass(value: number): string {
  if (value >= 1) return 'positive'
  if (value >= 0) return 'neutral'
  return 'negative'
}

function getWinRateClass(value: number): string {
  if (value >= 0.6) return 'positive'
  if (value >= 0.4) return 'neutral'
  return 'negative'
}

function drawChart() {
  const canvas = canvasRef.value
  const container = chartContainer.value
  if (!canvas || !container) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Set canvas size
  const dpr = window.devicePixelRatio || 1
  const rect = container.getBoundingClientRect()
  const size = Math.min(rect.width, 300)

  canvas.width = size * dpr
  canvas.height = size * dpr
  canvas.style.width = size + 'px'
  canvas.style.height = size + 'px'

  ctx.scale(dpr, dpr)

  const centerX = size / 2
  const centerY = size / 2
  const radius = (size / 2) - 40

  // Clear canvas
  ctx.clearRect(0, 0, size, size)

  // Draw background grid
  const levels = 5
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1

  for (let i = 1; i <= levels; i++) {
    const levelRadius = (radius / levels) * i
    ctx.beginPath()
    for (let j = 0; j < dimensions.length; j++) {
      const angle = (Math.PI * 2 / dimensions.length) * j - Math.PI / 2
      const x = centerX + Math.cos(angle) * levelRadius
      const y = centerY + Math.sin(angle) * levelRadius
      if (j === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.closePath()
    ctx.stroke()
  }

  // Draw axis lines and labels
  ctx.strokeStyle = '#ccc'
  ctx.fillStyle = '#666'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  dimensions.forEach((dim, i) => {
    const angle = (Math.PI * 2 / dimensions.length) * i - Math.PI / 2
    const x = centerX + Math.cos(angle) * radius
    const y = centerY + Math.sin(angle) * radius

    // Draw axis line
    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.lineTo(x, y)
    ctx.stroke()

    // Draw label
    const labelX = centerX + Math.cos(angle) * (radius + 20)
    const labelY = centerY + Math.sin(angle) * (radius + 20)
    ctx.fillText(dim.label, labelX, labelY)
  })

  // Draw data if available
  if (props.metrics) {
    const values = dimensions.map(dim => {
      const value = props.metrics?.[dim.key as keyof PerformanceMetrics] as number
      return normalize(value, dim.min, dim.max)
    })

    // Draw data polygon
    ctx.beginPath()
    values.forEach((value, i) => {
      const angle = (Math.PI * 2 / dimensions.length) * i - Math.PI / 2
      const r = radius * value
      const x = centerX + Math.cos(angle) * r
      const y = centerY + Math.sin(angle) * r
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.closePath()
    ctx.fillStyle = 'rgba(102, 126, 234, 0.3)'
    ctx.fill()
    ctx.strokeStyle = '#667eea'
    ctx.lineWidth = 2
    ctx.stroke()

    // Draw data points
    values.forEach((value, i) => {
      const angle = (Math.PI * 2 / dimensions.length) * i - Math.PI / 2
      const r = radius * value
      const x = centerX + Math.cos(angle) * r
      const y = centerY + Math.sin(angle) * r

      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#667eea'
      ctx.fill()
    })
  }
}

// Redraw on data change or resize
watch(() => props.metrics, drawChart, { deep: true })

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  drawChart()

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
.performance-radar {
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

.score-badge {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0.375rem 0.75rem;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
}

.radar-container {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}

.radar-container canvas {
  display: block;
}

.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #666;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.metric-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 6px;
}

.metric-label {
  font-size: 0.75rem;
  color: #666;
}

.metric-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: #2c3e50;
}

.metric-value.positive {
  color: #48bb78;
}

.metric-value.negative {
  color: #f56565;
}

.metric-value.neutral {
  color: #ed8936;
}

@media (max-width: 768px) {
  .chart-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
  }
}
</style>
