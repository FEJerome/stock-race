// 公开API Mock数据
// 用于开发和单元测试，后续可无缝切换为真实数据

import type {
  StockQuote,
  StockSearchResult,
  QuoteListResponse,
  RankingItem,
  RankingResponse,
  AIManagerPublicDetail,
  MarketIndex,
  MarketStatus,
  RankingPeriod,
} from '@/types/public'

// ==================== Mock 行情数据 ====================

const mockStockQuotes: StockQuote[] = [
  {
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
    updateTime: new Date().toISOString(),
  },
  {
    code: '000002.SZ',
    name: '万科A',
    price: 15.20,
    change: -0.35,
    changePercent: -2.25,
    volume: 89200000,
    turnover: 1355840000,
    marketCap: 176800000000,
    high: 15.60,
    low: 15.15,
    open: 15.55,
    preClose: 15.55,
    updateTime: new Date().toISOString(),
  },
  {
    code: '600519.SH',
    name: '贵州茅台',
    price: 1688.00,
    change: 25.50,
    changePercent: 1.53,
    volume: 2300000,
    turnover: 3882400000,
    marketCap: 2120000000000,
    high: 1695.00,
    low: 1660.00,
    open: 1665.00,
    preClose: 1662.50,
    updateTime: new Date().toISOString(),
  },
  {
    code: '300750.SZ',
    name: '宁德时代',
    price: 185.60,
    change: 3.20,
    changePercent: 1.75,
    volume: 12500000,
    turnover: 2320000000,
    marketCap: 816000000000,
    high: 188.00,
    low: 182.50,
    open: 183.00,
    preClose: 182.40,
    updateTime: new Date().toISOString(),
  },
  {
    code: '601318.SH',
    name: '中国平安',
    price: 48.50,
    change: 0.80,
    changePercent: 1.68,
    volume: 45600000,
    turnover: 2211600000,
    marketCap: 886000000000,
    high: 49.10,
    low: 47.80,
    open: 48.00,
    preClose: 47.70,
    updateTime: new Date().toISOString(),
  },
  {
    code: '000858.SZ',
    name: '五粮液',
    price: 145.80,
    change: -1.20,
    changePercent: -0.82,
    volume: 8900000,
    turnover: 1297620000,
    marketCap: 566000000000,
    high: 147.50,
    low: 144.80,
    open: 147.00,
    preClose: 147.00,
    updateTime: new Date().toISOString(),
  },
  {
    code: '002594.SZ',
    name: '比亚迪',
    price: 268.50,
    change: 5.30,
    changePercent: 2.01,
    volume: 8900000,
    turnover: 2389650000,
    marketCap: 781000000000,
    high: 270.00,
    low: 263.20,
    open: 264.00,
    preClose: 263.20,
    updateTime: new Date().toISOString(),
  },
  {
    code: '600036.SH',
    name: '招商银行',
    price: 32.80,
    change: 0.45,
    changePercent: 1.39,
    volume: 28900000,
    turnover: 947920000,
    marketCap: 827000000000,
    high: 33.10,
    low: 32.40,
    open: 32.50,
    preClose: 32.35,
    updateTime: new Date().toISOString(),
  },
  {
    code: '601012.SH',
    name: '隆基绿能',
    price: 22.35,
    change: -0.65,
    changePercent: -2.83,
    volume: 45600000,
    turnover: 1019160000,
    marketCap: 169000000000,
    high: 23.10,
    low: 22.20,
    open: 23.00,
    preClose: 23.00,
    updateTime: new Date().toISOString(),
  },
  {
    code: '300059.SZ',
    name: '东方财富',
    price: 16.88,
    change: 0.28,
    changePercent: 1.69,
    volume: 156000000,
    turnover: 2633280000,
    marketCap: 267000000000,
    high: 17.15,
    low: 16.60,
    open: 16.65,
    preClose: 16.60,
    updateTime: new Date().toISOString(),
  },
]

// 生成更多股票数据用于分页
const generateMoreStocks = (page: number, pageSize: number): StockQuote[] => {
  const stocks: StockQuote[] = []
  const baseStocks = mockStockQuotes

  for (let i = 0; i < pageSize; i++) {
    const baseIndex = (page - 1) * pageSize + i
    const baseStock = baseStocks[baseIndex % baseStocks.length]
    if (!baseStock) break

    // 随机变化价格
    const randomChange = (Math.random() - 0.5) * 0.1
    const newPrice = +(baseStock.price * (1 + randomChange)).toFixed(2)
    const change = +(newPrice - baseStock.preClose).toFixed(2)
    const changePercent = +((change / baseStock.preClose) * 100).toFixed(2)

    stocks.push({
      ...baseStock,
      price: newPrice,
      change,
      changePercent,
      updateTime: new Date().toISOString(),
    })
  }

  return stocks
}

// 股票搜索Mock数据
const mockSearchResults: StockSearchResult[] = [
  { code: '000001.SZ', name: '平安银行', pinyin: 'PAYH', market: 'SZ' },
  { code: '000002.SZ', name: '万科A', pinyin: 'WKA', market: 'SZ' },
  { code: '000858.SZ', name: '五粮液', pinyin: 'WLY', market: 'SZ' },
  { code: '002594.SZ', name: '比亚迪', pinyin: 'BYD', market: 'SZ' },
  { code: '300059.SZ', name: '东方财富', pinyin: 'DFCF', market: 'SZ' },
  { code: '300750.SZ', name: '宁德时代', pinyin: 'NDSD', market: 'SZ' },
  { code: '600519.SH', name: '贵州茅台', pinyin: 'GZMT', market: 'SH' },
  { code: '601318.SH', name: '中国平安', pinyin: 'ZGPA', market: 'SH' },
  { code: '600036.SH', name: '招商银行', pinyin: 'ZSYH', market: 'SH' },
  { code: '601012.SH', name: '隆基绿能', pinyin: 'LJLN', market: 'SH' },
  { code: '601888.SH', name: '中国中免', pinyin: 'ZGZM', market: 'SH' },
  { code: '603288.SH', name: '海天味业', pinyin: 'HTWY', market: 'SH' },
]

// ==================== Mock 排行榜数据 ====================

const generateRankingData = (period: RankingPeriod): RankingItem[] => {
  const schools = ['清华', '北大', '复旦', '交大', '浙大', 'MIT', '哈佛', '斯坦福']
  const names = [
    '阿尔法策略', '贝塔量化', '伽马对冲', '德尔塔套利',
    '西格玛趋势', '欧米茄价值', '艾普西隆成长', '泽塔动量'
  ]

  return Array.from({ length: 50 }, (_, i) => {
    const baseReturn = period === 'daily' ? 5 : period === 'weekly' ? 15 : 45
    const randomReturn = (Math.random() - 0.3) * baseReturn
    const returnRate = +(randomReturn + 2).toFixed(2)
    const initialCapital = 100000 + Math.floor(Math.random() * 400000)
    const returnAmount = +(initialCapital * returnRate / 100).toFixed(2)

    return {
      id: `rank_${i + 1}`,
      name: names[i % names.length] + (Math.floor(i / names.length) + 1),
      userId: `user_${1000 + i}`,
      avatar: `/static/avatars/avatar${(i % 5) + 1}.png`,
      rank: i + 1,
      returnRate,
      returnAmount,
      initialCapital,
      currentAssets: initialCapital + returnAmount,
      tradeCount: Math.floor(Math.random() * 100) + 10,
      aiCount: Math.floor(Math.random() * 3) + 1,
      updateTime: new Date().toISOString(),
    }
  }).sort((a, b) => b.returnRate - a.returnRate)
    .map((item, index) => ({ ...item, rank: index + 1 }))
}

// ==================== Mock AI经理数据 ====================

const mockAIManagers: AIManagerPublicDetail[] = [
  {
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
  },
  {
    id: 'ai_002',
    name: '索罗斯对冲',
    avatar: '/static/avatars/avatar2.png',
    school: '伦敦政治经济学院',
    riskLevel: 'aggressive',
    returnRate: 32.5,
    returnRateDaily: 2.1,
    returnRateWeekly: 5.2,
    returnRateMonthly: 12.8,
    tradeCount: 128,
    winRate: 58.3,
    description: '宏观对冲策略，捕捉市场趋势变化',
    isPublic: true,
    createdAt: '2024-01-20T10:30:00Z',
  },
  {
    id: 'ai_003',
    name: '西蒙斯量化',
    avatar: '/static/avatars/avatar3.png',
    school: 'MIT',
    riskLevel: 'moderate',
    returnRate: 28.3,
    returnRateDaily: 0.8,
    returnRateWeekly: 2.9,
    returnRateMonthly: 7.5,
    tradeCount: 256,
    winRate: 62.1,
    description: '高频量化策略，基于数学模型交易',
    isPublic: true,
    createdAt: '2024-02-01T09:00:00Z',
  },
]

// ==================== Mock 市场指数 ====================

const mockMarketIndices: MarketIndex[] = [
  { name: '上证指数', code: '000001.SH', current: 3250.58, change: 15.20, changePercent: 0.47 },
  { name: '深证成指', code: '399001.SZ', current: 10850.32, change: 45.80, changePercent: 0.42 },
  { name: '创业板指', code: '399006.SZ', current: 2150.15, change: 12.35, changePercent: 0.58 },
]

const mockMarketStatus: MarketStatus = {
  isOpen: true,
  status: 'open',
  currentTime: new Date().toISOString(),
}

// ==================== Mock API 实现 ====================

/**
 * 获取行情列表
 */
export const mockGetStockQuotes = async (
  page = 1,
  pageSize = 20,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc'
): Promise<QuoteListResponse> => {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 200))

  let list = generateMoreStocks(page, pageSize)

  // 排序
  if (sortBy) {
    list = list.sort((a, b) => {
      const aVal = a[sortBy as keyof StockQuote] as number
      const bVal = b[sortBy as keyof StockQuote] as number
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    })
  }

  return {
    list,
    total: 100,
    page,
    pageSize,
    updateTime: new Date().toISOString(),
  }
}

/**
 * 搜索股票
 */
export const mockSearchStocks = async (keyword: string, limit = 10): Promise<StockSearchResult[]> => {
  await new Promise((resolve) => setTimeout(resolve, 100))

  if (!keyword.trim()) return []

  const lowerKeyword = keyword.toLowerCase()
  return mockSearchResults
    .filter(
      (stock) =>
        stock.code.toLowerCase().includes(lowerKeyword) ||
        stock.name.includes(keyword) ||
        stock.pinyin?.toLowerCase().includes(lowerKeyword)
    )
    .slice(0, limit)
}

/**
 * 获取排行榜
 */
export const mockGetRanking = async (
  period: RankingPeriod,
  page = 1,
  pageSize = 20
): Promise<RankingResponse> => {
  await new Promise((resolve) => setTimeout(resolve, 300))

  const allData = generateRankingData(period)
  const start = (page - 1) * pageSize
  const list = allData.slice(start, start + pageSize)

  return {
    list,
    total: allData.length,
    page,
    pageSize,
  }
}

/**
 * 获取AI经理公开详情
 */
export const mockGetAIManagerDetail = async (id: string): Promise<AIManagerPublicDetail | null> => {
  await new Promise((resolve) => setTimeout(resolve, 150))

  const manager = mockAIManagers.find((m) => m.id === id)
  return manager || null
}

/**
 * 获取市场指数
 */
export const mockGetMarketIndices = async (): Promise<MarketIndex[]> => {
  await new Promise((resolve) => setTimeout(resolve, 100))

  // 随机微调数据
  return mockMarketIndices.map((index) => {
    const randomChange = (Math.random() - 0.5) * 5
    const newCurrent = +(index.current + randomChange).toFixed(2)
    const change = +(newCurrent - (index.current - index.change)).toFixed(2)
    const changePercent = +((change / (newCurrent - change)) * 100).toFixed(2)

    return {
      ...index,
      current: newCurrent,
      change,
      changePercent,
    }
  })
}

/**
 * 获取市场状态
 */
export const mockGetMarketStatus = async (): Promise<MarketStatus> => {
  await new Promise((resolve) => setTimeout(resolve, 50))
  return mockMarketStatus
}

// 导出原始数据，方便测试使用
export { mockStockQuotes, mockSearchResults, mockAIManagers, mockMarketIndices }
