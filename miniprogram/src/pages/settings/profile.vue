<template>
  <view class="profile-page">
    <!-- 加载状态 -->
    <view v-if="pageLoading" class="loading-container">
      <text class="loading-text">加载中...</text>
    </view>

    <template v-else>
      <!-- 头像区域 -->
      <view class="avatar-section">
        <view class="avatar-wrapper" @click="handleChooseAvatar">
          <image
            class="avatar"
            :src="form.avatar || '/static/default-avatar.png'"
            mode="aspectFill"
          />
          <view class="avatar-mask">
            <text class="avatar-text">更换头像</text>
          </view>
        </view>
      </view>

      <!-- 表单区域 -->
      <view class="form-card">
        <!-- 昵称 -->
        <view class="form-item">
          <text class="label">昵称</text>
          <input
            class="input"
            v-model="form.nickname"
            placeholder="请输入昵称"
            maxlength="20"
          />
        </view>

        <!-- 个人简介 -->
        <view class="form-item">
          <text class="label">个人简介</text>
          <textarea
            class="textarea"
            v-model="form.bio"
            placeholder="介绍一下自己..."
            maxlength="200"
            :auto-height="true"
          />
          <text class="char-count">{{ form.bio?.length || 0 }}/200</text>
        </view>
      </view>

      <!-- 只读信息 -->
      <view class="form-card">
        <view class="form-item readonly">
          <text class="label">用户名</text>
          <text class="value">{{ userStore.profile?.username || '-' }}</text>
        </view>

        <view class="form-item readonly">
          <text class="label">注册时间</text>
          <text class="value">{{ formatDate(userStore.profile?.createdAt) }}</text>
        </view>
      </view>

      <!-- 保存按钮 -->
      <button
        class="save-btn"
        :class="{ 'btn-disabled': !hasChanges || saving }"
        :disabled="!hasChanges || saving"
        @click="handleSave"
      >
        <text v-if="!saving">保存修改</text>
        <text v-else>保存中...</text>
      </button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const pageLoading = ref(true)
const saving = ref(false)

// 表单数据
const form = ref({
  avatar: '',
  nickname: '',
  bio: '',
})

// 原始数据（用于比较是否有修改）
const originalForm = ref({
  avatar: '',
  nickname: '',
  bio: '',
})

// 是否有修改
const hasChanges = computed(() => {
  return (
    form.value.avatar !== originalForm.value.avatar ||
    form.value.nickname !== originalForm.value.nickname ||
    form.value.bio !== originalForm.value.bio
  )
})

// 页面加载时获取用户信息
onMounted(async () => {
  await loadUserProfile()
})

// 加载用户资料
async function loadUserProfile() {
  pageLoading.value = true
  try {
    const success = await userStore.fetchProfile()
    if (success && userStore.profile) {
      const { avatar, nickname } = userStore.profile
      form.value = {
        avatar: avatar || '',
        nickname: nickname || '',
        bio: '', // 后端暂无bio字段
      }
      originalForm.value = { ...form.value }
    }
  } finally {
    pageLoading.value = false
  }
}

// 选择头像
function handleChooseAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const tempFilePath = res.tempFilePaths[0]
      uploadAvatar(tempFilePath)
    },
    fail: () => {
      uni.showToast({ title: '选择图片失败', icon: 'none' })
    },
  })
}

// 上传头像
function uploadAvatar(filePath: string) {
  uni.showLoading({ title: '上传中...' })

  // 实际项目中应该上传到服务器
  // 这里模拟上传成功，直接使用本地路径
  setTimeout(() => {
    form.value.avatar = filePath
    uni.hideLoading()
    uni.showToast({ title: '头像已更新', icon: 'success' })
  }, 1000)

  // 实际上传代码示例：
  // uni.uploadFile({
  //   url: `${BASE_URL}/api/upload/avatar`,
  //   filePath,
  //   name: 'file',
  //   header: {
  //     Authorization: `Bearer ${token}`,
  //   },
  //   success: (res) => {
  //     const data = JSON.parse(res.data)
  //     form.value.avatar = data.url
  //     uni.showToast({ title: '上传成功', icon: 'success' })
  //   },
  //   fail: () => {
  //     uni.showToast({ title: '上传失败', icon: 'none' })
  //   },
  //   complete: () => {
  //     uni.hideLoading()
  //   },
  // })
}

// 保存修改
async function handleSave() {
  if (!hasChanges.value) return

  saving.value = true
  try {
    const success = await userStore.updateProfile({
      nickname: form.value.nickname,
      avatar: form.value.avatar,
    })

    if (success) {
      originalForm.value = { ...form.value }
    }
  } finally {
    saving.value = false
  }
}

// 格式化日期
function formatDate(dateStr?: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
</script>

<style lang="scss" scoped>
.profile-page {
  min-height: 100vh;
  background: #f5f5f5;
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

.avatar-section {
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  padding: 48rpx 0;
  display: flex;
  justify-content: center;

  .avatar-wrapper {
    position: relative;
    width: 160rpx;
    height: 160rpx;
    border-radius: 50%;
    overflow: hidden;
    border: 4rpx solid rgba(255, 255, 255, 0.3);

    .avatar {
      width: 100%;
      height: 100%;
    }

    .avatar-mask {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 50%;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;

      .avatar-text {
        font-size: 24rpx;
        color: #ffffff;
      }
    }
  }
}

.form-card {
  background: #ffffff;
  border-radius: 16rpx;
  margin: 24rpx;
  padding: 32rpx;
}

.form-item {
  margin-bottom: 32rpx;

  &:last-child {
    margin-bottom: 0;
  }

  &.readonly {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .value {
      font-size: 28rpx;
      color: #8c8c8c;
    }
  }

  .label {
    display: block;
    font-size: 28rpx;
    color: #262626;
    margin-bottom: 16rpx;
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

  .textarea {
    min-height: 160rpx;
    background: #f5f5f5;
    border-radius: 12rpx;
    padding: 24rpx;
    font-size: 28rpx;
    color: #262626;
    width: 100%;
    box-sizing: border-box;
  }

  .char-count {
    display: block;
    text-align: right;
    font-size: 24rpx;
    color: #8c8c8c;
    margin-top: 8rpx;
  }
}

.save-btn {
  margin: 48rpx 24rpx;
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
