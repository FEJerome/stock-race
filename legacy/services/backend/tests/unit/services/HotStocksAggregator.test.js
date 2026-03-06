/**
 * [T-012] HotStocksAggregator 单元测试
 *
 * 测试内容:
 * - 增量热股票计数器逻辑
 * - Redis Sorted Set操作
 * - 股票热度排名计算
 * - 热股票列表生成
 * - 计数器漂移校准
 */

import { expect, jest, describe, it, beforeEach, afterEach } from '@jest/globals';
import HotStocksAggregator from '../../../src/services/HotStocksAggregator.js';

describe('HotStocksAggregator', () => {
  let aggregator;
  let redisStub;

  beforeEach(() => {
    redisStub = {
      zincrby: jest.fn().resolves(1),
      zrevrange: jest.fn().resolves(['000001', '600519', '000858']),
      zscore: jest.fn().resolves(5),
      zcard: jest.fn().resolves(100),
      zrange: jest.fn().resolves([]),
      del: jest.fn().resolves(1),
      set: jest.fn().resolves('OK'),
      get: jest.fn().resolves(null)
    };
    aggregator = new HotStocksAggregator(redisStub);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('incrementStockHeat', () => {
    it('应该增加股票热度计数', async () => {
      redisStub.zincrby.resolves(5); // 增加后的分数

      const result = await aggregator.incrementStockHeat('000001', 1);

      expect(redisStub.zincrby.toHaveBeenCalled()Once).toBe(true);
      expect(redisStub.zincrby.firstCall.args).toEqual([
        'hot-stocks:realtime',
        1,
        '000001'
      ]);
      expect(result).toBe(5);
    });

    it('应该支持批量增加热度', async () => {
      const stocks = ['000001', '600519', '000858'];

      await aggregator.incrementStocksHeat(stocks, 1);

      expect(redisStub.zincrby.callCount).toBe(3);
    });

    it('应该对移除的股票减少热度', async () => {
      redisStub.zincrby.resolves(3);

      const result = await aggregator.incrementStockHeat('000001', -1);

      expect(redisStub.zincrby.firstCall.args[1]).toBe(-1);
      expect(result).toBe(3);
    });

    it('应该在热度降到0时从列表中移除', async () => {
      redisStub.zincrby.resolves(0);
      redisStub.zrem = jest.fn().resolves(1);

      await aggregator.incrementStockHeat('000001', -1);

      // 热度为0时应该移除
      expect(redisStub.zrem.toHaveBeenCalled()).toBe(true);
    });
  });

  describe('getHotStocks', () => {
    it('应该返回热度最高的股票列表', async () => {
      redisStub.zrevrange.resolves([
        '000001', '10',
        '600519', '8',
        '000858', '5'
      ]);

      const result = await aggregator.getHotStocks(3);

      expect(redisStub.zrevrange.toHaveBeenCalled()Once).toBe(true);
      expect(redisStub.zrevrange.firstCall.args).toEqual([
        'hot-stocks:realtime',
        0,
        2,
        'WITHSCORES'
      ]);

      expect(result).toEqual([
        { symbol: '000001', heat: 10 },
        { symbol: '600519', heat: 8 },
        { symbol: '000858', heat: 5 }
      ]);
    });

    it('应该支持不带分数的查询', async () => {
      redisStub.zrevrange.resolves(['000001', '600519', '000858']);

      const result = await aggregator.getHotStocks(3, { withScores: false });

      expect(redisStub.zrevrange.firstCall.args).toEqual([
        'hot-stocks:realtime',
        0,
        2
      ]);

      expect(result).toEqual(['000001', '600519', '000858']);
    });

    it('应该处理空列表的情况', async () => {
      redisStub.zrevrange.resolves([]);

      const result = await aggregator.getHotStocks(10);

      expect(result).toEqual([]);
    });
  });

  describe('getStockHeat', () => {
    it('应该返回指定股票的热度分数', async () => {
      redisStub.zscore.resolves(15);

      const result = await aggregator.getStockHeat('000001');

      expect(redisStub.zscore.toHaveBeenCalled()Once).toBe(true);
      expect(redisStub.zscore.firstCall.args).toEqual([
        'hot-stocks:realtime',
        '000001'
      ]);
      expect(result).toBe(15);
    });

    it('应该对不存在的股票返回0', async () => {
      redisStub.zscore.resolves(null);

      const result = await aggregator.getStockHeat('999999');

      expect(result).toBe(0);
    });
  });

  describe('getStats', () => {
    it('应该返回热股票统计信息', async () => {
      redisStub.zcard.resolves(250);
      redisStub.zrevrange.withArgs('hot-stocks:realtime', 0, 0, 'WITHSCORES')
        .resolves(['000001', '100']);

      const result = await aggregator.getStats();

      expect(result).toEqual({
        totalStocks: 250,
        topStock: { symbol: '000001', heat: 100 }
      });
    });
  });

  describe('calibrate', () => {
    it('应该根据全量数据校准计数器', async () => {
      // 模拟从数据库获取的全量数据
      const fullData = {
        '000001': 10,
        '600519': 8,
        '000858': 5,
        '000002': 3
      };

      redisStub.zrange.resolves(['000001', '000002', '000003', '600519', '000858']);
      redisStub.pipeline = jest.fn().returns({
        zincrby: jest.fn().returnsThis(),
        zrem: jest.fn().returnsThis(),
        exec: jest.fn().resolves([])
      });

      await aggregator.calibrate(fullData);

      // 验证校准逻辑
      expect(redisStub.zrange.toHaveBeenCalled()Once).toBe(true);
    });

    it('应该移除已不在列表中的股票', async () => {
      // Redis中有，但全量数据中已没有
      redisStub.zrange.resolves(['000001', 'old-stock']);
      redisStub.zrem = jest.fn().resolves(1);

      const fullData = { '000001': 10 };

      await aggregator.calibrate(fullData);

      expect(redisStub.zrem.toHaveBeenCalledWith('hot-stocks:realtime', 'old-stock')).toBe(true);
    });
  });

  describe('processStreamEvent', () => {
    it('应该正确处理Stream中的increment事件', async () => {
      const event = {
        action: 'increment',
        stocks: JSON.stringify(['000001', '600519']),
        source: 'acc-123',
        timestamp: '1707657600000'
      };

      await aggregator.processStreamEvent(event);

      expect(redisStub.zincrby.callCount).toBe(2);
    });

    it('应该正确处理Stream中的decrement事件', async () => {
      const event = {
        action: 'decrement',
        stocks: JSON.stringify(['000001']),
        source: 'acc-123',
        timestamp: '1707657600000'
      };

      await aggregator.processStreamEvent(event);

      expect(redisStub.zincrby.firstCall.args[1]).toBe(-1);
    });

    it('应该忽略无效的事件格式', async () => {
      const event = {
        action: 'invalid',
        stocks: 'not-json',
        source: 'acc-123'
      };

      await aggregator.processStreamEvent(event);

      expect(redisStub.zincrby.toHaveBeenCalled()).toBe(false);
    });
  });

  describe('生成热股票列表消息', () => {
    it('应该生成符合格式要求的热股票消息', async () => {
      redisStub.zrevrange.resolves([
        '000001', '10',
        '600519', '8',
        '000858', '5'
      ]);
      redisStub.zcard.resolves(3);

      const message = await aggregator.generateHotStocksMessage(100);

      expect(message).toHaveProperty('stocks').that.deep.equals(['000001', '600519', '000858']);
      expect(message).toHaveProperty('count', 3);
      expect(message).toHaveProperty('accounts', 100);
      expect(message).toHaveProperty('timestamp');
      expect(message).toHaveProperty('source', 'backend-event-driven');
    });
  });
});
