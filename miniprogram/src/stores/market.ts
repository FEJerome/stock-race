// 市场数据状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { marketApi } from '@/api/market'
import type { StockQuote, MarketIndex, MarketStatus, RankingUser, CompetitionStats } from '@/types/market'
import type { QuoteUpdate } from '@/services/websocket'
import { cache } from '@/utils/cache'
import { CACHE_TTL } from '@/utils/constants'

export const useMarketStore = defineStore('market', () => {
  // State
  const marketStatus = ref<MarketStatus | null>(null)
  const indices = ref<MarketIndex[]>([])
  const quotes = ref<StockQuote[]>([])
  const ranking = ref<RankingUser[]>([])
  const competitionStats = ref<CompetitionStats | null>(null)
  const loading = ref(false)
  const lastUpdateTime = ref<number>(0)
  const realtimeQuotes = ref<Map<string, QuoteUpdate>>(new Map())

  // Getters
  const isMarketOpen = computed(() => marketStatus.value?.isOpen ?? false)

  // 获取合并后的行情数据（HTTP数据 + WebSocket实时数据）
  const mergedQuotes = computed<StockQuote[]>(() => {
    return quotes.value.map((quote) => {
      const realtime = realtimeQuotes.value.get(quote.code)
      if (realtime) {
        return {
          ...quote,
          price: realtime.current,
          change: realtime.change,
          changePercent: realtime.changePercent,
          volume: realtime.volume,
          updateTime: realtime.timestamp,
        }
      }
      return quote
    })
  })

  // Actions
  async function fetchMarketStatus(): Promise<boolean> {
    try {
      const status = await marketApi.getMarketStatus()
      marketStatus.value = status
      return true
    } catch (error) {
      console.error('Fetch market status error:', error)
      return false
    }
  }

  async function fetchIndices(): Promise<boolean> {
    try {
      const data = await marketApi.getMarketIndices()
      indices.value = data
      return true
    } catch (error) {
      console.error('Fetch indices error:', error)
      return false
    }
  }

  async function fetchQuotes(forceRefresh = false): Promise<boolean> {
    // 检查缓存
    if (!forceRefresh) {
      const cached = cache.get('market:quotes')
      if (cached) {
        quotes.value = cached
        return true
      }
    }

    loading.value = true
    try {
      const data = await marketApi.getStockQuotes()
      quotes.value = data
      // 缓存数据
      const ttl = cache.getTTL(CACHE_TTL.MARKET_DATA, CACHE_TTL.MARKET_DATA_OFFLINE)
      cache.set('market:quotes', data, ttl)
      lastUpdateTime.value = Date.now()
      return true
    } catch (error) {
      console.error('Fetch quotes error:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  async function fetchRanking(page = 1): Promise<boolean> {
    try {
      const data = await marketApi.getRanking(page)
      if (page === 1) {
        ranking.value = data
      } else {
        ranking.value.push(...data)
      }
      return true
    } catch (error) {
      console.error('Fetch ranking error:', error)
      return false
    }
  }

  async function fetchCompetitionStats(): Promise<boolean> {
    try {
      const data = await marketApi.getCompetitionStats()
      competitionStats.value = data
      return true
    } catch (error) {
      console.error('Fetch competition stats error:', error)
      return false
    }
  }

  // 刷新所有市场数据
  async function refreshAllMarketData(): Promise<void> {
    await Promise.all([
      fetchMarketStatus(),
      fetchIndices(),
      fetchQuotes(true),
    ])
  }

  // ==================== WebSocket实时数据合并 (O6-006) ====================

  /**
   * 合并实时行情数据
   * @param updates 实时行情更新
   */
  function mergeRealtimeQuotes(updates: QuoteUpdate[]): void {
    updates.forEach((update) => {
      realtimeQuotes.value.set(update.symbol, update)
    })
    lastUpdateTime.value = Date.now()
  }

  /**
   * 获取单只股票的实时价格
   * @param symbol 股票代码
   */
  function getRealtimePrice(symbol: string): number | null {
    const realtime = realtimeQuotes.value.get(symbol)
    return realtime?.current ?? null
  }

  /**
   * 清空实时数据缓存
   */
  function clearRealtimeQuotes(): void {
    realtimeQuotes.value.clear()
  }

  return {
    // State
    marketStatus,
    indices,
    quotes,
    ranking,
    competitionStats,
    loading,
    lastUpdateTime,
    realtimeQuotes,
    // Getters
    isMarketOpen,
    mergedQuotes,
    // Actions
    fetchMarketStatus,
    fetchIndices,
    fetchQuotes,
    fetchRanking,
    fetchCompetitionStats,
    refreshAllMarketData,
    mergeRealtimeQuotes,
    getRealtimePrice,
    clearRealtimeQuotes,
  }
})
