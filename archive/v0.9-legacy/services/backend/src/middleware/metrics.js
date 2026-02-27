import MonitoringService from '../services/MonitoringService.js';

/**
 * 性能指标中间件
 * 收集API请求的性能指标
 */
const metricsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const originalEnd = res.end;

  // 记录请求开始
  const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 收集请求信息
  const requestInfo = {
    method: req.method,
    path: req.path,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent') || '',
    userId: req.user?.id || null,
    userRole: req.user?.role || null
  };

  // 重写res.end以记录响应时间
  res.end = function(...args) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const statusCode = res.statusCode;

    // 记录API性能指标
    MonitoringService.recordMetric('api.response_time', duration, {
      method: requestInfo.method,
      path: requestInfo.path,
      statusCode: statusCode.toString()
    }).catch(error => {
      console.error('记录API性能指标失败:', error);
    });

    // 记录请求计数
    MonitoringService.recordMetric('api.request_count', 1, {
      method: requestInfo.method,
      path: requestInfo.path,
      statusCode: statusCode.toString()
    }).catch(error => {
      console.error('记录请求计数失败:', error);
    });

    // 记录错误率（如果状态码 >= 400）
    if (statusCode >= 400) {
      MonitoringService.recordMetric('api.error_rate', 1, {
        method: requestInfo.method,
        path: requestInfo.path,
        statusCode: statusCode.toString()
      }).catch(error => {
        console.error('记录错误率失败:', error);
      });
    }

    // 调用原始end方法
    return originalEnd.apply(this, args);
  };

  next();
};

/**
 * 数据库性能指标中间件
 * 收集数据库查询性能指标
 */
const dbMetricsMiddleware = (prisma) => {
  return async (params, next) => {
    const startTime = Date.now();

    try {
      const result = await next(params);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // 记录数据库查询性能
      MonitoringService.recordMetric('database.query_time', duration, {
        model: params.model,
        action: params.action,
        success: true
      }).catch(error => {
        console.error('记录数据库查询性能失败:', error);
      });

      // 记录查询计数
      MonitoringService.recordMetric('database.query_count', 1, {
        model: params.model,
        action: params.action
      }).catch(error => {
        console.error('记录查询计数失败:', error);
      });

      return result;
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      // 记录失败的数据库查询
      MonitoringService.recordMetric('database.query_time', duration, {
        model: params.model,
        action: params.action,
        success: false,
        error: error.message
      }).catch(err => {
        console.error('记录失败查询性能失败:', err);
      });

      // 记录错误计数
      MonitoringService.recordMetric('database.error_count', 1, {
        model: params.model,
        action: params.action,
        error: error.message
      }).catch(err => {
        console.error('记录错误计数失败:', err);
      });

      throw error;
    }
  };
};

/**
 * 系统资源监控中间件
 * 定期收集系统资源使用情况
 */
const systemMetricsMiddleware = () => {
  let lastCollectionTime = 0;
  const collectionInterval = 60000; // 1分钟

  return async (req, res, next) => {
    const now = Date.now();

    // 定期收集系统资源指标
    if (now - lastCollectionTime >= collectionInterval) {
      lastCollectionTime = now;

      try {
        // 收集CPU使用率（模拟）
        const cpuUsage = Math.random() * 100;
        MonitoringService.recordMetric('cpu.usage', cpuUsage).catch(error => {
          console.error('记录CPU使用率失败:', error);
        });

        // 收集内存使用率（模拟）
        const memoryUsage = 40 + Math.random() * 30; // 40-70%
        MonitoringService.recordMetric('memory.usage', memoryUsage).catch(error => {
          console.error('记录内存使用率失败:', error);
        });

        // 收集磁盘使用率（模拟）
        const diskUsage = 30 + Math.random() * 20; // 30-50%
        MonitoringService.recordMetric('disk.usage', diskUsage).catch(error => {
          console.error('记录磁盘使用率失败:', error);
        });

        // 收集网络流量（模拟）
        const networkIn = Math.random() * 100;
        const networkOut = Math.random() * 50;
        MonitoringService.recordMetric('network.in', networkIn).catch(error => {
          console.error('记录网络流入失败:', error);
        });
        MonitoringService.recordMetric('network.out', networkOut).catch(error => {
          console.error('记录网络流出失败:', error);
        });

        // 收集活跃连接数（模拟）
        const activeConnections = 50 + Math.random() * 50; // 50-100
        MonitoringService.recordMetric('network.connections', activeConnections).catch(error => {
          console.error('记录活跃连接数失败:', error);
        });

        // 收集数据库连接数（模拟）
        const dbConnections = 20 + Math.random() * 10; // 20-30
        MonitoringService.recordMetric('database.connections', dbConnections).catch(error => {
          console.error('记录数据库连接数失败:', error);
        });

        // 清理旧数据（每天一次）
        if (now % (24 * 60 * 60 * 1000) < collectionInterval) {
          MonitoringService.cleanupOldData(30).catch(error => {
            console.error('清理旧数据失败:', error);
          });
        }
      } catch (error) {
        console.error('收集系统资源指标失败:', error);
      }
    }

    next();
  };
};

/**
 * 用户活动监控中间件
 * 记录用户操作活动
 */
const userActivityMiddleware = (req, res, next) => {
  // 只在认证请求中记录用户活动
  if (req.user) {
    const startTime = Date.now();
    const originalEnd = res.end;

    res.end = function(...args) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const statusCode = res.statusCode;

      // 记录用户活动
      const activity = {
        userId: req.user.id,
        username: req.user.username,
        action: req.method + ' ' + req.path,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent') || '',
        timestamp: new Date().toISOString(),
        duration,
        statusCode,
        success: statusCode < 400
      };

      // 这里可以将活动记录到数据库或日志系统
      // 目前只记录到控制台
      if (process.env.NODE_ENV === 'development') {
        console.log(`[用户活动] ${activity.username} ${activity.action} - ${duration}ms - ${statusCode}`);
      }

      // 记录到监控服务
      MonitoringService.recordMetric('user.activity', 1, {
        userId: activity.userId.toString(),
        action: activity.action,
        success: activity.success.toString()
      }).catch(error => {
        console.error('记录用户活动失败:', error);
      });

      return originalEnd.apply(this, args);
    };
  }

  next();
};

/**
 * 错误监控中间件
 * 记录应用错误
 */
const errorMonitoringMiddleware = (error, req, res, next) => {
  // 记录错误指标
  MonitoringService.recordMetric('app.error_count', 1, {
    path: req.path,
    method: req.method,
    errorType: error.name,
    errorMessage: error.message.substring(0, 100)
  }).catch(err => {
    console.error('记录错误指标失败:', err);
  });

  // 创建错误告警
  if (error.statusCode >= 500) {
    const alertRule = {
      id: 'app_error',
      name: '应用服务器错误',
      metric: 'app.error_count',
      condition: 'gt',
      threshold: 10, // 10分钟内超过10个错误
      level: 'critical',
      duration: 600 // 10分钟
    };

    MonitoringService.createAlert(alertRule, 1, {
      path: req.path,
      errorType: error.name
    }).catch(err => {
      console.error('创建错误告警失败:', err);
    });
  }

  next(error);
};

export {
  metricsMiddleware,
  dbMetricsMiddleware,
  systemMetricsMiddleware,
  userActivityMiddleware,
  errorMonitoringMiddleware
};