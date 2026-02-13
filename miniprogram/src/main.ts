import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import uviewPlus from 'uview-plus'
// @ts-ignore
import qiunDataCharts from '@qiun/ucharts'
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)

  app.use(pinia)
  app.use(uviewPlus)
  app.use(qiunDataCharts)

  return {
    app,
  }
}
