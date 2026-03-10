/**
 * Token API client
 */
import { api } from './client'

export interface TokenStats {
  total_tokens: number
  total_cost_usd: number
  total_cost_cny: number
  avg_cost_per_decision: number
  decision_count: number
  by_model: ModelTokenStats[]
  by_agent: AgentTokenStats[]
  daily_stats: DailyTokenStats[]
}

export interface ModelTokenStats {
  model_name: string
  provider: string
  total_tokens: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
  cost_cny: number
  decision_count: number
}

export interface AgentTokenStats {
  agent_id: string
  agent_name: string
  total_tokens: number
  cost_usd: number
  cost_cny: number
  decision_count: number
}

export interface DailyTokenStats {
  date: string
  total_tokens: number
  cost_usd: number
  decision_count: number
}

export interface TokenCostConfig {
  model_name: string
  provider: string
  input_price_per_1k: number
  output_price_per_1k: number
  currency: string
}

export const tokenApi = {
  /**
   * Get overall token statistics
   */
  getStats() {
    return api.get<TokenStats>('/api/agents/tokens/stats')
  },

  /**
   * Get token stats for a specific agent (uses global stats)
   * Note: Backend currently only supports global stats
   */
  getAgentStats(_agentId: string) {
    return api.get<TokenStats>('/api/agents/tokens/stats')
  },

  /**
   * Get token cost configuration
   */
  getCostConfig() {
    return api.get<TokenCostConfig[]>('/api/agents/tokens/cost-config')
  },
}
