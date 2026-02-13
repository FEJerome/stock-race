<template>
  <view class="service-status-bar" v-if="showBar">
    <view class="status-content" :class="statusClass">
      <text class="status-icon">{{ statusIcon }}</text>
      <text class="status-text">{{ statusText }}</text>
      <text class="retry-btn" v-if="canRetry" @tap="onRetry">重试</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { healthStatus, isAnyUnhealthy, checkHealth } from '@/services/health'

// ==================== 计算属性 ====================

const showBar = computed(() => isAnyUnhealthy.value)

const statusClass = computed(() => {
  if (healthStatus.value.backend === 'unhealthy') {
    return 'error'
  }
  if (healthStatus.value.marketData === 'unhealthy') {
    return 'warning'
  }
  return ''
})

const statusIcon = computed(() => {
  if (healthStatus.value.backend === 'unhealthy') {
    return '❌'
  }
  if (healthStatus.value.marketData === 'unhealthy') {
    return '⚠️'
  }
  return 'ℹ️'
})

const statusText = computed(() => {
  if (healthStatus.value.backend === 'unhealthy' && healthStatus.value.marketData === 'unhealthy') {
    return '服务异常，部分功能不可用'
  }
  if (healthStatus.value.backend === 'unhealthy') {
    return '数据服务异常，使用缓存数据'
  }
  if (healthStatus.value.marketData === 'unhealthy') {
    return '行情服务异常，实时更新暂停'
  }
  return ''
})

const canRetry = computed(() => !healthStatus.value.isChecking)

// ==================== 方法 ====================

async function onRetry() {
  await checkHealth()
}
</script>

<style scoped>
.service-status-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
}

.status-content {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16rpx 30rpx;
  background: #faad14;
}

.status-content.error {
  background: #ff4d4f;
}

.status-content.warning {
  background: #faad14;
}

.status-icon {
  font-size: 28rpx;
  margin-right: 12rpx;
}

.status-text {
  font-size: 26rpx;
  color: #fff;
  flex: 1;
}

.retry-btn {
  font-size: 26rpx;
  color: #fff;
  padding: 8rpx 20rpx;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 8rpx;
}
</style>
