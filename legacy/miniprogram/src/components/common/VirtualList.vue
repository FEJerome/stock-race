<template>
  <!-- 虚拟列表组件 - 优化长列表性能 -->
  <view class="virtual-list-wrapper" :style="wrapperStyle">
    <!-- 列表容器 -->
    <scroll-view
      class="virtual-list-scroll"
      :scroll-y="true"
      :scroll-top="scrollTop"
      :lower-threshold="lowerThreshold"
      :upper-threshold="upperThreshold"
      :scroll-with-animation="scrollWithAnimation"
      @scroll="onScroll"
      @scrolltolower="onScrollToLower"
      @scrolltoupper="onScrollToUpper"
    >
      <!-- 占位区域，用于撑开滚动高度 -->
      <view class="virtual-list-phantom" :style="phantomStyle"></view>

      <!-- 可视区域 -->
      <view class="virtual-list-content" :style="contentStyle">
        <view
          v-for="item in visibleItems"
          :key="item.key"
          class="virtual-list-item"
          :style="{ height: itemHeight + 'rpx' }"
        >
          <slot :item="item.data" :index="item.index"></slot>
        </view>
      </view>

      <!-- 加载更多 -->
      <view v-if="loading" class="loading-more">
        <view class="loading-spinner"></view>
        <text class="loading-text">加载中...</text>
      </view>

      <!-- 没有更多数据 -->
      <view v-if="!hasMore && list.length > 0" class="no-more">
        <text class="no-more-text">没有更多数据了</text>
      </view>

      <!-- 空状态 -->
      <view v-if="list.length === 0 && !loading" class="empty-state">
        <slot name="empty">
          <text class="empty-text">暂无数据</text>
        </slot>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

// 组件属性定义
interface Props {
  // 列表数据
  list: any[]
  // 每项高度（rpx）
  itemHeight: number
  // 可视区域外缓冲数量
  bufferSize?: number
  // 容器高度（rpx）
  height?: number
  // 是否加载中
  loading?: boolean
  // 是否还有更多数据
  hasMore?: boolean
  // 距离底部多少距离触发加载更多
  lowerThreshold?: number
  // 距离顶部多少距离触发下拉刷新
  upperThreshold?: number
  // 滚动动画
  scrollWithAnimation?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  bufferSize: 5,
  height: 800,
  loading: false,
  hasMore: true,
  lowerThreshold: 100,
  upperThreshold: 100,
  scrollWithAnimation: false
})

// 组件事件
const emit = defineEmits<{
  scroll: [event: any]
  scrolltolower: []
  scrolltoupper: []
}>()

// 状态变量
const scrollTop = ref(0)
const scrollOffset = ref(0)
const visibleStart = ref(0)
const visibleEnd = ref(0)

// 系统信息
const systemInfo = uni.getSystemInfoSync()
const pixelRatio = systemInfo.windowWidth / 750 // rpx转px比例

// 计算样式
const wrapperStyle = computed(() => ({
  height: props.height + 'rpx'
}))

const phantomStyle = computed(() => ({
  height: props.list.length * props.itemHeight + 'rpx'
}))

const contentStyle = computed(() => {
  const offset = visibleStart.value * props.itemHeight
  return {
    transform: `translateY(${offset}rpx)`
  }
})

// 计算可视项
const visibleItems = computed(() => {
  const items = []
  const start = Math.max(0, visibleStart.value)
  const end = Math.min(props.list.length, visibleEnd.value)

  for (let i = start; i < end; i++) {
    items.push({
      key: i,
      index: i,
      data: props.list[i]
    })
  }

  return items
})

// 更新可视范围
const updateVisibleRange = () => {
  const itemHeightPx = props.itemHeight * pixelRatio
  const scrollPos = scrollOffset.value
  const containerHeightPx = props.height * pixelRatio

  // 计算可视区域的起始和结束索引
  let start = Math.floor(scrollPos / itemHeightPx)
  let end = Math.ceil((scrollPos + containerHeightPx) / itemHeightPx)

  // 添加缓冲
  start = Math.max(0, start - props.bufferSize)
  end = Math.min(props.list.length, end + props.bufferSize)

  visibleStart.value = start
  visibleEnd.value = end
}

// 滚动事件处理
const onScroll = (event: any) => {
  scrollOffset.value = event.detail.scrollTop
  updateVisibleRange()
  emit('scroll', event)
}

// 滚动到底部
const onScrollToLower = () => {
  if (!props.loading && props.hasMore) {
    emit('scrolltolower')
  }
}

// 滚动到顶部
const onScrollToUpper = () => {
  emit('scrolltoupper')
}

// 监听列表变化
watch(() => props.list, () => {
  updateVisibleRange()
}, { deep: true })

// 初始化
onMounted(() => {
  updateVisibleRange()
})
</script>

<style lang="scss" scoped>
.virtual-list-wrapper {
  width: 100%;
  position: relative;
}

.virtual-list-scroll {
  width: 100%;
  height: 100%;
  position: relative;
}

.virtual-list-phantom {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: -1;
}

.virtual-list-content {
  position: relative;
  z-index: 1;
}

.virtual-list-item {
  width: 100%;
  box-sizing: border-box;
}

// 加载更多
.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx;
  gap: 16rpx;

  .loading-spinner {
    width: 32rpx;
    height: 32rpx;
    border: 3rpx solid #e0e0e0;
    border-top-color: $primary-color;
    border-radius: 50%;
    animation: rotate 0.8s linear infinite;
  }

  .loading-text {
    font-size: 24rpx;
    color: #8c8c8c;
  }
}

// 没有更多
.no-more {
  text-align: center;
  padding: 32rpx;

  .no-more-text {
    font-size: 24rpx;
    color: #8c8c8c;
  }
}

// 空状态
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 120rpx 48rpx;

  .empty-text {
    font-size: 28rpx;
    color: #8c8c8c;
  }
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
