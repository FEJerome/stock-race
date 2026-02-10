import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { HealthService, HealthStatus, healthService } from '../../../src/services/HealthService.js';

describe('HealthService Unit Tests', () => {
  let service;

  beforeEach(() => {
    service = new HealthService();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (service) {
      await service.close();
    }
  });

  describe('Basic Health', () => {
    it('should return basic health info', () => {
      const health = service.getBasicHealth();

      expect(health).toHaveProperty('status', HealthStatus.HEALTHY);
      expect(health).toHaveProperty('service', 'backend');
      expect(health).toHaveProperty('version');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('environment');
    });

    it('should have valid timestamp', () => {
      const health = service.getBasicHealth();
      expect(new Date(health.timestamp).toISOString()).toBe(health.timestamp);
    });

    it('should have non-negative uptime', () => {
      const health = service.getBasicHealth();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Overall Status Calculation', () => {
    it('should return healthy when all dependencies are healthy', () => {
      const dependencies = {
        'trading-ai-service': { status: HealthStatus.HEALTHY },
        'market-data-service': { status: HealthStatus.HEALTHY },
        'news-service': { status: HealthStatus.HEALTHY },
        'postgresql': { status: HealthStatus.HEALTHY },
        'redis': { status: HealthStatus.HEALTHY }
      };

      const status = service.calculateOverallStatus(dependencies);
      expect(status).toBe(HealthStatus.HEALTHY);
    });

    it('should return degraded when some services are degraded', () => {
      const dependencies = {
        'trading-ai-service': { status: HealthStatus.HEALTHY },
        'market-data-service': { status: HealthStatus.DEGRADED },
        'news-service': { status: HealthStatus.HEALTHY },
        'postgresql': { status: HealthStatus.HEALTHY },
        'redis': { status: HealthStatus.HEALTHY }
      };

      const status = service.calculateOverallStatus(dependencies);
      expect(status).toBe(HealthStatus.DEGRADED);
    });

    it('should return unhealthy when postgresql is unhealthy', () => {
      const dependencies = {
        'trading-ai-service': { status: HealthStatus.HEALTHY },
        'market-data-service': { status: HealthStatus.HEALTHY },
        'news-service': { status: HealthStatus.HEALTHY },
        'postgresql': { status: HealthStatus.UNHEALTHY },
        'redis': { status: HealthStatus.HEALTHY }
      };

      const status = service.calculateOverallStatus(dependencies);
      expect(status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should return unhealthy when ai-service is unhealthy', () => {
      const dependencies = {
        'trading-ai-service': { status: HealthStatus.UNHEALTHY },
        'market-data-service': { status: HealthStatus.HEALTHY },
        'news-service': { status: HealthStatus.HEALTHY },
        'postgresql': { status: HealthStatus.HEALTHY },
        'redis': { status: HealthStatus.HEALTHY }
      };

      const status = service.calculateOverallStatus(dependencies);
      expect(status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should return unhealthy when market-data-service is unhealthy', () => {
      const dependencies = {
        'trading-ai-service': { status: HealthStatus.HEALTHY },
        'market-data-service': { status: HealthStatus.UNHEALTHY },
        'news-service': { status: HealthStatus.HEALTHY },
        'postgresql': { status: HealthStatus.HEALTHY },
        'redis': { status: HealthStatus.HEALTHY }
      };

      const status = service.calculateOverallStatus(dependencies);
      expect(status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should prioritize unhealthy over degraded', () => {
      const dependencies = {
        'trading-ai-service': { status: HealthStatus.UNHEALTHY },
        'market-data-service': { status: HealthStatus.DEGRADED },
        'news-service': { status: HealthStatus.DEGRADED },
        'postgresql': { status: HealthStatus.HEALTHY },
        'redis': { status: HealthStatus.DEGRADED }
      };

      const status = service.calculateOverallStatus(dependencies);
      expect(status).toBe(HealthStatus.UNHEALTHY);
    });
  });

  describe('Stats', () => {
    it('should return service stats', () => {
      const stats = service.getStats();

      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('uptimeFormatted');
      expect(stats).toHaveProperty('version');
      expect(stats).toHaveProperty('environment');
      expect(stats).toHaveProperty('memory');
      expect(stats).toHaveProperty('pid');
      expect(stats).toHaveProperty('nodeVersion');
      expect(stats).toHaveProperty('platform');
    });

    it('should have valid memory stats', () => {
      const stats = service.getStats();

      expect(stats.memory).toHaveProperty('rss');
      expect(stats.memory).toHaveProperty('heapTotal');
      expect(stats.memory).toHaveProperty('heapUsed');
      expect(stats.memory).toHaveProperty('external');

      expect(typeof stats.memory.rss).toBe('number');
      expect(typeof stats.memory.heapTotal).toBe('number');
      expect(typeof stats.memory.heapUsed).toBe('number');
      expect(stats.memory.rss).toBeGreaterThan(0);
    });

    it('should have valid uptime formatted string', () => {
      const stats = service.getStats();

      expect(typeof stats.uptimeFormatted).toBe('string');
      expect(stats.uptimeFormatted.length).toBeGreaterThan(0);
    });
  });

  describe('Uptime Formatting', () => {
    it('should format seconds correctly', () => {
      expect(service.formatUptime(30000)).toBe('30s');
    });

    it('should format minutes correctly', () => {
      expect(service.formatUptime(90000)).toBe('1m 30s');
    });

    it('should format hours correctly', () => {
      expect(service.formatUptime(3660000)).toBe('1h 1m 0s');
    });

    it('should format days correctly', () => {
      expect(service.formatUptime(90061000)).toBe('1d 1h 1m');
    });
  });

  describe('HealthStatus Enum', () => {
    it('should have all required statuses', () => {
      expect(HealthStatus.HEALTHY).toBe('healthy');
      expect(HealthStatus.DEGRADED).toBe('degraded');
      expect(HealthStatus.UNHEALTHY).toBe('unhealthy');
    });
  });

  describe('Singleton Instance', () => {
    it('should export singleton instance', () => {
      expect(healthService).toBeInstanceOf(HealthService);
    });
  });
});
