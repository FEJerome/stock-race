/**
 * Node.js Event Bus SDK 单元测试
 * 使用 Jest 测试框架
 */

const {
  EventBusClient,
  EventProducer,
  EventConsumer,
  EventSchema,
  EventType,
  validatePayload,
  ConnectionError,
  PublishError,
  ValidationError,
} = require('../../src/node');

// 测试配置
const TEST_REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '9'), // 使用DB9避免污染生产数据
};

describe('EventBus Node.js SDK', () => {
  let client;
  let producer;

  beforeAll(async () => {
    // 创建客户端连接
    client = new EventBusClient(TEST_REDIS_CONFIG);
    await client.connect();

    // 创建生产者
    producer = new EventProducer({
      client,
      serviceName: 'test-service',
      maxStreamLength: 1000,
    });
  });

  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  beforeEach(async () => {
    // 清理测试数据
    const redis = client.getClient();
    const keys = await redis.keys('*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('EventBusClient', () => {
    it('should connect to Redis successfully', async () => {
      const testClient = new EventBusClient(TEST_REDIS_CONFIG);
      await expect(testClient.connect()).resolves.not.toThrow();
      await testClient.disconnect();
    });

    it('should throw ConnectionError for invalid Redis', async () => {
      const badClient = new EventBusClient({
        host: 'invalid-host',
        port: 12345,
      });
      await expect(badClient.connect()).rejects.toThrow(ConnectionError);
    });

    it('should pass health check when connected', async () => {
      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false for health check when not connected', async () => {
      const testClient = new EventBusClient(TEST_REDIS_CONFIG);
      const isHealthy = await testClient.healthCheck();
      expect(isHealthy).toBe(false);
    });

    it('should throw when getting client before connect', () => {
      const testClient = new EventBusClient(TEST_REDIS_CONFIG);
      expect(() => testClient.getClient()).toThrow(ConnectionError);
    });
  });

  describe('EventSchema', () => {
    it('should create event with default values', () => {
      const event = new EventSchema({
        eventType: EventType.MARKET_QUOTE_REALTIME,
        source: 'test-service',
        payload: { symbol: '000001.SZ', price: 10.5 },
      });

      expect(event.eventId).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.version).toBe('1.0');
      expect(event.eventType).toBe(EventType.MARKET_QUOTE_REALTIME);
    });

    it('should convert to object correctly', () => {
      const event = new EventSchema({
        eventType: EventType.MARKET_QUOTE_REALTIME,
        source: 'test-service',
        payload: { symbol: '000001.SZ', price: 10.5 },
      });

      const obj = event.toObject();
      expect(obj.eventType).toBe(EventType.MARKET_QUOTE_REALTIME);
      expect(obj.source).toBe('test-service');
      expect(obj.payload.symbol).toBe('000001.SZ');
    });

    it('should convert to JSON and back', () => {
      const event = new EventSchema({
        eventType: EventType.MARKET_QUOTE_REALTIME,
        source: 'test-service',
        payload: { symbol: '000001.SZ', price: 10.5 },
      });

      const json = event.toJSON();
      const restored = EventSchema.fromJSON(json);

      expect(restored.eventId).toBe(event.eventId);
      expect(restored.eventType).toBe(event.eventType);
      expect(restored.payload.symbol).toBe('000001.SZ');
    });

    it('should create from object', () => {
      const data = {
        eventId: 'test-id-123',
        eventType: EventType.AI_DECISION_MADE,
        source: 'ai-service',
        payload: { decision: 'buy' },
        timestamp: new Date().toISOString(),
        version: '1.0',
      };

      const event = EventSchema.fromObject(data);
      expect(event.eventId).toBe('test-id-123');
      expect(event.eventType).toBe(EventType.AI_DECISION_MADE);
    });
  });

  describe('EventProducer', () => {
    it('should publish event successfully', async () => {
      const event = new EventSchema({
        eventType: EventType.MARKET_QUOTE_REALTIME,
        source: 'test-service',
        payload: {
          symbol: '000001.SZ',
          price: 10.5,
          change: 0.5,
          volume: 10000,
          timestamp: new Date().toISOString(),
        },
      });

      const messageId = await producer.publish(event, false); // 跳过验证
      expect(messageId).toBeDefined();
      expect(messageId).toMatch(/^\d+-\d+$/); // Redis stream message ID format
    });

    it('should publish event using publishEvent helper', async () => {
      const messageId = await producer.publishEvent(
        EventType.MARKET_QUOTE_REALTIME,
        {
          symbol: '000001.SZ',
          price: 10.5,
          change: 0.5,
          volume: 10000,
          timestamp: new Date().toISOString(),
        },
        null,
        false
      );

      expect(messageId).toBeDefined();
    });

    it('should validate payload when validate=true', async () => {
      const event = new EventSchema({
        eventType: EventType.MARKET_QUOTE_REALTIME,
        source: 'test-service',
        payload: {
          symbol: '000001.SZ',
          price: 'invalid', // 应该是 number
          change: 0.5,
          volume: 10000,
          timestamp: new Date().toISOString(),
        },
      });

      await expect(producer.publish(event, true)).rejects.toThrow(ValidationError);
    });

    it('should publish batch events', async () => {
      const events = [
        new EventSchema({
          eventType: EventType.MARKET_QUOTE_REALTIME,
          source: 'test-service',
          payload: {
            symbol: '000001.SZ',
            price: 10.5,
            change: 0.5,
            volume: 10000,
            timestamp: new Date().toISOString(),
          },
        }),
        new EventSchema({
          eventType: EventType.MARKET_QUOTE_REALTIME,
          source: 'test-service',
          payload: {
            symbol: '000002.SZ',
            price: 20.5,
            change: -0.5,
            volume: 20000,
            timestamp: new Date().toISOString(),
          },
        }),
      ];

      const messageIds = await producer.publishBatch(events, false);
      expect(messageIds).toHaveLength(2);
      expect(messageIds[0]).toBeDefined();
      expect(messageIds[1]).toBeDefined();
    });

    it('should get stream info', async () => {
      // 先发布一个事件
      await producer.publishEvent(
        EventType.MARKET_QUOTE_REALTIME,
        {
          symbol: '000001.SZ',
          price: 10.5,
          change: 0.5,
          volume: 10000,
          timestamp: new Date().toISOString(),
        },
        null,
        false
      );

      const info = await producer.getStreamInfo(EventType.MARKET_QUOTE_REALTIME);
      expect(info).toHaveProperty('length');
      expect(info).toHaveProperty('groups');
      expect(info.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty info for non-existent stream', async () => {
      const info = await producer.getStreamInfo('non:existent:stream');
      expect(info.length).toBe(0);
      expect(info.groups).toBe(0);
    });
  });

  describe('EventConsumer', () => {
    it('should subscribe and unsubscribe', () => {
      const consumer = new EventConsumer({
        client,
        serviceName: 'test-consumer',
        consumerGroup: 'test-group',
      });

      const handler = jest.fn();
      consumer.subscribe(EventType.MARKET_QUOTE_REALTIME, handler);

      expect(consumer.handlers.has(EventType.MARKET_QUOTE_REALTIME)).toBe(true);

      consumer.unsubscribe(EventType.MARKET_QUOTE_REALTIME);
      expect(consumer.handlers.has(EventType.MARKET_QUOTE_REALTIME)).toBe(false);
    });

    it('should consume events from stream', async () => {
      const receivedEvents = [];

      const consumer = new EventConsumer({
        client,
        serviceName: 'test-consumer',
        consumerGroup: 'test-group-1',
        consumerName: 'consumer-1',
        blockTimeout: 1000,
      });

      // 订阅事件
      consumer.subscribe(EventType.MARKET_QUOTE_REALTIME, async (event) => {
        receivedEvents.push(event);
      });

      // 启动消费者（非阻塞）
      const consumerPromise = consumer.start();

      // 等待消费者启动
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 发布测试事件
      await producer.publishEvent(
        EventType.MARKET_QUOTE_REALTIME,
        {
          symbol: '000001.SZ',
          price: 10.5,
          change: 0.5,
          volume: 10000,
          timestamp: new Date().toISOString(),
        },
        null,
        false
      );

      // 等待事件处理
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 停止消费者
      await consumer.stop();

      // 验证
      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
      expect(receivedEvents[0].payload.symbol).toBe('000001.SZ');
    });

    it('should retry failed message processing', async () => {
      let attemptCount = 0;

      const consumer = new EventConsumer({
        client,
        serviceName: 'test-consumer',
        consumerGroup: 'test-group-2',
        consumerName: 'consumer-2',
        blockTimeout: 1000,
        retryCount: 3,
        retryDelay: 100,
      });

      // 订阅一个会失败的事件处理器
      consumer.subscribe(EventType.MARKET_QUOTE_REALTIME, async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Simulated processing error');
        }
      });

      // 启动消费者
      const consumerPromise = consumer.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 发布测试事件
      await producer.publishEvent(
        EventType.MARKET_QUOTE_REALTIME,
        {
          symbol: '000001.SZ',
          price: 10.5,
          change: 0.5,
          volume: 10000,
          timestamp: new Date().toISOString(),
        },
        null,
        false
      );

      // 等待重试完成
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 停止消费者
      await consumer.stop();

      // 验证重试次数
      expect(attemptCount).toBe(3);
    });

    it('should not start without handlers', async () => {
      const consumer = new EventConsumer({
        client,
        serviceName: 'test-consumer',
        consumerGroup: 'test-group',
      });

      // 没有订阅任何事件
      await consumer.start();
      expect(consumer.running).toBe(false);
    });
  });

  describe('validatePayload', () => {
    it('should validate correct payload', () => {
      const payload = {
        symbol: '000001.SZ',
        price: 10.5,
        change: 0.5,
        volume: 10000,
        timestamp: new Date().toISOString(),
      };

      expect(validatePayload(EventType.MARKET_QUOTE_REALTIME, payload)).toBe(true);
    });

    it('should reject payload with wrong type', () => {
      const payload = {
        symbol: '000001.SZ',
        price: '10.5', // 应该是 number
        change: 0.5,
        volume: 10000,
        timestamp: new Date().toISOString(),
      };

      expect(validatePayload(EventType.MARKET_QUOTE_REALTIME, payload)).toBe(false);
    });

    it('should reject payload with missing field', () => {
      const payload = {
        symbol: '000001.SZ',
        // missing price
        change: 0.5,
        volume: 10000,
        timestamp: new Date().toISOString(),
      };

      expect(validatePayload(EventType.MARKET_QUOTE_REALTIME, payload)).toBe(false);
    });

    it('should return true for unknown event type', () => {
      const payload = { any: 'data' };
      expect(validatePayload('unknown:event:type', payload)).toBe(true);
    });
  });
});
