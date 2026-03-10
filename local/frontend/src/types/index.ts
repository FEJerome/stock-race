// Type definitions

export interface HealthStatus {
  status: string
  version: string
  timestamp: string
}

export interface ApiResponse<T> {
  code: number
  message?: string
  data: T
}

// AI Agent types
export interface Agent {
  id: string
  name: string
  initialCapital: number
  currentCapital: number
  status: 'active' | 'paused'
  createdAt: string
}

// Market data types
export interface Quote {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
}
