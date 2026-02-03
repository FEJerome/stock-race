import { Server } from 'socket.io';
import { sessionService } from './SessionService.js';
import { stockController } from '../controllers/StockController.js';
import { tradeController } from '../controllers/TradeController.js';
import { aiController } from '../controllers/AIController.js';
import { marketController } from '../controllers/MarketController.js';

export class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedClients = new Map(); // Map<socketId, {userId, accountIds, subscriptions}>
    this.stockSubscriptions = new Map(); // Map<stockCode, Set<socketId>>
    this.accountSubscriptions = new Map(); // Map<accountId, Set<socketId>>
    this.marketDataInterval = null;
    this.reconnectAttempts = new Map(); // Map<socketId, attempts>
  }

  /**
   * 初始化WebSocket服务
   * @param {Object} httpServer - HTTP服务器实例
   */
  initialize(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'POST']
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e8 // 100MB
    });

    this.setupEventHandlers();
    this.startMarketDataBroadcast();

    console.log('✅ WebSocket服务初始化完成');
  }

  /**
   * 设置事件处理器
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 客户端连接: ${socket.id}`);

      // 初始化客户端状态
      this.connectedClients.set(socket.id, {
        userId: null,
        accountIds: new Set(),
        subscriptions: {
          stocks: new Set(),
          accounts: new Set(),
          market: false,
          trades: false
        }
      });

      // 认证事件
      socket.on('authenticate', async (data) => {
        await this.handleAuthentication(socket, data);
      });

      // 订阅股票行情
      socket.on('subscribe:stocks', (stockCodes) => {
        this.handleStockSubscription(socket, stockCodes);
      });

      // 取消订阅股票行情
      socket.on('unsubscribe:stocks', (stockCodes) => {
        this.handleStockUnsubscription(socket, stockCodes);
      });

      // 订阅账户交易
      socket.on('subscribe:account', (accountId) => {
        this.handleAccountSubscription(socket, accountId);
      });

      // 取消订阅账户交易
      socket.on('unsubscribe:account', (accountId) => {
        this.handleAccountUnsubscription(socket, accountId);
      });

      // 订阅市场数据
      socket.on('subscribe:market', () => {
        this.handleMarketSubscription(socket);
      });

      // 取消订阅市场数据
      socket.on('unsubscribe:market', () => {
        this.handleMarketUnsubscription(socket);
      });

      // 订阅交易通知
      socket.on('subscribe:trades', () => {
        this.handleTradeSubscription(socket);
      });

      // 取消订阅交易通知
      socket.on('unsubscribe:trades', () => {
        this.handleTradeUnsubscription(socket);
      });

      // 获取历史数据
      socket.on('get:history', async (data, callback) => {
        await this.handleGetHistory(socket, data, callback);
      });

      // 断开连接处理
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // 错误处理
      socket.on('error', (error) => {
        console.error(`WebSocket错误 (${socket.id}):`, error);
      });

      // 心跳检测
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });
  }

  /**
   * 处理客户端认证
   */
  async handleAuthentication(socket, data) {
    try {
      const { token, sessionId } = data;

      if (!token && !sessionId) {
        socket.emit('auth:error', { message: '需要认证信息' });
        return;
      }

      let userId = null;

      // 优先使用JWT token验证
      if (token) {
        try {
          // 这里应该验证JWT token
          // 暂时使用模拟验证
          userId = 'user-' + Math.random().toString(36).substr(2, 9);
        } catch (error) {
          console.error('Token验证失败:', error);
        }
      }

      // 如果token验证失败，尝试使用sessionId
      if (!userId && sessionId) {
        try {
          const session = await sessionService.getSession(sessionId);
          if (session && session.userId) {
            userId = session.userId;
          }
        } catch (error) {
          console.error('Session验证失败:', error);
        }
      }

      if (!userId) {
        socket.emit('auth:error', { message: '认证失败' });
        return;
      }

      // 更新客户端状态
      const client = this.connectedClients.get(socket.id);
      if (client) {
        client.userId = userId;

        // 获取用户的AI账户
        try {
          // 这里应该调用AI账户服务获取用户的账户
          // 暂时使用模拟数据
          const accountIds = ['account-1', 'account-2'];
          accountIds.forEach(accountId => {
            client.accountIds.add(accountId);
          });
        } catch (error) {
          console.error('获取用户账户失败:', error);
        }
      }

      socket.emit('auth:success', {
        userId,
        message: '认证成功',
        timestamp: new Date().toISOString()
      });

      console.log(`✅ 客户端认证成功: ${socket.id} (用户: ${userId})`);
    } catch (error) {
      console.error('认证处理错误:', error);
      socket.emit('auth:error', { message: '认证处理失败' });
    }
  }

  /**
   * 处理股票订阅
   */
  handleStockSubscription(socket, stockCodes) {
    const client = this.connectedClients.get(socket.id);
    if (!client || !client.userId) {
      socket.emit('error', { message: '请先认证' });
      return;
    }

    if (!Array.isArray(stockCodes)) {
      stockCodes = [stockCodes];
    }

    stockCodes.forEach(stockCode => {
      // 添加到客户端订阅列表
      client.subscriptions.stocks.add(stockCode);

      // 添加到全局订阅映射
      if (!this.stockSubscriptions.has(stockCode)) {
        this.stockSubscriptions.set(stockCode, new Set());
      }
      this.stockSubscriptions.get(stockCode).add(socket.id);
    });

    socket.emit('subscription:success', {
      type: 'stocks',
      codes: stockCodes,
      message: '股票订阅成功'
    });

    console.log(`📈 客户端 ${socket.id} 订阅股票: ${stockCodes.join(', ')}`);
  }

  /**
   * 处理股票取消订阅
   */
  handleStockUnsubscription(socket, stockCodes) {
    const client = this.connectedClients.get(socket.id);
    if (!client) return;

    if (!Array.isArray(stockCodes)) {
      stockCodes = [stockCodes];
    }

    stockCodes.forEach(stockCode => {
      // 从客户端订阅列表移除
      client.subscriptions.stocks.delete(stockCode);

      // 从全局订阅映射移除
      const subscribers = this.stockSubscriptions.get(stockCode);
      if (subscribers) {
        subscribers.delete(socket.id);
        if (subscribers.size === 0) {
          this.stockSubscriptions.delete(stockCode);
        }
      }
    });

    socket.emit('unsubscription:success', {
      type: 'stocks',
      codes: stockCodes,
      message: '股票取消订阅成功'
    });

    console.log(`📉 客户端 ${socket.id} 取消订阅股票: ${stockCodes.join(', ')}`);
  }

  /**
   * 处理账户订阅
   */
  handleAccountSubscription(socket, accountId) {
    const client = this.connectedClients.get(socket.id);
    if (!client || !client.userId) {
      socket.emit('error', { message: '请先认证' });
      return;
    }

    // 验证用户是否有权限访问该账户
    if (!client.accountIds.has(accountId)) {
      socket.emit('error', { message: '无权访问该账户' });
      return;
    }

    // 添加到客户端订阅列表
    client.subscriptions.accounts.add(accountId);

    // 添加到全局订阅映射
    if (!this.accountSubscriptions.has(accountId)) {
      this.accountSubscriptions.set(accountId, new Set());
    }
    this.accountSubscriptions.get(accountId).add(socket.id);

    socket.emit('subscription:success', {
      type: 'account',
      accountId,
      message: '账户订阅成功'
    });

    console.log(`💰 客户端 ${socket.id} 订阅账户: ${accountId}`);
  }

  /**
   * 处理账户取消订阅
   */
  handleAccountUnsubscription(socket, accountId) {
    const client = this.connectedClients.get(socket.id);
    if (!client) return;

    // 从客户端订阅列表移除
    client.subscriptions.accounts.delete(accountId);

    // 从全局订阅映射移除
    const subscribers = this.accountSubscriptions.get(accountId);
    if (subscribers) {
      subscribers.delete(socket.id);
      if (subscribers.size === 0) {
        this.accountSubscriptions.delete(accountId);
      }
    }

    socket.emit('unsubscription:success', {
      type: 'account',
      accountId,
      message: '账户取消订阅成功'
    });

    console.log(`💸 客户端 ${socket.id} 取消订阅账户: ${accountId}`);
  }

  /**
   * 处理市场数据订阅
   */
  handleMarketSubscription(socket) {
    const client = this.connectedClients.get(socket.id);
    if (!client || !client.userId) {
      socket.emit('error', { message: '请先认证' });
      return;
    }

    client.subscriptions.market = true;

    socket.emit('subscription:success', {
      type: 'market',
      message: '市场数据订阅成功'
    });

    console.log(`📊 客户端 ${socket.id} 订阅市场数据`);
  }

  /**
   * 处理市场数据取消订阅
   */
  handleMarketUnsubscription(socket) {
    const client = this.connectedClients.get(socket.id);
    if (!client) return;

    client.subscriptions.market = false;

    socket.emit('unsubscription:success', {
      type: 'market',
      message: '市场数据取消订阅成功'
    });

    console.log(`📉 客户端 ${socket.id} 取消订阅市场数据`);
  }

  /**
   * 处理交易通知订阅
   */
  handleTradeSubscription(socket) {
    const client = this.connectedClients.get(socket.id);
    if (!client || !client.userId) {
      socket.emit('error', { message: '请先认证' });
      return;
    }

    client.subscriptions.trades = true;

    socket.emit('subscription:success', {
      type: 'trades',
      message: '交易通知订阅成功'
    });

    console.log(`💱 客户端 ${socket.id} 订阅交易通知`);
  }

  /**
   * 处理交易通知取消订阅
   */
  handleTradeUnsubscription(socket) {
    const client = this.connectedClients.get(socket.id);
    if (!client) return;

    client.subscriptions.trades = false;

    socket.emit('unsubscription:success', {
      type: 'trades',
      message: '交易通知取消订阅成功'
    });

    console.log(`💸 客户端 ${socket.id} 取消订阅交易通知`);
  }

  /**
   * 处理获取历史数据请求
   */
  async handleGetHistory(socket, data, callback) {
    try {
      const { type, stockCode, interval, limit } = data;
      const client = this.connectedClients.get(socket.id);

      if (!client || !client.userId) {
        if (callback) callback({ error: '请先认证' });
        return;
      }

      let historyData = null;

      switch (type) {
        case 'kline':
          historyData = await stockController.getKlineData(
            stockCode,
            interval || '1d',
            limit || 100
          );
          break;

        case 'trades':
          // 这里应该获取交易历史
          // 暂时返回模拟数据
          historyData = [];
          break;

        default:
          if (callback) callback({ error: '不支持的历史数据类型' });
          return;
      }

      if (callback) {
        callback({
          success: true,
          type,
          data: historyData,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('获取历史数据错误:', error);
      if (callback) {
        callback({
          error: '获取历史数据失败',
          message: error.message
        });
      }
    }
  }

  /**
   * 处理断开连接
   */
  handleDisconnect(socket) {
    const client = this.connectedClients.get(socket.id);
    if (client) {
      // 清理股票订阅
      client.subscriptions.stocks.forEach(stockCode => {
        const subscribers = this.stockSubscriptions.get(stockCode);
        if (subscribers) {
          subscribers.delete(socket.id);
          if (subscribers.size === 0) {
            this.stockSubscriptions.delete(stockCode);
          }
        }
      });

      // 清理账户订阅
      client.subscriptions.accounts.forEach(accountId => {
        const subscribers = this.accountSubscriptions.get(accountId);
        if (subscribers) {
          subscribers.delete(socket.id);
          if (subscribers.size === 0) {
            this.accountSubscriptions.delete(accountId);
          }
        }
      });

      // 移除客户端
      this.connectedClients.delete(socket.id);
    }

    console.log(`🔌 客户端断开连接: ${socket.id}`);
  }

  /**
   * 开始市场数据广播
   */
  startMarketDataBroadcast() {
    // 每5秒广播一次市场数据
    this.marketDataInterval = setInterval(async () => {
      try {
        await this.broadcastMarketData();
      } catch (error) {
        console.error('广播市场数据错误:', error);
      }
    }, 5000);
  }

  /**
   * 广播市场数据
   */
  async broadcastMarketData() {
    // 获取热门股票数据
    const hotStocks = Array.from(this.stockSubscriptions.keys()).slice(0, 20);

    if (hotStocks.length === 0) return;

    try {
      // 批量获取实时数据
      const realtimeData = await stockController.batchGetRealtimeData(hotStocks);

      // 广播给所有订阅了市场数据的客户端
      this.connectedClients.forEach((client, socketId) => {
        if (client.subscriptions.market) {
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('market:update', {
              stocks: realtimeData,
              timestamp: new Date().toISOString()
            });
          }
        }
      });

      // 广播给订阅了具体股票的客户端
      realtimeData.forEach(stockData => {
        const subscribers = this.stockSubscriptions.get(stockData.stockCode);
        if (subscribers) {
          subscribers.forEach(socketId => {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
              socket.emit('stock:update', {
                stockCode: stockData.stockCode,
                ...stockData,
                timestamp: new Date().toISOString()
              });
            }
          });
        }
      });
    } catch (error) {
      console.error('获取市场数据错误:', error);
    }
  }

  /**
   * 广播交易通知
   * @param {Object} tradeData - 交易数据
   */
  broadcastTradeNotification(tradeData) {
    const { accountId, stockCode, tradeType, quantity, price } = tradeData;

    // 广播给订阅了该账户的客户端
    const accountSubscribers = this.accountSubscriptions.get(accountId);
    if (accountSubscribers) {
      accountSubscribers.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('trade:notification', {
            type: 'trade',
            accountId,
            stockCode,
            tradeType,
            quantity,
            price,
            timestamp: new Date().toISOString()
          });
        }
      });
    }

    // 广播给订阅了交易通知的客户端
    this.connectedClients.forEach((client, socketId) => {
      if (client.subscriptions.trades) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('trade:notification', {
            type: 'trade',
            accountId,
            stockCode,
            tradeType,
            quantity,
            price,
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    console.log(`📢 广播交易通知: ${tradeType} ${stockCode} ${quantity}股 @ ${price}`);
  }

  /**
   * 广播AI决策通知
   * @param {Object} decisionData - 决策数据
   */
  broadcastAIDecisionNotification(decisionData) {
    const { accountId, stockCode, decisionType, confidence } = decisionData;

    // 广播给订阅了该账户的客户端
    const accountSubscribers = this.accountSubscriptions.get(accountId);
    if (accountSubscribers) {
      accountSubscribers.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('ai:decision', {
            type: 'ai_decision',
            accountId,
            stockCode,
            decisionType,
            confidence,
            timestamp: new Date().toISOString()
          });
        }
      });
    }

    console.log(`🤖 广播AI决策通知: ${decisionType} ${stockCode} (置信度: ${confidence})`);
  }

  /**
   * 广播排行榜更新
   * @param {Object} rankingData - 排行榜数据
   */
  broadcastRankingUpdate(rankingData) {
    // 广播给所有订阅了市场数据的客户端
    this.connectedClients.forEach((client, socketId) => {
      if (client.subscriptions.market) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('ranking:update', {
            type: 'ranking',
            ...rankingData,
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    console.log(`🏆 广播排行榜更新`);
  }

  /**
   * 获取连接统计
   */
  getConnectionStats() {
    return {
      totalClients: this.connectedClients.size,
      authenticatedClients: Array.from(this.connectedClients.values())
        .filter(client => client.userId !== null).length,
      stockSubscriptions: this.stockSubscriptions.size,
      accountSubscriptions: this.accountSubscriptions.size,
      marketSubscribers: Array.from(this.connectedClients.values())
        .filter(client => client.subscriptions.market).length,
      tradeSubscribers: Array.from(this.connectedClients.values())
        .filter(client => client.subscriptions.trades).length
    };
  }

  /**
   * 关闭WebSocket服务
   */
  close() {
    if (this.marketDataInterval) {
      clearInterval(this.marketDataInterval);
      this.marketDataInterval = null;
    }

    if (this.io) {
      this.io.close();
      this.io = null;
    }

    this.connectedClients.clear();
    this.stockSubscriptions.clear();
    this.accountSubscriptions.clear();
    this.reconnectAttempts.clear();

    console.log('✅ WebSocket服务已关闭');
  }
}

// 创建单例实例
export const webSocketService = new WebSocketService();