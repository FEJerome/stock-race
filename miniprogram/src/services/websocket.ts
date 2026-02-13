/**
 * WebSocket服务模块
 * 对应架构文档: 006-MINIPROGRAM-DATA-FLOW.md
 *
 * 功能:
 * - WebSocket连接管理 (O6-005)
 * - 股票订阅管理 (O6-005B)
 * - 自动重连机制 (O6-007)
 * - 降级到HTTP轮询
 */

import { ref, computed } from 'vue'

// ==================== 配置 ====================

const WS_URL = 'ws://market-data:8001/ws/public/quotes'
const MAX_RECONNECT_ATTEMPTS = 10
const MAX_SUBSCRIPTIONS = 50

// ==================== 类型定义 ====================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface QuoteUpdate {
  symbol: string
  name: string
  current: number
  change: number
  changePercent: number
  volume: number
  turnover: number
  timestamp: string
}

export interface WSMessage {
  type: 'quote_update' | 'subscribed' | 'unsubscribed' | 'error'
  timestamp: string
  data?: QuoteUpdate[]
  symbols?: string[]
  message?: string
}

// ==================== 状态 ====================

const connectionStatus = ref<ConnectionStatus>('disconnected')
const socket = ref<UniApp.SocketTask | null>(null)
const subscribedSymbols = ref<Set<string>>(new Set())
const messageHandlers = ref<((message: WSMessage) => void)[]>([])
const reconnectAttempts = ref(0)
const reconnectTimer = ref<number | null>(null)
const httpFallbackTimer = ref<number | null>(null)
const isHttpFallbackMode = ref(false)

// ==================== 计算属性 ====================

export const wsStatus = computed(() => connectionStatus.value)
export const isConnected = computed(() => connectionStatus.value === 'connected')
export const isHttpFallback = computed(() => isHttpFallbackMode.value)
export const subscribedList = computed(() => Array.from(subscribedSymbols.value))

// ==================== 连接管理 ====================

/**
 * 连接WebSocket
 */
export function connect(): Promise<boolean> {
  return new Promise((resolve) => {
    if (socket.value && connectionStatus.value === 'connected') {
      resolve(true)
      return
    }

    // 清除之前的重连定时器
    if (reconnectTimer.value) {
      clearTimeout(reconnectTimer.value)
      reconnectTimer.value = null
    }

    connectionStatus.value = 'connecting'
    isHttpFallbackMode.value = false

    console.log('[WebSocket] Connecting to', WS_URL)

    socket.value = uni.connectSocket({
      url: WS_URL,
      success: () => {
        console.log('[WebSocket] Socket created')
      },
      fail: (err) => {
        console.error('[WebSocket] Connection failed:', err)
        connectionStatus.value = 'error'
        handleReconnect()
        resolve(false)
      },
    })

    // 监听打开事件
    socket.value.onOpen(() => {
      console.log('[WebSocket] Connected')
      connectionStatus.value = 'connected'
      reconnectAttempts.value = 0
      isHttpFallbackMode.value = false

      // 重新订阅之前的股票
      if (subscribedSymbols.value.size > 0) {
        subscribe(Array.from(subscribedSymbols.value))
      }

      // 停止HTTP轮询
      stopHttpFallback()

      resolve(true)
    })

    // 监听消息事件
    socket.value.onMessage((res) => {
      try {
        const message: WSMessage = JSON.parse(res.data as string)
        console.log('[WebSocket] Received:', message.type)
        handleMessage(message)
      } catch (error) {
        console.error('[WebSocket] Parse message error:', error)
      }
    })

    // 监听关闭事件
    socket.value.onClose(() => {
      console.log('[WebSocket] Closed')
      connectionStatus.value = 'disconnected'
      socket.value = null
      handleReconnect()
      resolve(false)
    })

    // 监听错误事件
    socket.value.onError((err) => {
      console.error('[WebSocket] Error:', err)
      connectionStatus.value = 'error'
      socket.value = null
      handleReconnect()
      resolve(false)
    })
  })
}

/**
 * 断开WebSocket连接
 */
export function disconnect(): void {
  console.log('[WebSocket] Disconnecting')

  // 清除重连定时器
  if (reconnectTimer.value) {
    clearTimeout(reconnectTimer.value)
    reconnectTimer.value = null
  }

  // 停止HTTP轮询
  stopHttpFallback()

  // 关闭连接
  if (socket.value) {
    socket.value.close({})
    socket.value = null
  }

  connectionStatus.value = 'disconnected'
  subscribedSymbols.value.clear()
}

// ==================== 重连机制 ====================

/**
 * 处理重连
 * 使用指数退避策略：1s, 2s, 4s, 8s...最多30s
 */
function handleReconnect(): void {
  if (reconnectAttempts.value >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[WebSocket] Max reconnect attempts reached, switching to HTTP fallback')
    startHttpFallback()
    return
  }

  const delay = Math.min(Math.pow(2, reconnectAttempts.value) * 1000, 30000)
  reconnectAttempts.value++

  console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.value})`)

  reconnectTimer.value = setTimeout(() => {
    connect()
  }, delay) as unknown as number
}

// ==================== 订阅管理 ====================

/**
 * 订阅股票
 * @param symbols 股票代码数组
 */
export function subscribe(symbols: string[]): boolean {
  if (!symbols || symbols.length === 0) return false

  // 检查订阅数量限制
  const newSymbols = symbols.filter((s) => !subscribedSymbols.value.has(s))
  if (subscribedSymbols.value.size + newSymbols.length > MAX_SUBSCRIPTIONS) {
    console.warn(`[WebSocket] Max subscriptions limit (${MAX_SUBSCRIPTIONS}) reached`)
    uni.showToast({
      title: `最多订阅${MAX_SUBSCRIPTIONS}只股票`,
      icon: 'none',
    })
    return false
  }

  // 添加到订阅集合
  symbols.forEach((s) => subscribedSymbols.value.add(s))

  // 如果已连接，发送订阅消息
  if (connectionStatus.value === 'connected' && socket.value) {
    socket.value.send({
      data: JSON.stringify({
        action: 'subscribe',
        symbols: newSymbols,
      }),
    })
    console.log('[WebSocket] Subscribed:', newSymbols)
  }

  return true
}

/**
 * 取消订阅股票
 * @param symbols 股票代码数组
 */
export function unsubscribe(symbols: string[]): void {
  if (!symbols || symbols.length === 0) return

  // 从订阅集合中移除
  symbols.forEach((s) => subscribedSymbols.value.delete(s))

  // 如果已连接，发送取消订阅消息
  if (connectionStatus.value === 'connected' && socket.value) {
    socket.value.send({
      data: JSON.stringify({
        action: 'unsubscribe',
        symbols,
      }),
    })
    console.log('[WebSocket] Unsubscribed:', symbols)
  }
}

/**
 * 取消订阅所有股票
 */
export function unsubscribeAll(): void {
  const symbols = Array.from(subscribedSymbols.value)
  unsubscribe(symbols)
}

// ==================== 消息处理 ====================

/**
 * 处理收到的消息
 */
function handleMessage(message: WSMessage): void {
  // 调用所有注册的消息处理器
  messageHandlers.value.forEach((handler) => {
    try {
      handler(message)
    } catch (error) {
      console.error('[WebSocket] Handler error:', error)
    }
  })
}

/**
 * 注册消息处理器
 * @param handler 消息处理函数
 * @returns 取消注册函数
 */
export function onMessage(handler: (message: WSMessage) => void): () => void {
  messageHandlers.value.push(handler)

  // 返回取消注册函数
  return () => {
    const index = messageHandlers.value.indexOf(handler)
    if (index > -1) {
      messageHandlers.value.splice(index, 1)
    }
  }
}

// ==================== HTTP降级 ====================

/**
 * 启动HTTP轮询降级
 */
function startHttpFallback(): void {
  console.log('[WebSocket] Starting HTTP fallback')
  isHttpFallbackMode.value = true
  connectionStatus.value = 'disconnected'

  // 立即执行一次
  httpFallbackFetch()

  // 每5秒轮询一次
  httpFallbackTimer.value = setInterval(() => {
    httpFallbackFetch()
  }, 5000) as unknown as number
}

/**
 * 停止HTTP轮询降级
 */
function stopHttpFallback(): void {
  if (httpFallbackTimer.value) {
    clearInterval(httpFallbackTimer.value)
    httpFallbackTimer.value = null
  }
  isHttpFallbackMode.value = false
}

/**
 * HTTP轮询获取行情
 */
async function httpFallbackFetch(): Promise<void> {
  // HTTP降级模式下，通过事件通知外部调用HTTP接口
  // 实际HTTP调用在stores中处理
  const message: WSMessage = {
    type: 'quote_update',
    timestamp: new Date().toISOString(),
    data: [], // 空数据，触发stores调用HTTP接口
  }
  handleMessage(message)
}

// ==================== 工具函数 ====================

/**
 * 获取连接状态
 */
export function getConnectionStatus(): ConnectionStatus {
  return connectionStatus.value
}

/**
 * 是否已订阅某只股票
 */
export function isSubscribed(symbol: string): boolean {
  return subscribedSymbols.value.has(symbol)
}

/**
 * 获取订阅数量
 */
export function getSubscriptionCount(): number {
  return subscribedSymbols.value.size
}
