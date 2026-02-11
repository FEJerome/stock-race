import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock redis before importing EventBus
const mockPublisher = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn().mockResolvedValue(1),
  on: jest.fn(),
  isReady: true
};

const mockSubscriber = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockResolvedValue(undefined),
  unsubscribe: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  isReady: true
};

let callCount = 0;
jest.unstable_mockModule('redis', () => ({
  createClient: jest.fn(() => {
    callCount++;
    return callCount === 1 ? mockPublisher : mockSubscriber;
  })
}));

// Import EventBus after mocking
const { EventBus, EventBusError } = await import('../../../src/events/EventBus.js');

describe('EventBus', () => {
  let eventBus;

  beforeEach(() => {
    jest.clearAllMocks();
    callCount = 0;

    eventBus = new EventBus({
      url: 'redis://localhost:6379',
      enableOfflineQueue: true
    });
  });

  afterEach(async () => {
    if (eventBus) {
      await eventBus.disconnect();
    }
  });

  describe('Constructor', () => {
    it('should create EventBus with default config', () => {
      const bus = new EventBus();
      expect(bus.config.url).toBe('redis://localhost:6379');
      expect(bus.config.enableOfflineQueue).toBe(true);
      expect(bus.subscriptions.size).toBe(0);
    });

    it('should merge custom config', () => {
      const bus = new EventBus({
        url: 'redis://custom:6380',
        reconnectMaxRetries: 20
      });
      expect(bus.config.url).toBe('redis://custom:6380');
      expect(bus.config.reconnectMaxRetries).toBe(20);
    });
  });

  describe('Connection', () => {
    it('should connect to Redis successfully', async () => {
      await eventBus.connect();

      expect(mockPublisher.connect).toHaveBeenCalled();
      expect(mockSubscriber.connect).toHaveBeenCalled();
      expect(eventBus.isConnected).toBe(true);
    });

    it('should handle connection errors', async () => {
      mockPublisher.connect.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(eventBus.connect()).rejects.toThrow(EventBusError);
    });

    it('should disconnect properly', async () => {
      await eventBus.connect();
      await eventBus.disconnect();

      expect(mockPublisher.disconnect).toHaveBeenCalled();
      expect(mockSubscriber.disconnect).toHaveBeenCalled();
      expect(eventBus.isConnected).toBe(false);
    });
  });

  describe('Subscribe', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should subscribe to a channel', async () => {
      const handler = jest.fn();
      const result = await eventBus.subscribe('test:channel', handler);

      expect(result).toBe(true);
      expect(mockSubscriber.subscribe).toHaveBeenCalled();
      expect(eventBus.subscriptions.get('test:channel')).toContain(handler);
    });

    it('should allow multiple handlers for same channel', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      await eventBus.subscribe('test:channel', handler1);
      await eventBus.subscribe('test:channel', handler2);

      const handlers = eventBus.subscriptions.get('test:channel');
      expect(handlers).toHaveLength(2);
      expect(handlers).toContain(handler1);
      expect(handlers).toContain(handler2);
    });

    it('should throw error for invalid channel', async () => {
      await expect(eventBus.subscribe(null, jest.fn())).rejects.toThrow(EventBusError);
    });

    it('should throw error for invalid handler', async () => {
      await expect(eventBus.subscribe('test:channel', null)).rejects.toThrow(EventBusError);
    });
  });

  describe('Unsubscribe', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should unsubscribe specific handler', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      await eventBus.subscribe('test:channel', handler1);
      await eventBus.subscribe('test:channel', handler2);

      await eventBus.unsubscribe('test:channel', handler1);

      const handlers = eventBus.subscriptions.get('test:channel');
      expect(handlers).toHaveLength(1);
      expect(handlers).toContain(handler2);
      expect(handlers).not.toContain(handler1);
    });

    it('should unsubscribe all handlers when no handler specified', async () => {
      const handler = jest.fn();
      await eventBus.subscribe('test:channel', handler);

      await eventBus.unsubscribe('test:channel');

      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith('test:channel');
      expect(eventBus.subscriptions.has('test:channel')).toBe(false);
    });

    it('should return false for non-existent channel', async () => {
      const result = await eventBus.unsubscribe('non:existent');
      expect(result).toBe(false);
    });
  });

  describe('Publish', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should publish string message', async () => {
      const result = await eventBus.publish('test:channel', 'hello world');

      expect(result).toBe(true);
      expect(mockPublisher.publish).toHaveBeenCalledWith('test:channel', 'hello world');
    });

    it('should publish object message (JSON serialized)', async () => {
      const data = { key: 'value', number: 123 };
      const result = await eventBus.publish('test:channel', data);

      expect(result).toBe(true);
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'test:channel',
        JSON.stringify(data)
      );
    });

    it('should throw error for missing channel', async () => {
      await expect(eventBus.publish(null, 'data')).rejects.toThrow(EventBusError);
    });

    it('should queue message when offline', async () => {
      eventBus.isConnected = false;

      const result = await eventBus.publish('test:channel', { data: 'test' });

      expect(result).toBe(false);
      expect(eventBus.messageQueue).toHaveLength(1);
      expect(eventBus.messageQueue[0].channel).toBe('test:channel');
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should handle JSON messages', async () => {
      const handler = jest.fn();
      await eventBus.subscribe('test:channel', handler);

      const messageData = { type: 'test', payload: 'data' };
      eventBus.handleMessage('test:channel', JSON.stringify(messageData));

      expect(handler).toHaveBeenCalledWith(messageData, 'test:channel');
    });

    it('should handle plain text messages', async () => {
      const handler = jest.fn();
      await eventBus.subscribe('test:channel', handler);

      eventBus.handleMessage('test:channel', 'plain text');

      expect(handler).toHaveBeenCalledWith('plain text', 'test:channel');
    });

    it('should call all handlers for a channel', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      await eventBus.subscribe('test:channel', handler1);
      await eventBus.subscribe('test:channel', handler2);

      eventBus.handleMessage('test:channel', JSON.stringify({ data: 'test' }));

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should handle handler errors gracefully', async () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = jest.fn();

      await eventBus.subscribe('test:channel', errorHandler);
      await eventBus.subscribe('test:channel', normalHandler);

      // Should not throw
      expect(() => {
        eventBus.handleMessage('test:channel', JSON.stringify({ data: 'test' }));
      }).not.toThrow();

      expect(errorHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
    });

    it('should warn when no handlers for channel', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      eventBus.handleMessage('unhandled:channel', 'message');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Message Queue', () => {
    it('should process queued messages on connect', async () => {
      // Add messages to queue
      eventBus.messageQueue.push(
        { channel: 'channel1', data: 'msg1', timestamp: Date.now() },
        { channel: 'channel2', data: 'msg2', timestamp: Date.now() }
      );

      await eventBus.connect();

      // Process queue
      await eventBus.processMessageQueue();

      expect(mockPublisher.publish).toHaveBeenCalledTimes(2);
    });

    it('should discard expired messages', async () => {
      // Add expired message
      eventBus.messageQueue.push({
        channel: 'channel1',
        data: 'msg1',
        timestamp: Date.now() - 3600000 // 1 hour ago
      });

      await eventBus.connect();

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      await eventBus.processMessageQueue();

      expect(mockPublisher.publish).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should keep failed messages in queue', async () => {
      await eventBus.connect();

      // Clear any messages from connection
      eventBus.messageQueue.length = 0;

      // Add message to queue
      eventBus.messageQueue.push({
        channel: 'channel1',
        data: 'msg1',
        timestamp: Date.now()
      });

      // Make publish fail for this specific test
      mockPublisher.publish.mockRejectedValueOnce(new Error('Publish failed'));

      await eventBus.processMessageQueue();

      // Failed message should still be in queue
      expect(eventBus.messageQueue.length).toBeGreaterThan(0);
    });
  });

  describe('Getters', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should return subscription info', async () => {
      await eventBus.subscribe('channel1', jest.fn());
      await eventBus.subscribe('channel2', jest.fn());
      await eventBus.subscribe('channel2', jest.fn());

      const info = eventBus.getSubscriptions();

      expect(info.channels).toEqual(['channel1', 'channel2']);
      expect(info.subscriptions.channel1.handlerCount).toBe(1);
      expect(info.subscriptions.channel2.handlerCount).toBe(2);
      expect(info.isConnected).toBe(true);
    });

    it('should return connection status', () => {
      const status = eventBus.getConnectionStatus();

      expect(status.isConnected).toBe(true);
      expect(status.reconnectAttempts).toBe(0);
    });
  });

  describe('Clear All Subscriptions', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should clear all subscriptions', async () => {
      await eventBus.subscribe('channel1', jest.fn());
      await eventBus.subscribe('channel2', jest.fn());

      await eventBus.clearAllSubscriptions();

      expect(eventBus.subscriptions.size).toBe(0);
      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith('channel1');
      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith('channel2');
    });
  });

  describe('EventBusError', () => {
    it('should create error with correct properties', () => {
      const originalError = new Error('Original');
      const error = new EventBusError('Test error', originalError);

      expect(error.name).toBe('EventBusError');
      expect(error.message).toBe('Test error');
      expect(error.originalError).toBe(originalError);
      expect(error.timestamp).toBeDefined();
    });
  });
});
