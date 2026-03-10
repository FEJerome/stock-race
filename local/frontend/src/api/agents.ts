/**
 * Agent API client
 */
import { api, type PaginatedResponse } from './client'

export interface StrategyConfig {
  risk_tolerance: string
  sectors: string[]
  holding_period: string
  position_limit: string
  stop_loss: string
  market_scope: string
}

export interface Agent {
  id: string
  name: string
  initial_capital: number
  current_capital: number
  strategy: StrategyConfig
  model_provider: string
  model_name: string
  agent_level: 'intern' | 'manager' | 'partner'
  incentive_level: 'standard' | 'active' | 'aggressive'
  status: 'active' | 'paused'
  created_at: string
  updated_at: string
}

export interface CreateAgentRequest {
  name: string
  initial_capital: number
  strategy: StrategyConfig
  model_provider?: string
  model_name?: string
  agent_level?: 'intern' | 'manager' | 'partner'
  incentive_level?: 'standard' | 'active' | 'aggressive'
}

export interface UpdateAgentRequest {
  name?: string
  status?: 'active' | 'paused'
  incentive_level?: 'standard' | 'active' | 'aggressive'
  strategy?: StrategyConfig
}

export const agentApi = {
  /**
   * Create a new agent
   */
  create(data: CreateAgentRequest) {
    return api.post<Agent>('/api/agents', data)
  },

  /**
   * Get all agents with pagination
   */
  list(page = 1, pageSize = 20) {
    return api.get<PaginatedResponse<Agent>>(`/api/agents?page=${page}&page_size=${pageSize}`)
  },

  /**
   * Get a single agent by ID
   */
  get(id: string) {
    return api.get<Agent>(`/api/agents/${id}`)
  },

  /**
   * Update an agent
   */
  update(id: string, data: UpdateAgentRequest) {
    return api.patch<Agent>(`/api/agents/${id}`, data)
  },

  /**
   * Delete an agent
   */
  delete(id: string) {
    return api.delete<{ deleted_id: string }>(`/api/agents/${id}`)
  },

  /**
   * Pause an agent
   */
  pause(id: string) {
    return api.post<Agent>(`/api/agents/${id}/pause`, {})
  },

  /**
   * Resume an agent
   */
  resume(id: string) {
    return api.post<Agent>(`/api/agents/${id}/resume`, {})
  },
}
