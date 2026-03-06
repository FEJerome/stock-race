/**
 * [T-018] WeightedHotStocksService 单元测试
 *
 * 测试内容:
 * - 多因子权重计算
 * - 权重归一化处理
 * - 热股票列表生成
 * - 缓存管理
 * - 数据收集集成
 */

import { expect, jest, describe, it, beforeEach, afterEach } from '@jest/globals';
import WeightedHotStocksService from '../../../src/services/WeightedHotStocksService.js';

describe('WeightedHotStocksService', () => {
  let service;
  let redisStub;
  let marketDataClientStub;

  beforeEach(() => {
    redisStub = {
      get: jest.fn().resolves(null),
      setex: jest.fn().resolves('OK'),
      del: jest.fn().resolves(1),
      pipeline: jest.fn().returns({
        get: jest.fn().returnsThis(),
        exec: jest.fn().resolves([])
      })
    };

    marketDataClientStub = {
      getStockVolumes: jest.fn().resolves({
        '000001.SZ': 1000000,
        '600519.SH': 800000,
        '000858.SZ': 600000
      })
    };

    service = new WeightedHotStocksService(redisStub, marketDataClientStub);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('calculateWeight', () => {
    it('应该正确计算股票权重', () => {
      const stockData = {
        userCount: 500,      // 500/1000 * 40 = 20
        viewCount: 2500,     // 2500/5000 * 30 = 15
        tradeVolume: 500000, // 500000/1000000 * 20 = 10
        favoriteCount: 250   // 250/500 * 10 = 5
      };

      const weight = service.calculateWeight(stockData);

      expect(weight).toBe(50.0); // 20 + 15 + 10 + 5 = 50
    });

    it('应该处理最大值情况', () => {
      const stockData = {
        userCount: 2000,      // 超过1000，应该按1.0计算
        viewCount: 10000,
        tradeVolume: 2000000,
        favoriteCount: 1000
      };

      const weight = service.calculateWeight(stockData);

      expect(weight).toBe(100.0); // 40 + 30 + 20 + 10 = 100
    });

    it('应该处理最小值情况', () => {
      const stockData = {
        userCount: 0,
        viewCount: 0,
        tradeVolume: 0,
        favoriteCount: 0
      };

      const weight = service.calculateWeight(stockData);

      expect(weight).toBe(0.0);
    });

    it('应该处理缺失数据', () => {
      const stockData = {};

      const weight = service.calculateWeight(stockData);

      expect(weight).toBe(0.0);
    });

    it('应该处理负数数据', () => {
      const stockData = {
        userCount: -100,
        viewCount: -50,
        tradeVolume: -200,
        favoriteCount: -10
      };

      const weight = service.calculateWeight(stockData);

      expect(weight).toBe(0.0);
    });
  });

  describe('normalizeWeightFactor', () => {
    it('应该正确归一化因子', () => {
      expect(service.normalizeWeightFactor(500, 1000, 40)).toBe(20);
      expect(service.normalizeWeightFactor(1000, 1000, 40)).toBe(40);
      expect(service.normalizeWeightFactor(0, 1000, 40)).toBe(0);
    });

    it('应该处理超过最大值的情况', () => {
      expect(service.normalizeWeightFactor(2000, 1000, 40)).toBe(40);
    });

    it('应该处理负数输入', () => {
      expect(service.normalizeWeightFactor(-100, 1000, 40)).toBe(0);
    });
  });

  describe('collectStockData', () => {
    it('应该收集股票数据并计算权重', async () => {
      const mockActivityData = {
        '000001.SZ': { userCount: 120, viewCount: 450 },
        '600519.SH': { userCount: 98, viewCount: 380 }
      };

      const mockFavoriteData = {
        '000001.SZ': 230,
        '600519.SH': 180
      };

      jest.spyOn(service, 'getUserActivityData').mockResolvedValue(mockActivityData);
      jest.spyOn(service, 'getUserFavoriteData').mockResolvedValue(mockFavoriteData);

      const result = await service.collectStockData();

      expect(result).toHaveProperty('000001.SZ');
      expect(result).toHaveProperty('600519.SH');
      expect(result['000001.SZ']).toHaveProperty('userCount', 120);
      expect(result['000001.SZ']).toHaveProperty('viewCount', 450);
      expect(result['000001.SZ']).toHaveProperty('favoriteCount', 230);
      expect(result['000001.SZ']).toHaveProperty('tradeVolume', 1000000);
    });
  });

  describe('generateWeightedHotStocks', () => {
    it('应该生成按权重排序的热股票列表', async () => {
      const stockDataMap = {
        '000001.SZ': {
          userCount: 120, viewCount: 450, tradeVolume: 1000000, favoriteCount: 230
        },
        '600519.SH': {
          userCount: 98, viewCount: 380, tradeVolume: 800000, favoriteCount: 180
        },
        '000858.SZ': {
          userCount: 60, viewCount: 200, tradeVolume: 600000, favoriteCount: 100
        }
      };

      const result = await service.generateWeightedHotStocks(stockDataMap);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(3);
      expect(result[0].symbol).toBe('000001.SZ'); // 权重最高
      expect(result[0]).toHaveProperty('weight');
      expect(result[0]).toHaveProperty('factors');
      expect(result[0].factors).toHaveProperty('userCount');
      expect(result[0].factors).toHaveProperty('viewCount');
      expect(result[0].factors).toHaveProperty('tradeScore');
      expect(result[0].factors).toHaveProperty('favoriteCount');
    });

    it('应该正确处理空数据', async () => {
      const result = await service.generateWeightedHotStocks({});

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(0);
    });
  });

  describe('getWeightedHotStocks', () => {
    it('应该从缓存返回热股票列表', async () => {
      const cachedData = JSON.stringify({
        stocks: [
          { symbol: '000001.SZ', weight: 95.5, factors: {} },
          { symbol: '600519.SH', weight: 88.2, factors: {} }
        ],
        totalCount: 2,
        updatedAt: new Date().toISOString()
      });

      redisStub.get.mockResolvedValue(cachedData);

      const result = await service.getWeightedHotStocks();

      expect(result.success).toBe(true);
      expect(result.data.stocks).toHaveLength(2);
      expect(result.data.stocks[0].symbol).toBe('000001.SZ');
    });

    it('应该在缓存失效时返回错误', async () => {
      redisStub.get.mockResolvedValue(null);

      const result = await service.getWeightedHotStocks();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CACHE_NOT_READY');
    });
  });

  describe('updateHotStocksCache', () => {
    it('应该更新热股票缓存', async () => {
      const hotStocks = [
        { symbol: '000001.SZ', weight: 95.5, factors: { userCount: 120 } },
        { symbol: '600519.SH', weight: 88.2, factors: { userCount: 98 } }
      ];

      await service.updateHotStocksCache(hotStocks);

      expect(redisStub.setex).toHaveBeenCalledWith(
        'hot:stocks:weighted',
        60,
        expect.any(String)
      );
    });
  });

  describe('calculateTradeScore', () => {
    it('应该正确计算交易活跃度得分', () => {
      expect(service.calculateTradeScore(1000000)).toBe(20);
      expect(service.calculateTradeScore(500000)).toBe(10);
      expect(service.calculateTradeScore(0)).toBe(0);
    });

    it('应该处理超过最大值的情况', () => {
      expect(service.calculateTradeScore(2000000)).toBe(20);
    });
  });

  describe('getCacheStatus', () => {
    it('应该返回缓存状态', async () => {
      const cachedData = JSON.stringify({
        stocks: [],
        updatedAt: new Date().toISOString()
      });

      redisStub.get.mockResolvedValue(cachedData);

      const status = await service.getCacheStatus();

      expect(status).toHaveProperty('isReady', true);
      expect(status).toHaveProperty('lastUpdate');
      expect(status).toHaveProperty('nextUpdateIn');
    });

    it('应该在无缓存时返回未就绪状态', async () => {
      redisStub.get.mockResolvedValue(null);

      const status = await service.getCacheStatus();

      expect(status.isReady).toBe(false);
    });
  });
});
