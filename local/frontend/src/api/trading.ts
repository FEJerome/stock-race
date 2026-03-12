/**
 * Trading API client
 */
import { api } from './client'

export interface Trade {
  id: string
  agent_id: string
  symbol: string
  name?: string
  action: 'buy' | 'sell'
  quantity: number
  price: number
  total_amount: number
  realized_pnl?: number
  decision_reason?: string
  timestamp: string
}

export interface TradeCreate {
  symbol: string
  action: 'buy' | 'sell'
  quantity: number
  price: number
}

export interface Position {
  agent_id: string
  symbol: string
  name?: string
  quantity: number
  avg_cost: number
  current_price?: number
  market_value?: number
  unrealized_pnl?: number
  unrealized_pnl_pct?: number
}

export interface TradeHistoryResponse {
  items: Trade[]
  total: number
}

export interface PositionListResponse {
  items: Position[]
  total: number
}

export const tradingApi = {
  /**
   * Buy stock
   */
  buy(agentId: string, data: TradeCreate) {
    return api.post<Trade>(`/api/trading/${agentId}/buy`, data)
  },

  /**
   * Sell stock
   */
  sell(agentId: string, data: TradeCreate) {
    return api.post<Trade>(`/api/trading/${agentId}/sell`, data)
  },

  /**
   * Get positions
   */
  getPositions(agentId: string) {
    return api.get<PositionListResponse>(`/api/trading/${agentId}/positions`)
  },

  /**
   * Get trade history
   */
  getTrades(agentId: string, limit = 50) {
    return api.get<TradeHistoryResponse>(`/api/trading/${agentId}/trades?limit=${limit}`)
  },
}
