/**
 * 公开API单元测试
 *
 * 测试范围: /api/public/* 接口
 * 测试目标: 验证行情、排行榜、AI经理公开数据接口
 *
 * @author Miniprogram开发团队
 * @date 2026-02-12
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================================
// Mock 请求模块
// ============================================================================

const mockRequest = {
  get: vi.fn(),
}

vi.mock('@/api/request', () => ({
  request: mockRequest,
}))

// 导入被测模块（在mock之后）
import {
  getStockQuotes,
  searchStocks,
  getStockQuote,
  getRanking,
  getRankingStats,
  getAIManagerPublicDetail,
  getPublicAIManagers,
  getMarketIndices,
  getMarketStatus,
  publicApi,
} from '@/api/public'

import type {
  StockQuote,
  QuoteListResponse,
  RankingResponse,
  AIManagerPublicDetail,
  MarketIndex,
  MarketStatus,
} from '@/types/public'

// ============================================================================
// Mock 数据
// ============================================================================

const mockStockQuote: StockQuote = {
  code: '000001.SZ',
  name: '平安银行',
  price: 12.58,
  change: 0.29,
  changePercent: 2.35,
  volume: 152300000,
  turnover: 1915900000,
  marketCap: 244000000000,
  high: 12.68,
  low: 12.30,
  open: 12.32,
  preClose: 12.29,
  updateTime: '2026-02-12T10:30:00Z',
}

const mockQuoteListResponse: QuoteListResponse = {
  list: [mockStockQuote],
  total: 100,
  page: 1,
  pageSize: 20,
  updateTime: '2026-02-12T10:30:00Z',
}

const mockRankingResponse: RankingResponse = {
  list: [
    {
      id: 'rank_1',
      name: '阿尔法策略1',
      userId: 'user_1000',
      avatar: '/static/avatars/avatar1.png',
      rank: 1,
      returnRate: 25.8,
      returnAmount: 25800,
      initialCapital: 100000,
      currentAssets: 125800,
      tradeCount: 45,
      aiCount: 2,
      updateTime: '2026-02-12T10:30:00Z',
    },
  ],
  total: 50,
  page: 1,
  pageSize: 20,
}

const mockAIManagerDetail: AIManagerPublicDetail = {
  id: 'ai_001',
  name: '巴菲特价值',
  avatar: '/static/avatars/avatar1.png',
  school: '哥伦比亚大学',
  riskLevel: 'moderate',
  returnRate: 25.8,
  returnRateDaily: 1.2,
  returnRateWeekly: 3.5,
  returnRateMonthly: 8.2,
  tradeCount: 45,
  winRate: 68.5,
  description: '基于价值投资理念，寻找被低估的优质企业',
  isPublic: true,
  createdAt: '2024-01-15T08:00:00Z',
}

const mockMarketIndices: MarketIndex[] = [
  { name: '上证指数', code: '000001.SH', current: 3250.58, change: 15.20, changePercent: 0.47 },
  { name: '深证成指', code: '399001.SZ', current: 10850.32, change: 45.80, changePercent: 0.42 },
]

const mockMarketStatus: MarketStatus = {
  isOpen: true,
  status: 'open',
  currentTime: '2026-02-12T10:30:00Z',
}

// ============================================================================
// 测试套件: 行情数据API
// ============================================================================

describe('TC-PUBLIC-001: 获取股票行情列表', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确获取行情列表', async () => {
    mockRequest.get.mockResolvedValue(mockQuoteListResponse)

    const result = await getStockQuotes()

    expect(mockRequest.get).toHaveBeenCalledWith(
      '/api/public/market/quotes',
      {
        page: 1,
        pageSize: 20,
        sortBy: undefined,
        sortOrder: undefined,
      }
    )
    expect(result).toEqual(mockQuoteListResponse)
    expect(result.list).toHaveLength(1)
    expect(result.list[0].code).toBe('000001.SZ')
  })

  it('应该支持分页参数', async () => {
    mockRequest.get.mockResolvedValue(mockQuoteListResponse)

    await getStockQuotes(2, 50)

    expect(mockRequest.get).toHaveBeenCalledWith(
      '/api/public/market/quotes',
      {
        page: 2,
        pageSize: 50,
        sortBy: undefined,
        sortOrder: undefined,
      }
    )
  })

  it('应该支持排序参数', async () => {
    mockRequest.get.mockResolvedValue(mockQuoteListResponse)

    await getStockQuotes(1, 20, 'changePercent', 'desc')

    expect(mockRequest.get).toHaveBeenCalledWith(
      '/api/public/market/quotes',
      {
        page: 1,
        pageSize: 20,
        sortBy: 'changePercent',
        sortOrder: 'desc',
      }
    )
  })
})

describe('TC-PUBLIC-002: 搜索股票', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确搜索股票', async () => {
    const mockSearchResults = [
      { code: '000001.SZ', name: '平安银行', pinyin: 'PAYH', market: 'SZ' as const },
      { code: '601318.SH', name: '中国平安', pinyin: 'ZGPA', market: 'SH' as const },
    ]
    mockRequest.get.mockResolvedValue(mockSearchResults)

    const result = await searchStocks('平安')

    expect(mockRequest.get).toHaveBeenCalledWith(
      '/api/public/market/search',
      {
        keyword: '平安',
        limit: 10,
      }
    )
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('平安银行')
  })

  it('应该支持限制返回数量', async () => {
    mockRequest.get.mockResolvedValue([])

    await searchStocks('银行', 5)

    expect(mockRequest.get).toHaveBeenCalledWith(
      '/api/public/market/search',
      {
        keyword: '银行',
        limit: 5,
      }
    )
  })
})

describe('TC-PUBLIC-003: 获取单个股票行情', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确获取单个股票行情', async () => {
    mockRequest.get.mockResolvedValue(mockStockQuote)

    const result = await getStockQuote('000001.SZ')

    expect(mockRequest.get).toHaveBeenCalledWith(
      '/api/public/market/quotes/000001.SZ'
    )
    expect(result.code).toBe('000001.SZ')
    expect(result.name).toBe('平安银行')
  })
})

// ============================================================================
// 测试套件: 排行榜API
// ============================================================================

describe('TC-PUBLIC-004: 获取收益排行榜', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确获取日榜', async () => {
    mockRequest.get.mockResolvedValue(mockRankingResponse)

    const result = await getRanking('daily')

    expect(mockRequest.get).toHaveBeenCalledWith(
      '/api/public/ranking/daily',
      {
        page: 1,
        pageSize: 20,
      }
    )
    expect(result.list[0].rank).toBe(1)
  })

  it('应该正确获取周榜', async () => {
    mockRequest.get.mockResolvedValue(mockRankingResponse)

    const result = await getRanking('weekly')

    expect(mockRequest.get).toHaveBeenCalledWith(
      '/api/public/ranking/weekly',
      {
        page: 1,
        pageSize: 20,
      }
    )
  })

  it('应该正确获取月榜', async () => {
    mockRequest.get.mockResolvedValue(mockRankingResponse)

    const result = await getRanking('monthly', 2, 50)

    expect(mockRequest.get).toHaveBeenCalledWith(
      '/api/public/ranking/monthly',
      {
        page: 2,
        pageSize: 50,
      }
    )
  })
})

describe('TC-PUBLIC-005: 获取排行榜统计', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确获取排行榜统计', async () => {
    const mockStats = {
      totalAccounts: 1000,
      totalParticipants: 850,
      avgReturnRate: 8.5,
      topReturnRate: 45.2,
    }
    mockRequest.get.mockResolvedValue(mockStats)

    const result = await getRankingStats()

    expect(mockRequest.get).toHaveBeenCalledWith('/api/public/ranking/stats')
    expect(result.totalAccounts).toBe(1000)
    expect(result.avgReturnRate).toBe(8.5)
  })
})

// ============================================================================
// 测试套件: AI经理公开API
// ============================================================================

describe('TC-PUBLIC-006: 获取AI经理公开详情', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确获取AI经理详情', async () => {
    mockRequest.get.mockResolvedValue(mockAIManagerDetail)

    const result = await getAIManagerPublicDetail('ai_001')

    expect(mockRequest.get).toHaveBeenCalledWith(
      '/api/public/ai-managers/ai_001'
    )
    expect(result.id).toBe('ai_001')
    expect(result.name).toBe('巴菲特价值')
    expect(result.riskLevel).toBe('moderate')
  })
})

describe('TC-PUBLIC-007: 获取公开AI经理列表', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确获取AI经理列表', async () => {
    const mockList = {
      list: [mockAIManagerDetail],
      total: 10,
    }
    mockRequest.get.mockResolvedValue(mockList)

    const result = await getPublicAIManagers(1, 10)

    expect(mockRequest.get).toHaveBeenCalledWith(
      '/api/public/ai-managers',
      {
        page: 1,
        pageSize: 10,
      }
    )
    expect(result.list).toHaveLength(1)
    expect(result.total).toBe(10)
  })
})

// ============================================================================
// 测试套件: 市场概览API
// ============================================================================

describe('TC-PUBLIC-008: 获取市场指数', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确获取市场指数', async () => {
    mockRequest.get.mockResolvedValue(mockMarketIndices)

    const result = await getMarketIndices()

    expect(mockRequest.get).toHaveBeenCalledWith('/api/public/market/indices')
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('上证指数')
    expect(result[1].name).toBe('深证成指')
  })
})

describe('TC-PUBLIC-009: 获取市场状态', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确获取市场状态', async () => {
    mockRequest.get.mockResolvedValue(mockMarketStatus)

    const result = await getMarketStatus()

    expect(mockRequest.get).toHaveBeenCalledWith('/api/public/market/status')
    expect(result.isOpen).toBe(true)
    expect(result.status).toBe('open')
  })
})

// ============================================================================
// 测试套件: API对象导出
// ============================================================================

describe('TC-PUBLIC-010: API对象导出', () => {
  it('应该导出所有API方法', () => {
    expect(publicApi.getStockQuotes).toBeDefined()
    expect(publicApi.searchStocks).toBeDefined()
    expect(publicApi.getStockQuote).toBeDefined()
    expect(publicApi.getRanking).toBeDefined()
    expect(publicApi.getRankingStats).toBeDefined()
    expect(publicApi.getAIManagerPublicDetail).toBeDefined()
    expect(publicApi.getPublicAIManagers).toBeDefined()
    expect(publicApi.getMarketIndices).toBeDefined()
    expect(publicApi.getMarketStatus).toBeDefined()
  })
})

// ============================================================================
// 测试报告统计
// ============================================================================

/**
 * 测试覆盖统计:
 *
 * 测试套件: 10个
 * - TC-PUBLIC-001: 获取股票行情列表
 * - TC-PUBLIC-002: 搜索股票
 * - TC-PUBLIC-003: 获取单个股票行情
 * - TC-PUBLIC-004: 获取收益排行榜
 * - TC-PUBLIC-005: 获取排行榜统计
 * - TC-PUBLIC-006: 获取AI经理公开详情
 * - TC-PUBLIC-007: 获取公开AI经理列表
 * - TC-PUBLIC-008: 获取市场指数
 * - TC-PUBLIC-009: 获取市场状态
 * - TC-PUBLIC-010: API对象导出
 *
 * 测试用例: 13个
 * 预期结果: 全部通过
 */
