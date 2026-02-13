// 交易相关API
import { request } from './request'
import type { Holding, Trade, PortfolioOverview, TradeFilter, ProfitStats } from '@/types/trading'
import type { PaginatedResponse } from '@/types/api'

export const tradingApi = {
  // 获取投资组合概览
  getPortfolioOverview(): Promise<PortfolioOverview> {
    return request.get<PortfolioOverview>('/v1/portfolios/overview')
  },

  // 获取持仓列表
  getHoldings(): Promise<Holding[]> {
    return request.get<Holding[]>('/v1/portfolios')
  },

  // 获取单个持仓详情
  getHolding(stockCode: string): Promise<Holding> {
    return request.get<Holding>(`/v1/portfolios/${stockCode}`)
  },

  // 获取交易记录列表
  getTrades(params?: TradeFilter & { page?: number; pageSize?: number }): Promise<PaginatedResponse<Trade>> {
    return request.get<PaginatedResponse<Trade>>('/v1/trades', params)
  },

  // 获取单个交易详情
  getTrade(id: string): Promise<Trade> {
    return request.get<Trade>(`/v1/trades/${id}`)
  },

  // 执行买入
  buy(data: { stockCode: string; quantity: number; price?: number; accountId?: string }): Promise<Trade> {
    return request.post<Trade>('/v1/trades', data)
  },

  // 执行卖出
  sell(data: { stockCode: string; quantity: number; price?: number; accountId?: string }): Promise<Trade> {
    return request.post<Trade>('/v1/trades', data)
  },

  // 获取收益统计
  getProfitStats(): Promise<ProfitStats> {
    return request.get<ProfitStats>('/v1/portfolios/profit-stats')
  },
}
