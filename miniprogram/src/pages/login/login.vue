<template>
  <view class="login-page">
    <view class="login-header">
      <image class="logo" src="/static/logo.png" mode="aspectFit" />
      <text class="title">Stock-Race</text>
      <text class="subtitle">AI股票竞赛平台</text>
    </view>

    <!-- 微信一键登录 -->
    <view class="wechat-login-section">
      <button class="wechat-login-btn" @click="handleWechatLogin" :disabled="loading">
        <text class="wechat-icon">微信</text>
        <text class="btn-text">{{ loading ? '登录中...' : '微信一键登录' }}</text>
      </button>
      <text class="hint-text">登录后可使用完整功能</text>
    </view>

    <!-- 分割线 -->
    <view class="divider-section">
      <view class="line"></view>
      <text class="text">或使用演示账户</text>
      <view class="line"></view>
    </view>

    <!-- 演示账户登录 -->
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
        <text class="link" @click="useDemoAccount">演示账户</text>
      </view>
    </view>

    <!-- 返回游客模式 -->
    <view class="guest-option">
      <text class="link" @click="backToGuestMode">暂不登录，继续浏览</text>
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

// 微信登录
async function handleWechatLogin() {
  loading.value = true
  try {
    // 调用微信登录接口获取code
    const loginRes = await new Promise<{ code: string }>((resolve, reject) => {
      uni.login({
        provider: 'weixin',
        success: (res) => {
          if (res.code) {
            resolve({ code: res.code })
          } else {
            reject(new Error('获取微信code失败'))
          }
        },
        fail: (err) => reject(err),
      })
    })

    // 获取用户信息
    const userInfoRes = await new Promise<{ userInfo: any }>((resolve, reject) => {
      uni.getUserInfo({
        provider: 'weixin',
        success: (res) => resolve(res as any),
        fail: (err) => {
          // 用户拒绝授权，继续用code登录
          console.log('获取用户信息失败:', err)
          resolve({ userInfo: null })
        },
      })
    })

    // 调用后端微信登录接口
    const success = await authStore.wechatLogin(loginRes.code)

    if (success) {
      uni.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => {
        // 获取redirect参数，登录成功后跳回原页面
        const pages = getCurrentPages()
        const currentPage = pages[pages.length - 1] as any
        const redirect = currentPage?.$page?.options?.redirect

        if (redirect) {
          const decodedRedirect = decodeURIComponent(redirect)
          if (decodedRedirect.startsWith('/pages/')) {
            if (decodedRedirect.includes('index') || decodedRedirect.includes('market') ||
                decodedRedirect.includes('ai-managers') || decodedRedirect.includes('portfolio') ||
                decodedRedirect.includes('settings')) {
              uni.switchTab({ url: decodedRedirect })
            } else {
              uni.redirectTo({ url: decodedRedirect })
            }
          } else {
            uni.switchTab({ url: '/pages/index/index' })
          }
        } else {
          uni.switchTab({ url: '/pages/index/index' })
        }
      }, 1500)
    } else {
      uni.showToast({ title: '登录失败，请重试', icon: 'none' })
    }
  } catch (error) {
    console.error('微信登录错误:', error)
    uni.showToast({ title: '微信登录失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

// 普通登录
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

// 返回游客模式
function backToGuestMode() {
  authStore.enableGuestMode()
  uni.switchTab({ url: '/pages/index/index' })
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
  margin-bottom: 60rpx;

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

// 微信登录区域
.wechat-login-section {
  margin-bottom: 40rpx;

  .wechat-login-btn {
    height: 96rpx;
    background: #07c160;
    border-radius: 48rpx;
    color: #ffffff;
    font-size: 32rpx;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    margin-bottom: 16rpx;

    &:active {
      opacity: 0.9;
    }

    &[disabled] {
      opacity: 0.6;
    }

    .wechat-icon {
      margin-right: 12rpx;
      font-size: 32rpx;
    }

    .btn-text {
      font-size: 32rpx;
    }
  }

  .hint-text {
    display: block;
    text-align: center;
    font-size: 24rpx;
    color: #8c8c8c;
  }
}

// 分割线
.divider-section {
  display: flex;
  align-items: center;
  margin-bottom: 40rpx;

  .line {
    flex: 1;
    height: 1rpx;
    background: #e8e8e8;
  }

  .text {
    padding: 0 24rpx;
    font-size: 24rpx;
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
}

// 返回游客模式
.guest-option {
  margin-top: 48rpx;
  text-align: center;

  .link {
    font-size: 28rpx;
    color: #8c8c8c;
    text-decoration: underline;
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
