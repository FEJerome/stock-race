/**
 * DSL 解析器单元测试
 * TDD 原则：测试先行
 */
import { describe, it, expect } from 'vitest'
import { DSLParser, TestFlow, TestAction } from '../../src/utils/dsl/parser'

describe('DSL Parser', () => {
  describe('TC-DSL-001: 基础解析功能', () => {
    it('应正确解析简单的测试流程', () => {
      const dsl = `
test_flow:
  - action: navigate_to
    target: /pages/index
  - action: wait_for
    selector: ".container"
    timeout: 5000
`
      const parser = new DSLParser()
      const result = parser.parse(dsl)

      expect(result).toBeDefined()
      expect(result.actions).toHaveLength(2)
      expect(result.actions[0].action).toBe('navigate_to')
      expect(result.actions[0].target).toBe('/pages/index')
      expect(result.actions[1].action).toBe('wait_for')
      expect(result.actions[1].selector).toBe('.container')
      expect(result.actions[1].timeout).toBe(5000)
    })

    it('应正确解析包含元数据的完整 DSL', () => {
      const dsl = `
task: UC-V2-003
description: AI经理详情页收益曲线测试

setup:
  - action: connect_devtools
    projectPath: "/path/to/miniprogram"

test_flow:
  - action: navigate_to
    target: /pages/ai-manager-detail?id=123
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
      expect(result.description).toBe('AI经理详情页收益曲线测试')
      expect(result.setup).toHaveLength(1)
      expect(result.actions).toHaveLength(4)
      expect(result.teardown).toHaveLength(1)
    })

    it('应正确处理缺少 test_flow 的 DSL', () => {
      const dsl = `
task: TEST-001
description: 没有 test_flow 的 DSL
`
      const parser = new DSLParser()
      const result = parser.parse(dsl)

      // 没有 test_flow 时，actions 应为空数组
      expect(result.actions).toEqual([])
      expect(result.task).toBe('TEST-001')
    })
  })

  describe('TC-DSL-002: 动作类型解析', () => {
    it('应支持所有 MCP 工具动作', () => {
      const actions = [
        { type: 'navigate_to', yaml: 'action: navigate_to\n    target: /pages/index' },
        { type: 'click', yaml: 'action: click\n    selector: ".btn"' },
        { type: 'input_text', yaml: 'action: input_text\n    uid: "input1"\n    text: "hello"' },
        { type: 'wait_for', yaml: 'action: wait_for\n    selector: ".loaded"\n    timeout: 3000' },
        { type: 'screenshot', yaml: 'action: screenshot\n    name: "capture"' },
        { type: 'assert_text', yaml: 'action: assert_text\n    uid: ".title"\n    expected: "Title"' },
        { type: 'assert_visible', yaml: 'action: assert_visible\n    selector: ".modal"' },
      ]

      const parser = new DSLParser()

      actions.forEach(({ type, yaml }) => {
        const dsl = `test_flow:\n  - ${yaml}`
        const result = parser.parse(dsl)
        expect(result.actions[0].action).toBe(type)
      })
    })

    it('应支持自定义等待时间', () => {
      const dsl = `
test_flow:
  - action: wait
    duration: 2000
`
      const parser = new DSLParser()
      const result = parser.parse(dsl)

      expect(result.actions[0].action).toBe('wait')
      expect(result.actions[0].duration).toBe(2000)
    })
  })

  describe('TC-DSL-003: 变量和参数解析', () => {
    it('应支持变量替换', () => {
      const dsl = `
variables:
  baseUrl: /pages/ai-manager-detail
  managerId: 123

test_flow:
  - action: navigate_to
    target: "{{ baseUrl }}?id={{ managerId }}"
`
      const parser = new DSLParser()
      const result = parser.parse(dsl)

      expect(result.variables).toEqual({
        baseUrl: '/pages/ai-manager-detail',
        managerId: '123'
      })
    })

    it('应支持条件判断', () => {
      const dsl = `
test_flow:
  - action: navigate_to
    target: /pages/index
  - action: click
    selector: ".btn"
    condition: "{{ shouldClick }}"
`
      const parser = new DSLParser()
      const result = parser.parse(dsl)

      expect(result.actions[1].condition).toBe('{{ shouldClick }}')
    })
  })

  describe('TC-DSL-004: 断言解析', () => {
    it('应支持文本断言', () => {
      const dsl = `
test_flow:
  - action: assert_text
    selector: ".profit"
    expected: "+10%"
    exact: true
`
      const parser = new DSLParser()
      const result = parser.parse(dsl)

      expect(result.actions[0].action).toBe('assert_text')
      expect(result.actions[0].expected).toBe('+10%')
      expect(result.actions[0].exact).toBe(true)
    })

    it('应支持截图对比断言', () => {
      const dsl = `
test_flow:
  - action: assert_screenshot
    baseline: "baseline.png"
    threshold: 0.05
    diffOutput: "diff.png"
`
      const parser = new DSLParser()
      const result = parser.parse(dsl)

      expect(result.actions[0].action).toBe('assert_screenshot')
      expect(result.actions[0].threshold).toBe(0.05)
    })
  })

  describe('TC-DSL-005: 循环和重复', () => {
    it('应支持重复执行参数', () => {
      const dsl = `
test_flow:
  - action: repeat
    times: 3
    step_action: click
    selector: ".load-more"
`
      const parser = new DSLParser()
      const result = parser.parse(dsl)

      expect(result.actions[0].action).toBe('repeat')
      expect(result.actions[0].times).toBe(3)
      expect(result.actions[0].step_action).toBe('click')
      expect(result.actions[0].selector).toBe('.load-more')
    })
  })
})

describe('TC-DSL-006: 执行引擎', () => {
  it('应按顺序执行动作', async () => {
    const flow: TestFlow = {
      actions: [
        { action: 'navigate_to', target: '/pages/index' },
        { action: 'wait', duration: 100 },
        { action: 'click', selector: '.btn' }
      ]
    }

    const parser = new DSLParser()
    const executed: string[] = []

    // 模拟执行
    await parser.execute(flow, {
      onAction: (action: TestAction) => {
        executed.push(action.action)
        return Promise.resolve()
      }
    })

    expect(executed).toEqual(['navigate_to', 'wait', 'click'])
  })
})
