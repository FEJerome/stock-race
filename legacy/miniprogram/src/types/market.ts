// 市场数据相关类型定义

// 股票行情
export interface StockQuote {
  code: string
  name: string
  price: number
  preClose: number
  open: number
  high: number
  low: number
  volume: number
  amount: number
  change: number
  changeRate: number
  updateTime: string
}

// 市场指数
export interface MarketIndex {
  code: string
  name: string
  price: number
  change: number
  changeRate: number
}

// 市场状态
export interface MarketStatus {
  isOpen: boolean
  nextOpenTime?: string
  nextCloseTime?: string
  tradingDay: boolean
  session: 'pre' | 'open' | 'close' | 'post'
}

// 股票详情
export interface StockDetail {
  code: string
  name: string
  industry: string
  market: string
  quote: StockQuote
  pe?: number
  pb?: number
  marketCap?: number
  circulatingCap?: number
}

// K线数据
export interface KLineData {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount: number
}

// 技术指标
export interface TechnicalIndicator {
  name: string
  value: number
  signal: 'buy' | 'sell' | 'neutral'
}

// 板块表现
export interface SectorPerformance {
  name: string
  changeRate: number
  leadingStocks: string[]
}

// 市场热点
export interface MarketHotspot {
  name: string
  heat: number
  changeRate: number
  relatedStocks: string[]
}

// 自选股
export interface WatchlistItem {
  id: string
  stockCode: string
  stockName: string
  quote?: StockQuote
  addedAt: string
}

// 排行榜用户
export interface RankingUser {
  rank: number
  userId: string
  username: string
  avatar?: string
  totalAssets: number
  profitRate: number
  rankChange: number
}

// 竞赛统计
export interface CompetitionStats {
  totalUsers: number
  totalManagers: number
  avgProfitRate: number
  maxProfitRate: number
  prizePool: number
}
