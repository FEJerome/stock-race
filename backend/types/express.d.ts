/**
 * Express类型扩展
 */

import { User } from '@/models/User.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      authenticated?: boolean;
      requestId?: string;
      startTime?: number;
    }

    interface Response {
      success: (data?: any, message?: string, meta?: Record<string, any>) => void;
      paginated: (items: any[], pagination: any, message?: string, meta?: Record<string, any>) => void;
      error: (code: string, message: string, userMessage?: string, details?: any, httpStatus?: number) => void;

      // 预定义错误响应方法
      badRequest: (message?: string, details?: any) => void;
      unauthorized: (message?: string, details?: any) => void;
      forbidden: (message?: string, details?: any) => void;
      notFound: (resource?: string, details?: any) => void;
      methodNotAllowed: (method?: string, details?: any) => void;
      conflict: (message?: string, details?: any) => void;
      validationError: (errors?: any[], details?: any) => void;
      rateLimitExceeded: (message?: string, details?: any) => void;
      internalError: (message?: string, details?: any) => void;
      serviceUnavailable: (message?: string, details?: any) => void;

      // 业务错误
      stockNotFound: (stockCode?: string, details?: any) => void;
      insufficientBalance: (message?: string, details?: any) => void;
      insufficientShares: (message?: string, details?: any) => void;
      tradeLimitExceeded: (message?: string, details?: any) => void;
      marketClosed: (message?: string, details?: any) => void;
      aiServiceError: (message?: string, details?: any) => void;
      dataServiceError: (message?: string, details?: any) => void;
    }
  }
}

export {};