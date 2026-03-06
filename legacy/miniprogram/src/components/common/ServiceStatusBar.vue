<template>
  <view class="service-status-bar" v-if="showBar">
    <view class="status-content" :class="statusClass">
      <text class="status-icon">{{ icon }}</text>
      <text class="status-message">{{ message }}</text>
      <text class="close-btn" v-if="isClosable" @click="closeBar">×</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import {
  degradationMessage,
  isAllHealthy,
  hasDegradedService,
  startHealthCheck,
  stopHealthCheck,
  ServiceStatus,
  getServiceHealth
} from '@/services/health'

interface Props {
  closable?: boolean
  autoStart?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  closable: true,
  autoStart: true
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

// 是否显示状态栏
const showBar = computed(() => {
  return !isAllHealthy.value && degradationMessage.value
})

// 状态样式类
const statusClass = computed(() => {
  if (hasDegradedService.value) {
    // 检查是否有服务完全不可用
    const backendHealth = getServiceHealth('backend')
    const marketDataHealth = getServiceHealth('marketData')

    if (backendHealth?.status === ServiceStatus.UNAVAILABLE ||
        marketDataHealth?.status === ServiceStatus.UNAVAILABLE) {
      return 'status-error'
    }
    return 'status-warning'
  }
  return 'status-healthy'
})

// 图标
const icon = computed(() => {
  const backendHealth = getServiceHealth('backend')
  const marketDataHealth = getServiceHealth('marketData')

  if (backendHealth?.status === ServiceStatus.UNAVAILABLE ||
      marketDataHealth?.status === ServiceStatus.UNAVAILABLE) {
    return '⚠️'
  }
  return '⏱️'
})

// 提示消息
const message = computed(() => degradationMessage.value || '')

// 是否可关闭
const isClosable = computed(() => props.closable)

// 关闭状态栏
function closeBar() {
  emit('close')
}

// 组件挂载
onMounted(() => {
  if (props.autoStart) {
    startHealthCheck()
  }
})

// 组件卸载
onUnmounted(() => {
  stopHealthCheck()
})
</script>

<style lang="scss" scoped>
.service-status-bar {
  width: 100%;
  padding: 0 20rpx;
  box-sizing: border-box;
}

.status-content {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  border-radius: 8rpx;
  gap: 12rpx;
}

.status-warning {
  background: #FFF7E6;
  border: 1rpx solid #FFD591;

  .status-message {
    color: #D46B08;
  }
}

.status-error {
  background: #FFF1F0;
  border: 1rpx solid #FFA39E;

  .status-message {
    color: #CF1322;
  }
}

.status-healthy {
  background: #F6FFED;
  border: 1rpx solid #B7EB8F;

  .status-message {
    color: #389E0D;
  }
}

.status-icon {
  font-size: 28rpx;
}

.status-message {
  flex: 1;
  font-size: 24rpx;
  line-height: 1.4;
}

.close-btn {
  font-size: 32rpx;
  color: #999;
  padding: 0 8rpx;
  line-height: 1;
}
</style>
