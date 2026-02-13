// 游客模式API接口封装
// 对应架构文档: 005-MINIPROGRAM-GUEST-MODE.md
// API路径: /api/v1/guest/*

import { request } from './request'
import type {
  GuestTokenResponse,
  GuestAIAccount,
  GuestChatResponse,
  GuestBindResponse,
  GuestTokenRequest,
  CreateGuestAIAccountRequest,
  GuestChatRequest,
  GuestStatusCheckResponse,
} from '@/types/guest'

// ==================== 配置 ====================

// 游客API基础路径
const GUEST_API_BASE = '/v1/guest'

// ==================== 游客认证API ====================

/**
 * 检查游客账户状态
 * GET /api/v1/guest/status
 *
 * @param guestToken 游客Token
 * @returns 游客状态信息
 */
export const checkGuestStatus = async (
  guestToken: string
): Promise<GuestStatusCheckResponse> => {
  return request.get<GuestStatusCheckResponse>(`${GUEST_API_BASE}/status`, {
    headers: {
      'X-Guest-Token': guestToken,
    },
  })
}

/**
 * 获取游客访问令牌
 * POST /api/v1/guest/auth/token
 *
 * @param code wx.login获取的code
 * @param deviceId 设备指纹（可选）
 * @returns 游客Token信息
 */
export const getGuestToken = async (
  code: string,
  deviceId?: string
): Promise<GuestTokenResponse> => {
  const data: GuestTokenRequest = { code }
  if (deviceId) {
    data.deviceId = deviceId
  }

  return request.post<GuestTokenResponse>(`${GUEST_API_BASE}/auth/token`, data)
}

// ==================== 临时AI账户API ====================

/**
 * 获取临时AI账户列表
 * GET /api/v1/guest/ai-accounts
 *
 * @returns 临时AI账户列表
 */
export const getGuestAIAccounts = async (): Promise<GuestAIAccount[]> => {
  return request.get<GuestAIAccount[]>(`${GUEST_API_BASE}/ai-accounts`)
}

/**
 * 创建临时AI账户
 * POST /api/v1/guest/ai-accounts
 *
 * @param data 创建参数
 * @returns 创建的AI账户
 */
export const createGuestAIAccount = async (
  data: CreateGuestAIAccountRequest
): Promise<GuestAIAccount> => {
  return request.post<GuestAIAccount>(`${GUEST_API_BASE}/ai-accounts`, data)
}

/**
 * 删除临时AI账户
 * DELETE /api/v1/guest/ai-accounts/:id
 *
 * @param id AI账户ID
 */
export const deleteGuestAIAccount = async (id: string): Promise<void> => {
  return request.delete<void>(`${GUEST_API_BASE}/ai-accounts/${id}`)
}

/**
 * 获取临时AI账户详情
 * GET /api/v1/guest/ai-accounts/:id
 *
 * @param id AI账户ID
 * @returns AI账户详情
 */
export const getGuestAIAccountDetail = async (id: string): Promise<GuestAIAccount> => {
  return request.get<GuestAIAccount>(`${GUEST_API_BASE}/ai-accounts/${id}`)
}

// ==================== AI对话API ====================

/**
 * 游客AI对话
 * POST /api/v1/guest/ai-accounts/:id/chat
 *
 * @param accountId AI账户ID
 * @param message 用户消息
 * @param context 上下文（可选）
 * @returns AI回复
 */
export const guestChat = async (
  accountId: string,
  message: string,
  context?: { role: 'user' | 'assistant'; content: string }[]
): Promise<GuestChatResponse> => {
  const data: GuestChatRequest = { message }
  if (context && context.length > 0) {
    data.context = context.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: new Date().toISOString(),
    }))
  }

  return request.post<GuestChatResponse>(`${GUEST_API_BASE}/ai-accounts/${accountId}/chat`, data)
}

/**
 * 获取对话历史
 * GET /api/v1/guest/ai-accounts/:id/chat/history
 *
 * @param accountId AI账户ID
 * @returns 对话历史
 */
export const getGuestChatHistory = async (
  accountId: string
): Promise<{
  messages: { role: 'user' | 'assistant'; content: string; timestamp: string }[]
  totalTurns: number
  remainingTurns: number
}> => {
  return request.get(`${GUEST_API_BASE}/ai-accounts/${accountId}/chat/history`)
}

// ==================== 数据绑定API ====================

/**
 * 游客数据绑定到正式账户
 * POST /api/v1/guest/bind
 *
 * @param guestToken 游客Token
 * @returns 绑定结果
 */
export const bindGuestData = async (guestToken: string): Promise<GuestBindResponse> => {
  return request.post<GuestBindResponse>(`${GUEST_API_BASE}/bind`, {
    guestToken,
  })
}

// ==================== 导出API对象 ====================

export const guestApi = {
  // 认证
  checkGuestStatus,
  getGuestToken,

  // AI账户
  getGuestAIAccounts,
  createGuestAIAccount,
  deleteGuestAIAccount,
  getGuestAIAccountDetail,

  // 对话
  guestChat,
  getGuestChatHistory,

  // 数据绑定
  bindGuestData,
}

export default guestApi
