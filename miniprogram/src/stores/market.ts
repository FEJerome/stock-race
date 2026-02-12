// 市场数据状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { marketApi } from '@/api/market'
import type { StockQuote, MarketIndex, MarketStatus, RankingUser, CompetitionStats } from '@/types/market'
import { cache } from '@/utils/cache'
import { CACHE_TTL } from '@/utils/constants'
import { websocketService, WebSocketStatus } from '@/services/websocket'

export const useMarketStore = defineStore('market', () => {
  // State
  const marketStatus = ref<MarketStatus | null>(null)
  const indices = ref<MarketIndex[]>([])
  const quotes = ref<StockQuote[]>([])
  const ranking = ref<RankingUser[]>([])
  const competitionStats = ref<CompetitionStats | null>(null)
  const loading = ref(false)
  const lastUpdateTime = ref<number>(0)

  // WebSocket 状态 (O6-005)
  const wsStatus = ref<WebSocketStatus>(WebSocketStatus.DISCONNECTED)
  const wsError = ref<string | null>(null)
  const subscribedSymbols = ref<string[]>([])
  const realtimeQuotes = ref<Map<string, StockQuote>>(new Map())

  // Getters
  const isMarketOpen = computed(() => marketStatus.value?.isOpen ?? false)

  // WebSocket 状态相关 Getters (O6-005)
  const isWebSocketConnected = computed(() => wsStatus.value === WebSocketStatus.CONNECTED)
  const isWebSocketConnecting = computed(() => wsStatus.value === WebSocketStatus.CONNECTING)
  const isWebSocketReconnecting = computed(() => wsStatus.value === WebSocketStatus.RECONNECTING)
  const hasWebSocketError = computed(() => wsStatus.value === WebSocketStatus.ERROR)

  // 获取实时行情（合并 WebSocket 实时数据）
  const quotesWithRealtime = computed(() => {
    return quotes.value.map(quote => {
      const realtimeQuote = realtimeQuotes.value.get(quote.code)
      if (realtimeQuote) {
        return {
          ...quote,
          price: realtimeQuote.price,
          change: realtimeQuote.change,
          changeRate: realtimeQuote.changeRate,
          volume: realtimeQuote.volume,
          updateTime: realtimeQuote.updateTime,
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

  // ============ WebSocket 相关 Actions (O6-005) ============

  // 初始化 WebSocket 连接
  async function initWebSocket(): Promise<boolean> {
    // 注册状态变更处理器
    websocketService.onMessage('statusChange', (data) => {
      wsStatus.value = data.status
      if (data.error) {
        wsError.value = data.error
      } else {
        wsError.value = null
      }
    })

    // 注册行情更新处理器
    websocketService.onMessage('quoteUpdate', (data) => {
      if (data.code && data.price !== undefined) {
        // 更新实时行情 Map
        const existingQuote = realtimeQuotes.value.get(data.code)
        realtimeQuotes.value.set(data.code, {
          ...existingQuote,
          code: data.code,
          name: data.name,
          price: data.price,
          change: data.change,
          changeRate: data.changeRate,
          volume: data.volume,
          updateTime: data.timestamp || new Date().toISOString(),
          // 保持原有字段
          preClose: existingQuote?.preClose ?? data.preClose ?? 0,
          open: existingQuote?.open ?? data.open ?? 0,
          high: existingQuote?.high ?? data.high ?? 0,
          low: existingQuote?.low ?? data.low ?? 0,
          amount: existingQuote?.amount ?? data.amount ?? 0,
        } as StockQuote)
      }
    })

    // 注册错误处理器
    websocketService.onMessage('error', (data) => {
      wsError.value = data.error
      console.error('[MarketStore] WebSocket error:', data.error)
    })

    // 建立连接
    const connected = await websocketService.connect()
    if (connected) {
      console.log('[MarketStore] WebSocket connected successfully')
    }
    return connected
  }

  // 断开 WebSocket 连接
  function disconnectWebSocket(): void {
    websocketService.disconnect()
    wsStatus.value = WebSocketStatus.DISCONNECTED
    subscribedSymbols.value = []
  }

  // 订阅股票行情
  function subscribeQuotes(symbols: string[]): void {
    if (!symbols || symbols.length === 0) return

    websocketService.subscribe(symbols)

    // 更新已订阅列表
    symbols.forEach(symbol => {
      if (!subscribedSymbols.value.includes(symbol)) {
        subscribedSymbols.value.push(symbol)
      }
    })
  }

  // 取消订阅股票行情
  function unsubscribeQuotes(symbols: string[]): void {
    if (!symbols || symbols.length === 0) return

    websocketService.unsubscribe(symbols)

    // 更新已订阅列表
    subscribedSymbols.value = subscribedSymbols.value.filter(s => !symbols.includes(s))
  }

  // 更新订阅列表（根据持仓动态调整）- O6-005B
  function updateSubscriptions(newSymbols: string[]): void {
    const currentSymbols = new Set(subscribedSymbols.value)
    const targetSymbols = new Set(newSymbols)

    // 需要取消订阅的
    const toUnsubscribe = Array.from(currentSymbols).filter(s => !targetSymbols.has(s))
    // 需要新订阅的
    const toSubscribe = Array.from(targetSymbols).filter(s => !currentSymbols.has(s))

    if (toUnsubscribe.length > 0) {
      unsubscribeQuotes(toUnsubscribe)
    }
    if (toSubscribe.length > 0) {
      subscribeQuotes(toSubscribe)
    }
  }

  // 清空实时行情数据
  function clearRealtimeQuotes(): void {
    realtimeQuotes.value.clear()
  }

  // 获取单只股票的实时行情
  function getRealtimeQuote(code: string): StockQuote | undefined {
    return realtimeQuotes.value.get(code)
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
    // WebSocket State (O6-005)
    wsStatus,
    wsError,
    subscribedSymbols,
    realtimeQuotes,
    // Getters
    isMarketOpen,
    isWebSocketConnected,
    isWebSocketConnecting,
    isWebSocketReconnecting,
    hasWebSocketError,
    quotesWithRealtime,
    // Actions
    fetchMarketStatus,
    fetchIndices,
    fetchQuotes,
    fetchRanking,
    fetchCompetitionStats,
    refreshAllMarketData,
    // WebSocket Actions (O6-005)
    initWebSocket,
    disconnectWebSocket,
    subscribeQuotes,
    unsubscribeQuotes,
    updateSubscriptions,
    clearRealtimeQuotes,
    getRealtimeQuote,
  }
})
