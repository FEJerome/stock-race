<template>
  <!-- 骨架屏组件 - 提供多种预设类型的加载占位效果 -->
  <view class="skeleton-wrapper" :class="{ 'skeleton-active': active }">
    <!-- 卡片类型骨架屏 -->
    <template v-if="type === 'card'">
      <view class="skeleton-card" :style="cardStyle">
        <view v-if="showHeader" class="skeleton-header">
          <view class="skeleton-avatar" :style="avatarStyle"></view>
          <view class="skeleton-header-content">
            <view class="skeleton-title" :style="{ width: titleWidth }"></view>
            <view class="skeleton-subtitle" :style="{ width: subtitleWidth }"></view>
          </view>
        </view>
        <view class="skeleton-body">
          <view
            v-for="i in rows"
            :key="i"
            class="skeleton-row"
            :style="{ width: i === rows ? lastRowWidth : '100%' }"
          ></view>
        </view>
      </view>
    </template>

    <!-- 列表类型骨架屏 -->
    <template v-else-if="type === 'list'">
      <view class="skeleton-list">
        <view
          v-for="i in rows"
          :key="i"
          class="skeleton-list-item"
          :style="listItemStyle"
        >
          <view v-if="showAvatar" class="skeleton-avatar" :style="avatarStyle"></view>
          <view class="skeleton-content">
            <view class="skeleton-row" :style="{ width: '60%' }"></view>
            <view class="skeleton-row sm" :style="{ width: '40%' }"></view>
          </view>
        </view>
      </view>
    </template>

    <!-- 图表类型骨架屏 -->
    <template v-else-if="type === 'chart'">
      <view class="skeleton-chart" :style="chartStyle">
        <view class="skeleton-chart-header">
          <view class="skeleton-title" :style="{ width: '40%' }"></view>
        </view>
        <view class="skeleton-chart-body">
          <view class="skeleton-chart-bars">
            <view
              v-for="i in 7"
              :key="i"
              class="skeleton-bar"
              :style="{ height: `${Math.random() * 60 + 20}%` }"
            ></view>
          </view>
        </view>
      </view>
    </template>

    <!-- 统计卡片骨架屏 -->
    <template v-else-if="type === 'stats'">
      <view class="skeleton-stats">
        <view
          v-for="i in columns"
          :key="i"
          class="skeleton-stat-item"
          :style="statItemStyle"
        >
          <view class="skeleton-value" :style="{ width: '60%' }"></view>
          <view class="skeleton-label" :style="{ width: '40%' }"></view>
        </view>
      </view>
    </template>

    <!-- 自定义骨架屏 -->
    <template v-else-if="type === 'custom'">
      <slot></slot>
    </template>

    <!-- 默认骨架屏（文本行） -->
    <template v-else>
      <view class="skeleton-default">
        <view
          v-for="i in rows"
          :key="i"
          class="skeleton-row"
          :style="{ width: i === rows ? lastRowWidth : '100%' }"
        ></view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// 组件属性定义
interface Props {
  // 骨架屏类型
  type?: 'default' | 'card' | 'list' | 'chart' | 'stats' | 'custom'
  // 是否显示动画
  active?: boolean
  // 行数
  rows?: number
  // 列数（用于stats类型）
  columns?: number
  // 是否显示头像
  showAvatar?: boolean
  // 是否显示头部
  showHeader?: boolean
  // 标题宽度
  titleWidth?: string
  // 副标题宽度
  subtitleWidth?: string
  // 最后一行宽度
  lastRowWidth?: string
  // 卡片圆角
  borderRadius?: string
  // 背景色
  bgColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'default',
  active: true,
  rows: 3,
  columns: 3,
  showAvatar: true,
  showHeader: true,
  titleWidth: '60%',
  subtitleWidth: '40%',
  lastRowWidth: '60%',
  borderRadius: '16rpx',
  bgColor: '#ffffff'
})

// 计算样式
const cardStyle = computed(() => ({
  borderRadius: props.borderRadius,
  backgroundColor: props.bgColor
}))

const avatarStyle = computed(() => {
  const size = props.type === 'list' ? '80rpx' : '96rpx'
  return {
    width: size,
    height: size,
    borderRadius: '50%'
  }
})

const listItemStyle = computed(() => ({
  borderRadius: props.borderRadius,
  backgroundColor: props.bgColor
}))

const chartStyle = computed(() => ({
  borderRadius: props.borderRadius,
  backgroundColor: props.bgColor
}))

const statItemStyle = computed(() => ({
  borderRadius: props.borderRadius,
  backgroundColor: props.bgColor
}))
</script>

<style lang="scss" scoped>
// 骨架屏基础样式
.skeleton-wrapper {
  width: 100%;
}

// 骨架屏动画背景
@mixin skeleton-bg {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e8e8e8 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
}

// 骨架屏元素基础
.skeleton-row,
.skeleton-title,
.skeleton-subtitle,
.skeleton-value,
.skeleton-label,
.skeleton-avatar,
.skeleton-bar {
  @include skeleton-bg;
  border-radius: 8rpx;
}

// 激活动画
.skeleton-active {
  .skeleton-row,
  .skeleton-title,
  .skeleton-subtitle,
  .skeleton-value,
  .skeleton-label,
  .skeleton-avatar,
  .skeleton-bar {
    animation: shimmer 1.5s infinite;
  }
}

// 闪烁动画
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

// 卡片类型
.skeleton-card {
  padding: 32rpx;
  margin-bottom: 24rpx;

  .skeleton-header {
    display: flex;
    align-items: center;
    margin-bottom: 24rpx;

    .skeleton-avatar {
      flex-shrink: 0;
      margin-right: 20rpx;
    }

    .skeleton-header-content {
      flex: 1;

      .skeleton-title {
        height: 32rpx;
        margin-bottom: 12rpx;
      }

      .skeleton-subtitle {
        height: 24rpx;
      }
    }
  }

  .skeleton-body {
    .skeleton-row {
      height: 28rpx;
      margin-bottom: 16rpx;

      &:last-child {
        margin-bottom: 0;
      }
    }
  }
}

// 列表类型
.skeleton-list {
  .skeleton-list-item {
    display: flex;
    align-items: center;
    padding: 24rpx;
    margin-bottom: 16rpx;

    .skeleton-avatar {
      flex-shrink: 0;
      margin-right: 20rpx;
    }

    .skeleton-content {
      flex: 1;

      .skeleton-row {
        height: 28rpx;
        margin-bottom: 12rpx;

        &.sm {
          height: 24rpx;
        }

        &:last-child {
          margin-bottom: 0;
        }
      }
    }
  }
}

// 图表类型
.skeleton-chart {
  padding: 32rpx;
  margin-bottom: 24rpx;

  .skeleton-chart-header {
    margin-bottom: 32rpx;

    .skeleton-title {
      height: 32rpx;
    }
  }

  .skeleton-chart-body {
    height: 300rpx;
    display: flex;
    align-items: flex-end;

    .skeleton-chart-bars {
      display: flex;
      justify-content: space-around;
      align-items: flex-end;
      width: 100%;
      height: 100%;

      .skeleton-bar {
        width: 60rpx;
        border-radius: 8rpx 8rpx 0 0;
        min-height: 40rpx;
      }
    }
  }
}

// 统计类型
.skeleton-stats {
  display: flex;
  padding: 24rpx;
  gap: 24rpx;

  .skeleton-stat-item {
    flex: 1;
    padding: 24rpx;
    text-align: center;

    .skeleton-value {
      height: 40rpx;
      margin: 0 auto 16rpx;
    }

    .skeleton-label {
      height: 24rpx;
      margin: 0 auto;
    }
  }
}

// 默认类型
.skeleton-default {
  padding: 24rpx;

  .skeleton-row {
    height: 28rpx;
    margin-bottom: 16rpx;

    &:last-child {
      margin-bottom: 0;
    }
  }
}
</style>
