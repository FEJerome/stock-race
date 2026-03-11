<template>
  <div id="app" class="dark-theme">
    <header class="app-header">
      <div class="header-brand">
        <div class="brand-logo">
          <span class="logo-icon">🌾</span>
        </div>
        <div class="brand-text">
          <h1>AI Trading Farm</h1>
          <span class="brand-tagline">Stock-Race Local</span>
        </div>
      </div>
      <nav class="header-nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-link"
          :class="{ active: $route.path === item.path || $route.path.startsWith(item.path + '/') }"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>
    </header>
    <main class="app-main">
      <div class="main-container">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>

    <!-- 沙盒水印 -->
    <div class="sandbox-watermark">
      <span class="watermark-icon">🔒</span>
      <div class="watermark-text">
        <div class="watermark-main">虚拟沙盒环境</div>
        <div class="watermark-sub">数据仅供演示</div>
      </div>
    </div>

    <!-- 欢迎弹窗 -->
    <WelcomeModal />
  </div>
</template>

<script setup lang="ts">
import { onMounted, provide, readonly, ref } from 'vue'
import WelcomeModal from './components/WelcomeModal.vue'

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/agents', label: 'AI Agents', icon: '🤖' },
  { path: '/market', label: 'Market', icon: '📈' },
  { path: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
]

// Theme management
type Theme = 'dark' | 'light' | 'auto'

const currentTheme = ref<Theme>('auto')
const effectiveTheme = ref<'dark' | 'light'>('dark')

// Check system preference
function getSystemTheme(): 'dark' | 'light' {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

// Apply theme to document
function applyTheme(theme: 'dark' | 'light') {
  effectiveTheme.value = theme
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

// Update theme based on current setting
function updateTheme() {
  if (currentTheme.value === 'auto') {
    applyTheme(getSystemTheme())
  } else {
    applyTheme(currentTheme.value)
  }
}

// Set theme explicitly
function setTheme(theme: Theme) {
  currentTheme.value = theme
  localStorage.setItem('stock-race-theme', theme)
  updateTheme()
}

// Initialize theme on mount
onMounted(() => {
  // Load saved preference
  const saved = localStorage.getItem('stock-race-theme') as Theme | null
  if (saved && ['dark', 'light', 'auto'].includes(saved)) {
    currentTheme.value = saved
  }

  // Apply initial theme
  updateTheme()

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (currentTheme.value === 'auto') {
      updateTheme()
    }
  })
})

// Provide theme to child components
provide('theme', readonly(currentTheme))
provide('effectiveTheme', readonly(effectiveTheme))
provide('setTheme', setTheme)
</script>

<style>
/* ============================================
   GLOBAL RESET & BASE STYLES
   ============================================ */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-body);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: var(--leading-normal);
  min-height: 100vh;
  overflow-x: hidden;
}

/* ============================================
   DARK THEME APP CONTAINER
   ============================================ */
.dark-theme {
  min-height: 100vh;
  background: var(--bg-primary);
  background-image:
    radial-gradient(ellipse at 20% 20%, rgba(0, 212, 255, 0.03) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.03) 0%, transparent 50%);
}

/* ============================================
   HEADER - Glassmorphism Navigation
   ============================================ */
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--glass-border);
  z-index: var(--z-fixed);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-6);
}

.header-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.brand-logo {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-purple) 100%);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
}

.logo-icon {
  font-size: 1.5rem;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-text h1 {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  background: linear-gradient(135deg, var(--text-primary) 0%, var(--accent-cyan) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
}

.brand-tagline {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: var(--font-medium);
}

/* ============================================
   NAVIGATION LINKS
   ============================================ */
.header-nav {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.nav-link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  transition: all var(--transition-fast);
  position: relative;
}

.nav-link:hover {
  color: var(--text-primary);
  background: var(--glass-highlight);
}

.nav-link.active {
  color: var(--accent-cyan);
  background: rgba(0, 212, 255, 0.1);
}

.nav-link.active::before {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 2px;
  background: var(--accent-cyan);
  border-radius: var(--radius-full);
  box-shadow: 0 0 10px var(--accent-cyan-glow);
}

.nav-icon {
  font-size: var(--text-base);
}

/* ============================================
   MAIN CONTENT AREA
   ============================================ */
.app-main {
  padding-top: var(--header-height);
  min-height: 100vh;
}

.main-container {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: var(--space-6);
}

/* ============================================
   PAGE TRANSITIONS
   ============================================ */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* ============================================
   GLOBAL ELEMENT OVERRIDES
   ============================================ */

/* Selection */
::selection {
  background: rgba(0, 212, 255, 0.3);
  color: var(--text-primary);
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--surface-elevated);
  border-radius: var(--radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--surface-hover);
}

/* Focus visible */
:focus-visible {
  outline: 2px solid var(--accent-cyan);
  outline-offset: 2px;
}

/* ============================================
   ELEMENT PLUS OVERRIDES
   ============================================ */

/* Dialog/Modal */
.el-dialog {
  background: var(--surface-elevated) !important;
  border: 1px solid var(--border-primary) !important;
  border-radius: var(--radius-xl) !important;
  box-shadow: var(--shadow-xl) !important;
}

.el-dialog__header {
  color: var(--text-primary) !important;
  border-bottom: 1px solid var(--border-secondary) !important;
  padding: var(--space-5) !important;
  margin-right: 0 !important;
}

.el-dialog__body {
  color: var(--text-secondary) !important;
  padding: var(--space-5) !important;
}

.el-dialog__title {
  font-weight: var(--font-semibold) !important;
  font-size: var(--text-lg) !important;
}

/* Message Box */
.el-message-box {
  background: var(--surface-elevated) !important;
  border: 1px solid var(--border-primary) !important;
  border-radius: var(--radius-xl) !important;
}

.el-message-box__title {
  color: var(--text-primary) !important;
}

.el-message-box__message {
  color: var(--text-secondary) !important;
}

/* Notification */
.el-notification {
  background: var(--surface-elevated) !important;
  border: 1px solid var(--border-primary) !important;
  border-radius: var(--radius-lg) !important;
  box-shadow: var(--shadow-lg) !important;
}

.el-notification__title {
  color: var(--text-primary) !important;
}

.el-notification__content {
  color: var(--text-secondary) !important;
}

/* Message */
.el-message {
  background: var(--surface-elevated) !important;
  border: 1px solid var(--border-primary) !important;
  border-radius: var(--radius-md) !important;
  box-shadow: var(--shadow-md) !important;
}

.el-message__content {
  color: var(--text-primary) !important;
}

/* Button Overrides */
.el-button {
  border-radius: var(--radius-md) !important;
  font-weight: var(--font-medium) !important;
  transition: all var(--transition-fast) !important;
}

.el-button--primary {
  background: linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-purple) 100%) !important;
  border: none !important;
  box-shadow: 0 4px 15px rgba(0, 212, 255, 0.3) !important;
}

.el-button--primary:hover {
  transform: translateY(-1px) !important;
  box-shadow: 0 6px 20px rgba(0, 212, 255, 0.4) !important;
}

.el-button--success {
  background: linear-gradient(135deg, var(--up-primary) 0%, #00b870 100%) !important;
  border: none !important;
  box-shadow: 0 4px 15px rgba(0, 208, 132, 0.3) !important;
}

.el-button--danger {
  background: linear-gradient(135deg, var(--down-primary) 0%, #e03e4c 100%) !important;
  border: none !important;
  box-shadow: 0 4px 15px rgba(255, 71, 87, 0.3) !important;
}

/* Input Overrides */
.el-input__wrapper {
  background: var(--surface-primary) !important;
  box-shadow: 0 0 0 1px var(--border-primary) inset !important;
  border-radius: var(--radius-md) !important;
}

.el-input__wrapper:hover {
  box-shadow: 0 0 0 1px var(--border-accent) inset !important;
}

.el-input__wrapper.is-focus {
  box-shadow: 0 0 0 1px var(--accent-cyan) inset !important;
}

.el-input__inner {
  color: var(--text-primary) !important;
  font-family: var(--font-body) !important;
}

.el-input__inner::placeholder {
  color: var(--text-muted) !important;
}

/* Select Overrides */
.el-select-dropdown {
  background: var(--surface-elevated) !important;
  border: 1px solid var(--border-primary) !important;
  border-radius: var(--radius-md) !important;
  box-shadow: var(--shadow-lg) !important;
}

.el-select-dropdown__item {
  color: var(--text-secondary) !important;
}

.el-select-dropdown__item:hover,
.el-select-dropdown__item.selected {
  background: var(--surface-hover) !important;
  color: var(--text-primary) !important;
}

/* Table Overrides */
.el-table {
  background: transparent !important;
  color: var(--text-primary) !important;
}

.el-table th.el-table__cell {
  background: var(--surface-secondary) !important;
  color: var(--text-secondary) !important;
  font-weight: var(--font-semibold) !important;
  text-transform: uppercase;
  font-size: var(--text-xs) !important;
  letter-spacing: 0.05em;
}

.el-table td.el-table__cell {
  background: transparent !important;
  border-bottom: 1px solid var(--border-secondary) !important;
}

.el-table tr:hover td.el-table__cell {
  background: var(--surface-hover) !important;
}

.el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell {
  background: var(--surface-hover) !important;
}

/* Card Overrides */
.el-card {
  background: var(--surface-primary) !important;
  border: 1px solid var(--border-primary) !important;
  border-radius: var(--radius-lg) !important;
}

.el-card__header {
  border-bottom: 1px solid var(--border-secondary) !important;
  color: var(--text-primary) !important;
  font-weight: var(--font-semibold) !important;
}

/* Popover Overrides */
.el-popover {
  background: var(--surface-elevated) !important;
  border: 1px solid var(--border-primary) !important;
  border-radius: var(--radius-lg) !important;
  box-shadow: var(--shadow-lg) !important;
}

.el-popover__title {
  color: var(--text-primary) !important;
}

/* ============================================
   RESPONSIVE ADJUSTMENTS
   ============================================ */
@media (max-width: 1024px) {
  .nav-label {
    display: none;
  }

  .nav-link {
    padding: var(--space-2);
  }

  .brand-tagline {
    display: none;
  }
}

@media (max-width: 768px) {
  .app-header {
    padding: 0 var(--space-4);
  }

  .main-container {
    padding: var(--space-4);
  }

  .brand-text h1 {
    font-size: var(--text-base);
  }
}

/* ============================================
   SANDBOX WATERMARK
   ============================================ */
.sandbox-watermark {
  position: fixed;
  bottom: var(--space-4);
  right: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  z-index: var(--z-fixed);
  opacity: 0.8;
  transition: opacity var(--transition-fast);
}

.sandbox-watermark:hover {
  opacity: 1;
}

.watermark-icon {
  font-size: 1.25rem;
  filter: grayscale(0.3);
}

.watermark-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.watermark-main {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-secondary);
}

.watermark-sub {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .sandbox-watermark {
    bottom: var(--space-2);
    right: var(--space-2);
    padding: var(--space-2) var(--space-3);
  }

  .watermark-icon {
    font-size: 1rem;
  }

  .watermark-main,
  .watermark-sub {
    font-size: 0.625rem;
  }
}
</style>
