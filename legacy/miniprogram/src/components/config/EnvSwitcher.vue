<template>
  <view class="env-switcher">
    <view class="section-title">环境配置</view>

    <view class="current-env">
      <text class="label">当前环境</text>
      <text class="value" :class="currentEnv">{{ currentEnvName }}</text>
    </view>

    <view class="env-list">
      <view
        v-for="item in envList"
        :key="item.value"
        class="env-item"
        :class="{ active: currentEnv === item.value }"
        @click="handleSwitch(item.value)"
      >
        <view class="env-info">
          <text class="env-name">{{ item.label }}</text>
          <text class="env-desc">{{ item.description }}</text>
        </view>
        <view v-if="currentEnv === item.value" class="check-icon">✓</view>
      </view>
    </view>

    <view class="env-detail" v-if="currentConfig">
      <view class="detail-title">当前配置详情</view>
      <view class="detail-item">
        <text class="detail-label">API地址</text>
        <text class="detail-value">{{ currentConfig.apiBaseUrl }}</text>
      </view>
      <view class="detail-item">
        <text class="detail-label">WebSocket</text>
        <text class="detail-value">{{ currentConfig.wsBaseUrl }}</text>
      </view>
      <view class="detail-item">
        <text class="detail-label">日志记录</text>
        <text class="detail-value">{{ currentConfig.enableLog ? '开启' : '关闭' }}</text>
      </view>
    </view>

    <view class="warning" v-if="currentEnv === 'prod'">
      <text class="warning-icon">⚠️</text>
      <text class="warning-text">当前为生产环境，请谨慎操作</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getCurrentEnv, getEnvConfig, switchEnv, getAvailableEnvs } from '@/config/env'
import type { AppEnv } from '@/types/config'

// 当前环境
const currentEnv = computed(() => getCurrentEnv())
const currentConfig = computed(() => getEnvConfig())
const envList = getAvailableEnvs()

// 当前环境名称
const currentEnvName = computed(() => {
  const names: Record<AppEnv, string> = {
    local: '本地开发',
    dev: '联调环境',
    prod: '生产环境',
  }
  return names[currentEnv.value] || currentEnv.value
})

// 切换环境
const handleSwitch = (env: AppEnv) => {
  if (env === currentEnv.value) return

  uni.showModal({
    title: '切换环境',
    content: `确定切换到「${envList.find((e) => e.value === env)?.label}」吗？\n\n小程序将重启以应用新配置。`,
    success: (res) => {
      if (res.confirm) {
        switchEnv(env)
      }
    },
  })
}
</script>

<style scoped lang="scss">
.env-switcher {
  padding: 20rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #262626;
  margin-bottom: 24rpx;
}

.current-env {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx;
  background: #f5f5f5;
  border-radius: 12rpx;
  margin-bottom: 24rpx;

  .label {
    font-size: 28rpx;
    color: #595959;
  }

  .value {
    font-size: 28rpx;
    font-weight: 500;
    padding: 8rpx 20rpx;
    border-radius: 8rpx;

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

.env-list {
  margin-bottom: 32rpx;

  .env-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24rpx;
    border: 2rpx solid #f0f0f0;
    border-radius: 12rpx;
    margin-bottom: 16rpx;
    transition: all 0.3s;

    &.active {
      border-color: #1890ff;
      background: #e6f7ff;
    }

    .env-info {
      flex: 1;

      .env-name {
        font-size: 30rpx;
        font-weight: 500;
        color: #262626;
        display: block;
        margin-bottom: 8rpx;
      }

      .env-desc {
        font-size: 24rpx;
        color: #8c8c8c;
        display: block;
      }
    }

    .check-icon {
      width: 48rpx;
      height: 48rpx;
      line-height: 48rpx;
      text-align: center;
      background: #1890ff;
      color: #fff;
      border-radius: 50%;
      font-size: 28rpx;
    }
  }
}

.env-detail {
  padding: 24rpx;
  background: #fafafa;
  border-radius: 12rpx;
  margin-bottom: 24rpx;

  .detail-title {
    font-size: 26rpx;
    font-weight: 500;
    color: #262626;
    margin-bottom: 16rpx;
  }

  .detail-item {
    display: flex;
    justify-content: space-between;
    padding: 12rpx 0;
    border-bottom: 1rpx solid #f0f0f0;

    &:last-child {
      border-bottom: none;
    }

    .detail-label {
      font-size: 24rpx;
      color: #8c8c8c;
    }

    .detail-value {
      font-size: 24rpx;
      color: #262626;
      font-weight: 500;
      word-break: break-all;
      max-width: 60%;
      text-align: right;
    }
  }
}

.warning {
  display: flex;
  align-items: center;
  padding: 20rpx;
  background: #fff7e6;
  border: 2rpx solid #ffd591;
  border-radius: 12rpx;

  .warning-icon {
    font-size: 32rpx;
    margin-right: 12rpx;
  }

  .warning-text {
    font-size: 26rpx;
    color: #d46b08;
  }
}
</style>
