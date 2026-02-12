// 市场数据状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { marketApi } from '@/api/market'
import type { StockQuote, MarketIndex, MarketStatus, RankingUser, CompetitionStats } from '@/types/market'
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

  // Getters
  const isMarketOpen = computed(() => marketStatus.value?.isOpen ?? false)

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

  return {
    marketStatus,
    indices,
    quotes,
    ranking,
    competitionStats,
    loading,
    lastUpdateTime,
    isMarketOpen,
    fetchMarketStatus,
    fetchIndices,
    fetchQuotes,
    fetchRanking,
    fetchCompetitionStats,
    refreshAllMarketData,
  }
})
