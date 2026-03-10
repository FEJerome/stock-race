/**
 * Agent Store - Pinia
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { agentApi, type Agent, type CreateAgentRequest, type UpdateAgentRequest } from '../api/agents'

export const useAgentStore = defineStore('agents', () => {
  // State
  const agents = ref<Agent[]>([])
  const currentAgent = ref<Agent | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const total = ref(0)
  const currentPage = ref(1)
  const pageSize = ref(20)

  // Getters
  const activeAgents = computed(() => agents.value.filter(a => a.status === 'active'))
  const pausedAgents = computed(() => agents.value.filter(a => a.status === 'paused'))
  const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

  // Actions
  async function fetchAgents(page = 1, size = 20) {
    loading.value = true
    error.value = null
    try {
      const response = await agentApi.list(page, size)
      agents.value = response.data.items
      total.value = response.data.total
      currentPage.value = response.data.page
      pageSize.value = response.data.page_size
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchAgent(id: string) {
    loading.value = true
    error.value = null
    try {
      const response = await agentApi.get(id)
      currentAgent.value = response.data
      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createAgent(data: CreateAgentRequest) {
    loading.value = true
    error.value = null
    try {
      const response = await agentApi.create(data)
      await fetchAgents(currentPage.value, pageSize.value)
      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateAgent(id: string, data: UpdateAgentRequest) {
    loading.value = true
    error.value = null
    try {
      const response = await agentApi.update(id, data)
      // Update currentAgent if it's the one being updated
      if (currentAgent.value?.id === id) {
        currentAgent.value = { ...currentAgent.value, ...response.data }
      }
      await fetchAgents(currentPage.value, pageSize.value)
      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deleteAgent(id: string) {
    loading.value = true
    error.value = null
    try {
      await agentApi.delete(id)
      await fetchAgents(currentPage.value, pageSize.value)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function pauseAgent(id: string) {
    loading.value = true
    error.value = null
    try {
      const response = await agentApi.pause(id)
      // Update currentAgent if it's the one being paused
      if (currentAgent.value?.id === id) {
        currentAgent.value = { ...currentAgent.value, status: 'paused' }
      }
      await fetchAgents(currentPage.value, pageSize.value)
      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function resumeAgent(id: string) {
    loading.value = true
    error.value = null
    try {
      const response = await agentApi.resume(id)
      // Update currentAgent if it's the one being resumed
      if (currentAgent.value?.id === id) {
        currentAgent.value = { ...currentAgent.value, status: 'active' }
      }
      await fetchAgents(currentPage.value, pageSize.value)
      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    // State
    agents,
    currentAgent,
    loading,
    error,
    total,
    currentPage,
    pageSize,
    // Getters
    activeAgents,
    pausedAgents,
    totalPages,
    // Actions
    fetchAgents,
    fetchAgent,
    createAgent,
    updateAgent,
    deleteAgent,
    pauseAgent,
    resumeAgent,
  }
})
