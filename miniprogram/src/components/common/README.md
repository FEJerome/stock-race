# 公共组件使用说明

## 动画和性能优化组件

### 1. Skeleton 骨架屏组件

用于在数据加载时显示占位内容，提升用户体验。

**基本用法：**
```vue
<template>
  <Skeleton type="card" :rows="3" :active="true" />
</template>

<script setup>
import Skeleton from '@/components/common/Skeleton.vue'
</script>
```

**属性说明：**
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| type | string | 'default' | 骨架屏类型：default/card/list/chart/stats/custom |
| active | boolean | true | 是否显示动画 |
| rows | number | 3 | 行数 |
| columns | number | 3 | 列数（stats类型） |
| showAvatar | boolean | true | 是否显示头像 |
| showHeader | boolean | true | 是否显示头部 |
| titleWidth | string | '60%' | 标题宽度 |
| lastRowWidth | string | '60%' | 最后一行宽度 |
| borderRadius | string | '16rpx' | 圆角 |
| bgColor | string | '#ffffff' | 背景色 |

### 2. LazyImage 懒加载图片组件

优化图片加载性能，支持占位图、加载动画和错误处理。

**基本用法：**
```vue
<template>
  <LazyImage
    src="https://example.com/image.jpg"
    width="200rpx"
    height="200rpx"
    mode="aspectFill"
    :enableLazy="true"
  />
</template>

<script setup>
import LazyImage from '@/components/common/LazyImage.vue'
</script>
```

**属性说明：**
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| src | string | - | 图片地址（必填） |
| mode | string | 'aspectFill' | 裁剪模式 |
| width | string | '100%' | 容器宽度 |
| height | string | '100%' | 容器高度 |
| loadingType | string | 'spinner' | 加载类型：spinner/dots/icon/none |
| placeholderIcon | string | '📷' | 占位图标 |
| showError | boolean | true | 是否显示错误状态 |
| fadeShow | boolean | true | 是否使用渐显效果 |
| enableLazy | boolean | true | 是否启用懒加载 |
| threshold | number | 100 | 视口阈值（px） |
| borderRadius | string | '0' | 圆角 |
| bgColor | string | '#f5f5f5' | 背景色 |

### 3. VirtualList 虚拟列表组件

优化长列表性能，只渲染可视区域内的项目。

**基本用法：**
```vue
<template>
  <VirtualList
    :list="dataList"
    :itemHeight="120"
    :height="800"
    :loading="loading"
    :hasMore="hasMore"
    @scrolltolower="loadMore"
  >
    <template #default="{ item, index }">
      <view class="list-item">
        <text>{{ item.name }}</text>
      </view>
    </template>
  </VirtualList>
</template>

<script setup>
import VirtualList from '@/components/common/VirtualList.vue'
</script>
```

**属性说明：**
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| list | array | - | 列表数据（必填） |
| itemHeight | number | - | 每项高度rpx（必填） |
| bufferSize | number | 5 | 缓冲数量 |
| height | number | 800 | 容器高度rpx |
| loading | boolean | false | 是否加载中 |
| hasMore | boolean | true | 是否还有更多 |
| lowerThreshold | number | 100 | 触发加载更多的距离 |
| scrollWithAnimation | boolean | false | 是否使用滚动动画 |

### 4. PageLoader 页面加载组件

提供页面级加载状态管理，支持多种加载动画类型。

**基本用法：**
```vue
<template>
  <PageLoader :loading="pageLoading" type="skeleton" skeletonType="card">
    <!-- 页面内容 -->
    <view class="page-content">
      <text>页面内容</text>
    </view>
  </PageLoader>
</template>

<script setup>
import PageLoader from '@/components/common/PageLoader.vue'

const pageLoading = ref(true)
</script>
```

**属性说明：**
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| loading | boolean | - | 是否加载中（必填） |
| type | string | 'spinner' | 加载类型：spinner/dots/pulse/skeleton |
| text | string | '加载中...' | 加载文本 |
| fullscreen | boolean | false | 是否全屏 |
| showProgress | boolean | false | 是否显示进度条 |
| progress | number | 0 | 进度值（0-100） |
| animate | boolean | true | 是否启用内容动画 |
| skeletonType | string | 'card' | 骨架屏类型 |
| skeletonRows | number | 3 | 骨架屏行数 |

## 动画混入 (Mixins)

### 1. usePageAnimation 页面动画

```typescript
import { usePageAnimation } from '@/mixins/animation'

const { pageClass, isAnimating } = usePageAnimation({
  type: 'slide',  // slide/fade/zoom/none
  direction: 'right'  // up/down/left/right
})
```

### 2. useListAnimation 列表动画

```typescript
import { useListAnimation } from '@/mixins/animation'

const { getItemClass } = useListAnimation()

// 在模板中使用
// :class="getItemClass(index)"
```

### 3. useButtonFeedback 按钮点击反馈

```typescript
import { useButtonFeedback } from '@/mixins/animation'

const { isPressed, onTouchStart, onTouchEnd } = useButtonFeedback()
```

### 4. useLoadingAnimation 加载动画

```typescript
import { useLoadingAnimation } from '@/mixins/animation'

const { isLoading, loadingProgress, startLoading, stopLoading } = useLoadingAnimation()
```

### 5. useSkeleton 骨架屏

```typescript
import { useSkeleton } from '@/mixins/animation'

const { showSkeleton, hideSkeleton, showSkeletonAgain } = useSkeleton(true)
```

### 6. useNumberAnimation 数字滚动动画

```typescript
import { useNumberAnimation } from '@/mixins/animation'

const { animatedValue, animateTo } = useNumberAnimation(1000)

// 使用
animateTo(1000, 0)  // 从0滚动到1000
```

## CSS 动画类

### 页面转场动画
- `.page-enter-right` - 从右滑入
- `.page-enter-up` - 从下向上滑入
- `.page-enter-fade` - 淡入
- `.page-enter-zoom` - 缩放进入

### 列表项动画
- `.list-item-enter` - 列表项进入
- `.list-item-enter-delay-{1-20}` - 延迟进入（1-20级延迟）

### 内容动画
- `.anim-fade-in` / `.anim-fade-out` - 淡入/淡出
- `.anim-slide-up` / `.anim-slide-down` - 向上/下滑入
- `.anim-slide-left` / `.anim-slide-right` - 向左/右滑入
- `.anim-zoom-in` / `.anim-zoom-out` - 缩放进入/退出
- `.anim-rotate` - 旋转
- `.anim-pulse` - 脉冲
- `.anim-bounce` - 弹跳

### 动画时长
- `.anim-fast` - 0.15s
- `.anim-normal` - 0.3s
- `.anim-slow` - 0.5s

### 动画延迟
- `.anim-delay-{1-10}` - 延迟0.1s-1s

### 交互反馈
- `.btn-click-feedback` - 按钮点击缩放反馈
- `.btn-ripple` - 按钮波纹效果
- `.card-click-feedback` - 卡片点击反馈

### 骨架屏
- `.skeleton` - 基础骨架屏
- `.skeleton-circle` - 圆形骨架屏
- `.skeleton-rect` - 矩形骨架屏
- `.skeleton-text` - 文本骨架屏

### 加载动画
- `.loading-spinner` - 旋转加载器
- `.loading-spinner-sm` - 小号
- `.loading-spinner-lg` - 大号
- `.loading-dots` - 加载点

### 特殊效果
- `.success-pop` - 成功弹出动画
- `.error-shake` - 错误摇晃动画
- `.float-animation` - 浮动动画
- `.gradient-animation` - 渐变动画

### 性能优化
- `.gpu-accelerated` - GPU加速
- `.content-visibility-auto` - 内容可见性优化

## 使用示例

### 页面动画
```vue
<template>
  <view class="page-enter-fade">
    <view class="card anim-slide-up">卡片1</view>
    <view class="card anim-slide-up anim-delay-1">卡片2</view>
    <view class="card anim-slide-up anim-delay-2">卡片3</view>
  </view>
</template>
```

### 列表动画
```vue
<template>
  <view v-for="(item, index) in list" :key="index" :class="getItemClass(index)">
    {{ item.name }}
  </view>
</template>

<script setup>
import { useListAnimation } from '@/mixins/animation'
const { getItemClass } = useListAnimation()
</script>
```

### 按钮点击反馈
```vue
<template>
  <button class="btn-click-feedback">点击我</button>
</template>
```

### 骨架屏
```vue
<template>
  <view v-if="loading">
    <Skeleton type="list" :rows="5" />
  </view>
  <view v-else>
    <!-- 实际内容 -->
  </view>
</template>
```
