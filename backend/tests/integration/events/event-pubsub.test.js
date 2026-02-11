import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import EventBus from '../../../src/events/EventBus.js';

/**
 * Redis Pub/Sub 集成测试
 * 跨进程消息传递验证
 *
 * 注意：运行这些测试需要 Redis 服务已启动
 * Redis: redis://localhost:6379
 */

describe('EventBus Pub/Sub Integration Tests', () => {
  const TEST_TIMEOUT = 10000;
  let eventBus1;
  let eventBus2;

  beforeAll(async () => {
    // Create two separate EventBus instances to simulate cross-process communication
    eventBus1 = new EventBus({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      enableOfflineQueue: false
    });

    eventBus2 = new EventBus({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      enableOfflineQueue: false
    });

    try {
      await eventBus1.connect();
      await eventBus2.connect();
    } catch (error) {
      console.warn('Redis not available, skipping integration tests:', error.message);
      // Mark tests as skipped if Redis is not available
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await eventBus1?.disconnect();
    await eventBus2?.disconnect();
  }, TEST_TIMEOUT);

  describe('Cross-Instance Communication', () => {
    it('should receive messages across instances', async () => {
      const receivedMessages = [];

      // Subscribe on instance 1
      await eventBus1.subscribe('test:cross', (data) => {
        receivedMessages.push(data);
      });

      // Publish from instance 2
      await eventBus2.publish('test:cross', { message: 'hello from bus2' });

      // Wait for message to propagate
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].message).toBe('hello from bus2');
    }, TEST_TIMEOUT);

    it('should handle multiple subscribers on same channel', async () => {
      const messages1 = [];
      const messages2 = [];

      // Subscribe two handlers on instance 1
      await eventBus1.subscribe('test:multi', (data) => {
        messages1.push(data);
      });

      await eventBus1.subscribe('test:multi', (data) => {
        messages2.push(data);
      });

      // Publish from instance 2
      await eventBus2.publish('test:multi', { id: 1 });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(1);
      expect(messages1[0].id).toBe(1);
      expect(messages2[0].id).toBe(1);
    }, TEST_TIMEOUT);

    it('should handle different channels independently', async () => {
      const channel1Messages = [];
      const channel2Messages = [];

      await eventBus1.subscribe('channel:a', (data) => {
        channel1Messages.push(data);
      });

      await eventBus1.subscribe('channel:b', (data) => {
        channel2Messages.push(data);
      });

      await eventBus2.publish('channel:a', { channel: 'a' });
      await eventBus2.publish('channel:b', { channel: 'b' });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(channel1Messages).toHaveLength(1);
      expect(channel2Messages).toHaveLength(1);
      expect(channel1Messages[0].channel).toBe('a');
      expect(channel2Messages[0].channel).toBe('b');
    }, TEST_TIMEOUT);
  });

  describe('Message Types', () => {
    it('should handle string messages', async () => {
      const messages = [];

      await eventBus1.subscribe('test:string', (data) => {
        messages.push(data);
      });

      await eventBus2.publish('test:string', 'plain string message');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messages).toHaveLength(1);
      expect(messages[0]).toBe('plain string message');
    }, TEST_TIMEOUT);

    it('should handle object messages', async () => {
      const messages = [];

      await eventBus1.subscribe('test:object', (data) => {
        messages.push(data);
      });

      const testObject = {
        id: '123',
        nested: { key: 'value' },
        array: [1, 2, 3],
        timestamp: new Date().toISOString()
      };

      await eventBus2.publish('test:object', testObject);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(testObject);
    }, TEST_TIMEOUT);

    it('should handle array messages', async () => {
      const messages = [];

      await eventBus1.subscribe('test:array', (data) => {
        messages.push(data);
      });

      const testArray = [1, 2, 3, { nested: true }];

      await eventBus2.publish('test:array', testArray);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(testArray);
    }, TEST_TIMEOUT);
  });

  describe('High Frequency Messaging', () => {
    it('should handle rapid message publishing', async () => {
      const messages = [];

      await eventBus1.subscribe('test:rapid', (data) => {
        messages.push(data);
      });

      // Publish 50 messages rapidly
      const publishPromises = [];
      for (let i = 0; i < 50; i++) {
        publishPromises.push(
          eventBus2.publish('test:rapid', { index: i })
        );
      }

      await Promise.all(publishPromises);

      // Wait for all messages to propagate
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(messages.length).toBe(50);
      const indices = messages.map(m => m.index).sort((a, b) => a - b);
      expect(indices).toEqual(Array.from({ length: 50 }, (_, i) => i));
    }, TEST_TIMEOUT * 2);
  });

  describe('Unsubscribe', () => {
    it('should stop receiving messages after unsubscribe', async () => {
      const messages = [];

      const handler = (data) => {
        messages.push(data);
      };

      await eventBus1.subscribe('test:unsub', handler);

      // First message should be received
      await eventBus2.publish('test:unsub', { seq: 1 });
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(messages).toHaveLength(1);

      // Unsubscribe
      await eventBus1.unsubscribe('test:unsub', handler);

      // Second message should not be received
      await eventBus2.publish('test:unsub', { seq: 2 });
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(messages).toHaveLength(1);
    }, TEST_TIMEOUT);
  });

  describe('Connection Status', () => {
    it('should report correct connection status', () => {
      const status = eventBus1.getConnectionStatus();

      expect(status.isConnected).toBe(true);
      expect(status.publisherConnected).toBe(true);
      expect(status.subscriberConnected).toBe(true);
    });

    it('should report correct subscription info', async () => {
      await eventBus1.subscribe('test:info:1', () => {});
      await eventBus1.subscribe('test:info:2', () => {});
      await eventBus1.subscribe('test:info:2', () => {});

      const info = eventBus1.getSubscriptions();

      expect(info.channels).toContain('test:info:1');
      expect(info.channels).toContain('test:info:2');
      expect(info.subscriptions['test:info:1'].handlerCount).toBe(1);
      expect(info.subscriptions['test:info:2'].handlerCount).toBe(2);
      expect(info.isConnected).toBe(true);
    });
  });
});
