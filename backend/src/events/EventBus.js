import { createClient } from 'redis';

/**
 * 事件总线错误
 */
export class EventBusError extends Error {
  constructor(message, originalError = null) {
    super(message);
    this.name = 'EventBusError';
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * 事件总线配置
 */
const DEFAULT_CONFIG = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  reconnectMaxRetries: 10,
  reconnectBaseDelay: 100,
  reconnectMaxDelay: 3000,
  messageTimeout: 30000,
  enableOfflineQueue: true
};

/**
 * 事件总线
 * 封装 Redis Pub/Sub，提供发布/订阅接口
 */
export class EventBus {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.publisher = null;
    this.subscriber = null;
    this.subscriptions = new Map();
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.messageQueue = [];
  }

  /**
   * 创建 Redis 客户端
   * @param {string} name - 客户端名称
   * @returns {Object} Redis 客户端
   */
  createClient(name) {
    const client = createClient({
      url: this.config.url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > this.config.reconnectMaxRetries) {
            console.error(`[EventBus:${name}] 重连次数过多，放弃连接`);
            return new Error('Too many retries');
          }
          const delay = Math.min(
            retries * this.config.reconnectBaseDelay,
            this.config.reconnectMaxDelay
          );
          console.log(`[EventBus:${name}] ${delay}ms 后重试...`);
          return delay;
        }
      }
    });

    client.on('error', (err) => {
      console.error(`[EventBus:${name}] Redis 错误:`, err.message);
    });

    client.on('connect', () => {
      console.log(`[EventBus:${name}] Redis 已连接`);
      this.reconnectAttempts = 0;
    });

    client.on('reconnecting', () => {
      this.reconnectAttempts++;
      console.log(`[EventBus:${name}] Redis 重连中... (第${this.reconnectAttempts}次)`);
    });

    client.on('disconnect', () => {
      console.log(`[EventBus:${name}] Redis 已断开`);
      if (name === 'subscriber') {
        this.isConnected = false;
      }
    });

    return client;
  }

  /**
   * 连接到 Redis
   */
  async connect() {
    try {
      // 创建发布者客户端
      if (!this.publisher) {
        this.publisher = this.createClient('publisher');
        await this.publisher.connect();
      }

      // 创建订阅者客户端
      if (!this.subscriber) {
        this.subscriber = this.createClient('subscriber');
        await this.subscriber.connect();
        this.isConnected = true;

        // 设置消息处理器
        this.subscriber.on('message', (channel, message) => {
          this.handleMessage(channel, message);
        });

        // 重新订阅之前的频道
        for (const [channel, handlers] of this.subscriptions.entries()) {
          await this.subscriber.subscribe(channel, (message) => {
            this.handleMessage(channel, message);
          });
          console.log(`[EventBus] 重新订阅频道: ${channel} (${handlers.length} 个处理器)`);
        }
      }

      // 处理离线期间的消息队列
      await this.processMessageQueue();

      console.log('[EventBus] 事件总线初始化完成');
      return true;
    } catch (error) {
      console.error('[EventBus] 连接失败:', error.message);
      throw new EventBusError('无法连接到 Redis', error);
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    try {
      if (this.subscriber) {
        await this.subscriber.disconnect();
        this.subscriber = null;
      }
      if (this.publisher) {
        await this.publisher.disconnect();
        this.publisher = null;
      }
      this.isConnected = false;
      console.log('[EventBus] 已断开连接');
    } catch (error) {
      console.error('[EventBus] 断开连接时出错:', error.message);
    }
  }

  /**
   * 处理消息
   * @param {string} channel - 频道名称
   * @param {string} message - 消息内容
   */
  handleMessage(channel, message) {
    try {
      const handlers = this.subscriptions.get(channel);
      if (!handlers || handlers.length === 0) {
        console.warn(`[EventBus] 收到消息但无处理器: ${channel}`);
        return;
      }

      let data;
      try {
        data = JSON.parse(message);
      } catch {
        data = message;
      }

      console.log(`[EventBus] 收到消息 [${channel}]:`, data);

      // 异步执行所有处理器
      handlers.forEach(handler => {
        try {
          handler(data, channel);
        } catch (error) {
          console.error(`[EventBus] 处理器执行失败 [${channel}]:`, error.message);
        }
      });
    } catch (error) {
      console.error('[EventBus] 处理消息失败:', error.message);
    }
  }

  /**
   * 订阅频道
   * @param {string} channel - 频道名称
   * @param {Function} handler - 消息处理器
   * @returns {Promise<boolean>}
   */
  async subscribe(channel, handler) {
    if (!channel || typeof handler !== 'function') {
      throw new EventBusError('频道名称和处理器是必需的');
    }

    try {
      // 确保已连接
      if (!this.isConnected) {
        await this.connect();
      }

      // 添加到订阅列表
      if (!this.subscriptions.has(channel)) {
        this.subscriptions.set(channel, []);

        // 订阅 Redis 频道
        await this.subscriber.subscribe(channel, (message) => {
          this.handleMessage(channel, message);
        });
        console.log(`[EventBus] 订阅频道: ${channel}`);
      }

      // 添加处理器
      this.subscriptions.get(channel).push(handler);
      console.log(`[EventBus] 添加处理器到 [${channel}], 当前共 ${this.subscriptions.get(channel).length} 个`);

      return true;
    } catch (error) {
      console.error(`[EventBus] 订阅失败 [${channel}]:`, error.message);
      throw new EventBusError(`订阅频道 ${channel} 失败`, error);
    }
  }

  /**
   * 取消订阅
   * @param {string} channel - 频道名称
   * @param {Function} handler - 消息处理器（可选，不传则取消所有）
   * @returns {Promise<boolean>}
   */
  async unsubscribe(channel, handler = null) {
    try {
      if (!this.subscriptions.has(channel)) {
        return false;
      }

      if (handler) {
        // 移除特定处理器
        const handlers = this.subscriptions.get(channel);
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
          console.log(`[EventBus] 移除处理器从 [${channel}]`);
        }

        // 如果无处理器了，取消订阅频道
        if (handlers.length === 0) {
          await this.subscriber.unsubscribe(channel);
          this.subscriptions.delete(channel);
          console.log(`[EventBus] 取消订阅频道: ${channel}`);
        }
      } else {
        // 取消订阅整个频道
        await this.subscriber.unsubscribe(channel);
        this.subscriptions.delete(channel);
        console.log(`[EventBus] 取消订阅频道及所有处理器: ${channel}`);
      }

      return true;
    } catch (error) {
      console.error(`[EventBus] 取消订阅失败 [${channel}]:`, error.message);
      throw new EventBusError(`取消订阅频道 ${channel} 失败`, error);
    }
  }

  /**
   * 发布消息
   * @param {string} channel - 频道名称
   * @param {any} data - 消息数据
   * @returns {Promise<boolean>}
   */
  async publish(channel, data) {
    if (!channel) {
      throw new EventBusError('频道名称是必需的');
    }

    try {
      // 确保已连接
      if (!this.isConnected) {
        if (this.config.enableOfflineQueue) {
          // 加入离线队列
          this.messageQueue.push({ channel, data, timestamp: Date.now() });
          console.log(`[EventBus] 服务离线，消息已加入队列: ${channel}`);
          return false;
        }
        await this.connect();
      }

      // 序列化消息
      const message = typeof data === 'string' ? data : JSON.stringify(data);

      // 发布消息
      await this.publisher.publish(channel, message);
      console.log(`[EventBus] 发布消息到 [${channel}]`);

      return true;
    } catch (error) {
      console.error(`[EventBus] 发布失败 [${channel}]:`, error.message);

      // 加入重试队列
      if (this.config.enableOfflineQueue) {
        this.messageQueue.push({ channel, data, timestamp: Date.now() });
      }

      throw new EventBusError(`发布消息到 ${channel} 失败`, error);
    }
  }

  /**
   * 处理离线消息队列
   */
  async processMessageQueue() {
    if (this.messageQueue.length === 0) return;

    console.log(`[EventBus] 处理离线消息队列: ${this.messageQueue.length} 条消息`);

    const failed = [];
    for (const item of this.messageQueue) {
      try {
        // 检查消息是否过期
        if (Date.now() - item.timestamp > this.config.messageTimeout) {
          console.warn(`[EventBus] 消息已过期，丢弃: ${item.channel}`);
          continue;
        }

        const message = typeof item.data === 'string' ? item.data : JSON.stringify(item.data);
        await this.publisher.publish(item.channel, message);
        console.log(`[EventBus] 离线消息已发送: ${item.channel}`);
      } catch (error) {
        console.error(`[EventBus] 离线消息发送失败: ${item.channel}`, error.message);
        failed.push(item);
      }
    }

    // 保留仍然失败的消息
    this.messageQueue = failed;

    if (failed.length > 0) {
      console.warn(`[EventBus] ${failed.length} 条消息发送失败，保留在队列中`);
    }
  }

  /**
   * 获取订阅信息
   * @returns {Object}
   */
  getSubscriptions() {
    const info = {};
    for (const [channel, handlers] of this.subscriptions.entries()) {
      info[channel] = {
        handlerCount: handlers.length
      };
    }
    return {
      channels: Object.keys(info),
      subscriptions: info,
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length
    };
  }

  /**
   * 清空所有订阅
   */
  async clearAllSubscriptions() {
    try {
      for (const channel of this.subscriptions.keys()) {
        await this.subscriber.unsubscribe(channel);
      }
      this.subscriptions.clear();
      console.log('[EventBus] 已清空所有订阅');
    } catch (error) {
      console.error('[EventBus] 清空订阅失败:', error.message);
    }
  }

  /**
   * 检查连接状态
   * @returns {boolean}
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      publisherConnected: this.publisher?.isReady || false,
      subscriberConnected: this.subscriber?.isReady || false
    };
  }
}

// 创建单例实例
export const eventBus = new EventBus();

export default EventBus;
