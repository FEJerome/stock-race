// AI服务相关API
import { request } from './request'
import type {
  AIAccount,
  CreateAIAccountRequest,
  UpdateAIAccountRequest,
  AIDecision,
  DecisionStats,
  ManagerPerformance,
} from '@/types/ai'
import type { PaginatedResponse } from '@/types/api'

export const aiApi = {
  // 获取AI账户列表
  getAccounts(): Promise<AIAccount[]> {
    return request.get<AIAccount[]>('/v1/ai-accounts')
  },

  // 获取单个AI账户详情
  getAccount(id: string): Promise<AIAccount> {
    return request.get<AIAccount>(`/v1/ai-accounts/${id}`)
  },

  // 创建AI账户
  createAccount(data: CreateAIAccountRequest): Promise<AIAccount> {
    return request.post<AIAccount>('/v1/ai-accounts', data)
  },

  // 更新AI账户
  updateAccount(id: string, data: UpdateAIAccountRequest): Promise<AIAccount> {
    return request.put<AIAccount>(`/v1/ai-accounts/${id}`, data)
  },

  // 删除AI账户
  deleteAccount(id: string): Promise<void> {
    return request.delete<void>(`/v1/ai-accounts/${id}`)
  },

  // 获取AI决策列表
  getDecisions(params?: { accountId?: string; page?: number; pageSize?: number }): Promise<PaginatedResponse<AIDecision>> {
    return request.get<PaginatedResponse<AIDecision>>('/v1/ai/decisions', params)
  },

  // 获取单个决策详情
  getDecision(id: string): Promise<AIDecision> {
    return request.get<AIDecision>(`/v1/ai/decisions/${id}`)
  },

  // 触发AI决策
  triggerDecision(accountId: string): Promise<AIDecision> {
    return request.post<AIDecision>(`/v1/ai/decisions`, { accountId })
  },

  // 获取决策统计
  getDecisionStats(accountId?: string): Promise<DecisionStats> {
    const url = accountId ? `/v1/ai-accounts/${accountId}/stats` : '/v1/ai-accounts/stats'
    return request.get<DecisionStats>(url)
  },

  // 获取基金经理表现
  getManagerPerformance(): Promise<ManagerPerformance[]> {
    return request.get<ManagerPerformance[]>('/v1/ai-accounts/performance')
  },
}
