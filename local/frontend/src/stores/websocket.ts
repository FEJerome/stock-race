/**
 * WebSocket Store - Pinia
 * 管理 WebSocket 连接、自动重连、心跳检测和消息订阅/发布
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// WebSocket 消息类型
export interface WSMessage {
  type: string
  data: unknown
  timestamp?: string
}

// 行情数据消息
export interface MarketQuoteMessage extends WSMessage {
  type: 'quote_update'
  data: {
    symbol: string
    name: string
    price: number
    change: number
    change_percent: number
    volume: number
    timestamp: string
  }
}

// Agent 交易通知
export interface AgentTradeMessage extends WSMessage {
  type: 'trade_notification'
  data: {
    agent_id: string
    action: 'buy' | 'sell'
    symbol: string
    quantity: number
    price: number
    total_value: number
    timestamp: string
  }
}

// Agent 决策通知
export interface AgentDecisionMessage extends WSMessage {
  type: 'decision_notification'
  data: {
    agent_id: string
    decision_id: string
    action: 'buy' | 'sell' | 'hold'
    symbol: string
    confidence: number
    reason: string
    timestamp: string
  }
}

// 连接状态
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

// 订阅回调函数类型
type MessageHandler = (message: WSMessage) => void

/**
 * ConnectionManager 类 - 管理单个 WebSocket 连接
 */
class ConnectionManager {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 3000
  private heartbeatInterval = 30000
  private heartbeatTimer: number | null = null
  private reconnectTimer: number | null = null
  private messageHandlers: Set<MessageHandler> = new Set()
  private status: ConnectionStatus = 'disconnected'
  private statusCallbacks: Set<(status: ConnectionStatus) => void> = new Set()

  constructor(url: string) {
    this.url = url
  }

  // 连接 WebSocket
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      this.setStatus('connecting')

      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log(`[WebSocket] Connected to ${this.url}`)
          this.reconnectAttempts = 0
          this.setStatus('connected')
          this.startHeartbeat()
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as WSMessage
            this.handleMessage(message)
          } catch (err) {
            console.error('[WebSocket] Failed to parse message:', err)
          }
        }

        this.ws.onclose = (event) => {
          console.log(`[WebSocket] Disconnected from ${this.url}`, event.code, event.reason)
          this.stopHeartbeat()
          this.setStatus('disconnected')

          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect()
          }
        }

        this.ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error)
          this.setStatus('disconnected')
          reject(error)
        }
      } catch (err) {
        this.setStatus('disconnected')
        reject(err)
      }
    })
  }

  // 断开连接
  disconnect(): void {
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    this.reconnectAttempts = 0
    this.setStatus('disconnected')
  }

  // 发送消息
  send(message: unknown): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
      return true
    }
    console.warn('[WebSocket] Cannot send message, connection not open')
    return false
  }

  // 订阅消息
  subscribe(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => {
      this.messageHandlers.delete(handler)
    }
  }

  // 监听状态变化
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusCallbacks.add(callback)
    // 立即通知当前状态
    callback(this.status)
    return () => {
      this.statusCallbacks.delete(callback)
    }
  }

  // 获取当前状态
  getStatus(): ConnectionStatus {
    return this.status
  }

  // 设置状态并通知
  private setStatus(status: ConnectionStatus): void {
    this.status = status
    this.statusCallbacks.forEach(cb => cb(status))
  }

  // 处理接收到的消息
  private handleMessage(message: WSMessage): void {
    this.messageHandlers.forEach(handler => {
      try {
        handler(message)
      } catch (err) {
        console.error('[WebSocket] Handler error:', err)
      }
    })
  }

  // 启动心跳
  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      this.send({ type: 'ping', timestamp: new Date().toISOString() })
    }, this.heartbeatInterval)
  }

  // 停止心跳
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  // 计划重连
  private scheduleReconnect(): void {
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5)
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    this.setStatus('reconnecting')

    this.reconnectTimer = window.setTimeout(() => {
      this.connect().catch(() => {
        // 重连失败，会继续触发 onclose 并再次计划重连
      })
    }, delay)
  }
}

// WebSocket Store
export const useWebSocketStore = defineStore('websocket', () => {
  // State
  const marketConnection = ref<ConnectionManager | null>(null)
  const agentConnections = ref<Map<string, ConnectionManager>>(new Map())
  const marketStatus = ref<ConnectionStatus>('disconnected')
  const lastMarketMessage = ref<WSMessage | null>(null)
  const lastAgentMessages = ref<Map<string, WSMessage>>(new Map())

  // Getters
  const isMarketConnected = computed(() => marketStatus.value === 'connected')
  const getAgentStatus = computed(() => (agentId: string) => {
    const conn = agentConnections.value.get(agentId)
    return conn?.getStatus() || 'disconnected'
  })

  // Actions

  /**
   * 连接行情 WebSocket
   */
  async function connectMarket(): Promise<void> {
    const wsUrl = getWebSocketUrl('/ws/market')

    if (!marketConnection.value) {
      marketConnection.value = new ConnectionManager(wsUrl)
      marketConnection.value.onStatusChange((status) => {
        marketStatus.value = status
      })
    }

    await marketConnection.value.connect()
  }

  /**
   * 断开行情 WebSocket
   */
  function disconnectMarket(): void {
    marketConnection.value?.disconnect()
    marketConnection.value = null
    marketStatus.value = 'disconnected'
  }

  /**
   * 订阅行情数据
   * @param symbols - 股票代码数组
   * @param onMessage - 消息回调
   * @returns 取消订阅函数
   */
  function subscribeMarket(
    symbols: string[],
    onMessage: (message: MarketQuoteMessage) => void
  ): () => void {
    if (!marketConnection.value) {
      console.warn('[WebSocket] Market connection not established')
      return () => {}
    }

    // 发送订阅请求
    marketConnection.value.send({
      action: 'subscribe',
      symbols: symbols,
    })

    // 订阅消息
    const unsubscribe = marketConnection.value.subscribe((message) => {
      lastMarketMessage.value = message
      if (message.type === 'quote_update') {
        onMessage(message as MarketQuoteMessage)
      }
    })

    // 返回取消订阅函数
    return () => {
      unsubscribe()
      marketConnection.value?.send({
        action: 'unsubscribe',
        symbols: symbols,
      })
    }
  }

  /**
   * 连接 Agent WebSocket
   */
  async function connectAgent(agentId: string): Promise<void> {
    if (agentConnections.value.has(agentId)) {
      const conn = agentConnections.value.get(agentId)!
      if (conn.getStatus() === 'connected') {
        return
      }
    }

    const wsUrl = getWebSocketUrl(`/ws/agents/${agentId}`)
    const conn = new ConnectionManager(wsUrl)
    agentConnections.value.set(agentId, conn)

    await conn.connect()
  }

  /**
   * 断开 Agent WebSocket
   */
  function disconnectAgent(agentId: string): void {
    const conn = agentConnections.value.get(agentId)
    if (conn) {
      conn.disconnect()
      agentConnections.value.delete(agentId)
    }
  }

  /**
   * 订阅 Agent 通知
   * @param agentId - Agent ID
   * @param onTrade - 交易通知回调
   * @param onDecision - 决策通知回调
   * @returns 取消订阅函数
   */
  function subscribeAgent(
    agentId: string,
    onTrade?: (message: AgentTradeMessage) => void,
    onDecision?: (message: AgentDecisionMessage) => void
  ): () => void {
    const conn = agentConnections.value.get(agentId)
    if (!conn) {
      console.warn(`[WebSocket] Agent ${agentId} connection not established`)
      return () => {}
    }

    const unsubscribe = conn.subscribe((message) => {
      lastAgentMessages.value.set(agentId, message)

      switch (message.type) {
        case 'trade_notification':
          onTrade?.(message as AgentTradeMessage)
          break
        case 'decision_notification':
          onDecision?.(message as AgentDecisionMessage)
          break
      }
    })

    return unsubscribe
  }

  /**
   * 断开所有 WebSocket 连接
   */
  function disconnectAll(): void {
    disconnectMarket()
    agentConnections.value.forEach((conn, _agentId) => {
      conn.disconnect()
    })
    agentConnections.value.clear()
  }

  return {
    // State
    marketStatus,
    lastMarketMessage,
    lastAgentMessages,
    // Getters
    isMarketConnected,
    getAgentStatus,
    // Actions
    connectMarket,
    disconnectMarket,
    subscribeMarket,
    connectAgent,
    disconnectAgent,
    subscribeAgent,
    disconnectAll,
  }
})

/**
 * 获取 WebSocket URL
 */
function getWebSocketUrl(path: string): string {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const wsProtocol = apiUrl.startsWith('https') ? 'wss' : 'ws'
  const baseUrl = apiUrl.replace(/^https?:\/\//, '')
  return `${wsProtocol}://${baseUrl}${path}`
}
