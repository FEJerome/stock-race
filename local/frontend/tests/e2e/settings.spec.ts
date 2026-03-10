/**
 * E2E Tests for Settings Page
 *
 * Requirements:
 * - PRD 4.1.7: Self-filled API mode - API Key configuration
 * - IMPLEMENTATION_PLAN F-1.3.10: Settings.vue API Key configuration
 */

import { test, expect } from '@playwright/test'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto(`${FRONTEND_URL}/settings`)
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  test('page should be accessible and display correctly', async ({ page }) => {
    // Verify page title
    await expect(page.locator('.page-header h2')).toHaveText('系统设置')
    await expect(page.locator('.page-header .subtitle')).toContainText('配置 API 密钥')

    // Verify all settings cards are present
    await expect(page.locator('.settings-card')).toHaveCount(3)

    // Verify API Keys section
    const apiKeyCard = page.locator('.settings-card').first()
    await expect(apiKeyCard.locator('h3')).toContainText('API 密钥配置')
  })

  test('should display API key input fields for all providers', async ({ page }) => {
    // Verify Moonshot API Key field
    await expect(page.locator('label:has-text("Moonshot API Key")')).toBeVisible()
    await expect(page.locator('input[placeholder="sk-..."]')).toHaveCount(3)

    // Verify all three providers are present
    await expect(page.locator('text=Moonshot API Key (Kimi K2.5)')).toBeVisible()
    await expect(page.locator('text=DeepSeek API Key')).toBeVisible()
    await expect(page.locator('text=通义千问 API Key')).toBeVisible()
  })

  test('should mask API keys by default (security)', async ({ page }) => {
    // Enter a test API key
    const moonshotInput = page.locator('.form-group:has-text("Moonshot") input')
    await moonshotInput.fill('sk-test123456789')

    // Verify input type is password (masked)
    await expect(moonshotInput).toHaveAttribute('type', 'password')

    // Click toggle button to show
    await page.locator('.form-group:has-text("Moonshot") .toggle-btn').click()
    await expect(moonshotInput).toHaveAttribute('type', 'text')

    // Verify value is displayed
    await expect(moonshotInput).toHaveValue('sk-test123456789')
  })

  test('should save API keys to localStorage', async ({ page }) => {
    // Fill in API keys
    await page.locator('.form-group:has-text("Moonshot") input').fill('sk-moonshot-test123')
    await page.locator('.form-group:has-text("DeepSeek") input').fill('sk-deepseek-test456')
    await page.locator('.form-group:has-text("通义千问") input').fill('sk-qwen-test789')

    // Click save button
    await page.locator('.card-actions .btn-primary').click()

    // Verify localStorage
    const savedSettings = await page.evaluate(() => {
      const data = localStorage.getItem('stock-race-settings')
      return data ? JSON.parse(data) : null
    })

    expect(savedSettings).toBeTruthy()
    expect(savedSettings.moonshot_api_key).toBe('sk-moonshot-test123')
    expect(savedSettings.deepseek_api_key).toBe('sk-deepseek-test456')
    expect(savedSettings.qwen_api_key).toBe('sk-qwen-test789')
  })

  test('should load saved API keys from localStorage', async ({ page }) => {
    // Pre-populate localStorage
    await page.evaluate(() => {
      localStorage.setItem('stock-race-settings', JSON.stringify({
        moonshot_api_key: 'sk-saved-moonshot',
        deepseek_api_key: 'sk-saved-deepseek',
        qwen_api_key: 'sk-saved-qwen'
      }))
    })

    // Reload page
    await page.reload()

    // Verify inputs have saved values (masked)
    const moonshotInput = page.locator('.form-group:has-text("Moonshot") input')
    await expect(moonshotInput).toHaveValue('sk-saved-moonshot')
  })

  test('should have test connection buttons', async ({ page }) => {
    // Verify test connection button exists
    await expect(page.locator('button:has-text("测试连接")')).toBeVisible()

    // Enter a test API key first
    await page.locator('.form-group:has-text("Moonshot") input').fill('sk-test-key')

    // Click test connection
    await page.locator('button:has-text("测试连接")').click()

    // Verify modal appears
    await expect(page.locator('.modal:has-text("API 连接测试")')).toBeVisible()
    await expect(page.locator('.test-item:has-text("Moonshot")')).toBeVisible()
  })

  test('should display system information', async ({ page }) => {
    // Navigate to system info card (third card)
    const systemCard = page.locator('.settings-card').nth(1)

    await expect(systemCard.locator('h3')).toContainText('系统信息')

    // Verify info items exist
    await expect(systemCard.locator('.info-item:has-text("后端版本")')).toBeVisible()
    await expect(systemCard.locator('.info-item:has-text("前端版本")')).toBeVisible()
    await expect(systemCard.locator('.info-item:has-text("数据库")')).toBeVisible()
  })

  test('should have data management section with danger actions', async ({ page }) => {
    // Navigate to danger zone card
    const dangerCard = page.locator('.settings-card.warning')

    await expect(dangerCard.locator('h3')).toContainText('数据管理')
    await expect(dangerCard.locator('.card-desc')).toContainText('谨慎操作')

    // Verify danger buttons exist
    await expect(dangerCard.locator('button:has-text("清除缓存")')).toBeVisible()
    await expect(dangerCard.locator('button:has-text("重置数据库")')).toBeVisible()
  })

  test('should validate API key format', async ({ page }) => {
    // Enter invalid API key (not starting with sk-)
    await page.locator('.form-group:has-text("Moonshot") input').fill('invalid-key')

    // Click save
    await page.locator('.card-actions .btn-primary').click()

    // Should show error message
    await expect(page.locator('.error-text')).toBeVisible()
    await expect(page.locator('.error-text')).toContainText('API Key 格式不正确')
  })

  test('navigation from sidebar should work', async ({ page }) => {
    // Verify current page is settings
    await expect(page).toHaveURL(/\/settings/)

    // Navigate to other pages and back
    await page.locator('a[href="/"]').click()
    await expect(page).toHaveURL(/\/$/)

    await page.locator('a[href="/settings"]').click()
    await expect(page).toHaveURL(/\/settings/)
  })
})
