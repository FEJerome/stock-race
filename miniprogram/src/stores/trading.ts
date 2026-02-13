// 交易状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { tradingApi } from '@/api/trading'
import type { Holding, Trade, PortfolioOverview, ProfitStats } from '@/types/trading'
import type { QuoteUpdate } from '@/services/websocket'
import { cache } from '@/utils/cache'
import { CACHE_TTL } from '@/utils/constants'

export const useTradingStore = defineStore('trading', () => {
  // State
  const overview = ref<PortfolioOverview | null>(null)
  const holdings = ref<Holding[]>([])
  const trades = ref<Trade[]>([])
  const profitStats = ref<ProfitStats | null>(null)
  const loading = ref(false)
  const realtimePrices = ref<Map<string, number>>(new Map())
  const refreshTimer = ref<number | null>(null)
  const isPageVisible = ref(true)

  // Getters
  const totalAssets = computed(() => overview.value?.totalAssets ?? 0)
  const cashBalance = computed(() => overview.value?.cashBalance ?? 0)
  const holdingsValue = computed(() => overview.value?.holdingsValue ?? 0)
  const totalProfit = computed(() => overview.value?.totalProfit ?? 0)
  const profitRate = computed(() => overview.value?.profitRate ?? 0)

  // ==================== 实时收益计算 (O6-006B) ====================

  // 持仓股票代码列表（用于WebSocket订阅）
  const holdingSymbols = computed(() => holdings.value.map((h) => h.stockCode))

  // 带实时价格的持仓列表
  const holdingsWithRealtime = computed(() => {
    return holdings.value.map((holding) => {
      const realtimePrice = realtimePrices.value.get(holding.stockCode)
      if (realtimePrice) {
        const currentPrice = realtimePrice
        const marketValue = currentPrice * holding.quantity
        const costValue = holding.avgCost * holding.quantity
        const profit = marketValue - costValue
        const profitRate = (profit / costValue) * 100

        return {
          ...holding,
          currentPrice,
          marketValue,
          profit,
          profitRate,
        }
      }
      return holding
    })
  })

  // 实时持仓总市值
  const realtimeHoldingsValue = computed(() => {
    return holdingsWithRealtime.value.reduce((sum, h) => sum + h.marketValue, 0)
  })

  // 实时总收益
  const realtimeTotalProfit = computed(() => {
    return holdingsWithRealtime.value.reduce((sum, h) => sum + h.profit, 0)
  })

  // 实时总收益率
  const realtimeProfitRate = computed(() => {
    const totalCost = holdings.value.reduce((sum, h) => sum + h.avgCost * h.quantity, 0)
    if (totalCost === 0) return 0
    return (realtimeTotalProfit.value / totalCost) * 100
  })

  // Actions
  async function fetchOverview(forceRefresh = false): Promise<boolean> {
    if (!forceRefresh) {
      const cached = cache.get('trading:overview')
      if (cached) {
        overview.value = cached
        return true
      }
    }

    loading.value = true
    try {
      const data = await tradingApi.getPortfolioOverview()
      overview.value = data
      const ttl = cache.getTTL(CACHE_TTL.USER_INFO)
      cache.set('trading:overview', data, ttl)
      return true
    } catch (error) {
      console.error('Fetch overview error:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  async function fetchHoldings(forceRefresh = false): Promise<boolean> {
    if (!forceRefresh) {
      const cached = cache.get('trading:holdings')
      if (cached) {
        holdings.value = cached
        return true
      }
    }

    loading.value = true
    try {
      const data = await tradingApi.getHoldings()
      holdings.value = data
      const ttl = cache.getTTL(CACHE_TTL.HOLDINGS)
      cache.set('trading:holdings', data, ttl)
      return true
    } catch (error) {
      console.error('Fetch holdings error:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  async function fetchTrades(params?: Parameters<typeof tradingApi.getTrades>[0]): Promise<boolean> {
    loading.value = true
    try {
      const data = await tradingApi.getTrades(params)
      trades.value = data.list
      return true
    } catch (error) {
      console.error('Fetch trades error:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  async function fetchProfitStats(): Promise<boolean> {
    try {
      const data = await tradingApi.getProfitStats()
      profitStats.value = data
      return true
    } catch (error) {
      console.error('Fetch profit stats error:', error)
      return false
    }
  }

  async function buy(data: Parameters<typeof tradingApi.buy>[0]): Promise<boolean> {
    loading.value = true
    try {
      await tradingApi.buy(data)
      // 清除相关缓存
      cache.remove('trading:overview')
      cache.remove('trading:holdings')
      cache.clearByPattern('market:quotes')
      uni.showToast({ title: '买入成功', icon: 'success' })
      return true
    } catch (error) {
      console.error('Buy error:', error)
      uni.showToast({ title: '买入失败', icon: 'none' })
      return false
    } finally {
      loading.value = false
    }
  }

  async function sell(data: Parameters<typeof tradingApi.sell>[0]): Promise<boolean> {
    loading.value = true
    try {
      await tradingApi.sell(data)
      // 清除相关缓存
      cache.remove('trading:overview')
      cache.remove('trading:holdings')
      cache.clearByPattern('market:quotes')
      uni.showToast({ title: '卖出成功', icon: 'success' })
      return true
    } catch (error) {
      console.error('Sell error:', error)
      uni.showToast({ title: '卖出失败', icon: 'none' })
      return false
    } finally {
      loading.value = false
    }
  }

  // 刷新所有交易数据
  async function refreshAll(): Promise<void> {
    await Promise.all([
      fetchOverview(true),
      fetchHoldings(true),
      fetchTrades(),
    ])
  }

  // ==================== 实时数据管理 (O6-006, O6-006B) ====================

  /**
   * 合并实时价格数据
   * @param updates 实时行情更新
   */
  function mergeRealtimePrices(updates: QuoteUpdate[]): void {
    updates.forEach((update) => {
      realtimePrices.value.set(update.symbol, update.current)
    })
  }

  /**
   * 获取持仓股票代码列表（用于WebSocket订阅）
   */
  function getHoldingSymbols(): string[] {
    return holdings.value.map((h) => h.stockCode)
  }

  // ==================== 定期刷新 (O6-009) ====================

  /**
   * 启动定期刷新（每分钟刷新一次收益数据）
   */
  function startPeriodicRefresh(): void {
    // 先停止之前的定时器
    stopPeriodicRefresh()

    // 立即刷新一次
    refreshProfitData()

    // 每分钟刷新一次
    refreshTimer.value = setInterval(() => {
      if (isPageVisible.value) {
        refreshProfitData()
      }
    }, 60000) as unknown as number
  }

  /**
   * 停止定期刷新
   */
  function stopPeriodicRefresh(): void {
    if (refreshTimer.value) {
      clearInterval(refreshTimer.value)
      refreshTimer.value = null
    }
  }

  /**
   * 刷新收益数据
   */
  async function refreshProfitData(): Promise<void> {
    try {
      // 获取最新的收益统计
      await fetchProfitStats()
      // 刷新持仓数据（获取最新成本等）
      await fetchHoldings(true)
    } catch (error) {
      console.error('Refresh profit data error:', error)
    }
  }

  /**
   * 设置页面可见性
   * @param visible 是否可见
   */
  function setPageVisibility(visible: boolean): void {
    isPageVisible.value = visible
    if (visible && refreshTimer.value) {
      // 页面重新可见时立即刷新一次
      refreshProfitData()
    }
  }

  /**
   * 清空实时价格数据
   */
  function clearRealtimePrices(): void {
    realtimePrices.value.clear()
  }

  return {
    // State
    overview,
    holdings,
    trades,
    profitStats,
    loading,
    realtimePrices,
    // Getters
    totalAssets,
    cashBalance,
    holdingsValue,
    totalProfit,
    profitRate,
    holdingSymbols,
    holdingsWithRealtime,
    realtimeHoldingsValue,
    realtimeTotalProfit,
    realtimeProfitRate,
    // Actions
    fetchOverview,
    fetchHoldings,
    fetchTrades,
    fetchProfitStats,
    buy,
    sell,
    refreshAll,
    mergeRealtimePrices,
    getHoldingSymbols,
    startPeriodicRefresh,
    stopPeriodicRefresh,
    setPageVisibility,
    clearRealtimePrices,
  }
})
