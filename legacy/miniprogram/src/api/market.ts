// 市场数据相关API
import { request } from './request'
import type {
  StockQuote,
  MarketIndex,
  MarketStatus,
  StockDetail,
  KLineData,
  RankingUser,
  CompetitionStats,
} from '@/types/market'

export const marketApi = {
  // 获取市场状态
  getMarketStatus(): Promise<MarketStatus> {
    return request.get<MarketStatus>('/market/status')
  },

  // 获取市场指数
  getMarketIndices(): Promise<MarketIndex[]> {
    return request.get<MarketIndex[]>('/market/indices')
  },

  // 获取股票行情列表
  getStockQuotes(): Promise<StockQuote[]> {
    return request.get<StockQuote[]>('/stocks/quotes')
  },

  // 获取单个股票行情
  getStockQuote(code: string): Promise<StockQuote> {
    return request.get<StockQuote>(`/stocks/${code}/quote`)
  },

  // 获取股票详情
  getStockDetail(code: string): Promise<StockDetail> {
    return request.get<StockDetail>(`/stocks/${code}`)
  },

  // 获取K线数据
  getKLineData(code: string, period: '1d' | '1w' | '1m' | '1y' = '1d'): Promise<KLineData[]> {
    return request.get<KLineData[]>(`/stocks/${code}/kline`, { period })
  },

  // 搜索股票
  searchStocks(keyword: string): Promise<StockQuote[]> {
    return request.get<StockQuote[]>('/stocks/search', { keyword })
  },

  // 获取自选股列表
  getWatchlist(): Promise<StockQuote[]> {
    return request.get<StockQuote[]>('/watchlist')
  },

  // 添加自选股
  addToWatchlist(code: string): Promise<void> {
    return request.post<void>('/watchlist', { code })
  },

  // 移除自选股
  removeFromWatchlist(code: string): Promise<void> {
    return request.delete<void>(`/watchlist/${code}`)
  },

  // 获取排行榜
  getRanking(page = 1, pageSize = 20): Promise<RankingUser[]> {
    return request.get<RankingUser[]>('/competition/ranking', { page, pageSize })
  },

  // 获取竞赛统计
  getCompetitionStats(): Promise<CompetitionStats> {
    return request.get<CompetitionStats>('/competition/stats')
  },

  // 获取我的排名
  getMyRanking(): Promise<RankingUser> {
    return request.get<RankingUser>('/competition/my-ranking')
  },
}
