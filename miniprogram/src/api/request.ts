// HTTP请求封装
import Request from 'luch-request'
import { useAuthStore } from '@/stores/auth'
import { API_BASE_URL, REQUEST_TIMEOUT } from '@/utils/constants'

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
    // 添加认证token
    const authStore = useAuthStore()
    if (authStore.token) {
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

    // 业务成功
    if (data.code === 200 || data.code === 0) {
      return data.data
    }

    // 业务错误
    handleBusinessError(data)
    return Promise.reject(data)
  },
  (error) => {
    // 网络或服务器错误
    handleNetworkError(error)
    return Promise.reject(error)
  }
)

// 处理业务错误
function handleBusinessError(data: any) {
  const message = data.message || '请求失败'

  // 未授权，跳转到登录
  if (data.code === 401) {
    const authStore = useAuthStore()
    authStore.logout()
    uni.showToast({
      title: '登录已过期，请重新登录',
      icon: 'none',
      duration: 2000,
    })
    setTimeout(() => {
      uni.navigateTo({ url: '/pages/login/login' })
    }, 1500)
    return
  }

  uni.showToast({
    title: message,
    icon: 'none',
    duration: 2000,
  })
}

// 处理网络错误
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

// 封装请求方法
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
