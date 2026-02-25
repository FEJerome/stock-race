<template>
  <view class="immersive-dashboard">
    <view class="dashboard-bg"></view>
    
    <view class="dashboard-container">
      <view class="header-section">
        <view class="header-content">
          <view class="user-info">
            <view class="user-avatar avatar-glow">
              <text class="avatar-emoji">{{ userAvatar }}</text>
              <view class="avatar-ring"></view>
            </view>
            <view class="user-details">
              <text class="welcome-text">欢迎回来，{{ userName }}</text>
              <text class="user-level">Lv.{{ userLevel }} 投资总监</text>
            </view>
          </view>
          <view class="header-actions">
            <view class="notification-btn" @click="showNotifications">
              <text class="notification-icon">🔔</text>
              <view class="notification-badge badge-pulse" v-if="notificationCount > 0">
                <text class="badge-count">{{ notificationCount }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="main-content">
        <view class="treasury-card card-float">
          <view class="treasury-bg bg-shimmer"></view>
          <view class="treasury-content">
            <view class="treasury-header">
              <text class="treasury-title">💰 国库资金</text>
              <view class="refresh-btn" @click="refreshData">
                <text class="refresh-icon" :class="{ 'rotating': loading }">↻</text>
              </view>
            </view>
            <view class="treasury-amount">
              <text class="amount-value text-glow">{{ formatMoney(totalAssets) }}</text>
              <text class="amount-unit">元宝</text>
            </view>
            <view class="treasury-stats">
              <view class="stat-item stat-hover">
                <text class="stat-icon icon-bounce">{{ totalProfit >= 0 ? '📈' : '📉' }}</text>
                <view class="stat-info">
                  <text class="stat-label">总收益</text>
                  <text class="stat-value" :class="totalProfit >= 0 ? 'text-rise' : 'text-fall'">
                    {{ formatChange(totalProfit) }}
                  </text>
                </view>
              </view>
              <view class="stat-item stat-hover">
                <text class="stat-icon icon-bounce">💰</text>
                <view class="stat-info">
                  <text class="stat-label">可用元宝</text>
                  <text class="stat-value">{{ formatMoney(cashBalance) }}</text>
                </view>
              </view>
              <view class="stat-item stat-hover">
                <text class="stat-icon icon-bounce">📊</text>
                <view class="stat-info">
                  <text class="stat-label">持仓市值</text>
                  <text class="stat-value">{{ formatMoney(holdingsValue) }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view class="mission-card card-slide">
          <view class="mission-header">
            <text class="mission-title">🎯 本月任务</text>
            <view class="mission-status status-pulse" :class="missionStatusClass">
              <text class="status-text">{{ missionStatus }}</text>
            </view>
          </view>
          <view class="mission-progress">
            <view class="progress-bar">
              <view class="progress-fill progress-shimmer" :style="{ width: missionProgress + '%' }"></view>
            </view>
            <text class="progress-text">{{ missionProgress.toFixed(1) }}%</text>
          </view>
          <view class="mission-details">
            <view class="detail-row detail-fade">
              <text class="detail-label">目标收益率</text>
              <text class="detail-value">10%</text>
            </view>
            <view class="detail-row detail-fade">
              <text class="detail-label">当前收益率</text>
              <text class="detail-value" :class="profitRate >= 0 ? 'text-rise' : 'text-fall'">
                {{ formatPercent(profitRate) }}
              </text>
            </view>
            <view class="detail-row detail-fade">
              <text class="detail-label">剩余时间</text>
              <text class="detail-value">{{ remainingDays }}天</text>
            </view>
          </view>
          <view class="mission-reward">
            <text class="reward-label">任务奖励</text>
            <view class="reward-items">
              <view class="reward-item reward-hover">
                <text class="reward-icon icon-spin">🏅</text>
                <text class="reward-name">成就徽章</text>
              </view>
              <view class="reward-item reward-hover">
                <text class="reward-icon icon-spin">⭐</text>
                <text class="reward-name">经验值+500</text>
              </view>
            </view>
          </view>
        </view>

        <view class="team-section">
          <view class="section-header" @click="goToTeam">
            <text class="section-title">👥 交易员团队</text>
            <view class="section-stats">
              <text class="stat-count">{{ aiStore.accounts.length }}人</text>
              <text class="stat-arrow arrow-slide">→</text>
            </view>
          </view>
          <view class="team-grid" v-if="aiStore.accounts.length > 0">
            <view
              class="team-card card-scale"
              v-for="(account, index) in aiStore.accounts.slice(0, 4)"
              :key="account.id"
              :style="{ animationDelay: (index * 0.1) + 's' }"
              @click="goToTraderDetail(account.id)"
            >
              <view class="card-bg bg-pulse"></view>
              <view class="trader-avatar avatar-float">
                <text class="avatar-emoji">{{ getTraderEmoji(account.id) }}</text>
              </view>
              <view class="trader-info">
                <text class="trader-name">{{ account.name }}</text>
                <text class="trader-status" :class="getTraderStatusClass(account)">
                  {{ getTraderStatus(account) }}
                </text>
              </view>
              <view class="trader-performance">
                <text class="performance-label">收益</text>
                <text class="performance-value" :class="account.totalProfit >= 0 ? 'text-rise' : 'text-fall'">
                  {{ formatChange(account.totalProfit) }}
                </text>
              </view>
            </view>
          </view>
          <view class="empty-team" v-else>
            <text class="empty-emoji icon-bounce">🤖</text>
            <text class="empty-text">还没有交易员</text>
            <button class="hire-btn btn-shimmer" @click="goToHireTrader">
              <text class="btn-icon">➕</text>
              <text class="btn-text">招聘交易员</text>
            </button>
          </view>
        </view>

        <view class="achievements-section">
          <view class="section-header" @click="goToAchievements">
            <text class="section-title">🏆 成就系统</text>
            <view class="section-stats">
              <text class="stat-count">{{ unlockedAchievements }}/{{ totalAchievements }}</text>
              <text class="stat-arrow arrow-slide">→</text>
            </view>
          </view>
          <view class="achievements-grid">
            <view
              class="achievement-card card-tilt"
              v-for="achievement in recentAchievements"
              :key="achievement.id"
              :class="{ 'unlocked': achievement.unlocked }"
            >
              <view class="achievement-icon">
                <text class="icon-emoji" :class="{ 'icon-glow': achievement.unlocked }">{{ achievement.icon }}</text>
                <view class="lock-overlay" v-if="!achievement.unlocked">
                  <text class="lock-icon">🔒</text>
                </view>
              </view>
              <text class="achievement-name">{{ achievement.name }}</text>
              <view class="achievement-progress" v-if="!achievement.unlocked">
                <view class="progress-bar-mini">
                  <view class="progress-fill-mini progress-shimmer" :style="{ width: achievement.progress + '%' }"></view>
                </view>
                <text class="progress-text-mini">{{ achievement.progress }}%</text>
              </view>
            </view>
          </view>
        </view>

        <view class="quick-actions">
          <view class="action-card action-hover" @click="goToMarket">
            <view class="action-icon market icon-float">
              <text class="icon-emoji">📈</text>
            </view>
            <text class="action-label">市场行情</text>
            <text class="action-desc">查看实时行情</text>
          </view>
          <view class="action-card action-hover" @click="goToRanking">
            <view class="action-icon ranking icon-float">
              <text class="icon-emoji">🏆</text>
            </view>
            <text class="action-label">竞赛排行</text>
            <text class="action-desc">查看排名</text>
          </view>
          <view class="action-card action-hover" @click="goToTrades">
            <view class="action-icon trades icon-float">
              <text class="icon-emoji">📋</text>
            </view>
            <text class="action-label">交易记录</text>
            <text class="action-desc">历史交易</text>
          </view>
          <view class="action-card action-hover" @click="goToSettings">
            <view class="action-icon settings icon-float">
              <text class="icon-emoji">⚙️</text>
            </view>
            <text class="action-label">设置</text>
            <text class="action-desc">个人设置</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTradingStore } from '@/stores/trading'
import { useAIStore } from '@/stores/ai'
import { formatMoney, formatPercent, formatChange } from '@/utils/formatter'

const authStore = useAuthStore()
const tradingStore = useTradingStore()
const aiStore = useAIStore()
const loading = ref(false)

const userAvatar = ref('👤')
const userName = ref('投资总监')
const userLevel = ref(1)
const notificationCount = ref(3)
const remainingDays = ref(15)

const totalAssets = computed(() => tradingStore.totalAssets)
const cashBalance = computed(() => tradingStore.cashBalance)
const holdingsValue = computed(() => tradingStore.holdingsValue)
const totalProfit = computed(() => tradingStore.totalProfit)
const profitRate = computed(() => tradingStore.profitRate)

const missionProgress = computed(() => {
  const target = 0.1
  const current = profitRate.value
  return Math.min(Math.max((current / target) * 100, 0), 100)
})

const missionStatus = computed(() => {
  const progress = missionProgress.value
  if (progress >= 100) return '已完成'
  if (progress >= 80) return '即将完成'
  if (progress >= 50) return '进行中'
  return '刚开始'
})

const missionStatusClass = computed(() => {
  const progress = missionProgress.value
  if (progress >= 100) return 'completed'
  if (progress >= 80) return 'near-complete'
  if (progress >= 50) return 'in-progress'
  return 'started'
})

const traderEmojis = ['🤖', '👨‍💼', '👩‍💼', '🧑‍💻', '👨‍🔬', '👩‍🔬', '🧑‍🎓', '👨‍🏫']

function getTraderEmoji(id: string): string {
  const index = parseInt(id) % traderEmojis.length
  return traderEmojis[index]
}

function getTraderStatus(account: any): string {
  if (account.profitRate >= 10) return '表现优异'
  if (account.profitRate >= 5) return '表现良好'
  if (account.profitRate >= 0) return '表现一般'
  return '需要调整'
}

function getTraderStatusClass(account: any): string {
  if (account.profitRate >= 10) return 'excellent'
  if (account.profitRate >= 5) return 'good'
  if (account.profitRate >= 0) return 'normal'
  return 'poor'
}

const achievements = ref([
  { id: 1, name: '初出茅庐', icon: '🌱', unlocked: true, progress: 100 },
  { id: 2, name: '第一桶金', icon: '💰', unlocked: true, progress: 100 },
  { id: 3, name: '稳定盈利', icon: '📈', unlocked: false, progress: 65 },
  { id: 4, name: '交易达人', icon: '🎯', unlocked: false, progress: 40 },
  { id: 5, name: '投资大师', icon: '👑', unlocked: false, progress: 20 },
  { id: 6, name: '传奇人物', icon: '🏆', unlocked: false, progress: 5 },
])

const recentAchievements = computed(() => achievements.value.slice(0, 6))

const unlockedAchievements = computed(() => achievements.value.filter(a => a.unlocked).length)
const totalAchievements = computed(() => achievements.value.length)

async function refreshData() {
  if (loading.value) return
  loading.value = true
  try {
    await Promise.all([
      tradingStore.refreshAll(),
      aiStore.fetchAccounts(),
    ])
    uni.showToast({ title: '数据已刷新', icon: 'success' })
  } catch (error) {
    console.error('刷新数据失败:', error)
  } finally {
    loading.value = false
  }
}

function showNotifications() {
  uni.showToast({ title: '暂无新通知', icon: 'none' })
}

function goToTeam() {
  uni.switchTab({ url: '/pages/ai-managers/list' })
}

function goToTraderDetail(id: string) {
  uni.navigateTo({ url: `/pages/ai-managers/detail?id=${id}` })
}

function goToHireTrader() {
  if (!authStore.requireAuth('/pages/ai-managers/create')) return
  uni.navigateTo({ url: '/pages/ai-managers/create' })
}

function goToAchievements() {
  uni.showToast({ title: '成就系统开发中', icon: 'none' })
}

function goToMarket() {
  uni.switchTab({ url: '/pages/market/quotes' })
}

function goToRanking() {
  uni.navigateTo({ url: '/pages/competition/ranking' })
}

function goToTrades() {
  uni.navigateTo({ url: '/pages/trades/list' })
}

function goToSettings() {
  uni.switchTab({ url: '/pages/settings/profile' })
}

onMounted(() => {
  refreshData()
})
</script>

<style lang="scss" scoped>
@import "@/styles/variables.scss";

.immersive-dashboard {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  position: relative;
  overflow: hidden;

  .dashboard-bg {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: 
      radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.1) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
    animation: bg-pulse 8s ease-in-out infinite;
  }

  .dashboard-container {
    position: relative;
    z-index: 1;
    padding-bottom: 40rpx;
  }
}

@keyframes bg-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

.header-section {
  padding: 40rpx 32rpx 24rpx;

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .user-info {
      display: flex;
      align-items: center;
      gap: 24rpx;

      .user-avatar {
        width: 96rpx;
        height: 96rpx;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 48rpx;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;

        .avatar-emoji {
          font-size: 48rpx;
          position: relative;
          z-index: 2;
        }

        .avatar-ring {
          position: absolute;
          top: -4rpx;
          left: -4rpx;
          right: -4rpx;
          bottom: -4rpx;
          border: 2rpx solid rgba(102, 126, 234, 0.5);
          border-radius: 52rpx;
          animation: ring-pulse 2s ease-in-out infinite;
        }
      }

      .user-details {
        .welcome-text {
          display: block;
          font-size: 32rpx;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 8rpx;
        }

        .user-level {
          display: block;
          font-size: 24rpx;
          color: rgba(255, 255, 255, 0.7);
        }
      }
    }

    .header-actions {
      .notification-btn {
        width: 80rpx;
        height: 80rpx;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 40rpx;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;

        .notification-icon {
          font-size: 36rpx;
        }

        .notification-badge {
          position: absolute;
          top: -8rpx;
          right: -8rpx;
          min-width: 32rpx;
          height: 32rpx;
          background: #ff4d4f;
          border-radius: 16rpx;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 8rpx;

          .badge-count {
            font-size: 20rpx;
            font-weight: 600;
            color: #ffffff;
          }
        }
      }
    }
  }
}

@keyframes ring-pulse {
  0%, 100% {
    opacity: 0.5;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

.main-content {
  padding: 0 24rpx;
}

.treasury-card {
  position: relative;
  margin-bottom: 32rpx;
  border-radius: 24rpx;
  overflow: hidden;

  .treasury-bg {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  .treasury-content {
    position: relative;
    padding: 40rpx 32rpx;
    color: #ffffff;

    .treasury-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32rpx;

      .treasury-title {
        font-size: 32rpx;
        font-weight: 600;
      }

      .refresh-btn {
        width: 64rpx;
        height: 64rpx;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 32rpx;
        display: flex;
        align-items: center;
        justify-content: center;

        .refresh-icon {
          font-size: 28rpx;
          transition: transform 0.3s ease;

          &.rotating {
            animation: rotate 1s linear infinite;
          }
        }
      }
    }

    .treasury-amount {
      display: flex;
      align-items: baseline;
      margin-bottom: 40rpx;

      .amount-value {
        font-size: 72rpx;
        font-weight: bold;
        line-height: 1;
      }

      .amount-unit {
        font-size: 28rpx;
        margin-left: 12rpx;
        opacity: 0.8;
      }
    }

    .treasury-stats {
      display: flex;
      gap: 24rpx;

      .stat-item {
        flex: 1;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 16rpx;
        padding: 24rpx;
        display: flex;
        align-items: center;
        gap: 16rpx;
        transition: all 0.3s ease;

        &:active {
          transform: scale(0.95);
        }

        .stat-icon {
          font-size: 40rpx;
        }

        .stat-info {
          flex: 1;

          .stat-label {
            display: block;
            font-size: 22rpx;
            opacity: 0.8;
            margin-bottom: 4rpx;
          }

          .stat-value {
            display: block;
            font-size: 28rpx;
            font-weight: 600;
          }
        }
      }
    }
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.mission-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20rpx);
  border-radius: 24rpx;
  padding: 32rpx;
  margin-bottom: 32rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.1);

  .mission-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .mission-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #ffffff;
    }

    .mission-status {
      padding: 8rpx 20rpx;
      border-radius: 20rpx;
      font-size: 24rpx;
      font-weight: 500;

      &.completed {
        background: rgba(82, 196, 26, 0.2);
        color: #52c41a;
      }

      &.near-complete {
        background: rgba(250, 173, 20, 0.2);
        color: #faad14;
      }

      &.in-progress {
        background: rgba(24, 144, 255, 0.2);
        color: #1890ff;
      }

      &.started {
        background: rgba(140, 140, 140, 0.2);
        color: #8c8c8c;
      }
    }
  }

  .mission-progress {
    display: flex;
    align-items: center;
    gap: 16rpx;
    margin-bottom: 24rpx;

    .progress-bar {
      flex: 1;
      height: 12rpx;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 6rpx;
      overflow: hidden;

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        border-radius: 6rpx;
        transition: width 0.5s ease;
      }
    }

    .progress-text {
      font-size: 24rpx;
      color: rgba(255, 255, 255, 0.8);
      min-width: 80rpx;
      text-align: right;
    }
  }

  .mission-details {
    display: flex;
    justify-content: space-between;
    margin-bottom: 24rpx;

    .detail-row {
      text-align: center;

      .detail-label {
        display: block;
        font-size: 22rpx;
        color: rgba(255, 255, 255, 0.6);
        margin-bottom: 8rpx;
      }

      .detail-value {
        display: block;
        font-size: 28rpx;
        font-weight: 600;
        color: #ffffff;
      }
    }
  }

  .mission-reward {
    padding-top: 24rpx;
    border-top: 1rpx solid rgba(255, 255, 255, 0.1);

    .reward-label {
      display: block;
      font-size: 24rpx;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 16rpx;
    }

    .reward-items {
      display: flex;
      gap: 16rpx;

      .reward-item {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8rpx;
        padding: 20rpx;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 16rpx;
        transition: all 0.3s ease;

        &:active {
          transform: scale(0.95);
        }

        .reward-icon {
          font-size: 36rpx;
        }

        .reward-name {
          font-size: 22rpx;
          color: rgba(255, 255, 255, 0.8);
        }
      }
    }
  }
}

.team-section {
  margin-bottom: 32rpx;

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .section-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #ffffff;
    }

    .section-stats {
      display: flex;
      align-items: center;
      gap: 12rpx;

      .stat-count {
        font-size: 24rpx;
        color: rgba(255, 255, 255, 0.7);
      }

      .stat-arrow {
        font-size: 28rpx;
        color: rgba(255, 255, 255, 0.5);
      }
    }
  }

  .team-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16rpx;

    .team-card {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10rpx);
      border-radius: 20rpx;
      padding: 24rpx;
      position: relative;
      overflow: hidden;
      border: 1rpx solid rgba(255, 255, 255, 0.1);
      transition: all 0.3s ease;

      &:active {
        transform: scale(0.98);
      }

      .card-bg {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(circle at 50% 50%, rgba(102, 126, 234, 0.1) 0%, transparent 70%);
        pointer-events: none;
      }

      .trader-avatar {
        width: 64rpx;
        height: 64rpx;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 32rpx;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16rpx;

        .avatar-emoji {
          font-size: 32rpx;
        }
      }

      .trader-info {
        margin-bottom: 12rpx;

        .trader-name {
          display: block;
          font-size: 26rpx;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 4rpx;
        }

        .trader-status {
          display: block;
          font-size: 20rpx;
          color: rgba(255, 255, 255, 0.6);

          &.excellent {
            color: #52c41a;
          }

          &.good {
            color: #1890ff;
          }

          &.normal {
            color: #faad14;
          }

          &.poor {
            color: #ff4d4f;
          }
        }
      }

      .trader-performance {
        .performance-label {
          display: block;
          font-size: 20rpx;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 4rpx;
        }

        .performance-value {
          display: block;
          font-size: 24rpx;
          font-weight: 600;

          &.text-rise {
            color: #ff4d4f;
          }

          &.text-fall {
            color: #52c41a;
          }
        }
      }
    }
  }

  .empty-team {
    text-align: center;
    padding: 60rpx 40rpx;

    .empty-emoji {
      font-size: 80rpx;
      display: block;
      margin-bottom: 16rpx;
    }

    .empty-text {
      display: block;
      font-size: 26rpx;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 32rpx;
    }

    .hire-btn {
      width: 100%;
      height: 88rpx;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 44rpx;
      color: #ffffff;
      font-size: 28rpx;
      font-weight: 500;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12rpx;

      .btn-icon {
        font-size: 32rpx;
      }
    }
  }
}

.achievements-section {
  margin-bottom: 32rpx;

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .section-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #ffffff;
    }

    .section-stats {
      display: flex;
      align-items: center;
      gap: 12rpx;

      .stat-count {
        font-size: 24rpx;
        color: rgba(255, 255, 255, 0.7);
      }

      .stat-arrow {
        font-size: 28rpx;
        color: rgba(255, 255, 255, 0.5);
      }
    }
  }

  .achievements-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16rpx;

    .achievement-card {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10rpx);
      border-radius: 20rpx;
      padding: 24rpx 16rpx;
      text-align: center;
      border: 1rpx solid rgba(255, 255, 255, 0.1);
      transition: all 0.3s ease;

      &:active {
        transform: scale(0.95);
      }

      &.unlocked {
        background: rgba(102, 126, 234, 0.1);
        border-color: rgba(102, 126, 234, 0.3);
      }

      .achievement-icon {
        position: relative;
        width: 80rpx;
        height: 80rpx;
        margin: 0 auto 12rpx;

        .icon-emoji {
          font-size: 48rpx;
          display: block;
        }

        .lock-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          border-radius: 40rpx;
          display: flex;
          align-items: center;
          justify-content: center;

          .lock-icon {
            font-size: 32rpx;
          }
        }
      }

      .achievement-name {
        display: block;
        font-size: 22rpx;
        color: rgba(255, 255, 255, 0.8);
        margin-bottom: 12rpx;
      }

      .achievement-progress {
        .progress-bar-mini {
          height: 6rpx;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3rpx;
          overflow: hidden;
          margin-bottom: 6rpx;

          .progress-fill-mini {
            height: 100%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            border-radius: 3rpx;
            transition: width 0.5s ease;
          }
        }

        .progress-text-mini {
          font-size: 18rpx;
          color: rgba(255, 255, 255, 0.6);
        }
      }
    }
  }
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16rpx;

  .action-card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10rpx);
    border-radius: 20rpx;
    padding: 24rpx;
    text-align: center;
    border: 1rpx solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;

    &:active {
      transform: scale(0.95);
    }

    .action-icon {
      width: 80rpx;
      height: 80rpx;
      border-radius: 40rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 12rpx;

      .icon-emoji {
        font-size: 40rpx;
      }

      &.market {
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
      }

      &.ranking {
        background: linear-gradient(135deg, #ffd93d 0%, #f0c419 100%);
      }

      &.trades {
        background: linear-gradient(135deg, #6bcb77 0%, #4caf50 100%);
      }

      &.settings {
        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
      }
    }

    .action-label {
      display: block;
      font-size: 26rpx;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 4rpx;
    }

    .action-desc {
      display: block;
      font-size: 20rpx;
      color: rgba(255, 255, 255, 0.6);
    }
  }
}

.text-rise {
  color: #ff4d4f;
}

.text-fall {
  color: #52c41a;
}

.avatar-glow {
  box-shadow: 0 0 20rpx rgba(102, 126, 234, 0.5);
}

.badge-pulse {
  animation: pulse 1.5s ease-in-out infinite;
}

.text-glow {
  text-shadow: 0 0 20rpx rgba(255, 255, 255, 0.3);
}

.card-float {
  animation: float 6s ease-in-out infinite;
}

.bg-shimmer {
  animation: shimmer 3s ease-in-out infinite;
}

.icon-bounce {
  animation: bounce 2s ease-in-out infinite;
}

.stat-hover {
  transition: all 0.3s ease;

  &:active {
    transform: scale(0.95);
    background: rgba(255, 255, 255, 0.15);
  }
}

.status-pulse {
  animation: status-pulse 2s ease-in-out infinite;
}

.progress-shimmer {
  background: linear-gradient(90deg, #667eea 0%, #764ba2 50%, #667eea 100%);
  background-size: 200% 100%;
  animation: shimmer-move 2s linear infinite;
}

.detail-fade {
  animation: fade-in 0.5s ease-out;
  animation-fill-mode: both;

  &:nth-child(1) {
    animation-delay: 0s;
  }

  &:nth-child(2) {
    animation-delay: 0.1s;
  }

  &:nth-child(3) {
    animation-delay: 0.2s;
  }
}

.reward-hover {
  transition: all 0.3s ease;

  &:active {
    transform: scale(0.95);
    background: rgba(255, 255, 255, 0.1);
  }
}

.icon-spin {
  animation: spin 3s linear infinite;
}

.card-slide {
  animation: slide-up 0.6s ease-out;
}

.arrow-slide {
  transition: transform 0.3s ease;

  .section-header:active & {
    transform: translateX(8rpx);
  }
}

.bg-pulse {
  animation: bg-pulse-slow 4s ease-in-out infinite;
}

.card-scale {
  animation: scale-in 0.5s ease-out;
  animation-fill-mode: both;
}

.avatar-float {
  animation: avatar-float 3s ease-in-out infinite;
}

.card-tilt {
  transition: all 0.3s ease;

  &:active {
    transform: scale(0.95) rotate(2deg);
  }
}

.icon-glow {
  filter: drop-shadow(0 0 8rpx rgba(255, 215, 0, 0.5));
}

.icon-float {
  animation: icon-float 4s ease-in-out infinite;
}

.action-hover {
  transition: all 0.3s ease;

  &:active {
    transform: translateY(-4rpx);
    box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.2);
  }
}

.btn-shimmer {
  background: linear-gradient(90deg, #667eea 0%, #764ba2 50%, #667eea 100%);
  background-size: 200% 100%;
  animation: shimmer-move 2s linear infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8rpx);
  }
}

@keyframes shimmer {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4rpx);
  }
}

@keyframes status-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

@keyframes shimmer-move {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(20rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes bg-pulse-slow {
  0%, 100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.8;
  }
}

@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes avatar-float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6rpx);
  }
}

@keyframes icon-float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5rpx);
  }
}
</style>
