// 认证状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth'
import type { UserInfo, LoginRequest, RegisterRequest, WechatLoginRequest } from '@/types/api'
import { DEMO_ACCOUNT } from '@/utils/constants'

// 游客Token常量
const GUEST_TOKEN = 'GUEST_TOKEN'

export const useAuthStore = defineStore(
  'auth',
  () => {
    // State
    const token = ref<string>('')
    const userInfo = ref<UserInfo | null>(null)
    const isLoggedIn = computed(() => !!token.value && !!userInfo.value && token.value !== GUEST_TOKEN)
    const isGuestMode = computed(() => token.value === GUEST_TOKEN)

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

    // 启用游客模式
    function enableGuestMode() {
      token.value = GUEST_TOKEN
      userInfo.value = {
        id: 'guest',
        username: 'guest',
        nickname: '游客',
        avatar: '/static/icons/guest.png',
      }
    }

    // 检查是否需要登录，返回true表示已登录，false表示未登录并跳转到登录页
    function requireAuth(redirectUrl?: string): boolean {
      if (isGuestMode.value) {
        uni.navigateTo({
          url: `/pages/login/login?redirect=${encodeURIComponent(redirectUrl || '')}`,
        })
        return false
      }
      return true
    }

    // 微信登录
    async function wechatLogin(code: string): Promise<boolean> {
      try {
        const res = await authApi.wechatLogin({ code })
        token.value = res.token
        userInfo.value = res.user
        return true
      } catch (error) {
        console.error('Wechat login error:', error)
        return false
      }
    }

    return {
      token,
      userInfo,
      isLoggedIn,
      isGuestMode,
      login,
      register,
      fetchUserInfo,
      logout,
      clearAuth,
      enableGuestMode,
      requireAuth,
      wechatLogin,
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
