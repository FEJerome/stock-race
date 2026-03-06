// 公开API类型定义（无需认证）
// 对应架构文档: 005-MINIPROGRAM-GUEST-MODE.md

import type { PaginatedResponse } from './api'

// ==================== 行情数据类型 ====================

// 股票行情
export interface StockQuote {
  code: string           // 股票代码，如 "000001.SZ"
  name: string           // 股票名称，如 "平安银行"
  price: number          // 当前价格
  change: number         // 涨跌额
  changePercent: number  // 涨跌幅(%)
  volume: number         // 成交量
  turnover: number       // 成交额
  marketCap: number      // 市值
  high: number           // 最高价
  low: number            // 最低价
  open: number           // 开盘价
  preClose: number       // 昨收价
  updateTime: string     // 更新时间
}

// 行情列表请求参数
export interface QuoteListRequest {
  page?: number
  pageSize?: number
  sortBy?: 'price' | 'change' | 'changePercent' | 'volume'
  sortOrder?: 'asc' | 'desc'
}

// 行情列表响应
export type QuoteListResponse = PaginatedResponse<StockQuote> & {
  updateTime: string
}

// 股票搜索结果
export interface StockSearchResult {
  code: string
  name: string
  pinyin?: string      // 拼音缩写，用于搜索
  market: 'SZ' | 'SH' | 'BJ'  // 市场：深圳、上海、北交所
}

// 股票搜索请求参数
export interface StockSearchRequest {
  keyword: string      // 搜索关键词（代码、名称、拼音）
  limit?: number       // 返回数量限制
}

// ==================== 排行榜数据类型 ====================

// 排行榜周期类型
export type RankingPeriod = 'daily' | 'weekly' | 'monthly'

// 排行榜用户/AI账户
export interface RankingItem {
  id: string
  name: string
  userId: string
  avatar?: string
  rank: number
  returnRate: number     // 收益率(%)
  returnAmount: number   // 收益金额
  initialCapital: number // 初始资金
  currentAssets: number  // 当前资产
  tradeCount: number     // 交易次数
  aiCount: number        // AI账户数量
  updateTime: string
}

// 排行榜请求参数
export interface RankingRequest {
  period: RankingPeriod
  page?: number
  pageSize?: number
}

// 排行榜响应
export type RankingResponse = PaginatedResponse<RankingItem>

// ==================== AI经理公开数据类型 ====================

// AI经理公开详情（游客可查看）
export interface AIManagerPublicDetail {
  id: string
  name: string
  avatar?: string
  school?: string
  riskLevel: 'conservative' | 'moderate' | 'aggressive'
  returnRate: number
  returnRateDaily: number
  returnRateWeekly: number
  returnRateMonthly: number
  tradeCount: number
  winRate: number
  description?: string
  isPublic: boolean
  createdAt: string
}

// ==================== 市场概览类型 ====================

// 市场指数
export interface MarketIndex {
  name: string           // 指数名称，如 "上证指数"
  code: string           // 指数代码，如 "000001.SH"
  current: number        // 当前点数
  change: number         // 涨跌点数
  changePercent: number  // 涨跌幅(%)
}

// 市场状态
export interface MarketStatus {
  isOpen: boolean
  status: 'pre_open' | 'open' | 'close' | 'suspended'
  nextOpenTime?: string
  currentTime: string
}
