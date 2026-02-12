/**
 * 环境配置单元测试
 *
 * 测试目标：验证多环境配置管理功能
 * 测试范围：环境切换、配置获取、持久化
 *
 * @author Miniprogram开发团队
 * @date 2026-02-11
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getCurrentEnv,
  getEnvConfig,
  switchEnv,
  getAvailableEnvs,
} from '@/config/env'
import type { AppEnv } from '@/types/config'

// ============================================================================
// Mock uni API
// ============================================================================

const mockStorage: Record<string, any> = {}

const mockUni = {
  getStorageSync: vi.fn((key: string) => mockStorage[key]),
  setStorageSync: vi.fn((key: string, value: any) => {
    mockStorage[key] = value
  }),
  showModal: vi.fn(),
  showToast: vi.fn(),
  reLaunch: vi.fn(),
}

// @ts-ignore
global.uni = mockUni

// 清理存储
const clearStorage = () => {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key])
}

// ============================================================================
// 测试套件: 环境配置
// ============================================================================

describe('TC-ENV-001: 获取当前环境', () => {
  beforeEach(() => {
    clearStorage()
    vi.clearAllMocks()
  })

  it('应该返回默认值 local 当没有存储配置时', () => {
    const env = getCurrentEnv()
    expect(env).toBe('local')
  })

  it('应该从本地存储读取环境配置', () => {
    mockStorage['app_env'] = 'dev'
    const env = getCurrentEnv()
    expect(env).toBe('dev')
    expect(mockUni.getStorageSync).toHaveBeenCalledWith('app_env')
  })

  it('应该返回 local 当存储的值无效时', () => {
    mockStorage['app_env'] = 'invalid_env'
    const env = getCurrentEnv()
    expect(env).toBe('local')
  })
})

describe('TC-ENV-002: 获取环境配置', () => {
  beforeEach(() => {
    clearStorage()
  })

  it('应该返回 local 环境的完整配置', () => {
    mockStorage['app_env'] = 'local'
    const config = getEnvConfig()

    expect(config.env).toBe('local')
    expect(config.apiBaseUrl).toBe('http://localhost:3001/api')
    expect(config.wsBaseUrl).toBe('ws://localhost:3001')
    expect(config.enableLog).toBe(true)
    expect(config.features.enableGuestMode).toBe(true)
  })

  it('应该返回 dev 环境的完整配置', () => {
    mockStorage['app_env'] = 'dev'
    const config = getEnvConfig()

    expect(config.env).toBe('dev')
    expect(config.apiBaseUrl).toBe('http://192.168.110.147:3001/api')
    expect(config.wsBaseUrl).toBe('ws://192.168.110.147:3001')
    expect(config.enableLog).toBe(true)
    expect(config.features.enableRealTimeData).toBe(true)
  })

  it('应该返回 prod 环境的完整配置', () => {
    mockStorage['app_env'] = 'prod'
    const config = getEnvConfig()

    expect(config.env).toBe('prod')
    expect(config.apiBaseUrl).toBe('https://api.stockrace.com/api')
    expect(config.wsBaseUrl).toBe('wss://ws.stockrace.com')
    expect(config.enableLog).toBe(false)
  })
})

describe('TC-ENV-003: 切换环境', () => {
  beforeEach(() => {
    clearStorage()
    vi.clearAllMocks()
  })

  it('应该成功切换到 dev 环境', () => {
    switchEnv('dev')

    expect(mockUni.setStorageSync).toHaveBeenCalledWith('app_env', 'dev')
    expect(mockUni.showModal).toHaveBeenCalled()
  })

  it('应该成功切换到 prod 环境', () => {
    switchEnv('prod')

    expect(mockUni.setStorageSync).toHaveBeenCalledWith('app_env', 'prod')
    expect(mockUni.showModal).toHaveBeenCalled()
  })

  it('应该拒绝无效的环境切换', () => {
    switchEnv('invalid' as AppEnv)

    expect(mockUni.setStorageSync).not.toHaveBeenCalled()
    expect(mockUni.showToast).toHaveBeenCalledWith({
      title: '无效的环境配置',
      icon: 'none',
    })
  })
})

describe('TC-ENV-004: 获取可用环境列表', () => {
  it('应该返回所有可用的环境选项', () => {
    const envs = getAvailableEnvs()

    expect(envs).toHaveLength(3)
    expect(envs.map((e) => e.value)).toContain('local')
    expect(envs.map((e) => e.value)).toContain('dev')
    expect(envs.map((e) => e.value)).toContain('prod')
  })

  it('应该包含正确的环境描述信息', () => {
    const envs = getAvailableEnvs()

    const devEnv = envs.find((e) => e.value === 'dev')
    expect(devEnv?.label).toBe('联调环境')
    expect(devEnv?.description).toContain('192.168.110.147')
  })
})

describe('TC-ENV-005: 环境配置一致性', () => {
  it('所有环境配置应该包含必需的字段', () => {
    const envs: AppEnv[] = ['local', 'dev', 'prod']

    envs.forEach((env) => {
      mockStorage['app_env'] = env
      const config = getEnvConfig()

      expect(config).toHaveProperty('name')
      expect(config).toHaveProperty('env')
      expect(config).toHaveProperty('apiBaseUrl')
      expect(config).toHaveProperty('aiServiceUrl')
      expect(config).toHaveProperty('dataServiceUrl')
      expect(config).toHaveProperty('wsBaseUrl')
      expect(config).toHaveProperty('requestTimeout')
      expect(config).toHaveProperty('enableLog')
      expect(config).toHaveProperty('enableMock')
      expect(config).toHaveProperty('features')
      expect(config.features).toHaveProperty('enableWechatLogin')
      expect(config.features).toHaveProperty('enableRealTimeData')
      expect(config.features).toHaveProperty('enableGuestMode')
    })
  })
})

// ============================================================================
// 测试报告统计
// ============================================================================

/**
 * 测试覆盖统计:
 *
 * 测试套件: 5个
 * - TC-ENV-001: 获取当前环境
 * - TC-ENV-002: 获取环境配置
 * - TC-ENV-003: 切换环境
 * - TC-ENV-004: 获取可用环境列表
 * - TC-ENV-005: 环境配置一致性
 *
 * 测试用例: 10个
 * 预期结果: 全部通过
 */
