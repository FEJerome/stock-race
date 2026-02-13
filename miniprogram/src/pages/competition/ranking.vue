<template>
  <view class="ranking-arena">
    <view class="arena-bg"></view>
    
    <view class="arena-container">
      <view class="arena-header">
        <text class="arena-title">🏆 荣耀殿堂</text>
        <view class="my-rank">
          <text class="rank-label">我的排名</text>
          <text class="rank-value">#{{ myRank }}</text>
        </view>
      </view>

      <view class="podium-section" v-if="topThree.length > 0">
        <view class="podium">
          <view class="podium-item second">
            <view class="medal silver">🥈</view>
            <view class="avatar-wrapper">
              <image class="avatar" :src="topThree[1]?.avatar || '/static/default-avatar.png'" mode="aspectFill" />
              <view class="avatar-border silver"></view>
            </view>
            <text class="trader-name">{{ topThree[1]?.name }}</text>
            <text class="trader-score">{{ formatRate(topThree[1]?.returnRate) }}</text>
            <view class="podium-base silver"></view>
          </view>
          <view class="podium-item first">
            <view class="crown">👑</view>
            <view class="medal gold">🥇</view>
            <view class="avatar-wrapper">
              <image class="avatar" :src="topThree[0]?.avatar || '/static/default-avatar.png'" mode="aspectFill" />
              <view class="avatar-border gold"></view>
            </view>
            <text class="trader-name">{{ topThree[0]?.name }}</text>
            <text class="trader-score">{{ formatRate(topThree[0]?.returnRate) }}</text>
            <view class="podium-base gold"></view>
          </view>
          <view class="podium-item third">
            <view class="medal bronze">🥉</view>
            <view class="avatar-wrapper">
              <image class="avatar" :src="topThree[2]?.avatar || '/static/default-avatar.png'" mode="aspectFill" />
              <view class="avatar-border bronze"></view>
            </view>
            <text class="trader-name">{{ topThree[2]?.name }}</text>
            <text class="trader-score">{{ formatRate(topThree[2]?.returnRate) }}</text>
            <view class="podium-base bronze"></view>
          </view>
        </view>
      </view>

      <view class="period-tabs">
        <view
          v-for="tab in periodTabs"
          :key="tab.value"
          class="tab-item"
          :class="{ active: currentPeriod === tab.value }"
          @tap="switchPeriod(tab.value)"
        >
          <text class="tab-icon">{{ tab.icon }}</text>
          <text class="tab-text">{{ tab.label }}</text>
        </view>
      </view>

      <view class="stats-bar">
        <view class="stats-item">
          <text class="stats-icon">👥</text>
          <text class="stats-value">{{ formatNumber(totalAccounts) }}</text>
          <text class="stats-label">参赛账户</text>
        </view>
        <view class="stats-item">
          <text class="stats-icon">📊</text>
          <text class="stats-value" :class="{ 'up': avgReturnRate >= 0, 'down': avgReturnRate < 0 }">
            {{ formatRate(avgReturnRate) }}
          </text>
          <text class="stats-label">平均收益</text>
        </view>
        <view class="stats-item">
          <text class="stats-icon">🔥</text>
          <text class="stats-value">{{ formatNumber(totalTrades) }}</text>
          <text class="stats-label">总交易数</text>
        </view>
      </view>

      <scroll-view
        class="ranking-list"
        scroll-y
        :refresher-enabled="true"
        :refresher-triggered="isRefreshing"
        @refresherrefresh="onRefresh"
        @scrolltolower="onLoadMore"
      >
        <view
          v-for="(item, index) in rankingList"
          :key="item.id"
          class="ranking-item"
          :class="{ 
            'top-three': index < 3,
            'my-rank': item.isMe
          }"
          @tap="viewTraderDetail(item)"
        >
          <view class="rank-badge" :class="getRankClass(index)">
            <text class="rank-number">{{ index + 1 }}</text>
          </view>
          <view class="trader-info">
            <view class="avatar-section">
              <image class="avatar" :src="item.avatar || '/static/default-avatar.png'" mode="aspectFill" />
              <view class="level-badge" :class="'level-' + item.level">
                <text class="level-text">Lv.{{ item.level }}</text>
              </view>
            </view>
            <view class="info-section">
              <text class="trader-name">{{ item.name }}</text>
              <view class="trader-tags">
                <text class="tag" v-if="item.badge">{{ item.badge }}</text>
                <text class="tag win-rate" v-if="item.winRate">胜率 {{ item.winRate }}%</text>
              </view>
            </view>
          </view>
          <view class="trader-stats">
            <view class="stat-row">
              <text class="stat-label">收益率</text>
              <text class="stat-value" :class="item.returnRate >= 0 ? 'text-up' : 'text-down'">
                {{ formatRate(item.returnRate) }}
              </text>
            </view>
            <view class="stat-row">
              <text class="stat-label">总资产</text>
              <text class="stat-value">{{ formatMoney(item.totalAssets) }}</text>
            </view>
          </view>
          <view class="trend-indicator" :class="item.trend">
            <text class="trend-icon">{{ getTrendIcon(item.trend) }}</text>
          </view>
        </view>

        <view class="load-more" v-if="loading">
          <text class="load-text">加载中...</text>
        </view>
        <view class="load-more" v-else-if="!hasMore && rankingList.length > 0">
          <text class="load-text">已经到底了</text>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const currentPeriod = ref('week')
const isRefreshing = ref(false)
const loading = ref(false)
const hasMore = ref(true)
const myRank = ref(42)

const periodTabs = [
  { value: 'day', label: '日榜', icon: '📅' },
  { value: 'week', label: '周榜', icon: '📆' },
  { value: 'month', label: '月榜', icon: '🗓️' },
  { value: 'all', label: '总榜', icon: '🏆' },
]

const totalAccounts = ref(12580)
const avgReturnRate = ref(12.5)
const totalTrades = ref(45890)

const topThree = ref([
  {
    id: 1,
    name: '交易大师',
    avatar: '/static/default-avatar.png',
    returnRate: 156.8,
    level: 45,
  },
  {
    id: 2,
    name: '股市猎手',
    avatar: '/static/default-avatar.png',
    returnRate: 134.2,
    level: 42,
  },
  {
    id: 3,
    name: '价值投资者',
    avatar: '/static/default-avatar.png',
    returnRate: 128.5,
    level: 40,
  },
])

const rankingList = ref([
  {
    id: 4,
    name: '稳健增长',
    avatar: '/static/default-avatar.png',
    returnRate: 98.5,
    totalAssets: 1580000,
    level: 38,
    badge: '🎯 精准射手',
    winRate: 68,
    trend: 'up',
    isMe: false,
  },
  {
    id: 5,
    name: '短线高手',
    avatar: '/static/default-avatar.png',
    returnRate: 87.3,
    totalAssets: 1240000,
    level: 35,
    badge: '⚡ 闪电侠',
    winRate: 72,
    trend: 'up',
    isMe: false,
  },
  {
    id: 6,
    name: '趋势追踪者',
    avatar: '/static/default-avatar.png',
    returnRate: 76.8,
    totalAssets: 980000,
    level: 33,
    winRate: 65,
    trend: 'stable',
    isMe: false,
  },
  {
    id: 7,
    name: '波段交易员',
    avatar: '/static/default-avatar.png',
    returnRate: 65.4,
    totalAssets: 850000,
    level: 31,
    winRate: 62,
    trend: 'down',
    isMe: false,
  },
  {
    id: 8,
    name: '我',
    avatar: '/static/default-avatar.png',
    returnRate: 45.2,
    totalAssets: 520000,
    level: 25,
    badge: '🌟 新星',
    winRate: 58,
    trend: 'up',
    isMe: true,
  },
])

function getRankClass(index: number): string {
  if (index === 0) return 'gold'
  if (index === 1) return 'silver'
  if (index === 2) return 'bronze'
  return 'normal'
}

function getTrendIcon(trend: string): string {
  if (trend === 'up') return '📈'
  if (trend === 'down') return '📉'
  return '➡️'
}

function formatNumber(num: number): string {
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  return num.toString()
}

function formatRate(rate: number): string {
  return (rate >= 0 ? '+' : '') + rate.toFixed(2) + '%'
}

function formatMoney(amount: number): string {
  if (amount >= 100000000) return (amount / 100000000).toFixed(2) + '亿'
  if (amount >= 10000) return (amount / 10000).toFixed(2) + '万'
  return amount.toFixed(0)
}

function switchPeriod(period: string) {
  currentPeriod.value = period
}

function onRefresh() {
  isRefreshing.value = true
  setTimeout(() => {
    isRefreshing.value = false
  }, 1000)
}

function onLoadMore() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  setTimeout(() => {
    loading.value = false
    hasMore.value = false
  }, 1000)
}

function viewTraderDetail(item: any) {
  uni.navigateTo({
    url: `/pages/competition/detail?id=${item.id}`,
  })
}

onMounted(() => {
  console.log('荣耀殿堂已加载')
})
</script>

<style lang="scss" scoped>
.ranking-arena {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  position: relative;
  overflow: hidden;

  .arena-bg {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: 
      radial-gradient(circle at 50% 20%, rgba(255, 215, 0, 0.08) 0%, transparent 40%),
      radial-gradient(circle at 20% 60%, rgba(192, 192, 192, 0.05) 0%, transparent 40%),
      radial-gradient(circle at 80% 60%, rgba(205, 127, 50, 0.05) 0%, transparent 40%);
    pointer-events: none;
    z-index: 0;
  }

  .arena-container {
    position: relative;
    z-index: 1;
    padding: 24rpx;
  }
}

.arena-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32rpx;

  .arena-title {
    font-size: 40rpx;
    font-weight: bold;
    color: #ffffff;
  }

  .my-rank {
    display: flex;
    align-items: center;
    gap: 12rpx;
    padding: 12rpx 24rpx;
    background: rgba(255, 215, 0, 0.15);
    border-radius: 24rpx;
    border: 1rpx solid rgba(255, 215, 0, 0.3);

    .rank-label {
      font-size: 24rpx;
      color: rgba(255, 215, 0, 0.8);
    }

    .rank-value {
      font-size: 28rpx;
      font-weight: bold;
      color: #ffd700;
    }
  }
}

.podium-section {
  margin-bottom: 32rpx;

  .podium {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: 16rpx;
    padding: 40rpx 0;

    .podium-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;

      &.first {
        z-index: 3;
        margin: 0 8rpx;

        .crown {
          position: absolute;
          top: -40rpx;
          font-size: 48rpx;
          animation: float 2s ease-in-out infinite;
        }

        .medal {
          font-size: 56rpx;
          margin-bottom: 8rpx;
        }

        .avatar-wrapper {
          width: 120rpx;
          height: 120rpx;
          margin-bottom: 12rpx;
        }

        .trader-name {
          font-size: 28rpx;
          font-weight: bold;
          color: #ffd700;
          margin-bottom: 4rpx;
        }

        .trader-score {
          font-size: 32rpx;
          font-weight: bold;
          color: #ffffff;
          margin-bottom: 16rpx;
        }

        .podium-base {
          width: 140rpx;
          height: 120rpx;
          background: linear-gradient(180deg, rgba(255, 215, 0, 0.4) 0%, rgba(255, 215, 0, 0.1) 100%);
          border-radius: 12rpx 12rpx 0 0;
          border: 2rpx solid rgba(255, 215, 0, 0.5);
        }
      }

      &.second {
        z-index: 2;

        .medal {
          font-size: 48rpx;
          margin-bottom: 8rpx;
        }

        .avatar-wrapper {
          width: 100rpx;
          height: 100rpx;
          margin-bottom: 12rpx;
        }

        .trader-name {
          font-size: 24rpx;
          font-weight: bold;
          color: #c0c0c0;
          margin-bottom: 4rpx;
        }

        .trader-score {
          font-size: 28rpx;
          font-weight: bold;
          color: #ffffff;
          margin-bottom: 16rpx;
        }

        .podium-base {
          width: 120rpx;
          height: 90rpx;
          background: linear-gradient(180deg, rgba(192, 192, 192, 0.4) 0%, rgba(192, 192, 192, 0.1) 100%);
          border-radius: 12rpx 12rpx 0 0;
          border: 2rpx solid rgba(192, 192, 192, 0.5);
        }
      }

      &.third {
        z-index: 1;

        .medal {
          font-size: 48rpx;
          margin-bottom: 8rpx;
        }

        .avatar-wrapper {
          width: 100rpx;
          height: 100rpx;
          margin-bottom: 12rpx;
        }

        .trader-name {
          font-size: 24rpx;
          font-weight: bold;
          color: #cd7f32;
          margin-bottom: 4rpx;
        }

        .trader-score {
          font-size: 28rpx;
          font-weight: bold;
          color: #ffffff;
          margin-bottom: 16rpx;
        }

        .podium-base {
          width: 120rpx;
          height: 70rpx;
          background: linear-gradient(180deg, rgba(205, 127, 50, 0.4) 0%, rgba(205, 127, 50, 0.1) 100%);
          border-radius: 12rpx 12rpx 0 0;
          border: 2rpx solid rgba(205, 127, 50, 0.5);
        }
      }

      .avatar-wrapper {
        position: relative;
        border-radius: 50%;
        overflow: hidden;

        .avatar {
          width: 100%;
          height: 100%;
          border-radius: 50%;
        }

        .avatar-border {
          position: absolute;
          top: -4rpx;
          left: -4rpx;
          right: -4rpx;
          bottom: -4rpx;
          border-radius: 50%;
          border: 3rpx solid;

          &.gold {
            border-color: #ffd700;
          }

          &.silver {
            border-color: #c0c0c0;
          }

          &.bronze {
            border-color: #cd7f32;
          }
        }
      }
    }
  }
}

.period-tabs {
  display: flex;
  gap: 12rpx;
  margin-bottom: 24rpx;
  padding: 8rpx;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20rpx);
  border-radius: 20rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.1);

  .tab-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
    padding: 16rpx 12rpx;
    border-radius: 16rpx;
    transition: all 0.3s ease;

    &.active {
      background: rgba(102, 126, 234, 0.2);
      border: 1rpx solid rgba(102, 126, 234, 0.4);
    }

    .tab-icon {
      font-size: 28rpx;
    }

    .tab-text {
      font-size: 22rpx;
      color: rgba(255, 255, 255, 0.8);
    }
  }
}

.stats-bar {
  display: flex;
  gap: 12rpx;
  margin-bottom: 24rpx;

  .stats-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
    padding: 20rpx 12rpx;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20rpx);
    border-radius: 16rpx;
    border: 1rpx solid rgba(255, 255, 255, 0.1);

    .stats-icon {
      font-size: 32rpx;
    }

    .stats-value {
      font-size: 28rpx;
      font-weight: bold;
      color: #ffffff;

      &.up {
        color: #ff4d4f;
      }

      &.down {
        color: #52c41a;
      }
    }

    .stats-label {
      font-size: 20rpx;
      color: rgba(255, 255, 255, 0.5);
    }
  }
}

.ranking-list {
  height: calc(100vh - 750rpx);
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
  padding: 20rpx;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20rpx);
  border-radius: 20rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;

  &.top-three {
    background: rgba(255, 215, 0, 0.08);
    border-color: rgba(255, 215, 0, 0.2);
  }

  &.my-rank {
    background: rgba(102, 126, 234, 0.15);
    border-color: rgba(102, 126, 234, 0.4);
  }

  .rank-badge {
    width: 56rpx;
    height: 56rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12rpx;
    font-size: 24rpx;
    font-weight: bold;
    flex-shrink: 0;

    &.gold {
      background: linear-gradient(135deg, #ffd700 0%, #ffec8b 100%);
      color: #1a1a2e;
    }

    &.silver {
      background: linear-gradient(135deg, #c0c0c0 0%, #e8e8e8 100%);
      color: #1a1a2e;
    }

    &.bronze {
      background: linear-gradient(135deg, #cd7f32 0%, #daa520 100%);
      color: #1a1a2e;
    }

    &.normal {
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.6);
    }
  }

  .trader-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 16rpx;

    .avatar-section {
      position: relative;
      flex-shrink: 0;

      .avatar {
        width: 80rpx;
        height: 80rpx;
        border-radius: 50%;
      }

      .level-badge {
        position: absolute;
        bottom: -4rpx;
        right: -4rpx;
        padding: 4rpx 8rpx;
        border-radius: 12rpx;
        font-size: 16rpx;
        font-weight: bold;
        color: #ffffff;

        &.level-1, &.level-2, &.level-3 {
          background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);
        }

        &.level-4, &.level-5, &.level-6 {
          background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
        }

        &.level-7, &.level-8, &.level-9 {
          background: linear-gradient(135deg, #722ed1 0%, #9254de 100%);
        }

        &.level-10 {
          background: linear-gradient(135deg, #fa8c16 0%, #ffa940 100%);
        }
      }
    }

    .info-section {
      flex: 1;
      min-width: 0;

      .trader-name {
        display: block;
        font-size: 28rpx;
        font-weight: 600;
        color: #ffffff;
        margin-bottom: 8rpx;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .trader-tags {
        display: flex;
        gap: 8rpx;
        flex-wrap: wrap;

        .tag {
          padding: 4rpx 12rpx;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 12rpx;
          font-size: 20rpx;
          color: rgba(255, 255, 255, 0.7);

          &.win-rate {
            background: rgba(82, 196, 26, 0.2);
            color: #52c41a;
          }
        }
      }
    }
  }

  .trader-stats {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
    margin-right: 12rpx;

    .stat-row {
      text-align: right;

      .stat-label {
        display: block;
        font-size: 18rpx;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 2rpx;
      }

      .stat-value {
        display: block;
        font-size: 24rpx;
        font-weight: 600;
        color: #ffffff;

        &.text-up {
          color: #ff4d4f;
        }

        &.text-down {
          color: #52c41a;
        }
      }
    }
  }

  .trend-indicator {
    width: 48rpx;
    height: 48rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    flex-shrink: 0;

    &.up {
      background: rgba(82, 196, 26, 0.2);
    }

    &.down {
      background: rgba(255, 77, 79, 0.2);
    }

    &.stable {
      background: rgba(140, 140, 140, 0.2);
    }

    .trend-icon {
      font-size: 24rpx;
    }
  }
}

.load-more {
  text-align: center;
  padding: 32rpx 0;

  .load-text {
    font-size: 24rpx;
    color: rgba(255, 255, 255, 0.5);
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
</style>
