// WebSocket 服务测试 - O6-005
// 测试 WebSocket 连接管理功能

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { websocketService, WebSocketStatus, WS_CONFIG } from '@/services/websocket'

describe('WebSocket Service - O6-005', () => {
  // Mock uni API
  const mockSocketTask = {
    onOpen: vi.fn(),
    onMessage: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
    close: vi.fn(),
    send: vi.fn(),
  }

  beforeEach(() => {
    // 重置服务状态
    vi.clearAllMocks()
    // @ts-ignore
    uni.connectSocket = vi.fn(() => mockSocketTask)
  })

  afterEach(() => {
    websocketService.disconnect()
  })

  describe('连接管理', () => {
    it('应正确初始化连接状态为 DISCONNECTED', () => {
      expect(websocketService.getStatus()).toBe(WebSocketStatus.DISCONNECTED)
    })

    it('连接成功后状态应变为 CONNECTED', async () => {
      const connectPromise = websocketService.connect()

      // 模拟连接成功
      const openCallback = mockSocketTask.onOpen.mock.calls[0][0]
      openCallback()

      const result = await connectPromise
      expect(result).toBe(true)
      expect(websocketService.getStatus()).toBe(WebSocketStatus.CONNECTED)
    })

    it('连接失败时应返回 false', async () => {
      // @ts-ignore
      uni.connectSocket = vi.fn(() => {
        throw new Error('Connection failed')
      })

      const result = await websocketService.connect()
      expect(result).toBe(false)
      expect(websocketService.getStatus()).toBe(WebSocketStatus.ERROR)
    })

    it('断开连接后状态应变为 DISCONNECTED', async () => {
      // 先连接
      const connectPromise = websocketService.connect()
      const openCallback = mockSocketTask.onOpen.mock.calls[0][0]
      openCallback()
      await connectPromise

      // 断开连接
      websocketService.disconnect()
      expect(websocketService.getStatus()).toBe(WebSocketStatus.DISCONNECTED)
    })
  })

  describe('订阅管理', () => {
    it('应正确添加股票到订阅列表', async () => {
      const symbols = ['000001.SZ', '600000.SH']
      websocketService.subscribe(symbols)

      const subscribed = websocketService.getSubscribedSymbols()
      expect(subscribed).toContain('000001.SZ')
      expect(subscribed).toContain('600000.SH')
    })

    it('应正确取消股票订阅', async () => {
      const symbols = ['000001.SZ', '600000.SH']
      websocketService.subscribe(symbols)

      websocketService.unsubscribe(['000001.SZ'])

      const subscribed = websocketService.getSubscribedSymbols()
      expect(subscribed).not.toContain('000001.SZ')
      expect(subscribed).toContain('600000.SH')
    })

    it('取消所有订阅后列表应为空', async () => {
      const symbols = ['000001.SZ', '600000.SH']
      websocketService.subscribe(symbols)

      websocketService.unsubscribeAll()

      const subscribed = websocketService.getSubscribedSymbols()
      expect(subscribed).toHaveLength(0)
    })

    it('重复订阅同一股票不应重复添加', () => {
      websocketService.subscribe(['000001.SZ'])
      websocketService.subscribe(['000001.SZ'])

      const subscribed = websocketService.getSubscribedSymbols()
      const count = subscribed.filter(s => s === '000001.SZ').length
      expect(count).toBe(1)
    })
  })

  describe('消息处理', () => {
    it('应正确处理行情数据消息', async () => {
      const quoteHandler = vi.fn()
      websocketService.onMessage('quote', quoteHandler)

      const connectPromise = websocketService.connect()
      const openCallback = mockSocketTask.onOpen.mock.calls[0][0]
      openCallback()
      await connectPromise

      // 模拟收到行情数据
      const messageCallback = mockSocketTask.onMessage.mock.calls[0][0]
      const quoteMessage = {
        data: JSON.stringify({
          type: 'quote',
          data: {
            code: '000001.SZ',
            name: '平安银行',
            price: 12.5,
            change: 0.3,
            changeRate: 2.46,
            volume: 1000000,
            timestamp: new Date().toISOString(),
          },
        }),
      }
      messageCallback(quoteMessage)

      expect(quoteHandler).toHaveBeenCalled()
    })

    it('应正确处理心跳消息', async () => {
      const heartbeatHandler = vi.fn()
      websocketService.onMessage('heartbeat', heartbeatHandler)

      const connectPromise = websocketService.connect()
      const openCallback = mockSocketTask.onOpen.mock.calls[0][0]
      openCallback()
      await connectPromise

      const messageCallback = mockSocketTask.onMessage.mock.calls[0][0]
      const heartbeatMessage = {
        data: JSON.stringify({
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        }),
      }
      messageCallback(heartbeatMessage)

      expect(heartbeatHandler).toHaveBeenCalled()
    })

    it('应正确处理状态变更消息', async () => {
      const statusHandler = vi.fn()
      websocketService.onMessage('statusChange', statusHandler)

      await websocketService.connect()

      expect(statusHandler).toHaveBeenCalled()
    })
  })

  describe('错误处理', () => {
    it('连接错误时应触发 error 消息', async () => {
      const errorHandler = vi.fn()
      websocketService.onMessage('error', errorHandler)

      const connectPromise = websocketService.connect()
      const errorCallback = mockSocketTask.onError.mock.calls[0][0]
      errorCallback({ errMsg: 'Connection refused' })

      await connectPromise
      expect(errorHandler).toHaveBeenCalledWith({ error: expect.any(String) })
    })

    it('应保存最后错误信息', async () => {
      // @ts-ignore
      uni.connectSocket = vi.fn(() => {
        throw new Error('Test error')
      })

      await websocketService.connect()
      const error = websocketService.getLastError()
      expect(error).toBeTruthy()
      expect(error?.message).toContain('Test error')
    })
  })

  describe('重连机制', () => {
    it('断开后应尝试重连', async () => {
      vi.useFakeTimers()

      const connectPromise = websocketService.connect()
      const openCallback = mockSocketTask.onOpen.mock.calls[0][0]
      openCallback()
      await connectPromise

      // 模拟断开
      const closeCallback = mockSocketTask.onClose.mock.calls[0][0]
      closeCallback({ code: 1006, reason: 'Connection lost' })

      // 推进时间触发重连
      vi.advanceTimersByTime(WS_CONFIG.RECONNECT_DELAY)

      expect(websocketService.getStatus()).toBe(WebSocketStatus.RECONNECTING)

      vi.useRealTimers()
    })

    it('达到最大重连次数后应停止重连', async () => {
      vi.useFakeTimers()

      const maxReconnectHandler = vi.fn()
      websocketService.onMessage('maxReconnectReached', maxReconnectHandler)

      // 连续触发断开多次
      for (let i = 0; i <= WS_CONFIG.MAX_RECONNECT_ATTEMPTS; i++) {
        const connectPromise = websocketService.connect()
        const closeCallback = mockSocketTask.onClose.mock.calls[0]?.[0]
        if (closeCallback) {
          closeCallback({ code: 1006 })
        } else {
          const errorCallback = mockSocketTask.onError.mock.calls[0]?.[0]
          if (errorCallback) errorCallback({ errMsg: 'Error' })
        }
        vi.advanceTimersByTime(WS_CONFIG.RECONNECT_DELAY)
      }

      expect(maxReconnectHandler).toHaveBeenCalled()

      vi.useRealTimers()
    })
  })

  describe('配置验证', () => {
    it('应包含正确的 WebSocket URL', () => {
      expect(WS_CONFIG.BASE_URL).toContain('/ws/public/quotes')
    })

    it('应配置心跳间隔', () => {
      expect(WS_CONFIG.HEARTBEAT_INTERVAL).toBeGreaterThan(0)
    })

    it('应配置重连延迟', () => {
      expect(WS_CONFIG.RECONNECT_DELAY).toBeGreaterThan(0)
    })

    it('应配置最大重连次数', () => {
      expect(WS_CONFIG.MAX_RECONNECT_ATTEMPTS).toBeGreaterThan(0)
    })
  })
})
