/**
 * 配置相关类型定义
 *
 * @author Miniprogram开发团队
 * @date 2026-02-11
 */

/**
 * 应用环境类型
 */
export type AppEnv = 'local' | 'dev' | 'prod'

/**
 * 环境配置对象
 */
export interface EnvConfig {
  /** 环境名称 */
  name: string
  /** 环境标识 */
  env: AppEnv
  /** 后端 API 基础 URL */
  apiBaseUrl: string
  /** AI 服务 URL */
  aiServiceUrl: string
  /** 数据服务 URL */
  dataServiceUrl: string
  /** WebSocket 基础 URL */
  wsBaseUrl: string
  /** 请求超时时间（毫秒） */
  requestTimeout: number
  /** 是否启用日志 */
  enableLog: boolean
  /** 是否启用 Mock 数据 */
  enableMock: boolean
  /** 功能开关 */
  features: {
    /** 启用微信登录 */
    enableWechatLogin: boolean
    /** 启用实时数据推送 */
    enableRealTimeData: boolean
    /** 启用游客模式 */
    enableGuestMode: boolean
  }
}

/**
 * 运行时配置（可动态修改）
 */
export interface RuntimeConfig {
  /** 是否开启调试模式 */
  debugMode: boolean
  /** 缓存过期时间倍数（用于测试） */
  cacheMultiplier: number
  /** 强制使用游客模式 */
  forceGuestMode: boolean
}
