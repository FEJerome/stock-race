import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import uviewPlus from 'uview-plus'
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)

  app.use(pinia)
  app.use(uviewPlus)
  // Note: uCharts v2.x 不再是 Vue 插件，直接使用工具函数
  // import { createUChart } from '@/utils/ucharts'

  return {
    app,
  }
}
