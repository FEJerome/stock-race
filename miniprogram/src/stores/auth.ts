// 认证状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth'
import type { UserInfo, LoginRequest, RegisterRequest } from '@/types/api'
import { DEMO_ACCOUNT } from '@/utils/constants'

export const useAuthStore = defineStore(
  'auth',
  () => {
    // State
    const token = ref<string>('')
    const userInfo = ref<UserInfo | null>(null)
    const isLoggedIn = computed(() => !!token.value && !!userInfo.value)

    // Actions
    async function login(data: LoginRequest, useDemoFallback = false): Promise<boolean> {
      try {
        const res = await authApi.login(data)
        token.value = res.token
        userInfo.value = res.user
        return true
      } catch (error) {
        console.error('Login error:', error)

        // 降级到演示账户
        if (useDemoFallback) {
          console.log('Using demo account fallback')
          token.value = DEMO_ACCOUNT.token
          userInfo.value = DEMO_ACCOUNT.user as UserInfo
          uni.showToast({
            title: '已切换到演示模式',
            icon: 'none',
          })
          return true
        }

        return false
      }
    }

    async function register(data: RegisterRequest): Promise<boolean> {
      try {
        const res = await authApi.register(data)
        token.value = res.token
        userInfo.value = res.user
        return true
      } catch (error) {
        console.error('Register error:', error)
        return false
      }
    }

    async function fetchUserInfo(): Promise<boolean> {
      try {
        const user = await authApi.getCurrentUser()
        userInfo.value = user
        return true
      } catch (error) {
        console.error('Fetch user info error:', error)
        return false
      }
    }

    async function logout(): Promise<void> {
      try {
        await authApi.logout()
      } catch (error) {
        console.error('Logout error:', error)
      } finally {
        token.value = ''
        userInfo.value = null
        // 清除所有缓存
        uni.clearStorageSync()
      }
    }

    function clearAuth() {
      token.value = ''
      userInfo.value = null
    }

    return {
      token,
      userInfo,
      isLoggedIn,
      login,
      register,
      fetchUserInfo,
      logout,
      clearAuth,
    }
  },
  {
    persist: {
      key: 'stock-race-auth',
      storage: {
        getItem: (key: string) => {
          return uni.getStorageSync(key)
        },
        setItem: (key: string, value: string) => {
          uni.setStorageSync(key, value)
        },
      },
    },
  }
)
