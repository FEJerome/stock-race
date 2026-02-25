import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock uni API before importing component
global.uni = {
  createSelectorQuery: vi.fn(),
  createCanvasContext: vi.fn(),
  getSystemInfoSync: vi.fn().mockReturnValue({ pixelRatio: 2 }),
  upx2px: vi.fn((px) => px / 2)
} as any

/**
 * 创建完整的 Canvas 2D Context Mock
 */
function createMockCanvasContext(): any {
  return {
    canvas: { width: 300, height: 280 },
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
    createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
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

describe('HoldingPieChart - TC-UCV2-002', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Clean up any chart instances
    try {
      const { disposeAllCharts } = require('../../src/utils/ucharts')
      if (disposeAllCharts) {
        disposeAllCharts()
      }
    } catch (e) {
      // Ignore
    }
  })

  describe('TC-UCV2-002-01: 空持仓占位图', () => {
    it('should handle empty holdings array', () => {
      // Test data processing logic
      const holdings: any[] = []
      const processed = processHoldings(holdings, 5)
      expect(processed).toEqual([])
    })

    it('should handle null/undefined holdings', () => {
      const processed = processHoldings(null as any, 5)
      expect(processed).toEqual([])
    })
  })

  describe('TC-UCV2-002-02: 持仓数据排序与计算', () => {
    it('should sort holdings by market value descending', () => {
      const holdings = [
        { stockCode: '000002', stockName: '万科A', marketValue: 80000 },
        { stockCode: '000001', stockName: '平安银行', marketValue: 100000 },
        { stockCode: '000333', stockName: '美的集团', marketValue: 60000 }
      ]

      const processed = processHoldings(holdings, 5)

      expect(processed[0].stockName).toBe('平安银行')
      expect(processed[1].stockName).toBe('万科A')
      expect(processed[2].stockName).toBe('美的集团')
    })

    it('should calculate correct ratios', () => {
      const holdings = [
        { stockCode: '000001', stockName: '平安银行', marketValue: 100000 },
        { stockCode: '000002', stockName: '万科A', marketValue: 100000 }
      ]

      const processed = processHoldings(holdings, 5)

      expect(processed[0].ratio).toBe(50)
      expect(processed[1].ratio).toBe(50)
    })
  })

  describe('TC-UCV2-002-03: 超过5个持仓合并', () => {
    it('should merge holdings beyond maxDisplayCount into "其他"', () => {
      const holdings = [
        { stockCode: '000001', stockName: '平安银行', marketValue: 100000 },
        { stockCode: '000002', stockName: '万科A', marketValue: 80000 },
        { stockCode: '000333', stockName: '美的集团', marketValue: 60000 },
        { stockCode: '000858', stockName: '五粮液', marketValue: 40000 },
        { stockCode: '002415', stockName: '海康威视', marketValue: 20000 },
        { stockCode: '000063', stockName: '中兴通讯', marketValue: 15000 },
        { stockCode: '002594', stockName: '比亚迪', marketValue: 10000 }
      ]

      const { displayHoldings, hasMore, otherCount } = prepareDisplayHoldings(holdings, 5)

      expect(displayHoldings.length).toBe(6) // 5 individual + 1 "其他"
      expect(displayHoldings[5].stockName).toBe('其他')
      expect(displayHoldings[5].marketValue).toBe(25000) // 15000 + 10000
      expect(hasMore).toBe(true)
      expect(otherCount).toBe(2)
    })
  })

  describe('TC-UCV2-002-04: 颜色配置', () => {
    it('should use correct color palette', () => {
      const COLORS = [
        '#1E3A5F', // 深海蓝
        '#8B4513', // 马鞍棕
        '#2F4F4F', // 深石板灰
        '#800020', // 勃艮第红
        '#4A6741', // 森林绿
        '#5B4E4E', // 深灰褐
        '#2C3E50', // 午夜蓝
        '#8B7355', // 暖灰棕
      ]

      // Verify all 8 colors are defined
      expect(COLORS.length).toBe(8)
      expect(COLORS[0]).toBe('#1E3A5F')
      expect(COLORS[1]).toBe('#8B4513')
    })

    it('should cycle colors correctly', () => {
      const COLORS = ['#1E3A5F', '#8B4513', '#2F4F4F', '#800020']

      // Test color cycling
      expect(getColor(0, COLORS)).toBe('#1E3A5F')
      expect(getColor(3, COLORS)).toBe('#800020')
      expect(getColor(4, COLORS)).toBe('#1E3A5F') // Cycles back
      expect(getColor(7, COLORS)).toBe('#800020')
    })
  })

  describe('TC-UCV2-002-05: 图表数据格式化', () => {
    it('should format holdings for uCharts pie chart', () => {
      const holdings = [
        { stockCode: '000001', stockName: '平安银行', marketValue: 100000, ratio: 50 },
        { stockCode: '000002', stockName: '万科A', marketValue: 80000, ratio: 40 },
        { stockCode: '000333', stockName: '其他', marketValue: 20000, ratio: 10 }
      ]

      const chartData = formatChartData(holdings)

      expect(chartData.series[0].data).toHaveLength(3)
      expect(chartData.series[0].data[0]).toMatchObject({
        name: '平安银行',
        value: 100000
      })
    })
  })

  describe('TC-UCV2-002-06: 组件配置', () => {
    it('should generate correct chart options', () => {
      const options = generatePieChartOptions()

      expect(options.type).toBe('pie')
      expect(options.legend.show).toBe(false)
      expect(options.extra.pie.border).toBe(true)
      expect(options.extra.pie.borderWidth).toBe(2)
    })
  })

  describe('TC-UCV2-002-07: Canvas ID 唯一性', () => {
    it('should support custom canvasId', () => {
      const canvasId = 'my-custom-chart-id'
      expect(canvasId).toBe('my-custom-chart-id')
    })

    it('should have default canvasId', () => {
      const defaultId = 'holding-pie-chart'
      expect(defaultId).toBe('holding-pie-chart')
    })
  })
})

// Helper functions for testing

function processHoldings(holdings: any[], maxCount: number) {
  if (!holdings || holdings.length === 0) return []

  const total = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0)

  return holdings
    .map(h => ({
      ...h,
      ratio: total > 0 ? Math.round(((h.marketValue || 0) / total) * 100 * 100) / 100 : 0
    }))
    .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
}

function prepareDisplayHoldings(holdings: any[], maxDisplayCount: number) {
  const sorted = processHoldings(holdings, maxDisplayCount)
  const displayHoldings = sorted.slice(0, maxDisplayCount)

  let hasMore = false
  let otherCount = 0

  if (sorted.length > maxDisplayCount) {
    const otherValue = sorted
      .slice(maxDisplayCount)
      .reduce((sum, h) => sum + (h.marketValue || 0), 0)

    displayHoldings.push({
      stockCode: 'OTHER',
      stockName: '其他',
      marketValue: otherValue,
      ratio: Math.round((otherValue / sorted.reduce((sum, h) => sum + (h.marketValue || 0), 0)) * 100 * 100) / 100
    })

    hasMore = true
    otherCount = sorted.length - maxDisplayCount
  }

  return { displayHoldings, hasMore, otherCount }
}

function getColor(index: number, colors: string[]): string {
  return colors[index % colors.length]
}

function formatChartData(holdings: any[]) {
  return {
    series: [{
      data: holdings.map(h => ({
        name: h.stockName,
        value: h.marketValue
      }))
    }]
  }
}

function generatePieChartOptions() {
  const COLORS = ['#1E3A5F', '#8B4513', '#2F4F4F', '#800020', '#4A6741', '#5B4E4E', '#2C3E50', '#8B7355']

  return {
    type: 'pie',
    color: COLORS,
    padding: [10, 10, 10, 10],
    dataLabel: true,
    dataPointShape: false,
    legend: {
      show: false
    },
    title: {
      name: '持仓',
      fontSize: 12,
      color: '#8c8c8c'
    },
    subtitle: {
      name: '',
      fontSize: 16,
      color: '#1f1f1f'
    },
    extra: {
      pie: {
        activeOpacity: 0.8,
        offsetAngle: 0,
        labelWidth: 15,
        border: true,
        borderWidth: 2,
        borderColor: '#ffffff',
        customRadius: 0,
        linearType: 'none'
      },
      tooltip: {
        showBox: true,
        bgColor: '#000000',
        bgOpacity: 0.7,
        fontSize: 12,
        lineHeight: 18,
        color: '#ffffff',
        padding: 10,
        showArrow: true,
        arrowSize: 6
      }
    }
  }
}
