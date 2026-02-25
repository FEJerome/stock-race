<template>
  <view class="expired-page">
    <view class="expired-container">
      <view class="icon-section">
        <view class="warning-icon">⚠️</view>
        <text class="warning-title">账户已清空</text>
      </view>

      <view class="message-section">
        <text class="message-text">
          由于您长时间未登录，您的游客账户数据已被系统自动清空。
        </text>
        <text class="message-text">
          为了确保您的投资记录和AI账户能够长期保存，建议您使用微信登录。
        </text>
      </view>

      <view class="info-section">
        <view class="info-item">
          <view class="info-icon">⏰</view>
          <view class="info-content">
            <text class="info-title">游客账户有效期</text>
            <text class="info-desc">未创建AI账户：24小时</text>
            <text class="info-desc">已创建AI账户：72小时</text>
          </view>
        </view>
      </view>

      <view class="actions-section">
        <button class="primary-btn" @click="handleLogin">
          立即登录
        </button>
        <button class="secondary-btn" @click="handleRestart">
          重新开始
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

function handleLogin() {
  // 跳转到登录页
  uni.redirectTo({ url: '/pages/login/login' })
}

function handleRestart() {
  // 清除游客会话
  authStore.clearGuestSession()
  
  // 跳转到首页
  uni.switchTab({ url: '/pages/index/index' })
}
</script>

<style lang="scss" scoped>
.expired-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f5f5f5 0%, #ffffff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}

.expired-container {
  width: 100%;
  max-width: 600rpx;
}

.icon-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 48rpx;

  .warning-icon {
    font-size: 120rpx;
    margin-bottom: 24rpx;
  }

  .warning-title {
    font-size: 40rpx;
    font-weight: 600;
    color: #ff4d4f;
  }
}

.message-section {
  background: #ffffff;
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 32rpx;
  box-shadow: 0 4rpx 24rpx rgba(0, 0, 0, 0.06);

  .message-text {
    display: block;
    font-size: 28rpx;
    color: #595959;
    line-height: 1.6;
    margin-bottom: 16rpx;

    &:last-child {
      margin-bottom: 0;
    }
  }
}

.info-section {
  background: #fff7e6;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 40rpx;

  .info-item {
    display: flex;
    align-items: flex-start;
    gap: 24rpx;

    .info-icon {
      font-size: 48rpx;
      flex-shrink: 0;
    }

    .info-content {
      flex: 1;

      .info-title {
        display: block;
        font-size: 28rpx;
        font-weight: 600;
        color: #262626;
        margin-bottom: 12rpx;
      }

      .info-desc {
        display: block;
        font-size: 24rpx;
        color: #8c8c8c;
        line-height: 1.5;
        margin-bottom: 8rpx;

        &:last-child {
          margin-bottom: 0;
        }
      }
    }
  }
}

.actions-section {
  display: flex;
  flex-direction: column;
  gap: 24rpx;

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
    border: 2rpx solid #d9d9d9;
    border-radius: 48rpx;
    color: #595959;
    font-size: 32rpx;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;

    &:active {
      background: #f5f5f5;
    }
  }
}
</style>
