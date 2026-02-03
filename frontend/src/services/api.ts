import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ApiResponse } from '../types/api.types';
import { useAuthStore } from '../store/auth.store';

// API基础配置
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// 创建axios实例
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加认证token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 统一错误处理
apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    // 如果响应数据有success字段，检查是否成功
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
      if (!response.data.success) {
        return Promise.reject(new Error(response.data.message || response.data.error || '请求失败'));
      }
    }
    return response;
  },
  (error) => {
    // 处理HTTP错误
    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401:
          // 未授权，清除认证状态
          useAuthStore.getState().logout();
          break;
        case 403:
          return Promise.reject(new Error('权限不足'));
        case 404:
          return Promise.reject(new Error('资源不存在'));
        case 422:
          return Promise.reject(new Error(data?.message || '数据验证失败'));
        case 429:
          return Promise.reject(new Error('请求过于频繁，请稍后再试'));
        case 500:
          return Promise.reject(new Error('服务器内部错误'));
        default:
          return Promise.reject(new Error(data?.message || `请求失败 (${status})`));
      }
    } else if (error.request) {
      // 请求已发出但没有收到响应
      return Promise.reject(new Error('网络连接失败，请检查网络设置'));
    } else {
      // 请求配置出错
      return Promise.reject(new Error(error.message || '请求配置错误'));
    }

    return Promise.reject(error);
  }
);

// API工具函数
export const api = {
  // GET请求
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    return apiClient.get<ApiResponse<T>>(url, config).then(response => response.data.data as T);
  },

  // POST请求
  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    return apiClient.post<ApiResponse<T>>(url, data, config).then(response => response.data.data as T);
  },

  // PUT请求
  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    return apiClient.put<ApiResponse<T>>(url, data, config).then(response => response.data.data as T);
  },

  // DELETE请求
  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    return apiClient.delete<ApiResponse<T>>(url, config).then(response => response.data.data as T);
  },

  // PATCH请求
  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    return apiClient.patch<ApiResponse<T>>(url, data, config).then(response => response.data.data as T);
  },

  // 原始axios实例（用于特殊需求）
  client: apiClient,
};

export default api;