// AI状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { aiApi } from '@/api/ai'
import type { AIAccount, AIDecision, DecisionStats, ManagerPerformance } from '@/types/ai'
import { cache } from '@/utils/cache'
import { CACHE_TTL } from '@/utils/constants'

export const useAIStore = defineStore('ai', () => {
  // State
  const accounts = ref<AIAccount[]>([])
  const currentAccount = ref<AIAccount | null>(null)
  const decisions = ref<AIDecision[]>([])
  const decisionStats = ref<DecisionStats | null>(null)
  const performances = ref<ManagerPerformance[]>([])
  const loading = ref(false)

  // Getters
  const activeAccounts = computed(() => accounts.value.filter(a => a.status === 'active'))
  const totalBalance = computed(() => accounts.value.reduce((sum, a) => sum + a.currentBalance, 0))
  const totalProfit = computed(() => accounts.value.reduce((sum, a) => sum + a.totalProfit, 0))

  // Actions
  async function fetchAccounts(forceRefresh = false): Promise<boolean> {
    if (!forceRefresh) {
      const cached = cache.get('ai:accounts')
      if (cached) {
        accounts.value = cached
        return true
      }
    }

    loading.value = true
    try {
      const data = await aiApi.getAccounts()
      accounts.value = data
      const ttl = cache.getTTL(CACHE_TTL.AI_ACCOUNTS)
      cache.set('ai:accounts', data, ttl)
      return true
    } catch (error) {
      console.error('Fetch AI accounts error:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function fetchAccountDetail(id: string): Promise<boolean> {
    loading.value = true
    try {
      const data = await aiApi.getAccount(id)
      currentAccount.value = data
      return true
    } catch (error) {
      console.error('Fetch account detail error:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function createAccount(data: Parameters<typeof aiApi.createAccount>[0]): Promise<boolean> {
    loading.value = true
    try {
      const account = await aiApi.createAccount(data)
      accounts.value.push(account)
      cache.remove('ai:accounts') // 清除缓存
      uni.showToast({ title: '创建成功', icon: 'success' })
      return true
    } catch (error) {
      console.error('Create account error:', error)
      uni.showToast({ title: '创建失败', icon: 'none' })
      return false
    } finally {
      loading.value = false
    }
  }

  async function updateAccount(id: string, data: Parameters<typeof aiApi.updateAccount>[1]): Promise<boolean> {
    loading.value = true
    try {
      const account = await aiApi.updateAccount(id, data)
      const index = accounts.value.findIndex(a => a.id === id)
      if (index > -1) {
        accounts.value[index] = account
      }
      if (currentAccount.value?.id === id) {
        currentAccount.value = account
      }
      cache.remove('ai:accounts')
      uni.showToast({ title: '更新成功', icon: 'success' })
      return true
    } catch (error) {
      console.error('Update account error:', error)
      uni.showToast({ title: '更新失败', icon: 'none' })
      return false
    } finally {
      loading.value = false
    }
  }

  async function deleteAccount(id: string): Promise<boolean> {
    loading.value = true
    try {
      await aiApi.deleteAccount(id)
      accounts.value = accounts.value.filter(a => a.id !== id)
      cache.remove('ai:accounts')
      uni.showToast({ title: '删除成功', icon: 'success' })
      return true
    } catch (error) {
      console.error('Delete account error:', error)
      uni.showToast({ title: '删除失败', icon: 'none' })
      return false
    } finally {
      loading.value = false
    }
  }

  async function fetchDecisions(accountId?: string): Promise<boolean> {
    loading.value = true
    try {
      const data = await aiApi.getDecisions({ accountId, page: 1, pageSize: 50 })
      decisions.value = data.list
      return true
    } catch (error) {
      console.error('Fetch decisions error:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  async function triggerDecision(accountId: string): Promise<AIDecision | null> {
    loading.value = true
    try {
      const decision = await aiApi.triggerDecision(accountId)
      decisions.value.unshift(decision)
      uni.showToast({ title: '决策生成成功', icon: 'success' })
      return decision
    } catch (error) {
      console.error('Trigger decision error:', error)
      uni.showToast({ title: '决策生成失败', icon: 'none' })
      return null
    } finally {
      loading.value = false
    }
  }

  async function fetchDecisionStats(accountId?: string): Promise<boolean> {
    try {
      const data = await aiApi.getDecisionStats(accountId)
      decisionStats.value = data
      return true
    } catch (error) {
      console.error('Fetch decision stats error:', error)
      return false
    }
  }

  async function fetchPerformances(): Promise<boolean> {
    try {
      const data = await aiApi.getManagerPerformance()
      performances.value = data
      return true
    } catch (error) {
      console.error('Fetch performances error:', error)
      return false
    }
  }

  return {
    accounts,
    currentAccount,
    decisions,
    decisionStats,
    performances,
    loading,
    activeAccounts,
    totalBalance,
    totalProfit,
    fetchAccounts,
    fetchAccountDetail,
    createAccount,
    updateAccount,
    deleteAccount,
    fetchDecisions,
    triggerDecision,
    fetchDecisionStats,
    fetchPerformances,
  }
})
