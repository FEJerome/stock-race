/**
 * Skill 集成测试
 * 验证 4 个 Skill 的可用性和功能完整性
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { DSLParser, parseDSL, executeDSL } from '../../src/utils/dsl/parser'
import { compareImages, createPlaceholderBaseline } from '../../src/utils/image-compare'

describe('TC-SKILL-001: Skill 配置文件验证', () => {
  const skillsDir = path.join(__dirname, '../../../.claude/skills')

  it('应存在 test-chart-render Skill', () => {
    const skillPath = path.join(skillsDir, 'test-chart-render.json')
    expect(fs.existsSync(skillPath)).toBe(true)

    const skill = JSON.parse(fs.readFileSync(skillPath, 'utf-8'))
    expect(skill.name).toBe('test-chart-render')
    expect(skill.description).toBeDefined()
    expect(skill.prompt).toContain('uCharts')
  })

  it('应存在 test-page-flow Skill', () => {
    const skillPath = path.join(skillsDir, 'test-page-flow.json')
    expect(fs.existsSync(skillPath)).toBe(true)

    const skill = JSON.parse(fs.readFileSync(skillPath, 'utf-8'))
    expect(skill.name).toBe('test-page-flow')
    expect(skill.prompt).toContain('DSL')
    expect(skill.prompt).toContain('test_flow')
  })

  it('应存在 test-api-integration Skill', () => {
    const skillPath = path.join(skillsDir, 'test-api-integration.json')
    expect(fs.existsSync(skillPath)).toBe(true)

    const skill = JSON.parse(fs.readFileSync(skillPath, 'utf-8'))
    expect(skill.name).toBe('test-api-integration')
    expect(skill.prompt).toContain('API')
    expect(skill.prompt).toContain('network')
  })

  it('应存在 test-snapshot-compare Skill', () => {
    const skillPath = path.join(skillsDir, 'test-snapshot-compare.json')
    expect(fs.existsSync(skillPath)).toBe(true)

    const skill = JSON.parse(fs.readFileSync(skillPath, 'utf-8'))
    expect(skill.name).toBe('test-snapshot-compare')
    expect(skill.prompt).toContain('Pixelmatch')
  })
})

describe('TC-SKILL-002: DSL Parser 集成', () => {
  it('应能解析 test-page-flow Skill 示例 DSL', () => {
    const dsl = `
task: UC-V2-003
description: AI经理详情页收益曲线

setup:
  - action: connect_devtools
    projectPath: "/path/to/miniprogram"

test_flow:
  - action: navigate_to
    target: /pages/ai-manager-detail?id=123
  - action: wait_for
    selector: ".chart-canvas"
    timeout: 5000
  - action: screenshot
    name: "initial_load"
  - action: click
    selector: ".time-selector .week"
  - action: assert_text
    selector: ".profit-value"
    expected: "+12.34%"

teardown:
  - action: disconnect_devtools
`
    const parser = new DSLParser()
    const result = parser.parse(dsl)

    expect(result.task).toBe('UC-V2-003')
    expect(result.setup).toHaveLength(1)
    expect(result.actions).toHaveLength(5)
    expect(result.teardown).toHaveLength(1)
  })

  it('应能解析包含变量的 DSL', () => {
    const dsl = `
variables:
  managerId: 456
  timeout: 10000

test_flow:
  - action: navigate_to
    target: "/pages/detail?id={{ managerId }}"
  - action: wait_for
    selector: ".page-ready"
    timeout: "{{ timeout }}"
`
    const result = parseDSL(dsl)

    expect(result.variables).toEqual({
      managerId: '456',
      timeout: '10000'
    })
  })

  it('应能执行简单的测试流程', async () => {
    const dsl = `
test_flow:
  - action: navigate_to
    target: /pages/index
  - action: wait
    duration: 100
`
    const executed: string[] = []

    await executeDSL(dsl, {
      onAction: async (action) => {
        executed.push(action.action)
      }
    })

    expect(executed).toEqual(['navigate_to', 'wait'])
  })
})

describe('TC-SKILL-003: Pixelmatch 集成', () => {
  const testDir = path.join(__dirname, '../../test-temp-skill')

  it('应能与 DSL 集成进行截图对比', async () => {
    const baselineDir = path.join(testDir, 'baselines')
    const testImgDir = path.join(testDir, 'test-images')

    fs.mkdirSync(baselineDir, { recursive: true })
    fs.mkdirSync(testImgDir, { recursive: true })

    // 创建基准图和测试图
    const { PNG } = await import('pngjs')
    const createPng = (color: [number, number, number], outputPath: string) => {
      const png = new PNG({ width: 100, height: 100 })
      for (let i = 0; i < png.data.length; i += 4) {
        png.data[i] = color[0]
        png.data[i + 1] = color[1]
        png.data[i + 2] = color[2]
        png.data[i + 3] = 255
      }
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, PNG.sync.write(png))
    }

    const baselinePath = path.join(baselineDir, 'test.png')
    const testPath = path.join(testImgDir, 'test.png')

    createPng([255, 0, 0], baselinePath)
    createPng([255, 0, 0], testPath)

    const result = await compareImages(baselinePath, testPath)

    expect(result.matched).toBe(true)
    expect(result.diffPixels).toBe(0)

    // 清理
    fs.rmSync(testDir, { recursive: true, force: true })
  })
})

describe('TC-SKILL-004: Skill 组合使用场景', () => {
  it('应支持图表渲染 + 截图对比组合', async () => {
    const dsl = `
task: UC-V2-003
description: 图表渲染并对比

test_flow:
  - action: navigate_to
    target: /pages/ai-manager-detail?id=123
  - action: wait_for
    selector: ".chart-canvas"
    timeout: 5000
  - action: screenshot
    name: "chart_rendered"
    path: "/tmp/chart.png"
  - action: assert_screenshot
    baseline: "/baselines/chart-baseline.png"
    threshold: 0.05
`
    const result = parseDSL(dsl)

    expect(result.actions).toHaveLength(4)
    expect(result.actions[3].action).toBe('assert_screenshot')
    expect(result.actions[3].threshold).toBe(0.05)
  })

  it('应支持页面流程 + API 监控组合', () => {
    const dsl = `
task: API-INTEGRATION-001
description: 页面加载并监控 API

setup:
  - action: connect_devtools
    autoMonitorNetwork: true

test_flow:
  - action: navigate_to
    target: /pages/ranking
  - action: wait_for
    selector: ".ranking-list"
  - action: assert_request_made
    urlPattern: "/api/ranking"
    method: "GET"
`
    const result = parseDSL(dsl)

    expect(result.setup?.[0].autoMonitorNetwork).toBe(true)
    expect(result.actions[2].action).toBe('assert_request_made')
  })
})

describe('TC-SKILL-005: Skill 使用文档', () => {
  it('应存在 MCP 使用指南文档', () => {
    const guidePath = path.join(__dirname, '../../../docs/modules/miniprogram/MCP_GUIDE.md')
    expect(fs.existsSync(guidePath)).toBe(true)

    const content = fs.readFileSync(guidePath, 'utf-8')
    expect(content).toContain('weixin-devtools-mcp')
    expect(content).toContain('screenshot')
  })

  it('应存在测试脚本文档', () => {
    const scriptsPath = path.join(__dirname, '../../../docs/modules/miniprogram/TEST_SCRIPTS.md')
    expect(fs.existsSync(scriptsPath)).toBe(true)

    const content = fs.readFileSync(scriptsPath, 'utf-8')
    expect(content).toContain('MCP')
    expect(content).toContain('test-mcp-valid.mjs')
  })
})
