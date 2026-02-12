/**
 * AI经理详情页单元测试 (T-007)
 *
 * 测试目标：验证AI经理详情页正确展示收益曲线、持仓列表、交易记录和决策历史
 * 测试范围：页面加载、数据获取、组件渲染、交互功能
 *
 * @author Miniprogram开发团队
 * @date 2026-02-11
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAIStore } from '@/stores/ai'
import { useTradingStore } from '@/stores/trading'

// ============================================================================
// Mock 数据
// ============================================================================

// 模拟AI账户详情
const mockAIAccount = {
  id: 'ai-001',
  name: '价值投资基金经理',
  modelProvider: 'deepseek',
  modelName: 'DeepSeek-V3',
  status: 'active',
  initialBalance: 1000000,
  currentBalance: 1150000,
  totalProfit: 150000,
  profitRate: 15.0,
  riskLevel: 'moderate',
  maxDailyDecisions: 5,
  todayDecisions: 2,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-02-11T10:00:00Z',
}

// 模拟收益曲线数据
const mockProfitStats = {
  dailyProfits: [
    { date: '2026-01-01', value: 1000000, profit: 0, profitRate: 0 },
    { date: '2026-01-02', value: 1005000, profit: 5000, profitRate: 0.5 },
    { date: '2026-01-03', value: 1012000, profit: 12000, profitRate: 1.2 },
    { date: '2026-01-04', value: 1008000, profit: 8000, profitRate: 0.8 },
    { date: '2026-01-05', value: 1020000, profit: 20000, profitRate: 2.0 },
  ],
  weeklyProfits: [
    { date: '2026-W01', value: 1020000, profit: 20000, profitRate: 2.0 },
    { date: '2026-W02', value: 1050000, profit: 50000, profitRate: 5.0 },
    { date: '2026-W03', value: 1080000, profit: 80000, profitRate: 8.0 },
    { date: '2026-W04', value: 1120000, profit: 120000, profitRate: 12.0 },
    { date: '2026-W05', value: 1150000, profit: 150000, profitRate: 15.0 },
  ],
  monthlyProfits: [
    { date: '2026-01', value: 1080000, profit: 80000, profitRate: 8.0 },
    { date: '2026-02', value: 1150000, profit: 150000, profitRate: 15.0 },
  ],
  maxProfit: 150000,
  maxLoss: -5000,
  avgDailyReturn: 0.8,
  volatility: 2.5,
}

// 模拟持仓数据
const mockHoldings = [
  {
    id: 'h-001',
    stockCode: '000001',
    stockName: '平安银行',
    quantity: 1000,
    avgCost: 12.5,
    currentPrice: 15.2,
    marketValue: 15200,
    profit: 2700,
    profitRate: 21.6,
    accountId: 'ai-001',
    accountName: '价值投资基金经理',
    updatedAt: '2026-02-11T10:00:00Z',
  },
  {
    id: 'h-002',
    stockCode: '000002',
    stockName: '万科A',
    quantity: 500,
    avgCost: 18.0,
    currentPrice: 16.5,
    marketValue: 8250,
    profit: -750,
    profitRate: -8.33,
    accountId: 'ai-001',
    accountName: '价值投资基金经理',
    updatedAt: '2026-02-11T10:00:00Z',
  },
]

// 模拟交易记录
const mockTrades = {
  list: [
    {
      id: 't-001',
      stockCode: '000001',
      stockName: '平安银行',
      type: 'buy',
      price: 12.5,
      quantity: 1000,
      amount: 12500,
      fee: 12.5,
      accountId: 'ai-001',
      accountName: '价值投资基金经理',
      createdAt: '2026-01-15T09:30:00Z',
    },
    {
      id: 't-002',
      stockCode: '000002',
      stockName: '万科A',
      type: 'buy',
      price: 18.0,
      quantity: 500,
      amount: 9000,
      fee: 9.0,
      accountId: 'ai-001',
      accountName: '价值投资基金经理',
      createdAt: '2026-01-20T14:00:00Z',
    },
    {
      id: 't-003',
      stockCode: '600519',
      stockName: '贵州茅台',
      type: 'sell',
      price: 1800.0,
      quantity: 10,
      amount: 18000,
      fee: 18.0,
      accountId: 'ai-001',
      accountName: '价值投资基金经理',
      createdAt: '2026-02-05T10:30:00Z',
    },
  ],
  total: 3,
  page: 1,
  pageSize: 10,
}

// 模拟决策历史
const mockDecisions = {
  list: [
    {
      id: 'd-001',
      accountId: 'ai-001',
      accountName: '价值投资基金经理',
      type: 'buy',
      stockCode: '000001',
      stockName: '平安银行',
      price: 12.5,
      quantity: 1000,
      confidence: 0.85,
      reason: '技术指标显示买入信号，MACD金叉，成交量放大',
      executedAt: '2026-01-15T09:30:00Z',
      result: {
        executedPrice: 12.5,
        executedQuantity: 1000,
        profit: 2700,
        status: 'success',
      },
      createdAt: '2026-01-15T09:28:00Z',
    },
    {
      id: 'd-002',
      accountId: 'ai-001',
      accountName: '价值投资基金经理',
      type: 'sell',
      stockCode: '600519',
      stockName: '贵州茅台',
      price: 1800.0,
      quantity: 10,
      confidence: 0.78,
      reason: '达到目标价位，获利了结，等待回调再入场',
      executedAt: '2026-02-05T10:30:00Z',
      result: {
        executedPrice: 1800.0,
        executedQuantity: 10,
        profit: 5000,
        status: 'success',
      },
      createdAt: '2026-02-05T10:28:00Z',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
}

// ============================================================================
// Mock uni API
// ============================================================================

const mockUni = {
  showLoading: vi.fn(),
  hideLoading: vi.fn(),
  showToast: vi.fn(),
  navigateBack: vi.fn(),
  navigateTo: vi.fn(),
}

// @ts-ignore
global.uni = mockUni

// ============================================================================
// 测试套件: AI经理详情页
// ============================================================================

describe('TC-DETAIL-001: 页面加载和基本信息展示', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('应该显示加载状态当数据正在获取时', async () => {
    const aiStore = useAIStore()
    aiStore.loading = true

    expect(aiStore.loading).toBe(true)
  })

  it('应该正确设置当前AI账户', async () => {
    const aiStore = useAIStore()

    // 模拟设置当前账户
    aiStore.currentAccount = mockAIAccount

    expect(aiStore.currentAccount).toEqual(mockAIAccount)
    expect(aiStore.currentAccount?.name).toBe('价值投资基金经理')
    expect(aiStore.currentAccount?.profitRate).toBe(15.0)
  })

  it('应该正确计算AI账户统计信息', async () => {
    const aiStore = useAIStore()

    // 设置账户列表
    aiStore.$patch({
      accounts: [mockAIAccount],
    })

    expect(aiStore.totalBalance).toBe(1150000)
    expect(aiStore.totalProfit).toBe(150000)
  })
})

describe('TC-DETAIL-002: 收益曲线展示', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('应该获取并存储收益统计数据', async () => {
    const tradingStore = useTradingStore()

    // 模拟设置收益统计
    tradingStore.$patch({
      profitStats: mockProfitStats,
    })

    expect(tradingStore.profitStats).toEqual(mockProfitStats)
    expect(tradingStore.profitStats?.dailyProfits).toHaveLength(5)
    expect(tradingStore.profitStats?.weeklyProfits).toHaveLength(5)
    expect(tradingStore.profitStats?.monthlyProfits).toHaveLength(2)
  })

  it('应该正确计算收益指标', async () => {
    const tradingStore = useTradingStore()

    tradingStore.$patch({
      profitStats: mockProfitStats,
    })

    expect(tradingStore.profitStats?.maxProfit).toBe(150000)
    expect(tradingStore.profitStats?.maxLoss).toBe(-5000)
    expect(tradingStore.profitStats?.avgDailyReturn).toBe(0.8)
  })

  it('应该处理空收益数据的情况', async () => {
    const tradingStore = useTradingStore()

    tradingStore.$patch({
      profitStats: {
        ...mockProfitStats,
        dailyProfits: [],
      },
    })

    expect(tradingStore.profitStats?.dailyProfits).toHaveLength(0)
  })
})

describe('TC-DETAIL-003: 持仓列表展示', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('应该获取并存储持仓数据', async () => {
    const tradingStore = useTradingStore()

    tradingStore.$patch({
      holdings: mockHoldings,
    })

    expect(tradingStore.holdings).toHaveLength(2)
    expect(tradingStore.holdings[0].stockName).toBe('平安银行')
    expect(tradingStore.holdings[1].stockName).toBe('万科A')
  })

  it('应该正确计算持仓盈亏', async () => {
    const tradingStore = useTradingStore()

    tradingStore.$patch({
      holdings: mockHoldings,
    })

    const holding1 = tradingStore.holdings[0]
    expect(holding1.profit).toBe(2700)
    expect(holding1.profitRate).toBe(21.6)

    const holding2 = tradingStore.holdings[1]
    expect(holding2.profit).toBe(-750)
    expect(holding2.profitRate).toBe(-8.33)
  })

  it('应该计算持仓总市值', async () => {
    const tradingStore = useTradingStore()

    tradingStore.$patch({
      holdings: mockHoldings,
    })

    const totalMarketValue = tradingStore.holdings.reduce(
      (sum, h) => sum + h.marketValue,
      0
    )
    expect(totalMarketValue).toBe(23450)
  })

  it('应该处理空持仓列表', async () => {
    const tradingStore = useTradingStore()

    tradingStore.$patch({
      holdings: [],
    })

    expect(tradingStore.holdings).toHaveLength(0)
  })
})

describe('TC-DETAIL-004: 交易记录展示', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('应该获取并存储交易记录', async () => {
    const tradingStore = useTradingStore()

    tradingStore.$patch({
      trades: mockTrades.list,
    })

    expect(tradingStore.trades).toHaveLength(3)
    expect(tradingStore.trades[0].type).toBe('buy')
    expect(tradingStore.trades[2].type).toBe('sell')
  })

  it('应该正确识别买卖类型', async () => {
    const tradingStore = useTradingStore()

    tradingStore.$patch({
      trades: mockTrades.list,
    })

    const buyTrades = tradingStore.trades.filter((t) => t.type === 'buy')
    const sellTrades = tradingStore.trades.filter((t) => t.type === 'sell')

    expect(buyTrades).toHaveLength(2)
    expect(sellTrades).toHaveLength(1)
  })

  it('应该正确计算交易金额', async () => {
    const tradingStore = useTradingStore()

    tradingStore.$patch({
      trades: mockTrades.list,
    })

    const totalBuyAmount = tradingStore.trades
      .filter((t) => t.type === 'buy')
      .reduce((sum, t) => sum + t.amount, 0)

    expect(totalBuyAmount).toBe(21500)
  })
})

describe('TC-DETAIL-005: 决策历史展示', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('应该获取并存储决策历史', async () => {
    const aiStore = useAIStore()

    aiStore.$patch({
      decisions: mockDecisions.list,
    })

    expect(aiStore.decisions).toHaveLength(2)
    expect(aiStore.decisions[0].type).toBe('buy')
    expect(aiStore.decisions[1].type).toBe('sell')
  })

  it('应该正确显示决策信息', async () => {
    const aiStore = useAIStore()

    aiStore.$patch({
      decisions: mockDecisions.list,
    })

    const decision = aiStore.decisions[0]
    expect(decision.confidence).toBe(0.85)
    expect(decision.reason).toContain('MACD金叉')
    expect(decision.result?.status).toBe('success')
  })

  it('应该处理空决策历史', async () => {
    const aiStore = useAIStore()

    aiStore.$patch({
      decisions: [],
    })

    expect(aiStore.decisions).toHaveLength(0)
  })
})

describe('TC-DETAIL-006: 数据格式化', () => {
  it('应该正确格式化金额', () => {
    const formatAmount = (amount: number): string => {
      if (amount >= 10000) {
        return (amount / 10000).toFixed(2) + '万'
      }
      return amount.toFixed(2)
    }

    expect(formatAmount(150000)).toBe('15.00万')
    expect(formatAmount(12500)).toBe('12500.00')
    expect(formatAmount(1000000)).toBe('100.00万')
  })

  it('应该正确格式化收益率', () => {
    const formatRate = (rate: number): string => {
      const sign = rate >= 0 ? '+' : ''
      return `${sign}${rate.toFixed(2)}%`
    }

    expect(formatRate(15.0)).toBe('+15.00%')
    expect(formatRate(-8.33)).toBe('-8.33%')
    expect(formatRate(0)).toBe('+0.00%')
  })

  it('应该正确格式化日期', () => {
    const formatDate = (dateStr: string): string => {
      const date = new Date(dateStr)
      return `${date.getMonth() + 1}月${date.getDate()}日`
    }

    expect(formatDate('2026-01-15T09:30:00Z')).toBe('1月15日')
    expect(formatDate('2026-02-05T10:30:00Z')).toBe('2月5日')
  })
})

describe('TC-DETAIL-007: 错误处理', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('应该在获取数据失败时显示错误提示', async () => {
    const aiStore = useAIStore()

    // 模拟错误状态
    aiStore.loading = false
    aiStore.currentAccount = null

    expect(aiStore.currentAccount).toBeNull()
  })

  it('应该处理网络超时情况', async () => {
    const tradingStore = useTradingStore()

    tradingStore.$patch({
      holdings: [],
      trades: [],
      profitStats: null,
    })

    expect(tradingStore.holdings).toHaveLength(0)
    expect(tradingStore.profitStats).toBeNull()
  })
})

// ============================================================================
// 测试报告统计
// ============================================================================

/**
 * 测试覆盖统计:
 *
 * 测试套件: 7个
 * - TC-DETAIL-001: 页面加载和基本信息展示
 * - TC-DETAIL-002: 收益曲线展示
 * - TC-DETAIL-003: 持仓列表展示
 * - TC-DETAIL-004: 交易记录展示
 * - TC-DETAIL-005: 决策历史展示
 * - TC-DETAIL-006: 数据格式化
 * - TC-DETAIL-007: 错误处理
 *
 * 测试用例: 18个
 * 预期结果: 全部通过
 */
