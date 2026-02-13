<template>
  <view class="market-page">
    <!-- 搜索栏 -->
    <view class="search-bar">
      <view class="search-input-wrapper">
        <text class="search-icon">🔍</text>
        <input
          class="search-input"
          type="text"
          v-model="searchKeyword"
          placeholder="搜索股票代码/名称"
          confirm-type="search"
          @confirm="onSearch"
        />
        <text class="clear-icon" v-if="searchKeyword" @tap="clearSearch">×</text>
      </view>
    </view>

    <!-- 市场指数 -->
    <view class="market-indices" v-if="marketIndices.length > 0">
      <view
        v-for="index in marketIndices"
        :key="index.code"
        class="index-item"
      >
        <text class="index-name">{{ index.name }}</text>
        <text class="index-value">{{ index.current.toFixed(2) }}</text>
        <text class="index-change" :class="{ 'up': index.change >= 0, 'down': index.change < 0 }">
          {{ index.change >= 0 ? '+' : '' }}{{ index.change.toFixed(2) }} ({{ index.changePercent >= 0 ? '+' : '' }}{{ index.changePercent.toFixed(2) }}%)
        </text>
      </view>
    </view>

    <!-- 行情列表 -->
    <scroll-view
      class="quotes-list"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="isRefreshing"
      @refresherrefresh="onRefresh"
      @scrolltolower="onLoadMore"
    >
      <!-- 表头 -->
      <view class="list-header">
        <text class="header-cell name" @tap="sortBy('name')">股票名称</text>
        <text class="header-cell price" @tap="sortBy('price')">最新价</text>
        <text class="header-cell change" @tap="sortBy('changePercent')">涨跌幅</text>
      </view>

      <!-- 股票列表 -->
      <view class="stock-items">
        <view
          v-for="stock in stockList"
          :key="stock.code"
          class="stock-item"
          @tap="viewStockDetail(stock)"
        >
          <view class="stock-info">
            <text class="stock-name">{{ stock.name }}</text>
            <text class="stock-code">{{ stock.code }}</text>
          </view>
          <text class="stock-price" :class="{ 'up': stock.change >= 0, 'down': stock.change < 0 }">
            {{ stock.price.toFixed(2) }}
          </text>
          <view class="stock-change" :class="{ 'up': stock.change >= 0, 'down': stock.change < 0 }">
            <text class="change-percent">{{ stock.change >= 0 ? '+' : '' }}{{ stock.changePercent.toFixed(2) }}%</text>
            <text class="change-amount">{{ stock.change >= 0 ? '+' : '' }}{{ stock.change.toFixed(2) }}</text>
          </view>
        </view>
      </view>

      <!-- 加载状态 -->
      <view class="load-more" v-if="loading">
        <text class="load-text">加载中...</text>
      </view>
      <view class="load-more" v-else-if="!hasMore && stockList.length > 0">
        <text class="load-text">已经到底了</text>
      </view>

      <!-- 空状态 -->
      <view class="empty-state" v-if="!loading && stockList.length === 0">
        <image class="empty-icon" src="/static/icons/empty.png" mode="aspectFit" />
        <text class="empty-text">{{ searchKeyword ? '未找到相关股票' : '暂无行情数据' }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getStockQuotes, searchStocks, getMarketIndices } from '@/api/public'
import type { StockQuote, MarketIndex } from '@/types/public'

// ==================== 常量 ====================
const PAGE_SIZE = 20

// ==================== 状态 ====================
const searchKeyword = ref('')
const stockList = ref<StockQuote[]>([])
const marketIndices = ref<MarketIndex[]>([])
const loading = ref(false)
const isRefreshing = ref(false)
const page = ref(1)
const hasMore = ref(true)

// 排序状态
const sortField = ref<'price' | 'change' | 'changePercent' | undefined>(undefined)
const sortOrder = ref<'asc' | 'desc'>('desc')

// ==================== 方法 ====================

// 获取行情列表
async function fetchQuotes() {
  if (loading.value) return

  loading.value = true
  try {
    const response = await getStockQuotes(
      page.value,
      PAGE_SIZE,
      sortField.value,
      sortOrder.value
    )

    if (page.value === 1) {
      stockList.value = response.list
    } else {
      stockList.value.push(...response.list)
    }

    hasMore.value = response.list.length === PAGE_SIZE
  } catch (error) {
    console.error('获取行情失败:', error)
    uni.showToast({
      title: '获取数据失败',
      icon: 'none',
    })
  } finally {
    loading.value = false
    isRefreshing.value = false
  }
}

// 获取市场指数
async function fetchMarketIndices() {
  try {
    marketIndices.value = await getMarketIndices()
  } catch (error) {
    console.error('获取市场指数失败:', error)
  }
}

// 搜索股票
async function onSearch() {
  if (!searchKeyword.value.trim()) {
    page.value = 1
    hasMore.value = true
    await fetchQuotes()
    return
  }

  loading.value = true
  try {
    const results = await searchStocks(searchKeyword.value, 50)
    // 将搜索结果转换为StockQuote格式
    stockList.value = results.map(item => ({
      code: item.code,
      name: item.name,
      price: 0,
      change: 0,
      changePercent: 0,
      volume: 0,
      turnover: 0,
      marketCap: 0,
      high: 0,
      low: 0,
      open: 0,
      preClose: 0,
      updateTime: new Date().toISOString(),
    }))
    hasMore.value = false
  } catch (error) {
    console.error('搜索失败:', error)
    uni.showToast({
      title: '搜索失败',
      icon: 'none',
    })
  } finally {
    loading.value = false
  }
}

// 清除搜索
async function clearSearch() {
  searchKeyword.value = ''
  page.value = 1
  hasMore.value = true
  await fetchQuotes()
}

// 排序
async function sortBy(field: 'name' | 'price' | 'changePercent') {
  if (field === 'name') return // 不支持按名称排序

  if (sortField.value === field) {
    // 切换排序方向
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field as 'price' | 'change' | 'changePercent'
    sortOrder.value = 'desc'
  }

  page.value = 1
  hasMore.value = true
  await fetchQuotes()
}

// 下拉刷新
async function onRefresh() {
  isRefreshing.value = true
  page.value = 1
  hasMore.value = true
  await Promise.all([fetchQuotes(), fetchMarketIndices()])
}

// 加载更多
async function onLoadMore() {
  if (!hasMore.value || loading.value || searchKeyword.value) return
  page.value++
  await fetchQuotes()
}

// 查看股票详情
function viewStockDetail(stock: StockQuote) {
  uni.navigateTo({
    url: `/pages/market/detail?code=${stock.code}`,
  })
}

// ==================== 生命周期 ====================
onMounted(() => {
  fetchQuotes()
  fetchMarketIndices()
})
</script>

<style scoped>
.market-page {
  min-height: 100vh;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
}

/* 搜索栏 */
.search-bar {
  background: #fff;
  padding: 20rpx 30rpx;
  border-bottom: 1rpx solid #e8e8e8;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  background: #f5f5f5;
  border-radius: 36rpx;
  padding: 16rpx 24rpx;
}

.search-icon {
  font-size: 28rpx;
  margin-right: 12rpx;
}

.search-input {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.clear-icon {
  font-size: 32rpx;
  color: #999;
  padding: 0 10rpx;
}

/* 市场指数 */
.market-indices {
  display: flex;
  background: #fff;
  padding: 24rpx 0;
  margin-bottom: 20rpx;
}

.index-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-right: 1rpx solid #e8e8e8;
}

.index-item:last-child {
  border-right: none;
}

.index-name {
  font-size: 24rpx;
  color: #666;
  margin-bottom: 8rpx;
}

.index-value {
  font-size: 32rpx;
  font-weight: 700;
  color: #333;
  margin-bottom: 4rpx;
}

.index-change {
  font-size: 22rpx;
}

.index-change.up {
  color: #FF4D4F;
}

.index-change.down {
  color: #52C41A;
}

/* 行情列表 */
.quotes-list {
  flex: 1;
  background: #fff;
}

/* 表头 */
.list-header {
  display: flex;
  padding: 20rpx 30rpx;
  background: #fafafa;
  border-bottom: 1rpx solid #e8e8e8;
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-cell {
  font-size: 26rpx;
  color: #666;
}

.header-cell.name {
  flex: 1;
}

.header-cell.price,
.header-cell.change {
  width: 180rpx;
  text-align: right;
}

/* 股票列表 */
.stock-items {
  background: #fff;
}

.stock-item {
  display: flex;
  align-items: center;
  padding: 24rpx 30rpx;
  border-bottom: 1rpx solid #e8e8e8;
}

.stock-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.stock-name {
  font-size: 30rpx;
  color: #333;
  margin-bottom: 4rpx;
}

.stock-code {
  font-size: 24rpx;
  color: #999;
}

.stock-price {
  width: 180rpx;
  font-size: 32rpx;
  font-weight: 600;
  text-align: right;
  color: #333;
}

.stock-price.up {
  color: #FF4D4F;
}

.stock-price.down {
  color: #52C41A;
}

.stock-change {
  width: 180rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.change-percent {
  font-size: 28rpx;
  font-weight: 600;
}

.change-amount {
  font-size: 22rpx;
  margin-top: 4rpx;
}

.stock-change.up .change-percent,
.stock-change.up .change-amount {
  color: #FF4D4F;
}

.stock-change.down .change-percent,
.stock-change.down .change-amount {
  color: #52C41A;
}

/* 加载状态 */
.load-more {
  padding: 30rpx;
  text-align: center;
}

.load-text {
  font-size: 26rpx;
  color: #999;
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
  color: #999;
}
</style>
