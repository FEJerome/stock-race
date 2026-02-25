<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

onLaunch(async () => {
  console.log('App Launch')
  
  // 检查登录状态
  if (!authStore.token) {
    // 未登录，初始化游客模式
    const guestResult = await authStore.initGuestMode()
    
    // 根据游客状态跳转到不同页面
    if (guestResult.isNewGuest) {
      // 新游客，显示欢迎页
      uni.redirectTo({ url: '/pages/welcome/welcome' })
    } else if (guestResult.isExpired && guestResult.hasAIAccount) {
      // 老游客，数据已清空（创建过AI账户），显示数据清空提示页
      uni.redirectTo({ url: '/pages/expired/expired' })
    } else if (!guestResult.isExpired) {
      // 老游客，数据有效，显示建议登录弹窗
      showLoginSuggestion()
    }
    // 其他情况（老游客数据已清空但未创建AI账户）当作新游客处理，已在 initGuestMode 中处理
  }
})

onShow(() => {
  console.log('App Show')
})

onHide(() => {
  console.log('App Hide')
})

// 显示建议登录弹窗
function showLoginSuggestion() {
  uni.showModal({
    title: '温馨提示',
    content: '检测到您是老用户，建议您先进行微信登录，确保账户信息可以长期保存。\n\n游客账户有效期：\n• 未创建AI账户：24h\n• 已创建AI账户：72h',
    confirmText: '立即登录',
    cancelText: '稍后再说',
    success: (res) => {
      if (res.confirm) {
        // 跳转到登录页
        uni.redirectTo({ url: '/pages/login/login' })
      }
      // 取消则继续使用游客模式，进入首页
    },
  })
}
</script>

<style lang="scss">
// 先导入 uview-plus 主题变量
@import "uview-plus/theme.scss";
// 再导入 uview-plus 样式
@import "uview-plus/index.scss";

page {
  background-color: #F5F5F5;
}

/* 全局样式 */
.container {
  padding: 20rpx;
}

.card {
  background: #FFFFFF;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.text-primary {
  color: #1890FF;
}

.text-success {
  color: #52C41A;
}

.text-danger {
  color: #FF4D4F;
}

.text-warning {
  color: #FAAD14;
}

.text-title {
  color: #262626;
  font-weight: 600;
}

.text-body {
  color: #595959;
}

.text-muted {
  color: #8C8C8C;
}
</style>
