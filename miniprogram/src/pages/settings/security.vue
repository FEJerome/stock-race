<template>
  <view class="security-page">
    <!-- 修改密码 -->
    <view class="section-card">
      <view class="section-title">
        <text class="title-text">修改密码</text>
      </view>

      <view class="form-item">
        <text class="label">原密码</text>
        <input
          class="input"
          v-model="passwordForm.oldPassword"
          placeholder="请输入原密码"
          password
          maxlength="20"
        />
      </view>

      <view class="form-item">
        <text class="label">新密码</text>
        <input
          class="input"
          v-model="passwordForm.newPassword"
          placeholder="请输入新密码（6-20位）"
          password
          maxlength="20"
        />
      </view>

      <view class="form-item">
        <text class="label">确认新密码</text>
        <input
          class="input"
          v-model="passwordForm.confirmPassword"
          placeholder="请再次输入新密码"
          password
          maxlength="20"
        />
      </view>

      <button
        class="action-btn primary"
        :class="{ 'btn-disabled': !canChangePassword || changingPassword }"
        :disabled="!canChangePassword || changingPassword"
        @click="handleChangePassword"
      >
        <text v-if="!changingPassword">修改密码</text>
        <text v-else>修改中...</text>
      </button>
    </view>

    <!-- 登录设备管理 -->
    <view class="section-card">
      <view class="section-title">
        <text class="title-text">登录设备管理</text>
      </view>

      <view class="device-placeholder">
        <text class="placeholder-icon">📱</text>
        <text class="placeholder-text">功能开发中</text>
        <text class="placeholder-desc">即将支持查看和管理登录设备</text>
      </view>
    </view>

    <!-- 安全操作 -->
    <view class="section-card danger-zone">
      <view class="section-title">
        <text class="title-text danger">危险操作</text>
      </view>

      <view class="danger-item" @click="handleLogoutAllDevices">
        <view class="danger-info">
          <text class="danger-title">登出所有设备</text>
          <text class="danger-desc">强制所有设备重新登录</text>
        </view>
        <text class="arrow">></text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { validatePassword } from '@/utils/validator'

const userStore = useUserStore()
const changingPassword = ref(false)

// 密码表单
const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

// 是否可以修改密码
const canChangePassword = computed(() => {
  return (
    passwordForm.value.oldPassword &&
    passwordForm.value.newPassword &&
    passwordForm.value.confirmPassword
  )
})

// 修改密码
async function handleChangePassword() {
  const { oldPassword, newPassword, confirmPassword } = passwordForm.value

  // 验证原密码
  if (!oldPassword) {
    uni.showToast({ title: '请输入原密码', icon: 'none' })
    return
  }

  // 验证新密码
  const passwordValid = validatePassword(newPassword)
  if (!passwordValid.valid) {
    uni.showToast({ title: passwordValid.message, icon: 'none' })
    return
  }

  // 验证两次密码是否一致
  if (newPassword !== confirmPassword) {
    uni.showToast({ title: '两次输入的密码不一致', icon: 'none' })
    return
  }

  // 验证新密码不能和原密码相同
  if (oldPassword === newPassword) {
    uni.showToast({ title: '新密码不能与原密码相同', icon: 'none' })
    return
  }

  changingPassword.value = true
  try {
    const success = await userStore.changePassword({
      oldPassword,
      newPassword,
      confirmPassword,
    })

    if (success) {
      // 清空表单
      passwordForm.value = {
        oldPassword: '',
        newPassword: '',
        confirmPassword: '',
      }
    }
  } finally {
    changingPassword.value = false
  }
}

// 登出所有设备
function handleLogoutAllDevices() {
  uni.showModal({
    title: '确认登出',
    content: '确定要登出所有设备吗？您需要重新登录。',
    confirmColor: '#ff4d4f',
    success: (res) => {
      if (res.confirm) {
        // 实际项目中调用登出所有设备API
        uni.showLoading({ title: '处理中...' })

        // 模拟API调用
        setTimeout(() => {
          uni.hideLoading()
          uni.showToast({
            title: '已登出所有设备',
            icon: 'success',
            duration: 2000,
          })

          // 延迟后跳转到登录页
          setTimeout(() => {
            uni.reLaunch({ url: '/pages/login/login' })
          }, 2000)
        }, 1500)
      }
    },
  })
}
</script>

<style lang="scss" scoped>
.security-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
  padding-bottom: 48rpx;
}

.section-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;

  &.danger-zone {
    border: 2rpx solid #ffccc7;
  }
}

.section-title {
  margin-bottom: 32rpx;

  .title-text {
    font-size: 32rpx;
    font-weight: 600;
    color: #262626;

    &.danger {
      color: #ff4d4f;
    }
  }
}

.form-item {
  margin-bottom: 24rpx;

  &:last-of-type {
    margin-bottom: 32rpx;
  }

  .label {
    display: block;
    font-size: 28rpx;
    color: #262626;
    margin-bottom: 12rpx;
    font-weight: 500;
  }

  .input {
    height: 88rpx;
    background: #f5f5f5;
    border-radius: 12rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    color: #262626;
  }
}

.action-btn {
  height: 88rpx;
  border-radius: 44rpx;
  font-size: 30rpx;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;

  &.primary {
    background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
    color: #ffffff;
  }

  &:active {
    opacity: 0.9;
  }

  &.btn-disabled {
    background: #d9d9d9;
  }
}

.device-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48rpx 0;
  background: #f5f5f5;
  border-radius: 12rpx;

  .placeholder-icon {
    font-size: 64rpx;
    margin-bottom: 16rpx;
  }

  .placeholder-text {
    font-size: 30rpx;
    color: #262626;
    font-weight: 500;
    margin-bottom: 8rpx;
  }

  .placeholder-desc {
    font-size: 26rpx;
    color: #8c8c8c;
  }
}

.danger-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  background: #fff2f0;
  border-radius: 12rpx;

  &:active {
    opacity: 0.8;
  }

  .danger-info {
    flex: 1;

    .danger-title {
      display: block;
      font-size: 30rpx;
      color: #ff4d4f;
      font-weight: 500;
      margin-bottom: 8rpx;
    }

    .danger-desc {
      display: block;
      font-size: 26rpx;
      color: #ff7875;
    }
  }

  .arrow {
    font-size: 28rpx;
    color: #ff4d4f;
  }
}
</style>
