/**
 * Event Bus SDK 集成测试
 * 测试Backend与事件总线的集成
 *
 * 对应需求: C2-BE-001 ~ C2-BE-006
 */

const {
  EventBusClient,
  EventProducer,
  EventConsumer,
  EventType,
  EventSchema,
} = require('@stock-race/event-bus');

// 模拟Redis连接
const TEST_REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '1'), // 使用db1避免污染生产数据
};

describe('Event Bus Integration (C2-BE-001~006)', () => {
  let client;
  let producer;

  beforeAll(async () => {
    // 创建客户端连接
    client = new EventBusClient(TEST_REDIS_CONFIG);
    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  beforeEach(() => {
    // 创建生产者
    producer = new EventProducer({
      client: client,
      serviceName: 'backend-test',
    });
  });

  describe('C2-BE-001: 集成Node.js事件总线SDK', () => {
    it('should connect to Redis successfully', async () => {
      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should create EventProducer with service name', () => {
      expect(producer.serviceName).toBe('backend-test');
      expect(producer.maxStreamLength).toBe(10000);
    });

    it('should create EventConsumer with consumer group', () => {
      const consumer = new EventConsumer({
        client: client,
        serviceName: 'backend-test',
        consumerGroup: 'test-group',
      });

      expect(consumer.serviceName).toBe('backend-test');
      expect(consumer.consumerGroup).toBe('test-group');
      expect(consumer.consumerName).toMatch(/^backend-test-/);
    });
  });

  describe('C2-BE-002: 发布账户更新事件', () => {
    it('should publish backend:account:updated event', async () => {
      const eventPayload = {
        accountId: 'acc-test-001',
        field: 'balance',
        oldValue: 100000,
        newValue: 95000,
        timestamp: new Date().toISOString(),
      };

      const messageId = await producer.publishEvent(
        EventType.BACKEND_ACCOUNT_UPDATED,
        eventPayload,
        false // 跳过验证，使用自定义payload
      );

      expect(messageId).toBeTruthy();
      expect(typeof messageId).toBe('string');
    });

    it('should publish account status change event', async () => {
      const eventPayload = {
        accountId: 'acc-test-002',
        field: 'status',
        oldValue: 'initializing',
        newValue: 'active',
        timestamp: new Date().toISOString(),
      };

      const messageId = await producer.publishEvent(
        EventType.BACKEND_ACCOUNT_UPDATED,
        eventPayload,
        false
      );

      expect(messageId).toBeTruthy();
    });
  });

  describe('C2-BE-003: 发布交易执行事件', () => {
    it('should publish backend:trade:executed event', async () => {
      const eventPayload = {
        accountId: 'acc-test-001',
        tradeId: 'trade-001',
        symbol: '000001.SZ',
        action: 'buy',
        quantity: 100,
        price: 12.58,
        timestamp: new Date().toISOString(),
      };

      const messageId = await producer.publishEvent(
        EventType.BACKEND_TRADE_EXECUTED,
        eventPayload,
        false
      );

      expect(messageId).toBeTruthy();
    });

    it('should publish sell trade event', async () => {
      const eventPayload = {
        accountId: 'acc-test-001',
        tradeId: 'trade-002',
        symbol: '600519.SH',
        action: 'sell',
        quantity: 50,
        price: 1680.00,
        timestamp: new Date().toISOString(),
      };

      const messageId = await producer.publishEvent(
        EventType.BACKEND_TRADE_EXECUTED,
        eventPayload,
        false
      );

      expect(messageId).toBeTruthy();
    });
  });

  describe('C2-BE-004: 订阅AI决策事件', () => {
    it('should subscribe to ai:decision:made events', async () => {
      const consumer = new EventConsumer({
        client: client,
        serviceName: 'backend-test',
        consumerGroup: 'test-ai-decision-group',
      });

      const mockHandler = jest.fn();
      consumer.subscribe(EventType.AI_DECISION_MADE, mockHandler);

      expect(consumer.handlers.has(EventType.AI_DECISION_MADE)).toBe(true);
      expect(consumer.handlers.get(EventType.AI_DECISION_MADE)).toBe(mockHandler);
    });

    it('should receive AI decision events', async () => {
      const receivedEvents = [];
      const consumer = new EventConsumer({
        client: client,
        serviceName: 'backend-test',
        consumerGroup: 'test-receive-group-' + Date.now(),
      });

      // 设置处理器
      const handler = (event) => {
        receivedEvents.push(event);
        return Promise.resolve();
      };

      consumer.subscribe(EventType.AI_DECISION_MADE, handler);

      // 启动消费者
      consumer.start();

      // 等待消费者准备就绪
      await new Promise(resolve => setTimeout(resolve, 100));

      // 发布一个AI决策事件（模拟Trading AI服务发布）
      const aiProducer = new EventProducer({
        client: client,
        serviceName: 'trading-ai-test',
      });

      await aiProducer.publishEvent(
        EventType.AI_DECISION_MADE,
        {
          accountId: 'acc-test-001',
          decision: 'buy',
          confidence: 0.85,
          reasoning: 'Strong uptrend detected',
          timestamp: new Date().toISOString(),
        },
        false
      );

      // 等待事件被消费
      await new Promise(resolve => setTimeout(resolve, 500));

      // 停止消费者
      await consumer.stop();

      // 验证事件被接收
      expect(receivedEvents.length).toBeGreaterThan(0);
      expect(receivedEvents[0].payload.accountId).toBe('acc-test-001');
    }, 10000);
  });

  describe('C2-BE-005: 实现事件处理器', () => {
    it('should handle AI decision with trade execution logic', async () => {
      const mockTradeExecutor = {
        execute: jest.fn().mockResolvedValue({
          id: 'trade-001',
          symbol: '000001.SZ',
          action: 'buy',
          quantity: 100,
          price: 12.58,
        }),
      };

      const handler = async (event) => {
        const { accountId, decision } = event.payload;

        // 模拟交易执行
        if (decision === 'buy' || decision === 'sell') {
          await mockTradeExecutor.execute(accountId, decision);
        }
      };

      const testEvent = new EventSchema({
        eventType: EventType.AI_DECISION_MADE,
        source: 'trading-ai',
        payload: {
          accountId: 'acc-test-001',
          decision: 'buy',
          confidence: 0.85,
          reasoning: 'Strong uptrend',
        },
      });

      await handler(testEvent);

      expect(mockTradeExecutor.execute).toHaveBeenCalledWith('acc-test-001', 'buy');
    });

    it('should ignore hold decisions', async () => {
      const mockTradeExecutor = {
        execute: jest.fn(),
      };

      const handler = async (event) => {
        const { decision } = event.payload;
        if (decision !== 'hold') {
          await mockTradeExecutor.execute();
        }
      };

      const testEvent = new EventSchema({
        eventType: EventType.AI_DECISION_MADE,
        source: 'trading-ai',
        payload: {
          accountId: 'acc-test-001',
          decision: 'hold',
          confidence: 0.5,
        },
      });

      await handler(testEvent);

      expect(mockTradeExecutor.execute).not.toHaveBeenCalled();
    });
  });

  describe('C2-BE-006: 配置消费者组', () => {
    it('should create consumer with auto-generated name', () => {
      const consumer = new EventConsumer({
        client: client,
        serviceName: 'backend',
        consumerGroup: 'trade-executor-group',
      });

      expect(consumer.consumerName).toMatch(/^backend-/);
      expect(consumer.consumerGroup).toBe('trade-executor-group');
    });

    it('should support multiple consumers in same group', async () => {
      const consumerGroup = 'test-multi-consumer-group';

      const consumer1 = new EventConsumer({
        client: client,
        serviceName: 'backend',
        consumerGroup: consumerGroup,
        consumerName: 'instance-1',
      });

      const consumer2 = new EventConsumer({
        client: client,
        serviceName: 'backend',
        consumerGroup: consumerGroup,
        consumerName: 'instance-2',
      });

      expect(consumer1.consumerGroup).toBe(consumerGroup);
      expect(consumer2.consumerGroup).toBe(consumerGroup);
      expect(consumer1.consumerName).not.toBe(consumer2.consumerName);
    });

    it('should configure retry and timeout options', () => {
      const consumer = new EventConsumer({
        client: client,
        serviceName: 'backend',
        consumerGroup: 'test-group',
        blockTimeout: 10000,
        retryCount: 5,
        retryDelay: 2000,
      });

      expect(consumer.blockTimeout).toBe(10000);
      expect(consumer.retryCount).toBe(5);
      expect(consumer.retryDelay).toBe(2000);
    });
  });

  describe('End-to-End Event Flow', () => {
    it('should complete full event flow: AI decision -> Trade execution -> Event publish', async () => {
      const receivedDecisions = [];
      const publishedTrades = [];
      const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      // 创建消费者订阅AI决策 - 使用唯一的group避免收到其他测试的消息
      const consumer = new EventConsumer({
        client: client,
        serviceName: 'backend-e2e',
        consumerGroup: 'e2e-test-group-' + uniqueSuffix,
        consumerName: 'e2e-consumer-' + uniqueSuffix,
      });

      // 创建交易执行生产者
      const tradeProducer = new EventProducer({
        client: client,
        serviceName: 'backend-e2e',
      });

      // 设置处理器：接收AI决策并发布交易执行事件
      const handler = async (event) => {
        receivedDecisions.push(event);

        // 模拟交易执行
        const tradeResult = {
          accountId: event.payload.accountId,
          tradeId: `trade-${Date.now()}`,
          symbol: event.payload.symbol || '000001.SZ',
          action: event.payload.decision,
          quantity: 100,
          price: 12.58,
          timestamp: new Date().toISOString(),
        };

        // 发布交易执行事件
        const messageId = await tradeProducer.publishEvent(
          EventType.BACKEND_TRADE_EXECUTED,
          tradeResult,
          false
        );

        publishedTrades.push({ ...tradeResult, messageId });
      };

      consumer.subscribe(EventType.AI_DECISION_MADE, handler);
      consumer.start();

      // 等待消费者就绪
      await new Promise(resolve => setTimeout(resolve, 100));

      // 模拟Trading AI发布决策
      const aiProducer = new EventProducer({
        client: client,
        serviceName: 'trading-ai-e2e',
      });

      await aiProducer.publishEvent(
        EventType.AI_DECISION_MADE,
        {
          accountId: 'acc-e2e-001',
          decision: 'buy',
          confidence: 0.9,
          reasoning: 'E2E test',
          timestamp: new Date().toISOString(),
        },
        false
      );

      // 等待处理完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 停止消费者
      await consumer.stop();

      // 验证完整流程（可能收到历史消息，只验证收到了当前测试的事件）
      expect(receivedDecisions.length).toBeGreaterThanOrEqual(1);
      // 查找当前测试发布的事件
      const currentTestEvent = receivedDecisions.find(
        e => e.payload.accountId === 'acc-e2e-001' && e.payload.reasoning === 'E2E test'
      );
      expect(currentTestEvent).toBeTruthy();
      expect(publishedTrades.length).toBeGreaterThanOrEqual(1);
      const currentTestTrade = publishedTrades.find(
        t => t.accountId === 'acc-e2e-001'
      );
      expect(currentTestTrade).toBeTruthy();
      expect(currentTestTrade.action).toBe('buy');
      expect(currentTestTrade.messageId).toBeTruthy();
    }, 15000);
  });
});
