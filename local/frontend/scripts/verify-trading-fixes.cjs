/**
 * 交易功能修复验证脚本
 * 手动验证修复是否正确实施
 */

const fs = require('fs')
const path = require('path')

const RESULTS = {
  passed: [],
  failed: [],
}

function test(name, checkFn) {
  try {
    const result = checkFn()
    if (result) {
      RESULTS.passed.push(name)
      console.log(`✅ ${name}`)
    } else {
      RESULTS.failed.push(name)
      console.log(`❌ ${name}`)
    }
  } catch (e) {
    RESULTS.failed.push(name)
    console.log(`❌ ${name}: ${e.message}`)
  }
}

console.log('\n📋 交易功能修复验证\n')
console.log('='.repeat(50))

// 1. 验证 Trading Store 修复
console.log('\n📦 Trading Store 检查\n')

const tradingStorePath = path.join(__dirname, '../src/stores/trading.ts')
const tradingStoreContent = fs.readFileSync(tradingStorePath, 'utf-8')

test('Trading Store 导入 getErrorMessage', () => {
  return tradingStoreContent.includes("import { getErrorMessage } from '../utils/error-handler'")
})

test('Trading Store 有 recentTrades 计算属性', () => {
  return tradingStoreContent.includes('recentTrades') &&
    tradingStoreContent.includes('recentTrades = computed')
})

test('Trading Store 错误处理使用中文消息', () => {
  return tradingStoreContent.includes("获取持仓失败") &&
    tradingStoreContent.includes("获取交易历史失败") &&
    tradingStoreContent.includes("买入失败") &&
    tradingStoreContent.includes("卖出失败")
})

// 2. 验证 TradePanel 组件修复
console.log('\n🎨 TradePanel 组件检查\n')

const tradePanelPath = path.join(__dirname, '../src/components/trading/TradePanel.vue')
const tradePanelContent = fs.readFileSync(tradePanelPath, 'utf-8')

test('TradePanel 有 formatSymbolOnBlur 方法', () => {
  return tradePanelContent.includes('formatSymbolOnBlur')
})

test('TradePanel 有 maxSellableQuantity 计算属性', () => {
  return tradePanelContent.includes('maxSellableQuantity')
})

test('TradePanel 有 isQuantityDisabled 方法', () => {
  return tradePanelContent.includes('isQuantityDisabled')
})

test('TradePanel 快速数量按钮有智能限制', () => {
  return tradePanelContent.includes('exceeds-position') &&
    tradePanelContent.includes('Math.min(qty, action === \'sell\'')
})

test('TradePanel 股票代码输入实时转大写', () => {
  return tradePanelContent.includes('form.value.symbol = input.value.toUpperCase()')
})

// 3. 验证 AgentDetail 视图修复
console.log('\n📱 AgentDetail 视图检查\n')

const agentDetailPath = path.join(__dirname, '../src/views/AgentDetail.vue')
const agentDetailContent = fs.readFileSync(agentDetailPath, 'utf-8')

test('AgentDetail 使用 recentTrades', () => {
  return agentDetailContent.includes('tradingStore.recentTrades')
})

test('AgentDetail 持仓容器有滚动样式', () => {
  return agentDetailContent.includes('max-height: 400px') &&
    agentDetailContent.includes('overflow-y: auto')
})

test('AgentDetail 有自定义滚动条样式', () => {
  return agentDetailContent.includes('::-webkit-scrollbar')
})

// 4. 验证错误处理工具
console.log('\n🔧 错误处理工具检查\n')

const errorHandlerPath = path.join(__dirname, '../src/utils/error-handler.ts')
const errorHandlerContent = fs.readFileSync(errorHandlerPath, 'utf-8')

test('ErrorHandler 导出 getErrorMessage', () => {
  return errorHandlerContent.includes('export function getErrorMessage')
})

// 5. 验证 E2E 测试
console.log('\n🧪 E2E 测试检查\n')

const e2eTestPath = path.join(__dirname, '../tests/e2e/trading.spec.ts')
const e2eTestExists = fs.existsSync(e2eTestPath)

test('E2E 测试文件存在', () => {
  return e2eTestExists
})

if (e2eTestExists) {
  const e2eContent = fs.readFileSync(e2eTestPath, 'utf-8')

  test('E2E 测试包含交易面板测试', () => {
    return e2eContent.includes('交易面板功能')
  })

  test('E2E 测试包含持仓列表测试', () => {
    return e2eContent.includes('持仓列表正确显示')
  })

  test('E2E 测试包含交易历史测试', () => {
    return e2eContent.includes('交易历史')
  })

  test('E2E 测试包含错误处理测试', () => {
    return e2eContent.includes('错误处理')
  })
}

// 汇总
console.log('\n' + '='.repeat(50))
console.log(`\n📊 验证结果:`)
console.log(`  ✅ 通过: ${RESULTS.passed.length}`)
console.log(`  ❌ 失败: ${RESULTS.failed.length}`)
console.log(`  📈 通过率: ${Math.round((RESULTS.passed.length / (RESULTS.passed.length + RESULTS.failed.length)) * 100)}%`)

if (RESULTS.failed.length > 0) {
  console.log(`\n❌ 失败的检查项:`)
  RESULTS.failed.forEach(name => console.log(`  - ${name}`))
  process.exit(1)
} else {
  console.log('\n✨ 所有修复已正确实施！')
  process.exit(0)
}
