import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { StockHeatScheduler } from '../../../src/jobs/StockHeatScheduler.js';
import { eventBus } from '../../../src/events/EventBus.js';

/**
 * 热股票发布集成测试
 * 验证Redis消息发布功能
 *
 * 注意：运行这些测试需要Redis服务
 * - Redis (端口6379)
 */

describe('Hot Stocks Publishing Integration Tests', () => {
  const TEST_TIMEOUT = 30000;

  let scheduler;
  let receivedMessages = [];
  let testChannel = 'test:data-service:hot-stocks';

  beforeAll(async () => {
    // 连接到Redis
    try {
      await eventBus.connect();
    } catch (error) {
      console.warn('Redis连接失败，跳过集成测试:', error.message);
    }

    // 创建测试用的scheduler
    scheduler = new StockHeatScheduler({
      intervalMs: 60000,
      maxStocks: 10,
      publishChannel: testChannel,
      enableMetrics: true
    });

    // 订阅测试频道
    await eventBus.subscribe(testChannel, (message) => {
      receivedMessages.push(message);
    });
  }, TEST_TIMEOUT);

  afterAll(async () => {
    scheduler.stop();
    await eventBus.unsubscribe(testChannel);
    await eventBus.disconnect();
  }, TEST_TIMEOUT);

  beforeEach(() => {
    receivedMessages = [];
  });

  describe('Redis Publishing', () => {
    it('should publish hot stocks message to Redis channel', async () => {
      // Skip if Redis is not available
      if (!eventBus.isConnected) {
        console.log('Skipping Redis test - not connected');
        return;
      }

      const stocks = ['000001', '600519', '300001'];
      await scheduler.publishHotStocks(stocks, 5);

      // Wait a bit for message to be received
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].stocks).toEqual(stocks);
      expect(receivedMessages[0].count).toBe(3);
      expect(receivedMessages[0].accounts).toBe(5);
      expect(receivedMessages[0].source).toBe('backend-scheduler');
    }, TEST_TIMEOUT);

    it('should include timestamp in message', async () => {
      if (!eventBus.isConnected) {
        console.log('Skipping Redis test - not connected');
        return;
      }

      const before = Date.now();
      await scheduler.publishHotStocks(['000001'], 1);
      const after = Date.now();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedMessages[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(receivedMessages[0].timestamp).toBeLessThanOrEqual(after + 1000);
    }, TEST_TIMEOUT);

    it('should include version in message', async () => {
      if (!eventBus.isConnected) {
        console.log('Skipping Redis test - not connected');
        return;
      }

      await scheduler.publishHotStocks(['000001'], 1);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedMessages[0].version).toBe('1.0');
    }, TEST_TIMEOUT);
  });

  describe('Message Format', () => {
    it('should have correct message structure', async () => {
      if (!eventBus.isConnected) {
        console.log('Skipping Redis test - not connected');
        return;
      }

      const stocks = Array.from({ length: 10 }, (_, i) => `STOCK${i.toString().padStart(3, '0')}`);
      await scheduler.publishHotStocks(stocks, 100);

      await new Promise(resolve => setTimeout(resolve, 100));

      const message = receivedMessages[0];

      // Verify all required fields
      expect(message).toHaveProperty('stocks');
      expect(message).toHaveProperty('count');
      expect(message).toHaveProperty('accounts');
      expect(message).toHaveProperty('timestamp');
      expect(message).toHaveProperty('source');
      expect(message).toHaveProperty('version');

      // Verify types
      expect(Array.isArray(message.stocks)).toBe(true);
      expect(typeof message.count).toBe('number');
      expect(typeof message.accounts).toBe('number');
      expect(typeof message.timestamp).toBe('number');
      expect(typeof message.source).toBe('string');
      expect(typeof message.version).toBe('string');

      // Verify values
      expect(message.count).toBe(message.stocks.length);
      expect(message.source).toBe('backend-scheduler');
    }, TEST_TIMEOUT);
  });

  describe('Multiple Messages', () => {
    it('should receive multiple published messages', async () => {
      if (!eventBus.isConnected) {
        console.log('Skipping Redis test - not connected');
        return;
      }

      await scheduler.publishHotStocks(['000001'], 1);
      await scheduler.publishHotStocks(['600519'], 2);
      await scheduler.publishHotStocks(['300001'], 3);

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(receivedMessages).toHaveLength(3);
      expect(receivedMessages[0].accounts).toBe(1);
      expect(receivedMessages[1].accounts).toBe(2);
      expect(receivedMessages[2].accounts).toBe(3);
    }, TEST_TIMEOUT);
  });
});
