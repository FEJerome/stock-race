// 动画混入 - 提供页面和组件的动画功能
// 使用方法: import { useAnimation } from '@/mixins/animation'

import { ref, onMounted, onUnmounted } from 'vue'

// 动画配置选项
interface AnimationOptions {
  duration?: number
  delay?: number
  easing?: string
}

// 页面动画配置
interface PageAnimationConfig {
  type?: 'slide' | 'fade' | 'zoom' | 'none'
  direction?: 'up' | 'down' | 'left' | 'right'
}

/**
 * 页面转场动画混入
 */
export function usePageAnimation(config: PageAnimationConfig = {}) {
  const { type = 'slide', direction = 'right' } = config
  const pageClass = ref('')
  const isAnimating = ref(false)

  onMounted(() => {
    // 根据配置设置动画类名
    if (type === 'slide') {
      pageClass.value = `page-enter-${direction === 'right' ? 'right' : direction === 'left' ? 'left' : direction === 'up' ? 'up' : 'down'}`
    } else if (type === 'fade') {
      pageClass.value = 'page-enter-fade'
    } else if (type === 'zoom') {
      pageClass.value = 'page-enter-zoom'
    }

    isAnimating.value = true

    // 动画结束后移除动画类
    setTimeout(() => {
      isAnimating.value = false
      pageClass.value = ''
    }, 300)
  })

  return {
    pageClass,
    isAnimating
  }
}

/**
 * 列表项动画混入
 */
export function useListAnimation(itemCount: number = 10) {
  const getItemClass = (index: number) => {
    const delay = Math.min(index + 1, 20) // 最大延迟20个
    return `list-item-enter-delay-${delay}`
  }

  return {
    getItemClass
  }
}

/**
 * 按钮点击反馈混入
 */
export function useButtonFeedback() {
  const isPressed = ref(false)

  const onTouchStart = () => {
    isPressed.value = true
  }

  const onTouchEnd = () => {
    isPressed.value = false
  }

  const onTouchCancel = () => {
    isPressed.value = false
  }

  return {
    isPressed,
    onTouchStart,
    onTouchEnd,
    onTouchCancel
  }
}

/**
 * 加载状态动画混入
 */
export function useLoadingAnimation() {
  const isLoading = ref(false)
  const loadingProgress = ref(0)
  let progressTimer: ReturnType<typeof setInterval> | null = null

  const startLoading = () => {
    isLoading.value = true
    loadingProgress.value = 0

    // 模拟进度增长
    progressTimer = setInterval(() => {
      if (loadingProgress.value < 90) {
        loadingProgress.value += Math.random() * 15
        if (loadingProgress.value > 90) {
          loadingProgress.value = 90
        }
      }
    }, 200)
  }

  const stopLoading = () => {
    if (progressTimer) {
      clearInterval(progressTimer)
      progressTimer = null
    }
    loadingProgress.value = 100

    setTimeout(() => {
      isLoading.value = false
      loadingProgress.value = 0
    }, 300)
  }

  onUnmounted(() => {
    if (progressTimer) {
      clearInterval(progressTimer)
    }
  })

  return {
    isLoading,
    loadingProgress,
    startLoading,
    stopLoading
  }
}

/**
 * 骨架屏混入
 */
export function useSkeleton(loading: boolean = true) {
  const showSkeleton = ref(loading)

  const hideSkeleton = () => {
    showSkeleton.value = false
  }

  const showSkeletonAgain = () => {
    showSkeleton.value = true
  }

  return {
    showSkeleton,
    hideSkeleton,
    showSkeletonAgain
  }
}

/**
 * 滚动动画混入 - 元素进入视口时触发动画
 */
export function useScrollAnimation() {
  const animatedElements = ref<Set<string>>(new Set())

  const observeElement = (selector: string, callback?: () => void) => {
    // #ifdef H5
    const element = document.querySelector(selector)
    if (element && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !animatedElements.value.has(selector)) {
              animatedElements.value.add(selector)
              entry.target.classList.add('anim-slide-up')
              callback?.()
              observer.unobserve(entry.target)
            }
          })
        },
        { threshold: 0.1 }
      )
      observer.observe(element)
    }
    // #endif

    // #ifdef MP-WEIXIN
    const query = uni.createSelectorQuery()
    query.select(selector).boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec((res) => {
      if (res[0]) {
        const windowHeight = uni.getSystemInfoSync().windowHeight
        if (res[0].top < windowHeight) {
          animatedElements.value.add(selector)
          callback?.()
        }
      }
    })
    // #endif
  }

  return {
    animatedElements,
    observeElement
  }
}

/**
 * 数字滚动动画混入
 */
export function useNumberAnimation(duration: number = 1000) {
  const animatedValue = ref(0)
  let animationFrame: number | null = null

  const animateTo = (target: number, start: number = 0) => {
    const startTime = performance.now()
    const diff = target - start

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // 使用easeOutQuart缓动函数
      const easeProgress = 1 - Math.pow(1 - progress, 4)
      animatedValue.value = start + diff * easeProgress

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step)
      }
    }

    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
    }
    animationFrame = requestAnimationFrame(step)
  }

  onUnmounted(() => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
    }
  })

  return {
    animatedValue,
    animateTo
  }
}

/**
 * 脉冲动画混入（用于通知、提醒）
 */
export function usePulseAnimation() {
  const isPulsing = ref(false)
  let pulseTimer: ReturnType<typeof setTimeout> | null = null

  const startPulse = (duration: number = 2000) => {
    isPulsing.value = true

    pulseTimer = setTimeout(() => {
      isPulsing.value = false
    }, duration)
  }

  const stopPulse = () => {
    isPulsing.value = false
    if (pulseTimer) {
      clearTimeout(pulseTimer)
    }
  }

  onUnmounted(() => {
    if (pulseTimer) {
      clearTimeout(pulseTimer)
    }
  })

  return {
    isPulsing,
    startPulse,
    stopPulse
  }
}

/**
 * 错误摇晃动画混入
 */
export function useShakeAnimation() {
  const isShaking = ref(false)
  let shakeTimer: ReturnType<typeof setTimeout> | null = null

  const shake = () => {
    isShaking.value = true

    shakeTimer = setTimeout(() => {
      isShaking.value = false
    }, 500)
  }

  onUnmounted(() => {
    if (shakeTimer) {
      clearTimeout(shakeTimer)
    }
  })

  return {
    isShaking,
    shake
  }
}

/**
 * 综合动画工具
 */
export function useAnimation() {
  return {
    // 页面动画
    usePageAnimation,
    // 列表动画
    useListAnimation,
    // 按钮反馈
    useButtonFeedback,
    // 加载动画
    useLoadingAnimation,
    // 骨架屏
    useSkeleton,
    // 滚动动画
    useScrollAnimation,
    // 数字动画
    useNumberAnimation,
    // 脉冲动画
    usePulseAnimation,
    // 摇晃动画
    useShakeAnimation
  }
}

// 默认导出
export default useAnimation
