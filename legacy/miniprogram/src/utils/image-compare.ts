/**
 * 图像对比工具
 * 基于 Pixelmatch 实现视觉回归测试
 */

import * as fs from 'fs'
import * as path from 'path'
import { PNG } from 'pngjs'

// 动态导入 pixelmatch（ESM 模块）
let pixelmatch: any

async function getPixelmatch() {
  if (!pixelmatch) {
    const module = await import('pixelmatch')
    pixelmatch = module.default || module
  }
  return pixelmatch
}

export interface CompareOptions {
  /** 感知阈值（0-1），默认 0.1 */
  threshold?: number
  /** 是否包含抗锯齿差异，默认 false */
  includeAA?: boolean
  /** Alpha 通道阈值，默认 0.1 */
  alpha?: number
  /** 差异像素颜色 [R, G, B]，默认红色 [255, 0, 0] */
  diffColor?: [number, number, number]
  /** 抗锯齿差异颜色 [R, G, B]，默认黄色 [255, 255, 0] */
  aaColor?: [number, number, number]
  /** 差异图输出路径 */
  diffOutput?: string
}

export interface CompareResult {
  /** 是否匹配 */
  matched: boolean
  /** 差异像素数量 */
  diffPixels: number
  /** 差异百分比（0-100） */
  diffPercentage: number
  /** 总像素数 */
  totalPixels: number
  /** 差异图路径（如果生成） */
  diffPath?: string
}

/**
 * 读取 PNG 图片
 */
function readPng(filePath: string): PNG {
  const buffer = fs.readFileSync(filePath)
  return PNG.sync.read(buffer)
}

/**
 * 保存 PNG 图片
 */
function savePng(png: PNG, filePath: string): void {
  const buffer = PNG.sync.write(png)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, buffer)
}

/**
 * 对比两张图片
 */
export async function compareImages(
  baselinePath: string,
  testPath: string,
  options: CompareOptions = {}
): Promise<CompareResult> {
  const pm = await getPixelmatch()

  const {
    threshold = 0.1,
    includeAA = false,
    alpha = 0.1,
    diffColor = [255, 0, 0],
    aaColor = [255, 255, 0],
    diffOutput,
  } = options

  // 读取图片
  const baseline = readPng(baselinePath)
  const test = readPng(testPath)

  // 验证尺寸
  if (baseline.width !== test.width || baseline.height !== test.height) {
    throw new Error(
      `图片尺寸不匹配: 基准图 ${baseline.width}x${baseline.height}, 测试图 ${test.width}x${test.height}`
    )
  }

  const { width, height } = baseline
  const totalPixels = width * height

  // 创建差异图
  const diff = new PNG({ width, height })

  // 执行对比
  const diffPixels = pm(
    baseline.data,
    test.data,
    diff.data,
    width,
    height,
    {
      threshold,
      includeAA,
      alpha,
      diffColor,
      aaColor,
    }
  )

  // 保存差异图
  let diffPath: string | undefined
  if (diffOutput) {
    savePng(diff, diffOutput)
    diffPath = diffOutput
  }

  // 计算差异百分比
  const diffPercentage = (diffPixels / totalPixels) * 100

  return {
    matched: diffPixels === 0,
    diffPixels,
    diffPercentage,
    totalPixels,
    diffPath,
  }
}

/**
 * 对比并断言
 */
export async function assertImagesMatch(
  baselinePath: string,
  testPath: string,
  maxDiffPercentage: number = 0.05,
  options: Omit<CompareOptions, 'diffOutput'> = {}
): Promise<CompareResult> {
  const result = await compareImages(baselinePath, testPath, options)

  if (result.diffPercentage > maxDiffPercentage) {
    throw new Error(
      `截图不匹配: 差异 ${result.diffPercentage.toFixed(2)}% (${result.diffPixels} 像素), ` +
      `允许最大差异 ${maxDiffPercentage}%`
    )
  }

  return result
}

/**
 * 创建空白基准图（用于首次运行）
 */
export function createPlaceholderBaseline(
  width: number,
  height: number,
  outputPath: string
): void {
  const png = new PNG({ width, height })

  // 填充灰色背景
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2
      png.data[idx] = 200     // R
      png.data[idx + 1] = 200 // G
      png.data[idx + 2] = 200 // B
      png.data[idx + 3] = 255 // A
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const buffer = PNG.sync.write(png)
  fs.writeFileSync(outputPath, buffer)
}

/**
 * 批量对比目录中的图片
 */
export async function compareDirectories(
  baselineDir: string,
  testDir: string,
  options: CompareOptions & { maxDiffPercentage?: number } = {}
): Promise<{
  total: number
  matched: number
  failed: number
  results: Array<{ file: string; result: CompareResult }>
}> {
  const { maxDiffPercentage = 0.05, ...compareOptions } = options

  const baselineFiles = fs
    .readdirSync(baselineDir)
    .filter((f) => f.endsWith('.png'))

  const results: Array<{ file: string; result: CompareResult }> = []
  let matched = 0
  let failed = 0

  for (const file of baselineFiles) {
    const baselinePath = path.join(baselineDir, file)
    const testPath = path.join(testDir, file)

    if (!fs.existsSync(testPath)) {
      throw new Error(`测试图片不存在: ${testPath}`)
    }

    const result = await compareImages(baselinePath, testPath, {
      ...compareOptions,
      diffOutput: compareOptions.diffOutput
        ? path.join(compareOptions.diffOutput, `diff-${file}`)
        : undefined,
    })

    const isMatched = result.diffPercentage <= maxDiffPercentage
    if (isMatched) {
      matched++
    } else {
      failed++
    }

    results.push({ file, result })
  }

  return {
    total: baselineFiles.length,
    matched,
    failed,
    results,
  }
}
