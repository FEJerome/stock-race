import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ElMessage, ElNotification } from 'element-plus'
import 'element-plus/dist/index.css'
import router from './router'
import App from './App.vue'
import { globalErrorHandler } from './utils/error-handler'

const app = createApp(App)

// 配置全局错误处理
app.config.errorHandler = globalErrorHandler

app.use(createPinia())
app.use(router)

// 配置 Element Plus
app.use(ElMessage)
app.use(ElNotification)

app.mount('#app')
