/**
 * WebSocket管理Composable
 * 整合WebSocket连接、股票订阅、数据合并
 *
 * 使用场景: AI账户详情页、持仓页、行情页
 */

import { onMounted, onUnmounted, watch } from 'vue'
import { useMarketStore } from '@/stores/market'
import { useTradingStore } from '@/stores/trading'
import {
  connect as connectWS,
  disconnect as disconnectWS,
  subscribe,
  unsubscribe,
  onMessage,
  getConnectionStatus,
  type QuoteUpdate,
} from '@/services/websocket'

// ==================== 配置 ====================

const RECONNECT_INTERVAL = 30000 // 30秒检查一次连接

// ==================== Composable ====================

export function useWebSocketManager() {
  const marketStore = useMarketStore()
  const tradingStore = useTradingStore()

  let unsubscribeMessage: (() => void) | null = null
  let checkTimer: number | null = null

  // ==================== 连接管理 ====================

  /**
   * 连接WebSocket
   */
  async function connect(): Promise<void> {
    const status = getConnectionStatus()
    if (status === 'connected') return

    await connectWS()
  }

  /**
   * 断开WebSocket连接
   */
  function disconnect(): void {
    disconnectWS()
  }

  // ==================== 订阅管理 ====================

  /**
   * 订阅持仓股票
   */
  function subscribeHoldings(): void {
    const symbols = tradingStore.getHoldingSymbols()
    if (symbols.length > 0) {
      subscribe(symbols)
    }
  }

  /**
   * 取消订阅持仓股票
   */
  function unsubscribeHoldings(): void {
    const symbols = tradingStore.getHoldingSymbols()
    if (symbols.length > 0) {
      unsubscribe(symbols)
    }
  }

  /**
   * 订阅指定股票
   */
  function subscribeSymbols(symbols: string[]): void {
    if (symbols.length > 0) {
      subscribe(symbols)
    }
  }

  /**
   * 取消订阅指定股票
   */
  function unsubscribeSymbols(symbols: string[]): void {
    if (symbols.length > 0) {
      unsubscribe(symbols)
    }
  }

  // ==================== 消息处理 ====================

  /**
   * 处理实时行情消息
   */
  function handleRealtimeMessage(updates: QuoteUpdate[]): void {
    // 合并到market store
    marketStore.mergeRealtimeQuotes(updates)

    // 合并到trading store（用于收益计算）
    tradingStore.mergeRealtimePrices(updates)
  }

  /**
   * 初始化消息监听
   */
  function initMessageListener(): void {
    // 取消之前的监听
    if (unsubscribeMessage) {
      unsubscribeMessage()
    }

    // 注册新的消息处理器
    unsubscribeMessage = onMessage((message) => {
      if (message.type === 'quote_update' && message.data) {
        handleRealtimeMessage(message.data)
      }
    })
  }

  // ==================== 生命周期管理 ====================

  /**
   * 启动WebSocket管理
   * 在页面onMounted时调用
   */
  async function start(symbols?: string[]): Promise<void> {
    // 连接WebSocket
    await connect()

    // 初始化消息监听
    initMessageListener()

    // 订阅股票
    if (symbols) {
      subscribeSymbols(symbols)
    } else {
      subscribeHoldings()
    }

    // 启动定期刷新（O6-009）
    tradingStore.startPeriodicRefresh()

    // 监听持仓变化，自动订阅（O6-005B）
    watch(
      () => tradingStore.holdingSymbols,
      (newSymbols, oldSymbols) => {
        // 取消旧订阅
        if (oldSymbols && oldSymbols.length > 0) {
          unsubscribe(oldSymbols)
        }
        // 订阅新股票
        if (newSymbols && newSymbols.length > 0) {
          subscribe(newSymbols)
        }
      },
      { immediate: true }
    )
  }

  /**
   * 停止WebSocket管理
   * 在页面onUnmounted时调用
   */
  function stop(): void {
    // 停止定期刷新
    tradingStore.stopPeriodicRefresh()

    // 取消消息监听
    if (unsubscribeMessage) {
      unsubscribeMessage()
      unsubscribeMessage = null
    }

    // 取消所有订阅
    unsubscribeHoldings()

    // 断开连接（可选，根据业务需求决定是否在页面卸载时断开）
    // disconnectWS()
  }

  /**
   * 页面可见性变化处理
   */
  function handleVisibilityChange(visible: boolean): void {
    tradingStore.setPageVisibility(visible)

    if (visible) {
      // 页面重新可见时，检查连接状态
      const status = getConnectionStatus()
      if (status !== 'connected') {
        connect()
      }
      // 立即刷新一次数据
      tradingStore.refreshProfitData()
    }
  }

  return {
    // 连接管理
    connect,
    disconnect,

    // 订阅管理
    subscribeHoldings,
    unsubscribeHoldings,
    subscribeSymbols,
    unsubscribeSymbols,

    // 生命周期
    start,
    stop,
    handleVisibilityChange,
  }
}

export default useWebSocketManager
