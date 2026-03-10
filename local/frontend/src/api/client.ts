/**
 * HTTP client for backend API
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.detail || `HTTP ${response.status}`)
    }

    return data
  }

  get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path)
  }

  post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body)
  }

  patch<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, body)
  }

  delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path)
  }
}

export const api = new ApiClient(API_BASE_URL)
