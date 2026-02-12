// WebSocket 服务 - 实时行情数据连接管理
// O6-005: WebSocket连接管理

import { useMarketStore } from '@/stores/market'

// WebSocket 连接状态
export enum WebSocketStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

// WebSocket 配置
const WS_CONFIG = {
  // Market Data Service WebSocket 地址
  // 注意：实际部署时需要根据环境配置调整
  BASE_URL: 'wss://market-data-service:8001/ws/public/quotes',
  // 心跳间隔（毫秒）
  HEARTBEAT_INTERVAL: 30000,
  // 重连延迟（毫秒）
  RECONNECT_DELAY: 3000,
  // 最大重连次数
  MAX_RECONNECT_ATTEMPTS: 3,
  // 连接超时（毫秒）
  CONNECTION_TIMEOUT: 10000,
}

// 订阅消息类型
interface SubscribeMessage {
  action: 'subscribe'
  symbols: string[]
}

interface UnsubscribeMessage {
  action: 'unsubscribe'
  symbols: string[]
}

// 行情数据消息
interface QuoteMessage {
  type: 'quote'
  data: {
    code: string
    name: string
    price: number
    change: number
    changeRate: number
    volume: number
    amount: number
    timestamp: string
  }
}

// 心跳消息
interface HeartbeatMessage {
  type: 'heartbeat'
  timestamp: string
}

type WebSocketMessage = SubscribeMessage | UnsubscribeMessage | QuoteMessage | HeartbeatMessage

// WebSocket 服务类
class WebSocketService {
  private ws: UniApp.SocketTask | null = null
  private status: WebSocketStatus = WebSocketStatus.DISCONNECTED
  private reconnectAttempts = 0
  private heartbeatTimer: number | null = null
  private reconnectTimer: number | null = null
  private connectionTimer: number | null = null
  private subscribedSymbols: Set<string> = new Set()
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map()
  private lastError: Error | null = null

  // 获取当前状态
  getStatus(): WebSocketStatus {
    return this.status
  }

  // 获取最后错误
  getLastError(): Error | null {
    return this.lastError
  }

  // 获取已订阅股票
  getSubscribedSymbols(): string[] {
    return Array.from(this.subscribedSymbols)
  }

  // 注册消息处理器
  onMessage(type: string, handler: (data: any) => void): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, [])
    }
    this.messageHandlers.get(type)?.push(handler)
  }

  // 移除消息处理器
  offMessage(type: string, handler: (data: any) => void): void {
    const handlers = this.messageHandlers.get(type)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  // 触发消息处理器
  private emitMessage(type: string, data: any): void {
    const handlers = this.messageHandlers.get(type)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`WebSocket message handler error for type ${type}:`, error)
        }
      })
    }
  }

  // 建立连接
  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.status === WebSocketStatus.CONNECTED) {
        console.log('[WebSocket] Already connected')
        resolve(true)
        return
      }

      if (this.status === WebSocketStatus.CONNECTING) {
        console.log('[WebSocket] Already connecting')
        resolve(false)
        return
      }

      this.status = WebSocketStatus.CONNECTING
      this.lastError = null
      this.emitMessage('statusChange', { status: WebSocketStatus.CONNECTING })

      console.log('[WebSocket] Connecting to', WS_CONFIG.BASE_URL)

      // 设置连接超时
      this.connectionTimer = setTimeout(() => {
        console.error('[WebSocket] Connection timeout')
        this.handleError(new Error('Connection timeout'))
        resolve(false)
      }, WS_CONFIG.CONNECTION_TIMEOUT) as unknown as number

      try {
        this.ws = uni.connectSocket({
          url: WS_CONFIG.BASE_URL,
          success: () => {
            console.log('[WebSocket] Socket connection initiated')
          },
          fail: (err) => {
            console.error('[WebSocket] Connection failed:', err)
            this.clearConnectionTimer()
            this.handleError(new Error(`Connection failed: ${err.errMsg || 'Unknown error'}`))
            resolve(false)
          },
        })

        // 监听连接打开
        this.ws?.onOpen(() => {
          console.log('[WebSocket] Connection opened')
          this.clearConnectionTimer()
          this.status = WebSocketStatus.CONNECTED
          this.reconnectAttempts = 0
          this.startHeartbeat()
          this.emitMessage('statusChange', { status: WebSocketStatus.CONNECTED })

          // 重新订阅之前的股票
          if (this.subscribedSymbols.size > 0) {
            this.subscribe(Array.from(this.subscribedSymbols))
          }

          resolve(true)
        })

        // 监听消息
        this.ws?.onMessage((res) => {
          this.handleMessage(res.data)
        })

        // 监听错误
        this.ws?.onError((err) => {
          console.error('[WebSocket] Error:', err)
          this.clearConnectionTimer()
          this.handleError(new Error(`WebSocket error: ${err.errMsg || 'Unknown error'}`))
          resolve(false)
        })

        // 监听关闭
        this.ws?.onClose((res) => {
          console.log('[WebSocket] Connection closed:', res)
          this.handleClose()
        })
      } catch (error) {
        this.clearConnectionTimer()
        this.handleError(error as Error)
        resolve(false)
      }
    })
  }

  // 断开连接
  disconnect(): void {
    console.log('[WebSocket] Disconnecting...')
    this.clearTimers()
    this.status = WebSocketStatus.DISCONNECTED

    if (this.ws) {
      try {
        this.ws.close({
          success: () => {
            console.log('[WebSocket] Connection closed successfully')
          },
          fail: (err) => {
            console.error('[WebSocket] Failed to close connection:', err)
          },
        })
      } catch (error) {
        console.error('[WebSocket] Error closing connection:', error)
      }
      this.ws = null
    }

    this.emitMessage('statusChange', { status: WebSocketStatus.DISCONNECTED })
  }

  // 订阅股票
  subscribe(symbols: string[]): void {
    if (!symbols || symbols.length === 0) {
      console.warn('[WebSocket] No symbols to subscribe')
      return
    }

    // 添加到已订阅集合
    symbols.forEach(symbol => this.subscribedSymbols.add(symbol))

    if (this.status !== WebSocketStatus.CONNECTED) {
      console.log('[WebSocket] Not connected, symbols queued for subscription:', symbols)
      return
    }

    const message: SubscribeMessage = {
      action: 'subscribe',
      symbols,
    }

    this.send(message)
    console.log('[WebSocket] Subscribed to:', symbols)
  }

  // 取消订阅
  unsubscribe(symbols: string[]): void {
    if (!symbols || symbols.length === 0) {
      return
    }

    // 从已订阅集合中移除
    symbols.forEach(symbol => this.subscribedSymbols.delete(symbol))

    if (this.status !== WebSocketStatus.CONNECTED) {
      return
    }

    const message: UnsubscribeMessage = {
      action: 'unsubscribe',
      symbols,
    }

    this.send(message)
    console.log('[WebSocket] Unsubscribed from:', symbols)
  }

  // 取消订阅所有
  unsubscribeAll(): void {
    const symbols = Array.from(this.subscribedSymbols)
    if (symbols.length > 0) {
      this.unsubscribe(symbols)
    }
    this.subscribedSymbols.clear()
  }

  // 发送消息
  private send(message: WebSocketMessage): void {
    if (this.status !== WebSocketStatus.CONNECTED || !this.ws) {
      console.warn('[WebSocket] Cannot send, not connected')
      return
    }

    try {
      const data = JSON.stringify(message)
      this.ws.send({
        data,
        success: () => {
          // console.log('[WebSocket] Message sent:', message)
        },
        fail: (err) => {
          console.error('[WebSocket] Failed to send message:', err)
        },
      })
    } catch (error) {
      console.error('[WebSocket] Error sending message:', error)
    }
  }

  // 处理消息
  private handleMessage(data: any): void {
    try {
      const message = typeof data === 'string' ? JSON.parse(data) : data

      // 触发对应类型的处理器
      if (message.type) {
        this.emitMessage(message.type, message.data || message)
      }

      // 处理行情数据 - 自动更新 Market Store
      if (message.type === 'quote' && message.data) {
        this.updateMarketStore(message.data)
      }

      // 处理心跳响应
      if (message.type === 'heartbeat') {
        console.log('[WebSocket] Heartbeat received:', message.timestamp)
      }
    } catch (error) {
      console.error('[WebSocket] Error handling message:', error, data)
    }
  }

  // 更新 Market Store
  private updateMarketStore(quoteData: any): void {
    try {
      const marketStore = useMarketStore()

      // 查找并更新对应股票的行情
      const existingIndex = marketStore.quotes.findIndex(q => q.code === quoteData.code)

      if (existingIndex !== -1) {
        // 更新现有行情
        const updatedQuote = {
          ...marketStore.quotes[existingIndex],
          price: quoteData.price,
          change: quoteData.change,
          changeRate: quoteData.changeRate,
          volume: quoteData.volume,
          updateTime: quoteData.timestamp || new Date().toISOString(),
        }
        marketStore.quotes[existingIndex] = updatedQuote
      }

      // 触发行情更新事件
      this.emitMessage('quoteUpdate', quoteData)
    } catch (error) {
      console.error('[WebSocket] Error updating market store:', error)
    }
  }

  // 处理连接关闭
  private handleClose(): void {
    this.ws = null
    this.clearTimers()

    if (this.status !== WebSocketStatus.DISCONNECTED) {
      this.status = WebSocketStatus.DISCONNECTED
      this.emitMessage('statusChange', { status: WebSocketStatus.DISCONNECTED })

      // 尝试重连
      this.attemptReconnect()
    }
  }

  // 处理错误
  private handleError(error: Error): void {
    this.lastError = error
    this.status = WebSocketStatus.ERROR
    this.emitMessage('error', { error: error.message })
    this.emitMessage('statusChange', { status: WebSocketStatus.ERROR, error: error.message })

    // 尝试重连
    this.attemptReconnect()
  }

  // 尝试重连
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= WS_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      console.error('[WebSocket] Max reconnection attempts reached')
      this.emitMessage('maxReconnectReached', { attempts: this.reconnectAttempts })
      return
    }

    this.reconnectAttempts++
    this.status = WebSocketStatus.RECONNECTING
    this.emitMessage('statusChange', {
      status: WebSocketStatus.RECONNECTING,
      attempt: this.reconnectAttempts,
    })

    console.log(`[WebSocket] Reconnecting in ${WS_CONFIG.RECONNECT_DELAY}ms (attempt ${this.reconnectAttempts}/${WS_CONFIG.MAX_RECONNECT_ATTEMPTS})`)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, WS_CONFIG.RECONNECT_DELAY) as unknown as number
  }

  // 启动心跳
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.status === WebSocketStatus.CONNECTED) {
        this.send({
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        } as any)
      }
    }, WS_CONFIG.HEARTBEAT_INTERVAL) as unknown as number
  }

  // 清除所有定时器
  private clearTimers(): void {
    this.clearHeartbeatTimer()
    this.clearReconnectTimer()
    this.clearConnectionTimer()
  }

  // 清除心跳定时器
  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  // 清除重连定时器
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  // 清除连接超时定时器
  private clearConnectionTimer(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer)
      this.connectionTimer = null
    }
  }
}

// 导出单例实例
export const websocketService = new WebSocketService()

// 导出类型
export type { SubscribeMessage, UnsubscribeMessage, QuoteMessage, HeartbeatMessage }
export { WS_CONFIG }
