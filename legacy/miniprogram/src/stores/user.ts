// 用户状态管理
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi } from '@/api/auth'
import type { UserInfo, UpdateUserRequest, ChangePasswordRequest } from '@/types/api'

export const useUserStore = defineStore(
  'user',
  () => {
    // State
    const profile = ref<UserInfo | null>(null)
    const loading = ref(false)

    // Actions
    async function fetchProfile(): Promise<boolean> {
      loading.value = true
      try {
        const user = await authApi.getCurrentUser()
        profile.value = user
        return true
      } catch (error) {
        console.error('Fetch profile error:', error)
        return false
      } finally {
        loading.value = false
      }
    }

    async function updateProfile(data: UpdateUserRequest): Promise<boolean> {
      loading.value = true
      try {
        const user = await authApi.updateUser(data)
        profile.value = user
        uni.showToast({ title: '更新成功', icon: 'success' })
        return true
      } catch (error) {
        console.error('Update profile error:', error)
        uni.showToast({ title: '更新失败', icon: 'none' })
        return false
      } finally {
        loading.value = false
      }
    }

    async function changePassword(data: ChangePasswordRequest): Promise<boolean> {
      loading.value = true
      try {
        await authApi.changePassword(data)
        uni.showToast({ title: '密码修改成功', icon: 'success' })
        return true
      } catch (error) {
        console.error('Change password error:', error)
        uni.showToast({ title: '密码修改失败', icon: 'none' })
        return false
      } finally {
        loading.value = false
      }
    }

    return {
      profile,
      loading,
      fetchProfile,
      updateProfile,
      changePassword,
    }
  },
  {
    persist: {
      key: 'stock-race-user',
      storage: {
        getItem: (key: string) => uni.getStorageSync(key),
        setItem: (key: string, value: string) => uni.setStorageSync(key, value),
      },
    },
  }
)
