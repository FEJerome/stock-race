/**
 * Event Bus SDK 单元测试 (Node.js版)
 */

const {
  EventBusClient,
  EventProducer,
  EventConsumer,
  EventType,
  EventSchema,
  validatePayload,
  ConnectionError,
  ValidationError,
  PublishError,
} = require('../index');

describe('EventBus SDK Unit Tests', () => {

  describe('EventSchema', () => {
    test('should create EventSchema with default values', () => {
      const event = new EventSchema({
        eventType: EventType.MARKET_QUOTE_REALTIME,
        source: 'test-service',
        payload: { symbol: '000001.SZ', price: 12.5 },
      });

      expect(event.eventType).toBe(EventType.MARKET_QUOTE_REALTIME);
      expect(event.source).toBe('test-service');
      expect(event.payload.symbol).toBe('000001.SZ');
      expect(event.eventId).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.version).toBe('1.0');
    });

    test('should convert to JSON and back', () => {
      const event = new EventSchema({
        eventType: EventType.MARKET_QUOTE_REALTIME,
        source: 'test-service',
        payload: { symbol: '000001.SZ', price: 12.5 },
      });

      const json = event.toJSON();
      const restored = EventSchema.fromJSON(json);

      expect(restored.eventType).toBe(event.eventType);
      expect(restored.source).toBe(event.source);
      expect(restored.payload.symbol).toBe(event.payload.symbol);
    });

    test('should convert to object and back', () => {
      const event = new EventSchema({
        eventType: EventType.NEWS_INTELLIGENCE_EXTRACTED,
        source: 'news-service',
        payload: { stockCode: '600519', intelligence: 'test' },
        correlationId: 'corr-123',
      });

      const obj = event.toObject();
      const restored = EventSchema.fromObject(obj);

      expect(restored.correlationId).toBe('corr-123');
      expect(restored.eventType).toBe(EventType.NEWS_INTELLIGENCE_EXTRACTED);
    });
  });

  describe('Payload Validation', () => {
    test('should validate valid MARKET_QUOTE_REALTIME payload', () => {
      const payload = {
        symbol: '000001.SZ',
        price: 12.58,
        change: 0.5,
        volume: 10000,
        timestamp: '2026-02-11T10:00:00Z',
      };

      expect(validatePayload(EventType.MARKET_QUOTE_REALTIME, payload)).toBe(true);
    });

    test('should reject invalid MARKET_QUOTE_REALTIME payload', () => {
      const payload = {
        symbol: '000001.SZ',
        price: '12.58', // Should be number
        change: 0.5,
        volume: 10000,
        timestamp: '2026-02-11T10:00:00Z',
      };

      expect(validatePayload(EventType.MARKET_QUOTE_REALTIME, payload)).toBe(false);
    });

    test('should validate valid AI_DECISION_MADE payload', () => {
      const payload = {
        accountId: 'acc-123',
        decision: 'buy',
        confidence: 0.85,
        reasoning: 'Strong uptrend detected',
        timestamp: '2026-02-11T10:00:00Z',
      };

      expect(validatePayload(EventType.AI_DECISION_MADE, payload)).toBe(true);
    });

    test('should allow unknown event types', () => {
      expect(validatePayload('unknown:event', { any: 'data' })).toBe(true);
    });
  });

  describe('EventBusClient', () => {
    test('should create client with default options', () => {
      const client = new EventBusClient();

      expect(client.host).toBe('localhost');
      expect(client.port).toBe(6379);
      expect(client.db).toBe(0);
    });

    test('should create client with custom options', () => {
      const client = new EventBusClient({
        host: 'redis.example.com',
        port: 6380,
        db: 1,
        password: 'secret',
      });

      expect(client.host).toBe('redis.example.com');
      expect(client.port).toBe(6380);
      expect(client.db).toBe(1);
      expect(client.password).toBe('secret');
    });

    test('should throw ConnectionError when getting client before connect', () => {
      const client = new EventBusClient();

      expect(() => client.getClient()).toThrow(ConnectionError);
    });
  });

  describe('EventProducer', () => {
    test('should create producer with service name', () => {
      const mockClient = {
        getClient: jest.fn(),
      };

      const producer = new EventProducer({
        client: mockClient,
        serviceName: 'test-service',
      });

      expect(producer.serviceName).toBe('test-service');
      expect(producer.maxStreamLength).toBe(10000);
    });

    test('should create producer with custom maxStreamLength', () => {
      const mockClient = {
        getClient: jest.fn(),
      };

      const producer = new EventProducer({
        client: mockClient,
        serviceName: 'test-service',
        maxStreamLength: 5000,
      });

      expect(producer.maxStreamLength).toBe(5000);
    });
  });

  describe('EventConsumer', () => {
    test('should create consumer with auto-generated name', () => {
      const mockClient = {
        getClient: jest.fn(),
      };

      const consumer = new EventConsumer({
        client: mockClient,
        serviceName: 'test-service',
        consumerGroup: 'test-group',
      });

      expect(consumer.serviceName).toBe('test-service');
      expect(consumer.consumerGroup).toBe('test-group');
      expect(consumer.consumerName).toMatch(/^test-service-/);
      expect(consumer.autoCreateGroup).toBe(true);
      expect(consumer.blockTimeout).toBe(5000);
      expect(consumer.retryCount).toBe(3);
    });

    test('should create consumer with custom options', () => {
      const mockClient = {
        getClient: jest.fn(),
      };

      const consumer = new EventConsumer({
        client: mockClient,
        serviceName: 'test-service',
        consumerGroup: 'test-group',
        consumerName: 'custom-consumer',
        autoCreateGroup: false,
        blockTimeout: 10000,
        retryCount: 5,
        retryDelay: 2000,
      });

      expect(consumer.consumerName).toBe('custom-consumer');
      expect(consumer.autoCreateGroup).toBe(false);
      expect(consumer.blockTimeout).toBe(10000);
      expect(consumer.retryCount).toBe(5);
      expect(consumer.retryDelay).toBe(2000);
    });

    test('should subscribe and unsubscribe handlers', () => {
      const mockClient = {
        getClient: jest.fn(),
      };

      const consumer = new EventConsumer({
        client: mockClient,
        serviceName: 'test-service',
        consumerGroup: 'test-group',
      });

      const handler = jest.fn();

      consumer.subscribe(EventType.MARKET_QUOTE_REALTIME, handler);
      expect(consumer.handlers.get(EventType.MARKET_QUOTE_REALTIME)).toBe(handler);

      consumer.unsubscribe(EventType.MARKET_QUOTE_REALTIME);
      expect(consumer.handlers.has(EventType.MARKET_QUOTE_REALTIME)).toBe(false);
    });

    test('should not start without handlers', async () => {
      const mockClient = {
        getClient: jest.fn(),
      };

      const consumer = new EventConsumer({
        client: mockClient,
        serviceName: 'test-service',
        consumerGroup: 'test-group',
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await consumer.start();

      expect(consoleSpy).toHaveBeenCalledWith('No event handlers registered');
      expect(consumer.running).toBe(false);

      consoleSpy.mockRestore();
    });

    test('should not start if already running', async () => {
      const mockClient = {
        getClient: jest.fn(),
      };

      const consumer = new EventConsumer({
        client: mockClient,
        serviceName: 'test-service',
        consumerGroup: 'test-group',
      });

      consumer.running = true;

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await consumer.start();

      expect(consoleSpy).toHaveBeenCalledWith('Consumer already running');

      consoleSpy.mockRestore();
    });
  });

  describe('EventType Enum', () => {
    test('should have all required event types', () => {
      expect(EventType.MARKET_QUOTE_REALTIME).toBe('market:quote:realtime');
      expect(EventType.MARKET_ALERT_PRICE_MOVE).toBe('market:alert:price_move');
      expect(EventType.MARKET_INDICATOR_UPDATED).toBe('market:indicator:updated');
      expect(EventType.NEWS_INTELLIGENCE_EXTRACTED).toBe('news:intelligence:extracted');
      expect(EventType.NEWS_SENTIMENT_CHANGED).toBe('news:sentiment:changed');
      expect(EventType.AI_DECISION_MADE).toBe('ai:decision:made');
      expect(EventType.AI_PERFORMANCE_REPORT).toBe('ai:performance:report');
      expect(EventType.BACKEND_ACCOUNT_UPDATED).toBe('backend:account:updated');
      expect(EventType.BACKEND_TRADE_EXECUTED).toBe('backend:trade:executed');
    });
  });
});

describe('EventBus SDK Integration Tests', () => {
  let client;
  let producer;
  let consumer;

  beforeEach(async () => {
    client = new EventBusClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
    await client.connect();
  });

  afterEach(async () => {
    if (consumer) {
      await consumer.stop();
    }
    if (client) {
      await client.disconnect();
    }
  });

  test('integration: should connect to Redis', async () => {
    const isHealthy = await client.healthCheck();
    expect(isHealthy).toBe(true);
  });

  test('integration: should publish and consume events', async () => {
    const testEventType = 'test:integration:event';
    const receivedEvents = [];

    // Create consumer
    consumer = new EventConsumer({
      client: client,
      serviceName: 'test-service',
      consumerGroup: 'test-group-' + Date.now(),
    });

    // Set up handler
    const handler = (event) => {
      receivedEvents.push(event);
      return Promise.resolve();
    };

    consumer.subscribe(testEventType, handler);

    // Start consumer
    consumer.start();

    // Create producer and publish
    producer = new EventProducer({
      client: client,
      serviceName: 'test-producer',
    });

    await producer.publishEvent(
      testEventType,
      {
        symbol: '000001.SZ',
        price: 12.58,
        change: 0.5,
        volume: 10000,
        timestamp: new Date().toISOString(),
      },
      false // Skip validation for custom event type
    );

    // Wait for event to be consumed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Stop consumer
    await consumer.stop();

    // Verify
    expect(receivedEvents.length).toBeGreaterThan(0);
    expect(receivedEvents[0].payload.symbol).toBe('000001.SZ');
  }, 10000);

  test('integration: should publish multiple events', async () => {
    producer = new EventProducer({
      client: client,
      serviceName: 'test-producer',
    });

    const events = [
      new EventSchema({
        eventType: 'test:batch:1',
        source: 'test',
        payload: { index: 1 },
      }),
      new EventSchema({
        eventType: 'test:batch:2',
        source: 'test',
        payload: { index: 2 },
      }),
    ];

    const messageIds = await producer.publishBatch(events, false);

    expect(messageIds.length).toBe(2);
    expect(messageIds[0]).toBeTruthy();
    expect(messageIds[1]).toBeTruthy();
  });

  test('integration: should get stream info', async () => {
    producer = new EventProducer({
      client: client,
      serviceName: 'test-producer',
    });

    const testEventType = 'test:stream:info';

    // Publish an event first
    await producer.publishEvent(
      testEventType,
      { test: 'data' },
      false
    );

    // Get stream info
    const info = await producer.getStreamInfo(testEventType);

    expect(info).toHaveProperty('length');
    expect(info).toHaveProperty('groups');
    expect(info).toHaveProperty('lastGeneratedId');
    expect(typeof info.length).toBe('number');
  });
});
