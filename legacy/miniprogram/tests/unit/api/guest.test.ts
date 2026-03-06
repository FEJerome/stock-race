/**
 * 游客模式API单元测试
 *
 * 测试范围: /api/guest/* 接口
 * 测试目标: 验证游客Token、临时AI账户、AI对话、数据绑定接口
 *
 * @author Miniprogram开发团队
 * @date 2026-02-12
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================================
// Mock 请求模块
// ============================================================================

const mockRequest = {
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}

vi.mock('@/api/request', () => ({
  request: mockRequest,
}))

// 导入被测模块（在mock之后）
import {
  getGuestToken,
  getGuestAIAccounts,
  createGuestAIAccount,
  deleteGuestAIAccount,
  getGuestAIAccountDetail,
  guestChat,
  getGuestChatHistory,
  bindGuestData,
  guestApi,
} from '@/api/guest'

import type {
  GuestTokenResponse,
  GuestAIAccount,
  GuestChatResponse,
  GuestBindResponse,
} from '@/types/guest'

// ============================================================================
// Mock 数据
// ============================================================================

const mockGuestTokenResponse: GuestTokenResponse = {
  guestToken: 'guest_token_123456',
  openid: 'openid_abc123',
  expiresIn: 86400,
  hasAIAccount: false,
}

const mockGuestAIAccount: GuestAIAccount = {
  id: 'guest_ai_001',
  name: '体验基金经理',
  school: '模拟大学',
  riskLevel: 'moderate',
  initialCapital: 100000,
  currentAssets: 108500,
  returnRate: 8.5,
  returnAmount: 8500,
  tradeCount: 12,
  createdAt: '2026-02-12T10:00:00Z',
}

const mockGuestChatResponse: GuestChatResponse = {
  reply: '根据当前市场分析，我建议关注科技板块的投资机会。',
  remainingTurns: 9,
  confidence: 0.85,
}

const mockGuestBindResponse: GuestBindResponse = {
  success: true,
  migratedAccounts: 1,
  message: '成功迁移 1 个AI账户到您的正式账户',
}

// ============================================================================
// 测试套件: 游客认证API
// ============================================================================

describe('TC-GUEST-001: 获取游客Token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确获取游客Token', async () => {
    mockRequest.post.mockResolvedValue(mockGuestTokenResponse)

    const result = await getGuestToken('wx_code_123')

    expect(mockRequest.post).toHaveBeenCalledWith(
      '/api/guest/auth/token',
      { code: 'wx_code_123' }
    )
    expect(result).toEqual(mockGuestTokenResponse)
    expect(result.expiresIn).toBe(86400)
    expect(result.hasAIAccount).toBe(false)
  })

  it('应该支持设备指纹参数', async () => {
    mockRequest.post.mockResolvedValue(mockGuestTokenResponse)

    await getGuestToken('wx_code_123', 'device_abc123')

    expect(mockRequest.post).toHaveBeenCalledWith(
      '/api/guest/auth/token',
      { code: 'wx_code_123', deviceId: 'device_abc123' }
    )
  })
})

// ============================================================================
// 测试套件: 临时AI账户API
// ============================================================================

describe('TC-GUEST-002: 获取临时AI账户列表', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确获取AI账户列表', async () => {
    mockRequest.get.mockResolvedValue([mockGuestAIAccount])

    const result = await getGuestAIAccounts()

    expect(mockRequest.get).toHaveBeenCalledWith('/api/guest/ai-accounts')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('体验基金经理')
  })
})

describe('TC-GUEST-003: 创建临时AI账户', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确创建AI账户', async () => {
    mockRequest.post.mockResolvedValue(mockGuestAIAccount)

    const createData = {
      name: '体验基金经理',
      school: '模拟大学',
      riskLevel: 'moderate' as const,
      initialCapital: 100000,
    }

    const result = await createGuestAIAccount(createData)

    expect(mockRequest.post).toHaveBeenCalledWith(
      '/api/guest/ai-accounts',
      createData
    )
    expect(result.name).toBe('体验基金经理')
    expect(result.riskLevel).toBe('moderate')
  })
})

describe('TC-GUEST-004: 删除临时AI账户', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确删除AI账户', async () => {
    mockRequest.delete.mockResolvedValue(undefined)

    await deleteGuestAIAccount('guest_ai_001')

    expect(mockRequest.delete).toHaveBeenCalledWith('/api/guest/ai-accounts/guest_ai_001')
  })
})

describe('TC-GUEST-005: 获取AI账户详情', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确获取AI账户详情', async () => {
    mockRequest.get.mockResolvedValue(mockGuestAIAccount)

    const result = await getGuestAIAccountDetail('guest_ai_001')

    expect(mockRequest.get).toHaveBeenCalledWith('/api/guest/ai-accounts/guest_ai_001')
    expect(result.id).toBe('guest_ai_001')
    expect(result.returnRate).toBe(8.5)
  })
})

// ============================================================================
// 测试套件: AI对话API
// ============================================================================

describe('TC-GUEST-006: 游客AI对话', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确发送对话消息', async () => {
    mockRequest.post.mockResolvedValue(mockGuestChatResponse)

    const result = await guestChat('guest_ai_001', '你好，请分析市场情况')

    expect(mockRequest.post).toHaveBeenCalledWith(
      '/api/guest/ai-accounts/guest_ai_001/chat',
      { message: '你好，请分析市场情况' }
    )
    expect(result.reply).toContain('科技板块')
    expect(result.remainingTurns).toBe(9)
  })

  it('应该支持上下文参数', async () => {
    mockRequest.post.mockResolvedValue(mockGuestChatResponse)

    const context = [
      { role: 'user' as const, content: '你好' },
      { role: 'assistant' as const, content: '你好！' },
    ]

    await guestChat('guest_ai_001', '今天行情怎么样？', context)

    expect(mockRequest.post).toHaveBeenCalledWith(
      '/api/guest/ai-accounts/guest_ai_001/chat',
      expect.objectContaining({
        message: '今天行情怎么样？',
        context: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: '你好' }),
          expect.objectContaining({ role: 'assistant', content: '你好！' }),
        ]),
      })
    )
  })
})

describe('TC-GUEST-007: 获取对话历史', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确获取对话历史', async () => {
    const mockHistory = {
      messages: [
        { role: 'user', content: '你好', timestamp: '2026-02-12T10:00:00Z' },
        { role: 'assistant', content: '你好！', timestamp: '2026-02-12T10:00:01Z' },
      ],
      totalTurns: 1,
      remainingTurns: 9,
    }
    mockRequest.get.mockResolvedValue(mockHistory)

    const result = await getGuestChatHistory('guest_ai_001')

    expect(mockRequest.get).toHaveBeenCalledWith(
      '/api/guest/ai-accounts/guest_ai_001/chat/history'
    )
    expect(result.messages).toHaveLength(2)
    expect(result.remainingTurns).toBe(9)
  })
})

// ============================================================================
// 测试套件: 数据绑定API
// ============================================================================

describe('TC-GUEST-008: 游客数据绑定', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确绑定游客数据到正式账户', async () => {
    mockRequest.post.mockResolvedValue(mockGuestBindResponse)

    const result = await bindGuestData('guest_token_123')

    expect(mockRequest.post).toHaveBeenCalledWith(
      '/api/guest/bind',
      { guestToken: 'guest_token_123' }
    )
    expect(result.success).toBe(true)
    expect(result.migratedAccounts).toBe(1)
  })
})

// ============================================================================
// 测试套件: API对象导出
// ============================================================================

describe('TC-GUEST-009: API对象导出', () => {
  it('应该导出所有API方法', () => {
    expect(guestApi.getGuestToken).toBeDefined()
    expect(guestApi.getGuestAIAccounts).toBeDefined()
    expect(guestApi.createGuestAIAccount).toBeDefined()
    expect(guestApi.deleteGuestAIAccount).toBeDefined()
    expect(guestApi.getGuestAIAccountDetail).toBeDefined()
    expect(guestApi.guestChat).toBeDefined()
    expect(guestApi.getGuestChatHistory).toBeDefined()
    expect(guestApi.bindGuestData).toBeDefined()
  })
})

// ============================================================================
// 测试报告统计
// ============================================================================

/**
 * 测试覆盖统计:
 *
 * 测试套件: 9个
 * - TC-GUEST-001: 获取游客Token
 * - TC-GUEST-002: 获取临时AI账户列表
 * - TC-GUEST-003: 创建临时AI账户
 * - TC-GUEST-004: 删除临时AI账户
 * - TC-GUEST-005: 获取AI账户详情
 * - TC-GUEST-006: 游客AI对话
 * - TC-GUEST-007: 获取对话历史
 * - TC-GUEST-008: 游客数据绑定
 * - TC-GUEST-009: API对象导出
 *
 * 测试用例: 10个
 * 预期结果: 全部通过
 */
