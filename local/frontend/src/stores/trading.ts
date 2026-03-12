/**
 * Trading Store - Pinia
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { tradingApi, type Trade, type Position, type TradeCreate } from '../api/trading'
import { getErrorMessage } from '../utils/error-handler'

export const useTradingStore = defineStore('trading', () => {
  // State
  const positions = ref<Position[]>([])
  const trades = ref<Trade[]>([])
  const loading = ref(false)
  const submitting = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const totalPositions = computed(() => positions.value.length)
  const totalTrades = computed(() => trades.value.length)

  const totalMarketValue = computed(() =>
    positions.value.reduce((sum, p) => sum + (p.market_value || 0), 0)
  )

  const totalUnrealizedPnl = computed(() =>
    positions.value.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0)
  )

  const todayTrades = computed(() => {
    const today = new Date().toDateString()
    return trades.value.filter(t => new Date(t.timestamp).toDateString() === today)
  })

  const recentTrades = computed(() => trades.value.slice(0, 20))

  // Actions
  async function fetchPositions(agentId: string) {
    loading.value = true
    error.value = null
    try {
      const response = await tradingApi.getPositions(agentId)
      positions.value = response.data.items
    } catch (err) {
      error.value = getErrorMessage(err, '获取持仓失败')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchTrades(agentId: string, limit = 50) {
    loading.value = true
    error.value = null
    try {
      const response = await tradingApi.getTrades(agentId, limit)
      trades.value = response.data.items
    } catch (err) {
      error.value = getErrorMessage(err, '获取交易历史失败')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function executeBuy(agentId: string, data: TradeCreate) {
    submitting.value = true
    error.value = null
    try {
      const response = await tradingApi.buy(agentId, data)
      // Refresh data after trade
      await Promise.all([
        fetchPositions(agentId),
        fetchTrades(agentId)
      ])
      return response.data
    } catch (err) {
      error.value = getErrorMessage(err, '买入失败')
      throw err
    } finally {
      submitting.value = false
    }
  }

  async function executeSell(agentId: string, data: TradeCreate) {
    submitting.value = true
    error.value = null
    try {
      const response = await tradingApi.sell(agentId, data)
      // Refresh data after trade
      await Promise.all([
        fetchPositions(agentId),
        fetchTrades(agentId)
      ])
      return response.data
    } catch (err) {
      error.value = getErrorMessage(err, '卖出失败')
      throw err
    } finally {
      submitting.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  function reset() {
    positions.value = []
    trades.value = []
    loading.value = false
    submitting.value = false
    error.value = null
  }

  return {
    // State
    positions,
    trades,
    loading,
    submitting,
    error,
    // Getters
    totalPositions,
    totalTrades,
    totalMarketValue,
    totalUnrealizedPnl,
    todayTrades,
    recentTrades,
    // Actions
    fetchPositions,
    fetchTrades,
    executeBuy,
    executeSell,
    clearError,
    reset,
  }
})
