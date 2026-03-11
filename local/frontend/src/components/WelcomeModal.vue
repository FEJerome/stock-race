<template>
  <Transition name="modal">
    <div v-if="show" class="welcome-modal-overlay" @click.self="close">
      <div class="welcome-modal">
        <div class="modal-header">
          <div class="brand">
            <span class="brand-icon">🌾</span>
            <h2>AI 财商训练场</h2>
          </div>
          <span class="version-badge">Local 版</span>
        </div>

        <div class="modal-body">
          <div class="section">
            <h3>🎯 核心概念</h3>
            <div class="concepts">
              <div class="concept-item">
                <span class="concept-icon">🤖</span>
                <div class="concept-text">
                  <strong>AI 模型农场</strong>
                  <span>招聘 Kimi、DeepSeek、通义千问等 AI 作为你的"交易员"</span>
                </div>
              </div>
              <div class="concept-item">
                <span class="concept-icon">👔</span>
                <div class="concept-text">
                  <strong>投资经理</strong>
                  <span>你作为投资经理，为 AI 交易员制定投资策略</span>
                </div>
              </div>
              <div class="concept-item">
                <span class="concept-icon">📈</span>
                <div class="concept-text">
                  <strong>虚拟交易</strong>
                  <span>基于实时行情数据进行模拟交易，验证策略效果</span>
                </div>
              </div>
            </div>
          </div>

          <div class="section disclaimer">
            <h3>⚠️ 重要声明</h3>
            <ul>
              <li>本平台为 <strong>虚拟沙盒环境</strong>，所有交易均为模拟</li>
              <li>行情数据仅供演示，不构成投资建议</li>
              <li>AI 决策结果仅供参考，投资有风险，入市需谨慎</li>
            </ul>
          </div>
        </div>

        <div class="modal-footer">
          <label class="dont-show-again">
            <input v-model="dontShowAgain" type="checkbox" />
            <span>下次不再显示</span>
          </label>
          <button class="btn-start" @click="start">
            开始使用
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const show = ref(false)
const dontShowAgain = ref(false)

const STORAGE_KEY = 'stock-race-welcome-shown'

onMounted(() => {
  // Check if user has already seen the welcome modal
  const hasSeen = localStorage.getItem(STORAGE_KEY)
  if (!hasSeen) {
    show.value = true
  }
})

function close() {
  show.value = false
}

function start() {
  if (dontShowAgain.value) {
    localStorage.setItem(STORAGE_KEY, 'true')
  }
  show.value = false
}
</script>

<style scoped>
.welcome-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal-backdrop, 400);
  padding: 1rem;
}

.welcome-modal {
  background: var(--surface-primary, #141b2d);
  border: 1px solid var(--border-primary, rgba(255, 255, 255, 0.1));
  border-radius: var(--radius-xl, 16px);
  max-width: 520px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-xl, 0 20px 25px rgba(0, 0, 0, 0.6));
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 1.5rem 1rem;
  border-bottom: 1px solid var(--border-secondary, rgba(255, 255, 255, 0.06));
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.brand-icon {
  font-size: 2rem;
}

.brand h2 {
  font-size: 1.25rem;
  font-weight: var(--font-bold, 700);
  color: var(--text-primary, #ffffff);
  margin: 0;
  background: linear-gradient(135deg, var(--text-primary, #ffffff) 0%, var(--accent-cyan, #00d4ff) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.version-badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.625rem;
  background: var(--surface-secondary, #1a2332);
  border: 1px solid var(--border-primary, rgba(255, 255, 255, 0.1));
  border-radius: var(--radius-full, 9999px);
  color: var(--text-muted, #64748b);
}

.modal-body {
  padding: 1.5rem;
}

.section {
  margin-bottom: 1.5rem;
}

.section:last-child {
  margin-bottom: 0;
}

.section h3 {
  font-size: 0.9375rem;
  font-weight: var(--font-semibold, 600);
  color: var(--text-primary, #ffffff);
  margin: 0 0 1rem;
}

.concepts {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.concept-item {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  padding: 0.875rem;
  background: var(--surface-secondary, #1a2332);
  border-radius: var(--radius-md, 8px);
}

.concept-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.concept-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.concept-text strong {
  font-size: 0.875rem;
  color: var(--text-primary, #ffffff);
}

.concept-text span {
  font-size: 0.8125rem;
  color: var(--text-secondary, #a0aec0);
  line-height: 1.4;
}

.disclaimer {
  background: rgba(255, 71, 87, 0.05);
  border: 1px solid rgba(255, 71, 87, 0.2);
  border-radius: var(--radius-md, 8px);
  padding: 1rem;
}

.disclaimer h3 {
  color: var(--down-primary, #ff4757);
  margin-bottom: 0.75rem;
}

.disclaimer ul {
  margin: 0;
  padding-left: 1.25rem;
}

.disclaimer li {
  font-size: 0.8125rem;
  color: var(--text-secondary, #a0aec0);
  margin-bottom: 0.5rem;
  line-height: 1.4;
}

.disclaimer li:last-child {
  margin-bottom: 0;
}

.disclaimer li strong {
  color: var(--down-primary, #ff4757);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem 1.5rem;
  gap: 1rem;
}

.dont-show-again {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--text-muted, #64748b);
  cursor: pointer;
  user-select: none;
}

.dont-show-again input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent-cyan, #00d4ff);
  cursor: pointer;
}

.btn-start {
  padding: 0.625rem 1.5rem;
  background: linear-gradient(135deg, var(--accent-cyan, #00d4ff) 0%, var(--accent-purple, #8b5cf6) 100%);
  border: none;
  border-radius: var(--radius-md, 8px);
  color: white;
  font-size: 0.875rem;
  font-weight: var(--font-semibold, 600);
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(0, 212, 255, 0.3);
}

.btn-start:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0, 212, 255, 0.4);
}

.btn-start:active {
  transform: translateY(0);
}

/* Modal Transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .welcome-modal,
.modal-leave-active .welcome-modal {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.modal-enter-from .welcome-modal,
.modal-leave-to .welcome-modal {
  transform: scale(0.95);
  opacity: 0;
}

/* Responsive */
@media (max-width: 640px) {
  .welcome-modal-overlay {
    padding: 0.5rem;
  }

  .welcome-modal {
    max-height: 95vh;
  }

  .modal-header,
  .modal-body,
  .modal-footer {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .brand h2 {
    font-size: 1.125rem;
  }

  .modal-footer {
    flex-direction: column-reverse;
    gap: 0.75rem;
  }

  .btn-start {
    width: 100%;
  }
}
</style>
