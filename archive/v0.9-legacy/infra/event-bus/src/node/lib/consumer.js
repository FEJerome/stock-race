/**
 * 事件消费者
 * 基于Redis Streams消费者组实现
 * 支持负载均衡和故障转移
 */

const { EventSchema } = require('./schema');
const { ConsumeError, ConsumerGroupError } = require('./exceptions');

/**
 * 事件消费者类
 */
class EventConsumer {
  /**
   * 创建事件消费者
   * @param {Object} options - 配置选项
   * @param {EventBusClient} options.client - 事件总线客户端
   * @param {string} options.serviceName - 服务名称
   * @param {string} options.consumerGroup - 消费者组名称
   * @param {string} [options.consumerName] - 消费者实例名称
   * @param {boolean} [options.autoCreateGroup=true] - 自动创建消费者组
   * @param {number} [options.blockTimeout=5000] - 阻塞读取超时时间（毫秒）
   * @param {number} [options.retryCount=3] - 处理失败重试次数
   * @param {number} [options.retryDelay=1000] - 重试间隔（毫秒）
   */
  constructor({
    client,
    serviceName,
    consumerGroup,
    consumerName = null,
    autoCreateGroup = true,
    blockTimeout = 5000,
    retryCount = 3,
    retryDelay = 1000,
  }) {
    this.client = client;
    this.serviceName = serviceName;
    this.consumerGroup = consumerGroup;
    this.consumerName = consumerName || `${serviceName}-${Date.now()}`;
    this.autoCreateGroup = autoCreateGroup;
    this.blockTimeout = blockTimeout;
    this.retryCount = retryCount;
    this.retryDelay = retryDelay;

    this.handlers = new Map();
    this.running = false;
    this.consumerTag = null;
  }

  /**
   * 订阅事件类型
   * @param {string} eventType - 事件类型
   * @param {Function} handler - 事件处理函数
   */
  subscribe(eventType, handler) {
    this.handlers.set(eventType, handler);
    console.log(`Subscribed to ${eventType}`);
  }

  /**
   * 取消订阅
   * @param {string} eventType - 事件类型
   */
  unsubscribe(eventType) {
    this.handlers.delete(eventType);
    console.log(`Unsubscribed from ${eventType}`);
  }

  /**
   * 确保消费者组存在
   * @param {string} streamName - Stream名称
   */
  async _ensureConsumerGroup(streamName) {
    const redis = this.client.getClient();
    try {
      await redis.xgroup('CREATE', streamName, this.consumerGroup, '0', 'MKSTREAM');
      console.log(`Created consumer group ${this.consumerGroup} for ${streamName}`);
    } catch (error) {
      if (error.message.includes('BUSYGROUP')) {
        console.log(`Consumer group ${this.consumerGroup} already exists`);
      } else {
        throw new ConsumerGroupError(`Failed to create consumer group: ${error.message}`);
      }
    }
  }

  /**
   * 处理单个消息
   * @param {string} streamName - Stream名称
   * @param {string} messageId - 消息ID
   * @param {Array} messageData - 消息数据
   * @returns {Promise<boolean>} 处理是否成功
   */
  async _processMessage(streamName, messageId, messageData) {
    try {
      // 解析事件
      const dataIndex = messageData.indexOf('data');
      if (dataIndex === -1 || dataIndex + 1 >= messageData.length) {
        console.warn(`Invalid message format: ${messageId}`);
        return true; // 格式错误也确认，避免无限重试
      }

      const eventData = JSON.parse(messageData[dataIndex + 1]);
      const event = EventSchema.fromObject(eventData);

      // 查找处理器
      const handler = this.handlers.get(event.eventType);
      if (!handler) {
        console.warn(`No handler for event type ${event.eventType}`);
        return true; // 无处理器视为处理成功
      }

      // 重试机制
      for (let attempt = 0; attempt < this.retryCount; attempt++) {
        try {
          await handler(event);
          console.log(`Processed event ${event.eventId}`);
          return true;
        } catch (error) {
          console.error(
            `Error processing event ${event.eventId} (attempt ${attempt + 1}/${this.retryCount}): ${error.message}`
          );
          if (attempt < this.retryCount - 1) {
            await this._sleep(this.retryDelay * (attempt + 1));
          }
        }
      }

      console.error(`Failed to process event ${event.eventId} after retries`);
      return false;
    } catch (error) {
      console.error(`Unexpected error processing message ${messageId}: ${error.message}`);
      return false;
    }
  }

  /**
   * 确认消息已处理
   * @param {string} streamName - Stream名称
   * @param {string} messageId - 消息ID
   */
  async _ackMessage(streamName, messageId) {
    const redis = this.client.getClient();
    try {
      await redis.xack(streamName, this.consumerGroup, messageId);
      console.log(`Acknowledged message ${messageId}`);
    } catch (error) {
      console.error(`Failed to acknowledge message ${messageId}: ${error.message}`);
    }
  }

  /**
   * 消费单个stream
   * @param {string} eventType - 事件类型
   */
  async _consumeStream(eventType) {
    const streamName = eventType;
    const redis = this.client.getClient();

    // 确保消费者组存在
    if (this.autoCreateGroup) {
      await this._ensureConsumerGroup(streamName);
    }

    while (this.running) {
      try {
        // 读取消息（阻塞模式）
        const messages = await redis.xreadgroup(
          'GROUP',
          this.consumerGroup,
          this.consumerName,
          'BLOCK',
          this.blockTimeout,
          'STREAMS',
          streamName,
          '>' // 读取未分配给任何消费者的消息
        );

        if (!messages || messages.length === 0) {
          continue;
        }

        // 处理消息
        for (const [stream, msgs] of messages) {
          for (const [messageId, messageData] of msgs) {
            const success = await this._processMessage(stream, messageId, messageData);
            if (success) {
              await this._ackMessage(stream, messageId);
            } else {
              console.warn(`Message ${messageId} processing failed, will be redelivered`);
            }
          }
        }
      } catch (error) {
        if (this.running) {
          console.error(`Error consuming from ${streamName}: ${error.message}`);
          await this._sleep(1000);
        }
      }
    }
  }

  /**
   * 启动消费者
   */
  async start() {
    if (this.running) {
      console.warn('Consumer already running');
      return;
    }

    if (this.handlers.size === 0) {
      console.warn('No event handlers registered');
      return;
    }

    this.running = true;
    console.log(`Consumer ${this.consumerName} started`);

    // 为每个订阅的stream启动消费
    const consumePromises = [];
    for (const [eventType] of this.handlers) {
      consumePromises.push(this._consumeStream(eventType));
    }

    // 等待所有消费循环（理论上不会同时结束）
    await Promise.all(consumePromises);
  }

  /**
   * 停止消费者
   */
  async stop() {
    if (!this.running) {
      return;
    }

    console.log('Stopping consumer...');
    this.running = false;
    console.log('Consumer stopped');
  }

  /**
   * 获取待处理消息
   * @param {string} eventType - 事件类型
   * @returns {Promise<Array>} 待处理消息列表
   */
  async getPendingMessages(eventType) {
    const streamName = eventType;
    const redis = this.client.getClient();
    try {
      const pending = await redis.xpending(
        streamName,
        this.consumerGroup,
        '-',
        '+',
        100
      );
      return pending.map((p) => ({
        messageId: p[0],
        consumer: p[1],
        idleTime: p[2],
        deliveryCount: p[3],
      }));
    } catch (error) {
      console.error(`Failed to get pending messages: ${error.message}`);
      return [];
    }
  }

  /**
   * 休眠
   * @param {number} ms - 毫秒
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = EventConsumer;
