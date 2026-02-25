/**
 * 图像对比工具单元测试
 * TDD 原则：测试先行
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { PNG } from 'pngjs'
import {
  compareImages,
  assertImagesMatch,
  createPlaceholderBaseline,
  compareDirectories,
} from '../../src/utils/image-compare'

const TEST_DIR = path.join(__dirname, '../../test-temp')
const BASELINE_DIR = path.join(TEST_DIR, 'baselines')
const TEST_IMG_DIR = path.join(TEST_DIR, 'test-images')
const DIFF_DIR = path.join(TEST_DIR, 'diffs')

/**
 * 创建测试用 PNG 图片
 */
function createTestPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
  outputPath: string
): void {
  const png = new PNG({ width, height })

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2
      png.data[idx] = color.r
      png.data[idx + 1] = color.g
      png.data[idx + 2] = color.b
      png.data[idx + 3] = 255
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const buffer = PNG.sync.write(png)
  fs.writeFileSync(outputPath, buffer)
}

describe('TC-Pixelmatch-001: 图像对比基础功能', () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true })
    fs.mkdirSync(BASELINE_DIR, { recursive: true })
    fs.mkdirSync(TEST_IMG_DIR, { recursive: true })
    fs.mkdirSync(DIFF_DIR, { recursive: true })
  })

  afterAll(() => {
    // 清理测试文件
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('应检测到完全相同的图片', async () => {
    const baselinePath = path.join(BASELINE_DIR, 'same.png')
    const testPath = path.join(TEST_IMG_DIR, 'same.png')

    createTestPng(100, 100, { r: 255, g: 0, b: 0 }, baselinePath)
    createTestPng(100, 100, { r: 255, g: 0, b: 0 }, testPath)

    const result = await compareImages(baselinePath, testPath)

    expect(result.matched).toBe(true)
    expect(result.diffPixels).toBe(0)
    expect(result.diffPercentage).toBe(0)
  })

  it('应检测到不同的图片', async () => {
    const baselinePath = path.join(BASELINE_DIR, 'diff-base.png')
    const testPath = path.join(TEST_IMG_DIR, 'diff-test.png')

    createTestPng(100, 100, { r: 255, g: 0, b: 0 }, baselinePath)
    createTestPng(100, 100, { r: 0, g: 255, b: 0 }, testPath)

    const result = await compareImages(baselinePath, testPath)

    expect(result.matched).toBe(false)
    expect(result.diffPixels).toBeGreaterThan(0)
    expect(result.diffPercentage).toBeGreaterThan(0)
  })

  it('应生成差异图', async () => {
    const baselinePath = path.join(BASELINE_DIR, 'diff-output-base.png')
    const testPath = path.join(TEST_IMG_DIR, 'diff-output-test.png')
    const diffPath = path.join(DIFF_DIR, 'diff.png')

    createTestPng(100, 100, { r: 255, g: 0, b: 0 }, baselinePath)
    createTestPng(100, 100, { r: 0, g: 255, b: 0 }, testPath)

    const result = await compareImages(baselinePath, testPath, {
      diffOutput: diffPath,
    })

    expect(result.diffPath).toBe(diffPath)
    expect(fs.existsSync(diffPath)).toBe(true)
  })

  it('应抛出错误当图片尺寸不匹配', async () => {
    const baselinePath = path.join(BASELINE_DIR, 'size-base.png')
    const testPath = path.join(TEST_IMG_DIR, 'size-test.png')

    createTestPng(100, 100, { r: 255, g: 0, b: 0 }, baselinePath)
    createTestPng(200, 200, { r: 255, g: 0, b: 0 }, testPath)

    await expect(compareImages(baselinePath, testPath)).rejects.toThrow('尺寸不匹配')
  })
})

describe('TC-Pixelmatch-002: 阈值设置', () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true })
    fs.mkdirSync(BASELINE_DIR, { recursive: true })
    fs.mkdirSync(TEST_IMG_DIR, { recursive: true })
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('应支持自定义阈值', async () => {
    const baselinePath = path.join(BASELINE_DIR, 'threshold-base.png')
    const testPath = path.join(TEST_IMG_DIR, 'threshold-test.png')

    // 创建略有差异的图片
    createTestPng(100, 100, { r: 255, g: 0, b: 0 }, baselinePath)
    createTestPng(100, 100, { r: 254, g: 1, b: 0 }, testPath)

    // 高阈值应该忽略小差异
    const resultHigh = await compareImages(baselinePath, testPath, {
      threshold: 0.5,
    })

    // 低阈值应该检测小差异
    const resultLow = await compareImages(baselinePath, testPath, {
      threshold: 0.01,
    })

    expect(resultHigh.diffPixels).toBeLessThanOrEqual(resultLow.diffPixels)
  })
})

describe('TC-Pixelmatch-003: 断言功能', () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true })
    fs.mkdirSync(BASELINE_DIR, { recursive: true })
    fs.mkdirSync(TEST_IMG_DIR, { recursive: true })
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('应在差异超过阈值时抛出错误', async () => {
    const baselinePath = path.join(BASELINE_DIR, 'assert-base.png')
    const testPath = path.join(TEST_IMG_DIR, 'assert-test.png')

    createTestPng(100, 100, { r: 255, g: 0, b: 0 }, baselinePath)
    createTestPng(100, 100, { r: 0, g: 255, b: 0 }, testPath)

    // 设置很小的允许差异
    await expect(
      assertImagesMatch(baselinePath, testPath, 0.01)
    ).rejects.toThrow('截图不匹配')
  })

  it('应在差异在阈值内时通过', async () => {
    const baselinePath = path.join(BASELINE_DIR, 'assert-pass-base.png')
    const testPath = path.join(TEST_IMG_DIR, 'assert-pass-test.png')

    createTestPng(100, 100, { r: 255, g: 0, b: 0 }, baselinePath)
    createTestPng(100, 100, { r: 255, g: 0, b: 0 }, testPath)

    const result = await assertImagesMatch(baselinePath, testPath, 0.01)

    expect(result.matched).toBe(true)
  })
})

describe('TC-Pixelmatch-004: 辅助功能', () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true })
    fs.mkdirSync(BASELINE_DIR, { recursive: true })
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('应创建占位基准图', () => {
    const placeholderPath = path.join(BASELINE_DIR, 'placeholder.png')

    createPlaceholderBaseline(100, 100, placeholderPath)

    expect(fs.existsSync(placeholderPath)).toBe(true)

    const png = PNG.sync.read(fs.readFileSync(placeholderPath))
    expect(png.width).toBe(100)
    expect(png.height).toBe(100)
  })

  it('应批量对比目录中的图片', async () => {
    const baselineDir = path.join(TEST_DIR, 'batch-baselines')
    const testDir = path.join(TEST_DIR, 'batch-tests')

    fs.mkdirSync(baselineDir, { recursive: true })
    fs.mkdirSync(testDir, { recursive: true })

    // 创建测试图片
    createTestPng(100, 100, { r: 255, g: 0, b: 0 }, path.join(baselineDir, '1.png'))
    createTestPng(100, 100, { r: 255, g: 0, b: 0 }, path.join(testDir, '1.png'))
    createTestPng(100, 100, { r: 0, g: 255, b: 0 }, path.join(baselineDir, '2.png'))
    createTestPng(100, 100, { r: 0, g: 255, b: 0 }, path.join(testDir, '2.png'))

    const result = await compareDirectories(baselineDir, testDir, {
      maxDiffPercentage: 1,
    })

    expect(result.total).toBe(2)
    expect(result.matched).toBe(2)
    expect(result.failed).toBe(0)
  })
})
