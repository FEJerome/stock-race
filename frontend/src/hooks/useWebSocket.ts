import { useEffect, useRef, useCallback, useState } from 'react';
import { notification } from 'antd';
import { useAuthStore } from '../store/auth.store';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

interface WebSocketHookOptions {
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export const useWebSocket = (options: WebSocketHookOptions = {}) => {
  const {
    autoConnect = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const { token } = useAuthStore();

  // WebSocket URL
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

  // 连接WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    // 清理现有连接
    if (wsRef.current) {
      wsRef.current.close();
    }

    // 如果没有token，不连接
    if (!token) {
      console.log('No authentication token, skipping WebSocket connection');
      return;
    }

    try {
      const url = `${wsUrl}?token=${token}`;
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        onConnect?.();

        // 发送心跳包
        startHeartbeat();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          onMessage?.(message);

          // 根据消息类型处理
          handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        onDisconnect?.();
        stopHeartbeat();

        // 如果不是正常关闭，尝试重连
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          scheduleReconnect();
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError?.(error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  }, [wsUrl, token, onMessage, onConnect, onDisconnect, onError, maxReconnectAttempts]);

  // 断开WebSocket连接
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    stopHeartbeat();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // 发送消息
  const sendMessage = useCallback((type: string, data: any = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = {
        type,
        data,
        timestamp: new Date().toISOString(),
      };
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('WebSocket is not connected');
      return false;
    }
  }, []);

  // 处理不同类型的消息
  const handleMessage = useCallback((message: WebSocketMessage) => {
    const { type, data } = message;

    switch (type) {
      case 'market:update':
        // 市场数据更新
        notification.info({
          message: '行情更新',
          description: `${data.symbol} 价格更新: ¥${data.price}`,
          placement: 'bottomRight',
        });
        break;

      case 'trade:executed':
        // 交易执行通知
        notification.success({
          message: '交易执行',
          description: `${data.action} ${data.symbol} ${data.quantity}股 @ ¥${data.price}`,
          placement: 'bottomRight',
        });
        break;

      case 'ai:decision':
        // AI决策通知
        notification.warning({
          message: 'AI决策建议',
          description: `${data.aiName} 建议${data.action} ${data.symbol}`,
          placement: 'bottomRight',
        });
        break;

      case 'portfolio:update':
        // 持仓更新
        console.log('Portfolio updated:', data);
        break;

      case 'system:notification':
        // 系统通知
        notification.info({
          message: data.title,
          description: data.message,
          placement: 'bottomRight',
        });
        break;

      case 'heartbeat':
        // 心跳响应
        console.log('Heartbeat received');
        break;

      default:
        console.log('Unknown message type:', type, data);
    }
  }, []);

  // 心跳机制
  const startHeartbeat = useCallback(() => {
    const heartbeatInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendMessage('heartbeat');
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 30000); // 每30秒发送一次心跳

    // 存储interval ID以便清理
    (wsRef.current as any).heartbeatInterval = heartbeatInterval;
  }, [sendMessage]);

  const stopHeartbeat = useCallback(() => {
    if (wsRef.current && (wsRef.current as any).heartbeatInterval) {
      clearInterval((wsRef.current as any).heartbeatInterval);
    }
  }, []);

  // 重连机制
  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    reconnectAttemptsRef.current += 1;
    const delay = reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current - 1);

    console.log(`Scheduling reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

    reconnectTimerRef.current = setTimeout(() => {
      console.log('Attempting to reconnect...');
      connect();
    }, delay);
  }, [connect, reconnectInterval, maxReconnectAttempts]);

  // 订阅特定类型的消息
  const subscribe = useCallback((channel: string) => {
    return sendMessage('subscribe', { channel });
  }, [sendMessage]);

  // 取消订阅
  const unsubscribe = useCallback((channel: string) => {
    return sendMessage('unsubscribe', { channel });
  }, [sendMessage]);

  // 组件挂载时连接
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // 监听token变化
  useEffect(() => {
    if (token && !isConnected) {
      connect();
    } else if (!token && isConnected) {
      disconnect();
    }
  }, [token, isConnected, connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    connect,
    disconnect,
    sendMessage,
    subscribe,
    unsubscribe,
    reconnectAttempts: reconnectAttemptsRef.current,
  };
};

export default useWebSocket;