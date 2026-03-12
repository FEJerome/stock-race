/**
 * Trading Feature E2E Tests
 * 测试交易功能：买入、卖出、持仓显示、交易历史
 */

import { test, expect, Page } from '@playwright/test'

const BASE_URL = 'http://localhost:5173'
const TEST_AGENT_ID = 'test-agent-001'

// 模拟交易数据
const mockPositions = [
  { symbol: '600000.SH', name: '浦发银行', quantity: 1000, avg_cost: 10.5, current_price: 11.2, market_value: 11200, unrealized_pnl: 700, unrealized_pnl_pct: 6.67 },
  { symbol: '000001.SZ', name: '平安银行', quantity: 500, avg_cost: 15.0, current_price: 14.8, market_value: 7400, unrealized_pnl: -100, unrealized_pnl_pct: -1.33 },
]

const mockTrades = [
  { id: 'trade-001', agent_id: TEST_AGENT_ID, symbol: '600000.SH', name: '浦发银行', action: 'buy' as const, quantity: 1000, price: 10.5, total_amount: 10500, decision_reason: '技术指标显示上涨趋势', timestamp: new Date().toISOString() },
  { id: 'trade-002', agent_id: TEST_AGENT_ID, symbol: '000001.SZ', name: '平安银行', action: 'buy' as const, quantity: 500, price: 15.0, total_amount: 7500, decision_reason: '基本面良好', timestamp: new Date(Date.now() - 86400000).toISOString() },
]

test.describe('交易面板功能', () => {
  test.beforeEach(async ({ page }) => {
    // 拦截 API 请求并返回模拟数据
    await page.route(`**/api/trading/${TEST_AGENT_ID}/positions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'success', data: { items: mockPositions, total: mockPositions.length } }),
      })
    })

    await page.route(`**/api/trading/${TEST_AGENT_ID}/trades*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'success', data: { items: mockTrades, total: mockTrades.length } }),
      })
    })

    await page.route(`**/api/trading/${TEST_AGENT_ID}/buy`, async (route) => {
      const request = await route.request()
      const postData = JSON.parse(request.postData() || '{}')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'success',
          data: {
            id: `trade-${Date.now()}`,
            agent_id: TEST_AGENT_ID,
            ...postData,
            total_amount: postData.price * postData.quantity,
            timestamp: new Date().toISOString(),
          },
        }),
      })
    })

    await page.route(`**/api/trading/${TEST_AGENT_ID}/sell`, async (route) => {
      const request = await route.request()
      const postData = JSON.parse(request.postData() || '{}')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'success',
          data: {
            id: `trade-${Date.now()}`,
            agent_id: TEST_AGENT_ID,
            ...postData,
            total_amount: postData.price * postData.quantity,
            realized_pnl: 100,
            timestamp: new Date().toISOString(),
          },
        }),
      })
    })

    // 导航到交易页面
    await page.goto(`${BASE_URL}/agents/${TEST_AGENT_ID}`)
    await page.waitForLoadState('networkidle')
  })

  test('交易面板默认显示买入标签', async ({ page }) => {
    // 验证买入标签激活
    const buyTab = page.locator('.trade-tab').first()
    await expect(buyTab).toHaveClass(/active/)
    await expect(buyTab).toHaveText('买入')

    // 验证提交按钮显示买入
    const submitBtn = page.locator('.btn-submit')
    await expect(submitBtn).toHaveText('买入')
    await expect(submitBtn).toHaveClass(/buy/)
  })

  test('切换买入/卖出标签', async ({ page }) => {
    // 点击卖出标签
    const sellTab = page.locator('.trade-tab').nth(1)
    await sellTab.click()

    // 验证卖出标签激活
    await expect(sellTab).toHaveClass(/active/)

    // 验证提交按钮显示卖出
    const submitBtn = page.locator('.btn-submit')
    await expect(submitBtn).toHaveText('卖出')
    await expect(submitBtn).toHaveClass(/sell/)
  })

  test('股票代码输入自动转大写', async ({ page }) => {
    const symbolInput = page.locator('.trade-form input[type="text"]')

    // 输入小写字母
    await symbolInput.fill('600000.sh')
    await expect(symbolInput).toHaveValue('600000.SH')

    // 输入混合大小写
    await symbolInput.fill('aBc123')
    await expect(symbolInput).toHaveValue('ABC123')
  })

  test('快速数量按钮设置数量', async ({ page }) => {
    const quantityInput = page.locator('.trade-form input[type="number"]').nth(1)

    // 点击 500 按钮
    await page.locator('.qty-btn', { hasText: '500' }).click()
    await expect(quantityInput).toHaveValue('500')

    // 点击 1000 按钮
    await page.locator('.qty-btn', { hasText: '1000' }).click()
    await expect(quantityInput).toHaveValue('1000')
  })

  test('卖出时快速数量按钮受持仓限制', async ({ page }) => {
    // 先输入持仓中的股票代码
    await page.locator('.trade-form input[type="text"]').fill('600000.SH')

    // 切换到卖出
    await page.locator('.trade-tab').nth(1).click()

    // 等待持仓信息显示
    await expect(page.locator('.position-info')).toBeVisible()

    // 1000 股按钮应该可用（持仓 1000 股）
    const qty1000Btn = page.locator('.qty-btn', { hasText: '1000' })
    await expect(qty1000Btn).not.toBeDisabled()

    // 输入非持仓股票
    await page.locator('.trade-form input[type="text"]').fill('999999.SH')

    // 所有快速按钮应该被禁用
    const qtyBtns = page.locator('.qty-btn')
    await expect(qtyBtns.first()).toBeDisabled()
  })

  test('预计金额实时计算', async ({ page }) => {
    // 设置价格 10.5
    await page.locator('.trade-form input[type="number"]').first().fill('10.5')

    // 设置数量 1000
    await page.locator('.trade-form input[type="number"]').nth(1).fill('1000')

    // 验证预计金额显示
    const totalPreview = page.locator('.total-preview .value')
    await expect(totalPreview).toContainText('10,500.00')
  })

  test('买入交易提交成功后刷新数据', async ({ page }) => {
    // 填写买入表单
    await page.locator('.trade-form input[type="text"]').fill('600001.SH')
    await page.locator('.trade-form input[type="number"]').first().fill('20.5')
    await page.locator('.trade-form input[type="number"]').nth(1).fill('100')

    // 提交买入
    await page.locator('.btn-submit').click()

    // 等待成功提示
    await expect(page.locator('.el-message--success')).toBeVisible()

    // 验证表单被清空或重置
    await expect(page.locator('.trade-form input[type="text"]')).toHaveValue('')
  })

  test('持仓列表正确显示', async ({ page }) => {
    // 等待持仓表格加载
    await expect(page.locator('.positions-container .data-table')).toBeVisible()

    // 验证第一行持仓数据
    const firstRow = page.locator('.positions-container .data-table tbody tr').first()
    await expect(firstRow).toContainText('600000.SH')
    await expect(firstRow).toContainText('浦发银行')
    await expect(firstRow).toContainText('1000')

    // 验证盈亏颜色（正数为绿色）
    const pnlCell = firstRow.locator('td').last()
    await expect(pnlCell.locator('.up')).toBeVisible()
  })

  test('交易历史列表正确显示', async ({ page }) => {
    // 等待交易历史表格加载
    await expect(page.locator('.trades-container .data-table')).toBeVisible()

    // 验证第一笔交易
    const firstRow = page.locator('.trades-container .data-table tbody tr').first()
    await expect(firstRow).toContainText('买入')
    await expect(firstRow).toContainText('600000.SH')

    // 验证买入标签样式
    const actionBadge = firstRow.locator('.action-badge')
    await expect(actionBadge).toHaveClass(/buy/)
  })

  test('交易历史显示决策理由', async ({ page }) => {
    const firstRow = page.locator('.trades-container .data-table tbody tr').first()

    // 验证决策理由显示
    await expect(firstRow.locator('.reason-text')).toContainText('技术指标显示上涨趋势')
  })

  test('表格容器支持滚动', async ({ page }) => {
    // 模拟大量持仓数据
    const manyPositions = Array.from({ length: 20 }, (_, i) => ({
      symbol: `60000${i.toString().padStart(2, '0')}.SH`,
      name: `测试股票${i}`,
      quantity: 100,
      avg_cost: 10 + i,
      current_price: 11 + i,
      market_value: 1100 + i * 100,
      unrealized_pnl: 100,
      unrealized_pnl_pct: 10,
    }))

    await page.route(`**/api/trading/${TEST_AGENT_ID}/positions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'success', data: { items: manyPositions, total: manyPositions.length } }),
      })
    })

    // 刷新页面
    await page.reload()
    await page.waitForLoadState('networkidle')

    // 验证容器有滚动条
    const container = page.locator('.positions-container')
    await expect(container).toHaveCSS('max-height', '400px')
    await expect(container).toHaveCSS('overflow-y', 'auto')
  })

  test('表单验证阻止无效提交', async ({ page }) => {
    // 不填股票代码直接提交
    await page.locator('.btn-submit').click()

    // 验证浏览器原生验证提示（required 属性）
    const symbolInput = page.locator('.trade-form input[type="text"]')
    await expect(symbolInput).toHaveAttribute('required', '')
  })

  test('卖出时显示持仓信息', async ({ page }) => {
    // 输入持仓股票代码
    await page.locator('.trade-form input[type="text"]').fill('600000.SH')

    // 切换到卖出
    await page.locator('.trade-tab').nth(1).click()

    // 验证持仓信息显示
    await expect(page.locator('.position-info')).toBeVisible()
    await expect(page.locator('.position-info')).toContainText('可卖数量: 1000 股')
    await expect(page.locator('.position-info')).toContainText('持仓成本: ¥10.50')
  })

  test('卖出数量超过持仓时显示错误', async ({ page }) => {
    // 输入持仓股票代码
    await page.locator('.trade-form input[type="text"]').fill('600000.SH')

    // 切换到卖出
    await page.locator('.trade-tab').nth(1).click()

    // 输入超过持仓的数量
    await page.locator('.trade-form input[type="number"]').nth(1).fill('2000')

    // 提交
    await page.locator('.btn-submit').click()

    // 验证错误提示
    await expect(page.locator('.error-text')).toBeVisible()
    await expect(page.locator('.error-text')).toContainText('最多可卖 1000 股')
  })
})

test.describe('错误处理', () => {
  test('API 错误显示友好提示', async ({ page }) => {
    // 模拟 API 错误
    await page.route(`**/api/trading/${TEST_AGENT_ID}/buy`, async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 400, message: '资金不足，无法完成买入' }),
      })
    })

    await page.goto(`${BASE_URL}/agents/${TEST_AGENT_ID}`)
    await page.waitForLoadState('networkidle')

    // 填写表单并提交
    await page.locator('.trade-form input[type="text"]').fill('600000.SH')
    await page.locator('.trade-form input[type="number"]').first().fill('100')
    await page.locator('.trade-form input[type="number"]').nth(1).fill('1000000')
    await page.locator('.btn-submit').click()

    // 验证错误提示
    await expect(page.locator('.error-message')).toBeVisible()
    await expect(page.locator('.error-message')).toContainText('资金不足')
  })
})
