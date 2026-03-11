<template>
  <div
    class="metric-card"
    :class="[variant, size, { 'is-loading': loading, 'has-trend': trend !== undefined }]"
    @click="$emit('click')"
  >
    <div class="card-background">
      <div class="card-glow"></div>
    </div>

    <div class="card-content">
      <div class="metric-header">
        <span class="metric-icon" v-if="icon">{{ icon }}</span>
        <span class="metric-label">{{ label }}</span>
        <div v-if="trend !== undefined" class="metric-trend" :class="trendClass">
          <span class="trend-arrow">{{ trendArrow }}</span>
          <span class="trend-value">{{ Math.abs(trend).toFixed(2) }}%</span>
        </div>
      </div>

      <div class="metric-value-container">
        <span class="metric-prefix" v-if="prefix">{{ prefix }}</span>
        <span class="metric-value" :class="{ 'is-large': size === 'large' }">
          <template v-if="loading">
            <span class="loading-dots">...</span>
          </template>
          <template v-else>
            {{ formattedValue }}
          </template>
        </span>
        <span class="metric-suffix" v-if="suffix">{{ suffix }}</span>
      </div>

      <div class="metric-footer" v-if="$slots.footer || subtitle">
        <slot name="footer">
          <span class="metric-subtitle">{{ subtitle }}</span>
        </slot>
      </div>
    </div>

    <div v-if="variant === 'live'" class="live-indicator">
      <span class="live-dot"></span>
      <span class="live-text">LIVE</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  value: number | string
  variant?: 'default' | 'up' | 'down' | 'accent' | 'live'
  size?: 'default' | 'large' | 'small'
  icon?: string
  prefix?: string
  suffix?: string
  subtitle?: string
  trend?: number
  loading?: boolean
  decimals?: number
  formatter?: (value: number) => string
}>(), {
  variant: 'default',
  size: 'default',
  decimals: 2,
  loading: false,
})

defineEmits<{
  click: []
}>()

const formattedValue = computed(() => {
  if (typeof props.value === 'string') return props.value

  if (props.formatter) {
    return props.formatter(props.value)
  }

  // Format large numbers
  const absValue = Math.abs(props.value)
  if (absValue >= 100000000) {
    return (props.value / 100000000).toFixed(props.decimals)
  } else if (absValue >= 10000) {
    return (props.value / 10000).toFixed(props.decimals)
  }

  return props.value.toLocaleString('zh-CN', {
    minimumFractionDigits: props.decimals,
    maximumFractionDigits: props.decimals,
  })
})

const trendClass = computed(() => {
  if (props.trend === undefined) return ''
  return props.trend >= 0 ? 'up' : 'down'
})

const trendArrow = computed(() => {
  if (props.trend === undefined) return ''
  return props.trend >= 0 ? '↑' : '↓'
})
</script>

<style scoped>
.metric-card {
  position: relative;
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-base);
}

.metric-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-accent);
  box-shadow: var(--shadow-lg);
}

/* Background Effects */
.card-background {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: var(--radius-xl);
  pointer-events: none;
}

.card-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(
    circle at center,
    rgba(0, 212, 255, 0.1) 0%,
    transparent 70%
  );
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.metric-card:hover .card-glow {
  opacity: 1;
}

/* Card Content */
.card-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Header */
.metric-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.metric-icon {
  font-size: var(--text-lg);
}

.metric-label {
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.metric-trend {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  font-family: var(--font-mono);
}

.metric-trend.up {
  background: var(--up-bg);
  color: var(--up-primary);
}

.metric-trend.down {
  background: var(--down-bg);
  color: var(--down-primary);
}

.trend-arrow {
  font-size: 10px;
}

/* Value */
.metric-value-container {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
}

.metric-prefix,
.metric-suffix {
  font-size: var(--text-lg);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
}

.metric-value {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  line-height: 1;
}

.metric-value.is-large {
  font-size: var(--text-4xl);
}

.loading-dots {
  animation: blink 1.5s infinite;
}

/* Footer */
.metric-footer {
  margin-top: var(--space-1);
}

.metric-subtitle {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* Live Indicator */
.live-indicator {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  display: flex;
  align-items: center;
  gap: 4px;
}

.live-dot {
  width: 6px;
  height: 6px;
  background: var(--up-primary);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.live-text {
  font-size: 9px;
  font-weight: var(--font-bold);
  color: var(--up-primary);
  letter-spacing: 0.1em;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}

/* Variants */
.metric-card.up {
  border-left: 3px solid var(--up-primary);
}

.metric-card.up .metric-value {
  color: var(--up-primary);
  text-shadow: 0 0 20px var(--up-glow);
}

.metric-card.down {
  border-left: 3px solid var(--down-primary);
}

.metric-card.down .metric-value {
  color: var(--down-primary);
  text-shadow: 0 0 20px var(--down-glow);
}

.metric-card.accent {
  border-left: 3px solid var(--accent-cyan);
}

.metric-card.accent .metric-value {
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.metric-card.live {
  border-color: rgba(0, 208, 132, 0.3);
}

.metric-card.live:hover {
  border-color: var(--up-primary);
  box-shadow: 0 0 30px rgba(0, 208, 132, 0.1);
}

/* Sizes */
.metric-card.small {
  padding: var(--space-3);
}

.metric-card.small .metric-value {
  font-size: var(--text-xl);
}

.metric-card.large {
  padding: var(--space-6);
}

.metric-card.large .metric-label {
  font-size: var(--text-sm);
}

/* Loading State */
.metric-card.is-loading {
  opacity: 0.8;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Responsive */
@media (max-width: 768px) {
  .metric-card {
    padding: var(--space-4);
  }

  .metric-value {
    font-size: var(--text-xl);
  }

  .metric-value.is-large {
    font-size: var(--text-2xl);
  }
}
</style>
