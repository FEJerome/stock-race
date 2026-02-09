// 交易状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { tradingApi } from '@/api/trading'
import type { Holding, Trade, PortfolioOverview, ProfitStats } from '@/types/trading'
import { cache } from '@/utils/cache'
import { CACHE_TTL } from '@/utils/constants'

export const useTradingStore = defineStore('trading', () => {
  // State
  const overview = ref<PortfolioOverview | null>(null)
  const holdings = ref<Holding[]>([])
  const trades = ref<Trade[]>([])
  const profitStats = ref<ProfitStats | null>(null)
  const loading = ref(false)

  // Getters
  const totalAssets = computed(() => overview.value?.totalAssets ?? 0)
  const cashBalance = computed(() => overview.value?.cashBalance ?? 0)
  const holdingsValue = computed(() => overview.value?.holdingsValue ?? 0)
  const totalProfit = computed(() => overview.value?.totalProfit ?? 0)
  const profitRate = computed(() => overview.value?.profitRate ?? 0)

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

  return {
    overview,
    holdings,
    trades,
    profitStats,
    loading,
    totalAssets,
    cashBalance,
    holdingsValue,
    totalProfit,
    profitRate,
    fetchOverview,
    fetchHoldings,
    fetchTrades,
    fetchProfitStats,
    buy,
    sell,
    refreshAll,
  }
})
