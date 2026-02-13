<template>
  <view class="hero-profile">
    <view class="profile-bg"></view>
    
    <view class="profile-container">
      <view class="hero-card">
        <view class="avatar-section">
          <view class="avatar-wrapper">
            <image class="avatar" :src="userStore.profile?.avatar || '/static/default-avatar.png'" mode="aspectFill" />
            <view class="level-badge">
              <text class="level-text">Lv.{{ userLevel }}</text>
            </view>
            <view class="avatar-glow"></view>
          </view>
          <view class="hero-title">
            <text class="nickname">{{ userStore.profile?.nickname || userStore.profile?.username }}</text>
            <text class="title-badge">{{ heroTitle }}</text>
          </view>
        </view>

        <view class="stats-grid">
          <view class="stat-card">
            <text class="stat-icon">⚔️</text>
            <text class="stat-value">{{ totalTrades }}</text>
            <text class="stat-label">总交易</text>
          </view>
          <view class="stat-card">
            <text class="stat-icon">🏆</text>
            <text class="stat-value">{{ winRate }}%</text>
            <text class="stat-label">胜率</text>
          </view>
          <view class="stat-card">
            <text class="stat-icon">📈</text>
            <text class="stat-value">{{ totalReturn }}%</text>
            <text class="stat-label">总收益</text>
          </view>
          <view class="stat-card">
            <text class="stat-icon">🔥</text>
            <text class="stat-value">{{ winStreak }}</text>
            <text class="stat-label">连胜</text>
          </view>
        </view>

        <view class="experience-section">
          <view class="exp-header">
            <text class="exp-label">经验值</text>
            <text class="exp-value">{{ currentExp }} / {{ maxExp }}</text>
          </view>
          <view class="exp-bar">
            <view class="exp-fill" :style="{ width: (currentExp / maxExp * 100) + '%' }">
              <view class="exp-glow"></view>
            </view>
          </view>
          <text class="exp-hint">再获得 {{ maxExp - currentExp }} 经验升级到 Lv.{{ userLevel + 1 }}</text>
        </view>
      </view>

      <view class="achievements-section">
        <view class="section-header">
          <text class="section-title">🏅 成就徽章</text>
          <text class="section-count">{{ achievements.length }}/{{ totalAchievements }}</text>
        </view>
        <scroll-view class="achievements-scroll" scroll-x>
          <view
            v-for="achievement in achievements"
            :key="achievement.id"
            class="achievement-item"
            :class="{ 'unlocked': achievement.unlocked }"
            @tap="viewAchievementDetail(achievement)"
          >
            <view class="achievement-icon">{{ achievement.icon }}</view>
            <text class="achievement-name">{{ achievement.name }}</text>
            <view class="achievement-progress" v-if="!achievement.unlocked">
              <view class="progress-bar" :style="{ width: (achievement.progress / achievement.target * 100) + '%' }"></view>
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="skills-section">
        <view class="section-header">
          <text class="section-title">🎯 技能树</text>
          <text class="section-count">{{ skillPoints }} 点可用</text>
        </view>
        <view class="skills-grid">
          <view
            v-for="skill in skills"
            :key="skill.id"
            class="skill-card"
            @tap="upgradeSkill(skill)"
          >
            <view class="skill-icon">{{ skill.icon }}</view>
            <text class="skill-name">{{ skill.name }}</text>
            <view class="skill-level">
              <text class="level-text">Lv.{{ skill.level }}</text>
            </view>
            <view class="skill-progress">
              <view class="progress-dots">
                <view
                  v-for="i in 5"
                  :key="i"
                  class="dot"
                  :class="{ 'filled': i <= skill.level }"
                ></view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="menu-list">
        <view class="menu-group">
          <view class="menu-item" @tap="editProfile">
            <text class="menu-icon">👤</text>
            <text class="menu-label">编辑资料</text>
            <text class="menu-arrow">›</text>
          </view>
          <view class="menu-item" @tap="changePassword">
            <text class="menu-icon">🔒</text>
            <text class="menu-label">修改密码</text>
            <text class="menu-arrow">›</text>
          </view>
        </view>

        <view class="menu-group">
          <view class="menu-item" @tap="showEnvSwitcher = true">
            <text class="menu-icon">⚙️</text>
            <text class="menu-label">环境配置</text>
            <view class="menu-value">
              <text class="value-text" :class="currentEnv">{{ currentEnvName }}</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
          <view class="menu-item" @tap="clearCache">
            <text class="menu-icon">🗑️</text>
            <text class="menu-label">清除缓存</text>
            <text class="menu-arrow">›</text>
          </view>
          <view class="menu-item" @tap="showAbout">
            <text class="menu-icon">ℹ️</text>
            <text class="menu-label">关于我们</text>
            <text class="menu-arrow">›</text>
          </view>
        </view>
      </view>

      <view class="logout-section">
        <view class="logout-btn" @tap="handleLogout">
          <text class="logout-text">退出登录</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const showEnvSwitcher = ref(false)

const userLevel = ref(25)
const currentExp = ref(3750)
const maxExp = ref(5000)
const totalTrades = ref(156)
const winRate = ref(58)
const totalReturn = ref(45.2)
const winStreak = ref(3)
const skillPoints = ref(5)
const totalAchievements = ref(20)

const heroTitle = computed(() => {
  if (userLevel.value >= 40) return '🌟 传奇交易员'
  if (userLevel.value >= 30) return '💎 大师级'
  if (userLevel.value >= 20) return '🎖️ 专家级'
  if (userLevel.value >= 10) return '⭐ 高级交易员'
  return '🌱 新手交易员'
})

const currentEnv = computed(() => 'dev')
const currentEnvName = computed(() => '开发环境')

const achievements = ref([
  { id: 1, name: '首战告捷', icon: '🎯', unlocked: true, progress: 1, target: 1 },
  { id: 2, name: '连胜三场', icon: '🔥', unlocked: true, progress: 3, target: 3 },
  { id: 3, name: '百万富翁', icon: '💰', unlocked: false, progress: 52, target: 100 },
  { id: 4, name: '交易达人', icon: '📊', unlocked: true, progress: 156, target: 100 },
  { id: 5, name: '精准射手', icon: '🎯', unlocked: false, progress: 68, target: 80 },
  { id: 6, name: '长期持有', icon: '⏳', unlocked: false, progress: 30, target: 90 },
])

const skills = ref([
  { id: 1, name: '风险控制', icon: '🛡️', level: 3 },
  { id: 2, name: '市场分析', icon: '📈', level: 4 },
  { id: 3, name: '元宝管理', icon: '💰', level: 2 },
  { id: 4, name: '心理素质', icon: '🧠', level: 3 },
  { id: 5, name: '技术分析', icon: '📊', level: 2 },
  { id: 6, name: '基本面分析', icon: '📋', level: 1 },
])

function editProfile() {
  uni.navigateTo({ url: '/pages/settings/edit-profile' })
}

function changePassword() {
  uni.navigateTo({ url: '/pages/settings/change-password' })
}

function clearCache() {
  uni.showModal({
    title: '清除缓存',
    content: '确定要清除所有缓存数据吗？',
    success: (res) => {
      if (res.confirm) {
        uni.showToast({ title: '缓存已清除', icon: 'success' })
      }
    },
  })
}

function showAbout() {
  uni.navigateTo({ url: '/pages/settings/about' })
}

function handleLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出登录吗？',
    success: (res) => {
      if (res.confirm) {
        userStore.logout()
        uni.reLaunch({ url: '/pages/login/index' })
      }
    },
  })
}

function viewAchievementDetail(achievement: any) {
  console.log('查看成就:', achievement.name)
}

function upgradeSkill(skill: any) {
  if (skillPoints.value <= 0) {
    uni.showToast({ title: '技能点不足', icon: 'none' })
    return
  }
  if (skill.level >= 5) {
    uni.showToast({ title: '技能已满级', icon: 'none' })
    return
  }
  skill.level++
  skillPoints.value--
  uni.showToast({ title: `${skill.name} 升级成功！`, icon: 'success' })
}

onMounted(() => {
  console.log('英雄档案已加载')
})
</script>

<style lang="scss" scoped>
.hero-profile {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  position: relative;
  overflow: hidden;

  .profile-bg {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: 
      radial-gradient(circle at 50% 10%, rgba(102, 126, 234, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 20% 80%, rgba(168, 85, 247, 0.1) 0%, transparent 40%),
      radial-gradient(circle at 80% 80%, rgba(255, 215, 0, 0.08) 0%, transparent 40%);
    pointer-events: none;
    z-index: 0;
  }

  .profile-container {
    position: relative;
    z-index: 1;
    padding: 24rpx;
  }
}

.hero-card {
  margin-bottom: 32rpx;
  padding: 32rpx;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20rpx);
  border-radius: 24rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.1);

  .avatar-section {
    text-align: center;
    margin-bottom: 32rpx;

    .avatar-wrapper {
      position: relative;
      display: inline-block;
      margin-bottom: 16rpx;

      .avatar {
        width: 160rpx;
        height: 160rpx;
        border-radius: 50%;
        border: 4rpx solid rgba(255, 215, 0, 0.5);
      }

      .level-badge {
        position: absolute;
        bottom: -8rpx;
        left: 50%;
        transform: translateX(-50%);
        padding: 8rpx 20rpx;
        background: linear-gradient(135deg, #ffd700 0%, #ffec8b 100%);
        border-radius: 20rpx;
        font-size: 22rpx;
        font-weight: bold;
        color: #1a1a2e;
        box-shadow: 0 4rpx 12rpx rgba(255, 215, 0, 0.4);
      }

      .avatar-glow {
        position: absolute;
        top: -8rpx;
        left: -8rpx;
        right: -8rpx;
        bottom: -8rpx;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%);
        animation: pulse 2s ease-in-out infinite;
      }
    }

    .hero-title {
      display: block;
      text-align: center;

      .nickname {
        display: block;
        font-size: 36rpx;
        font-weight: bold;
        color: #ffffff;
        margin-bottom: 8rpx;
      }

      .title-badge {
        display: inline-block;
        padding: 8rpx 24rpx;
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(168, 85, 247, 0.3) 100%);
        border-radius: 20rpx;
        font-size: 24rpx;
        color: #a855f7;
      }
    }
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12rpx;
    margin-bottom: 32rpx;

    .stat-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8rpx;
      padding: 20rpx 12rpx;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 16rpx;
      border: 1rpx solid rgba(255, 255, 255, 0.05);

      .stat-icon {
        font-size: 32rpx;
      }

      .stat-value {
        font-size: 28rpx;
        font-weight: bold;
        color: #ffd700;
      }

      .stat-label {
        font-size: 20rpx;
        color: rgba(255, 255, 255, 0.5);
      }
    }
  }

  .experience-section {
    .exp-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12rpx;

      .exp-label {
        font-size: 24rpx;
        color: rgba(255, 255, 255, 0.8);
      }

      .exp-value {
        font-size: 24rpx;
        font-weight: 600;
        color: #ffd700;
      }
    }

    .exp-bar {
      height: 16rpx;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8rpx;
      overflow: hidden;
      margin-bottom: 8rpx;

      .exp-fill {
        height: 100%;
        background: linear-gradient(90deg, #ffd700 0%, #ffec8b 100%);
        border-radius: 8rpx;
        position: relative;

        .exp-glow {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
          animation: shimmer 2s infinite;
        }
      }
    }

    .exp-hint {
      display: block;
      font-size: 20rpx;
      color: rgba(255, 255, 255, 0.5);
      text-align: center;
    }
  }
}

.achievements-section,
.skills-section {
  margin-bottom: 32rpx;

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16rpx;

    .section-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #ffffff;
    }

    .section-count {
      font-size: 24rpx;
      color: rgba(255, 255, 255, 0.5);
    }
  }
}

.achievements-scroll {
  white-space: nowrap;
  padding-bottom: 8rpx;

  .achievement-item {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
    padding: 20rpx;
    margin-right: 16rpx;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20rpx);
    border-radius: 20rpx;
    border: 1rpx solid rgba(255, 255, 255, 0.1);
    min-width: 140rpx;
    transition: all 0.3s ease;

    &.unlocked {
      background: rgba(255, 215, 0, 0.1);
      border-color: rgba(255, 215, 0, 0.3);
    }

    .achievement-icon {
      font-size: 48rpx;
      margin-bottom: 4rpx;
      opacity: 0.5;

      .unlocked & {
        opacity: 1;
      }
    }

    .achievement-name {
      font-size: 22rpx;
      color: rgba(255, 255, 255, 0.8);
      text-align: center;
    }

    .achievement-progress {
      width: 100%;
      height: 4rpx;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2rpx;
      overflow: hidden;
      margin-top: 8rpx;

      .progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #667eea 0%, #a855f7 100%);
        border-radius: 2rpx;
      }
    }
  }
}

.skills-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;

  .skill-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12rpx;
    padding: 24rpx 16rpx;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20rpx);
    border-radius: 20rpx;
    border: 1rpx solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;

    &:active {
      transform: scale(0.95);
    }

    .skill-icon {
      font-size: 40rpx;
    }

    .skill-name {
      font-size: 24rpx;
      font-weight: 600;
      color: #ffffff;
    }

    .skill-level {
      padding: 4rpx 12rpx;
      background: rgba(102, 126, 234, 0.2);
      border-radius: 12rpx;

      .level-text {
        font-size: 20rpx;
        font-weight: bold;
        color: #667eea;
      }
    }

    .skill-progress {
      .progress-dots {
        display: flex;
        gap: 6rpx;

        .dot {
          width: 8rpx;
          height: 8rpx;
          border-radius: 4rpx;
          background: rgba(255, 255, 255, 0.2);

          &.filled {
            background: linear-gradient(135deg, #667eea 0%, #a855f7 100%);
          }
        }
      }
    }
  }
}

.menu-list {
  margin-bottom: 32rpx;

  .menu-group {
    margin-bottom: 16rpx;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20rpx);
    border-radius: 20rpx;
    border: 1rpx solid rgba(255, 255, 255, 0.1);
    overflow: hidden;

    .menu-item {
      display: flex;
      align-items: center;
      gap: 16rpx;
      padding: 24rpx;
      border-bottom: 1rpx solid rgba(255, 255, 255, 0.05);
      transition: all 0.3s ease;

      &:last-child {
        border-bottom: none;
      }

      &:active {
        background: rgba(255, 255, 255, 0.08);
      }

      .menu-icon {
        font-size: 32rpx;
      }

      .menu-label {
        flex: 1;
        font-size: 28rpx;
        color: rgba(255, 255, 255, 0.9);
      }

      .menu-value {
        display: flex;
        align-items: center;
        gap: 8rpx;

        .value-text {
          font-size: 24rpx;
          color: rgba(255, 255, 255, 0.6);
        }

        .menu-arrow {
          font-size: 32rpx;
          color: rgba(255, 255, 255, 0.4);
        }
      }

      .menu-arrow {
        font-size: 32rpx;
        color: rgba(255, 255, 255, 0.4);
      }
    }
  }
}

.logout-section {
  .logout-btn {
    width: 100%;
    padding: 28rpx;
    background: rgba(255, 77, 79, 0.15);
    border-radius: 20rpx;
    border: 1rpx solid rgba(255, 77, 79, 0.3);
    text-align: center;
    transition: all 0.3s ease;

    &:active {
      background: rgba(255, 77, 79, 0.25);
    }

    .logout-text {
      font-size: 28rpx;
      font-weight: 600;
      color: #ff4d4f;
    }
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.5;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
</style>
