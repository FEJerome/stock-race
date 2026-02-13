:root {
  --primary-color: #1890FF;
  --danger-color: #FF4D4F;
  --success-color: #52C41A;
  --text-primary: #333;
  --text-secondary: #666;
  --text-muted: #999;
  --bg-primary: #fff;
  --bg-secondary: #f5f5f5;
  --border-color: #e8e8e8;
}

<template>
  <view class="ranking-page">
    <!-- 顶部标签切换 -->
    <view class="period-tabs">
      <view
        v-for="tab in periodTabs"
        :key="tab.value"
        class="tab-item"
        :class="{ active: currentPeriod === tab.value }"
        @tap="switchPeriod(tab.value)"
      >
        <text class="tab-text">{{ tab.label }}</text>
      </view>
    </view>

    <!-- 排行榜统计 -->
    <view class="stats-bar" v-if="rankingStats">
      <view class="stats-item">
        <text class="stats-value">{{ formatNumber(rankingStats.totalAccounts) }}</text>
        <text class="stats-label">参赛账户</text>
      </view>
      <view class="stats-item">
        <text class="stats-value">{{ formatNumber(rankingStats.totalParticipants) }}</text>
        <text class="stats-label">参赛人数</text>
      </view>
      <view class="stats-item">
        <text class="stats-value" :class="{ 'up': rankingStats.avgReturnRate >= 0 }">
          {{ formatRate(rankingStats.avgReturnRate) }}
        </text>
        <text class="stats-label">平均收益</text>
      </view>
    </view>

    <!-- 排行榜列表 -->
    <scroll-view
      class="ranking-list"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="isRefreshing"
      @refresherrefresh="onRefresh"
      @scrolltolower="onLoadMore"
    >
      <!-- 前三名特殊展示 -->
      <view class="top-three" v-if="topThree.length > 0">
        <view
          v-for="(item, index) in topThree"
          :key="item.id"
          class="top-item"
          :class="`rank-${index + 1}`"
          @tap="viewDetail(item)"
        >
          <view class="rank-badge">
            <text class="rank-text">{{ index + 1 }}</text>
          </view>
          <image class="avatar" :src="item.avatar || '/static/avatars/default.png'" mode="aspectFill" />
          <text class="name">{{ item.name }}</text>
          <text class="return-rate" :class="{ 'up': item.returnRate >= 0 }">
            {{ formatRate(item.returnRate) }}
          </text>
        </view>
      </view>

      <!-- 普通排名列表 -->
      <view class="ranking-items">
        <view
          v-for="(item, index) in normalList"
          :key="item.id"
          class="ranking-item"
          @tap="viewDetail(item)"
        >
          <text class="rank-number">{{ item.rank }}</text>
          <image class="avatar" :src="item.avatar || '/static/avatars/default.png'" mode="aspectFill" />
          <view class="info">
            <text class="name">{{ item.name }}</text>
            <text class="subtitle">{{ item.aiCount }}个AI经理 · {{ item.tradeCount }}笔交易</text>
          </view>
          <view class="return">
            <text class="return-rate" :class="{ 'up': item.returnRate >= 0 }">
              {{ formatRate(item.returnRate) }}
            </text>
            <text class="return-amount" :class="{ 'up': item.returnAmount >= 0 }">
              {{ formatAmount(item.returnAmount) }}
            </text>
          </view>
        </view>
      </view>

      <!-- 加载状态 -->
      <view class="load-more" v-if="loading">
        <text class="load-text">加载中...</text>
      </view>
      <view class="load-more" v-else-if="!hasMore">
        <text class="load-text">已经到底了</text>
      </view>

      <!-- 空状态 -->
      <view class="empty-state" v-if="!loading && rankingList.length === 0">
        <image class="empty-icon" src="/static/icons/empty.png" mode="aspectFit" />
        <text class="empty-text">暂无排行数据</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getRanking, getRankingStats } from '@/api/public'
import type { RankingItem, RankingPeriod } from '@/types/public'

// ==================== 常量 ====================

const periodTabs = [
  { label: '日榜', value: 'daily' as RankingPeriod },
  { label: '周榜', value: 'weekly' as RankingPeriod },
  { label: '月榜', value: 'monthly' as RankingPeriod },
]

const PAGE_SIZE = 20

// ==================== 状态 ====================

const currentPeriod = ref<RankingPeriod>('daily')
const rankingList = ref<RankingItem[]>([])
const rankingStats = ref<{
  totalAccounts: number
  totalParticipants: number
  avgReturnRate: number
  topReturnRate: number
} | null>(null)

const loading = ref(false)
const isRefreshing = ref(false)
const page = ref(1)
const hasMore = ref(true)

// ==================== 计算属性 ====================

const topThree = computed(() => rankingList.value.slice(0, 3))
const normalList = computed(() => rankingList.value.slice(3))

// ==================== 方法 ====================

// 格式化数字
function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万'
  }
  return num.toString()
}

// 格式化收益率
function formatRate(rate: number): string {
  const sign = rate >= 0 ? '+' : ''
  return `${sign}${rate.toFixed(2)}%`
}

// 格式化金额
function formatAmount(amount: number): string {
  if (amount >= 10000) {
    return (amount / 10000).toFixed(2) + '万'
  }
  return amount.toFixed(2)
}

// 切换周期
async function switchPeriod(period: RankingPeriod) {
  if (currentPeriod.value === period || loading.value) return
  currentPeriod.value = period
  page.value = 1
  hasMore.value = true
  rankingList.value = []
  await fetchRanking()
}

// 获取排行榜数据
async function fetchRanking() {
  if (loading.value) return

  loading.value = true
  try {
    const response = await getRanking(currentPeriod.value, page.value, PAGE_SIZE)

    if (page.value === 1) {
      rankingList.value = response.list
    } else {
      rankingList.value.push(...response.list)
    }

    hasMore.value = response.list.length === PAGE_SIZE
  } catch (error) {
    console.error('获取排行榜失败:', error)
    uni.showToast({
      title: '获取数据失败',
      icon: 'none',
    })
  } finally {
    loading.value = false
    isRefreshing.value = false
  }
}

// 获取排行榜统计
async function fetchRankingStats() {
  try {
    rankingStats.value = await getRankingStats()
  } catch (error) {
    console.error('获取排行榜统计失败:', error)
  }
}

// 下拉刷新
async function onRefresh() {
  isRefreshing.value = true
  page.value = 1
  hasMore.value = true
  await Promise.all([fetchRanking(), fetchRankingStats()])
}

// 加载更多
async function onLoadMore() {
  if (!hasMore.value || loading.value) return
  page.value++
  await fetchRanking()
}

// 查看详情
function viewDetail(item: RankingItem) {
  uni.navigateTo({
    url: `/pages/ai-managers/detail?id=${item.id}&readonly=true`,
  })
}

// ==================== 生命周期 ====================

onMounted(() => {
  fetchRanking()
  fetchRankingStats()
})
</script>

<style scoped>
.ranking-page {
  min-height: 100vh;
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
}

/* 标签切换 */
.period-tabs {
  display: flex;
  background: var(--bg-primary);
  padding: 20rpx 30rpx;
  border-bottom: 1rpx solid var(--border-color);
}

.tab-item {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20rpx 0;
  position: relative;
}

.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 30%;
  right: 30%;
  height: 4rpx;
  background: var(--primary-color);
  border-radius: 2rpx;
}

.tab-text {
  font-size: 30rpx;
  color: var(--text-secondary);
}

.tab-item.active .tab-text {
  color: var(--primary-color);
  font-weight: 600;
}

/* 统计栏 */
.stats-bar {
  display: flex;
  background: var(--bg-primary);
  padding: 30rpx;
  margin-bottom: 20rpx;
}

.stats-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stats-value {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--text-primary);
}

.stats-value.up {
  color: var(--danger-color);
}

.stats-label {
  font-size: 24rpx;
  color: var(--text-muted);
  margin-top: 8rpx;
}

/* 排行榜列表 */
.ranking-list {
  flex: 1;
}

/* 前三名 */
.top-three {
  display: flex;
  justify-content: space-around;
  padding: 40rpx 30rpx;
  background: linear-gradient(180deg, #fff 0%, var(--bg-secondary) 100%);
}

.top-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.rank-badge {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16rpx;
}

.rank-1 .rank-badge {
  background: linear-gradient(135deg, #FFD700, #FFA500);
}

.rank-2 .rank-badge {
  background: linear-gradient(135deg, #C0C0C0, #A0A0A0);
}

.rank-3 .rank-badge {
  background: linear-gradient(135deg, #CD7F32, #B87333);
}

.rank-text {
  font-size: 28rpx;
  font-weight: 700;
  color: #fff;
}

.top-item .avatar {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  margin-bottom: 12rpx;
  border: 4rpx solid #fff;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
}

.top-item .name {
  font-size: 28rpx;
  color: var(--text-primary);
  margin-bottom: 8rpx;
}

.top-item .return-rate {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--success-color);
}

.top-item .return-rate.up {
  color: var(--danger-color);
}

/* 普通列表 */
.ranking-items {
  background: var(--bg-primary);
}

.ranking-item {
  display: flex;
  align-items: center;
  padding: 24rpx 30rpx;
  border-bottom: 1rpx solid var(--border-color);
}

.rank-number {
  width: 60rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: var(--text-muted);
  text-align: center;
}

.ranking-item .avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  margin-right: 20rpx;
}

.info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.info .name {
  font-size: 30rpx;
  color: var(--text-primary);
  margin-bottom: 8rpx;
}

.info .subtitle {
  font-size: 24rpx;
  color: var(--text-muted);
}

.return {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.return-rate {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--success-color);
}

.return-rate.up {
  color: var(--danger-color);
}

.return-amount {
  font-size: 24rpx;
  color: var(--text-muted);
  margin-top: 4rpx;
}

.return-amount.up {
  color: var(--danger-color);
}

/* 加载状态 */
.load-more {
  padding: 30rpx;
  text-align: center;
}

.load-text {
  font-size: 26rpx;
  color: var(--text-muted);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 100rpx 30rpx;
}

.empty-icon {
  width: 200rpx;
  height: 200rpx;
  margin-bottom: 30rpx;
}

.empty-text {
  font-size: 28rpx;
  color: var(--text-muted);
}
</style>