/**
 * Market Data API client
 */
import { api } from './client'

export interface Quote {
  symbol: string
  name: string
  price: number
  change: number
  change_percent: number
  volume: number
  open?: number
  high?: number
  low?: number
  prev_close?: number
  timestamp: string
  source?: string
  sources?: string[]
  confidence?: number
}

export interface DataSourceHealth {
  status: string
  latency_ms: number
  last_success?: string
  error_rate: number
  weight: number
}

export const marketApi = {
  /**
   * Get all market quotes
   */
  getQuotes() {
    return api.get<{ items: Quote[], total: number }>('/api/market/quotes')
  },

  /**
   * Get quotes for specific symbols
   */
  getQuotesBySymbols(symbols: string[]) {
    return api.get<{ items: Quote[], total: number }>(`/api/market/quotes?symbols=${symbols.join(',')}`)
  },

  /**
   * Get single quote
   */
  getQuote(symbol: string) {
    return api.get<Quote>(`/api/market/quotes/${symbol}`)
  },

  /**
   * Get data sources health
   */
  getHealth() {
    return api.get<{ sources: Record<string, DataSourceHealth> }>('/api/market/health')
  },

  /**
   * Get data sources list
   */
  getSources() {
    return api.get<{ sources: { name: string, priority: number, weight: number, health: string }[] }>('/api/market/sources')
  },
}
