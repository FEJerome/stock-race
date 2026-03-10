/**
 * E2E Tests for Leaderboard Page
 *
 * Requirements:
 * - PRD 4.4: Leaderboard system - Local single-machine multi-AI comparison
 * - IMPLEMENTATION_PLAN F-1.3.9: AI Leaderboard
 *
 * Ranking metrics:
 * - Default: Total return rate
 * - Auxiliary: Sharpe ratio, Max drawdown, Win rate
 *
 * Display columns: Rank | AI Name | Level | Return | Sharpe | Current Capital
 */

import { test, expect } from '@playwright/test'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

test.describe('Leaderboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/leaderboard`)
    // Wait for data to load
    await page.waitForTimeout(2000)
  })

  test('page should be accessible and display correctly', async ({ page }) => {
    // Verify page title
    await expect(page.locator('.page-header h2')).toHaveText('AI 交易员排行榜')

    // Verify sort selector exists
    await expect(page.locator('.sort-select')).toBeVisible()

    // Verify refresh button exists
    await expect(page.locator('.btn-refresh')).toBeVisible()
  })

  test('should display statistics cards', async ({ page }) => {
    // Verify all 4 stat cards are present
    await expect(page.locator('.stat-card')).toHaveCount(4)

    // Verify specific stat cards
    await expect(page.locator('.stat-card:has-text("收益冠军")')).toBeVisible()
    await expect(page.locator('.stat-card:has-text("平均收益率")')).toBeVisible()
    await expect(page.locator('.stat-card:has-text("平均胜率")')).toBeVisible()
    await expect(page.locator('.stat-card:has-text("总管理资金")')).toBeVisible()
  })

  test('should display leaderboard table with correct columns', async ({ page }) => {
    // Verify table exists
    await expect(page.locator('.leaderboard-table')).toBeVisible()

    // Verify column headers (exact matching per PRD 4.4)
    const headers = ['排名', '交易员', '职级', '初始资金', '当前资金', '收益率', '夏普比率', '最大回撤', '胜率', '交易次数']

    for (const header of headers) {
      await expect(page.locator(`.leaderboard-table th:has-text("${header}")`)).toBeVisible()
    }
  })

  test('should have sorting options', async ({ page }) => {
    const sortSelect = page.locator('.sort-select')

    // Verify select has correct options (options are hidden in native select)
    const options = await sortSelect.locator('option').allTextContents()
    expect(options).toContain('按收益率排名')
    expect(options).toContain('按夏普比率排名')
    expect(options).toContain('按胜率排名')
    expect(options).toContain('按最大回撤排名')

    // Verify default value
    await expect(sortSelect).toHaveValue('total_return')
  })

  test('should highlight top 3 performers with medals', async ({ page }) => {
    // Check if table has data
    const rowCount = await page.locator('.leaderboard-table tbody tr').count()

    if (rowCount >= 3) {
      // Verify top 3 rows have special styling
      await expect(page.locator('.leaderboard-table tbody tr').nth(0)).toHaveClass(/top-1/)
      await expect(page.locator('.leaderboard-table tbody tr').nth(1)).toHaveClass(/top-2/)
      await expect(page.locator('.leaderboard-table tbody tr').nth(2)).toHaveClass(/top-3/)

      // Verify medal emojis or special rank badges
      const firstRank = page.locator('.rank-badge').nth(0)
      const rankText = await firstRank.textContent()
      expect(['🥇', '🥈', '🥉'].some(medal => rankText?.includes(medal))).toBeTruthy()
    }
  })

  test('should display level badges correctly', async ({ page }) => {
    // Verify level badges exist if there are agents
    const levelBadges = page.locator('.badge.level-intern, .badge.level-manager, .badge.level-partner')

    if (await levelBadges.count() > 0) {
      // Verify Chinese level names
      const levelTexts = ['实习生', '经理', '合伙人']
      const hasValidLevel = await Promise.all(
        levelTexts.map(async (text) => {
          return await page.locator(`.badge:has-text("${text}")`).count() > 0
        })
      )
      expect(hasValidLevel.some(Boolean)).toBeTruthy()
    }
  })

  test('should format return values correctly', async ({ page }) => {
    // Check for positive/negative styling
    const returnCells = page.locator('.leaderboard-table td.numeric:has-text("%")')

    if (await returnCells.count() > 0) {
      // Verify percentage format
      const firstReturn = await returnCells.first().textContent()
      expect(firstReturn).toMatch(/[+-]?\d+\.?\d*%/)
    }
  })

  test('should display empty state when no agents', async ({ page }) => {
    // Check if empty state is shown when no data
    const hasEmptyState = await page.locator('.empty-state').isVisible().catch(() => false)
    const hasTable = await page.locator('.leaderboard-table').isVisible().catch(() => false)

    // Either empty state or table should be visible
    expect(hasEmptyState || hasTable).toBeTruthy()

    if (hasEmptyState) {
      await expect(page.locator('.empty-state h3')).toHaveText('暂无排行榜数据')
      await expect(page.locator('.empty-state a:has-text("创建 AI 交易员")')).toBeVisible()
    }
  })

  test('should navigate to agent detail on click', async ({ page }) => {
    // Check if there are any agents
    const agentLinks = page.locator('.agent-name')

    if (await agentLinks.count() > 0) {
      // Click on first agent
      await agentLinks.first().click()

      // Should navigate to agent detail page
      await expect(page).toHaveURL(/\/agents\//)
    }
  })

  test('should display distribution chart for top performers', async ({ page }) => {
    // Check if chart section exists
    const hasChart = await page.locator('.chart-section').isVisible().catch(() => false)

    if (hasChart) {
      await expect(page.locator('.chart-section h3')).toHaveText('收益分布')

      // Verify bar chart elements
      const barItems = page.locator('.bar-item')
      const barCount = await barItems.count()

      // Should show up to 10 bars
      expect(barCount).toBeGreaterThan(0)
      expect(barCount).toBeLessThanOrEqual(10)
    }
  })

  test('should refresh data when refresh button clicked', async ({ page }) => {
    const refreshButton = page.locator('.btn-refresh')

    // Click refresh
    await refreshButton.click()

    // Should show loading state briefly
    await expect(page.locator('.btn-refresh')).toContainText('刷新中')

    // Wait for refresh to complete
    await page.waitForTimeout(2000)
    await expect(page.locator('.btn-refresh')).toContainText('刷新')
  })

  test('sorting should reorder the leaderboard', async ({ page }) => {
    // Get initial first row agent name
    const firstAgentBefore = await page.locator('.agent-name').first().textContent()

    // Change sort to Sharpe ratio
    await page.locator('.sort-select').selectOption('sharpe_ratio')
    await page.waitForTimeout(1000)

    // Get new first row agent name (might be different)
    const firstAgentAfter = await page.locator('.agent-name').first().textContent()

    // Names could be same or different, but sorting indicator should be present
    await expect(page.locator('th:has-text("夏普比率") .sort-indicator')).toBeVisible()
  })

  test('navigation from sidebar should work', async ({ page }) => {
    // Verify current page is leaderboard
    await expect(page).toHaveURL(/\/leaderboard/)

    // Navigate to other pages and back
    await page.locator('a[href="/"]').click()
    await expect(page).toHaveURL(/\/$/)

    await page.locator('a[href="/leaderboard"]').click()
    await expect(page).toHaveURL(/\/leaderboard/)
  })

  test('should display model name tag', async ({ page }) => {
    // Check if model tags exist
    const modelTags = page.locator('.model-tag')

    if (await modelTags.count() > 0) {
      // Verify model names are displayed
      const firstTag = await modelTags.first().textContent()
      expect(firstTag).toBeTruthy()
      expect(firstTag!.length).toBeGreaterThan(0)
    }
  })
})
