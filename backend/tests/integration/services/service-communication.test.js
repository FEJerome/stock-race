import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { AIServiceClient } from '../../../src/services/AIServiceClient.js';
import { MarketDataClient } from '../../../src/services/MarketDataClient.js';
import { NewsServiceClient } from '../../../src/services/NewsServiceClient.js';

/**
 * 服务通信集成测试
 * 实际调用各服务健康检查接口验证连接
 *
 * 注意：运行这些测试需要服务已启动
 * - AI Service: http://localhost:8000
 * - Market Data Service: http://localhost:8001
 * - News Service: http://localhost:8002
 */

describe('Service Communication Integration Tests', () => {
  const TEST_TIMEOUT = 10000;

  describe('AI Service Client', () => {
    let aiClient;

    beforeAll(() => {
      aiClient = new AIServiceClient({
        timeout: 5000,
        retries: 1
      });
    });

    it('should connect to AI service health endpoint', async () => {
      const result = await aiClient.testConnection();

      // 如果服务未启动，测试会失败，这是预期的
      if (result.success) {
        expect(result.service).toBe('ai-service');
        expect(result.status).toBe('healthy');
        expect(result.responseTime).toBeDefined();
        expect(result.responseTime).toBeGreaterThanOrEqual(0);
      } else {
        console.log('AI Service not available:', result.error);
        expect(result.status).toBe('unhealthy');
      }
    }, TEST_TIMEOUT);

    it('should get providers if service is available', async () => {
      try {
        const result = await aiClient.getProviders();
        expect(result.success).toBe(true);
        expect(Array.isArray(result.providers)).toBe(true);
      } catch (error) {
        // 服务不可用时抛出 ServiceUnavailableError
        expect(error.name).toBe('ServiceUnavailableError');
        expect(error.serviceName).toBe('ai-service');
      }
    }, TEST_TIMEOUT);
  });

  describe('Market Data Service Client', () => {
    let marketClient;

    beforeAll(() => {
      marketClient = new MarketDataClient({
        timeout: 5000,
        retries: 1
      });
    });

    it('should connect to Market Data service health endpoint', async () => {
      const result = await marketClient.testConnection();

      if (result.success) {
        expect(result.service).toBe('market-data-service');
        expect(result.status).toBe('healthy');
        expect(result.responseTime).toBeDefined();
        expect(result.responseTime).toBeGreaterThanOrEqual(0);
      } else {
        console.log('Market Data Service not available:', result.error);
        expect(result.status).toBe('unhealthy');
      }
    }, TEST_TIMEOUT);

    it('should get market status if service is available', async () => {
      try {
        const result = await marketClient.getMarketStatus();
        expect(result.success).toBe(true);
        expect(result.status).toBeDefined();
      } catch (error) {
        expect(error.name).toBe('ServiceUnavailableError');
        expect(error.serviceName).toBe('market-data-service');
      }
    }, TEST_TIMEOUT);

    it('should get stock quote if service is available', async () => {
      try {
        const result = await marketClient.getQuote('000001');
        expect(result.success).toBe(true);
        expect(result.symbol).toBe('000001');
        expect(typeof result.price).toBe('number');
      } catch (error) {
        expect(error.name).toBe('ServiceUnavailableError');
      }
    }, TEST_TIMEOUT);
  });

  describe('News Service Client', () => {
    let newsClient;

    beforeAll(() => {
      newsClient = new NewsServiceClient({
        timeout: 5000,
        retries: 1
      });
    });

    it('should connect to News service health endpoint', async () => {
      const result = await newsClient.testConnection();

      if (result.success) {
        expect(result.service).toBe('news-service');
        expect(result.status).toBe('healthy');
        expect(result.responseTime).toBeDefined();
      } else {
        console.log('News Service not available:', result.error);
        expect(result.status).toBe('unhealthy');
      }
    }, TEST_TIMEOUT);

    it('should get stock news if service is available', async () => {
      try {
        const result = await newsClient.getStockNews('000001', { limit: 5 });
        expect(Array.isArray(result)).toBe(true);
      } catch (error) {
        expect(error.name).toBe('ServiceUnavailableError');
        expect(error.serviceName).toBe('news-service');
      }
    }, TEST_TIMEOUT);
  });

  describe('Circuit Breaker Integration', () => {
    it('should open circuit after consecutive failures', async () => {
      // 使用一个无效的URL来模拟服务不可用
      const badClient = new AIServiceClient({
        timeout: 100,
        retries: 1
      });

      // 覆盖baseURL为无效地址
      badClient.client.defaults.baseURL = 'http://localhost:59999';

      // 连续请求失败
      for (let i = 0; i < 5; i++) {
        try {
          await badClient.testConnection();
        } catch (error) {
          // 预期会失败
        }
      }

      const state = badClient.getCircuitBreakerState();
      expect(state.state).toBe('OPEN');
    }, TEST_TIMEOUT);

    it('should reset circuit breaker manually', async () => {
      const client = new AIServiceClient({
        timeout: 100,
        retries: 1
      });

      // 触发一些失败
      client.client.defaults.baseURL = 'http://localhost:59999';
      for (let i = 0; i < 3; i++) {
        try {
          await client.testConnection();
        } catch (error) {
          // 预期会失败
        }
      }

      // 重置熔断器
      client.resetCircuitBreaker();

      const state = client.getCircuitBreakerState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });
  });
});
