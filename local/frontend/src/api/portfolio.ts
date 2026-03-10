/**
 * Portfolio API client
 */
import { api } from './client'

export interface Portfolio {
  agent_id: string
  total_value: number
  cash: number
  market_value: number
  total_return: number
  total_return_percent: number
  positions: Position[]
  history: PortfolioHistoryPoint[]
}

export interface Position {
  symbol: string
  name: string
  quantity: number
  avg_cost: number
  current_price: number
  market_value: number
  unrealized_pnl: number
  unrealized_pnl_percent: number
  weight: number
}

export interface PortfolioHistoryPoint {
  timestamp: string
  total_value: number
  cash: number
  market_value: number
}

export interface PerformanceMetrics {
  total_return: number
  total_return_percent: number
  sharpe_ratio: number
  max_drawdown: number
  max_drawdown_percent: number
  win_rate: number
  profit_factor: number
  volatility: number
  alpha: number
  beta: number
}

export const portfolioApi = {
  /**
   * Get portfolio overview for an agent
   */
  getPortfolio(agentId: string) {
    return api.get<Portfolio>(`/api/trading/${agentId}/portfolio`)
  },

  /**
   * Get portfolio performance metrics
   */
  getPerformance(agentId: string) {
    return api.get<PerformanceMetrics>(`/api/trading/${agentId}/performance`)
  },

  /**
   * Get portfolio history
   */
  getHistory(agentId: string, days = 30) {
    return api.get<{ history: PortfolioHistoryPoint[] }>(`/api/trading/${agentId}/history?days=${days}`)
  },
}
