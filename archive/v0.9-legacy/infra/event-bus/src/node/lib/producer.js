/**
 * 事件生产者
 * 负责发布事件到Redis Streams
 */

const { EventSchema } = require('./schema');
const { PublishError, ValidationError } = require('./exceptions');

/**
 * 事件生产者类
 */
class EventProducer {
  /**
   * 创建事件生产者
   * @param {Object} options - 配置选项
   * @param {EventBusClient} options.client - 事件总线客户端
   * @param {string} options.serviceName - 服务名称
   * @param {number} [options.maxStreamLength=10000] - 单个stream最大长度
   */
  constructor({ client, serviceName, maxStreamLength = 10000 }) {
    this.client = client;
    this.serviceName = serviceName;
    this.maxStreamLength = maxStreamLength;
  }

  /**
   * 发布单个事件
   * @param {EventSchema} event - 事件对象
   * @param {boolean} [validate=true] - 是否验证事件
   * @returns {Promise<string>} 消息ID
   * @throws {ValidationError|PublisheError}
   */
  async publish(event, validate = true) {
    try {
      // 验证事件
      if (validate) {
        const { validatePayload } = require('./schema');
        if (!validatePayload(event.eventType, event.payload)) {
          throw new ValidationError(`Invalid payload for event type ${event.eventType}`);
        }
      }

      // 确保source字段正确
      event.source = this.serviceName;

      // 获取Redis客户端
      const redis = this.client.getClient();
      const streamName = event.eventType;

      // 发布到Redis Streams
      const messageId = await redis.xadd(
        streamName,
        'MAXLEN',
        '~',
        this.maxStreamLength,
        '*',
        'data',
        event.toJSON()
      );

      console.log(`Published event ${event.eventId} to ${streamName}, message_id: ${messageId}`);
      return messageId;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new PublishError(`Failed to publish event: ${error.message}`);
    }
  }

  /**
   * 便捷方法：创建并发布事件
   * @param {string} eventType - 事件类型
   * @param {Object} payload - 事件负载
   * @param {string} [correlationId] - 关联ID
   * @param {boolean} [validate=true] - 是否验证
   * @returns {Promise<string>} 消息ID
   */
  async publishEvent(eventType, payload, correlationId = null, validate = true) {
    const event = new EventSchema({
      eventType,
      source: this.serviceName,
      payload,
      correlationId,
    });
    return this.publish(event, validate);
  }

  /**
   * 批量发布事件
   * @param {Array<EventSchema>} events - 事件列表
   * @param {boolean} [validate=true] - 是否验证
   * @returns {Promise<Array<string|null>>} 消息ID列表
   */
  async publishBatch(events, validate = true) {
    const messageIds = [];
    for (const event of events) {
      try {
        const messageId = await this.publish(event, validate);
        messageIds.push(messageId);
      } catch (error) {
        console.error(`Failed to publish event in batch: ${error.message}`);
        messageIds.push(null);
      }
    }
    return messageIds;
  }

  /**
   * 获取stream信息
   * @param {string} eventType - 事件类型
   * @returns {Promise<Object>} stream信息
   */
  async getStreamInfo(eventType) {
    const redis = this.client.getClient();
    try {
      const info = await redis.xinfo('STREAM', eventType);
      const infoObj = {};
      for (let i = 0; i < info.length; i += 2) {
        infoObj[info[i]] = info[i + 1];
      }
      return {
        length: infoObj.length || 0,
        radixTreeKeys: infoObj['radix-tree-keys'] || 0,
        radixTreeNodes: infoObj['radix-tree-nodes'] || 0,
        lastGeneratedId: infoObj['last-generated-id'] || '',
        groups: infoObj.groups || 0,
        firstEntry: infoObj['first-entry'],
        lastEntry: infoObj['last-entry'],
      };
    } catch (error) {
      // Stream不存在时返回空信息
      if (error.message.includes('ERR no such key')) {
        return {
          length: 0,
          radixTreeKeys: 0,
          radixTreeNodes: 0,
          lastGeneratedId: '',
          groups: 0,
          firstEntry: null,
          lastEntry: null,
        };
      }
      throw error;
    }
  }
}

module.exports = EventProducer;
