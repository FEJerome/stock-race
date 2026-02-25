// HTTP请求封装
import Request from 'luch-request'
import { useAuthStore } from '@/stores/auth'
import { API_BASE_URL, REQUEST_TIMEOUT, ENABLE_LOG } from '@/utils/constants'

// 创建请求实例
const http = new Request({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  header: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
http.interceptors.request.use(
  (config) => {
    if (ENABLE_LOG) {
      console.log('API请求:', config.url, config.params || config.data)
    }
    
    const authStore = useAuthStore()
    
    // 统一使用JWT token（游客和正式用户都使用JWT）
    if (authStore.token && authStore.token !== 'GUEST_TOKEN') {
      config.header = {
        ...config.header,
        Authorization: `Bearer ${authStore.token}`,
      }
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
http.interceptors.response.use(
  (response) => {
    const { data } = response

    if (ENABLE_LOG) {
      console.log('API响应:', response.config?.url, data)
    }

    if (data.code === 200 || data.code === 0) {
      return data.data
    }

    handleBusinessError(data)
    return Promise.reject(data)
  },
  (error) => {
    if (ENABLE_LOG) {
      console.error('API请求失败:', error.config?.url, error)
    }
    
    handleNetworkError(error)
    return Promise.reject(error)
  }
)

function handleBusinessError(data: any) {
  const message = data.message || '请求失败'

  if (data.code === 401 || data.error?.code === 'AUTH_001') {
    const authStore = useAuthStore()
    
    // 游客模式下，尝试刷新 Token
    if (authStore.isGuestMode) {
      authStore.refreshGuestToken().then(() => {
        uni.showToast({
          title: '游客会话已刷新',
          icon: 'none',
          duration: 2000,
        })
      })
    } else {
      authStore.logout()
      uni.showToast({
        title: '登录已过期，请重新登录',
        icon: 'none',
        duration: 2000,
      })
      setTimeout(() => {
        uni.navigateTo({ url: '/pages/login/login' })
      }, 1500)
    }
    return
  }

  uni.showToast({
    title: message,
    icon: 'none',
    duration: 2000,
  })
}

function handleNetworkError(error: any) {
  let message = '网络请求失败'

  if (error.statusCode === 404) {
    message = '请求的资源不存在'
  } else if (error.statusCode === 500) {
    message = '服务器内部错误'
  } else if (error.statusCode === 503) {
    message = '服务暂时不可用'
  } else if (error.errMsg?.includes('timeout')) {
    message = '请求超时，请稍后重试'
  } else if (error.errMsg?.includes('fail')) {
    message = '网络连接失败'
  }

  uni.showToast({
    title: message,
    icon: 'none',
    duration: 2000,
  })
}

export const request = {
  get<T = any>(url: string, params?: any): Promise<T> {
    return http.get(url, { params })
  },

  post<T = any>(url: string, data?: any): Promise<T> {
    return http.post(url, data)
  },

  put<T = any>(url: string, data?: any): Promise<T> {
    return http.put(url, data)
  },

  delete<T = any>(url: string, params?: any): Promise<T> {
    return http.delete(url, { params })
  },
}

export default http
