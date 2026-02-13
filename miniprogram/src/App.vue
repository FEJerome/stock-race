<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'

onLaunch(() => {
  console.log('App Launch')
})

onShow(() => {
  console.log('App Show')
})

onHide(() => {
  console.log('App Hide')
})
</script>

<style lang="scss">
// 先导入 uview-plus 主题变量
@import "uview-plus/theme.scss";
// 再导入 uview-plus 样式
@import "uview-plus/index.scss";
@import "@/styles/variables.scss";
@import "@/styles/global.scss";
@import "@/styles/animations.scss";

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
