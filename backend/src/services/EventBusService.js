/**
 * Event Bus Service
 * Backend事件总线服务，集成Redis Streams事件总线SDK
 *
 * 对应需求: C2-BE-001 ~ C2-BE-006
 */

import {
  EventBusClient,
  EventProducer,
  EventConsumer,
  EventType,
} from '@stock-race/event-bus';

class EventBusService {
  constructor() {
    this.client = null;
    this.producer = null;
    this.consumer = null;
    this.isConnected = false;
    this.messageHandlers = new Map();
  }

  /**
   * 初始化事件总线服务
   * @param {Object} config - 配置对象
   * @param {string} config.redisHost - Redis主机
   * @param {number} config.redisPort - Redis端口
   * @param {string} config.serviceName - 服务名称
   */
  async initialize(config = {}) {
    const redisHost = config.redisHost || process.env.REDIS_HOST || 'localhost';
    const redisPort = config.redisPort || parseInt(process.env.REDIS_PORT) || 6379;
    const serviceName = config.serviceName || 'backend';

    // 创建客户端
    this.client = new EventBusClient({
      host: redisHost,
      port: redisPort,
    });

    // 连接Redis
    await this.client.connect();
    this.isConnected = true;

    // 创建生产者
    this.producer = new EventProducer({
      client: this.client,
      serviceName: serviceName,
    });

    console.log('[EventBusService] Initialized successfully');
  }

  /**
   * 发布账户更新事件
   * C2-BE-002: 发布账户更新事件
   * @param {string} accountId - 账户ID
   * @param {string} field - 变更字段
   * @param {*} oldValue - 旧值
   * @param {*} newValue - 新值
   */
  async publishAccountUpdated(accountId, field, oldValue, newValue) {
    this._ensureConnected();

    const eventPayload = {
      accountId,
      field,
      oldValue,
      newValue,
      timestamp: new Date().toISOString(),
    };

    const messageId = await this.producer.publishEvent(
      EventType.BACKEND_ACCOUNT_UPDATED,
      eventPayload,
      false // 跳过验证，使用自定义payload
    );

    console.log(`[EventBusService] Published account updated event: ${messageId}`);
    return messageId;
  }

  /**
   * 发布交易执行事件
   * C2-BE-003: 发布交易执行事件
   * @param {Object} trade - 交易对象
   * @param {string} trade.accountId - 账户ID
   * @param {string} trade.tradeId - 交易ID
   * @param {string} trade.symbol - 股票代码
   * @param {string} trade.action - 交易动作 (buy/sell)
   * @param {number} trade.quantity - 交易数量
   * @param {number} trade.price - 交易价格
   */
  async publishTradeExecuted(trade) {
    this._ensureConnected();

    const eventPayload = {
      accountId: trade.accountId,
      tradeId: trade.tradeId,
      symbol: trade.symbol,
      action: trade.action,
      quantity: trade.quantity,
      price: trade.price,
      timestamp: new Date().toISOString(),
    };

    const messageId = await this.producer.publishEvent(
      EventType.BACKEND_TRADE_EXECUTED,
      eventPayload,
      false
    );

    console.log(`[EventBusService] Published trade executed event: ${messageId}`);
    return messageId;
  }

  /**
   * 订阅AI决策事件
   * C2-BE-004: 订阅AI决策事件
   * C2-BE-005: 实现事件处理器
   * C2-BE-006: 配置消费者组
   * @param {Function} handler - 事件处理器
   * @param {Object} options - 消费者配置
   */
  async subscribeToAIDecisions(handler, options = {}) {
    this._ensureConnected();

    const consumerGroup = options.consumerGroup || 'backend-trade-executor';
    const consumerName = options.consumerName || null;

    this.consumer = new EventConsumer({
      client: this.client,
      serviceName: 'backend',
      consumerGroup: consumerGroup,
      consumerName: consumerName,
      retryCount: options.retryCount || 3,
      retryDelay: options.retryDelay || 1000,
    });

    // 包装处理器，添加日志和错误处理
    const wrappedHandler = async (event) => {
      try {
        console.log(`[EventBusService] Received AI decision: ${event.eventId}`);
        await handler(event);
        console.log(`[EventBusService] Processed AI decision: ${event.eventId}`);
      } catch (error) {
        console.error(`[EventBusService] Error processing AI decision: ${error.message}`);
        throw error; // 抛出错误以触发重试
      }
    };

    this.consumer.subscribe(EventType.AI_DECISION_MADE, wrappedHandler);

    // 启动消费者
    this.consumer.start();

    console.log(`[EventBusService] Subscribed to AI decisions (group: ${consumerGroup})`);
  }

  /**
   * 停止事件总线服务
   */
  async stop() {
    if (this.consumer) {
      await this.consumer.stop();
    }

    if (this.client) {
      await this.client.disconnect();
    }

    this.isConnected = false;
    console.log('[EventBusService] Stopped');
  }

  /**
   * 获取Redis客户端
   * @returns {EventBusClient}
   */
  getClient() {
    return this.client;
  }

  /**
   * 获取生产者
   * @returns {EventProducer}
   */
  getProducer() {
    return this.producer;
  }

  /**
   * 检查连接状态
   * @returns {boolean}
   */
  isHealthy() {
    if (!this.client) return false;
    return this.client.healthCheck();
  }

  /**
   * 确保已连接
   * @private
   */
  _ensureConnected() {
    if (!this.isConnected) {
      throw new Error('EventBusService not initialized. Call initialize() first.');
    }
  }
}

// 导出单例
const eventBusService = new EventBusService();
export { eventBusService as default, EventBusService };
