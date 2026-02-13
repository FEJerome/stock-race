// 游客模式API Mock数据
// 用于开发和单元测试

import type {
  GuestTokenResponse,
  GuestAIAccount,
  GuestChatResponse,
  GuestChatHistory,
  GuestBindResponse,
  CreateGuestAIAccountRequest,
  GuestChatRequest,
} from '@/types/guest'

// ==================== Mock 游客Token ====================

/**
 * Mock: 获取游客Token
 * POST /api/guest/auth/token
 */
export const mockGetGuestToken = async (
  code: string,
  hasAIAccount = false
): Promise<GuestTokenResponse> => {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 300))

  // 根据是否已有AI账户返回不同的过期时间
  const expiresIn = hasAIAccount ? 72 * 60 * 60 : 24 * 60 * 60

  return {
    guestToken: `guest_${code}_${Date.now()}`,
    openid: `openid_${code.substring(0, 10)}`,
    expiresIn,
    hasAIAccount,
  }
}

// ==================== Mock 临时AI账户 ====================

// Mock AI账户数据存储
const mockGuestAIAccounts: Map<string, GuestAIAccount> = new Map()

/**
 * Mock: 获取临时AI账户列表
 * GET /api/guest/ai-accounts
 */
export const mockGetGuestAIAccounts = async (): Promise<GuestAIAccount[]> => {
  await new Promise((resolve) => setTimeout(resolve, 200))
  return Array.from(mockGuestAIAccounts.values())
}

/**
 * Mock: 创建临时AI账户
 * POST /api/guest/ai-accounts
 */
export const mockCreateGuestAIAccount = async (
  data: CreateGuestAIAccountRequest
): Promise<GuestAIAccount> => {
  await new Promise((resolve) => setTimeout(resolve, 400))

  // 检查是否超过限制
  if (mockGuestAIAccounts.size >= 2) {
    throw new Error('已达到临时AI账户数量上限（2个）')
  }

  const id = `guest_ai_${Date.now()}`
  const account: GuestAIAccount = {
    id,
    name: data.name,
    school: data.school,
    riskLevel: data.riskLevel,
    initialCapital: data.initialCapital,
    currentAssets: data.initialCapital,
    returnRate: 0,
    returnAmount: 0,
    tradeCount: 0,
    createdAt: new Date().toISOString(),
  }

  mockGuestAIAccounts.set(id, account)
  return account
}

/**
 * Mock: 删除临时AI账户
 * DELETE /api/guest/ai-accounts/:id
 */
export const mockDeleteGuestAIAccount = async (id: string): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 200))

  if (!mockGuestAIAccounts.has(id)) {
    throw new Error('AI账户不存在')
  }

  mockGuestAIAccounts.delete(id)
}

/**
 * Mock: 清空所有临时AI账户（用于测试重置）
 */
export const mockClearGuestAIAccounts = (): void => {
  mockGuestAIAccounts.clear()
}

// ==================== Mock AI对话 ====================

// Mock 对话历史存储
const mockChatHistories: Map<string, GuestChatHistory> = new Map()

/**
 * Mock: AI对话
 * POST /api/guest/ai-accounts/:id/chat
 */
export const mockGuestChat = async (
  accountId: string,
  data: GuestChatRequest
): Promise<GuestChatResponse> => {
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // 获取或创建对话历史
  let history = mockChatHistories.get(accountId)
  if (!history) {
    history = {
      accountId,
      messages: [],
      totalTurns: 0,
      maxTurns: 10,
      remainingTurns: 10,
    }
    mockChatHistories.set(accountId, history)
  }

  // 检查剩余次数
  if (history.remainingTurns <= 0) {
    throw new Error('今日对话次数已用完，请登录后继续使用')
  }

  // 模拟AI回复
  const replies = [
    '根据当前市场分析，我建议关注科技板块的投资机会。',
    '从技术指标来看，该股票呈现多头排列，可以考虑适当建仓。',
    '近期市场波动较大，建议控制仓位，保持谨慎。',
    '该行业基本面良好，长期投资价值值得关注。',
    '建议分散投资，不要将所有资金集中在单一标的上。',
  ]
  const reply = replies[Math.floor(Math.random() * replies.length)]

  // 更新对话历史
  history.messages.push({
    role: 'user',
    content: data.message,
    timestamp: new Date().toISOString(),
  })
  history.messages.push({
    role: 'assistant',
    content: reply,
    timestamp: new Date().toISOString(),
  })
  history.totalTurns++
  history.remainingTurns--

  return {
    reply,
    remainingTurns: history.remainingTurns,
    confidence: 0.75 + Math.random() * 0.2,
  }
}

/**
 * Mock: 获取对话历史
 */
export const mockGetChatHistory = async (
  accountId: string
): Promise<GuestChatHistory | null> => {
  await new Promise((resolve) => setTimeout(resolve, 100))
  return mockChatHistories.get(accountId) || null
}

/**
 * Mock: 清空对话历史（用于测试重置）
 */
export const mockClearChatHistories = (): void => {
  mockChatHistories.clear()
}

// ==================== Mock 数据绑定 ====================

/**
 * Mock: 游客数据绑定到正式账户
 * POST /api/guest/bind
 */
export const mockBindGuestData = async (
  guestToken: string
): Promise<GuestBindResponse> => {
  await new Promise((resolve) => setTimeout(resolve, 600))

  const migratedCount = mockGuestAIAccounts.size

  // 模拟数据迁移成功后清空临时数据
  mockGuestAIAccounts.clear()
  mockChatHistories.clear()

  return {
    success: true,
    migratedAccounts: migratedCount,
    message: `成功迁移 ${migratedCount} 个AI账户到您的正式账户`,
  }
}

// ==================== Mock 工具函数 ====================

/**
 * 重置所有Mock数据（用于测试）
 */
export const resetGuestMocks = (): void => {
  mockGuestAIAccounts.clear()
  mockChatHistories.clear()
}

/**
 * 预置Mock数据（用于开发演示）
 */
export const seedGuestMockData = (): void => {
  // 添加一个示例AI账户
  const demoAccount: GuestAIAccount = {
    id: 'guest_ai_demo',
    name: '体验基金经理',
    school: '模拟大学',
    riskLevel: 'moderate',
    initialCapital: 100000,
    currentAssets: 108500,
    returnRate: 8.5,
    returnAmount: 8500,
    tradeCount: 12,
    createdAt: new Date().toISOString(),
  }
  mockGuestAIAccounts.set(demoAccount.id, demoAccount)

  // 添加一些对话历史
  const demoHistory: GuestChatHistory = {
    accountId: demoAccount.id,
    messages: [
      {
        role: 'user',
        content: '你好，请分析一下当前市场情况',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        role: 'assistant',
        content: '当前市场整体呈现震荡格局，建议您关注科技和消费板块的投资机会。',
        timestamp: new Date(Date.now() - 3500000).toISOString(),
      },
    ],
    totalTurns: 1,
    maxTurns: 10,
    remainingTurns: 9,
  }
  mockChatHistories.set(demoAccount.id, demoHistory)
}
