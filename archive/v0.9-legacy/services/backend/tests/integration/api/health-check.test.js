import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../../src/app.js';
import { healthService } from '../../../src/services/HealthService.js';

/**
 * 健康检查集成测试
 * 验证健康检查端点的功能和性能
 */

describe('Health Check Integration Tests', () => {
  const TEST_TIMEOUT = 30000;

  describe('GET /api/health', () => {
    it('should return basic health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status', 'healthy');
      expect(response.body.data).toHaveProperty('service', 'backend');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('uptime');
      expect(response.body.data).toHaveProperty('environment');
    }, TEST_TIMEOUT);

    it('should respond within 100ms', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/api/health')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(100);
    }, TEST_TIMEOUT);
  });

  describe('GET /api/health/detailed', () => {
    it('should return detailed health status with dependencies', async () => {
      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('service', 'backend');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('responseTimeMs');
      expect(response.body.data).toHaveProperty('uptime');
      expect(response.body.data).toHaveProperty('environment');
      expect(response.body.data).toHaveProperty('dependencies');

      // 验证依赖项
      const deps = response.body.data.dependencies;
      expect(deps).toHaveProperty('trading-ai-service');
      expect(deps).toHaveProperty('market-data-service');
      expect(deps).toHaveProperty('news-service');
      expect(deps).toHaveProperty('postgresql');
      expect(deps).toHaveProperty('redis');
    }, TEST_TIMEOUT);

    it('should return status in valid range', async () => {
      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      const validStatuses = ['healthy', 'degraded', 'unhealthy'];
      expect(validStatuses).toContain(response.body.data.status);
    }, TEST_TIMEOUT);

    it('should respond within 5 seconds', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/api/health/detailed')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(5000);
    }, TEST_TIMEOUT);

    it('should handle service degradation gracefully', async () => {
      // Mock health service to simulate degraded state
      const originalCheckAIService = healthService.checkAIService;
      healthService.checkAIService = jest.fn().mockResolvedValue({
        status: 'degraded',
        error: 'High latency',
        timestamp: new Date().toISOString()
      });

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body.data.status).toBe('degraded');
      expect(response.body.data.dependencies['trading-ai-service'].status).toBe('degraded');

      // Restore original method
      healthService.checkAIService = originalCheckAIService;
    }, TEST_TIMEOUT);

    it('should return 503 when service is unhealthy', async () => {
      // Mock health service to simulate unhealthy state
      const originalCheckDatabase = healthService.checkDatabase;
      healthService.checkDatabase = jest.fn().mockResolvedValue({
        status: 'unhealthy',
        error: 'Connection refused',
        timestamp: new Date().toISOString()
      });

      const originalCalculateOverallStatus = healthService.calculateOverallStatus;
      healthService.calculateOverallStatus = jest.fn().mockReturnValue('unhealthy');

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(503);

      expect(response.body.success).toBe(false);

      // Restore original methods
      healthService.checkDatabase = originalCheckDatabase;
      healthService.calculateOverallStatus = originalCalculateOverallStatus;
    }, TEST_TIMEOUT);
  });

  describe('GET /api/health/stats', () => {
    it('should return service statistics', async () => {
      const response = await request(app)
        .get('/api/health/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('uptime');
      expect(response.body.data).toHaveProperty('uptimeFormatted');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('environment');
      expect(response.body.data).toHaveProperty('memory');
      expect(response.body.data).toHaveProperty('pid');
      expect(response.body.data).toHaveProperty('nodeVersion');
      expect(response.body.data).toHaveProperty('platform');
    }, TEST_TIMEOUT);

    it('should have valid memory stats', async () => {
      const response = await request(app)
        .get('/api/health/stats')
        .expect(200);

      const memory = response.body.data.memory;
      expect(memory).toHaveProperty('rss');
      expect(memory).toHaveProperty('heapTotal');
      expect(memory).toHaveProperty('heapUsed');
      expect(memory).toHaveProperty('external');

      expect(typeof memory.rss).toBe('number');
      expect(typeof memory.heapTotal).toBe('number');
      expect(typeof memory.heapUsed).toBe('number');
      expect(memory.rss).toBeGreaterThan(0);
    }, TEST_TIMEOUT);
  });

  describe('Health Status Values', () => {
    it('should only return valid status values', async () => {
      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      const validStatuses = ['healthy', 'degraded', 'unhealthy'];

      // Check overall status
      expect(validStatuses).toContain(response.body.data.status);

      // Check all dependency statuses
      Object.values(response.body.data.dependencies).forEach(dep => {
        expect(validStatuses).toContain(dep.status);
      });
    }, TEST_TIMEOUT);
  });

  describe('Dependency Response Times', () => {
    it('should include response times for checked services', async () => {
      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      const deps = response.body.data.dependencies;

      // PostgreSQL should always have responseTimeMs when healthy
      if (deps.postgresql.status === 'healthy') {
        expect(deps.postgresql).toHaveProperty('responseTimeMs');
        expect(typeof deps.postgresql.responseTimeMs).toBe('number');
        expect(deps.postgresql.responseTimeMs).toBeGreaterThanOrEqual(0);
      }
    }, TEST_TIMEOUT);
  });

  describe('Timestamp Format', () => {
    it('should return valid ISO timestamps', async () => {
      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      // Validate timestamp format
      const timestamp = response.body.data.timestamp;
      expect(new Date(timestamp).toISOString()).toBe(timestamp);

      // Validate dependency timestamps
      Object.values(response.body.data.dependencies).forEach(dep => {
        if (dep.timestamp) {
          expect(new Date(dep.timestamp).toISOString()).toBe(dep.timestamp);
        }
      });
    }, TEST_TIMEOUT);
  });
});
