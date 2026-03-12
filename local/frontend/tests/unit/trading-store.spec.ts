/**
 * Trading Store Unit Tests
 * 测试交易 Store 的核心逻辑
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTradingStore } from '../../src/stores/trading'
import { tradingApi } from '../../src/api/trading'

// Mock API
vi.mock('../../src/api/trading', () => ({
  tradingApi: {
    getPositions: vi.fn(),
    getTrades: vi.fn(),
    buy: vi.fn(),
    sell: vi.fn(),
  },
}))

describe('Trading Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('State', () => {
    it('应该有正确的初始状态', () => {
      const store = useTradingStore()

      expect(store.positions).toEqual([])
      expect(store.trades).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.submitting).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  describe('Getters', () => {
    it('totalPositions 应返回持仓数量', () => {
      const store = useTradingStore()
      store.positions = [
        { symbol: '600000.SH', quantity: 100, avg_cost: 10 },
        { symbol: '000001.SZ', quantity: 200, avg_cost: 20 },
      ] as any

      expect(store.totalPositions).toBe(2)
    })

    it('totalTrades 应返回交易数量', () => {
      const store = useTradingStore()
      store.trades = [
        { id: '1', symbol: '600000.SH', action: 'buy' },
        { id: '2', symbol: '000001.SZ', action: 'sell' },
      ] as any

      expect(store.totalTrades).toBe(2)
    })

    it('totalMarketValue 应计算总市值', () => {
      const store = useTradingStore()
      store.positions = [
        { symbol: '600000.SH', market_value: 10000 },
        { symbol: '000001.SZ', market_value: 5000 },
      ] as any

      expect(store.totalMarketValue).toBe(15000)
    })

    it('totalUnrealizedPnl 应计算总未实现盈亏', () => {
      const store = useTradingStore()
      store.positions = [
        { symbol: '600000.SH', unrealized_pnl: 500 },
        { symbol: '000001.SZ', unrealized_pnl: -200 },
      ] as any

      expect(store.totalUnrealizedPnl).toBe(300)
    })

    it('recentTrades 应返回最近20条交易', () => {
      const store = useTradingStore()
      store.trades = Array.from({ length: 30 }, (_, i) => ({
        id: `trade-${i}`,
        symbol: `60000${i}.SH`,
        action: 'buy',
      })) as any

      expect(store.recentTrades.length).toBe(20)
      expect(store.recentTrades[0].id).toBe('trade-0')
      expect(store.recentTrades[19].id).toBe('trade-19')
    })

    it('todayTrades 应返回今日交易', () => {
      const store = useTradingStore()
      const today = new Date().toISOString()
      const yesterday = new Date(Date.now() - 86400000).toISOString()

      store.trades = [
        { id: '1', timestamp: today },
        { id: '2', timestamp: today },
        { id: '3', timestamp: yesterday },
      ] as any

      expect(store.todayTrades.length).toBe(2)
    })
  })

  describe('Actions', () => {
    it('fetchPositions 应获取持仓数据', async () => {
      const store = useTradingStore()
      const mockPositions = [
        { symbol: '600000.SH', quantity: 100, avg_cost: 10.5 },
      ]

      vi.mocked(tradingApi.getPositions).mockResolvedValue({
        data: { items: mockPositions, total: 1 },
      } as any)

      await store.fetchPositions('agent-1')

      expect(store.positions).toEqual(mockPositions)
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('fetchPositions 应处理错误', async () => {
      const store = useTradingStore()
      const errorMessage = '获取持仓失败'

      vi.mocked(tradingApi.getPositions).mockRejectedValue(
        new Error('Network error')
      )

      await expect(store.fetchPositions('agent-1')).rejects.toThrow()
      expect(store.error).toBe(errorMessage)
      expect(store.loading).toBe(false)
    })

    it('fetchTrades 应获取交易历史', async () => {
      const store = useTradingStore()
      const mockTrades = [{ id: '1', symbol: '600000.SH', action: 'buy' }]

      vi.mocked(tradingApi.getTrades).mockResolvedValue({
        data: { items: mockTrades, total: 1 },
      } as any)

      await store.fetchTrades('agent-1')

      expect(store.trades).toEqual(mockTrades)
      expect(store.loading).toBe(false)
    })

    it('executeBuy 应执行买入并刷新数据', async () => {
      const store = useTradingStore()
      const mockTrade = { id: 'trade-1', symbol: '600000.SH', action: 'buy' }

      vi.mocked(tradingApi.buy).mockResolvedValue({
        data: mockTrade,
      } as any)
      vi.mocked(tradingApi.getPositions).mockResolvedValue({
        data: { items: [], total: 0 },
      } as any)
      vi.mocked(tradingApi.getTrades).mockResolvedValue({
        data: { items: [mockTrade], total: 1 },
      } as any)

      const result = await store.executeBuy('agent-1', {
        symbol: '600000.SH',
        action: 'buy',
        quantity: 100,
        price: 10.5,
      })

      expect(result).toEqual(mockTrade)
      expect(tradingApi.buy).toHaveBeenCalled()
      expect(tradingApi.getPositions).toHaveBeenCalled()
      expect(tradingApi.getTrades).toHaveBeenCalled()
      expect(store.submitting).toBe(false)
    })

    it('executeSell 应执行卖出并刷新数据', async () => {
      const store = useTradingStore()
      const mockTrade = { id: 'trade-2', symbol: '600000.SH', action: 'sell' }

      vi.mocked(tradingApi.sell).mockResolvedValue({
        data: mockTrade,
      } as any)
      vi.mocked(tradingApi.getPositions).mockResolvedValue({
        data: { items: [], total: 0 },
      } as any)
      vi.mocked(tradingApi.getTrades).mockResolvedValue({
        data: { items: [mockTrade], total: 1 },
      } as any)

      const result = await store.executeSell('agent-1', {
        symbol: '600000.SH',
        action: 'sell',
        quantity: 100,
        price: 11.0,
      })

      expect(result).toEqual(mockTrade)
      expect(tradingApi.sell).toHaveBeenCalled()
      expect(store.submitting).toBe(false)
    })

    it('clearError 应清空错误', () => {
      const store = useTradingStore()
      store.error = 'Some error'

      store.clearError()

      expect(store.error).toBeNull()
    })

    it('reset 应重置所有状态', () => {
      const store = useTradingStore()
      store.positions = [{ symbol: '600000.SH' }] as any
      store.trades = [{ id: '1' }] as any
      store.loading = true
      store.submitting = true
      store.error = 'error'

      store.reset()

      expect(store.positions).toEqual([])
      expect(store.trades).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.submitting).toBe(false)
      expect(store.error).toBeNull()
    })
  })
})
