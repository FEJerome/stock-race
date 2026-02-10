import { aiServiceClient } from './AIServiceClient.js';
import { marketDataClient } from './MarketDataClient.js';
import { newsServiceClient } from './NewsServiceClient.js';
import { getPrismaClient } from '../config/database.js';
import { Redis } from 'ioredis';

/**
 * 健康状态枚举
 */
export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy'
};

/**
 * 健康检查服务
 * 监控后端服务及其依赖的健康状态
 */
export class HealthService {
  constructor() {
    this.serviceName = 'backend';
    this.version = process.env.npm_package_version || '1.0.0';
    this.startTime = Date.now();

    // 初始化Redis客户端（用于健康检查）
    this.redisClient = null;
    if (process.env.REDIS_URL) {
      try {
        this.redisClient = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 1,
          connectTimeout: 5000
        });
      } catch (error) {
        console.warn('[HealthService] Redis客户端初始化失败:', error.message);
      }
    }
  }

  /**
   * 获取基本健康状态
   * @returns {Object} 基本健康信息
   */
  getBasicHealth() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      status: HealthStatus.HEALTHY,
      service: this.serviceName,
      version: this.version,
      timestamp: new Date().toISOString(),
      uptime,
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * 获取详细健康状态
   * @returns {Promise<Object>} 详细健康信息
   */
  async getDetailedHealth() {
    const startTime = Date.now();

    // 并行检查所有依赖
    const [
      aiServiceHealth,
      marketDataHealth,
      newsServiceHealth,
      databaseHealth,
      redisHealth
    ] = await Promise.all([
      this.checkAIService(),
      this.checkMarketDataService(),
      this.checkNewsService(),
      this.checkDatabase(),
      this.checkRedis()
    ]);

    const responseTime = Date.now() - startTime;

    // 计算整体状态
    const dependencies = {
      'trading-ai-service': aiServiceHealth,
      'market-data-service': marketDataHealth,
      'news-service': newsServiceHealth,
      'postgresql': databaseHealth,
      'redis': redisHealth
    };

    const overallStatus = this.calculateOverallStatus(dependencies);

    return {
      status: overallStatus,
      service: this.serviceName,
      version: this.version,
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      environment: process.env.NODE_ENV || 'development',
      dependencies
    };
  }

  /**
   * 检查AI服务状态
   * @returns {Promise<Object>} AI服务健康状态
   */
  async checkAIService() {
    try {
      const result = await aiServiceClient.testConnection();

      if (result.success) {
        return {
          status: HealthStatus.HEALTHY,
          responseTimeMs: result.responseTime,
          version: result.version || 'unknown',
          timestamp: result.timestamp
        };
      }

      return {
        status: HealthStatus.UNHEALTHY,
        error: result.error || 'Service unavailable',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检查市场数据服务状态
   * @returns {Promise<Object>} 市场数据服务健康状态
   */
  async checkMarketDataService() {
    try {
      const result = await marketDataClient.healthCheck();

      if (result.success) {
        return {
          status: HealthStatus.HEALTHY,
          responseTimeMs: result.responseTime,
          timestamp: result.timestamp
        };
      }

      return {
        status: HealthStatus.UNHEALTHY,
        error: result.error || 'Service unavailable',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检查新闻服务状态
   * @returns {Promise<Object>} 新闻服务健康状态
   */
  async checkNewsService() {
    // 如果新闻服务未配置，返回健康状态（可选依赖）
    if (!process.env.NEWS_SERVICE_URL) {
      return {
        status: HealthStatus.HEALTHY,
        message: 'Optional service not configured',
        timestamp: new Date().toISOString()
      };
    }

    try {
      const result = await newsServiceClient.healthCheck();

      if (result.success) {
        return {
          status: HealthStatus.HEALTHY,
          responseTimeMs: result.responseTime,
          timestamp: result.timestamp
        };
      }

      // 新闻服务是可选依赖，失败时返回degraded而不是unhealthy
      return {
        status: HealthStatus.DEGRADED,
        error: result.error || 'Service unavailable',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: HealthStatus.DEGRADED,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检查数据库状态
   * @returns {Promise<Object>} 数据库健康状态
   */
  async checkDatabase() {
    let prisma = null;
    try {
      const startTime = Date.now();

      // 执行简单查询测试连接
      prisma = getPrismaClient();
      await prisma.$queryRaw`SELECT 1`;

      const responseTime = Date.now() - startTime;

      return {
        status: HealthStatus.HEALTHY,
        responseTimeMs: responseTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检查Redis状态
   * @returns {Promise<Object>} Redis健康状态
   */
  async checkRedis() {
    if (!this.redisClient) {
      return {
        status: HealthStatus.HEALTHY,
        message: 'Redis not configured',
        timestamp: new Date().toISOString()
      };
    }

    try {
      const startTime = Date.now();

      // 执行PING测试连接
      await this.redisClient.ping();

      const responseTime = Date.now() - startTime;

      return {
        status: HealthStatus.HEALTHY,
        responseTimeMs: responseTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: HealthStatus.DEGRADED,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 计算整体健康状态
   * @param {Object} dependencies - 依赖服务状态
   * @returns {string} 整体状态
   */
  calculateOverallStatus(dependencies) {
    const statuses = Object.values(dependencies).map(d => d.status);

    // 只有 postgresql 是关键服务，unhealthy 时整体 unhealthy
    if (dependencies['postgresql']?.status === HealthStatus.UNHEALTHY) {
      return HealthStatus.UNHEALTHY;
    }

    // 如果有任何服务 degraded（包括外部服务不可用），整体状态为 degraded
    if (statuses.includes(HealthStatus.DEGRADED) ||
        dependencies['trading-ai-service']?.status === HealthStatus.UNHEALTHY ||
        dependencies['market-data-service']?.status === HealthStatus.UNHEALTHY) {
      return HealthStatus.DEGRADED;
    }

    // 所有服务都健康
    return HealthStatus.HEALTHY;
  }

  /**
   * 获取服务统计信息
   * @returns {Object} 服务统计
   */
  getStats() {
    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      uptimeFormatted: this.formatUptime(Date.now() - this.startTime),
      version: this.version,
      environment: process.env.NODE_ENV || 'development',
      memory: process.memoryUsage(),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * 格式化运行时间
   * @param {number} ms - 毫秒数
   * @returns {string} 格式化后的时间
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * 关闭服务
   */
  async close() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

// 创建单例实例
export const healthService = new HealthService();

export default HealthService;
