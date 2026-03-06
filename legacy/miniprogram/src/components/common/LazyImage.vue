<template>
  <!-- 懒加载图片组件 - 支持占位图、加载动画、错误处理 -->
  <view
    class="lazy-image-wrapper"
    :class="{ 'loaded': isLoaded, 'error': isError }"
    :style="wrapperStyle"
  >
    <!-- 占位图/加载中 -->
    <view v-if="showPlaceholder" class="placeholder" :style="placeholderStyle">
      <view v-if="loadingType === 'spinner'" class="loading-spinner"></view>
      <view v-else-if="loadingType === 'dots'" class="loading-dots">
        <view class="dot"></view>
        <view class="dot"></view>
        <view class="dot"></view>
      </view>
      <text v-else class="placeholder-icon">{{ placeholderIcon }}</text>
    </view>

    <!-- 错误状态 -->
    <view v-if="isError && showError" class="error-state" @click="retryLoad">
      <text class="error-icon">⚠️</text>
      <text class="error-text">加载失败</text>
      <text class="retry-text">点击重试</text>
    </view>

    <!-- 实际图片 -->
    <image
      v-if="shouldLoad"
      class="lazy-image"
      :src="src"
      :mode="mode"
      :lazy-load="true"
      :fade-show="fadeShow"
      :webp="webp"
      :show-menu-by-longpress="showMenuByLongpress"
      @load="onImageLoad"
      @error="onImageError"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

// 组件属性定义
interface Props {
  // 图片地址
  src: string
  // 图片裁剪模式
  mode?: 'scaleToFill' | 'aspectFit' | 'aspectFill' | 'widthFix' | 'heightFix' | 'top' | 'bottom' | 'center' | 'left' | 'right' | 'top left' | 'top right' | 'bottom left' | 'bottom right'
  // 容器宽度
  width?: string
  // 容器高度
  height?: string
  // 占位图类型
  loadingType?: 'spinner' | 'dots' | 'icon' | 'none'
  // 占位图标（当loadingType为icon时）
  placeholderIcon?: string
  // 是否显示错误状态
  showError?: boolean
  // 是否使用渐显效果
  fadeShow?: boolean
  // 是否使用webp格式
  webp?: boolean
  // 长按显示菜单
  showMenuByLongpress?: boolean
  // 是否启用懒加载（进入视口才加载）
  enableLazy?: boolean
  // 视口阈值（提前多少距离开始加载）
  threshold?: number
  // 圆角
  borderRadius?: string
  // 背景色
  bgColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'aspectFill',
  width: '100%',
  height: '100%',
  loadingType: 'spinner',
  placeholderIcon: '📷',
  showError: true,
  fadeShow: true,
  webp: false,
  showMenuByLongpress: false,
  enableLazy: true,
  threshold: 100,
  borderRadius: '0',
  bgColor: '#f5f5f5'
})

// 组件事件
const emit = defineEmits<{
  load: [event: any]
  error: [event: any]
}>()

// 状态变量
const isLoaded = ref(false)
const isError = ref(false)
const shouldLoad = ref(!props.enableLazy)
const observer = ref<UniApp.IntersectionObserver | null>(null)

// 计算属性
const showPlaceholder = computed(() => !isLoaded.value && !isError.value)

const wrapperStyle = computed(() => ({
  width: props.width,
  height: props.height,
  borderRadius: props.borderRadius,
  backgroundColor: props.bgColor
}))

const placeholderStyle = computed(() => ({
  borderRadius: props.borderRadius
}))

// 图片加载成功
function onImageLoad(event: any) {
  isLoaded.value = true
  isError.value = false
  emit('load', event)
}

// 图片加载失败
function onImageError(event: any) {
  isError.value = true
  isLoaded.value = false
  emit('error', event)
}

// 重试加载
function retryLoad() {
  isError.value = false
  isLoaded.value = false
  // 强制重新加载图片
  const tempSrc = props.src
  shouldLoad.value = false
  setTimeout(() => {
    shouldLoad.value = true
  }, 100)
}

// 创建交叉观察器（懒加载）
function createObserver() {
  if (!props.enableLazy) return

  // #ifdef H5
  // H5环境使用原生IntersectionObserver
  const element = document.querySelector('.lazy-image-wrapper')
  if (element && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            shouldLoad.value = true
            io.unobserve(entry.target)
          }
        })
      },
      {
        rootMargin: `${props.threshold}px`
      }
    )
    io.observe(element)
    observer.value = io as any
  } else {
    shouldLoad.value = true
  }
  // #endif

  // #ifdef MP-WEIXIN
  // 微信小程序环境使用createIntersectionObserver
  const query = uni.createSelectorQuery()
  query.select('.lazy-image-wrapper').boundingClientRect()
  query.selectViewport().scrollOffset()
  query.exec((res) => {
    if (res[0]) {
      const rect = res[0]
      const windowHeight = uni.getSystemInfoSync().windowHeight
      if (rect.top < windowHeight + props.threshold) {
        shouldLoad.value = true
      } else {
        // 监听滚动
        const scrollHandler = () => {
          const query = uni.createSelectorQuery()
          query.select('.lazy-image-wrapper').boundingClientRect()
          query.exec((res) => {
            if (res[0] && res[0].top < windowHeight + props.threshold) {
              shouldLoad.value = true
              uni.offPageScroll?.(scrollHandler)
            }
          })
        }
        uni.onPageScroll?.(scrollHandler)
      }
    }
  })
  // #endif

  // #ifndef H5 || MP-WEIXIN
  // 其他平台直接加载
  shouldLoad.value = true
  // #endif
}

// 监听src变化
watch(() => props.src, (newSrc) => {
  if (newSrc) {
    isLoaded.value = false
    isError.value = false
    if (!props.enableLazy) {
      shouldLoad.value = true
    }
  }
}, { immediate: true })

// 组件挂载
onMounted(() => {
  if (props.enableLazy) {
    createObserver()
  }
})

// 组件卸载
onUnmounted(() => {
  if (observer.value) {
    // #ifdef H5
    (observer.value as unknown as IntersectionObserver).disconnect()
    // #endif
  }
})
</script>

<style lang="scss" scoped>
.lazy-image-wrapper {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  // 加载完成后的样式
  &.loaded {
    .lazy-image {
      opacity: 1;
    }
  }

  // 错误状态样式
  &.error {
    .placeholder {
      display: none;
    }
  }
}

// 占位图样式
.placeholder {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  z-index: 1;

  .placeholder-icon {
    font-size: 48rpx;
    opacity: 0.3;
  }
}

// 旋转加载器
.loading-spinner {
  width: 40rpx;
  height: 40rpx;
  border: 4rpx solid #e0e0e0;
  border-top-color: $primary-color;
  border-radius: 50%;
  animation: rotate 0.8s linear infinite;
}

// 加载点
.loading-dots {
  display: flex;
  align-items: center;
  gap: 12rpx;

  .dot {
    width: 16rpx;
    height: 16rpx;
    background: $primary-color;
    border-radius: 50%;
    animation: pulse-bg 1.4s infinite ease-in-out both;

    &:nth-child(1) { animation-delay: -0.32s; }
    &:nth-child(2) { animation-delay: -0.16s; }
  }
}

// 错误状态
.error-state {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  z-index: 2;

  .error-icon {
    font-size: 48rpx;
    margin-bottom: 8rpx;
  }

  .error-text {
    font-size: 24rpx;
    color: #8c8c8c;
    margin-bottom: 8rpx;
  }

  .retry-text {
    font-size: 22rpx;
    color: $primary-color;
  }
}

// 实际图片
.lazy-image {
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.3s ease;
}

// 动画定义
@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse-bg {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
