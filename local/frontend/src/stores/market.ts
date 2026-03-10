/**
 * Market Data Store - Pinia
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { marketApi, type Quote, type DataSourceHealth } from '../api/market'

export const useMarketStore = defineStore('market', () => {
  // State
  const quotes = ref<Quote[]>([])
  const currentQuote = ref<Quote | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastUpdated = ref<Date | null>(null)
  const autoRefresh = ref(false)
  const refreshInterval = ref<number | null>(null)
  const dataSourceHealth = ref<Record<string, DataSourceHealth>>({})

  // Getters
  const sortedQuotes = computed(() => {
    return [...quotes.value].sort((a, b) => {
      // Sort by change_percent descending
      return b.change_percent - a.change_percent
    })
  })

  const gainers = computed(() => {
    return quotes.value.filter(q => q.change_percent > 0)
  })

  const losers = computed(() => {
    return quotes.value.filter(q => q.change_percent < 0)
  })

  const flat = computed(() => {
    return quotes.value.filter(q => q.change_percent === 0)
  })

  const healthyDataSources = computed(() => {
    return Object.entries(dataSourceHealth.value)
      .filter(([_, health]) => health.status === 'healthy')
      .map(([name, _]) => name)
  })

  // Actions
  async function fetchQuotes() {
    loading.value = true
    error.value = null
    try {
      const response = await marketApi.getQuotes()
      quotes.value = response.data.items
      lastUpdated.value = new Date()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchQuote(symbol: string) {
    loading.value = true
    error.value = null
    try {
      const response = await marketApi.getQuote(symbol)
      currentQuote.value = response.data
      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchHealth() {
    try {
      const response = await marketApi.getHealth()
      dataSourceHealth.value = response.data.sources
    } catch (err) {
      console.error('Failed to fetch health:', err)
    }
  }

  function startAutoRefresh(intervalMs: number = 5000) {
    if (refreshInterval.value) {
      stopAutoRefresh()
    }
    autoRefresh.value = true
    refreshInterval.value = window.setInterval(() => {
      fetchQuotes()
      fetchHealth()
    }, intervalMs)
  }

  function stopAutoRefresh() {
    if (refreshInterval.value) {
      clearInterval(refreshInterval.value)
      refreshInterval.value = null
    }
    autoRefresh.value = false
  }

  function formatPrice(price: number): string {
    return price.toFixed(2)
  }

  function formatChangePercent(percent: number): string {
    const sign = percent >= 0 ? '+' : ''
    return `${sign}${percent.toFixed(2)}%`
  }

  function formatVolume(volume: number): string {
    if (volume >= 100000000) {
      return (volume / 100000000).toFixed(2) + '亿'
    } else if (volume >= 10000) {
      return (volume / 10000).toFixed(2) + '万'
    }
    return volume.toString()
  }

  return {
    // State
    quotes,
    currentQuote,
    loading,
    error,
    lastUpdated,
    autoRefresh,
    dataSourceHealth,
    // Getters
    sortedQuotes,
    gainers,
    losers,
    flat,
    healthyDataSources,
    // Actions
    fetchQuotes,
    fetchQuote,
    fetchHealth,
    startAutoRefresh,
    stopAutoRefresh,
    formatPrice,
    formatChangePercent,
    formatVolume,
  }
})
