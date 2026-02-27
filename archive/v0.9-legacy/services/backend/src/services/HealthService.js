import { aiServiceClient } from './AIServiceClient.js';
import { marketDataClient } from './MarketDataClient.js';
import { newsServiceClient } from './NewsServiceClient.js';
import { getPrismaClient } from '../config/database.js';
import { Redis } from 'ioredis';
import { EventBusService } from './EventBusService.js';

/**
 * 健康状态枚举
 * C1-BE-002: NORMAL/DEGRADED/OFFLINE模式
 */
export const HealthStatus = {
  HEALTHY: 'healthy',
  NORMAL: 'normal',
  DEGRADED: 'degraded',
  OFFLINE: 'offline',
  UNHEALTHY: 'unhealthy'
};

/**
 * 服务状态枚举 (C1-BE-002)
 */
export const ServiceStatus = {
  NORMAL: 'normal',
  DEGRADED: 'degraded',
  OFFLINE: 'offline'
};

/**
 * 健康检查服务
 * 监控后端服务及其依赖的健康状态
 * C1-BE-001~003: 健康检查SDK集成
 */
export class HealthService {
  constructor() {
    this.serviceName = 'backend';
    this.version = process.env.npm_package_version || '1.0.0';
    this.startTime = Date.now();

    // C1-BE-002: 服务状态
    this.status = ServiceStatus.NORMAL;
    this.dependencies = {
      'trading-ai-service': { status: ServiceStatus.NORMAL, lastCheck: null, latency: 0 },
      'market-data-service': { status: ServiceStatus.NORMAL, lastCheck: null, latency: 0 },
      'news-service': { status: ServiceStatus.NORMAL, lastCheck: null, latency: 0 },
      'postgresql': { status: ServiceStatus.NORMAL, lastCheck: null, latency: 0 },
      'redis': { status: ServiceStatus.NORMAL, lastCheck: null, latency: 0 },
      'eventBus': { status: ServiceStatus.NORMAL, lastCheck: null, latency: 0 }
    };

    // C1-BE-003: 自动检查配置
    this.checkInterval = null;
    this.checkIntervalMs = 10000; // 10秒

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
   * C1-BE-001: 初始化健康检查服务
   * @param {Object} options - 配置选项
   * @param {number} options.interval - 检查间隔（毫秒）
   */
  initialize(options = {}) {
    if (options.interval) {
      this.checkIntervalMs = options.interval;
    }

    // 立即执行一次检查
    this.performHealthCheck();

    // C1-BE-003: 启动定时检查
    this.startAutoCheck();

    console.log(`[HealthService] Initialized with ${this.checkIntervalMs}ms interval`);
  }

  /**
   * 获取基本健康状态
   * @returns {Object} 基本健康信息
   */
  getBasicHealth() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      status: this.status,
      service: this.serviceName,
      version: this.version,
      timestamp: new Date().toISOString(),
      uptime,
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * 获取详细健康状态
   * C1-BE-001: 检查Redis/PostgreSQL/Market Data状态
   * @returns {Promise<Object>} 详细健康信息
   */
  async getDetailedHealth() {
    return this.performHealthCheck();
  }

  /**
   * C1-BE-001: 执行健康检查
   * @returns {Promise<Object>}
   */
  async performHealthCheck() {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // 并行检查所有依赖
    const [
      aiServiceHealth,
      marketDataHealth,
      newsServiceHealth,
      databaseHealth,
      redisHealth,
      eventBusHealth
    ] = await Promise.all([
      this.checkAIService(),
      this.checkMarketDataService(),
      this.checkNewsService(),
      this.checkDatabase(),
      this.checkRedis(),
      this.checkEventBus()
    ]);

    const responseTime = Date.now() - startTime;

    // 更新依赖状态（C1-BE-002格式）
    this.dependencies = {
      'trading-ai-service': { ...this.mapToServiceStatus(aiServiceHealth), lastCheck: timestamp },
      'market-data-service': { ...this.mapToServiceStatus(marketDataHealth), lastCheck: timestamp },
      'news-service': { ...this.mapToServiceStatus(newsServiceHealth), lastCheck: timestamp },
      'postgresql': { ...this.mapToServiceStatus(databaseHealth), lastCheck: timestamp },
      'redis': { ...this.mapToServiceStatus(redisHealth), lastCheck: timestamp },
      'eventBus': { ...this.mapToServiceStatus(eventBusHealth), lastCheck: timestamp }
    };

    // C1-BE-002: 计算整体状态
    this.status = this.calculateServiceStatus();

    // C1-BE-003: 尝试自动恢复
    if (this.status === ServiceStatus.OFFLINE) {
      await this.attemptRecovery();
    }

    return {
      status: this.status,
      service: this.serviceName,
      version: this.version,
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      environment: process.env.NODE_ENV || 'development',
      dependencies: this.dependencies,
      summary: {
        total: Object.keys(this.dependencies).length,
        normal: Object.values(this.dependencies).filter(d => d.status === ServiceStatus.NORMAL).length,
        degraded: Object.values(this.dependencies).filter(d => d.status === ServiceStatus.DEGRADED).length,
        offline: Object.values(this.dependencies).filter(d => d.status === ServiceStatus.OFFLINE).length
      }
    };
  }

  /**
   * 将健康状态映射到服务状态
   * @private
   * @param {Object} health - 健康状态
   * @returns {Object}
   */
  mapToServiceStatus(health) {
    const status = health.status === HealthStatus.HEALTHY || health.status === HealthStatus.NORMAL
      ? ServiceStatus.NORMAL
      : health.status === HealthStatus.DEGRADED
        ? ServiceStatus.DEGRADED
        : ServiceStatus.OFFLINE;

    return {
      status,
      latency: health.responseTimeMs || 0,
      error: health.error || null
    };
  }

  /**
   * C1-BE-002: 计算整体服务状态
   * @returns {string}
   */
  calculateServiceStatus() {
    const statuses = Object.values(this.dependencies).map(d => d.status);

    // 如果有任何关键服务OFFLINE，整体为OFFLINE
    const criticalServices = ['postgresql', 'redis'];
    const criticalOffline = criticalServices.some(
      service => this.dependencies[service]?.status === ServiceStatus.OFFLINE
    );

    if (criticalOffline) {
      return ServiceStatus.OFFLINE;
    }

    // 如果有任何服务DEGRADED，整体为DEGRADED
    if (statuses.some(s => s === ServiceStatus.DEGRADED)) {
      return ServiceStatus.DEGRADED;
    }

    // 所有服务都正常
    return ServiceStatus.NORMAL;
  }

  /**
   * C1-BE-003: 尝试自动恢复
   * @private
   */
  async attemptRecovery() {
    console.log('[HealthService] Attempting recovery...');

    // 尝试重新连接Redis
    if (this.dependencies.redis.status === ServiceStatus.OFFLINE && this.redisClient) {
      try {
        await this.redisClient.connect();
        console.log('[HealthService] Redis reconnected');
      } catch (error) {
        console.error('[HealthService] Redis recovery failed:', error.message);
      }
    }

    // 尝试重新连接EventBus
    if (this.dependencies.eventBus.status === ServiceStatus.OFFLINE) {
      try {
        await EventBusService.initialize();
        console.log('[HealthService] EventBus reconnected');
      } catch (error) {
        console.error('[HealthService] EventBus recovery failed:', error.message);
      }
    }

    // 尝试重新连接PostgreSQL
    if (this.dependencies.postgresql.status === ServiceStatus.OFFLINE) {
      try {
        const prisma = getPrismaClient();
        await prisma.$connect();
        console.log('[HealthService] PostgreSQL reconnected');
      } catch (error) {
        console.error('[HealthService] PostgreSQL recovery failed:', error.message);
      }
    }
  }

  /**
   * C1-BE-003: 启动自动检查
   */
  startAutoCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.error('[HealthService] Auto check failed:', error.message);
      });
    }, this.checkIntervalMs);

    console.log(`[HealthService] Auto check started (${this.checkIntervalMs}ms)`);
  }

  /**
   * 停止自动检查
   */
  stopAutoCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[HealthService] Auto check stopped');
    }
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
        status: HealthStatus.UNHEALTHY,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检查EventBus状态
   * @returns {Promise<Object>} EventBus健康状态
   */
  async checkEventBus() {
    try {
      if (!EventBusService.isConnected) {
        return {
          status: HealthStatus.UNHEALTHY,
          error: 'EventBus not connected',
          timestamp: new Date().toISOString()
        };
      }

      const startTime = Date.now();
      const isHealthy = EventBusService.isHealthy();
      const responseTime = Date.now() - startTime;

      return {
        status: isHealthy ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
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
   * C1-BE-002: 检查是否处于降级模式
   * @returns {boolean}
   */
  isDegraded() {
    return this.status === ServiceStatus.DEGRADED;
  }

  /**
   * C1-BE-002: 检查是否离线
   * @returns {boolean}
   */
  isOffline() {
    return this.status === ServiceStatus.OFFLINE;
  }

  /**
   * C1-BE-002: 检查特定依赖是否可用
   * @param {string} dependency - 依赖名称
   * @returns {boolean}
   */
  isDependencyAvailable(dependency) {
    const dep = this.dependencies[dependency];
    return dep && (dep.status === ServiceStatus.NORMAL || dep.status === ServiceStatus.DEGRADED);
  }

  /**
   * 关闭服务
   */
  async close() {
    this.stopAutoCheck();
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

// 创建单例实例
export const healthService = new HealthService();

export default HealthService;
