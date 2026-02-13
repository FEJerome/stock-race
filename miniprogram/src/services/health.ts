/**
 * 服务健康检查模块
 * 对应架构文档: 001-CIRCULAR-DEPENDENCY.md, C1-MP-001
 *
 * 功能:
 * - Backend健康检查
 * - Market Data健康检查
 * - 服务状态管理
 * - 降级提示
 */

import { ref, computed } from 'vue'

// ==================== 配置 ====================

const BACKEND_HEALTH_URL = '/api/v1/public/health'
const MARKET_DATA_HEALTH_URL = '/health'
const CHECK_INTERVAL = 30000 // 30秒检查一次

// ==================== 类型定义 ====================

export type ServiceStatus = 'unknown' | 'healthy' | 'unhealthy' | 'checking'

export interface ServiceHealth {
  backend: ServiceStatus
  marketData: ServiceStatus
  lastCheckAt: number | null
  isChecking: boolean
}

export interface HealthCheckResult {
  service: 'backend' | 'marketData'
  status: ServiceStatus
  responseTime?: number
  error?: string
}

// ==================== 状态 ====================

const backendStatus = ref<ServiceStatus>('unknown')
const marketDataStatus = ref<ServiceStatus>('unknown')
const lastCheckAt = ref<number | null>(null)
const isChecking = ref(false)
const checkTimer = ref<number | null>(null)

// ==================== 计算属性 ====================

export const healthStatus = computed<ServiceHealth>(() => ({
  backend: backendStatus.value,
  marketData: marketDataStatus.value,
  lastCheckAt: lastCheckAt.value,
  isChecking: isChecking.value,
}))

export const isAllHealthy = computed(() =>
  backendStatus.value === 'healthy' && marketDataStatus.value === 'healthy'
)

export const isAnyUnhealthy = computed(() =>
  backendStatus.value === 'unhealthy' || marketDataStatus.value === 'unhealthy'
)

export const hasUnhealthyService = computed(() =>
  backendStatus.value === 'unhealthy' || marketDataStatus.value === 'unhealthy'
)

// ==================== 健康检查 ====================

/**
 * 检查Backend健康状态
 */
async function checkBackendHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now()

  try {
    const response = await uni.request({
      url: `${BACKEND_HEALTH_URL}`,
      method: 'GET',
      timeout: 5000,
    })

    const responseTime = Date.now() - startTime

    if (response.statusCode === 200) {
      return {
        service: 'backend',
        status: 'healthy',
        responseTime,
      }
    } else {
      return {
        service: 'backend',
        status: 'unhealthy',
        responseTime,
        error: `HTTP ${response.statusCode}`,
      }
    }
  } catch (error) {
    return {
      service: 'backend',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

/**
 * 检查Market Data健康状态
 */
async function checkMarketDataHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now()

  try {
    const response = await uni.request({
      url: `${MARKET_DATA_HEALTH_URL}`,
      method: 'GET',
      timeout: 5000,
    })

    const responseTime = Date.now() - startTime

    if (response.statusCode === 200) {
      return {
        service: 'marketData',
        status: 'healthy',
        responseTime,
      }
    } else {
      return {
        service: 'marketData',
        status: 'unhealthy',
        responseTime,
        error: `HTTP ${response.statusCode}`,
      }
    }
  } catch (error) {
    return {
      service: 'marketData',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

/**
 * 执行健康检查
 */
export async function checkHealth(): Promise<void> {
  if (isChecking.value) return

  isChecking.value = true

  console.log('[Health] Checking services...')

  // 同时检查两个服务
  const [backendResult, marketDataResult] = await Promise.all([
    checkBackendHealth(),
    checkMarketDataHealth(),
  ])

  // 更新状态
  backendStatus.value = backendResult.status
  marketDataStatus.value = marketDataResult.status
  lastCheckAt.value = Date.now()

  isChecking.value = false

  console.log('[Health] Check completed:', {
    backend: backendResult.status,
    marketData: marketDataResult.status,
  })
}

/**
 * 启动定期检查
 */
export function startHealthCheck(): void {
  // 立即检查一次
  checkHealth()

  // 定期检奎
  if (checkTimer.value) {
    clearInterval(checkTimer.value)
  }

  checkTimer.value = setInterval(() => {
    checkHealth()
  }, CHECK_INTERVAL) as unknown as number
}

/**
 * 停止定期检查
 */
export function stopHealthCheck(): void {
  if (checkTimer.value) {
    clearInterval(checkTimer.value)
    checkTimer.value = null
  }
}

// ==================== 工具函数 ====================

/**
 * 获取服务状态文本
 */
export function getStatusText(status: ServiceStatus): string {
  const texts: Record<ServiceStatus, string> = {
    unknown: '未知',
    checking: '检查中',
    healthy: '正常',
    unhealthy: '异常',
  }
  return texts[status]
}

/**
 * 获取服务状态颜色
 */
export function getStatusColor(status: ServiceStatus): string {
  const colors: Record<ServiceStatus, string> = {
    unknown: '#999',
    checking: '#1890FF',
    healthy: '#52C41A',
    unhealthy: '#FF4D4F',
  }
  return colors[status]
}

/**
 * 重置状态
 */
export function resetHealthStatus(): void {
  backendStatus.value = 'unknown'
  marketDataStatus.value = 'unknown'
  lastCheckAt.value = null
}
