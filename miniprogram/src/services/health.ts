// 服务健康检查 - C1-MP-001/002
// 检测 Backend 和 Market Data 服务可用性，提供服务降级提示

import { ref, computed } from 'vue'

// 服务类型
export type ServiceType = 'backend' | 'marketData' | 'websocket'

// 服务状态
export enum ServiceStatus {
  HEALTHY = 'healthy',       // 健康
  DEGRADED = 'degraded',     // 降级（可用但性能下降）
  UNAVAILABLE = 'unavailable', // 不可用
  CHECKING = 'checking',     // 检查中
}

// 服务健康信息
export interface ServiceHealth {
  type: ServiceType
  status: ServiceStatus
  latency: number           // 响应延迟（毫秒）
  lastCheckTime: number     // 最后检查时间
  errorMessage?: string     // 错误信息
  consecutiveFailures: number // 连续失败次数
}

// 健康检查配置
const HEALTH_CHECK_CONFIG = {
  // 检查间隔（毫秒）
  CHECK_INTERVAL: 30000,     // 30秒
  // 超时时间（毫秒）
  TIMEOUT: 5000,            // 5秒
  // 健康阈值
  HEALTHY_THRESHOLD: 3,     // 连续3次成功视为健康
  // 不健康阈值
  UNHEALTHY_THRESHOLD: 3,   // 连续3次失败视为不健康
  // 延迟阈值（毫秒）
  LATENCY_THRESHOLD: 1000,  // 超过1秒视为降级
}

// 服务健康状态（响应式）
const serviceHealthMap = ref<Map<ServiceType, ServiceHealth>>(new Map())
const isChecking = ref(false)
const lastGlobalCheckTime = ref(0)

/**
 * 检查单个服务健康状态
 */
async function checkService(type: ServiceType): Promise<ServiceHealth> {
  const startTime = Date.now()
  let status = ServiceStatus.CHECKING
  let errorMessage: string | undefined

  try {
    let url: string

    switch (type) {
      case 'backend':
        url = '/api/health'
        break
      case 'marketData':
        url = '/market-api/health'  // 需要通过代理
        break
      case 'websocket':
        // WebSocket 状态通过连接状态判断
        const { useMarketStore } = await import('@/stores/market')
        const marketStore = useMarketStore()
        status = marketStore.isWebSocketConnected
          ? ServiceStatus.HEALTHY
          : ServiceStatus.UNAVAILABLE
        return {
          type,
          status,
          latency: 0,
          lastCheckTime: Date.now(),
          consecutiveFailures: status === ServiceStatus.HEALTHY ? 0 : 1
        }
      default:
        throw new Error(`Unknown service type: ${type}`)
    }

    // 发送健康检查请求
    const response = await uni.request({
      url,
      method: 'GET',
      timeout: HEALTH_CHECK_CONFIG.TIMEOUT,
    })

    const latency = Date.now() - startTime

    if (response.statusCode === 200) {
      status = latency > HEALTH_CHECK_CONFIG.LATENCY_THRESHOLD
        ? ServiceStatus.DEGRADED
        : ServiceStatus.HEALTHY
    } else {
      status = ServiceStatus.UNAVAILABLE
      errorMessage = `HTTP ${response.statusCode}`
    }

    return {
      type,
      status,
      latency,
      lastCheckTime: Date.now(),
      errorMessage,
      consecutiveFailures: status === ServiceStatus.HEALTHY ? 0 : 1
    }
  } catch (error) {
    return {
      type,
      status: ServiceStatus.UNAVAILABLE,
      latency: Date.now() - startTime,
      lastCheckTime: Date.now(),
      errorMessage: error instanceof Error ? error.message : 'Network error',
      consecutiveFailures: 1
    }
  }
}

/**
 * 更新服务健康状态
 */
function updateServiceHealth(health: ServiceHealth): void {
  const existing = serviceHealthMap.value.get(health.type)

  if (existing) {
    // 累积连续失败次数
    if (health.status === ServiceStatus.UNAVAILABLE) {
      health.consecutiveFailures = existing.consecutiveFailures + 1
    }

    // 状态变更日志
    if (existing.status !== health.status) {
      console.log(`[HealthCheck] ${health.type} status changed: ${existing.status} -> ${health.status}`)
    }
  }

  serviceHealthMap.value.set(health.type, health)
}

/**
 * 执行全局健康检查
 */
async function checkAllServices(): Promise<Map<ServiceType, ServiceHealth>> {
  if (isChecking.value) {
    console.log('[HealthCheck] Already checking, skipping...')
    return serviceHealthMap.value
  }

  isChecking.value = true
  console.log('[HealthCheck] Starting health check...')

  try {
    const services: ServiceType[] = ['backend', 'marketData', 'websocket']

    const results = await Promise.all(
      services.map(async (type) => {
        const health = await checkService(type)
        updateServiceHealth(health)
        return health
      })
    )

    lastGlobalCheckTime.value = Date.now()

    console.log('[HealthCheck] Results:', results.map(r => ({
      type: r.type,
      status: r.status,
      latency: r.latency
    })))

    return serviceHealthMap.value
  } finally {
    isChecking.value = false
  }
}

/**
 * 获取服务健康状态
 */
function getServiceHealth(type: ServiceType): ServiceHealth | undefined {
  return serviceHealthMap.value.get(type)
}

/**
 * 检查所有服务是否健康
 */
const isAllHealthy = computed(() => {
  for (const health of serviceHealthMap.value.values()) {
    if (health.status === ServiceStatus.UNAVAILABLE) {
      return false
    }
  }
  return serviceHealthMap.value.size > 0
})

/**
 * 检查是否有服务降级
 */
const hasDegradedService = computed(() => {
  for (const health of serviceHealthMap.value.values()) {
    if (health.status === ServiceStatus.DEGRADED || health.status === ServiceStatus.UNAVAILABLE) {
      return true
    }
  }
  return false
})

/**
 * 获取降级提示信息
 */
const degradationMessage = computed(() => {
  const unavailableServices: string[] = []
  const degradedServices: string[] = []

  serviceHealthMap.value.forEach((health, type) => {
    const name = getServiceName(type)
    if (health.status === ServiceStatus.UNAVAILABLE) {
      unavailableServices.push(name)
    } else if (health.status === ServiceStatus.DEGRADED) {
      degradedServices.push(name)
    }
  })

  if (unavailableServices.length > 0) {
    return `${unavailableServices.join('、')} 服务暂时不可用，使用缓存数据显示`
  }

  if (degradedServices.length > 0) {
    return `${degradedServices.join('、')} 服务响应较慢，请耐心等待`
  }

  return null
})

/**
 * 获取服务显示名称
 */
function getServiceName(type: ServiceType): string {
  const names: Record<ServiceType, string> = {
    backend: '后端服务',
    marketData: '行情服务',
    websocket: '实时推送',
  }
  return names[type] || type
}

/**
 * 启动定时健康检查
 */
let checkIntervalId: number | null = null

function startHealthCheck(): void {
  console.log('[HealthCheck] Starting periodic health check...')

  // 立即执行一次
  checkAllServices()

  // 定时检查
  checkIntervalId = setInterval(() => {
    checkAllServices()
  }, HEALTH_CHECK_CONFIG.CHECK_INTERVAL) as unknown as number

  // 监听网络状态变化
  uni.onNetworkStatusChange((res) => {
    console.log('[HealthCheck] Network status changed:', res)
    if (res.isConnected) {
      // 网络恢复时立即检查
      checkAllServices()
    }
  })
}

/**
 * 停止定时健康检查
 */
function stopHealthCheck(): void {
  if (checkIntervalId) {
    clearInterval(checkIntervalId)
    checkIntervalId = null
    console.log('[HealthCheck] Stopped periodic health check')
  }
}

// 导出
export {
  serviceHealthMap,
  isChecking,
  lastGlobalCheckTime,
  isAllHealthy,
  hasDegradedService,
  degradationMessage,
  checkService,
  checkAllServices,
  getServiceHealth,
  getServiceName,
  startHealthCheck,
  stopHealthCheck,
  HEALTH_CHECK_CONFIG,
}

// 默认导出
export default {
  checkAllServices,
  startHealthCheck,
  stopHealthCheck,
  getServiceHealth,
}
