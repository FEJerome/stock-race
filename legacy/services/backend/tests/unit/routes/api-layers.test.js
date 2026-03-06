/**
 * 三层API路由架构测试 (O3-004)
 */

import { jest, describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// 模拟依赖
jest.mock('../../../src/services/HealthService.js', () => ({
  healthService: {
    getBasicHealth: jest.fn().mockReturnValue({
      status: 'healthy',
      service: 'backend',
      timestamp: new Date().toISOString()
    }),
    getDetailedHealth: jest.fn().mockResolvedValue({
      status: 'healthy',
      service: 'backend',
      timestamp: new Date().toISOString(),
      dependencies: {}
    }),
    getStats: jest.fn().mockReturnValue({
      uptime: 3600,
      version: '1.0.0'
    })
  }
}));

jest.mock('../../../src/models/index.js', () => ({
  rankingRepository: {
    getPublicRankings: jest.fn().mockResolvedValue({
      data: [
        { aiManagerName: '测试AI1', totalReturn: 0.25, sharpeRatio: 1.5, winRate: 0.7 },
        { aiManagerName: '测试AI2', totalReturn: 0.18, sharpeRatio: 1.2, winRate: 0.6 }
      ],
      total: 2
    })
  }
}));

jest.mock('../../../src/services/MarketDataClient.js', () => ({
  MarketDataClient: jest.fn().mockImplementation(() => ({
    getQuotes: jest.fn().mockResolvedValue([
      { symbol: '000001.SZ', name: '平安银行', price: 12.58, change: 0.35, changePercent: 2.86, volume: 1250000 }
    ]),
    getMarketSnapshot: jest.fn().mockResolvedValue({
      indices: [],
      hotStocks: [],
      timestamp: new Date().toISOString()
    })
  }))
}));

jest.mock('../../../src/services/GuestService.js', () => ({
  createGuestToken: jest.fn().mockResolvedValue({
    token: 'guest_test_token',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }),
  getSession: jest.fn().mockResolvedValue({
    openidHash: 'test_hash',
    token: 'guest_test_token',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'active'
  })
}));

// 动态导入路由
const { default: apiLayerRoutes } = await import('../../../src/routes/api-layers.js');

describe('三层API路由架构 (O3-004)', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1', apiLayerRoutes);
  });

  describe('第一层: 公开API (/api/v1/public/*)', () => {
    it('GET /api/v1/public/health 无需认证可访问', async () => {
      const response = await request(app)
        .get('/api/v1/public/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
    });

    it('GET /api/v1/public/api-info 返回API信息', async () => {
      const response = await request(app)
        .get('/api/v1/public/api-info')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('apiLayers');
      expect(response.body.data.apiLayers).toHaveProperty('public');
      expect(response.body.data.apiLayers).toHaveProperty('guest');
      expect(response.body.data.apiLayers).toHaveProperty('authenticated');
    });

    it('GET /api/v1/public/rankings 返回排行榜数据', async () => {
      const response = await request(app)
        .get('/api/v1/public/rankings?page=1&limit=20&sort=by_return')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 20);
    });

    it('GET /api/v1/public/market/quotes 返回行情数据', async () => {
      const response = await request(app)
        .get('/api/v1/public/market/quotes?symbols=000001.SZ')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('GET /api/v1/public/market/quotes 验证股票数量限制', async () => {
      const symbols = Array(51).fill('000001.SZ').join(',');
      const response = await request(app)
        .get(`/api/v1/public/market/quotes?symbols=${symbols}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TOO_MANY_SYMBOLS');
    });

    it('GET /api/v1/public/rankings 验证排序参数', async () => {
      const response = await request(app)
        .get('/api/v1/public/rankings?sort=invalid_sort')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_SORT');
    });
  });

  describe('第二层: 游客API (/api/v1/guest/*)', () => {
    it('POST /api/v1/guest/token 创建设备指纹的Token', async () => {
      const response = await request(app)
        .post('/api/v1/guest/token')
        .send({ device_fingerprint: 'test_device_fingerprint_123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('guest_token');
      expect(response.body.data).toHaveProperty('expires_at');
    });

    it('POST /api/v1/guest/token 验证设备指纹必填', async () => {
      const response = await request(app)
        .post('/api/v1/guest/token')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/guest/token/validate 验证Token有效', async () => {
      const response = await request(app)
        .get('/api/v1/guest/token/validate')
        .set('Authorization', 'Bearer guest_test_token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
    });

    it('GET /api/v1/guest/token/validate 无Token返回401', async () => {
      const response = await request(app)
        .get('/api/v1/guest/token/validate')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('第三层: 认证API (/api/v1/*)', () => {
    it('GET /api/v1/health 健康检查端点', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
    });

    it('GET /api/v1/api-info 返回API层信息', async () => {
      const response = await request(app)
        .get('/api/v1/api-info')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('apiLayers');
    });

    it('GET /api/v1/health/detailed 详细健康检查', async () => {
      const response = await request(app)
        .get('/api/v1/health/detailed')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
    });

    it('GET /api/v1/health/stats 服务统计', async () => {
      const response = await request(app)
        .get('/api/v1/health/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('uptime');
    });
  });

  describe('路由分层验证', () => {
    it('所有公开API都不需要认证', async () => {
      const publicEndpoints = [
        '/api/v1/public/health',
        '/api/v1/public/api-info'
      ];

      for (const endpoint of publicEndpoints) {
        const response = await request(app)
          .get(endpoint)
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });

    it('认证API在没有JWT时返回401', async () => {
      const protectedEndpoints = [
        '/api/v1/ai-accounts',
        '/api/v1/stocks',
        '/api/v1/trades'
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await request(app)
          .get(endpoint)
          .expect(401);

        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('404处理', () => {
    it('访问不存在的端点返回404', async () => {
      const response = await request(app)
        .get('/api/v1/non-existent-endpoint')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
