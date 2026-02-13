<template>
  <view class="welcome-page">
    <view class="welcome-container">
      <view class="logo-section">
        <text class="logo-icon">📈</text>
        <text class="title">Stock-Race</text>
        <text class="subtitle">AI股票竞赛平台</text>
      </view>

      <view class="features-section">
        <view class="feature-item">
          <view class="feature-icon">📊</view>
          <text class="feature-title">实时行情</text>
          <text class="feature-desc">实时获取股票行情数据</text>
        </view>
        <view class="feature-item">
          <view class="feature-icon">🤖</view>
          <text class="feature-title">AI基金经理</text>
          <text class="feature-desc">聘任AI基金经理管理资产</text>
        </view>
        <view class="feature-item">
          <view class="feature-icon">💼</view>
          <text class="feature-title">模拟交易</text>
          <text class="feature-desc">零风险模拟股票交易</text>
        </view>
        <view class="feature-item">
          <view class="feature-icon">🏆</view>
          <text class="feature-title">竞赛排行</text>
          <text class="feature-desc">与其他投资者一较高下</text>
        </view>
      </view>

      <view class="actions-section">
        <button class="primary-btn" @click="handleStart">
          开始体验
        </button>
        <button class="secondary-btn" @click="handleLogin">
          立即登录
        </button>
      </view>

      <view class="hint-section">
        <text class="hint-text">当前为游客模式，登录后可使用完整功能</text>
        <view class="hint-details">
          <text class="hint-item">• 未创建AI账户：24小时有效期</text>
          <text class="hint-item">• 已创建AI账户：72小时有效期</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

function handleStart() {
  // 标记欢迎页已显示
  authStore.markWelcomeShown()
  
  // 跳转到首页
  uni.switchTab({ url: '/pages/index/index' })
}

function handleLogin() {
  // 标记欢迎页已显示
  authStore.markWelcomeShown()
  
  // 跳转到登录页
  uni.redirectTo({ url: '/pages/login/login' })
}
</script>

<style lang="scss" scoped>
.welcome-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f5f5f5 0%, #ffffff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}

.welcome-container {
  width: 100%;
  max-width: 600rpx;
}

.logo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 60rpx;

  .logo-icon {
    font-size: 120rpx;
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

.features-section {
  background: #ffffff;
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 40rpx;
  box-shadow: 0 4rpx 24rpx rgba(0, 0, 0, 0.06);

  .feature-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-bottom: 40rpx;

    &:last-child {
      margin-bottom: 0;
    }

    .feature-icon {
      font-size: 64rpx;
      margin-bottom: 16rpx;
    }

    .feature-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #262626;
      margin-bottom: 8rpx;
    }

    .feature-desc {
      font-size: 24rpx;
      color: #8c8c8c;
    }
  }
}

.actions-section {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  margin-bottom: 40rpx;

  .primary-btn {
    height: 96rpx;
    background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
    border-radius: 48rpx;
    color: #ffffff;
    font-size: 32rpx;
    font-weight: 500;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;

    &:active {
      opacity: 0.9;
    }
  }

  .secondary-btn {
    height: 96rpx;
    background: #ffffff;
    border: 2rpx solid #1890ff;
    border-radius: 48rpx;
    color: #1890ff;
    font-size: 32rpx;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;

    &:active {
      background: #f0f8ff;
    }
  }
}

.hint-section {
  text-align: center;

  .hint-text {
    display: block;
    font-size: 26rpx;
    color: #595959;
    margin-bottom: 16rpx;
  }

  .hint-details {
    display: flex;
    flex-direction: column;
    gap: 8rpx;

    .hint-item {
      font-size: 24rpx;
      color: #8c8c8c;
    }
  }
}
</style>
