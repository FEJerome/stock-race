/**
 * 全局错误处理工具
 * 统一处理 API 错误并显示友好的错误提示
 */

import { ElMessage, ElNotification } from 'element-plus'

// 错误类型
export enum ErrorType {
  NETWORK = 'network',
  API = 'api',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown',
}

// 错误详情接口
export interface ErrorDetails {
  type: ErrorType
  message: string
  code?: number
  details?: unknown
}

/**
 * 解析错误并返回标准化的错误详情
 */
export function parseError(error: unknown): ErrorDetails {
  // 网络错误
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      type: ErrorType.NETWORK,
      message: '网络连接失败，请检查网络设置',
      details: error,
    }
  }

  // API 错误 (来自后端的标准格式)
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>

    // 后端返回的错误响应
    if (err.code !== undefined && err.message !== undefined) {
      return {
        type: ErrorType.API,
        message: String(err.message),
        code: Number(err.code),
        details: err,
      }
    }

    // HTTP 错误
    if (err.detail) {
      return {
        type: ErrorType.API,
        message: String(err.detail),
        code: err.status ? Number(err.status) : undefined,
        details: err,
      }
    }

    // 验证错误
    if (Array.isArray(err.errors)) {
      return {
        type: ErrorType.VALIDATION,
        message: '表单验证失败，请检查输入',
        details: err.errors,
      }
    }

    // Error 对象
    if (error instanceof Error) {
      return {
        type: ErrorType.UNKNOWN,
        message: error.message,
        details: error,
      }
    }
  }

  // 未知错误
  return {
    type: ErrorType.UNKNOWN,
    message: '发生未知错误，请稍后重试',
    details: error,
  }
}

/**
 * 显示错误提示 (使用 Element Plus Message)
 */
export function showError(error: unknown, options?: { duration?: number; showDetail?: boolean }): void {
  const details = parseError(error)
  const message = options?.showDetail && details.code
    ? `${details.message} (错误码: ${details.code})`
    : details.message

  ElMessage.error({
    message,
    duration: options?.duration ?? 5000,
    showClose: true,
  })
}

/**
 * 显示警告提示
 */
export function showWarning(message: string, options?: { duration?: number }): void {
  ElMessage.warning({
    message,
    duration: options?.duration ?? 3000,
    showClose: true,
  })
}

/**
 * 显示成功提示
 */
export function showSuccess(message: string, options?: { duration?: number }): void {
  ElMessage.success({
    message,
    duration: options?.duration ?? 3000,
  })
}

/**
 * 显示通知 (使用 Element Plus Notification)
 */
export function showNotification(
  title: string,
  message: string,
  type: 'success' | 'warning' | 'info' | 'error' = 'info'
): void {
  ElNotification({
    title,
    message,
    type,
    duration: 5000,
    position: 'top-right',
  })
}

/**
 * 处理 API 调用并自动处理错误
 */
export async function handleApiCall<T>(
  apiCall: () => Promise<T>,
  options?: {
    successMessage?: string
    errorMessage?: string
    showSuccess?: boolean
    showError?: boolean
    onSuccess?: (result: T) => void
    onError?: (error: ErrorDetails) => void
  }
): Promise<T | null> {
  try {
    const result = await apiCall()

    if (options?.showSuccess && options.successMessage) {
      showSuccess(options.successMessage)
    }

    options?.onSuccess?.(result)
    return result
  } catch (error) {
    const details = parseError(error)

    if (options?.showError !== false) {
      const message = options?.errorMessage || details.message
      showError({ ...details, message })
    }

    options?.onError?.(details)
    return null
  }
}

/**
 * 表单验证错误处理
 */
export function handleValidationErrors(errors: Record<string, string[]>): string {
  const messages = Object.entries(errors).map(([field, msgs]) => {
    const fieldName = getFieldLabel(field)
    return `${fieldName}: ${msgs.join(', ')}`
  })

  return messages.join('\n')
}

/**
 * 获取字段中文标签
 */
function getFieldLabel(field: string): string {
  const labelMap: Record<string, string> = {
    name: '名称',
    initial_capital: '初始资金',
    agent_level: '职级',
    incentive_level: '档位',
    model_name: 'AI 模型',
    risk_tolerance: '风险承受能力',
    holding_period: '持仓周期',
    sectors: '关注行业',
    position_limit: '仓位限制',
    stop_loss: '止损策略',
    market_scope: '市场范围',
  }
  return labelMap[field] || field
}

/**
 * 全局错误处理器 (可用于 Vue 的 errorHandler)
 */
export function globalErrorHandler(err: unknown, _instance: unknown, info: string): void {
  console.error('[Global Error]', err, info)

  const details = parseError(err)

  // 根据错误类型选择不同的提示方式
  if (details.type === ErrorType.NETWORK) {
    showNotification('网络错误', details.message, 'error')
  } else if (details.type === ErrorType.API) {
    showError(details)
  } else {
    showNotification('系统错误', details.message, 'error')
  }
}

/**
 * 创建带错误处理的异步函数包装器
 */
export function createErrorHandler<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options?: {
    errorMessage?: string
    showError?: boolean
  }
): (...args: Parameters<T>) => Promise<ReturnType<T> | null> {
  return async (...args: Parameters<T>): Promise<ReturnType<T> | null> => {
    try {
      return (await fn(...args)) as ReturnType<T>
    } catch (error) {
      if (options?.showError !== false) {
        showError(error, { showDetail: true })
      }
      return null
    }
  }
}
