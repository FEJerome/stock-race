<template>
  <view class="welcome-page">
    <view class="welcome-bg"></view>
    
    <view class="welcome-container">
      <view class="logo-section">
        <view class="logo-icon-wrapper">
          <text class="logo-icon">🤖</text>
          <view class="logo-glow"></view>
        </view>
        <text class="title">AI财商竞技场</text>
        <text class="subtitle">虚拟竞技，真实学习</text>
        <view class="badge-row">
          <view class="badge">
            <text class="badge-icon">🎓</text>
            <text class="badge-text">财商教育</text>
          </view>
          <view class="badge">
            <text class="badge-icon">💰</text>
            <text class="badge-text">虚拟竞技</text>
          </view>
          <view class="badge">
            <text class="badge-icon">🤖</text>
            <text class="badge-text">AI智能</text>
          </view>
        </view>
      </view>

      <view class="features-section">
        <view class="feature-item">
          <view class="feature-icon">📊</view>
          <text class="feature-title">实时行情</text>
          <text class="feature-desc">实时获取股票行情数据</text>
        </view>
        <view class="feature-item">
          <view class="feature-icon">🤖</view>
          <text class="feature-title">AI交易员</text>
          <text class="feature-desc">聘任AI交易员管理元宝</text>
        </view>
        <view class="feature-item">
          <view class="feature-icon">💰</view>
          <text class="feature-title">虚拟竞技</text>
          <text class="feature-desc">零风险虚拟交易竞技</text>
        </view>
        <view class="feature-item">
          <view class="feature-icon">🏆</view>
          <text class="feature-title">排行榜</text>
          <text class="feature-desc">与其他投资者一较高下</text>
        </view>
      </view>

      <view class="age-warning-card">
        <view class="warning-header">
          <text class="warning-icon">⚠️</text>
          <text class="warning-title">年龄提示</text>
        </view>
        <view class="warning-content">
          <text class="warning-text">本平台为虚拟投资模拟平台</text>
          <text class="warning-text">旨在提供财商教育和投资知识学习</text>
          <text class="warning-text">所有交易均为虚拟竞技，不涉及真实货币</text>
        </view>
        <view class="age-question">
          <text class="question-text">您是否已满18岁？</text>
        </view>
        <view class="age-buttons">
          <view class="age-btn guardian" @click="handleGuardian">
            <text class="btn-icon">👨‍👩‍👧</text>
            <text class="btn-text">我是监护人</text>
          </view>
          <view class="age-btn adult" @click="handleAdult">
            <text class="btn-icon">✓</text>
            <text class="btn-text">我已满18岁</text>
          </view>
        </view>
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

function handleAdult() {
  uni.setStorageSync('ageConfirmed', true)
  uni.setStorageSync('userType', 'adult')
  
  authStore.markWelcomeShown()
  uni.switchTab({ url: '/pages/index/index' })
}

function handleGuardian() {
  uni.setStorageSync('ageConfirmed', true)
  uni.setStorageSync('userType', 'guardian')
  
  authStore.markWelcomeShown()
  uni.switchTab({ url: '/pages/index/index' })
}
</script>

<style lang="scss" scoped>
.welcome-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}

.welcome-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: 
    radial-gradient(circle at 20% 30%, rgba(102, 126, 234, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(255, 215, 0, 0.05) 0%, transparent 50%);
  pointer-events: none;
}

.welcome-container {
  width: 100%;
  max-width: 600rpx;
  position: relative;
  z-index: 1;
}

.logo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 48rpx;

  .logo-icon-wrapper {
    position: relative;
    margin-bottom: 24rpx;

    .logo-icon {
      font-size: 120rpx;
      display: block;
      position: relative;
      z-index: 2;
    }

    .logo-glow {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 180rpx;
      height: 180rpx;
      background: radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%);
      border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }
  }

  .title {
    font-size: 48rpx;
    font-weight: bold;
    color: #ffd700;
    margin-bottom: 12rpx;
    text-shadow: 0 0 20rpx rgba(255, 215, 0, 0.3);
  }

  .subtitle {
    font-size: 28rpx;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 24rpx;
    letter-spacing: 2rpx;
  }

  .badge-row {
    display: flex;
    gap: 16rpx;
    flex-wrap: wrap;
    justify-content: center;

    .badge {
      display: flex;
      align-items: center;
      gap: 8rpx;
      padding: 12rpx 20rpx;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 32rpx;
      border: 1rpx solid rgba(255, 255, 255, 0.2);

      .badge-icon {
        font-size: 24rpx;
      }

      .badge-text {
        font-size: 24rpx;
        color: rgba(255, 255, 255, 0.9);
      }
    }
  }
}

.features-section {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10rpx);
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 32rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.1);

  .feature-item {
    display: flex;
    align-items: center;
    gap: 24rpx;
    margin-bottom: 32rpx;

    &:last-child {
      margin-bottom: 0;
    }

    .feature-icon {
      font-size: 48rpx;
      flex-shrink: 0;
    }

    .feature-info {
      flex: 1;
      min-width: 0;
    }

    .feature-title {
      display: block;
      font-size: 28rpx;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      margin-bottom: 4rpx;
    }

    .feature-desc {
      display: block;
      font-size: 24rpx;
      color: rgba(255, 255, 255, 0.6);
    }
  }
}

.age-warning-card {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 215, 0, 0.05) 100%);
  backdrop-filter: blur(10rpx);
  border-radius: 24rpx;
  padding: 32rpx;
  margin-bottom: 32rpx;
  border: 2rpx solid rgba(255, 215, 0, 0.3);

  .warning-header {
    display: flex;
    align-items: center;
    gap: 12rpx;
    margin-bottom: 20rpx;

    .warning-icon {
      font-size: 32rpx;
    }

    .warning-title {
      font-size: 28rpx;
      font-weight: 600;
      color: #ffd700;
    }
  }

  .warning-content {
    margin-bottom: 24rpx;

    .warning-text {
      display: block;
      font-size: 24rpx;
      color: rgba(255, 255, 255, 0.8);
      line-height: 1.8;
      margin-bottom: 8rpx;
      text-align: center;
    }
  }

  .age-question {
    text-align: center;
    padding: 20rpx 0;
    margin-bottom: 20rpx;
    border-top: 1rpx solid rgba(255, 215, 0, 0.2);
    border-bottom: 1rpx solid rgba(255, 215, 0, 0.2);

    .question-text {
      font-size: 26rpx;
      font-weight: 600;
      color: #ffd700;
    }
  }

  .age-buttons {
    display: flex;
    gap: 16rpx;

    .age-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8rpx;
      padding: 24rpx 16rpx;
      border-radius: 16rpx;
      transition: all 0.3s ease;

      &.guardian {
        background: rgba(255, 255, 255, 0.1);
        border: 1rpx solid rgba(255, 255, 255, 0.2);

        &:active {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      &.adult {
        background: linear-gradient(135deg, #ffd700 0%, #ffec8b 100%);
        border: 1rpx solid rgba(255, 215, 0, 0.5);

        &:active {
          opacity: 0.9;
        }
      }

      .btn-icon {
        font-size: 36rpx;
      }

      .btn-text {
        font-size: 24rpx;
        font-weight: 600;

        .guardian & {
          color: rgba(255, 255, 255, 0.9);
        }

        .adult & {
          color: #1a1a2e;
        }
      }
    }
  }
}

.hint-section {
  text-align: center;

  .hint-text {
    display: block;
    font-size: 24rpx;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 16rpx;
  }

  .hint-details {
    display: flex;
    flex-direction: column;
    gap: 8rpx;

    .hint-item {
      font-size: 22rpx;
      color: rgba(255, 255, 255, 0.5);
    }
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.5;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 0.8;
    transform: translate(-50%, -50%) scale(1.1);
  }
}
</style>
