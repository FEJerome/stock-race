/**
 * WebSocket服务单元测试
 *
 * 测试范围: WebSocket连接、订阅、重连、降级
 *
 * @author Miniprogram开发团队
 * @date 2026-02-12
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock uni API
const mockSocket = {
  onOpen: vi.fn(),
  onMessage: vi.fn(),
  onClose: vi.fn(),
  onError: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
}

const mockUni = {
  connectSocket: vi.fn(() => mockSocket),
  showToast: vi.fn(),
}

// @ts-ignore
global.uni = mockUni

// 导入被测模块
import {
  connect,
  disconnect,
  subscribe,
  unsubscribe,
  onMessage,
  getConnectionStatus,
  isSubscribed,
  getSubscriptionCount,
  wsStatus,
  isConnected,
  isHttpFallback,
  subscribedList,
  type QuoteUpdate,
  type WSMessage,
} from '@/services/websocket'

describe('TC-WS-001: WebSocket连接管理', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    disconnect()
  })

  afterEach(() => {
    disconnect()
  })

  it('应该正确建立WebSocket连接', async () => {
    mockUni.connectSocket.mockReturnValue(mockSocket)

    const connectPromise = connect()

    // 模拟连接成功
    setTimeout(() => {
      const onOpenHandler = mockSocket.onOpen.mock.calls[0][0]
      onOpenHandler()
    }, 10)

    const result = await connectPromise

    expect(mockUni.connectSocket).toHaveBeenCalledWith({
      url: 'ws://market-data:8001/ws/public/quotes',
      success: expect.any(Function),
      fail: expect.any(Function),
    })
    expect(result).toBe(true)
    expect(isConnected.value).toBe(true)
  })

  it('应该正确处理连接失败', async () => {
    mockUni.connectSocket.mockImplementation(({ fail }) => {
      fail(new Error('Connection failed'))
      return mockSocket
    })

    const result = await connect()

    expect(result).toBe(false)
    expect(wsStatus.value).toBe('error')
  })

  it('应该正确断开连接', () => {
    connect()
    disconnect()

    expect(mockSocket.close).toHaveBeenCalled()
    expect(wsStatus.value).toBe('disconnected')
  })
})

describe('TC-WS-002: 股票订阅管理', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    disconnect()
  })

  it('应该正确订阅股票', async () => {
    mockUni.connectSocket.mockReturnValue(mockSocket)

    const connectPromise = connect()
    setTimeout(() => {
      const onOpenHandler = mockSocket.onOpen.mock.calls[0][0]
      onOpenHandler()
    }, 10)
    await connectPromise

    const result = subscribe(['000001.SZ', '000002.SZ'])

    expect(result).toBe(true)
    expect(isSubscribed('000001.SZ')).toBe(true)
    expect(isSubscribed('000002.SZ')).toBe(true)
    expect(getSubscriptionCount()).toBe(2)

    expect(mockSocket.send).toHaveBeenCalledWith({
      data: JSON.stringify({
        action: 'subscribe',
        symbols: ['000001.SZ', '000002.SZ'],
      }),
    })
  })

  it('应该正确取消订阅股票', async () => {
    mockUni.connectSocket.mockReturnValue(mockSocket)

    const connectPromise = connect()
    setTimeout(() => {
      const onOpenHandler = mockSocket.onOpen.mock.calls[0][0]
      onOpenHandler()
    }, 10)
    await connectPromise

    subscribe(['000001.SZ', '000002.SZ'])
    unsubscribe(['000001.SZ'])

    expect(isSubscribed('000001.SZ')).toBe(false)
    expect(isSubscribed('000002.SZ')).toBe(true)
    expect(getSubscriptionCount()).toBe(1)

    expect(mockSocket.send).toHaveBeenCalledWith({
      data: JSON.stringify({
        action: 'unsubscribe',
        symbols: ['000001.SZ'],
      }),
    })
  })

  it('应该限制最大订阅数量', async () => {
    mockUni.connectSocket.mockReturnValue(mockSocket)

    const connectPromise = connect()
    setTimeout(() => {
      const onOpenHandler = mockSocket.onOpen.mock.calls[0][0]
      onOpenHandler()
    }, 10)
    await connectPromise

    // 尝试订阅超过50只股票
    const symbols = Array.from({ length: 55 }, (_, i) => `00000${i}.SZ`)
    const result = subscribe(symbols)

    expect(result).toBe(false)
    expect(mockUni.showToast).toHaveBeenCalledWith({
      title: '最多订阅50只股票',
      icon: 'none',
    })
  })
})

describe('TC-WS-003: 消息处理', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    disconnect()
  })

  it('应该正确接收行情更新消息', async () => {
    mockUni.connectSocket.mockReturnValue(mockSocket)

    const connectPromise = connect()
    setTimeout(() => {
      const onOpenHandler = mockSocket.onOpen.mock.calls[0][0]
      onOpenHandler()
    }, 10)
    await connectPromise

    const handler = vi.fn()
    const unsubscribe = onMessage(handler)

    const mockMessage: WSMessage = {
      type: 'quote_update',
      timestamp: '2026-02-12T10:00:00Z',
      data: [
        {
          symbol: '000001.SZ',
          name: '平安银行',
          current: 12.58,
          change: 0.29,
          changePercent: 2.35,
          volume: 152300000,
          turnover: 1915900000,
          timestamp: '2026-02-12T10:00:00Z',
        },
      ],
    }

    const onMessageHandler = mockSocket.onMessage.mock.calls[0][0]
    onMessageHandler({ data: JSON.stringify(mockMessage) })

    expect(handler).toHaveBeenCalledWith(mockMessage)

    unsubscribe()
  })
})

describe('TC-WS-004: HTTP降级模式', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    disconnect()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('应该在多次重连失败后切换到HTTP降级模式', async () => {
    mockUni.connectSocket.mockImplementation(() => {
      setTimeout(() => {
        const onErrorHandler = mockSocket.onError.mock.calls[0]?.[0]
        if (onErrorHandler) onErrorHandler(new Error('Connection failed'))
      }, 10)
      return mockSocket
    })

    connect()

    // 等待多次重连尝试
    for (let i = 0; i < 15; i++) {
      await vi.advanceTimersByTimeAsync(35000)
    }

    expect(isHttpFallback.value).toBe(true)
  })
})

describe('TC-WS-005: 自动重连', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    disconnect()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('应该在连接断开后自动重连', async () => {
    mockUni.connectSocket.mockReturnValue(mockSocket)

    connect()

    // 模拟连接断开
    setTimeout(() => {
      const onCloseHandler = mockSocket.onClose.mock.calls[0]?.[0]
      if (onCloseHandler) onCloseHandler()
    }, 10)

    await vi.advanceTimersByTimeAsync(100)

    // 等待重连定时器
    await vi.advanceTimersByTimeAsync(2000)

    expect(mockUni.connectSocket).toHaveBeenCalledTimes(2)
  })
})

/**
 * 测试覆盖统计:
 *
 * 测试套件: 5个
 * - TC-WS-001: WebSocket连接管理
 * - TC-WS-002: 股票订阅管理
 * - TC-WS-003: 消息处理
 * - TC-WS-004: HTTP降级模式
 * - TC-WS-005: 自动重连
 *
 * 测试用例: 10个
 * 预期结果: 全部通过
 */
