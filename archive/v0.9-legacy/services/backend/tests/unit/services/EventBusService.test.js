/**
 * EventBusService 单元测试
 * 测试Backend事件总线服务
 *
 * 对应需求: C2-BE-001 ~ C2-BE-006
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import EventBusService from '../../../src/services/EventBusService.js';

// Mock Event Bus SDK before importing
jest.mock('@stock-race/event-bus', () => ({
  EventBusClient: jest.fn(),
  EventProducer: jest.fn(),
  EventConsumer: jest.fn(),
  EventType: {
    BACKEND_ACCOUNT_UPDATED: 'backend:account:updated',
    BACKEND_TRADE_EXECUTED: 'backend:trade:executed',
    AI_DECISION_MADE: 'ai:decision:made',
  },
  EventSchema: jest.fn(),
}));

import {
  EventBusClient,
  EventProducer,
  EventConsumer,
  EventType,
} from '@stock-race/event-bus';

describe('EventBusService (C2-BE-001~006)', () => {
  beforeEach(() => {
    // 重置单例状态
    EventBusService.client = null;
    EventBusService.producer = null;
    EventBusService.consumer = null;
    EventBusService.isConnected = false;
    EventBusService.messageHandlers.clear();

    // 清除mock
    jest.clearAllMocks();
  });

  describe('C2-BE-001: 初始化与连接', () => {
    it('should initialize with default config', async () => {
      const mockConnect = jest.fn().mockResolvedValue();
      EventBusClient.mockImplementation(() => ({
        connect: mockConnect,
      }));

      EventProducer.mockImplementation(() => ({}));

      await EventBusService.initialize();

      expect(EventBusClient).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6379,
      });
      expect(mockConnect).toHaveBeenCalled();
      expect(EventBusService.isConnected).toBe(true);
    });

    it('should initialize with custom config', async () => {
      const mockConnect = jest.fn().mockResolvedValue();
      EventBusClient.mockImplementation(() => ({
        connect: mockConnect,
      }));

      EventProducer.mockImplementation(() => ({}));

      await EventBusService.initialize({
        redisHost: 'redis.example.com',
        redisPort: 6380,
        serviceName: 'backend-test',
      });

      expect(EventBusClient).toHaveBeenCalledWith({
        host: 'redis.example.com',
        port: 6380,
      });
    });

    it('should throw error when not initialized', async () => {
      await expect(
        EventBusService.publishAccountUpdated('acc-001', 'balance', 100, 90)
      ).rejects.toThrow('EventBusService not initialized');
    });
  });

  describe('C2-BE-002: 发布账户更新事件', () => {
    beforeEach(async () => {
      const mockConnect = jest.fn().mockResolvedValue();
      const mockPublishEvent = jest.fn().mockResolvedValue('msg-123');

      EventBusClient.mockImplementation(() => ({
        connect: mockConnect,
      }));

      EventProducer.mockImplementation(() => ({
        publishEvent: mockPublishEvent,
      }));

      await EventBusService.initialize();
      EventBusService.producer.publishEvent = mockPublishEvent;
    });

    it('should publish account updated event', async () => {
      const messageId = await EventBusService.publishAccountUpdated(
        'acc-001',
        'balance',
        100000,
        95000
      );

      expect(EventBusService.producer.publishEvent).toHaveBeenCalledWith(
        EventType.BACKEND_ACCOUNT_UPDATED,
        expect.objectContaining({
          accountId: 'acc-001',
          field: 'balance',
          oldValue: 100000,
          newValue: 95000,
        }),
        false
      );
      expect(messageId).toBe('msg-123');
    });

    it('should include timestamp in event', async () => {
      await EventBusService.publishAccountUpdated('acc-001', 'status', 'active', 'inactive');

      const callArgs = EventBusService.producer.publishEvent.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('timestamp');
      expect(new Date(callArgs[1].timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('C2-BE-003: 发布交易执行事件', () => {
    beforeEach(async () => {
      const mockConnect = jest.fn().mockResolvedValue();
      const mockPublishEvent = jest.fn().mockResolvedValue('msg-456');

      EventBusClient.mockImplementation(() => ({
        connect: mockConnect,
      }));

      EventProducer.mockImplementation(() => ({
        publishEvent: mockPublishEvent,
      }));

      await EventBusService.initialize();
      EventBusService.producer.publishEvent = mockPublishEvent;
    });

    it('should publish trade executed event', async () => {
      const trade = {
        accountId: 'acc-001',
        tradeId: 'trade-001',
        symbol: '000001.SZ',
        action: 'buy',
        quantity: 100,
        price: 12.58,
      };

      const messageId = await EventBusService.publishTradeExecuted(trade);

      expect(EventBusService.producer.publishEvent).toHaveBeenCalledWith(
        EventType.BACKEND_TRADE_EXECUTED,
        expect.objectContaining({
          accountId: 'acc-001',
          tradeId: 'trade-001',
          symbol: '000001.SZ',
          action: 'buy',
          quantity: 100,
          price: 12.58,
        }),
        false
      );
      expect(messageId).toBe('msg-456');
    });

    it('should include timestamp in trade event', async () => {
      const trade = {
        accountId: 'acc-001',
        tradeId: 'trade-001',
        symbol: '000001.SZ',
        action: 'sell',
        quantity: 50,
        price: 15.00,
      };

      await EventBusService.publishTradeExecuted(trade);

      const callArgs = EventBusService.producer.publishEvent.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('timestamp');
    });
  });

  describe('C2-BE-004/005/006: 订阅AI决策事件', () => {
    let mockConsumer;
    let mockSubscribe;
    let mockStart;

    beforeEach(async () => {
      const mockConnect = jest.fn().mockResolvedValue();
      mockSubscribe = jest.fn();
      mockStart = jest.fn();

      mockConsumer = {
        subscribe: mockSubscribe,
        start: mockStart,
      };

      EventBusClient.mockImplementation(() => ({
        connect: mockConnect,
      }));

      EventProducer.mockImplementation(() => ({}));

      EventConsumer.mockImplementation(() => mockConsumer);

      await EventBusService.initialize();
    });

    it('should subscribe to AI decisions with default group', async () => {
      const handler = jest.fn();

      await EventBusService.subscribeToAIDecisions(handler);

      expect(EventConsumer).toHaveBeenCalledWith(expect.objectContaining({
        serviceName: 'backend',
        consumerGroup: 'backend-trade-executor',
      }));
      expect(mockSubscribe).toHaveBeenCalledWith(
        EventType.AI_DECISION_MADE,
        expect.any(Function)
      );
      expect(mockStart).toHaveBeenCalled();
    });

    it('should subscribe with custom group', async () => {
      const handler = jest.fn();

      await EventBusService.subscribeToAIDecisions(handler, {
        consumerGroup: 'custom-group',
        consumerName: 'instance-1',
      });

      expect(EventConsumer).toHaveBeenCalledWith(expect.objectContaining({
        consumerGroup: 'custom-group',
        consumerName: 'instance-1',
      }));
    });

    it('should wrap handler with error handling', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Processing failed'));

      await EventBusService.subscribeToAIDecisions(handler);

      // 获取包装后的处理器
      const wrappedHandler = mockSubscribe.mock.calls[0][1];

      // 模拟事件
      const mockEvent = {
        eventId: 'evt-001',
        payload: { decision: 'buy' },
      };

      // 包装后的处理器应该抛出错误
      await expect(wrappedHandler(mockEvent)).rejects.toThrow('Processing failed');
    });

    it('should call handler with event data', async () => {
      const handler = jest.fn().mockResolvedValue();

      await EventBusService.subscribeToAIDecisions(handler);

      const wrappedHandler = mockSubscribe.mock.calls[0][1];
      const mockEvent = {
        eventId: 'evt-001',
        payload: { decision: 'buy', accountId: 'acc-001' },
      };

      await wrappedHandler(mockEvent);

      expect(handler).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe('服务生命周期', () => {
    it('should stop consumer and disconnect', async () => {
      const mockStop = jest.fn().mockResolvedValue();
      const mockDisconnect = jest.fn().mockResolvedValue();

      EventBusService.consumer = { stop: mockStop };
      EventBusService.client = { disconnect: mockDisconnect };
      EventBusService.isConnected = true;

      await EventBusService.stop();

      expect(mockStop).toHaveBeenCalled();
      expect(mockDisconnect).toHaveBeenCalled();
      expect(EventBusService.isConnected).toBe(false);
    });

    it('should handle stop when not initialized', async () => {
      // 不应该抛出错误
      await expect(EventBusService.stop()).resolves.not.toThrow();
    });
  });

  describe('健康检查', () => {
    it('should return false when not connected', () => {
      expect(EventBusService.isHealthy()).toBe(false);
    });

    it('should check client health when connected', async () => {
      const mockHealthCheck = jest.fn().mockReturnValue(true);

      EventBusService.client = { healthCheck: mockHealthCheck };

      const result = await EventBusService.isHealthy();

      expect(mockHealthCheck).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });
});
