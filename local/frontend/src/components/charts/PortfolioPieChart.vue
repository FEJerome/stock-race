<template>
  <div class="portfolio-pie-chart">
    <div class="chart-header">
      <h4>持仓分布</h4>
      <div class="total-value" v-if="totalValue > 0">
        总市值: {{ formatMoney(totalValue) }}
      </div>
    </div>

    <div class="chart-content">
      <div ref="chartContainer" class="pie-container">
        <canvas ref="canvasRef"></canvas>
        <div v-if="!positions?.length" class="empty-state">
          <p>暂无持仓</p>
        </div>
      </div>

      <div class="legend-container" v-if="positions?.length">
        <div
          v-for="(item, index) in legendItems"
          :key="item.symbol"
          class="legend-item"
          @mouseenter="highlightSlice(index)"
          @mouseleave="clearHighlight"
        >
          <span class="legend-color" :style="{ background: item.color }"></span>
          <div class="legend-info">
            <span class="legend-name">{{ item.name }}</span>
            <span class="legend-symbol">{{ item.symbol }}</span>
          </div>
          <div class="legend-values">
            <span class="legend-percent">{{ item.percent.toFixed(1) }}%</span>
            <span class="legend-amount">{{ formatMoney(item.value) }}</span>
          </div>
        </div>

        <!-- Cash position -->
        <div
          v-if="cash > 0"
          class="legend-item"
          @mouseenter="highlightSlice(positions.length)"
          @mouseleave="clearHighlight"
        >
          <span class="legend-color" :style="{ background: cashColor }"></span>
          <div class="legend-info">
            <span class="legend-name">现金</span>
            <span class="legend-symbol">Cash</span>
          </div>
          <div class="legend-values">
            <span class="legend-percent">{{ cashPercent.toFixed(1) }}%</span>
            <span class="legend-amount">{{ formatMoney(cash) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

interface Position {
  symbol: string
  name: string
  market_value: number
  weight: number
}

const props = defineProps<{
  positions: Position[]
  cash: number
}>()

const chartContainer = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const highlightedIndex = ref<number | null>(null)

const colors = [
  '#667eea',
  '#48bb78',
  '#ed8936',
  '#e53e3e',
  '#38b2ac',
  '#805ad5',
  '#d69e2e',
  '#3182ce',
  '#e53e3e',
  '#38a169',
]

const cashColor = '#a0aec0'

const totalValue = computed(() => {
  const positionsValue = props.positions?.reduce((sum, p) => sum + p.market_value, 0) || 0
  return positionsValue + props.cash
})

const legendItems = computed(() => {
  if (!props.positions?.length) return []
  return props.positions.map((pos, index) => ({
    ...pos,
    color: colors[index % colors.length],
    percent: totalValue.value > 0 ? (pos.market_value / totalValue.value) * 100 : 0,
    value: pos.market_value,
  }))
})

const cashPercent = computed(() => {
  return totalValue.value > 0 ? (props.cash / totalValue.value) * 100 : 0
})

function formatMoney(value: number): string {
  return '¥' + value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
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
  const radius = (size / 2) - 20
  const innerRadius = radius * 0.5

  // Clear canvas
  ctx.clearRect(0, 0, size, size)

  if (!props.positions?.length && props.cash <= 0) return

  // Calculate angles
  const slices: { startAngle: number; endAngle: number; color: string; isCash: boolean }[] = []
  let currentAngle = -Math.PI / 2

  // Position slices
  props.positions?.forEach((pos, index) => {
    const percent = totalValue.value > 0 ? pos.market_value / totalValue.value : 0
    const angle = percent * Math.PI * 2
    slices.push({
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: colors[index % colors.length],
      isCash: false,
    })
    currentAngle += angle
  })

  // Cash slice
  if (props.cash > 0) {
    const percent = totalValue.value > 0 ? props.cash / totalValue.value : 0
    const angle = percent * Math.PI * 2
    slices.push({
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: cashColor,
      isCash: true,
    })
  }

  // Draw slices
  slices.forEach((slice, index) => {
    const isHighlighted = highlightedIndex.value === index
    const expandOffset = isHighlighted ? 8 : 0

    ctx.beginPath()
    ctx.moveTo(centerX, centerY)

    // Calculate expanded center for highlighted slice
    let drawCenterX = centerX
    let drawCenterY = centerY
    if (isHighlighted) {
      const midAngle = (slice.startAngle + slice.endAngle) / 2
      drawCenterX = centerX + Math.cos(midAngle) * expandOffset
      drawCenterY = centerY + Math.sin(midAngle) * expandOffset
    }

    ctx.arc(drawCenterX, drawCenterY, radius, slice.startAngle, slice.endAngle)
    ctx.closePath()
    ctx.fillStyle = slice.color
    ctx.fill()

    // Draw border
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  })

  // Draw inner circle (donut hole)
  ctx.beginPath()
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()

  // Draw center text
  ctx.fillStyle = '#2c3e50'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('持仓分布', centerX, centerY - 10)

  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#666'
  ctx.fillText(`${props.positions?.length || 0} 只股票`, centerX, centerY + 10)
}

function highlightSlice(index: number) {
  highlightedIndex.value = index
  drawChart()
}

function clearHighlight() {
  highlightedIndex.value = null
  drawChart()
}

// Redraw on data change or resize
watch(() => [props.positions, props.cash], drawChart, { deep: true })
watch(highlightedIndex, drawChart)

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
.portfolio-pie-chart {
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

.total-value {
  font-size: 0.875rem;
  color: #666;
  font-weight: 500;
}

.chart-content {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.pie-container {
  flex: 0 0 auto;
  position: relative;
}

.pie-container canvas {
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

.legend-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 300px;
  overflow-y: auto;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.legend-item:hover {
  background: #f8f9fa;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

.legend-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.legend-name {
  font-weight: 500;
  color: #2c3e50;
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.legend-symbol {
  font-size: 0.75rem;
  color: #666;
}

.legend-values {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.legend-percent {
  font-weight: 600;
  color: #2c3e50;
  font-size: 0.875rem;
}

.legend-amount {
  font-size: 0.75rem;
  color: #666;
}

@media (max-width: 768px) {
  .chart-content {
    flex-direction: column;
    align-items: center;
  }

  .legend-container {
    width: 100%;
    max-height: 200px;
  }
}
</style>
