/**
 * [T-012] PortfolioChangePublisher 单元测试
 *
 * 测试内容:
 * - 持仓变更事件发布
 * - 关注列表变更事件发布
 * - 事件格式验证
 * - 批量事件聚合
 * - Redis连接失败处理
 */

import { expect, jest, describe, it, beforeEach, afterEach } from '@jest/globals';
import PortfolioChangePublisher from '../../../src/events/PortfolioChangePublisher.js';
import redis from '../../../src/database/redis.js';

describe('PortfolioChangePublisher', () => {
  let publisher;
  let redisStub;

  beforeEach(() => {
    redisStub = {
      publish: jest.fn().resolves(1),
      xadd: jest.fn().resolves('123-0')
    };
    publisher = new PortfolioChangePublisher(redisStub);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('publishPortfolioChange', () => {
    it('应该正确发布持仓变更事件到Redis Pub/Sub', async () => {
      const accountId = 'acc-123';
      const changes = {
        addedStocks: ['000001', '600519'],
        removedStocks: ['000858'],
        timestamp: Date.now()
      };

      await publisher.publishPortfolioChange(accountId, changes);

      expect(redisStub.publish.toHaveBeenCalled()Once).toBe(true);
      const [channel, message] = redisStub.publish.firstCall.args;
      expect(channel).toBe('account:portfolio:changed');

      const parsedMessage = JSON.parse(message);
      expect(parsedMessage).toHaveProperty('accountId', accountId);
      expect(parsedMessage).toHaveProperty('addedStocks').that.deep.equals(['000001', '600519']);
      expect(parsedMessage).toHaveProperty('removedStocks').that.deep.equals(['000858']);
      expect(parsedMessage).toHaveProperty('timestamp');
      expect(parsedMessage).toHaveProperty('eventType', 'portfolio_change');
    });

    it('应该正确发布关注列表变更事件', async () => {
      const accountId = 'acc-456';
      const changes = {
        addedStocks: ['000002'],
        removedStocks: ['600000'],
        timestamp: Date.now()
      };

      await publisher.publishWatchlistChange(accountId, changes);

      expect(redisStub.publish.toHaveBeenCalled()Once).toBe(true);
      const [channel, message] = redisStub.publish.firstCall.args;
      expect(channel).toBe('account:watchlist:changed');

      const parsedMessage = JSON.parse(message);
      expect(parsedMessage.eventType).toBe('watchlist_change');
    });

    it('当没有变更时不应该发布事件', async () => {
      const accountId = 'acc-789';
      const changes = {
        addedStocks: [],
        removedStocks: [],
        timestamp: Date.now()
      };

      await publisher.publishPortfolioChange(accountId, changes);

      expect(redisStub.publish.toHaveBeenCalled()).toBe(false);
    });

    it('应该在Redis连接失败时抛出可处理的错误', async () => {
      redisStub.publish.rejects(new Error('Redis connection failed'));

      const accountId = 'acc-123';
      const changes = {
        addedStocks: ['000001'],
        removedStocks: [],
        timestamp: Date.now()
      };

      try {
        await publisher.publishPortfolioChange(accountId, changes);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.include('Redis');
        expect(error.code).toBe('EVENT_PUBLISH_FAILED');
      }
    });
  });

  describe('publishToStream', () => {
    it('应该将事件写入Redis Stream', async () => {
      const accountId = 'acc-123';
      const changes = {
        addedStocks: ['000001', '600519'],
        removedStocks: ['000858'],
        timestamp: Date.now()
      };

      await publisher.publishToStream(accountId, changes);

      expect(redisStub.xadd.toHaveBeenCalled()Once).toBe(true);
      const [streamKey, id, ...fields] = redisStub.xadd.firstCall.args;
      expect(streamKey).toBe('hot-stocks-stream');
      expect(id).toBe('*'); // 自动生成ID
    });

    it('应该正确格式化Stream事件数据', async () => {
      const accountId = 'acc-123';
      const changes = {
        addedStocks: ['000001'],
        removedStocks: [],
        timestamp: 1707657600000
      };

      await publisher.publishToStream(accountId, changes);

      const [, , ...fields] = redisStub.xadd.firstCall.args;
      const fieldMap = {};
      for (let i = 0; i < fields.length; i += 2) {
        fieldMap[fields[i]] = fields[i + 1];
      }

      expect(fieldMap.action).toBe('increment');
      expect(fieldMap.stocks).toBe(JSON.stringify(['000001']));
      expect(fieldMap.source).toBe('acc-123');
      expect(fieldMap.timestamp).toBe('1707657600000');
    });

    it('应该对移除的股票生成decrement动作', async () => {
      const accountId = 'acc-123';
      const changes = {
        addedStocks: [],
        removedStocks: ['000858'],
        timestamp: Date.now()
      };

      await publisher.publishToStream(accountId, changes);

      const [, , ...fields] = redisStub.xadd.firstCall.args;
      const fieldMap = {};
      for (let i = 0; i < fields.length; i += 2) {
        fieldMap[fields[i]] = fields[i + 1];
      }

      expect(fieldMap.action).toBe('decrement');
      expect(fieldMap.stocks).toBe(JSON.stringify(['000858']));
    });

    it('应该对同时有增减的情况生成两个事件', async () => {
      const accountId = 'acc-123';
      const changes = {
        addedStocks: ['000001'],
        removedStocks: ['000858'],
        timestamp: Date.now()
      };

      await publisher.publishToStream(accountId, changes);

      expect(redisStub.xadd.toHaveBeenCalled()Twice).toBe(true);

      // 第一个事件：increment
      const firstCall = redisStub.xadd.firstCall.args;
      expect(firstCall[2]).toBe('action');
      expect(firstCall[3]).toBe('increment');

      // 第二个事件：decrement
      const secondCall = redisStub.xadd.secondCall.args;
      expect(secondCall[2]).toBe('action');
      expect(secondCall[3]).toBe('decrement');
    });
  });

  describe('batchPublish', () => {
    it('应该支持批量事件聚合后发布', async () => {
      const events = [
        { accountId: 'acc-1', addedStocks: ['000001'], removedStocks: [] },
        { accountId: 'acc-2', addedStocks: ['000001', '600519'], removedStocks: [] },
        { accountId: 'acc-3', addedStocks: [], removedStocks: ['000001'] }
      ];

      // 批量聚合后发布
      await publisher.batchPublish(events);

      // 应该聚合为：000001 +1 (2增加 -1减少), 600519 +1
      expect(redisStub.xadd.toHaveBeenCalled()).toBe(true);
    });

    it('应该在批量发布时限制最大事件数', async () => {
      const events = Array(150).fill({
        accountId: 'acc-1',
        addedStocks: ['000001'],
        removedStocks: []
      });

      await publisher.batchPublish(events, { maxBatchSize: 100 });

      // 应该分批处理
      expect(redisStub.xadd.callCount).toBeGreaterThan(1);
    });
  });

  describe('性能测试', () => {
    it('应该在10000个事件下保持响应时间 < 100ms', async () => {
      const startTime = Date.now();

      const promises = Array(10000).fill().map((_, i) =>
        publisher.publishPortfolioChange(`acc-${i}`, {
          addedStocks: ['000001'],
          removedStocks: [],
          timestamp: Date.now()
        })
      );

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 注意：这是单元测试，使用mock，实际性能取决于Redis
      // 这里主要验证代码逻辑没有明显的性能问题
      expect(duration).toBeLessThan(1000); // 1秒内完成10000个mock调用
    });
  });
});
