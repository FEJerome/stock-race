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
    return request.get<AIAccount[]>('/ai-accounts')
  },

  // 获取单个AI账户详情
  getAccount(id: string): Promise<AIAccount> {
    return request.get<AIAccount>(`/ai-accounts/${id}`)
  },

  // 创建AI账户
  createAccount(data: CreateAIAccountRequest): Promise<AIAccount> {
    return request.post<AIAccount>('/ai-accounts', data)
  },

  // 更新AI账户
  updateAccount(id: string, data: UpdateAIAccountRequest): Promise<AIAccount> {
    return request.put<AIAccount>(`/ai-accounts/${id}`, data)
  },

  // 删除AI账户
  deleteAccount(id: string): Promise<void> {
    return request.delete<void>(`/ai-accounts/${id}`)
  },

  // 获取AI决策列表
  getDecisions(params?: { accountId?: string; page?: number; pageSize?: number }): Promise<PaginatedResponse<AIDecision>> {
    return request.get<PaginatedResponse<AIDecision>>('/ai-accounts/decisions', params)
  },

  // 获取单个决策详情
  getDecision(id: string): Promise<AIDecision> {
    return request.get<AIDecision>(`/ai-accounts/decisions/${id}`)
  },

  // 触发AI决策
  triggerDecision(accountId: string): Promise<AIDecision> {
    return request.post<AIDecision>(`/ai-accounts/${accountId}/decide`)
  },

  // 获取决策统计
  getDecisionStats(accountId?: string): Promise<DecisionStats> {
    const url = accountId ? `/ai-accounts/${accountId}/stats` : '/ai-accounts/stats'
    return request.get<DecisionStats>(url)
  },

  // 获取基金经理表现
  getManagerPerformance(): Promise<ManagerPerformance[]> {
    return request.get<ManagerPerformance[]>('/ai-accounts/performance')
  },
}
