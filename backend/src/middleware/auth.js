import { authService } from '../services/AuthService.js';

/**
 * 认证中间件
 * 验证JWT令牌并将用户信息添加到请求对象
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_001',
          message: '缺少认证令牌'
        },
        message: '请先登录'
      });
    }

    const token = authHeader.substring(7);
    const result = await authService.validateRequest(authHeader);

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_001',
          message: result.message
        },
        message: result.message
      });
    }

    // 将用户信息添加到请求对象
    req.user = result.user;
    req.token = token;

    next();
  } catch (error) {
    console.error('认证中间件错误:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      },
      message: '认证失败，请稍后重试'
    });
  }
};

/**
 * 可选认证中间件
 * 如果提供了令牌则验证，否则继续执行
 */
export const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const result = await authService.validateRequest(authHeader);

      if (result.valid) {
        req.user = result.user;
        req.token = token;
        req.authenticated = true;
      } else {
        req.authenticated = false;
      }
    } else {
      req.authenticated = false;
    }

    next();
  } catch (error) {
    console.error('可选认证中间件错误:', error);
    req.authenticated = false;
    next();
  }
};

/**
 * 权限检查中间件
 * @param {string|string[]} permissions - 需要的权限
 */
export const checkPermission = (permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
      const userId = req.user.id;

      // 检查每个需要的权限
      for (const permission of requiredPermissions) {
        const hasPermission = await authService.checkPermission(userId, permission);

        if (!hasPermission) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'AUTH_003',
              message: '权限不足'
            },
            message: `需要权限: ${permission}`
          });
        }
      }

      next();
    } catch (error) {
      console.error('权限检查中间件错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '权限检查失败，请稍后重试'
      });
    }
  };
};

/**
 * 角色检查中间件
 * @param {string|string[]} roles - 需要的角色
 */
export const checkRole = (roles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      const requiredRoles = Array.isArray(roles) ? roles : [roles];

      // 简化版：检查用户是否为管理员
      // 在实际应用中，这里应该检查用户的角色
      const isAdmin = req.user.username === 'admin';

      if (requiredRoles.includes('admin') && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '需要管理员权限'
        });
      }

      next();
    } catch (error) {
      console.error('角色检查中间件错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '角色检查失败，请稍后重试'
      });
    }
  };
};

/**
 * 会话验证中间件
 * 验证会话ID（如果提供）
 */
export const validateSession = async (req, res, next) => {
  try {
    const sessionId = req.headers['x-session-id'] || req.body.sessionId;

    if (sessionId) {
      // 这里可以添加会话验证逻辑
      // 例如：检查会话是否有效、是否过期等
      req.sessionId = sessionId;
    }

    next();
  } catch (error) {
    console.error('会话验证中间件错误:', error);
    next();
  }
};

/**
 * 请求日志中间件
 * 记录认证相关的请求信息
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;

  res.send = function (body) {
    const duration = Date.now() - startTime;
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      userId: req.user?.id || 'anonymous',
      authenticated: req.authenticated || false
    };

    // 记录认证相关请求
    if (req.originalUrl.includes('/api/auth/')) {
      console.log('认证请求日志:', logData);
    }

    originalSend.call(this, body);
  };

  next();
};

/**
 * 错误处理中间件
 * 处理认证相关的错误
 */
export const errorHandler = (err, req, res, next) => {
  console.error('认证错误处理:', err);

  // JWT相关错误
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_001',
        message: '令牌无效'
      },
      message: '认证令牌无效'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_002',
        message: '令牌已过期'
      },
      message: '认证令牌已过期，请重新登录'
    });
  }

  // 权限相关错误
  if (err.code === 'AUTH_003') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'AUTH_003',
        message: err.message || '权限不足'
      },
      message: '权限不足'
    });
  }

  // 传递给下一个错误处理中间件
  next(err);
};

export default {
  authenticate,
  optionalAuthenticate,
  checkPermission,
  checkRole,
  validateSession,
  requestLogger,
  errorHandler
};