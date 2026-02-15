<template>
  <view class="notification-page">
    <!-- 加载状态 -->
    <view v-if="pageLoading" class="loading-container">
      <text class="loading-text">加载中...</text>
    </view>

    <template v-else>
      <!-- 通知开关列表 -->
      <view class="section-card">
        <view class="section-title">
          <text class="title-text">消息通知</text>
        </view>

        <view class="switch-list">
          <view class="switch-item">
            <view class="switch-info">
              <text class="switch-title">AI决策通知</text>
              <text class="switch-desc">当AI基金经理做出交易决策时通知</text>
            </view>
            <u-switch v-model="settings.aiDecision" :activeColor="primaryColor" @change="handleSettingChange" />
          </view>

          <view class="switch-item">
            <view class="switch-info">
              <text class="switch-title">重要交易通知</text>
              <text class="switch-desc">大额交易或异常交易时通知</text>
            </view>
            <u-switch v-model="settings.importantTrade" :activeColor="primaryColor" @change="handleSettingChange" />
          </view>

          <view class="switch-item">
            <view class="switch-info">
              <text class="switch-title">排名变化通知</text>
              <text class="switch-desc">竞赛排名上升或下降时通知</text>
            </view>
            <u-switch v-model="settings.rankingChange" :activeColor="primaryColor" @change="handleSettingChange" />
          </view>

          <view class="switch-item">
            <view class="switch-info">
              <text class="switch-title">基金盈亏通知</text>
              <text class="switch-desc">日收益或总收益达到阈值时通知</text>
            </view>
            <u-switch v-model="settings.profitLoss" :activeColor="primaryColor" @change="handleSettingChange" />
          </view>
        </view>
      </view>

      <!-- 免打扰设置 -->
      <view class="section-card">
        <view class="section-title">
          <text class="title-text">免打扰设置</text>
        </view>

        <view class="form-item">
          <view class="label-row">
            <text class="label">开启免打扰</text>
            <u-switch v-model="settings.doNotDisturb.enabled" :activeColor="primaryColor" @change="handleSettingChange" />
          </view>
        </view>

        <template v-if="settings.doNotDisturb.enabled">
          <view class="form-item">
            <text class="label">开始时间</text>
            <picker mode="time" :value="settings.doNotDisturb.startTime" @change="onStartTimeChange">
              <view class="picker">
                <text>{{ settings.doNotDisturb.startTime }}</text>
                <text class="arrow">></text>
              </view>
            </picker>
          </view>

          <view class="form-item">
            <text class="label">结束时间</text>
            <picker mode="time" :value="settings.doNotDisturb.endTime" @change="onEndTimeChange">
              <view class="picker">
                <text>{{ settings.doNotDisturb.endTime }}</text>
                <text class="arrow">></text>
              </view>
            </picker>
          </view>

          <view class="hint-text">
            <text>在免打扰时间段内，您将不会收到推送通知，但重要系统消息仍会显示</text>
          </view>
        </template>
      </view>

      <!-- 保存按钮 -->
      <button
        class="save-btn"
        :class="{ 'btn-disabled': !hasChanges || saving }"
        :disabled="!hasChanges || saving"
        @click="handleSave"
      >
        <text v-if="!saving">保存设置</text>
        <text v-else>保存中...</text>
      </button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const primaryColor = '#1890ff'
const pageLoading = ref(true)
const saving = ref(false)

// 通知设置
const settings = ref({
  aiDecision: true,
  importantTrade: true,
  rankingChange: false,
  profitLoss: true,
  doNotDisturb: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
  },
})

// 原始设置（用于比较是否有修改）
const originalSettings = ref('')

// 是否有修改
const hasChanges = computed(() => {
  return JSON.stringify(settings.value) !== originalSettings.value
})

// 页面加载时获取设置
onMounted(() => {
  loadSettings()
})

// 加载设置
function loadSettings() {
  pageLoading.value = true

  // 从本地存储加载设置
  const savedSettings = uni.getStorageSync('notification_settings')
  if (savedSettings) {
    settings.value = { ...settings.value, ...savedSettings }
  }

  // 保存原始设置用于比较
  originalSettings.value = JSON.stringify(settings.value)

  pageLoading.value = false
}

// 设置变更
function handleSettingChange() {
  // 可以在这里添加实时保存逻辑
}

// 开始时间变更
function onStartTimeChange(e: any) {
  settings.value.doNotDisturb.startTime = e.detail.value
}

// 结束时间变更
function onEndTimeChange(e: any) {
  settings.value.doNotDisturb.endTime = e.detail.value
}

// 保存设置
async function handleSave() {
  if (!hasChanges.value) return

  saving.value = true
  try {
    // 保存到本地存储
    uni.setStorageSync('notification_settings', settings.value)

    // 实际项目中应该调用API保存到后端
    // await notificationApi.updateSettings(settings.value)

    // 模拟API调用延迟
    await new Promise((resolve) => setTimeout(resolve, 500))

    // 更新原始设置
    originalSettings.value = JSON.stringify(settings.value)

    uni.showToast({
      title: '保存成功',
      icon: 'success',
    })
  } catch (error) {
    console.error('Save settings error:', error)
    uni.showToast({
      title: '保存失败',
      icon: 'none',
    })
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.notification-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
  padding-bottom: 48rpx;
}

.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;

  .loading-text {
    font-size: 28rpx;
    color: #8c8c8c;
  }
}

.section-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
}

.section-title {
  margin-bottom: 32rpx;

  .title-text {
    font-size: 32rpx;
    font-weight: 600;
    color: #262626;
  }
}

.switch-list {
  .switch-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24rpx 0;
    border-bottom: 2rpx solid #f0f0f0;

    &:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    &:first-child {
      padding-top: 0;
    }

    .switch-info {
      flex: 1;
      margin-right: 24rpx;

      .switch-title {
        display: block;
        font-size: 30rpx;
        color: #262626;
        font-weight: 500;
        margin-bottom: 8rpx;
      }

      .switch-desc {
        display: block;
        font-size: 26rpx;
        color: #8c8c8c;
      }
    }
  }
}

.form-item {
  margin-bottom: 24rpx;

  &:last-child {
    margin-bottom: 0;
  }

  .label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .label {
    display: block;
    font-size: 28rpx;
    color: #262626;
    margin-bottom: 16rpx;
    font-weight: 500;
  }

  .picker {
    height: 88rpx;
    line-height: 88rpx;
    background: #f5f5f5;
    border-radius: 12rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    color: #262626;
    display: flex;
    justify-content: space-between;
    align-items: center;

    .arrow {
      color: #999999;
      font-size: 28rpx;
    }
  }
}

.hint-text {
  margin-top: 24rpx;
  padding: 24rpx;
  background: rgba(24, 144, 255, 0.05);
  border-radius: 12rpx;

  text {
    font-size: 26rpx;
    color: #8c8c8c;
    line-height: 1.6;
  }
}

.save-btn {
  margin-top: 48rpx;
  height: 96rpx;
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  border-radius: 48rpx;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;

  &:active {
    opacity: 0.9;
  }

  &.btn-disabled {
    background: #d9d9d9;
  }
}
</style>
