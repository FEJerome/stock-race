/**
 * 统一的错误处理中间件
 * 集中处理所有异常，包括404错误、500错误、验证错误等
 */

import { validationResult } from 'express-validator';
import { predefinedErrors, formatValidationErrors } from '../utils/responseFormatter.js';

/**
 * 自定义错误类
 */
export class AppError extends Error {
  constructor(code, message, userMessage, details = null, httpStatus = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.details = details;
    this.httpStatus = httpStatus;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 业务错误类
 */
export class BusinessError extends AppError {
  constructor(code, message, userMessage, details = null) {
    super(code, message, userMessage, details, 400);
    this.name = 'BusinessError';
  }
}

/**
 * 验证错误类
 */
export class ValidationError extends AppError {
  constructor(errors, message = '数据验证失败') {
    super('VALIDATION_ERROR', message, '输入数据不符合要求', { errors }, 422);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * 认证错误类
 */
export class AuthenticationError extends AppError {
  constructor(message = '认证失败') {
    super('UNAUTHORIZED', message, '请先登录后再进行操作', null, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * 授权错误类
 */
export class AuthorizationError extends AppError {
  constructor(message = '权限不足') {
    super('FORBIDDEN', message, '您没有权限执行此操作', null, 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * 资源未找到错误类
 */
export class NotFoundError extends AppError {
  constructor(resource = '资源', details = null) {
    super('NOT_FOUND', `${resource}不存在`, `找不到请求的${resource}`, details, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * 冲突错误类
 */
export class ConflictError extends AppError {
  constructor(message = '资源冲突', details = null) {
    super('CONFLICT', message, '操作冲突，请检查后重试', details, 409);
    this.name = 'ConflictError';
  }
}

/**
 * 速率限制错误类
 */
export class RateLimitError extends AppError {
  constructor(message = '请求频率限制') {
    super('RATE_LIMIT_EXCEEDED', message, '请求过于频繁，请稍后再试', null, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * 验证中间件
 * 处理express-validator验证结果
 */
export const validateRequest = (validations) => {
  return async (req, res, next) => {
    // 执行所有验证
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // 格式化验证错误
    const formattedErrors = formatValidationErrors(errors);
    return next(new ValidationError(formattedErrors));
  };
};

/**
 * 404错误处理中间件
 */
export const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`端点 ${req.originalUrl}`);
  next(error);
};

/**
 * 全局错误处理中间件
 */
export const globalErrorHandler = (err, req, res, next) => {
  // 设置默认值
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // 开发环境日志
  if (process.env.NODE_ENV === 'development') {
    console.error('错误详情:', {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      details: err.details,
      httpStatus: err.httpStatus
    });
  }

  // 生产环境日志（简化）
  if (process.env.NODE_ENV === 'production') {
    console.error('错误:', {
      name: err.name,
      message: err.message,
      code: err.code,
      path: req.path,
      method: req.method
    });
  }

  // 处理不同类型的错误
  if (err.name === 'ValidationError') {
    // express-validator验证错误
    return res.status(422).json(predefinedErrors.VALIDATION_ERROR(err.errors));
  }

  if (err.name === 'JsonWebTokenError') {
    // JWT错误
    return res.status(401).json(predefinedErrors.UNAUTHORIZED('无效的令牌'));
  }

  if (err.name === 'TokenExpiredError') {
    // JWT过期错误
    return res.status(401).json(predefinedErrors.UNAUTHORIZED('令牌已过期'));
  }

  if (err.name === 'SyntaxError' && err.type === 'entity.parse.failed') {
    // JSON解析错误
    return res.status(400).json(predefinedErrors.BAD_REQUEST('无效的JSON格式'));
  }

  if (err.code === 'P2002') {
    // Prisma唯一约束错误
    return res.status(409).json(predefinedErrors.CONFLICT('数据已存在'));
  }

  if (err.code === 'P2025') {
    // Prisma记录未找到错误
    return res.status(404).json(predefinedErrors.NOT_FOUND('记录'));
  }

  // 处理自定义错误
  if (err instanceof AppError) {
    return res.status(err.httpStatus).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        timestamp: new Date().toISOString()
      },
      message: err.userMessage,
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  }

  // 处理MongoDB错误
  if (err.name === 'CastError') {
    return res.status(400).json(predefinedErrors.BAD_REQUEST(`无效的 ${err.path}: ${err.value}`));
  }

  if (err.code === 11000) {
    // MongoDB重复键错误
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    return res.status(409).json(predefinedErrors.CONFLICT(`${field} '${value}' 已存在`));
  }

  // 未知错误
  const errorResponse = predefinedErrors.INTERNAL_ERROR(
    process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误',
    process.env.NODE_ENV === 'development' ? { stack: err.stack } : null
  );

  return res.status(500).json(errorResponse);
};

/**
 * 异步错误包装器
 * 捕获异步函数中的错误并传递给错误处理中间件
 * @param {Function} fn - 异步函数
 * @returns {Function} 包装后的函数
 */
export const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * 处理未捕获的异常
 */
export const handleUncaughtExceptions = () => {
  process.on('uncaughtException', (err) => {
    console.error('未捕获的异常:', err);

    // 记录到日志系统（在实际应用中）
    // logger.error('Uncaught Exception', err);

    // 优雅关闭
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);

    // 记录到日志系统（在实际应用中）
    // logger.error('Unhandled Rejection', { reason, promise });

    // 在实际应用中，这里可能需要更复杂的处理
    // 但对于开发环境，我们可以记录并继续运行
    if (process.env.NODE_ENV === 'production') {
      // 生产环境中可能需要重启服务
      process.exit(1);
    }
  });
};

export default {
  AppError,
  BusinessError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  validateRequest,
  notFoundHandler,
  globalErrorHandler,
  catchAsync,
  handleUncaughtExceptions
};