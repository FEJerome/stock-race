<template>
  <!-- 页面加载组件 - 提供页面级加载状态管理 -->
  <view class="page-loader-wrapper">
    <!-- 加载状态 -->
    <view v-if="loading" class="page-loader" :class="{ 'fullscreen': fullscreen }"
    >
      <view class="loader-content">
        <!-- 加载动画类型 -->
        <view v-if="type === 'spinner'" class="loader-spinner">
          <view class="spinner-ring"></view>
        </view>

        <view v-else-if="type === 'dots'" class="loader-dots">
          <view class="dot"></view>
          <view class="dot"></view>
          <view class="dot"></view>
        </view>

        <view v-else-if="type === 'pulse'" class="loader-pulse">
          <view class="pulse-circle"></view>
        </view>

        <view v-else-if="type === 'skeleton'" class="loader-skeleton">
          <slot name="skeleton">
            <Skeleton :type="skeletonType" :rows="skeletonRows" :active="true" />
          </slot>
        </view>

        <!-- 加载文本 -->
        <text v-if="text && type !== 'skeleton'" class="loader-text">{{ text }}</text>

        <!-- 进度条 -->
        <view v-if="showProgress && type !== 'skeleton'" class="progress-bar">
          <view class="progress-fill" :style="{ width: progress + '%' }"></view>
        </view>
      </view>
    </view>

    <!-- 内容区域 -->
    <view v-show="!loading" class="page-content" :class="{ 'fade-in': !loading && animate }">
      <slot></slot>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Skeleton from './Skeleton.vue'

// 组件属性定义
interface Props {
  // 是否加载中
  loading: boolean
  // 加载类型
  type?: 'spinner' | 'dots' | 'pulse' | 'skeleton'
  // 加载文本
  text?: string
  // 是否全屏
  fullscreen?: boolean
  // 是否显示进度条
  showProgress?: boolean
  // 进度值（0-100）
  progress?: number
  // 是否启用内容动画
  animate?: boolean
  // 骨架屏类型
  skeletonType?: 'card' | 'list' | 'default'
  // 骨架屏行数
  skeletonRows?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'spinner',
  text: '加载中...',
  fullscreen: false,
  showProgress: false,
  progress: 0,
  animate: true,
  skeletonType: 'card',
  skeletonRows: 3
})

// 计算进度百分比
const progressPercent = computed(() => {
  return Math.min(Math.max(props.progress, 0), 100)
})
</script>

<style lang="scss" scoped>
.page-loader-wrapper {
  width: 100%;
  height: 100%;
}

// 加载器容器
.page-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;

  &.fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.95);
    z-index: 999;
    padding: 0;
  }
}

.loader-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
}

// 旋转加载器
.loader-spinner {
  .spinner-ring {
    width: 64rpx;
    height: 64rpx;
    border: 4rpx solid #f0f0f0;
    border-top-color: $primary-color;
    border-radius: 50%;
    animation: rotate 0.8s linear infinite;
  }
}

// 加载点
.loader-dots {
  display: flex;
  gap: 16rpx;

  .dot {
    width: 20rpx;
    height: 20rpx;
    background: $primary-color;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;

    &:nth-child(1) { animation-delay: -0.32s; }
    &:nth-child(2) { animation-delay: -0.16s; }
  }
}

// 脉冲加载
.loader-pulse {
  .pulse-circle {
    width: 64rpx;
    height: 64rpx;
    background: rgba($primary-color, 0.3);
    border-radius: 50%;
    animation: pulse-scale 1.5s ease-out infinite;
  }
}

// 骨架屏
.loader-skeleton {
  width: 100%;
  max-width: 750rpx;
}

// 加载文本
.loader-text {
  font-size: 28rpx;
  color: #8c8c8c;
}

// 进度条
.progress-bar {
  width: 240rpx;
  height: 6rpx;
  background: #f0f0f0;
  border-radius: 3rpx;
  overflow: hidden;

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, $primary-color, $primary-light);
    border-radius: 3rpx;
    transition: width 0.3s ease;
  }
}

// 内容区域
.page-content {
  width: 100%;
  height: 100%;

  &.fade-in {
    animation: fadeIn 0.3s ease-out;
  }
}

// 动画定义
@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10rpx); }
}

@keyframes pulse-scale {
  0% {
    transform: scale(0);
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
