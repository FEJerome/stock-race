<template>
  <view class="trader-team-page">
    <view class="header-section">
      <view class="header-bg"></view>
      <view class="header-content">
        <text class="page-title">我的交易员团队</text>
        <text class="page-subtitle">管理您的AI交易员，实现投资目标</text>
      </view>
    </view>

    <view class="stats-section">
      <view class="stats-grid">
        <view class="stat-card">
          <text class="stat-icon">👥</text>
          <text class="stat-value">{{ aiStore.accounts.length }}</text>
          <text class="stat-label">交易员</text>
        </view>
        <view class="stat-card">
          <text class="stat-icon" :class="aiStore.totalProfit >= 0 ? 'profit-rise' : 'profit-fall'">
            {{ aiStore.totalProfit >= 0 ? '📈' : '📉' }}
          </text>
          <text class="stat-value" :class="aiStore.totalProfit >= 0 ? 'text-rise' : 'text-fall'">
            {{ formatChange(aiStore.totalProfit) }}
          </text>
          <text class="stat-label">总收益</text>
        </view>
        <view class="stat-card">
          <text class="stat-icon">💰</text>
          <text class="stat-value">{{ formatMoney(aiStore.totalBalance) }}</text>
          <text class="stat-label">管理元宝</text>
        </view>
      </view>
    </view>

    <view class="team-section">
      <view class="section-header">
        <text class="section-title">交易员列表</text>
        <view class="filter-tabs">
          <text
            class="filter-tab"
            :class="{ active: filter === 'all' }"
            @click="filter = 'all'"
          >
            全部
          </text>
          <text
            class="filter-tab"
            :class="{ active: filter === 'working' }"
            @click="filter = 'working'"
          >
            工作中
          </text>
          <text
            class="filter-tab"
            :class="{ active: filter === 'paused' }"
            @click="filter = 'paused'"
          >
            休息中
          </text>
        </view>
      </view>

      <view class="trader-list">
        <view
          class="trader-card"
          v-for="(account, index) in filteredAccounts"
          :key="account.id"
          :style="{ animationDelay: (index * 0.1) + 's' }"
          @click="goToDetail(account.id)"
        >
          <view class="card-header">
            <view class="trader-info">
              <view class="avatar-wrapper">
                <text class="avatar-emoji">{{ getAvatarEmoji(account) }}</text>
                <view class="status-badge" :class="account.status">
                  <text class="status-icon">{{ getStatusIcon(account.status) }}</text>
                </view>
              </view>
              <view class="trader-details">
                <text class="trader-name">{{ account.name }}</text>
                <view class="trader-tags">
                  <text class="tag school">{{ getUniversity(account.modelProvider) }}</text>
                  <text class="tag personality">{{ getPersonalityName(account.riskLevel) }}</text>
                </view>
              </view>
            </view>
            <view class="trader-profit">
              <text class="profit-rate" :class="account.profitRate >= 0 ? 'text-rise' : 'text-fall'">
                {{ formatPercent(account.profitRate / 100) }}
              </text>
              <text class="profit-amount" :class="account.totalProfit >= 0 ? 'text-rise' : 'text-fall'">
                {{ formatChange(account.totalProfit) }}
              </text>
            </view>
          </view>

          <view class="card-body">
            <view class="info-row">
              <text class="label">启动元宝</text>
              <text class="value">{{ formatMoney(account.initialBalance) }}</text>
            </view>
            <view class="info-row">
              <text class="label">当前元宝</text>
              <text class="value highlight">{{ formatMoney(account.currentBalance) }}</text>
            </view>
            <view class="info-row">
              <text class="label">今日工作</text>
              <view class="work-progress">
                <view class="progress-bar">
                  <view
                    class="progress-fill"
                    :style="{ width: (account.todayDecisions / account.maxDailyDecisions * 100) + '%' }"
                  ></view>
                </view>
                <text class="progress-text">{{ account.todayDecisions }}/{{ account.maxDailyDecisions }}</text>
              </view>
            </view>
          </view>

          <view class="card-footer">
            <button class="action-btn primary" @click.stop="triggerDecision(account.id)">
              <text class="btn-icon">⚡</text>
              <text class="btn-text">立即决策</text>
            </button>
            <button class="action-btn encourage" @click.stop="encourageTrader(account)">
              <text class="btn-icon">💪</text>
              <text class="btn-text">加油</text>
            </button>
            <button class="action-btn" @click.stop="goToDetail(account.id)">
              <text class="btn-text">查看档案</text>
            </button>
          </view>
        </view>

        <view class="empty-state" v-if="filteredAccounts.length === 0 && !aiStore.loading">
          <text class="empty-icon">👷</text>
          <text class="empty-text">还没有交易员</text>
          <text class="empty-desc">招聘第一位交易员，开启智能投资之旅</text>
          <button class="empty-btn" @click="goToCreate">
            <text class="btn-icon">➕</text>
            <text class="btn-text">立即招聘</text>
          </button>
        </view>
      </view>
    </view>

    <view class="fab-btn" @click="goToCreate">
      <text class="fab-icon">+</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import { formatMoney, formatPercent, formatChange } from '@/utils/formatter'
import { MODEL_PROVIDERS, RISK_LEVELS } from '@/utils/constants'

const aiStore = useAIStore()
const filter = ref<'all' | 'working' | 'paused'>('all')

const avatars = ['👨‍💼', '👨‍💻', '👨‍🎓', '👨‍🔬', '👨‍🚀', '👨‍⚖️']

const filteredAccounts = computed(() => {
  if (filter.value === 'all') {
    return aiStore.accounts
  } else if (filter.value === 'working') {
    return aiStore.accounts.filter(a => a.status === 'active')
  } else {
    return aiStore.accounts.filter(a => a.status !== 'active')
  }
})

function getAvatarEmoji(account: any): string {
  const index = aiStore.accounts.indexOf(account)
  return avatars[index % avatars.length]
}

function getStatusIcon(status: string): string {
  const icons = {
    active: '⚡',
    paused: '💤',
    stopped: '🛑',
  }
  return icons[status as keyof typeof icons] || '❓'
}

function getUniversity(provider: string): string {
  return MODEL_PROVIDERS.find(p => p.value === provider)?.university || provider
}

function getPersonalityName(risk: string): string {
  const personalities = {
    conservative: '保守稳健',
    moderate: '稳健进取',
    aggressive: '激进成长',
  }
  return personalities[risk as keyof typeof personalities] || risk
}

function goToDetail(id: string) {
  uni.navigateTo({ url: `/pages/ai-managers/detail?id=${id}` })
}

function goToCreate() {
  uni.navigateTo({ url: '/pages/ai-managers/create' })
}

async function triggerDecision(accountId: string) {
  uni.showLoading({ title: '正在决策...', mask: true })
  const decision = await aiStore.triggerDecision(accountId)
  uni.hideLoading()
  
  if (decision) {
    uni.showToast({ 
      title: '决策完成！', 
      icon: 'success',
      duration: 2000,
    })
    aiStore.fetchAccounts(true)
  }
}

function encourageTrader(account: any) {
  uni.showToast({ 
    title: `${account.name} 收到您的鼓励！`, 
    icon: 'none',
    duration: 2000,
  })
}

onMounted(() => {
  aiStore.fetchAccounts()
})
</script>

<style lang="scss" scoped>
.trader-team-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0f4ff 0%, #ffffff 100%);
  padding-bottom: 160rpx;
}

.header-section {
  position: relative;
  padding: 60rpx 32rpx 40rpx;
  overflow: hidden;

  .header-bg {
    position: absolute;
    top: -200rpx;
    left: -200rpx;
    right: -200rpx;
    height: 400rpx;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    filter: blur(60rpx);
    opacity: 0.3;
  }

  .header-content {
    position: relative;
    z-index: 1;

    .page-title {
      display: block;
      font-size: 48rpx;
      font-weight: bold;
      color: #1a1a2e;
      margin-bottom: 12rpx;
    }

    .page-subtitle {
      display: block;
      font-size: 28rpx;
      color: #666680;
    }
  }
}

.stats-section {
  padding: 0 32rpx 32rpx;

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20rpx;

    .stat-card {
      background: #ffffff;
      border-radius: 20rpx;
      padding: 28rpx 20rpx;
      text-align: center;
      box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.08);
      transition: all 0.3s ease;

      &:active {
        transform: translateY(-4rpx);
        box-shadow: 0 8rpx 28rpx rgba(0, 0, 0, 0.12);
      }

      .stat-icon {
        display: block;
        font-size: 56rpx;
        margin-bottom: 12rpx;

        &.profit-rise {
          animation: bounce 0.6s ease;
        }

        &.profit-fall {
          animation: shake 0.6s ease;
        }
      }

      .stat-value {
        display: block;
        font-size: 40rpx;
        font-weight: bold;
        color: #1a1a2e;
        margin-bottom: 8rpx;

        &.text-rise {
          color: #00c853;
        }

        &.text-fall {
          color: #ff4757;
        }
      }

      .stat-label {
        display: block;
        font-size: 24rpx;
        color: #8c8c9c;
      }
    }
  }
}

.team-section {
  padding: 0 32rpx;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;

  .section-title {
    font-size: 32rpx;
    font-weight: 600;
    color: #1a1a2e;
  }

  .filter-tabs {
    display: flex;
    gap: 8rpx;

    .filter-tab {
      padding: 12rpx 24rpx;
      background: #f8f9fa;
      border-radius: 20rpx;
      font-size: 26rpx;
      color: #8c8c9c;
      transition: all 0.3s ease;

      &.active {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #ffffff;
        box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.3);
      }
    }
  }
}

.trader-list {
  .trader-card {
    background: #ffffff;
    border-radius: 24rpx;
    margin-bottom: 24rpx;
    box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.08);
    overflow: hidden;
    animation: slideInUp 0.5s ease;
    animation-fill-mode: both;
    transition: all 0.3s ease;

    &:active {
      transform: scale(0.98);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 28rpx;
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.02) 0%, rgba(118, 75, 162, 0.02) 100%);
      border-bottom: 1rpx solid #f0f0f0;

      .trader-info {
        display: flex;
        gap: 20rpx;
        flex: 1;

        .avatar-wrapper {
          position: relative;
          flex-shrink: 0;

          .avatar-emoji {
            font-size: 80rpx;
            display: block;
          }

          .status-badge {
            position: absolute;
            top: -8rpx;
            right: -8rpx;
            width: 44rpx;
            height: 44rpx;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.2);

            &.active {
              background: #00c853;
              animation: pulse 2s infinite;
            }

            &.paused {
              background: #ff9800;
            }

            &.stopped {
              background: #8c8c9c;
            }

            .status-icon {
              font-size: 24rpx;
            }
          }
        }

        .trader-details {
          flex: 1;

          .trader-name {
            display: block;
            font-size: 32rpx;
            font-weight: 600;
            color: #1a1a2e;
            margin-bottom: 12rpx;
          }

          .trader-tags {
            display: flex;
            gap: 8rpx;
            flex-wrap: wrap;

            .tag {
              padding: 6rpx 12rpx;
              border-radius: 8rpx;
              font-size: 22rpx;
              font-weight: 500;

              &.school {
                background: rgba(102, 126, 234, 0.1);
                color: #667eea;
              }

              &.personality {
                background: rgba(118, 75, 162, 0.1);
                color: #764ba2;
              }
            }
          }
        }
      }

      .trader-profit {
        text-align: right;

        .profit-rate {
          display: block;
          font-size: 36rpx;
          font-weight: bold;
          margin-bottom: 8rpx;

          &.text-rise {
            color: #00c853;
          }

          &.text-fall {
            color: #ff4757;
          }
        }

        .profit-amount {
          display: block;
          font-size: 28rpx;
          font-weight: 500;

          &.text-rise {
            color: #00c853;
          }

          &.text-fall {
            color: #ff4757;
          }
        }
      }
    }

    .card-body {
      padding: 24rpx 28rpx;

      .info-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16rpx;

        &:last-child {
          margin-bottom: 0;
        }

        .label {
          font-size: 26rpx;
          color: #8c8c9c;
        }

        .value {
          font-size: 28rpx;
          font-weight: 500;
          color: #1a1a2e;

          &.highlight {
            color: #667eea;
            font-weight: bold;
            font-size: 30rpx;
          }
        }

        .work-progress {
          display: flex;
          align-items: center;
          gap: 12rpx;

          .progress-bar {
            width: 120rpx;
            height: 12rpx;
            background: #e0e0e0;
            border-radius: 6rpx;
            overflow: hidden;

            .progress-fill {
              height: 100%;
              background: linear-gradient(90deg, #667eea, #764ba2);
              border-radius: 6rpx;
              transition: width 0.5s ease;
            }
          }

          .progress-text {
            font-size: 24rpx;
            color: #666680;
            font-weight: 500;
          }
        }
      }
    }

    .card-footer {
      display: flex;
      gap: 12rpx;
      padding: 20rpx 28rpx;
      background: #f8f9fa;
      border-top: 1rpx solid #f0f0f0;

      .action-btn {
        flex: 1;
        height: 72rpx;
        border-radius: 16rpx;
        font-size: 26rpx;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8rpx;
        border: none;
        transition: all 0.3s ease;

        &.primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #ffffff;
          box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.3);

          &:active {
            transform: scale(0.96);
            box-shadow: 0 2rpx 8rpx rgba(102, 126, 234, 0.2);
          }
        }

        &.encourage {
          background: #ff9800;
          color: #ffffff;

          &:active {
            transform: scale(0.96);
          }
        }

        &:not(.primary):not(.encourage) {
          background: #ffffff;
          color: #667eea;
          border: 2rpx solid #667eea;

          &:active {
            background: rgba(102, 126, 234, 0.05);
          }
        }

        .btn-icon {
          font-size: 28rpx;
        }

        .btn-text {
          font-size: 26rpx;
        }
      }
    }
  }
}

.empty-state {
  text-align: center;
  padding: 120rpx 40rpx;

  .empty-icon {
    font-size: 120rpx;
    display: block;
    margin-bottom: 24rpx;
    opacity: 0.5;
  }

  .empty-text {
    display: block;
    font-size: 32rpx;
    font-weight: 600;
    color: #1a1a2e;
    margin-bottom: 12rpx;
  }

  .empty-desc {
    display: block;
    font-size: 26rpx;
    color: #8c8c9c;
    margin-bottom: 40rpx;
    line-height: 1.6;
  }

  .empty-btn {
    height: 88rpx;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 44rpx;
    color: #ffffff;
    font-size: 30rpx;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12rpx;
    border: none;
    box-shadow: 0 8rpx 24rpx rgba(102, 126, 234, 0.4);

    .btn-icon {
      font-size: 32rpx;
    }

    .btn-text {
      font-size: 30rpx;
    }
  }
}

.fab-btn {
  position: fixed;
  right: 32rpx;
  bottom: 32rpx;
  width: 112rpx;
  height: 112rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(102, 126, 234, 0.4);
  z-index: 100;
  transition: all 0.3s ease;

  &:active {
    transform: scale(0.9);
    box-shadow: 0 4rpx 16rpx rgba(102, 126, 234, 0.3);
  }

  .fab-icon {
    font-size: 56rpx;
    color: #ffffff;
    font-weight: 300;
  }
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(40rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.1);
  }
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10rpx);
  }
}

@keyframes shake {
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-8rpx);
  }
  75% {
    transform: translateX(8rpx);
  }
}
</style>
