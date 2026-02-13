/**
 * 健康检查服务单元测试
 *
 * 测试范围: 服务健康检查、状态管理
 *
 * @author Miniprogram开发团队
 * @date 2026-02-12
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock uni API
const mockUni = {
  request: vi.fn(),
}

// @ts-ignore
global.uni = mockUni

// 导入被测模块
import {
  checkHealth,
  startHealthCheck,
  stopHealthCheck,
  getStatusText,
  getStatusColor,
  resetHealthStatus,
  healthStatus,
  isAllHealthy,
  isAnyUnhealthy,
  type ServiceStatus,
} from '@/services/health'

describe('TC-HEALTH-001: 健康检查', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetHealthStatus()
  })

  afterEach(() => {
    stopHealthCheck()
  })

  it('应该正确检测服务健康状态', async () => {
    mockUni.request.mockResolvedValue({
      statusCode: 200,
      data: { status: 'ok' },
    })

    await checkHealth()

    expect(mockUni.request).toHaveBeenCalledTimes(2)
    expect(healthStatus.value.backend).toBe('healthy')
    expect(healthStatus.value.marketData).toBe('healthy')
    expect(isAllHealthy.value).toBe(true)
  })

  it('应该正确检测服务异常状态', async () => {
    mockUni.request
      .mockRejectedValueOnce(new Error('Backend error'))
      .mockResolvedValueOnce({
        statusCode: 200,
        data: { status: 'ok' },
      })

    await checkHealth()

    expect(healthStatus.value.backend).toBe('unhealthy')
    expect(healthStatus.value.marketData).toBe('healthy')
    expect(isAnyUnhealthy.value).toBe(true)
  })

  it('应该正确处理HTTP错误状态码', async () => {
    mockUni.request
      .mockResolvedValueOnce({
        statusCode: 500,
        data: { error: 'Internal Server Error' },
      })
      .mockResolvedValueOnce({
        statusCode: 503,
        data: { error: 'Service Unavailable' },
      })

    await checkHealth()

    expect(healthStatus.value.backend).toBe('unhealthy')
    expect(healthStatus.value.marketData).toBe('unhealthy')
  })
})

describe('TC-HEALTH-002: 定期检查', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetHealthStatus()
    vi.useFakeTimers()
  })

  afterEach(() => {
    stopHealthCheck()
    vi.useRealTimers()
  })

  it('应该定期执行健康检查', async () => {
    mockUni.request.mockResolvedValue({
      statusCode: 200,
      data: { status: 'ok' },
    })

    startHealthCheck()

    // 立即检查一次
    await vi.advanceTimersByTimeAsync(0)
    expect(mockUni.request).toHaveBeenCalledTimes(2)

    // 30秒后再次检查
    await vi.advanceTimersByTimeAsync(30000)
    expect(mockUni.request).toHaveBeenCalledTimes(4)
  })
})

describe('TC-HEALTH-003: 状态工具函数', () => {
  it('应该返回正确的状态文本', () => {
    expect(getStatusText('unknown')).toBe('未知')
    expect(getStatusText('checking')).toBe('检查中')
    expect(getStatusText('healthy')).toBe('正常')
    expect(getStatusText('unhealthy')).toBe('异常')
  })

  it('应该返回正确的状态颜色', () => {
    expect(getStatusColor('unknown')).toBe('#999')
    expect(getStatusColor('checking')).toBe('#1890FF')
    expect(getStatusColor('healthy')).toBe('#52C41A')
    expect(getStatusColor('unhealthy')).toBe('#FF4D4F')
  })
})

/**
 * 测试覆盖统计:
 *
 * 测试套件: 3个
 * - TC-HEALTH-001: 健康检查
 * - TC-HEALTH-002: 定期检查
 * - TC-HEALTH-003: 状态工具函数
 *
 * 测试用例: 6个
 * 预期结果: 全部通过
 */
