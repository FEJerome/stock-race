/**
 * DSL 解析器
 * 用于解析和执行小程序测试流程的 DSL 脚本
 */

export interface TestAction {
  action: string
  [key: string]: any
}

export interface TestFlow {
  task?: string
  description?: string
  variables?: Record<string, string>
  setup?: TestAction[]
  actions: TestAction[]
  teardown?: TestAction[]
}

export interface ExecutionContext {
  variables: Record<string, string>
  screenshots: string[]
  results: TestResult[]
}

export interface TestResult {
  action: string
  success: boolean
  message?: string
  duration: number
}

export interface ExecutionOptions {
  onAction?: (action: TestAction, context: ExecutionContext) => Promise<void>
  onError?: (error: Error, action: TestAction) => void
}

/**
 * DSL 解析器类
 */
export class DSLParser {
  private context: ExecutionContext = {
    variables: {},
    screenshots: [],
    results: []
  }

  /**
   * 解析 YAML 格式的 DSL 字符串
   */
  parse(dsl: string): TestFlow {
    try {
      const lines = dsl.split('\n').map(line => line.trimEnd())
      const flow: TestFlow = { actions: [] }
      let currentSection: keyof TestFlow | null = null
      let currentAction: TestAction | null = null
      let indentLevel = 0

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()

        // 跳过空行和注释
        if (!trimmed || trimmed.startsWith('#')) continue

        // 计算缩进级别
        const currentIndent = line.length - line.trimStart().length

        // 解析顶层字段
        if (currentIndent === 0 && trimmed.includes(':')) {
          const [key, ...valueParts] = trimmed.split(':')
          const value = valueParts.join(':').trim()

          if (key === 'task') {
            flow.task = value
          } else if (key === 'description') {
            flow.description = value
          } else if (key === 'variables') {
            flow.variables = {}
            currentSection = 'variables'
          } else if (key === 'setup') {
            flow.setup = []
            currentSection = 'setup'
          } else if (key === 'test_flow') {
            currentSection = 'actions'
          } else if (key === 'teardown') {
            flow.teardown = []
            currentSection = 'teardown'
          }
          continue
        }

        // 解析变量定义
        if (currentSection === 'variables' && currentIndent === 2 && trimmed.includes(':')) {
          const [key, value] = trimmed.split(':').map(s => s.trim())
          if (flow.variables) {
            flow.variables[key] = value
          }
          continue
        }

        // 解析动作列表项 (- action: xxx)
        if (trimmed.startsWith('- ') && trimmed.includes('action:')) {
          const actionMatch = trimmed.match(/action:\s*(\w+)/)
          if (actionMatch) {
            currentAction = { action: actionMatch[1] }

            // 解析同一行的其他参数
            const params = trimmed.split('- ')[1]
            if (params) {
              const paramPairs = params.split(/\s+(?=[\w-]+:)/)
              paramPairs.forEach(pair => {
                if (pair.includes(':') && !pair.startsWith('action:')) {
                  const [k, ...v] = pair.split(':')
                  const value = v.join(':').trim()
                  // 尝试转换为数字
                  if (currentAction) {
                    currentAction[k] = this.parseValue(value)
                  }
                }
              })
            }

            if (currentSection === 'setup' && flow.setup) {
              flow.setup.push(currentAction)
            } else if (currentSection === 'actions') {
              flow.actions.push(currentAction)
            } else if (currentSection === 'teardown' && flow.teardown) {
              flow.teardown.push(currentAction)
            }
          }
          continue
        }

        // 解析动作的附加参数
        if (currentAction && currentIndent >= 4 && trimmed.includes(':')) {
          const colonIndex = trimmed.indexOf(':')
          const key = trimmed.substring(0, colonIndex).trim()
          const value = trimmed.substring(colonIndex + 1).trim()
          currentAction[key] = this.parseValue(value)
          continue
        }

        // 解析嵌套步骤（如 repeat）
        if (currentAction && trimmed.startsWith('- ') && currentAction.action === 'repeat') {
          if (!currentAction.steps) {
            currentAction.steps = []
          }
          const stepMatch = trimmed.match(/action:\s*(\w+)/)
          if (stepMatch) {
            currentAction.steps.push({ action: stepMatch[1] })
          }
          continue
        }
      }

      return flow
    } catch (error) {
      throw new Error(`DSL 解析失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 解析值，尝试转换为数字或布尔值
   */
  private parseValue(value: string): string | number | boolean {
    // 尝试转换为数字
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10)
    }
    if (/^-?\d+\.\d+$/.test(value)) {
      return parseFloat(value)
    }
    // 尝试转换为布尔值
    if (value === 'true') return true
    if (value === 'false') return false
    // 去除引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1)
    }
    return value
  }

  /**
   * 替换变量
   */
  private replaceVariables(str: string): string {
    return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, varName) => {
      return this.context.variables[varName] !== undefined
        ? String(this.context.variables[varName])
        : match
    })
  }

  /**
   * 执行测试流程
   */
  async execute(flow: TestFlow, options: ExecutionOptions = {}): Promise<void> {
    this.context.variables = { ...flow.variables }
    this.context.results = []

    try {
      // 执行 setup
      if (flow.setup) {
        for (const action of flow.setup) {
          await this.executeAction(action, options)
        }
      }

      // 执行主流程
      for (const action of flow.actions) {
        await this.executeAction(action, options)
      }

      // 执行 teardown
      if (flow.teardown) {
        for (const action of flow.teardown) {
          await this.executeAction(action, options)
        }
      }
    } catch (error) {
      // 确保 teardown 执行
      if (flow.teardown) {
        for (const action of flow.teardown) {
          try {
            await this.executeAction(action, options)
          } catch {
            // 忽略 teardown 错误
          }
        }
      }
      throw error
    }
  }

  /**
   * 执行单个动作
   */
  private async executeAction(action: TestAction, options: ExecutionOptions): Promise<void> {
    const startTime = Date.now()

    try {
      // 检查条件
      if (action.condition) {
        const condition = this.replaceVariables(action.condition)
        // 简化的条件判断
        if (condition === 'false' || condition === '0') {
          this.context.results.push({
            action: action.action,
            success: true,
            duration: Date.now() - startTime,
            message: 'Skipped (condition=false)'
          })
          return
        }
      }

      // 替换变量
      const processedAction: TestAction = { action: action.action }
      for (const [key, value] of Object.entries(action)) {
        if (typeof value === 'string') {
          processedAction[key] = this.replaceVariables(value)
        } else {
          processedAction[key] = value
        }
      }

      // 调用回调
      if (options.onAction) {
        await options.onAction(processedAction, this.context)
      }

      this.context.results.push({
        action: action.action,
        success: true,
        duration: Date.now() - startTime
      })
    } catch (error) {
      const duration = Date.now() - startTime
      this.context.results.push({
        action: action.action,
        success: false,
        duration,
        message: error instanceof Error ? error.message : '执行失败'
      })

      if (options.onError) {
        options.onError(error instanceof Error ? error : new Error(String(error)), action)
      }

      throw error
    }
  }

  /**
   * 获取执行上下文
   */
  getContext(): ExecutionContext {
    return { ...this.context }
  }

  /**
   * 重置上下文
   */
  resetContext(): void {
    this.context = {
      variables: {},
      screenshots: [],
      results: []
    }
  }
}

/**
 * 快速解析 DSL 的辅助函数
 */
export function parseDSL(dsl: string): TestFlow {
  const parser = new DSLParser()
  return parser.parse(dsl)
}

/**
 * 快速执行 DSL 的辅助函数
 */
export async function executeDSL(dsl: string, options: ExecutionOptions = {}): Promise<void> {
  const parser = new DSLParser()
  const flow = parser.parse(dsl)
  await parser.execute(flow, options)
}
