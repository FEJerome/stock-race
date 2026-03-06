// 股票行情订阅管理 - O6-005B
// 根据 AI 账户持仓动态订阅/取消订阅股票代码

import { ref, computed, watch, onUnmounted } from 'vue'
import { useMarketStore } from '@/stores/market'
import { useTradingStore } from '@/stores/trading'
import type { Holding } from '@/types/trading'

// 订阅管理状态
const subscribedSymbols = ref<Set<string>>(new Set())
const isSubscribing = ref(false)
const lastSubscriptionTime = ref<number>(0)

// 防抖延迟（毫秒）- 避免频繁切换导致的重复订阅
const SUBSCRIPTION_DEBOUNCE = 500

/**
 * 股票行情订阅管理 Composable
 * 根据持仓自动管理 WebSocket 订阅
 */
export function useQuoteSubscription() {
  const marketStore = useMarketStore()
  const tradingStore = useTradingStore()

  // 当前持仓股票代码列表
  const holdingSymbols = computed(() => {
    return tradingStore.holdings.map((h: Holding) => h.stockCode)
  })

  // 是否已连接 WebSocket
  const isConnected = computed(() => marketStore.isWebSocketConnected)

  // 订阅状态
  const subscriptionStatus = computed(() => {
    return {
      isSubscribing: isSubscribing.value,
      subscribedCount: subscribedSymbols.value.size,
      holdingCount: holdingSymbols.value.length,
      symbols: Array.from(subscribedSymbols.value),
    }
  })

  /**
   * 执行订阅更新
   * 对比新旧订阅列表，计算差异并执行订阅/取消订阅
   */
  async function executeSubscription(newSymbols: string[]): Promise<void> {
    if (isSubscribing.value) {
      console.log('[QuoteSubscription] Subscription in progress, skipping...')
      return
    }

    // 检查防抖
    const now = Date.now()
    if (now - lastSubscriptionTime.value < SUBSCRIPTION_DEBOUNCE) {
      console.log('[QuoteSubscription] Debounced')
      return
    }

    isSubscribing.value = true
    lastSubscriptionTime.value = now

    try {
      const currentSymbols = Array.from(subscribedSymbols.value)
      const targetSymbols = [...new Set(newSymbols)] // 去重

      // 计算差异
      const toUnsubscribe = currentSymbols.filter(s => !targetSymbols.includes(s))
      const toSubscribe = targetSymbols.filter(s => !currentSymbols.includes(s))

      console.log('[QuoteSubscription] Current:', currentSymbols)
      console.log('[QuoteSubscription] Target:', targetSymbols)
      console.log('[QuoteSubscription] To unsubscribe:', toUnsubscribe)
      console.log('[QuoteSubscription] To subscribe:', toSubscribe)

      // 先取消订阅，再订阅新的（避免同时持有过多订阅）
      if (toUnsubscribe.length > 0) {
        marketStore.unsubscribeQuotes(toUnsubscribe)
        toUnsubscribe.forEach(s => subscribedSymbols.value.delete(s))
      }

      if (toSubscribe.length > 0) {
        // 确保 WebSocket 已连接
        if (!isConnected.value) {
          console.log('[QuoteSubscription] WebSocket not connected, connecting...')
          await marketStore.initWebSocket()
        }

        marketStore.subscribeQuotes(toSubscribe)
        toSubscribe.forEach(s => subscribedSymbols.value.add(s))
      }

      console.log('[QuoteSubscription] Updated. Total subscribed:', subscribedSymbols.value.size)
    } catch (error) {
      console.error('[QuoteSubscription] Error:', error)
    } finally {
      isSubscribing.value = false
    }
  }

  /**
   * 根据持仓更新订阅
   */
  async function updateSubscriptionByHoldings(): Promise<void> {
    await executeSubscription(holdingSymbols.value)
  }

  /**
   * 切换 AI 账户时的订阅管理
   * @param accountId 新的 AI 账户 ID
   */
  async function switchAccount(accountId: string): Promise<void> {
    console.log('[QuoteSubscription] Switching to account:', accountId)

    // 先获取新账户的持仓
    await tradingStore.fetchHoldings(true)

    // 更新订阅
    await updateSubscriptionByHoldings()
  }

  /**
   * 清空所有订阅
   */
  function clearAllSubscriptions(): void {
    const symbols = Array.from(subscribedSymbols.value)
    if (symbols.length > 0) {
      marketStore.unsubscribeQuotes(symbols)
      subscribedSymbols.value.clear()
      console.log('[QuoteSubscription] All subscriptions cleared')
    }
  }

  /**
   * 手动订阅指定股票
   */
  async function subscribeManual(symbols: string[]): Promise<void> {
    await executeSubscription([...holdingSymbols.value, ...symbols])
  }

  /**
   * 初始化订阅管理
   * 设置监听器，自动响应持仓变化
   */
  function initSubscriptionManager(): void {
    console.log('[QuoteSubscription] Initializing manager...')

    // 监听持仓变化，自动更新订阅
    watch(
      () => tradingStore.holdings,
      (newHoldings) => {
        if (newHoldings) {
          const symbols = newHoldings.map((h: Holding) => h.stockCode)
          executeSubscription(symbols)
        }
      },
      { deep: true, immediate: true }
    )

    // 监听 WebSocket 重连，自动重新订阅
    watch(
      () => marketStore.isWebSocketConnected,
      (isConnected) => {
        if (isConnected && subscribedSymbols.value.size > 0) {
          console.log('[QuoteSubscription] WebSocket reconnected, resubscribing...')
          // 重新订阅之前的股票
          marketStore.subscribeQuotes(Array.from(subscribedSymbols.value))
        }
      }
    )
  }

  // 组件卸载时清理
  onUnmounted(() => {
    clearAllSubscriptions()
  })

  return {
    // State
    subscribedSymbols,
    isSubscribing,
    holdingSymbols,
    isConnected,
    subscriptionStatus,

    // Actions
    executeSubscription,
    updateSubscriptionByHoldings,
    switchAccount,
    clearAllSubscriptions,
    subscribeManual,
    initSubscriptionManager,
  }
}

// 导出单例状态（用于跨组件共享）
export { subscribedSymbols }
