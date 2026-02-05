# 监控和日志增强方案

## 概述
本方案旨在完善stock-race后端的监控和日志系统，提供全面的可观测性，包括结构化日志、性能监控、健康检查、请求追踪等。

## 当前状态分析

### 现有实现
- **日志**：混合使用console.log/error，无结构化
- **监控**：基本健康检查端点
- **追踪**：无请求追踪
- **指标**：缺乏性能指标收集

### 问题识别
1. **日志不统一**：格式不一致，难以分析
2. **监控不全面**：缺乏关键指标监控
3. **追踪缺失**：无法跟踪请求链路
4. **告警不足**：缺乏智能告警机制
5. **可视化缺失**：缺乏监控仪表板

## 优化目标

### 短期目标（1-2周）
1. **结构化日志**：统一日志格式，支持多级别
2. **基础监控**：添加关键性能指标
3. **增强健康检查**：全面服务健康检查

### 中期目标（3-4周）
4. **请求追踪**：实现分布式追踪
5. **告警系统**：设置智能告警规则
6. **监控仪表板**：创建可视化监控

### 长期目标（5-8周）
7. **日志分析**：集成日志分析工具
8. **性能分析**：添加性能剖析
9. **自动化运维**：基于监控的自动扩缩容

## 优化措施

### 1. 结构化日志系统

#### 1.1 Winston日志配置
```javascript
// src/utils/logger.js
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// 日志级别
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// 日志级别颜色
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(colors);

// 日志格式
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// 控制台输出格式（开发环境）
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// 创建logger实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  defaultMeta: { service: 'stock-race-backend' },
  transports: [
    // 控制台输出（开发环境）
    new winston.transports.Console({
      format: consoleFormat
    }),

    // 错误日志文件
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d'
    }),

    // 所有日志文件
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    }),

    // HTTP请求日志
    new DailyRotateFile({
      filename: 'logs/http-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      maxSize: '20m',
      maxFiles: '7d'
    })
  ]
});

// 添加请求ID到日志
logger.addRequestId = (req, res, next) => {
  const requestId = req.headers['x-request-id'] ||
                   req.id ||
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // 为本次请求创建子logger
  req.logger = logger.child({ requestId });

  next();
};

export default logger;
```

#### 1.2 请求日志中间件
```javascript
// src/middleware/requestLogger.js
import logger from '../utils/logger.js';

const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  req.startTime = startTime;

  // 记录请求开始
  req.logger.http('Request started', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user?.id || 'anonymous'
  });

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' :
                     res.statusCode >= 400 ? 'warn' : 'http';

    req.logger.log(logLevel, 'Request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length') || 0,
      userId: req.user?.id || 'anonymous',
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });

    // 记录慢请求
    if (duration > 1000) {
      req.logger.warn('Slow request detected', {
        method: req.method,
        url: req.originalUrl,
        duration,
        threshold: 1000
      });
    }
  });

  // 监听响应错误
  res.on('error', (error) => {
    req.logger.error('Response error', {
      method: req.method,
      url: req.originalUrl,
      error: error.message,
      stack: error.stack
    });
  });

  next();
};

export default requestLogger;
```

#### 1.3 业务日志工具
```javascript
// src/utils/businessLogger.js
import logger from './logger.js';

class BusinessLogger {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.logger = logger.child({ service: serviceName });
  }

  // 交易日志
  logTrade(tradeData) {
    this.logger.info('Trade executed', {
      event: 'trade_executed',
      ...tradeData,
      timestamp: new Date().toISOString()
    });
  }

  // AI决策日志
  logAIDecision(decisionData) {
    this.logger.info('AI decision made', {
      event: 'ai_decision',
      ...decisionData,
      timestamp: new Date().toISOString()
    });
  }

  // 股票数据日志
  logStockData(stockCode, dataSource, isFallback) {
    this.logger.info('Stock data fetched', {
      event: 'stock_data_fetched',
      stockCode,
      dataSource,
      isFallback,
      timestamp: new Date().toISOString()
    });
  }

  // 错误日志
  logError(context, error, additionalData = {}) {
    this.logger.error('Business error', {
      event: 'business_error',
      context,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code
      },
      ...additionalData,
      timestamp: new Date().toISOString()
    });
  }

  // 性能日志
  logPerformance(operation, duration, metadata = {}) {
    const level = duration > 1000 ? 'warn' : 'info';

    this.logger.log(level, 'Performance measurement', {
      event: 'performance',
      operation,
      duration,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }
}

// 创建各服务logger实例
export const tradeLogger = new BusinessLogger('trade-service');
export const aiLogger = new BusinessLogger('ai-service');
export const dataLogger = new BusinessLogger('data-service');
export const marketLogger = new BusinessLogger('market-service');

export default BusinessLogger;
```

### 2. 性能监控系统

#### 2.1 指标收集器
```javascript
// src/utils/metricsCollector.js
class MetricsCollector {
  constructor() {
    this.metrics = {
      http: {
        requests: {
          total: 0,
          byMethod: new Map(),
          byStatus: new Map(),
          byEndpoint: new Map()
        },
        responseTimes: {
          sum: 0,
          count: 0,
          min: Infinity,
          max: 0,
          histogram: new Array(10).fill(0) // 0-100ms, 100-200ms, ...
        }
      },
      database: {
        queries: {
          total: 0,
          byType: new Map(),
          duration: {
            sum: 0,
            count: 0,
            min: Infinity,
            max: 0
          }
        },
        connections: {
          total: 0,
          active: 0,
          idle: 0
        }
      },
      externalServices: {
        dataService: {
          calls: 0,
          successes: 0,
          failures: 0,
          duration: {
            sum: 0,
            count: 0,
            min: Infinity,
            max: 0
          }
        },
        aiService: {
          calls: 0,
          successes: 0,
          failures: 0,
          duration: {
            sum: 0,
            count: 0,
            min: Infinity,
            max: 0
          }
        }
      },
      memory: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        arrayBuffers: 0
      },
      system: {
        uptime: 0,
        cpuUsage: 0,
        loadAverage: [0, 0, 0]
      }
    };

    this.startCollection();
  }

  startCollection() {
    // 定期收集系统指标
    setInterval(() => {
      this.collectSystemMetrics();
    }, 60000); // 每分钟

    // 定期清理旧数据
    setInterval(() => {
      this.cleanupOldData();
    }, 3600000); // 每小时
  }

  collectSystemMetrics() {
    // 内存使用
    const memoryUsage = process.memoryUsage();
    this.metrics.memory = {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers,
      rss: memoryUsage.rss
    };

    // CPU使用
    const cpuUsage = process.cpuUsage();
    this.metrics.system.cpuUsage = cpuUsage.user + cpuUsage.system;

    // 系统运行时间
    this.metrics.system.uptime = process.uptime();

    // 发送到监控系统
    this.sendToMonitoringSystem();
  }

  // 记录HTTP请求
  recordHttpRequest(method, endpoint, statusCode, duration) {
    this.metrics.http.requests.total++;

    // 按方法统计
    const methodCount = this.metrics.http.requests.byMethod.get(method) || 0;
    this.metrics.http.requests.byMethod.set(method, methodCount + 1);

    // 按状态码统计
    const statusCount = this.metrics.http.requests.byStatus.get(statusCode) || 0;
    this.metrics.http.requests.byStatus.set(statusCode, statusCount + 1);

    // 按端点统计
    const endpointCount = this.metrics.http.requests.byEndpoint.get(endpoint) || 0;
    this.metrics.http.requests.byEndpoint.set(endpoint, endpointCount + 1);

    // 响应时间统计
    this.metrics.http.responseTimes.sum += duration;
    this.metrics.http.responseTimes.count++;
    this.metrics.http.responseTimes.min = Math.min(this.metrics.http.responseTimes.min, duration);
    this.metrics.http.responseTimes.max = Math.max(this.metrics.http.responseTimes.max, duration);

    // 直方图
    const bucket = Math.min(Math.floor(duration / 100), 9);
    this.metrics.http.responseTimes.histogram[bucket]++;
  }

  // 记录数据库查询
  recordDatabaseQuery(queryType, duration) {
    this.metrics.database.queries.total++;

    const typeCount = this.metrics.database.queries.byType.get(queryType) || 0;
    this.metrics.database.queries.byType.set(queryType, typeCount + 1);

    this.metrics.database.queries.duration.sum += duration;
    this.metrics.database.queries.duration.count++;
    this.metrics.database.queries.duration.min = Math.min(
      this.metrics.database.queries.duration.min,
      duration
    );
    this.metrics.database.queries.duration.max = Math.max(
      this.metrics.database.queries.duration.max,
      duration
    );
  }

  // 获取指标快照
  getMetricsSnapshot() {
    return {
      timestamp: new Date().toISOString(),
      ...this.metrics,
      // 计算平均值
      averages: {
        httpResponseTime: this.metrics.http.responseTimes.count > 0
          ? this.metrics.http.responseTimes.sum / this.metrics.http.responseTimes.count
          : 0,
        databaseQueryTime: this.metrics.database.queries.duration.count > 0
          ? this.metrics.database.queries.duration.sum / this.metrics.database.queries.duration.count
          : 0
      }
    };
  }
}

export const metricsCollector = new MetricsCollector();
```

#### 2.2 监控中间件
```javascript
// src/middleware/metricsMiddleware.js
import { metricsCollector } from '../utils/metricsCollector.js';

const metricsMiddleware = (req, res, next) => {
  const startTime = Date.now();

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const endpoint = req.baseUrl + req.path;

    metricsCollector.recordHttpRequest(
      req.method,
      endpoint,
      res.statusCode,
      duration
    );
  });

  next();
};

// 数据库监控装饰器
const monitorDatabaseQuery = (fn) => {
  return async (...args) => {
    const startTime = Date.now();
    const queryType = fn.name || 'unknown';

    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;

      metricsCollector.recordDatabaseQuery(queryType, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordDatabaseQuery(`${queryType}_error`, duration);
      throw error;
    }
  };
};

export { metricsMiddleware, monitorDatabaseQuery };
```

### 3. 增强健康检查

#### 3.1 综合健康检查
```javascript
// src/services/HealthCheckService.js
import { pool } from '../database/connection.js';
import { createClient } from 'redis';
import axios from 'axios';

class HealthCheckService {
  constructor() {
    this.redisClient = null;
    this.checks = {
      database: this.checkDatabase.bind(this),
      redis: this.checkRedis.bind(this),
      dataService: this.checkDataService.bind(this),
      aiService: this.checkAIService.bind(this),
      diskSpace: this.checkDiskSpace.bind(this),
      memory: this.checkMemory.bind(this)
    };
  }

  async checkDatabase() {
    const startTime = Date.now();

    try {
      const client = await pool.connect();

      // 测试查询
      const result = await client.query('SELECT 1 as test');
      const duration = Date.now() - startTime;

      client.release();

      return {
        status: 'healthy',
        latency: duration,
        details: {
          testResult: result.rows[0].test,
          poolSize: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        error: error.message
      };
    }
  }

  async checkRedis() {
    const startTime = Date.now();

    try {
      if (!this.redisClient) {
        this.redisClient = createClient({
          url: process.env.REDIS_URL
        });
        await this.redisClient.connect();
      }

      // 测试Redis
      await this.redisClient.ping();
      const duration = Date.now() - startTime;

      return {
        status: 'healthy',
        latency: duration,
        details: {
          connected: true
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        error: error.message
      };
    }
  }

  async checkDataService() {
    const startTime = Date.now();

    try {
      const response = await axios.get(
        `${process.env.DATA_SERVICE_URL}/health`,
        { timeout: 5000 }
      );

      const duration = Date.now() - startTime;

      return {
        status: response.data.status === 'healthy' ? 'healthy' : 'unhealthy',
        latency: duration,
        details: response.data
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        error: error.message
      };
    }
  }

  async checkAIService() {
    const startTime = Date.now();

    try {
      const response = await axios.get(
        `${process.env.AI_SERVICE_URL}/api/v1/health/`,
        { timeout: 5000 }
      );

      const duration = Date.now() - startTime;

      return {
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        latency: duration,
        details: response.data
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        error: error.message
      };
    }
  }

  async checkDiskSpace() {
    const fs = await import('fs/promises');

    try {
      const stats = await fs.statfs('/');
      const total = stats.blocks * stats.bsize;
      const free = stats.bfree * stats.bsize;
      const used = total - free;
      const usagePercent = (used / total) * 100;

      return {
        status: usagePercent < 90 ? 'healthy' : 'warning',
        details: {
          total: this.formatBytes(total),
          used: this.formatBytes(used),
          free: this.formatBytes(free),
          usagePercent: usagePercent.toFixed(2)
        }
      };
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message
      };
    }
  }

  async checkMemory() {
    const memoryUsage = process.memoryUsage();
    const usagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    return {
      status: usagePercent < 80 ? 'healthy' : 'warning',
      details: {
        heapUsed: this.formatBytes(memoryUsage.heapUsed),
        heapTotal: this.formatBytes(memoryUsage.heapTotal),
        rss: this.formatBytes(memoryUsage.rss),
        usagePercent: usagePercent.toFixed(2)
      }
    };
  }

  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }

  async performHealthCheck() {
    const checkPromises = Object.entries(this.checks).map(
      async ([name, checkFn]) => {
        try {
          const result = await checkFn();
          return { name, ...result };
        } catch (error) {
          return {
            name,
            status: 'error',
            error: error.message
          };
        }
      }
    );

    const results = await Promise.allSettled(checkPromises);
    const checks = results.map(result =>
      result.status === 'fulfilled' ? result.value : {
        name: 'unknown',
        status: 'error',
        error: result.reason?.message || 'Unknown error'
      }
    );

    const allHealthy = checks.every(check =>
      check.status === 'healthy' || check.status === 'warning'
    );
    const hasWarning = checks.some(check => check.status === 'warning');

    return {
      status: allHealthy ? (hasWarning ? 'warning' : 'healthy') : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: checks.reduce((acc, check) => {
        acc[check.name] = check;
        return acc;
      }, {}),
      system: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        pid: process.pid
      }
    };
  }
}

export const healthCheckService = new HealthCheckService();
```

#### 3.2 健康检查端点
```javascript
// src/routes/health.js
import express from 'express';
import { healthCheckService } from '../services/HealthCheckService.js';
import { metricsCollector } from '../utils/metricsCollector.js';

const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: 系统健康检查
 *     description: 检查系统所有依赖服务的健康状态
 *     tags:
 *       - 系统
 *     responses:
 *       200:
 *         description: 系统健康
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 checks:
 *                   type: object
 *                 system:
 *                   type: object
 *       503:
 *         description: 系统不健康
 */
router.get('/', async (req, res) => {
  try {
    const health = await healthCheckService.performHealthCheck();

    const statusCode = health.status === 'healthy' ? 200 :
                      health.status === 'warning' ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * @swagger
 * /health/metrics:
 *   get:
 *     summary: 系统指标
 *     description: 获取系统性能指标
 *     tags:
 *       - 系统
 *     responses:
 *       200:
 *         description: 指标数据
 */
router.get('/metrics', (req, res) => {
  const metrics = metricsCollector.getMetricsSnapshot();

  res.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    metrics
  });
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: 就绪检查
 *     description: 检查服务是否就绪接收流量
 *     tags:
 *       - 系统
 *     responses:
 *       200:
 *         description: 服务就绪
 *       503:
 *         description: 服务未就绪
 */
router.get('/ready', async (req, res) => {
  try {
    // 检查关键依赖
    const databaseHealth = await healthCheckService.checkDatabase();
    const redisHealth = await healthCheckService.checkRedis();

    const isReady = databaseHealth.status === 'healthy' &&
                   redisHealth.status === 'healthy';

    if (isReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: databaseHealth,
          redis: redisHealth
        }
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: 存活检查
 *     description: 检查服务是否存活
 *     tags:
 *       - 系统
 *     responses:
 *       200:
 *         description: 服务存活
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;
```

### 4. 请求追踪

#### 4.1 请求追踪中间件
```javascript
// src/middleware/tracingMiddleware.js
import { v4 as uuidv4 } from 'uuid';

class TracingMiddleware {
  constructor() {
    this.traces = new Map();
  }

  middleware() {
    return (req, res, next) => {
      // 生成追踪ID
      const traceId = req.headers['x-trace-id'] || uuidv4();
      const spanId = uuidv4();
      const parentSpanId = req.headers['x-parent-span-id'] || null;

      // 设置追踪头
      req.traceId = traceId;
      req.spanId = spanId;
      req.parentSpanId = parentSpanId;

      res.setHeader('X-Trace-ID', traceId);
      res.setHeader('X-Span-ID', spanId);

      // 创建追踪记录
      const trace = {
        traceId,
        spanId,
        parentSpanId,
        startTime: Date.now(),
        request: {
          method: req.method,
          url: req.originalUrl,
          headers: this.sanitizeHeaders(req.headers),
          ip: req.ip,
          userAgent: req.headers['user-agent']
        },
        spans: []
      };

      this.traces.set(spanId, trace);

      // 添加子span记录方法
      req.startSpan = (name, attributes = {}) => {
        const childSpanId = uuidv4();
        const span = {
          spanId: childSpanId,
          name,
          startTime: Date.now(),
          attributes
        };

        trace.spans.push(span);
        return childSpanId;
      };

      req.endSpan = (spanId, attributes = {}) => {
        const span = trace.spans.find(s => s.spanId === spanId);
        if (span) {
          span.endTime = Date.now();
          span.duration = span.endTime - span.startTime;
          Object.assign(span.attributes, attributes);
        }
      };

      // 监听响应完成
      res.on('finish', () => {
        trace.endTime = Date.now();
        trace.duration = trace.endTime - trace.startTime;
        trace.response = {
          statusCode: res.statusCode,
          headers: this.sanitizeHeaders(res.getHeaders())
        };

        // 记录追踪信息
        this.recordTrace(trace);

        // 清理（保留最近1000条）
        if (this.traces.size > 1000) {
          const oldestKey = this.traces.keys().next().value;
          this.traces.delete(oldestKey);
        }
      });

      next();
    };
  }

  sanitizeHeaders(headers) {
    const sanitized = { ...headers };

    // 移除敏感信息
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['x-api-key'];

    return sanitized;
  }

  recordTrace(trace) {
    // 记录到日志
    console.log(JSON.stringify({
      type: 'trace',
      ...trace
    }));

    // 发送到追踪系统（如Jaeger、Zipkin）
    // this.sendToTracingSystem(trace);
  }

  getTrace(spanId) {
    return this.traces.get(spanId);
  }

  searchTraces(criteria) {
    return Array.from(this.traces.values()).filter(trace => {
      if (criteria.traceId && trace.traceId !== criteria.traceId) return false;
      if (criteria.url && !trace.request.url.includes(criteria.url)) return false;
      if (criteria.minDuration && trace.duration < criteria.minDuration) return false;
      if (criteria.maxDuration && trace.duration > criteria.maxDuration) return false;
      if (criteria.startTime && trace.startTime < criteria.startTime) return false;
      if (criteria.endTime && trace.endTime > criteria.endTime) return false;
      return true;
    });
  }
}

export const tracingMiddleware = new TracingMiddleware();
```

## 实施步骤

### 阶段1：日志系统重构（1周）
1. **Winston集成**
   - 配置结构化日志
   - 添加日志轮转
   - 测试日志输出

2. **请求日志中间件**
   - 实现请求日志
   - 添加请求ID
   - 测试日志记录

### 阶段2：监控系统实现（1周）
3. **指标收集器**
   - 实现MetricsCollector
   - 添加性能指标
   - 测试指标收集

4. **健康检查服务**
   - 实现HealthCheckService
   - 添加依赖检查
   - 测试健康检查

### 阶段3：追踪和告警（1周）
5. **请求追踪**
   - 实现TracingMiddleware
   - 添加span管理
   - 测试追踪功能

6. **告警系统**
   - 设置告警规则
   - 集成告警渠道
   - 测试告警功能

### 阶段4：集成和优化（1周）
7. **系统集成**
   - 更新app.js配置
   - 集成所有中间件
   - 端到端测试

8. **性能优化**
   - 优化日志性能
   - 减少监控开销
   - 性能测试

## 监控仪表板建议

### 使用Prometheus + Grafana
1. **指标收集**：使用prom-client收集Node.js指标
2. **数据存储**：Prometheus时间序列数据库
3. **可视化**：Grafana仪表板
4. **告警**：Grafana告警规则

### 关键仪表板
1. **系统概览**：CPU、内存、磁盘、网络
2. **应用性能**：请求率、错误率、响应时间
3. **业务指标**：交易量、用户数、AI决策数
4. **依赖服务**：数据库、Redis、外部服务健康状态

## 成功指标

### 日志系统
1. **日志覆盖率**：100%关键操作
2. **日志查询时间**：<1秒（最近1小时）
3. **日志存储**：自动轮转，保留30天
4. **错误追踪**：100%错误可追踪

### 监控系统
1. **指标收集**：>95%关键指标
2. **监控延迟**：<60秒
3. **告警准确率**：>95%
4. **故障检测时间**：<5分钟

### 健康检查
1. **检查覆盖率**：100%关键依赖
2. **检查频率**：每30秒
3. **恢复检测**：<1分钟
4. **可用性计算**：准确率>99%

## 附录

### A. 环境变量配置
```bash
# 日志配置
LOG_LEVEL=info
LOG_FORMAT=json
LOG_DIR=./logs
LOG_RETENTION_DAYS=30

# 监控配置
METRICS_ENABLED=true
METRICS_PORT=9090
HEALTH_CHECK_INTERVAL=30000

# 追踪配置
TRACING_ENABLED=false
TRACING_SERVICE_NAME=stock-race-backend
JAEGER_ENDPOINT=http://jaeger:14268/api/traces

# 告警配置
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
ALERT_EMAIL_RECIPIENTS=team@example.com
```

### B. Docker监控配置
```dockerfile
# Docker健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health/live || exit 1

# 暴露监控端口
EXPOSE 3001 9090
```

### C. Kubernetes监控配置
```yaml
# Prometheus ServiceMonitor
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: stock-race-backend
spec:
  selector:
    matchLabels:
      app: stock-race-backend
  endpoints:
  - port: metrics
    interval: 30s
    path: /api/health/metrics
```

## 更新记录

| 日期 | 版本 | 更新内容 | 负责人 |
|------|------|----------|--------|
| 2026-02-04 | 1.0 | 创建监控和日志增强方案 | 后端模块智能体 |

## 联系方式
- 监控负责人：后端模块智能体
- 问题反馈：通过项目issue系统
- 紧急告警：项目协调主文档