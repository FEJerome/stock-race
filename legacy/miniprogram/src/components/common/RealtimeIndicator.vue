<template>
  <view class="realtime-indicator" :class="statusClass" v-if="showIndicator">
    <text class="indicator-dot"></text>
    <text class="indicator-text">{{ statusText }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { wsStatus, isHttpFallback } from '@/services/websocket'

// ==================== Props ====================

interface Props {
  showWhenConnected?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showWhenConnected: false,
})

// ==================== 计算属性 ====================

const showIndicator = computed(() => {
  if (wsStatus.value === 'connected') {
    return props.showWhenConnected
  }
  return true
})

const statusClass = computed(() => {
  if (wsStatus.value === 'connected') {
    return 'connected'
  }
  if (isHttpFallback.value) {
    return 'fallback'
  }
  if (wsStatus.value === 'connecting') {
    return 'connecting'
  }
  return 'disconnected'
})

const statusText = computed(() => {
  if (wsStatus.value === 'connected') {
    return '实时'
  }
  if (isHttpFallback.value) {
    return '延迟'
  }
  if (wsStatus.value === 'connecting') {
    return '连接中'
  }
  return '离线'
})
</script>

<style scoped>
.realtime-indicator {
  display: flex;
  align-items: center;
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
  background: #f5f5f5;
}

.indicator-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  margin-right: 8rpx;
  background: #999;
}

.realtime-indicator.connected .indicator-dot {
  background: #52c41a;
  animation: pulse 2s infinite;
}

.realtime-indicator.connected {
  background: #f6ffed;
}

.realtime-indicator.fallback .indicator-dot {
  background: #faad14;
}

.realtime-indicator.fallback {
  background: #fffbe6;
}

.realtime-indicator.connecting .indicator-dot {
  background: #1890ff;
  animation: blink 1s infinite;
}

.realtime-indicator.disconnected .indicator-dot {
  background: #ff4d4f;
}

.indicator-text {
  font-size: 22rpx;
  color: #666;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
</style>
