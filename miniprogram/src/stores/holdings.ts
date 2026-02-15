// 持仓收益实时计算 Store - O6-006 + O6-006B
// 合并实时行情(WebSocket)和 Backend 收益数据，实时计算持仓收益

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useMarketStore } from './market'
import { useTradingStore } from './trading'
import type { Holding } from '@/types/trading'

// Backend 持仓数据结构（Mock 数据格式参考）
interface BackendHolding {
  id: string
  stockCode: string
  stockName: string
  quantity: number          // 持仓数量
  avgCost: number           // 平均成本价
  accountId?: string
  updatedAt: string
}

// Backend 收益数据
interface BackendPerformance {
  holdings: BackendHolding[]
  totalReturn: number       // 总收益
  totalReturnRate: number   // 总收益率
  cashBalance: number       // 现金余额
}

// 合并后的持仓数据（含实时行情）
export interface RealtimeHolding extends Holding {
  // 实时行情字段（WebSocket 更新）
  realtimePrice: number
  realtimeChange: number
  realtimeChangeRate: number
  lastUpdateTime: string

  // 计算字段（基于实时价格）
  realtimeMarketValue: number   // 实时市值
  realtimeProfit: number        // 实时收益
  realtimeProfitRate: number    // 实时收益率
}

// Mock Backend 数据（用于开发和测试）
const MOCK_BACKEND_DATA: Record<string, BackendPerformance> = {
  'account-1': {
    holdings: [
      { id: 'h1', stockCode: '000001.SZ', stockName: '平安银行', quantity: 1000, avgCost: 12.20, updatedAt: new Date().toISOString() },
      { id: 'h2', stockCode: '600000.SH', stockName: '浦发银行', quantity: 500, avgCost: 8.50, updatedAt: new Date().toISOString() },
      { id: 'h3', stockCode: '000858.SZ', stockName: '五粮液', quantity: 200, avgCost: 165.00, updatedAt: new Date().toISOString() },
    ],
    totalReturn: 25800.50,
    totalReturnRate: 8.5,
    cashBalance: 50000.00,
  },
  'default': {
    holdings: [],
    totalReturn: 0,
    totalReturnRate: 0,
    cashBalance: 100000.00,
  }
}

export const useHoldingsStore = defineStore('holdings', () => {
  const marketStore = useMarketStore()
  const tradingStore = useTradingStore()

  // State
  const backendData = ref<BackendPerformance | null>(null)
  const loading = ref(false)
  const lastFetchTime = ref<number>(0)
  const error = ref<string | null>(null)

  // 刷新间隔（毫秒）- 每分钟刷新 Backend 数据
  const REFRESH_INTERVAL = 60000

  // Getters - 合并后的持仓数据（O6-006）
  const mergedHoldings = computed<RealtimeHolding[]>(() => {
    const backendHoldings = backendData.value?.holdings || tradingStore.holdings || []

    return backendHoldings.map((h): RealtimeHolding => {
      // 从 WebSocket 实时数据获取最新价格
      const realtimeQuote = marketStore.getRealtimeQuote(h.stockCode)

      // 当前价格优先级：WebSocket 实时 > Backend 缓存
      const currentPrice = realtimeQuote?.price || (h as any).currentPrice || h.avgCost
      const change = realtimeQuote?.change || 0
      const changeRate = realtimeQuote?.changeRate || 0

      // 计算实时数据（O6-006B）
      const marketValue = currentPrice * h.quantity                          // 市值 = 现价 × 数量
      const cost = h.avgCost * h.quantity                                     // 成本 = 成本价 × 数量
      const profit = marketValue - cost                                       // 收益 = 市值 - 成本
      const profitRate = cost > 0 ? (profit / cost) * 100 : 0                // 收益率 = (收益 / 成本) × 100

      return {
        // 基础数据
        id: (h as any).id || `${h.stockCode}-${Date.now()}`,
        stockCode: h.stockCode,
        stockName: h.stockName,
        quantity: h.quantity,
        avgCost: h.avgCost,
        currentPrice,
        marketValue,
        profit,
        profitRate,
        accountId: (h as any).accountId,
        updatedAt: (h as any).updatedAt || new Date().toISOString(),

        // 实时数据
        realtimePrice: currentPrice,
        realtimeChange: change,
        realtimeChangeRate: changeRate,
        lastUpdateTime: realtimeQuote?.updateTime || new Date().toISOString(),

        // 计算字段
        realtimeMarketValue: marketValue,
        realtimeProfit: profit,
        realtimeProfitRate: profitRate,
      }
    })
  })

  // 实时总收益统计
  const realtimeStats = computed(() => {
    const holdings = mergedHoldings.value

    if (holdings.length === 0) {
      return {
        totalMarketValue: 0,
        totalCost: 0,
        totalProfit: backendData.value?.totalReturn || 0,
        totalProfitRate: backendData.value?.totalReturnRate || 0,
        cashBalance: backendData.value?.cashBalance || tradingStore.cashBalance || 0,
        totalAssets: backendData.value?.cashBalance || tradingStore.cashBalance || 0,
        holdingCount: 0,
      }
    }

    const totalMarketValue = holdings.reduce((sum, h) => sum + h.realtimeMarketValue, 0)
    const totalCost = holdings.reduce((sum, h) => sum + (h.avgCost * h.quantity), 0)
    const totalProfit = totalMarketValue - totalCost
    const totalProfitRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0
    const cashBalance = backendData.value?.cashBalance || tradingStore.cashBalance || 0
    const totalAssets = totalMarketValue + cashBalance

    return {
      totalMarketValue,
      totalCost,
      totalProfit,
      totalProfitRate,
      cashBalance,
      totalAssets,
      holdingCount: holdings.length,
    }
  })

  // 按收益率排序的持仓
  const holdingsByProfitRate = computed(() => {
    return [...mergedHoldings.value].sort((a, b) => b.realtimeProfitRate - a.realtimeProfitRate)
  })

  // 盈利持仓
  const profitableHoldings = computed(() => {
    return mergedHoldings.value.filter(h => h.realtimeProfit > 0)
  })

  // 亏损持仓
  const lossHoldings = computed(() => {
    return mergedHoldings.value.filter(h => h.realtimeProfit < 0)
  })

  // Actions

  /**
   * 获取 Backend 收益数据（O6-009 定期刷新）
   * @param accountId AI 账户 ID
   * @param forceRefresh 强制刷新
   */
  async function fetchBackendPerformance(accountId?: string, forceRefresh = false): Promise<boolean> {
    // 检查缓存
    if (!forceRefresh) {
      const now = Date.now()
      if (now - lastFetchTime.value < REFRESH_INTERVAL && backendData.value) {
        console.log('[HoldingsStore] Using cached backend data')
        return true
      }
    }

    loading.value = true
    error.value = null

    try {
      // TODO: 替换为真实 API 调用
      // const response = await api.get(`/api/ai-accounts/${accountId}/performance`)
      // backendData.value = response.data

      // Mock 数据（等待 Backend O6-003 完成）
      await new Promise(resolve => setTimeout(resolve, 300)) // 模拟网络延迟
      backendData.value = MOCK_BACKEND_DATA[accountId || 'default'] || MOCK_BACKEND_DATA['default']

      lastFetchTime.value = Date.now()
      console.log('[HoldingsStore] Backend data fetched:', backendData.value)
      return true
    } catch (err) {
      console.error('[HoldingsStore] Fetch error:', err)
      error.value = err instanceof Error ? err.message : '获取数据失败'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 刷新所有数据
   * 同时刷新 Backend 数据和 WebSocket 连接
   */
  async function refreshAll(accountId?: string): Promise<boolean> {
    const results = await Promise.all([
      fetchBackendPerformance(accountId, true),
      tradingStore.fetchHoldings(true),
    ])
    return results.every(r => r)
  }

  /**
   * 获取单只持仓的实时数据
   */
  function getHoldingRealtime(stockCode: string): RealtimeHolding | undefined {
    return mergedHoldings.value.find(h => h.stockCode === stockCode)
  }

  /**
   * 清空数据
   */
  function clearData(): void {
    backendData.value = null
    lastFetchTime.value = 0
    error.value = null
  }

  // 监听 WebSocket 数据变化，自动重新计算
  watch(
    () => marketStore.realtimeQuotes,
    () => {
      // 实时数据变化时，mergedHoldings 会自动重新计算
      console.log('[HoldingsStore] Realtime quotes updated, recalculating...')
    },
    { deep: true }
  )

  return {
    // State
    backendData,
    loading,
    error,
    lastFetchTime,

    // Getters
    mergedHoldings,
    realtimeStats,
    holdingsByProfitRate,
    profitableHoldings,
    lossHoldings,

    // Actions
    fetchBackendPerformance,
    refreshAll,
    getHoldingRealtime,
    clearData,
  }
})
