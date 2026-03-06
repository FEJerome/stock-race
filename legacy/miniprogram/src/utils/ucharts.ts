/**
 * uCharts v2.x 通用工具模块
 *
 * 封装 uCharts v2.x API，提供统一的图表创建、销毁和管理功能
 * 处理平台差异（微信小程序 canvas 2d 与旧版 canvas）
 *
 * @module ucharts
 * @author Miniprogram Development Team
 * @since 2026-02-25
 */

import uCharts from '@qiun/ucharts'

/**
 * 图表配置选项接口
 */
export interface ChartOptions {
  /** 图表类型 */
  type: 'line' | 'pie' | 'column' | 'bar' | 'area' | 'candle' | 'ring' | 'radar' | 'gauge'
  /** 图表宽度（可选，默认自动获取） */
  width?: number
  /** 图表高度（可选，默认自动获取） */
  height?: number
  /** 图表数据系列 */
  series: any[]
  /** x轴配置（可选） */
  xAxis?: any
  /** y轴配置（可选） */
  yAxis?: any
  /** 图例配置（可选） */
  legend?: any
  /** 标题配置（可选） */
  title?: any
  /** 副标题配置（可选） */
  subtitle?: any
  /** 额外选项（可选） */
  extra?: any
  /** 动画配置（可选） */
  animation?: boolean
  /** 背景颜色（可选） */
  background?: string
  /** 像素比率（可选） */
  pixelRatio?: number
  /** 是否启用滚动（可选） */
  enableScroll?: boolean
  /** 是否启用标记点（可选） */
  enableMarkLine?: boolean
}

/**
 * 图表实例接口
 */
export interface ChartInstance {
  /** 更新图表数据 */
  updateData: (data: any) => void
  /** 销毁图表实例 */
  destroy: () => void
  /** 添加事件监听 */
  addEventListener: (event: string, handler: Function) => void
  /** 移除事件监听 */
  removeEventListener: (event: string, handler: Function) => void
  /** 获取当前数据 */
  getData: () => any
  /** 画布上下文 */
  context?: any
}

/**
 * Canvas 尺寸信息
 */
interface CanvasRect {
  width: number
  height: number
  node?: any
}

// 图表实例缓存 Map
const chartInstances: Map<string, ChartInstance> = new Map()

/**
 * 获取 Canvas 2D 上下文
 *
 * 支持微信小程序 canvas 2d API 和旧版 canvas API 自动降级
 *
 * @param canvasId - Canvas 元素 ID
 * @returns Promise<CanvasContext> Canvas 2D 上下文
 * @throws Error 当 Canvas 元素不存在或不支持 2d 上下文时抛出
 *
 * @example
 * ```typescript
 * const ctx = await getCanvasContext('my-chart')
 * // Use ctx for uCharts initialization
 * ```
 */
export function getCanvasContext(canvasId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      // 使用 createSelectorQuery 获取 Canvas 节点
      const query = uni.createSelectorQuery()

      query
        .select(`#${canvasId}`)
        .fields({
          node: true,
          size: true,
          context: true
        })
        .exec((res) => {
          if (!res || !res[0]) {
            reject(new Error(`Canvas element with id "${canvasId}" not found`))
            return
          }

          const { node, width, height } = res[0]

          // 优先使用新的 Canvas 2D API (Type 2D)
          if (node && typeof node.getContext === 'function') {
            const ctx = node.getContext('2d')
            if (!ctx) {
              reject(new Error('Canvas node does not support 2d context'))
              return
            }
            // 存储 canvas 节点引用，用于后续尺寸获取
            ctx._canvasNode = node
            ctx._canvasWidth = width
            ctx._canvasHeight = height
            resolve(ctx)
            return
          }

          // 降级到旧版 Canvas API (适用于低版本微信)
          try {
            const legacyContext = uni.createCanvasContext(canvasId)
            if (legacyContext) {
              legacyContext._canvasWidth = width
              legacyContext._canvasHeight = height
              resolve(legacyContext)
            } else {
              reject(new Error(`Failed to create legacy canvas context for "${canvasId}"`))
            }
          } catch (error) {
            reject(new Error(`Canvas initialization failed for "${canvasId}": ${error}`))
          }
        })
    } catch (error) {
      reject(new Error(`Query execution failed: ${error}`))
    }
  })
}

/**
 * 获取 Canvas 尺寸信息
 *
 * @param canvasId - Canvas 元素 ID
 * @returns Promise<CanvasRect> 画布尺寸信息
 */
export function getCanvasRect(canvasId: string): Promise<CanvasRect> {
  return new Promise((resolve, reject) => {
    const query = uni.createSelectorQuery()

    query
      .select(`#${canvasId}`)
      .fields({
        node: true,
        size: true
      })
      .exec((res) => {
        if (!res || !res[0]) {
          reject(new Error(`Canvas element with id "${canvasId}" not found`))
          return
        }

        const { node, width, height } = res[0]
        resolve({
          width: width || 300,
          height: height || 200,
          node
        })
      })
  })
}

/**
 * 创建 uCharts 实例
 *
 * 自动获取 Canvas 上下文并创建图表实例，支持实例缓存防止重复创建
 *
 * @param canvasId - Canvas 元素 ID
 * @param options - 图表配置选项
 * @returns Promise<ChartInstance> uCharts 实例
 *
 * @example
 * ```typescript
 * const chart = await createUChart('pie-chart', {
 *   type: 'pie',
 *   series: [{ data: [{ name: 'A', value: 10 }] }]
 * })
 * ```
 */
export async function createUChart(
  canvasId: string,
  options: ChartOptions
): Promise<ChartInstance> {
  // 检查是否已有实例，防止重复创建
  const existingInstance = chartInstances.get(canvasId)
  if (existingInstance) {
    console.warn(`[ucharts] Chart instance for "${canvasId}" already exists, returning existing instance`)
    return existingInstance
  }

  // 获取 Canvas 上下文
  const context = await getCanvasContext(canvasId)

  // 获取 Canvas 尺寸
  let width = options.width
  let height = options.height

  if (!width || !height) {
    try {
      const rect = await getCanvasRect(canvasId)
      width = width || rect.width
      height = height || rect.height
    } catch (error) {
      console.warn(`[ucharts] Failed to get canvas rect, using defaults: ${error}`)
      width = width || 300
      height = height || 200
    }
  }

  // 获取系统信息计算像素比
  let pixelRatio = options.pixelRatio || 1
  try {
    const systemInfo = uni.getSystemInfoSync()
    pixelRatio = systemInfo.pixelRatio || 1
  } catch (error) {
    console.warn(`[ucharts] Failed to get system info: ${error}`)
  }

  // 构建 uCharts 配置
  const uChartsConfig = {
    context,
    canvasId,
    type: options.type,
    width,
    height,
    pixelRatio,
    series: options.series || [],
    xAxis: options.xAxis || {},
    yAxis: options.yAxis || {},
    legend: options.legend || {},
    title: options.title || {},
    subtitle: options.subtitle || {},
    extra: options.extra || {},
    animation: options.animation !== false, // 默认启用动画
    background: options.background || '#FFFFFF',
    enableScroll: options.enableScroll || false,
    enableMarkLine: options.enableMarkLine || false,
    // 事件回调占位
    touchMoveLimit: 60,
    tapLegend: true
  }

  // 创建 uCharts 实例
  const chart = new uCharts(uChartsConfig) as ChartInstance

  // 存储原始 context 引用
  chart.context = context

  // 缓存实例
  chartInstances.set(canvasId, chart)

  console.log(`[ucharts] Chart instance created for "${canvasId}" (${width}x${height})`)

  return chart
}

/**
 * 初始化图表（简化版 createUChart）
 *
 * @param canvasId - Canvas 元素 ID
 * @param options - 图表配置选项
 * @returns Promise<ChartInstance> uCharts 实例
 */
export function initChart(canvasId: string, options: ChartOptions): Promise<ChartInstance> {
  return createUChart(canvasId, options)
}

/**
 * 销毁图表实例
 *
 * 清理图表实例和相关资源，防止内存泄漏
 *
 * @param canvasId - Canvas 元素 ID
 *
 * @example
 * ```typescript
 * // 在页面卸载时调用
 * onUnload(() => {
 *   disposeChart('my-chart')
 * })
 * ```
 */
export function disposeChart(canvasId: string): void {
  const instance = chartInstances.get(canvasId)

  if (instance) {
    // 调用 uCharts 销毁方法
    if (typeof instance.destroy === 'function') {
      try {
        instance.destroy()
      } catch (error) {
        console.warn(`[ucharts] Error destroying chart "${canvasId}": ${error}`)
      }
    }

    // 从缓存中移除
    chartInstances.delete(canvasId)

    console.log(`[ucharts] Chart instance disposed for "${canvasId}"`)
  }
}

/**
 * 获取已存在的图表实例
 *
 * @param canvasId - Canvas 元素 ID
 * @returns ChartInstance | null 图表实例或 null
 */
export function getChartInstance(canvasId: string): ChartInstance | null {
  return chartInstances.get(canvasId) || null
}

/**
 * 检查图表实例是否存在
 *
 * @param canvasId - Canvas 元素 ID
 * @returns boolean 是否存在
 */
export function hasChartInstance(canvasId: string): boolean {
  return chartInstances.has(canvasId)
}

/**
 * 更新图表数据
 *
 * @param canvasId - Canvas 元素 ID
 * @param data - 新数据
 * @returns boolean 是否更新成功
 */
export function updateChartData(canvasId: string, data: any): boolean {
  const instance = chartInstances.get(canvasId)

  if (!instance) {
    console.warn(`[ucharts] No chart instance found for "${canvasId}"`)
    return false
  }

  if (typeof instance.updateData !== 'function') {
    console.warn(`[ucharts] Chart instance does not support updateData`)
    return false
  }

  try {
    instance.updateData(data)
    return true
  } catch (error) {
    console.error(`[ucharts] Failed to update chart data: ${error}`)
    return false
  }
}

/**
 * 销毁所有图表实例
 *
 * 适用于页面卸载或应用退出时清理资源
 */
export function disposeAllCharts(): void {
  const ids = Array.from(chartInstances.keys())

  ids.forEach((id) => {
    disposeChart(id)
  })

  console.log(`[ucharts] All chart instances disposed (${ids.length} total)`)
}

/**
 * 获取当前所有图表实例 ID 列表
 *
 * @returns string[] 图表实例 ID 列表
 */
export function getAllChartIds(): string[] {
  return Array.from(chartInstances.keys())
}

/**
 * 创建饼图专用配置生成器
 *
 * @param data - 饼图数据 { name: string, value: number }[]
 * @param colors - 颜色数组（可选）
 * @returns 图表配置选项
 */
export function createPieChartOptions(
  data: Array<{ name: string; value: number }>,
  colors?: string[]
): ChartOptions {
  const defaultColors = [
    '#1890FF', // 深海蓝
    '#8B4513', // 马鞍棕
    '#52C41A', // 翠绿色
    '#FAAD14', // 金黄色
    '#722ED1', // 紫罗兰
    '#EB2F96', // 玫瑰红
    '#13C2C2', // 青色
    '#F5222D'  // 红色
  ]

  return {
    type: 'pie',
    series: [{
      data: data.map((item, index) => ({
        ...item,
        color: colors?.[index] || defaultColors[index % defaultColors.length]
      }))
    }],
    legend: {
      show: true,
      position: 'bottom',
      lineHeight: 25
    },
    extra: {
      pie: {
        activeOpacity: 0.8,
        offsetAngle: 0,
        labelWidth: 15,
        border: true,
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }
    }
  }
}

/**
 * 创建折线图专用配置生成器
 *
 * @param categories - X轴分类
 * @param series - 数据系列
 * @param options - 额外选项
 * @returns 图表配置选项
 */
export function createLineChartOptions(
  categories: string[],
  series: Array<{ name: string; data: number[]; color?: string }>,
  options: {
    smooth?: boolean
    enableScroll?: boolean
    showArea?: boolean
    yAxisFormat?: string
  } = {}
): ChartOptions {
  return {
    type: options.showArea ? 'area' : 'line',
    series: series.map((s) => ({
      name: s.name,
      data: s.data,
      color: s.color,
      smooth: options.smooth || false
    })),
    xAxis: {
      categories,
      disableGrid: true,
      scrollShow: options.enableScroll || false,
      itemCount: options.enableScroll ? 30 : categories.length
    },
    yAxis: {
      gridType: 'dash',
      dashLength: 4,
      format: options.yAxisFormat || (val => val.toFixed(2))
    },
    legend: {
      show: true,
      position: 'top'
    },
    enableScroll: options.enableScroll || false,
    extra: {
      line: {
        type: options.smooth ? 'curve' : 'straight',
        width: 2
      },
      area: options.showArea ? {
        opacity: 0.2,
        gradient: true
      } : undefined
    }
  }
}

/**
 * 创建 K 线图专用配置生成器
 *
 * @param data - K线数据 [open, close, low, high][]
 * @param categories - 时间分类
 * @returns 图表配置选项
 */
export function createCandleChartOptions(
  data: Array<[number, number, number, number]>,
  categories: string[]
): ChartOptions {
  return {
    type: 'candle',
    series: [{
      data: data.map((item) => ({
        open: item[0],
        close: item[1],
        low: item[2],
        high: item[3]
      }))
    }],
    xAxis: {
      categories,
      disableGrid: true,
      scrollShow: true,
      itemCount: 30
    },
    yAxis: {
      gridType: 'dash',
      dashLength: 4
    },
    enableScroll: true,
    extra: {
      candle: {
        // A股习惯：红涨绿跌
        upColor: '#FF4D4F',
        downColor: '#52C41A',
        average: {
          show: data.length >= 5,
          MA5: true,
          MA10: data.length >= 10,
          MA20: data.length >= 20
        }
      }
    }
  }
}

// 导出默认对象
export default {
  getCanvasContext,
  getCanvasRect,
  createUChart,
  initChart,
  disposeChart,
  getChartInstance,
  hasChartInstance,
  updateChartData,
  disposeAllCharts,
  getAllChartIds,
  createPieChartOptions,
  createLineChartOptions,
  createCandleChartOptions
}
