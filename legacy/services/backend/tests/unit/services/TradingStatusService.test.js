/**
 * TradingStatusService 单元测试 [T-015, T-011]
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { TradingStatusService } from '../../../src/services/TradingStatusService.js';

// 模拟 MarketDataClient
jest.mock('../../../src/services/MarketDataClient.js', () => ({
  MarketDataClient: jest.fn().mockImplementation(() => ({
    getTradingStatus: jest.fn(),
    getMarketRules: jest.fn()
  }))
}));

describe('TradingStatusService [T-015]', () => {
  let service;

  beforeEach(() => {
    service = new TradingStatusService();
    // 重置熔断器
    service.resetCircuitBreaker();
    // 清除缓存
    service.clearCache();
    // 清除mock
    jest.clearAllMocks();
  });

  describe('获取交易状态', () => {
    it('应从Market Data Service获取交易状态', async () => {
      const mockStatus = {
        success: true,
        symbol: '000001.SZ',
        status: 'normal',
        priceLimits: { upper: 11.00, lower: 9.00 },
        tradingPhase: 'continuous',
        isST: false,
        isSuspended: false
      };

      service.marketDataClient.getTradingStatus.mockResolvedValue(mockStatus);

      const result = await service.getTradingStatus('000001.SZ');

      expect(result.success).toBe(true);
      expect(result.symbol).toBe('000001.SZ');
      expect(service.marketDataClient.getTradingStatus).toHaveBeenCalledWith('000001.SZ');
    });

    it('应缓存交易状态', async () => {
      const mockStatus = {
        success: true,
        symbol: '000001.SZ',
        status: 'normal',
        priceLimits: { upper: 11.00, lower: 9.00 },
        tradingPhase: 'continuous',
        isST: false,
        isSuspended: false
      };

      service.marketDataClient.getTradingStatus.mockResolvedValue(mockStatus);

      // 第一次调用
      await service.getTradingStatus('000001.SZ');
      // 第二次调用（应从缓存获取）
      await service.getTradingStatus('000001.SZ');

      // Market Data Client只应被调用一次
      expect(service.marketDataClient.getTradingStatus).toHaveBeenCalledTimes(1);
    });

    it('Market Data服务失败时应降级到本地规则', async () => {
      service.marketDataClient.getTradingStatus.mockRejectedValue(
        new Error('Service unavailable')
      );

      const result = await service.getTradingStatus('000001.SZ');

      expect(result.success).toBe(true);
      expect(result.isFallback).toBe(true);
      expect(result.priceLimits).toHaveProperty('upper');
      expect(result.priceLimits).toHaveProperty('lower');
    });

    it('应记录失败次数', async () => {
      service.marketDataClient.getTradingStatus.mockRejectedValue(
        new Error('Service unavailable')
      );

      await service.getTradingStatus('000001.SZ');

      expect(service.circuitBreaker.failureCount).toBeGreaterThan(0);
    });
  });

  describe('熔断器机制', () => {
    it('连续失败应开启熔断器', async () => {
      service.marketDataClient.getTradingStatus.mockRejectedValue(
        new Error('Service unavailable')
      );

      // 连续失败5次
      for (let i = 0; i < 5; i++) {
        await service.getTradingStatus('000001.SZ');
      }

      expect(service.circuitBreaker.isOpen).toBe(true);
    });

    it('熔断器开启后应直接返回降级数据', async () => {
      // 手动开启熔断器
      service.circuitBreaker.isOpen = true;
      service.circuitBreaker.lastFailureTime = Date.now();

      const result = await service.getTradingStatus('000001.SZ');

      expect(result.isFallback).toBe(true);
      // Market Data Client不应被调用
      expect(service.marketDataClient.getTradingStatus).not.toHaveBeenCalled();
    });

    it('成功请求应重置失败计数', async () => {
      // 先失败一次
      service.marketDataClient.getTradingStatus.mockRejectedValueOnce(
        new Error('Service unavailable')
      );
      await service.getTradingStatus('000001.SZ');

      // 重置mock并返回成功
      service.marketDataClient.getTradingStatus.mockResolvedValue({
        success: true,
        symbol: '000001.SZ',
        status: 'normal',
        priceLimits: { upper: 11.00, lower: 9.00 },
        tradingPhase: 'continuous',
        isST: false,
        isSuspended: false
      });

      // 连续成功3次
      for (let i = 0; i < 3; i++) {
        await service.getTradingStatus('000001.SZ');
      }

      expect(service.circuitBreaker.failureCount).toBe(0);
    });
  });

  describe('批量获取', () => {
    it('应批量获取交易状态', async () => {
      const mockStatus = {
        success: true,
        symbol: '000001.SZ',
        status: 'normal',
        priceLimits: { upper: 11.00, lower: 9.00 },
        tradingPhase: 'continuous',
        isST: false,
        isSuspended: false
      };

      service.marketDataClient.getTradingStatus.mockResolvedValue(mockStatus);

      const symbols = ['000001.SZ', '600000.SH'];
      const results = await service.getBatchTradingStatus(symbols);

      expect(Object.keys(results)).toHaveLength(2);
      expect(results['000001.SZ'].success).toBe(true);
      expect(results['600000.SH'].success).toBe(true);
    });
  });

  describe('获取市场规则 [T-011]', () => {
    it('应从Market Data Service获取市场规则', async () => {
      const mockRules = {
        success: true,
        market: 'SH',
        priceLimit: 0.10,
        minQuantity: 100,
        maxQuantityPerOrder: 1000000,
        tradingHours: [
          { start: '09:30', end: '11:30' },
          { start: '13:00', end: '15:00' }
        ]
      };

      service.marketDataClient.getMarketRules.mockResolvedValue(mockRules);

      const result = await service.getMarketRules('SH');

      expect(result.success).toBe(true);
      expect(result.market).toBe('SH');
      expect(result.priceLimit).toBe(0.10);
    });

    it('Market Data服务失败时应降级到本地规则', async () => {
      service.marketDataClient.getMarketRules.mockRejectedValue(
        new Error('Service unavailable')
      );

      const result = await service.getMarketRules('SH');

      expect(result.success).toBe(true);
      expect(result.isFallback).toBe(true);
      expect(result.market).toBe('SH');
    });
  });

  describe('缓存机制', () => {
    it('应缓存数据', () => {
      const data = { test: 'data' };
      service.setCache('test-key', data);

      const cached = service.getFromCache('test-key');
      expect(cached).toEqual(data);
    });

    it('过期缓存应返回null', () => {
      const data = { test: 'data' };
      service.setCache('test-key', data);

      // 手动设置过期时间
      const cached = service.cache.get('test-key');
      cached.expiry = Date.now() - 1;

      const result = service.getFromCache('test-key');
      expect(result).toBeNull();
    });

    it('clearCache应清除所有缓存', () => {
      service.setCache('key1', { data: 1 });
      service.setCache('key2', { data: 2 });

      service.clearCache();

      expect(service.cache.size).toBe(0);
    });
  });

  describe('获取服务状态', () => {
    it('应返回服务状态', () => {
      const status = service.getStatus();

      expect(status).toHaveProperty('circuitBreaker');
      expect(status).toHaveProperty('cache');
      expect(status.circuitBreaker).toHaveProperty('isOpen');
      expect(status.circuitBreaker).toHaveProperty('failureCount');
    });
  });
});
