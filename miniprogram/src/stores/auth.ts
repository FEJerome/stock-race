// 认证状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth'
import { guestApi } from '@/api/guest'
import type { UserInfo, LoginRequest, RegisterRequest, WechatLoginRequest } from '@/types/api'
import type { GuestSession, GuestStatus } from '@/types/guest'
import { GUEST_LIMITS } from '@/types/guest'
import { DEMO_ACCOUNT } from '@/utils/constants'

// 游客Token常量（用于标记游客模式）
const GUEST_TOKEN_MARKER = 'GUEST_TOKEN'

export const useAuthStore = defineStore(
  'auth',
  () => {
    // State
    const token = ref<string>('')
    const userInfo = ref<UserInfo | null>(null)
    const guestSession = ref<GuestSession | null>(null)

    // 计算属性：是否已登录（正式用户）
    const isLoggedIn = computed(() => {
      return !!token.value && !!userInfo.value && !isGuestMode.value
    })

    // 计算属性：是否游客模式
    const isGuestMode = computed(() => {
      // 有guestSession或者token是游客标记
      return !!guestSession.value || token.value === GUEST_TOKEN_MARKER
    })

    // 计算属性：游客状态信息
    const guestStatus = computed<GuestStatus | null>(() => {
      if (!guestSession.value) return null

      const now = Date.now()
      const remainingHours = Math.max(0, Math.floor((guestSession.value.expiresAt - now) / (1000 * 60 * 60)))

      return {
        isGuest: true,
        expiresAt: guestSession.value.expiresAt,
        remainingHours,
        hasAIAccount: guestSession.value.hasAIAccount,
        aiAccountCount: 0, // 需要通过其他store获取
        maxAIAccounts: GUEST_LIMITS.MAX_AI_ACCOUNTS,
        remainingChatTurns: 10, // 需要通过API获取
        maxChatTurns: GUEST_LIMITS.MAX_CHAT_TURNS,
      }
    })

    // 计算属性：是否游客Token即将过期（剩余不足4小时）
    const isGuestTokenExpiringSoon = computed(() => {
      if (!guestSession.value) return false
      const now = Date.now()
      const remainingHours = (guestSession.value.expiresAt - now) / (1000 * 60 * 60)
      return remainingHours < 4
    })

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
        clearGuestSession()
        // 清除所有缓存
        uni.clearStorageSync()
      }
    }

    function clearAuth() {
      token.value = ''
      userInfo.value = null
    }

    // ==================== 游客模式方法 ====================

    // 初始化游客模式（从Backend获取真实游客Token）
    async function initGuestMode(): Promise<boolean> {
      try {
        // 检查本地是否已有有效的游客会话
        const storedSession = uni.getStorageSync(GUEST_LIMITS.STORAGE_KEY)
        if (storedSession) {
          const session: GuestSession = JSON.parse(storedSession)
          // 检查是否过期
          if (session.expiresAt > Date.now()) {
            guestSession.value = session
            token.value = GUEST_TOKEN_MARKER
            userInfo.value = {
              id: 'guest',
              username: 'guest',
              nickname: '游客',
              avatar: '/static/icons/guest.png',
            }
            return true
          }
          // 已过期，清除
          uni.removeStorageSync(GUEST_LIMITS.STORAGE_KEY)
        }

        // 获取新的游客Token
        return await refreshGuestToken()
      } catch (error) {
        console.error('Init guest mode error:', error)
        // 降级到本地游客模式
        enableLocalGuestMode()
        return true
      }
    }

    // 获取/刷新游客Token
    async function refreshGuestToken(): Promise<boolean> {
      return new Promise((resolve) => {
        uni.login({
          provider: 'weixin',
          success: async (res) => {
            if (res.code) {
              try {
                const guestTokenRes = await guestApi.getGuestToken(res.code)

                // 创建游客会话
                const session: GuestSession = {
                  token: guestTokenRes.guestToken,
                  openid: guestTokenRes.openid,
                  expiresAt: Date.now() + guestTokenRes.expiresIn * 1000,
                  hasAIAccount: guestTokenRes.hasAIAccount,
                  lastActivityAt: Date.now(),
                }

                // 保存到本地
                guestSession.value = session
                uni.setStorageSync(GUEST_LIMITS.STORAGE_KEY, JSON.stringify(session))

                // 设置游客模式标记
                token.value = GUEST_TOKEN_MARKER
                userInfo.value = {
                  id: 'guest',
                  username: 'guest',
                  nickname: '游客',
                  avatar: '/static/icons/guest.png',
                }

                resolve(true)
              } catch (error) {
                console.error('Get guest token error:', error)
                enableLocalGuestMode()
                resolve(true)
              }
            } else {
              enableLocalGuestMode()
              resolve(true)
            }
          },
          fail: () => {
            enableLocalGuestMode()
            resolve(true)
          },
        })
      })
    }

    // 本地游客模式（降级方案，无需Backend）
    function enableLocalGuestMode() {
      token.value = GUEST_TOKEN_MARKER
      userInfo.value = {
        id: 'guest',
        username: 'guest',
        nickname: '游客',
        avatar: '/static/icons/guest.png',
      }
      guestSession.value = null
    }

    // 旧方法：启用游客模式（现在调用initGuestMode）
    function enableGuestMode() {
      initGuestMode()
    }

    // 更新游客最后活跃时间
    function updateGuestActivity() {
      if (guestSession.value) {
        guestSession.value.lastActivityAt = Date.now()
        uni.setStorageSync(GUEST_LIMITS.STORAGE_KEY, JSON.stringify(guestSession.value))
      }
    }

    // 游客登录并绑定数据
    async function loginAndBindGuest(code: string): Promise<boolean> {
      try {
        // 1. 先绑定游客数据
        if (guestSession.value) {
          await guestApi.bindGuestData(guestSession.value.token)
        }

        // 2. 执行微信登录
        const res = await authApi.wechatLogin({ code })

        // 3. 清除游客状态
        clearGuestSession()

        // 4. 设置正式用户状态
        token.value = res.token
        userInfo.value = res.user

        return true
      } catch (error) {
        console.error('Login and bind error:', error)
        return false
      }
    }

    // 清除游客会话
    function clearGuestSession() {
      guestSession.value = null
      uni.removeStorageSync(GUEST_LIMITS.STORAGE_KEY)
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
      // State
      token,
      userInfo,
      guestSession,
      // Getters
      isLoggedIn,
      isGuestMode,
      guestStatus,
      isGuestTokenExpiringSoon,
      // 认证方法
      login,
      register,
      fetchUserInfo,
      logout,
      clearAuth,
      wechatLogin,
      // 游客模式方法
      initGuestMode,
      refreshGuestToken,
      enableGuestMode,
      enableLocalGuestMode,
      updateGuestActivity,
      loginAndBindGuest,
      clearGuestSession,
      requireAuth,
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
      // 只持久化这些字段
      paths: ['token', 'userInfo'],
    },
  }
)
