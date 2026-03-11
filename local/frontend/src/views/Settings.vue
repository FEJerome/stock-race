<template>
  <div class="settings-page">
    <div class="page-header">
      <h2>系统设置</h2>
      <span class="subtitle">配置 API 密钥和系统参数</span>
    </div>

    <div class="settings-grid">
      <!-- API Keys Section -->
      <div class="settings-card">
        <div class="card-header">
          <h3>
            <span class="icon">🔑</span>
            API 密钥配置
          </h3>
          <p class="card-desc">配置 AI 模型 API 密钥，用于 AI 交易决策</p>
        </div>

        <div class="form-section">
          <!-- Moonshot API Key -->
          <div class="form-group">
            <label class="form-label">
              Moonshot API Key (Kimi K2.5)
              <span class="required">*</span>
            </label>
            <div class="input-group">
              <input
                v-model="settings.moonshot_api_key"
                :type="showMoonshotKey ? 'text' : 'password'"
                placeholder="sk-..."
                class="form-input"
              />
              <button
                type="button"
                class="toggle-btn"
                @click="showMoonshotKey = !showMoonshotKey"
              >
                {{ showMoonshotKey ? '👁️' : '👁️‍🗨️' }}
              </button>
            </div>
            <p class="input-hint">
              用于 Kimi K2.5 模型决策，
              <a href="https://platform.moonshot.cn/" target="_blank">获取密钥</a>
            </p>
            <div v-if="validationErrors.moonshot_api_key" class="error-text">
              {{ validationErrors.moonshot_api_key }}
            </div>
          </div>

          <!-- DeepSeek API Key -->
          <div class="form-group">
            <label class="form-label">
              DeepSeek API Key
              <span class="optional">(可选)</span>
            </label>
            <div class="input-group">
              <input
                v-model="settings.deepseek_api_key"
                :type="showDeepseekKey ? 'text' : 'password'"
                placeholder="sk-..."
                class="form-input"
              />
              <button
                type="button"
                class="toggle-btn"
                @click="showDeepseekKey = !showDeepseekKey"
              >
                {{ showDeepseekKey ? '👁️' : '👁️‍🗨️' }}
              </button>
            </div>
            <p class="input-hint">
              用于 DeepSeek Chat 模型，
              <a href="https://platform.deepseek.com/" target="_blank">获取密钥</a>
            </p>
          </div>

          <!-- Qwen API Key -->
          <div class="form-group">
            <label class="form-label">
              通义千问 API Key
              <span class="optional">(可选)</span>
            </label>
            <div class="input-group">
              <input
                v-model="settings.qwen_api_key"
                :type="showQwenKey ? 'text' : 'password'"
                placeholder="sk-..."
                class="form-input"
              />
              <button
                type="button"
                class="toggle-btn"
                @click="showQwenKey = !showQwenKey"
              >
                {{ showQwenKey ? '👁️' : '👁️‍🗨️' }}
              </button>
            </div>
            <p class="input-hint">
              用于通义千问 Max 模型，
              <a href="https://dashscope.aliyun.com/" target="_blank">获取密钥</a>
            </p>
          </div>
        </div>

        <div class="card-actions">
          <button
            class="btn-primary"
            :disabled="saving"
            @click="saveSettings"
          >
            {{ saving ? '保存中...' : '保存配置' }}
          </button>
          <button
            class="btn-secondary"
            :disabled="saving"
            @click="testConnection"
          >
            测试连接
          </button>
        </div>
      </div>

      <!-- Appearance Settings -->
      <div class="settings-card">
        <div class="card-header">
          <h3>
            <span class="icon">🎨</span>
            外观设置
          </h3>
          <p class="card-desc">自定义界面主题和显示偏好</p>
        </div>

        <div class="form-section">
          <div class="form-group">
            <label class="form-label">主题模式</label>
            <div class="theme-options">
              <button
                v-for="option in themeOptions"
                :key="option.value"
                class="theme-option"
                :class="{ active: currentTheme === option.value }"
                @click="setTheme(option.value as Theme)"
              >
                <span class="theme-icon">{{ option.icon }}</span>
                <span class="theme-label">{{ option.label }}</span>
              </button>
            </div>            <p class="input-hint">
              {{ themeHint }}
            </p>
          </div>
        </div>
      </div>

      <!-- System Info Section -->
      <div class="settings-card">
        <div class="card-header">
          <h3>
            <span class="icon">ℹ️</span>
            系统信息
          </h3>
        </div>

        <div class="info-list">
          <div class="info-item">
            <span class="info-label">后端版本</span>
            <span class="info-value">{{ systemInfo.backend_version }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">前端版本</span>
            <span class="info-value">{{ systemInfo.frontend_version }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">数据库</span>
            <span class="info-value">{{ systemInfo.database }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Python 版本</span>
            <span class="info-value">{{ systemInfo.python_version }}</span>
          </div>
        </div>
      </div>

      <!-- Data Management Section -->
      <div class="settings-card warning">
        <div class="card-header">
          <h3>
            <span class="icon">⚠️</span>
            数据管理
          </h3>
          <p class="card-desc">谨慎操作，数据删除后无法恢复</p>
        </div>

        <div class="danger-zone">
          <div class="danger-item">
            <div class="danger-info">
              <h4>清除所有行情缓存</h4>
              <p>删除本地存储的所有行情数据，下次启动时重新采集</p>
            </div>
            <button class="btn-danger" @click="confirmClearCache">
              清除缓存
            </button>
          </div>

          <div class="danger-item">
            <div class="danger-info">
              <h4>重置数据库</h4>
              <p>删除所有数据（包括AI交易员、交易记录、持仓等），不可恢复！</p>
            </div>
            <button class="btn-danger" @click="confirmResetDatabase">
              重置数据库
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Test Result Modal -->
    <div v-if="testResult.show" class="modal-overlay" @click.self="testResult.show = false">
      <div class="modal">
        <h3>API 连接测试</h3>
        <div class="test-results">
          <div
            v-for="(result, name) in testResult.results"
            :key="name"
            class="test-item"
            :class="result.status"
          >
            <span class="test-name">{{ name }}</span>
            <span class="test-status">
              {{ result.status === 'success' ? '✅ 成功' : result.status === 'error' ? '❌ 失败' : '⏳ 测试中' }}
            </span>
            <p v-if="result.message" class="test-message">{{ result.message }}</p>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="testResult.show = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, inject, computed, type Ref, type Readonly } from 'vue'
import { showSuccess, showError } from '../utils/error-handler'

interface Settings {
  moonshot_api_key: string
  deepseek_api_key: string
  qwen_api_key: string
}

interface SystemInfo {
  backend_version: string
  frontend_version: string
  database: string
  python_version: string
}

type Theme = 'dark' | 'light' | 'auto'

const setTheme = inject<(theme: Theme) => void>('setTheme', () => {})
const currentTheme = inject<Readonly<Ref<Theme>>>('theme', ref('auto'))

const settings = reactive<Settings>({
  moonshot_api_key: '',
  deepseek_api_key: '',
  qwen_api_key: '',
})

const systemInfo = reactive<SystemInfo>({
  backend_version: '1.0.0',
  frontend_version: '1.0.0',
  database: 'SQLite',
  python_version: '3.11+',
})

const showMoonshotKey = ref(false)
const showDeepseekKey = ref(false)
const showQwenKey = ref(false)
const saving = ref(false)

const validationErrors = reactive<Partial<Record<keyof Settings, string>>>({})

const testResult = reactive({
  show: false,
  results: {} as Record<string, { status: 'pending' | 'success' | 'error'; message?: string }>,
})

// Theme options
const themeOptions = [
  { value: 'auto', label: '跟随系统', icon: '🖥️' },
  { value: 'dark', label: '深色主题', icon: '🌙' },
  { value: 'light', label: '浅色主题', icon: '☀️' },
]

const themeHint = computed(() => {
  switch (currentTheme.value) {
    case 'auto':
      return '自动跟随系统主题设置，检测失败时默认使用深色主题'
    case 'dark':
      return '始终使用深色主题，适合夜间使用'
    case 'light':
      return '始终使用浅色主题，适合日间使用'
    default:
      return ''
  }
})

// Load settings from localStorage on mount
onMounted(() => {
  loadSettings()
  fetchSystemInfo()
})

function loadSettings() {
  const saved = localStorage.getItem('stock-race-settings')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      settings.moonshot_api_key = parsed.moonshot_api_key || ''
      settings.deepseek_api_key = parsed.deepseek_api_key || ''
      settings.qwen_api_key = parsed.qwen_api_key || ''
    } catch {
      console.error('Failed to parse settings')
    }
  }

  // Also check environment variables (via API)
  fetchCurrentSettings()
}

async function fetchCurrentSettings() {
  try {
    const response = await fetch('/api/settings')
    if (response.ok) {
      const data = await response.json()
      if (data.code === 0 && data.data) {
        // Only update if localStorage doesn't have values
        if (!settings.moonshot_api_key) {
          settings.moonshot_api_key = data.data.moonshot_api_key || ''
        }
        if (!settings.deepseek_api_key) {
          settings.deepseek_api_key = data.data.deepseek_api_key || ''
        }
        if (!settings.qwen_api_key) {
          settings.qwen_api_key = data.data.qwen_api_key || ''
        }
      }
    }
  } catch {
    // API might not exist yet, use localStorage only
  }
}

async function fetchSystemInfo() {
  try {
    const response = await fetch('/api/health')
    if (response.ok) {
      const data = await response.json()
      if (data.data) {
        systemInfo.backend_version = data.data.version || '1.0.0'
        systemInfo.python_version = data.data.python_version || '3.11+'
      }
    }
  } catch {
    // Ignore error
  }
}

function validateSettings(): boolean {
  let valid = true
  validationErrors.moonshot_api_key = undefined

  // Moonshot key is required if using Kimi model
  if (!settings.moonshot_api_key) {
    validationErrors.moonshot_api_key = '请输入 Moonshot API Key'
    valid = false
  } else if (!settings.moonshot_api_key.startsWith('sk-')) {
    validationErrors.moonshot_api_key = 'API Key 格式不正确，应以 sk- 开头'
    valid = false
  }

  return valid
}

async function saveSettings() {
  if (!validateSettings()) {
    showError(new Error('请检查输入'), { defaultMessage: '配置验证失败' })
    return
  }

  saving.value = true
  try {
    // Save to localStorage
    localStorage.setItem('stock-race-settings', JSON.stringify(settings))

    // Also save to backend if API exists
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })

    if (!response.ok && response.status !== 404) {
      throw new Error('保存到服务器失败')
    }

    showSuccess('设置已保存')
  } catch (err) {
    // Still saved to localStorage, so it's not a total failure
    showSuccess('设置已保存到本地')
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testResult.show = true
  testResult.results = {
    Moonshot: { status: 'pending' },
    DeepSeek: { status: settings.deepseek_api_key ? 'pending' : 'success', message: settings.deepseek_api_key ? undefined : '未配置' },
    '通义千问': { status: settings.qwen_api_key ? 'pending' : 'success', message: settings.qwen_api_key ? undefined : '未配置' },
  }

  // Test Moonshot
  if (settings.moonshot_api_key) {
    try {
      const response = await fetch('/api/test-connection/moonshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: settings.moonshot_api_key }),
      })
      const data = await response.json()
      testResult.results.Moonshot = {
        status: data.code === 0 ? 'success' : 'error',
        message: data.message,
      }
    } catch {
      testResult.results.Moonshot = {
        status: 'error',
        message: '连接失败，请检查网络',
      }
    }
  } else {
    testResult.results.Moonshot = {
      status: 'error',
      message: '未配置 API Key',
    }
  }

  // Test DeepSeek
  if (settings.deepseek_api_key) {
    try {
      const response = await fetch('/api/test-connection/deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: settings.deepseek_api_key }),
      })
      const data = await response.json()
      testResult.results.DeepSeek = {
        status: data.code === 0 ? 'success' : 'error',
        message: data.message,
      }
    } catch {
      testResult.results.DeepSeek = {
        status: 'error',
        message: '连接失败',
      }
    }
  }

  // Test Qwen
  if (settings.qwen_api_key) {
    try {
      const response = await fetch('/api/test-connection/qwen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: settings.qwen_api_key }),
      })
      const data = await response.json()
      testResult.results['通义千问'] = {
        status: data.code === 0 ? 'success' : 'error',
        message: data.message,
      }
    } catch {
      testResult.results['通义千问'] = {
        status: 'error',
        message: '连接失败',
      }
    }
  }
}

function confirmClearCache() {
  if (!confirm('确定要清除所有行情缓存吗？下次启动将重新采集数据。')) return

  localStorage.removeItem('stock-race-market-cache')
  showSuccess('缓存已清除')
}

function confirmResetDatabase() {
  if (!confirm('⚠️ 警告：此操作将删除所有数据，包括AI交易员、交易记录、持仓等！\n\n确定要继续吗？')) return

  if (!prompt('请输入 "RESET" 以确认重置数据库：') === 'RESET') {
    showError(new Error('确认失败'), { defaultMessage: '输入不正确，操作已取消' })
    return
  }

  // Call reset API
  fetch('/api/system/reset', { method: 'POST' })
    .then(() => {
      showSuccess('数据库已重置，页面将刷新')
      setTimeout(() => window.location.reload(), 1500)
    })
    .catch(() => {
      showError(new Error('重置失败'), { defaultMessage: '数据库重置失败' })
    })
}
</script>

<style scoped>
.settings-page {
  padding: 1rem;
  max-width: 900px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 1.5rem;
}

.page-header h2 {
  font-size: 1.5rem;
  color: #2c3e50;
  margin-bottom: 0.25rem;
}

.subtitle {
  color: #666;
  font-size: 0.875rem;
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.settings-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.settings-card.warning {
  border: 1px solid #ffcdd2;
}

.card-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
}

.card-header h3 {
  font-size: 1.1rem;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}

.icon {
  font-size: 1.25rem;
}

.card-desc {
  margin: 0.5rem 0 0;
  color: #666;
  font-size: 0.875rem;
}

.form-section {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #333;
  margin-bottom: 0.5rem;
}

.required {
  color: #f44336;
  margin-left: 0.25rem;
}

.optional {
  color: #999;
  font-weight: normal;
  margin-left: 0.25rem;
  font-size: 0.75rem;
}

.input-group {
  display: flex;
  gap: 0.5rem;
}

.form-input {
  flex: 1;
  padding: 0.625rem 0.875rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #2c3e50;
  box-shadow: 0 0 0 3px rgba(44, 62, 80, 0.1);
}

.toggle-btn {
  padding: 0.5rem 0.75rem;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}

.toggle-btn:hover {
  background: #e8e8e8;
}

.input-hint {
  margin: 0.375rem 0 0;
  font-size: 0.75rem;
  color: #666;
}

.input-hint a {
  color: #1976d2;
  text-decoration: none;
}

.input-hint a:hover {
  text-decoration: underline;
}

.error-text {
  color: #f44336;
  font-size: 0.75rem;
  margin-top: 0.375rem;
}

.card-actions {
  padding: 1rem 1.5rem;
  border-top: 1px solid #f0f0f0;
  display: flex;
  gap: 0.75rem;
}

.btn-primary {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 0.625rem 1.25rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.2s, transform 0.1s;
}

.btn-primary:hover:not(:disabled) {
  background: #34495e;
}

.btn-primary:active:not(:disabled) {
  transform: translateY(1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f5f5f5;
  color: #333;
  border: 1px solid #ddd;
  padding: 0.625rem 1.25rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-secondary:hover:not(:disabled) {
  background: #e8e8e8;
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.info-list {
  padding: 1rem 1.5rem;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 0.875rem 0;
  border-bottom: 1px solid #f0f0f0;
}

.info-item:last-child {
  border-bottom: none;
}

.info-label {
  color: #666;
  font-size: 0.875rem;
}

.info-value {
  color: #333;
  font-weight: 500;
  font-size: 0.875rem;
}

.danger-zone {
  padding: 1rem 1.5rem;
}

.danger-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  border-bottom: 1px solid #f0f0f0;
}

.danger-item:last-child {
  border-bottom: none;
}

.danger-info h4 {
  margin: 0 0 0.25rem;
  font-size: 0.9375rem;
  color: #333;
}

.danger-info p {
  margin: 0;
  font-size: 0.8125rem;
  color: #666;
}

.btn-danger {
  background: #ffebee;
  color: #c62828;
  border: 1px solid #ef9a9a;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-danger:hover {
  background: #ffcdd2;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.5rem;
}

.modal h3 {
  margin: 0 0 1rem;
  font-size: 1.125rem;
  color: #2c3e50;
}

.test-results {
  margin-bottom: 1.5rem;
}

.test-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 0.5rem;
  background: #f8f9fa;
}

.test-item.success {
  background: #e8f5e9;
}

.test-item.error {
  background: #ffebee;
}

.test-name {
  font-weight: 500;
  color: #333;
  flex: 1;
}

.test-status {
  font-size: 0.8125rem;
}

.test-message {
  width: 100%;
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: #666;
}

.test-item.error .test-message {
  color: #c62828;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
}

/* Theme Options */
.theme-options {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #f8f9fa;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 80px;
}

.theme-option:hover {
  border-color: #2c3e50;
  background: #fff;
}

.theme-option.active {
  border-color: #2c3e50;
  background: #2c3e50;
  color: white;
}

.theme-icon {
  font-size: 1.5rem;
}

.theme-label {
  font-size: 0.75rem;
  font-weight: 500;
}

@media (max-width: 640px) {
  .theme-options {
    flex-direction: column;
  }

  .theme-option {
    flex-direction: row;
    justify-content: flex-start;
    padding: 0.75rem 1rem;
  }

  .theme-icon {
    font-size: 1.25rem;
  }
}
</style>
