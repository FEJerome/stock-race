// 公开API接口封装（无需认证）
// 对应架构文档: 005-MINIPROGRAM-GUEST-MODE.md
// API路径: /api/public/*

import { request } from './request'
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

// ==================== 配置 ====================

// 公开API基础路径
const PUBLIC_API_BASE = '/api/public'

// ==================== 行情数据API ====================

/**
 * 获取股票行情列表
 * GET /api/public/market/quotes
 * @param page 页码，默认1
 * @param pageSize 每页数量，默认20
 * @param sortBy 排序字段
 * @param sortOrder 排序方向
 */
export const getStockQuotes = async (
  page = 1,
  pageSize = 20,
  sortBy?: 'price' | 'change' | 'changePercent' | 'volume',
  sortOrder?: 'asc' | 'desc'
): Promise<QuoteListResponse> => {
  return request.get<QuoteListResponse>(`${PUBLIC_API_BASE}/market/quotes`, {
    page,
    pageSize,
    sortBy,
    sortOrder,
  })
}

/**
 * 搜索股票
 * GET /api/public/market/search
 * @param keyword 搜索关键词（代码、名称、拼音）
 * @param limit 返回数量限制，默认10
 */
export const searchStocks = async (
  keyword: string,
  limit = 10
): Promise<StockSearchResult[]> => {
  return request.get<StockSearchResult[]>(`${PUBLIC_API_BASE}/market/search`, {
    keyword,
    limit,
  })
}

/**
 * 获取单个股票行情
 * GET /api/public/market/quotes/:code
 * @param code 股票代码，如 "000001.SZ"
 */
export const getStockQuote = async (code: string): Promise<StockQuote> => {
  return request.get<StockQuote>(`${PUBLIC_API_BASE}/market/quotes/${code}`)
}

// ==================== 排行榜API ====================

/**
 * 获取收益排行榜
 * GET /api/public/ranking/:period
 * @param period 周期: 'daily' | 'weekly' | 'monthly'
 * @param page 页码，默认1
 * @param pageSize 每页数量，默认20
 */
export const getRanking = async (
  period: RankingPeriod,
  page = 1,
  pageSize = 20
): Promise<RankingResponse> => {
  return request.get<RankingResponse>(`${PUBLIC_API_BASE}/ranking/${period}`, {
    page,
    pageSize,
  })
}

/**
 * 获取排行榜统计
 * GET /api/public/ranking/stats
 */
export const getRankingStats = async (): Promise<{
  totalAccounts: number
  totalParticipants: number
  avgReturnRate: number
  topReturnRate: number
}> => {
  return request.get(`${PUBLIC_API_BASE}/ranking/stats`)
}

// ==================== AI经理公开API ====================

/**
 * 获取AI经理公开详情
 * GET /api/public/ai-managers/:id
 * @param id AI经理ID
 */
export const getAIManagerPublicDetail = async (
  id: string
): Promise<AIManagerPublicDetail> => {
  return request.get<AIManagerPublicDetail>(`${PUBLIC_API_BASE}/ai-managers/${id}`)
}

/**
 * 获取公开AI经理列表
 * GET /api/public/ai-managers
 * @param page 页码
 * @param pageSize 每页数量
 */
export const getPublicAIManagers = async (
  page = 1,
  pageSize = 20
): Promise<{
  list: AIManagerPublicDetail[]
  total: number
}> => {
  return request.get(`${PUBLIC_API_BASE}/ai-managers`, {
    page,
    pageSize,
  })
}

// ==================== 市场概览API ====================

/**
 * 获取市场指数
 * GET /api/public/market/indices
 */
export const getMarketIndices = async (): Promise<MarketIndex[]> => {
  return request.get<MarketIndex[]>(`${PUBLIC_API_BASE}/market/indices`)
}

/**
 * 获取市场状态
 * GET /api/public/market/status
 */
export const getMarketStatus = async (): Promise<MarketStatus> => {
  return request.get<MarketStatus>(`${PUBLIC_API_BASE}/market/status`)
}

// ==================== 导出API对象 ====================

export const publicApi = {
  // 行情
  getStockQuotes,
  searchStocks,
  getStockQuote,

  // 排行榜
  getRanking,
  getRankingStats,

  // AI经理
  getAIManagerPublicDetail,
  getPublicAIManagers,

  // 市场概览
  getMarketIndices,
  getMarketStatus,
}

export default publicApi
