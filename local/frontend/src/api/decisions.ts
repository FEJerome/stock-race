/**
 * Decision API client
 */
import { api } from './client'

export interface Decision {
  id: string
  agent_id: string
  timestamp: string
  action: 'buy' | 'sell' | 'hold'
  symbol?: string
  quantity?: number
  price?: number
  reason: string
  confidence: number
  market_data_summary: string
  news_summary?: string
  tokens_used: number
  cost_usd: number
}

export interface DecisionHistoryResponse {
  decisions: Decision[]
  total: number
  page: number
  page_size: number
}

export const decisionApi = {
  /**
   * Get decision history for an agent
   */
  getHistory(agentId: string, page = 1, pageSize = 20) {
    return api.get<DecisionHistoryResponse>(`/api/agents/${agentId}/decisions/history?page=${page}&page_size=${pageSize}`)
  },

  /**
   * Get a single decision by ID
   */
  getDecision(agentId: string, decisionId: string) {
    return api.get<Decision>(`/api/agents/${agentId}/decisions/${decisionId}`)
  },
}
