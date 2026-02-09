/**
 * 统一的API响应格式化工具
 * 提供标准化的成功响应、错误响应、分页响应等格式
 */

/**
 * 标准成功响应
 * @param {Object} data - 响应数据
 * @param {string} message - 成功消息
 * @param {Object} meta - 元数据
 * @returns {Object} 标准成功响应对象
 */
export const successResponse = (data = null, message = '操作成功', meta = {}) => {
  return {
    success: true,
    data,
    message,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
};

/**
 * 分页成功响应
 * @param {Array} items - 数据项数组
 * @param {Object} pagination - 分页信息
 * @param {string} message - 成功消息
 * @param {Object} meta - 元数据
 * @returns {Object} 分页成功响应对象
 */
export const paginatedResponse = (items, pagination, message = '获取数据成功', meta = {}) => {
  return successResponse(
    {
      items,
      pagination: {
        page: pagination.page || 1,
        limit: pagination.limit || items.length,
        total: pagination.total || items.length,
        totalPages: pagination.totalPages || 1,
        hasNext: pagination.hasNext || false,
        hasPrev: pagination.hasPrev || false
      }
    },
    message,
    meta
  );
};

/**
 * 标准错误响应
 * @param {string} code - 错误代码
 * @param {string} message - 错误消息
 * @param {string} userMessage - 用户友好的错误消息
 * @param {Object} details - 错误详情
 * @param {number} httpStatus - HTTP状态码
 * @returns {Object} 标准错误响应对象
 */
export const errorResponse = (
  code = 'INTERNAL_ERROR',
  message = '服务器内部错误',
  userMessage = '操作失败，请稍后重试',
  details = null,
  httpStatus = 500
) => {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString()
    },
    message: userMessage,
    meta: {
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * 预定义的错误响应
 */
export const predefinedErrors = {
  // 400系列错误
  BAD_REQUEST: (message = '请求参数错误', details = null) =>
    errorResponse('BAD_REQUEST', message, '请求参数不正确，请检查后重试', details, 400),

  UNAUTHORIZED: (message = '未授权访问', details = null) =>
    errorResponse('UNAUTHORIZED', message, '请先登录后再进行操作', details, 401),

  FORBIDDEN: (message = '权限不足', details = null) =>
    errorResponse('FORBIDDEN', message, '您没有权限执行此操作', details, 403),

  NOT_FOUND: (resource = '资源', details = null) =>
    errorResponse('NOT_FOUND', `${resource}不存在`, `找不到请求的${resource}`, details, 404),

  METHOD_NOT_ALLOWED: (method = '', details = null) =>
    errorResponse('METHOD_NOT_ALLOWED', `方法 ${method} 不被允许`, '请求方法不正确', details, 405),

  CONFLICT: (message = '资源冲突', details = null) =>
    errorResponse('CONFLICT', message, '操作冲突，请检查后重试', details, 409),

  VALIDATION_ERROR: (errors = [], details = null) =>
    errorResponse('VALIDATION_ERROR', '数据验证失败', '输入数据不符合要求', { errors, ...details }, 422),

  RATE_LIMIT_EXCEEDED: (message = '请求频率限制', details = null) =>
    errorResponse('RATE_LIMIT_EXCEEDED', message, '请求过于频繁，请稍后再试', details, 429),

  // 500系列错误
  INTERNAL_ERROR: (message = '服务器内部错误', details = null) =>
    errorResponse('INTERNAL_ERROR', message, '服务器内部错误，请稍后重试', details, 500),

  SERVICE_UNAVAILABLE: (message = '服务不可用', details = null) =>
    errorResponse('SERVICE_UNAVAILABLE', message, '服务暂时不可用，请稍后重试', details, 503),

  // 业务错误
  STOCK_NOT_FOUND: (stockCode = '', details = null) =>
    errorResponse('STOCK_NOT_FOUND', `股票 ${stockCode} 不存在`, `找不到股票 ${stockCode}`, details, 404),

  INSUFFICIENT_BALANCE: (message = '余额不足', details = null) =>
    errorResponse('INSUFFICIENT_BALANCE', message, '账户余额不足，无法完成交易', details, 400),

  INSUFFICIENT_SHARES: (message = '持股数量不足', details = null) =>
    errorResponse('INSUFFICIENT_SHARES', message, '持股数量不足，无法卖出', details, 400),

  TRADE_LIMIT_EXCEEDED: (message = '交易限制', details = null) =>
    errorResponse('TRADE_LIMIT_EXCEEDED', message, '交易数量超过限制', details, 400),

  MARKET_CLOSED: (message = '市场已收盘', details = null) =>
    errorResponse('MARKET_CLOSED', message, '当前非交易时间，无法进行交易', details, 400),

  AI_SERVICE_ERROR: (message = 'AI服务错误', details = null) =>
    errorResponse('AI_SERVICE_ERROR', message, 'AI服务暂时不可用，请稍后重试', details, 503),

  DATA_SERVICE_ERROR: (message = '数据服务错误', details = null) =>
    errorResponse('DATA_SERVICE_ERROR', message, '数据服务暂时不可用，请稍后重试', details, 503)
};

/**
 * 创建自定义错误响应
 * @param {Object} options - 错误选项
 * @returns {Function} 错误响应创建函数
 */
export const createCustomError = (options) => {
  const {
    code,
    message,
    userMessage,
    httpStatus = 500,
    defaultDetails = null
  } = options;

  return (customMessage = message, details = defaultDetails) =>
    errorResponse(code, customMessage, userMessage, details, httpStatus);
};

/**
 * 响应格式化中间件
 * 为res对象添加标准响应方法
 */
export const responseFormatterMiddleware = (req, res, next) => {
  // 成功响应方法
  res.success = (data = null, message = '操作成功', meta = {}) => {
    return res.json(successResponse(data, message, meta));
  };

  // 分页响应方法
  res.paginated = (items, pagination, message = '获取数据成功', meta = {}) => {
    return res.json(paginatedResponse(items, pagination, message, meta));
  };

  // 错误响应方法
  res.error = (code, message, userMessage, details, httpStatus = 500) => {
    const error = errorResponse(code, message, userMessage, details, httpStatus);
    return res.status(httpStatus).json(error);
  };

  // 预定义错误响应方法
  Object.keys(predefinedErrors).forEach(errorKey => {
    res[errorKey.toLowerCase()] = (...args) => {
      const error = predefinedErrors[errorKey](...args);
      const httpStatus = error.error.code === 'INTERNAL_ERROR' ? 500 :
                        error.error.code === 'NOT_FOUND' ? 404 :
                        error.error.code === 'BAD_REQUEST' ? 400 :
                        error.error.code === 'UNAUTHORIZED' ? 401 :
                        error.error.code === 'FORBIDDEN' ? 403 : 500;
      return res.status(httpStatus).json(error);
    };
  });

  next();
};

/**
 * 异步控制器包装器
 * 自动处理控制器方法的错误
 * @param {Function} fn - 控制器函数
 * @returns {Function} 包装后的控制器函数
 */
export const asyncHandler = (fn) => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      console.error('控制器错误:', error);

      // 如果是已知的业务错误
      if (error.code && error.message) {
        return res.status(error.httpStatus || 500).json(
          errorResponse(
            error.code,
            error.message,
            error.userMessage || '操作失败，请稍后重试',
            error.details,
            error.httpStatus || 500
          )
        );
      }

      // 未知错误
      return res.internal_error(error.message, { stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
    }
  };
};

/**
 * 验证错误格式化
 * @param {Array} validationErrors - express-validator错误数组
 * @returns {Array} 格式化后的错误数组
 */
export const formatValidationErrors = (validationErrors) => {
  return validationErrors.array().map(err => ({
    field: err.path,
    message: err.msg,
    value: err.value,
    location: err.location
  }));
};

export default {
  successResponse,
  paginatedResponse,
  errorResponse,
  predefinedErrors,
  createCustomError,
  responseFormatterMiddleware,
  asyncHandler,
  formatValidationErrors
};