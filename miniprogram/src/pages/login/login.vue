<template>
  <view class="login-page">
    <view class="login-header">
      <image class="logo" src="/static/logo.png" mode="aspectFit" />
      <text class="title">Stock-Race</text>
      <text class="subtitle">AI股票竞赛平台</text>
    </view>

    <view class="login-form">
      <view class="form-item">
        <text class="label">用户名</text>
        <input
          class="input"
          v-model="form.username"
          placeholder="请输入用户名"
          maxlength="20"
        />
      </view>

      <view class="form-item">
        <text class="label">密码</text>
        <input
          class="input"
          v-model="form.password"
          placeholder="请输入密码"
          password
          maxlength="20"
        />
      </view>

      <button
        class="login-btn"
        :class="{ 'btn-disabled': !canSubmit || loading }"
        :disabled="!canSubmit || loading"
        @click="handleLogin"
      >
        <text v-if="!loading">登 录</text>
        <text v-else>登录中...</text>
      </button>

      <view class="actions">
        <text class="link" @click="goToRegister">注册账号</text>
        <text class="divider">|</text>
        <text class="link" @click="useDemoAccount">演示账户</text>
      </view>
    </view>

    <view class="login-footer">
      <text class="hint">演示账户: admin / admin123</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { validateUsername, validatePassword } from '@/utils/validator'

const authStore = useAuthStore()
const loading = ref(false)

const form = ref({
  username: '',
  password: '',
})

const canSubmit = computed(() => {
  return form.value.username && form.value.password
})

async function handleLogin() {
  // 表单验证
  const usernameValid = validateUsername(form.value.username)
  if (!usernameValid.valid) {
    uni.showToast({ title: usernameValid.message, icon: 'none' })
    return
  }

  const passwordValid = validatePassword(form.value.password)
  if (!passwordValid.valid) {
    uni.showToast({ title: passwordValid.message, icon: 'none' })
    return
  }

  loading.value = true
  const success = await authStore.login({
    username: form.value.username,
    password: form.value.password,
  }, true) // 启用降级机制

  loading.value = false

  if (success) {
    uni.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(() => {
      uni.switchTab({ url: '/pages/index/index' })
    }, 1500)
  } else {
    uni.showToast({ title: '登录失败，请重试', icon: 'none' })
  }
}

function useDemoAccount() {
  form.value.username = 'admin'
  form.value.password = 'admin123'
  handleLogin()
}

function goToRegister() {
  uni.showToast({ title: '注册功能开发中', icon: 'none' })
}
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f5f5f5 0%, #ffffff 100%);
  padding: 60rpx 40rpx;
}

.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 80rpx;

  .logo {
    width: 160rpx;
    height: 160rpx;
    margin-bottom: 24rpx;
  }

  .title {
    font-size: 48rpx;
    font-weight: bold;
    color: #262626;
    margin-bottom: 12rpx;
  }

  .subtitle {
    font-size: 28rpx;
    color: #8c8c8c;
  }
}

.login-form {
  background: #ffffff;
  border-radius: 24rpx;
  padding: 48rpx 32rpx;
  box-shadow: 0 4rpx 24rpx rgba(0, 0, 0, 0.06);
}

.form-item {
  margin-bottom: 32rpx;

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

.login-btn {
  height: 96rpx;
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  border-radius: 48rpx;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 48rpx;
  border: none;

  &:active {
    opacity: 0.9;
  }

  &.btn-disabled {
    background: #d9d9d9;
  }
}

.actions {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 32rpx;

  .link {
    font-size: 26rpx;
    color: #1890ff;
  }

  .divider {
    margin: 0 24rpx;
    color: #d9d9d9;
  }
}

.login-footer {
  margin-top: 48rpx;
  text-align: center;

  .hint {
    font-size: 24rpx;
    color: #8c8c8c;
  }
}
</style>
