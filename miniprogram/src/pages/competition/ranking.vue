<template>
  <view class="ranking-page">
    <!-- 竞赛统计 -->
    <view class="competition-stats" v-if="marketStore.competitionStats">
      <view class="stats-header">
        <text class="stats-title">竞赛数据</text>
        <text class="stats-subtitle">实时更新</text>
      </view>
      <view class="stats-grid">
        <view class="stats-item">
          <text class="stats-value">{{ formatNumber(marketStore.competitionStats.totalUsers) }}</text>
          <text class="stats-label">参赛人数</text>
        </view>
        <view class="stats-item">
          <text class="stats-value">{{ formatNumber(marketStore.competitionStats.totalManagers) }}</text>
          <text class="stats-label">AI经理</text>
        </view>
        <view class="stats-item">
          <text class="stats-value" :class="marketStore.competitionStats.avgProfitRate >= 0 ? 'text-rise' : 'text-fall'">
            {{ formatPercent(marketStore.competitionStats.avgProfitRate / 100) }}
          </text>
          <text class="stats-label">平均收益</text>
        </view>
        <view class="stats-item">
          <text class="stats-value prize">{{ formatMoney(marketStore.competitionStats.prizePool) }}</text>
          <text class="stats-label">奖金池</text>
        </view>
      </view>
    </view>

    <!-- 我的排名 -->
    <view class="my-ranking-card" v-if="myRanking">
      <view class="ranking-header">
        <text class="ranking-title">我的排名</text>
        <view class="rank-change" :class="myRanking.rankChange > 0 ? 'up' : myRanking.rankChange < 0 ? 'down' : 'same'">
          <text class="change-icon">{{ myRanking.rankChange > 0 ? '↑' : myRanking.rankChange < 0 ? '↓' : '-' }}</text>
          <text class="change-value">{{ Math.abs(myRanking.rankChange) }}</text>
        </view>
      </view>
      <view class="ranking-body">
        <view class="rank-number">
          <text class="rank-value">{{ myRanking.rank }}</text>
          <text class="rank-total">/ {{ marketStore.competitionStats?.totalUsers || '--' }}</text>
        </view>
        <view class="rank-info">
          <text class="user-name">{{ myRanking.username }}</text>
          <text class="profit-rate" :class="myRanking.profitRate >= 0 ? 'text-rise' : 'text-fall'">
            {{ formatPercent(myRanking.profitRate / 100) }}
          </text>
        </view>
        <view class="rank-assets">
          <text class="assets-value">{{ formatMoney(myRanking.totalAssets) }}</text>
          <text class="assets-label">总资产</text>
        </view>
      </view>
    </view>

    <!-- 排行榜标签 -->
    <view class="ranking-tabs">
      <text
        class="tab-item"
        :class="{ active: activeTab === 'total' }"
        @click="switchTab('total')"
      >总收益榜</text>
      <text
        class="tab-item"
        :class="{ active: activeTab === 'daily' }"
        @click="switchTab('daily')"
      >日收益榜</text>
      <text
        class="tab-item"
        :class="{ active: activeTab === 'weekly' }"
        @click="switchTab('weekly')"
      >周收益榜</text>
    </view>

    <!-- 排行榜列表 -->
    <scroll-view
      class="ranking-list"
      scroll-y
      refresher-enabled
      :refresher-triggered="isRefreshing"
      @refresherrefresh="onRefresh"
      @scrolltolower="loadMore"
    >
      <!-- 列表表头 -->
      <view class="list-header">
        <text class="header-cell rank">排名</text>
        <text class="header-cell user">用户</text>
        <text class="header-cell profit">收益率</text>
        <text class="header-cell assets">总资产</text>
      </view>

      <!-- 排行榜项 -->
      <view
        class="ranking-item"
        v-for="(user, index) in rankingList"
        :key="user.userId"
        :class="{ 'top-three': user.rank <= 3, 'is-me': user.userId === currentUserId }"
        @click="viewUserDetail(user.userId)"
      >
        <view class="rank-cell">
          <view class="rank-badge" :class="'rank-' + user.rank" v-if="user.rank <= 3">
            <text class="rank-text">{{ user.rank }}</text>
          </view>
          <text class="rank-number" v-else>{{ user.rank }}</text>
        </view>
        <view class="user-cell">
          <image class="user-avatar" :src="user.avatar || '/static/default-avatar.png'" mode="aspectFill" />
          <text class="user-name">{{ user.username }}</text>
        </view>
        <view class="profit-cell" :class="user.profitRate >= 0 ? 'text-rise' : 'text-fall'">
          <text class="profit-rate">{{ formatPercent(user.profitRate / 100) }}</text>
        </view>
        <view class="assets-cell">
          <text class="assets-value">{{ formatMoney(user.totalAssets) }}</text>
        </view>
      </view>

      <!-- 加载更多 -->
      <view class="load-more" v-if="rankingList.length > 0">
        <text v-if="loading">加载中...</text>
        <text v-else-if="!hasMore">没有更多了</text>
        <text v-else>上拉加载更多</text>
      </view>

      <!-- 空状态 -->
      <view class="empty-state" v-if="rankingList.length === 0 && !loading">
        <text class="empty-text">暂无排行数据</text>
        <text class="empty-desc">竞赛即将开始，敬请期待</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMarketStore } from '@/stores/market'
import { useAuthStore } from '@/stores/auth'
import { formatMoney, formatPercent } from '@/utils/formatter'
import type { RankingUser } from '@/types/market'

const marketStore = useMarketStore()
const authStore = useAuthStore()

// 标签页
const activeTab = ref<'total' | 'daily' | 'weekly'>('total')

// 刷新和加载
const isRefreshing = ref(false)
const loading = ref(false)
const hasMore = ref(true)
const page = ref(1)
const pageSize = 20

// 当前用户ID
const currentUserId = computed(() => authStore.userInfo?.id || '')

// 我的排名
const myRanking = computed(() => {
  return marketStore.ranking.find(r => r.userId === currentUserId.value)
})

// 排行榜列表
const rankingList = computed(() => {
  return marketStore.ranking
})

// 格式化数字
function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万'
  }
  return num.toString()
}

// 切换标签
function switchTab(tab: 'total' | 'daily' | 'weekly') {
  activeTab.value = tab
  // 重置页码并重新加载
  page.value = 1
  hasMore.value = true
  fetchRanking()
}

// 获取排行榜
async function fetchRanking() {
  loading.value = true
  try {
    await marketStore.fetchRanking(page.value)
    // 如果返回数据少于pageSize，说明没有更多数据了
    if (marketStore.ranking.length < page.value * pageSize) {
      hasMore.value = false
    }
  } catch (error) {
    console.error('Fetch ranking error:', error)
  } finally {
    loading.value = false
  }
}

// 刷新
async function onRefresh() {
  isRefreshing.value = true
  page.value = 1
  hasMore.value = true
  await Promise.all([
    marketStore.fetchCompetitionStats(),
    marketStore.fetchRanking(1)
  ])
  isRefreshing.value = false
  uni.showToast({ title: '刷新成功', icon: 'success' })
}

// 加载更多
async function loadMore() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  page.value++
  await fetchRanking()
}

// 查看用户详情
function viewUserDetail(userId: string) {
  uni.navigateTo({ url: `/pages/competition/user-detail?id=${userId}` })
}

onMounted(() => {
  marketStore.fetchCompetitionStats()
  fetchRanking()
})
</script>

<style lang="scss" scoped>
.ranking-page {
  min-height: 100vh;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
}

// 竞赛统计
.competition-stats {
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  padding: 32rpx;
  margin-bottom: 16rpx;

  .stats-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .stats-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #ffffff;
    }

    .stats-subtitle {
      font-size: 24rpx;
      color: rgba(255, 255, 255, 0.7);
    }
  }

  .stats-grid {
    display: flex;
    flex-wrap: wrap;

    .stats-item {
      width: 50%;
      padding: 20rpx 0;

      .stats-value {
        display: block;
        font-size: 36rpx;
        font-weight: 600;
        color: #ffffff;
        margin-bottom: 8rpx;

        &.prize {
          color: #faad14;
        }
      }

      .stats-label {
        display: block;
        font-size: 24rpx;
        color: rgba(255, 255, 255, 0.8);
      }
    }
  }
}

// 我的排名
.my-ranking-card {
  background: #ffffff;
  margin: 0 24rpx 16rpx;
  border-radius: 16rpx;
  padding: 32rpx;

  .ranking-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;
    padding-bottom: 24rpx;
    border-bottom: 1rpx solid #f0f0f0;

    .ranking-title {
      font-size: 30rpx;
      font-weight: 600;
      color: #262626;
    }

    .rank-change {
      display: flex;
      align-items: center;
      padding: 8rpx 16rpx;
      border-radius: 8rpx;

      &.up {
        background: rgba(255, 77, 79, 0.1);
        color: #ff4d4f;
      }

      &.down {
        background: rgba(82, 196, 26, 0.1);
        color: #52c41a;
      }

      &.same {
        background: #f5f5f5;
        color: #8c8c8c;
      }

      .change-icon {
        font-size: 24rpx;
        margin-right: 4rpx;
      }

      .change-value {
        font-size: 24rpx;
        font-weight: 500;
      }
    }
  }

  .ranking-body {
    display: flex;
    align-items: center;

    .rank-number {
      width: 160rpx;

      .rank-value {
        font-size: 48rpx;
        font-weight: bold;
        color: #1890ff;
      }

      .rank-total {
        font-size: 24rpx;
        color: #8c8c8c;
      }
    }

    .rank-info {
      flex: 1;

      .user-name {
        display: block;
        font-size: 32rpx;
        font-weight: 600;
        color: #262626;
        margin-bottom: 8rpx;
      }

      .profit-rate {
        display: block;
        font-size: 36rpx;
        font-weight: bold;
      }
    }

    .rank-assets {
      text-align: right;

      .assets-value {
        display: block;
        font-size: 32rpx;
        font-weight: 600;
        color: #262626;
        margin-bottom: 8rpx;
      }

      .assets-label {
        display: block;
        font-size: 24rpx;
        color: #8c8c8c;
      }
    }
  }
}

// 排行榜标签
.ranking-tabs {
  display: flex;
  background: #ffffff;
  padding: 0 32rpx;
  border-bottom: 1rpx solid #f0f0f0;

  .tab-item {
    flex: 1;
    text-align: center;
    font-size: 28rpx;
    color: #595959;
    padding: 24rpx 0;
    position: relative;

    &.active {
      color: #1890ff;
      font-weight: 500;

      &::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 60rpx;
        height: 4rpx;
        background: #1890ff;
        border-radius: 2rpx;
      }
    }
  }
}

// 排行榜列表
.ranking-list {
  flex: 1;
  background: #ffffff;

  .list-header {
    display: flex;
    padding: 24rpx 32rpx;
    background: #fafafa;
    border-bottom: 1rpx solid #f0f0f0;

    .header-cell {
      font-size: 24rpx;
      color: #8c8c8c;

      &.rank {
        width: 100rpx;
        text-align: center;
      }

      &.user {
        flex: 1;
      }

      &.profit {
        width: 160rpx;
        text-align: right;
      }

      &.assets {
        width: 180rpx;
        text-align: right;
      }
    }
  }

  .ranking-item {
    display: flex;
    align-items: center;
    padding: 24rpx 32rpx;
    border-bottom: 1rpx solid #f5f5f5;

    &:active {
      background: #f5f5f5;
    }

    &.is-me {
      background: rgba(24, 144, 255, 0.05);
    }

    .rank-cell {
      width: 100rpx;
      text-align: center;

      .rank-badge {
        width: 48rpx;
        height: 48rpx;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto;

        &.rank-1 {
          background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
        }

        &.rank-2 {
          background: linear-gradient(135deg, #c0c0c0 0%, #e0e0e0 100%);
        }

        &.rank-3 {
          background: linear-gradient(135deg, #cd7f32 0%, #daa520 100%);
        }

        .rank-text {
          font-size: 28rpx;
          font-weight: bold;
          color: #ffffff;
        }
      }

      .rank-number {
        font-size: 28rpx;
        color: #595959;
      }
    }

    .user-cell {
      flex: 1;
      display: flex;
      align-items: center;

      .user-avatar {
        width: 64rpx;
        height: 64rpx;
        border-radius: 50%;
        margin-right: 16rpx;
        background: #f0f0f0;
      }

      .user-name {
        font-size: 28rpx;
        color: #262626;
      }
    }

    .profit-cell {
      width: 160rpx;
      text-align: right;

      .profit-rate {
        font-size: 28rpx;
        font-weight: 600;
      }
    }

    .assets-cell {
      width: 180rpx;
      text-align: right;

      .assets-value {
        font-size: 26rpx;
        color: #262626;
      }
    }
  }

  .load-more {
    text-align: center;
    padding: 32rpx;
    font-size: 24rpx;
    color: #8c8c8c;
  }

  .empty-state {
    text-align: center;
    padding: 120rpx 48rpx;

    .empty-text {
      display: block;
      font-size: 32rpx;
      color: #262626;
      margin-bottom: 16rpx;
    }

    .empty-desc {
      display: block;
      font-size: 26rpx;
      color: #8c8c8c;
    }
  }
}

.text-rise { color: #ff4d4f; }
.text-fall { color: #52c41a; }
</style>
