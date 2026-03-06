/**
 * 环境配置管理
 *
 * 支持多环境切换：local（本地）/ dev（联调）/ prod（生产）
 * 优先级：uniapp 环境变量 > 本地存储 > 默认配置
 *
 * @author Miniprogram开发团队
 * @date 2026-02-11
 */

import { AppEnv, EnvConfig } from '@/types/config'

// ============================================================================
// 环境配置定义
// ============================================================================

const envConfigs: Record<AppEnv, EnvConfig> = {
  /**
   * 本地开发环境
   * - 后端服务在本地 localhost:3001
   * - 使用本地 mock 数据或本地 Docker 服务
   */
  local: {
    name: '本地开发',
    env: 'local',
    apiBaseUrl: 'http://localhost:3001/api',
    aiServiceUrl: 'http://localhost:8000/api/v1',
    dataServiceUrl: 'http://localhost:8001',
    wsBaseUrl: 'ws://localhost:3001',
    requestTimeout: 30000,
    enableLog: true,
    enableMock: false,
    features: {
      enableWechatLogin: false,
      enableRealTimeData: false,
      enableGuestMode: true,
    },
  },

  /**
   * 联调测试环境
   * - 后端服务在 192.168.110.147
   * - 用于真机调试和功能联调
   */
  dev: {
    name: '联调环境',
    env: 'dev',
    apiBaseUrl: 'http://192.168.110.147:3001/api',
    aiServiceUrl: 'http://192.168.110.147:8000/api/v1',
    dataServiceUrl: 'http://192.168.110.147:8001',
    wsBaseUrl: 'ws://192.168.110.147:3001',
    requestTimeout: 30000,
    enableLog: true,
    enableMock: false,
    features: {
      enableWechatLogin: false,
      enableRealTimeData: true,
      enableGuestMode: true,
    },
  },

  /**
   * 生产环境
   * - 正式域名部署
   * - HTTPS/WSS 安全连接
   */
  prod: {
    name: '生产环境',
    env: 'prod',
    apiBaseUrl: 'https://api.stockrace.com/api',
    aiServiceUrl: 'https://ai.stockrace.com/api/v1',
    dataServiceUrl: 'https://data.stockrace.com',
    wsBaseUrl: 'wss://ws.stockrace.com',
    requestTimeout: 30000,
    enableLog: false,
    enableMock: false,
    features: {
      enableWechatLogin: true,
      enableRealTimeData: true,
      enableGuestMode: true,
    },
  },
}

// ============================================================================
// 环境检测与切换
// ============================================================================

const STORAGE_KEY = 'app_env'

/**
 * 获取当前环境
 * 优先级：编译时注入 > 本地存储 > 默认(local)
 */
export function getCurrentEnv(): AppEnv {
  // 1. 尝试从 uniapp 编译时注入的环境变量获取
  // 注意：小程序环境不支持 process.env，需要使用其他方式
  let buildEnv: AppEnv | undefined = undefined
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.VUE_APP_ENV) {
      // @ts-ignore
      buildEnv = process.env.VUE_APP_ENV as AppEnv
    }
  } catch (e) {
    // 忽略 process 未定义的错误
  }

  if (buildEnv && envConfigs[buildEnv]) {
    return buildEnv
  }

  // 2. 尝试从本地存储获取（用户手动切换的环境）
  try {
    const storedEnv = uni.getStorageSync(STORAGE_KEY) as AppEnv
    if (storedEnv && envConfigs[storedEnv]) {
      return storedEnv
    }
  } catch (e) {
    console.warn('Failed to read env from storage:', e)
  }

  // 3. 默认使用本地开发环境（Docker 服务在 localhost）
  return 'local'
}

/**
 * 获取当前环境配置
 */
export function getEnvConfig(): EnvConfig {
  const env = getCurrentEnv()
  return envConfigs[env]
}

/**
 * 切换到指定环境
 * @param env 目标环境
 */
export function switchEnv(env: AppEnv): void {
  if (!envConfigs[env]) {
    console.error(`Invalid env: ${env}`)
    uni.showToast({ title: '无效的环境配置', icon: 'none' })
    return
  }

  try {
    uni.setStorageSync(STORAGE_KEY, env)
    uni.showModal({
      title: '环境切换成功',
      content: `已切换到：${envConfigs[env].name}\n需要重启小程序生效`,
      showCancel: false,
      success: () => {
        // 重启小程序
        // @ts-ignore
        uni.reLaunch({ url: '/pages/index/index' })
      },
    })
  } catch (e) {
    console.error('Failed to switch env:', e)
    uni.showToast({ title: '切换失败', icon: 'none' })
  }
}

/**
 * 获取所有可用环境列表
 */
export function getAvailableEnvs(): { value: AppEnv; label: string; description: string }[] {
  return [
    {
      value: 'local',
      label: '本地开发',
      description: 'localhost:3001 - 本地开发调试',
    },
    {
      value: 'dev',
      label: '联调环境',
      description: '192.168.110.147 - 真机联调测试',
    },
    {
      value: 'prod',
      label: '生产环境',
      description: '正式域名 - 生产环境（勿用于开发）',
    },
  ]
}

// ============================================================================
// 便捷导出（保持向后兼容）
// ============================================================================

// 当前环境配置（默认导出）
const currentEnv = getEnvConfig()

export const {
  apiBaseUrl: API_BASE_URL,
  aiServiceUrl: AI_SERVICE_URL,
  dataServiceUrl: DATA_SERVICE_URL,
  wsBaseUrl: WS_BASE_URL,
  requestTimeout: REQUEST_TIMEOUT,
  enableLog: ENABLE_LOG,
  features: ENV_FEATURES,
} = currentEnv

// 导出环境标识
export const IS_LOCAL = currentEnv.env === 'local'
export const IS_DEV = currentEnv.env === 'dev'
export const IS_PROD = currentEnv.env === 'prod'

export default currentEnv
