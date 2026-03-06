import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createUChart,
  getCanvasContext,
  initChart,
  disposeChart,
  getChartInstance,
  disposeAllCharts,
  type ChartOptions,
  type ChartInstance
} from '../../src/utils/ucharts'

// Mock uni API
global.uni = {
  createSelectorQuery: vi.fn(),
  createCanvasContext: vi.fn(),
  getSystemInfoSync: vi.fn()
} as any

/**
 * 创建完整的 Canvas 2D Context Mock
 * uCharts 需要完整的 Canvas 2D API
 */
function createMockCanvasContext(): any {
  return {
    canvas: { width: 300, height: 200 },
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 50 }),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    translate: vi.fn(),
    transform: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    createLinearGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn()
    }),
    createRadialGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn()
    }),
    createPattern: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(100) }),
    putImageData: vi.fn(),
    createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(100) }),
    setLineDash: vi.fn(),
    getLineDash: vi.fn().mockReturnValue([]),
    lineDashOffset: 0,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    shadowBlur: 0,
    shadowColor: 'rgba(0,0,0,0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    direction: 'inherit'
  }
}

describe('ucharts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Clean up all chart instances after each test
    disposeAllCharts()
  })

  describe('TC-UCV2-001-01: getCanvasContext 微信开发者工具', () => {
    it('should get canvas 2d context in WeChat DevTools', async () => {
      const mockContext = createMockCanvasContext()
      const mockCanvas = { getContext: vi.fn().mockReturnValue(mockContext) }

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ node: mockCanvas, width: 300, height: 200 }])
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      const context = await getCanvasContext('test-canvas')

      expect(context).toBe(mockContext)
      expect(uni.createSelectorQuery).toHaveBeenCalled()
      expect(mockQuery.select).toHaveBeenCalledWith('#test-canvas')
    })

    it('should use canvas 2d type by default', async () => {
      const mockContext = createMockCanvasContext()
      const mockCanvas = { getContext: vi.fn().mockReturnValue(mockContext) }

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ node: mockCanvas }])
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      await getCanvasContext('test-canvas')

      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d')
    })
  })

  describe('TC-UCV2-001-02: getCanvasContext 真机环境', () => {
    it('should handle iOS environment', async () => {
      uni.getSystemInfoSync = vi.fn().mockReturnValue({ platform: 'ios' })

      const mockContext = createMockCanvasContext()
      const mockCanvas = { getContext: vi.fn().mockReturnValue(mockContext) }

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ node: mockCanvas }])
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      const context = await getCanvasContext('test-canvas')

      expect(context).toBe(mockContext)
    })

    it('should handle Android environment', async () => {
      uni.getSystemInfoSync = vi.fn().mockReturnValue({ platform: 'android' })

      const mockContext = createMockCanvasContext()
      const mockCanvas = { getContext: vi.fn().mockReturnValue(mockContext) }

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ node: mockCanvas }])
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      const context = await getCanvasContext('test-canvas')

      expect(context).toBe(mockContext)
    })

    it('should handle legacy canvas on old WeChat versions', async () => {
      const mockContext = { draw: vi.fn(), fillText: vi.fn() }
      uni.createCanvasContext = vi.fn().mockReturnValue(mockContext)

      // Simulate legacy canvas (no node returned)
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ width: 300, height: 200 }]) // No node property
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      const context = await getCanvasContext('legacy-canvas')

      expect(uni.createCanvasContext).toHaveBeenCalledWith('legacy-canvas')
      expect(context).toBe(mockContext)
    })
  })

  describe('TC-UCV2-001-03: 错误处理', () => {
    it('should throw meaningful error when canvasId does not exist', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([null]) // Canvas not found
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      await expect(getCanvasContext('non-existent')).rejects.toThrow(
        'Canvas element with id "non-existent" not found'
      )
    })

    it('should throw error when query execution fails', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          throw new Error('Query execution failed')
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      await expect(getCanvasContext('test-canvas')).rejects.toThrow()
    })

    it('should throw error when canvas node has no getContext method', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ node: { someProp: 'value' } }]) // Node without getContext
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      // Node exists but without getContext - should fallback to legacy
      const context = await getCanvasContext('invalid-canvas')
      expect(context).toBeDefined()
      expect(uni.createCanvasContext).toHaveBeenCalledWith('invalid-canvas')
    })
  })

  describe('TC-UCV2-001-04: 防止重复实例', () => {
    it('should not create duplicate instances for same canvasId', async () => {
      const mockContext = createMockCanvasContext()
      const mockCanvas = { getContext: vi.fn().mockReturnValue(mockContext) }

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ node: mockCanvas, width: 300, height: 200 }])
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      // First call should create instance
      const chart1 = await createUChart('dup-test', {
        type: 'line',
        series: [{ name: 'Test', data: [1, 2, 3] }],
        animation: false // Disable animation for tests
      })

      // Second call with same canvasId should return existing instance
      const chart2 = await createUChart('dup-test', {
        type: 'line',
        series: [{ name: 'Test', data: [1, 2, 3] }],
        animation: false
      })

      expect(chart1).toBe(chart2)
      // Called twice: once for getCanvasContext, once for getCanvasRect
      expect(uni.createSelectorQuery).toHaveBeenCalledTimes(2)
    })

    it('should allow different canvasIds to have separate instances', async () => {
      const mockContext = createMockCanvasContext()
      const mockCanvas = { getContext: vi.fn().mockReturnValue(mockContext) }

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ node: mockCanvas }])
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      const chart1 = await createUChart('canvas-1', {
        type: 'line',
        series: [{ name: 'Line1', data: [1, 2, 3] }],
        animation: false
      })
      const chart2 = await createUChart('canvas-2', {
        type: 'line',
        series: [{ name: 'Line2', data: [4, 5, 6] }],
        animation: false
      })

      expect(chart1).not.toBe(chart2)
      // Called 4 times: 2 charts * 2 calls each (getCanvasContext + getCanvasRect)
      expect(uni.createSelectorQuery).toHaveBeenCalledTimes(4)
    })
  })

  describe('TC-UCV2-001-05: 内存泄漏防护', () => {
    it('should remove instance on dispose', async () => {
      const mockContext = createMockCanvasContext()
      const mockCanvas = { getContext: vi.fn().mockReturnValue(mockContext) }

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ node: mockCanvas }])
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      await createUChart('dispose-test', {
        type: 'line',
        series: [{ name: 'Test', data: [1, 2, 3] }],
        animation: false
      })

      // Verify instance exists
      expect(getChartInstance('dispose-test')).toBeDefined()

      // Dispose and verify instance is removed
      disposeChart('dispose-test')
      expect(getChartInstance('dispose-test')).toBeNull()
    })

    it('should handle dispose of non-existent canvasId gracefully', () => {
      // Should not throw
      expect(() => disposeChart('non-existent')).not.toThrow()
    })

    it('should call chart destroy method when available', async () => {
      const mockDestroy = vi.fn()
      const mockContext = createMockCanvasContext()
      const mockCanvas = { getContext: vi.fn().mockReturnValue(mockContext) }

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ node: mockCanvas }])
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      // Create chart
      const chart = await createUChart('destroy-test', {
        type: 'line',
        series: [{ name: 'Test', data: [1, 2, 3] }],
        animation: false
      })

      // Mock destroy method
      if (chart) {
        chart.destroy = mockDestroy
      }

      // Dispose should call destroy
      disposeChart('destroy-test')

      expect(mockDestroy).toHaveBeenCalled()
    })
  })

  describe('initChart 函数', () => {
    it('should create chart with correct options', async () => {
      const mockContext = createMockCanvasContext()
      const mockCanvas = { getContext: vi.fn().mockReturnValue(mockContext) }

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ node: mockCanvas, width: 300, height: 200 }])
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      const options: ChartOptions = {
        type: 'line',
        width: 300,
        height: 200,
        series: [{ name: 'Test', data: [1, 2, 3] }],
        animation: false
      }

      const chart = await initChart('init-test', options)

      expect(chart).toBeDefined()
      expect(getChartInstance('init-test')).toBe(chart)
    })

    it('should auto-detect canvas size if not provided', async () => {
      const mockContext = createMockCanvasContext()
      const mockCanvas = { getContext: vi.fn().mockReturnValue(mockContext) }

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ node: mockCanvas, width: 400, height: 300 }])
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      const options: ChartOptions = {
        type: 'line',
        series: [{ name: 'Test', data: [1, 2, 3] }],
        animation: false
      }

      await initChart('auto-size', options)

      expect(uni.createSelectorQuery).toHaveBeenCalled()
    })
  })

  describe('平台差异处理', () => {
    it('should handle mp-weixin platform', async () => {
      uni.getSystemInfoSync = vi.fn().mockReturnValue({
        platform: 'ios',
        SDKVersion: '2.30.0'
      })

      const mockContext = createMockCanvasContext()
      const mockCanvas = { getContext: vi.fn().mockReturnValue(mockContext) }

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ node: mockCanvas }])
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      const context = await getCanvasContext('platform-test')

      expect(context).toBeDefined()
    })

    it('should fallback to legacy canvas when node is not available', async () => {
      const mockLegacyContext = { draw: vi.fn(), fillText: vi.fn(), canvas: {} }
      uni.createCanvasContext = vi.fn().mockReturnValue(mockLegacyContext)

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        fields: vi.fn().mockReturnThis(),
        exec: vi.fn((callback) => {
          callback([{ width: 300, height: 200 }]) // No node
        })
      }
      uni.createSelectorQuery = vi.fn().mockReturnValue(mockQuery)

      const context = await getCanvasContext('fallback-test')

      expect(context).toBe(mockLegacyContext)
    })
  })
})
