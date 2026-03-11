<template>
  <div
    class="agent-card"
    :class="{ 'is-active': agent.status === 'active', 'is-paused': agent.status === 'paused' }"
    @click="$emit('click', agent.id)"
  >
    <!-- Left: Avatar & Basic Info -->
    <div class="card-left">
      <div class="agent-avatar" :style="avatarStyle">
        <span class="avatar-text">{{ avatarText }}</span>
      </div>
      <div class="agent-info">
        <h4 class="agent-name">{{ agent.name }}</h4>
        <div class="agent-model">
          <span class="model-icon">🤖</span>
          <span class="model-name">{{ modelShortName }}</span>
        </div>
      </div>
    </div>

    <!-- Center: Return Progress Bar -->
    <div class="card-center">
      <div class="return-header">
        <span class="return-label">收益率</span>
        <span class="return-value" :class="returnClass">
          {{ formattedReturn }}
        </span>
      </div>
      <div class="progress-container">
        <div
          class="progress-bar"
          :class="returnClass"
          :style="{ width: progressWidth + '%' }"
        >
          <div class="progress-glow"></div>
        </div>
      </div>
      <div class="capital-info">
        <span class="capital-current">{{ formatMoney(agent.current_capital) }}</span>
        <span class="capital-divider">/</span>
        <span class="capital-initial">{{ formatMoney(agent.initial_capital) }}</span>
      </div>
    </div>

    <!-- Right: Level Badge & Status -->
    <div class="card-right">
      <div class="level-badge" :class="levelBadgeClass">
        <span class="level-icon">{{ levelIcon }}</span>
        <span class="level-text">{{ levelText }}</span>
      </div>
      <div class="status-indicator">
        <span class="status-dot" :class="agent.status"></span>
        <span class="status-text">{{ statusText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Agent } from '../api/agents'

const props = defineProps<{
  agent: Agent
}>()

defineEmits<{
  click: [id: string]
}>()

// Avatar generation based on agent name
const avatarText = computed(() => {
  return props.agent.name.charAt(0).toUpperCase()
})

const avatarStyle = computed(() => {
  // Generate gradient based on name hash
  const hash = props.agent.name.split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0)
  }, 0)

  const hue1 = hash % 360
  const hue2 = (hash * 7) % 360

  return {
    background: `linear-gradient(135deg, hsl(${hue1}, 70%, 50%), hsl(${hue2}, 70%, 40%))`,
    boxShadow: `0 0 20px hsla(${hue1}, 70%, 50%, 0.4)`,
  }
})

// Model name shortening
const modelShortName = computed(() => {
  const name = props.agent.model_name || ''
  if (name.includes('kimi')) return 'Kimi'
  if (name.includes('deepseek')) return 'DeepSeek'
  if (name.includes('qwen')) return 'Qwen'
  return name
})

// Return calculations
const returnValue = computed(() => {
  const ret = ((props.agent.current_capital - props.agent.initial_capital) / props.agent.initial_capital) * 100
  return ret
})

const formattedReturn = computed(() => {
  const ret = returnValue.value
  return (ret >= 0 ? '+' : '') + ret.toFixed(2) + '%'
})

const returnClass = computed(() => {
  return returnValue.value >= 0 ? 'up' : 'down'
})

// Progress bar width (capped at 100%)
const progressWidth = computed(() => {
  const absReturn = Math.abs(returnValue.value)
  return Math.min(absReturn * 2, 100) // Scale: 50% return = full bar
})

// Level badge
const levelText = computed(() => {
  const map: Record<string, string> = {
    intern: '实习生',
    manager: '经理',
    partner: '合伙人',
  }
  return map[props.agent.agent_level] || props.agent.agent_level
})

const levelIcon = computed(() => {
  const map: Record<string, string> = {
    intern: '🌱',
    manager: '💼',
    partner: '👑',
  }
  return map[props.agent.agent_level] || '🤖'
})

const levelBadgeClass = computed(() => {
  return `level-${props.agent.agent_level}`
})

// Status
const statusText = computed(() => {
  return props.agent.status === 'active' ? '运行中' : '已暂停'
})

// Format money
function formatMoney(value: number): string {
  if (value >= 100000000) {
    return '¥' + (value / 100000000).toFixed(1) + '亿'
  } else if (value >= 10000) {
    return '¥' + (value / 10000).toFixed(1) + '万'
  }
  return '¥' + value.toLocaleString('zh-CN')
}
</script>

<style scoped>
.agent-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-base);
  position: relative;
  overflow: hidden;
}

.agent-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent-cyan), transparent);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.agent-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-accent);
  box-shadow: var(--shadow-lg), 0 0 30px rgba(0, 212, 255, 0.1);
}

.agent-card:hover::before {
  opacity: 1;
}

.agent-card.is-active {
  border-left: 3px solid var(--up-primary);
}

.agent-card.is-paused {
  border-left: 3px solid var(--neutral-muted);
  opacity: 0.8;
}

/* Left Section */
.card-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 140px;
}

.agent-avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--font-bold);
  font-size: var(--text-xl);
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
}

.avatar-text {
  font-family: var(--font-display);
}

.agent-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-name {
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.agent-model {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.model-icon {
  font-size: 10px;
}

.model-name {
  font-family: var(--font-mono);
}

/* Center Section */
.card-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 200px;
}

.return-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.return-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.return-value {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
}

.return-value.up {
  color: var(--up-primary);
  text-shadow: 0 0 10px var(--up-glow);
}

.return-value.down {
  color: var(--down-primary);
  text-shadow: 0 0 10px var(--down-glow);
}

.progress-container {
  height: 6px;
  background: var(--surface-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
  position: relative;
}

.progress-bar {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.5s var(--transition-bounce);
  position: relative;
}

.progress-bar.up {
  background: linear-gradient(90deg, var(--up-primary), #00ff9d);
  box-shadow: 0 0 10px var(--up-glow);
}

.progress-bar.down {
  background: linear-gradient(90deg, var(--down-primary), #ff6b7a);
  box-shadow: 0 0 10px var(--down-glow);
}

.progress-glow {
  position: absolute;
  top: 0;
  right: 0;
  width: 20px;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3));
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-20px); }
  100% { transform: translateX(20px); }
}

.capital-info {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.capital-current {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-weight: var(--font-medium);
}

.capital-divider {
  color: var(--text-muted);
}

.capital-initial {
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* Right Section */
.card-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-2);
  min-width: 80px;
}

.level-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}

.level-badge.level-intern {
  background: linear-gradient(135deg, #cd7f32 0%, #e6a855 100%);
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  box-shadow: 0 2px 8px rgba(205, 127, 50, 0.4);
}

.level-badge.level-manager {
  background: linear-gradient(135deg, #9ca3af 0%, #d1d5db 50%, #9ca3af 100%);
  color: #374151;
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.5);
  box-shadow: 0 2px 8px rgba(156, 163, 175, 0.4);
}

.level-badge.level-partner {
  background: linear-gradient(135deg, #fbbf24 0%, #fcd34d 50%, #f59e0b 100%);
  color: #78350f;
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.5);
  box-shadow: 0 2px 12px rgba(251, 191, 36, 0.5);
}

.level-icon {
  font-size: 10px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.active {
  background: var(--up-primary);
  box-shadow: 0 0 5px var(--up-primary), 0 0 10px var(--up-glow);
  animation: breathing 2s ease-in-out infinite;
}

.status-dot.paused {
  background: var(--neutral-muted);
}

@keyframes breathing {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 5px var(--up-primary), 0 0 10px var(--up-glow);
  }
  50% {
    opacity: 0.6;
    box-shadow: 0 0 2px var(--up-primary), 0 0 5px var(--up-glow);
  }
}

/* Responsive */
@media (max-width: 768px) {
  .agent-card {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3);
  }

  .card-left {
    min-width: auto;
  }

  .card-center {
    min-width: auto;
  }

  .card-right {
    flex-direction: row;
    justify-content: space-between;
    min-width: auto;
  }

  .agent-name {
    max-width: none;
  }
}
</style>
