<template>
  <view class="profile-page">
    <!-- 用户信息卡片 -->
    <view class="user-card" v-if="userStore.userInfo">
      <image class="avatar" :src="userStore.userInfo.avatar || '/static/default-avatar.png'" mode="aspectFill" />
      <view class="user-info">
        <text class="nickname">{{ userStore.userInfo.nickname || userStore.userInfo.username }}</text>
        <text class="username">用户名: {{ userStore.userInfo.username }}</text>
      </view>
    </view>

    <!-- 功能列表 -->
    <view class="menu-list">
      <view class="menu-group">
        <view class="menu-item" @click="editProfile">
          <text class="icon">👤</text>
          <text class="label">编辑资料</text>
          <text class="arrow">›</text>
        </view>
        <view class="menu-item" @click="changePassword">
          <text class="icon">🔒</text>
          <text class="label">修改密码</text>
          <text class="arrow">›</text>
        </view>
      </view>

      <view class="menu-group">
        <view class="menu-item" @click="showEnvSwitcher = true">
          <text class="icon">⚙️</text>
          <text class="label">环境配置</text>
          <view class="value-box">
            <text class="value" :class="currentEnv">{{ currentEnvName }}</text>
            <text class="arrow">›</text>
          </view>
        </view>
        <view class="menu-item" @click="clearCache">
          <text class="icon">🗑️</text>
          <text class="label">清除缓存</text>
          <text class="arrow">›</text>
        </view>
        <view class="menu-item" @click="showAbout">
          <text class="icon">ℹ️</text>
          <text class="label">关于我们</text>
          <text class="arrow">›</text>
        </view>
      </view>
    </view>

    <!-- 退出登录按钮 -->
    <view class="logout-section">
      <button class="logout-btn" @click="handleLogout">退出登录</button>
    </view>

    <!-- 环境切换弹窗 -->
    <uni-popup ref="envPopup" type="bottom" :show="showEnvSwitcher" @change="onPopupChange">
      <view class="popup-content">
        <view class="popup-header">
          <text class="popup-title">切换环境</text>
          <text class="popup-close" @click="showEnvSwitcher = false">✕</text>
        </view>
        <EnvSwitcher />
      </view>
    </uni-popup>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { useAuthStore } from '@/stores/auth'
import { getCurrentEnv, getEnvConfig, getAvailableEnvs } from '@/config/env'
import type { AppEnv } from '@/types/config'
import EnvSwitcher from '@/components/config/EnvSwitcher.vue'

const userStore = useUserStore()
const authStore = useAuthStore()
const showEnvSwitcher = ref(false)

// 当前环境
const currentEnv = computed(() => getCurrentEnv())
const currentEnvName = computed(() => {
  const names: Record<AppEnv, string> = {
    local: '本地',
    dev: '联调',
    prod: '生产',
  }
  return names[currentEnv.value] || currentEnv.value
})

const onPopupChange = (e: { show: boolean }) => {
  showEnvSwitcher.value = e.show
}

const editProfile = () => {
  uni.showToast({ title: '功能开发中', icon: 'none' })
}

const changePassword = () => {
  uni.navigateTo({ url: '/pages/settings/password' })
}

const clearCache = () => {
  uni.showModal({
    title: '清除缓存',
    content: '确定要清除所有缓存数据吗？',
    success: (res) => {
      if (res.confirm) {
        try {
          uni.clearStorageSync()
          uni.showToast({ title: '清除成功', icon: 'success' })
          setTimeout(() => {
            uni.reLaunch({ url: '/pages/index/index' })
          }, 1500)
        } catch (e) {
          uni.showToast({ title: '清除失败', icon: 'none' })
        }
      }
    },
  })
}

const showAbout = () => {
  uni.navigateTo({ url: '/pages/settings/about' })
}

const handleLogout = () => {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出登录吗？',
    success: (res) => {
      if (res.confirm) {
        authStore.logout()
        uni.reLaunch({ url: '/pages/index/index' })
      }
    },
  })
}
</script>

<style scoped lang="scss">
.profile-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 40rpx;
}

.user-card {
  display: flex;
  align-items: center;
  padding: 40rpx;
  background: linear-gradient(135deg, #1890ff 0%, #36cfc9 100%);
  margin-bottom: 24rpx;

  .avatar {
    width: 120rpx;
    height: 120rpx;
    border-radius: 60rpx;
    border: 4rpx solid rgba(255, 255, 255, 0.3);
    margin-right: 24rpx;
  }

  .user-info {
    .nickname {
      font-size: 36rpx;
      font-weight: 600;
      color: #fff;
      display: block;
      margin-bottom: 8rpx;
    }

    .username {
      font-size: 26rpx;
      color: rgba(255, 255, 255, 0.8);
    }
  }
}

.menu-list {
  padding: 0 20rpx;

  .menu-group {
    background: #fff;
    border-radius: 16rpx;
    margin-bottom: 24rpx;
    overflow: hidden;

    .menu-item {
      display: flex;
      align-items: center;
      padding: 30rpx;
      border-bottom: 1rpx solid #f0f0f0;

      &:last-child {
        border-bottom: none;
      }

      &:active {
        background: #f5f5f5;
      }

      .icon {
        font-size: 36rpx;
        margin-right: 20rpx;
        width: 48rpx;
        text-align: center;
      }

      .label {
        flex: 1;
        font-size: 30rpx;
        color: #262626;
      }

      .value-box {
        display: flex;
        align-items: center;

        .value {
          font-size: 26rpx;
          padding: 4rpx 16rpx;
          border-radius: 8rpx;
          margin-right: 12rpx;

          &.local {
            background: #e6f7ff;
            color: #1890ff;
          }

          &.dev {
            background: #fff7e6;
            color: #fa8c16;
          }

          &.prod {
            background: #f6ffed;
            color: #52c41a;
          }
        }
      }

      .arrow {
        font-size: 32rpx;
        color: #bfbfbf;
      }
    }
  }
}

.logout-section {
  padding: 40rpx;

  .logout-btn {
    width: 100%;
    height: 88rpx;
    line-height: 88rpx;
    background: #fff;
    color: #ff4d4f;
    font-size: 32rpx;
    border-radius: 12rpx;
    border: none;

    &:active {
      background: #fff1f0;
    }
  }
}

.popup-content {
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  max-height: 80vh;
  overflow-y: auto;

  .popup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 30rpx;
    border-bottom: 1rpx solid #f0f0f0;

    .popup-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #262626;
    }

    .popup-close {
      font-size: 32rpx;
      color: #8c8c8c;
      padding: 10rpx;
    }
  }
}
</style>
