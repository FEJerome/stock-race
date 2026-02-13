<template>
  <view class="detail-page">
    <!-- 加载状态 -->
    <view class="loading-container" v-if="loading">
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 主要内容 -->
    <template v-else-if="account">
      <!-- 顶部账户信息卡片 -->
      <view class="account-card">
        <view class="card-header">
          <view class="account-info">
            <text class="account-name">{{ account.name }}</text>
            <view class="account-tags">
              <text class="tag school">{{ getUniversity(account.modelProvider) }}</text>
              <text class="tag risk" :class="account.riskLevel">{{ getRiskLabel(account.riskLevel) }}</text>
              <text class="tag status" :class="account.status">{{ getStatusLabel(account.status) }}</text>
            </view>
          </view>
          <view class="account-profit">
            <text class="profit-rate" :class="account.profitRate >= 0 ? 'text-rise' : 'text-fall'">
              {{ formatPercent(account.profitRate / 100) }}
            </text>
            <text class="profit-label">总收益率</text>
          </view>
        </view>

        <view class="card-stats">
          <view class="stat-item">
            <text class="stat-value">{{ formatMoney(account.currentBalance) }}</text>
            <text class="stat-label">当前资金</text>
          </view>
          <view class="stat-item">
            <text class="stat-value" :class="account.totalProfit >= 0 ? 'text-rise' : 'text-fall'">
              {{ formatChange(account.totalProfit) }}
            </text>
            <text class="stat-label">累计收益</text>
          </view>
          <view class="stat-item">
            <text class="stat-value">{{ account.todayDecisions }}/{{ account.maxDailyDecisions }}</text>
            <text class="stat-label">今日决策</text>
          </view>
        </view>
      </view>

      <!-- 收益曲线区域 -->
      <view class="section profit-section" v-if="profitStats">
        <view class="section-header">
          <text class="section-title">收益曲线</text>
          <view class="period-tabs">
            <text
              v-for="period in periods"
              :key="period.value"
              class="period-tab"
              :class="{ active: currentPeriod === period.value }"
              @click="switchPeriod(period.value)"
            >
              {{ period.label }}
            </text>
          </view>
        </view>

        <!-- 收益指标 -->
        <view class="profit-metrics">
          <view class="metric-item">
            <text class="metric-label">最大盈利</text>
            <text class="metric-value text-rise">+{{ formatMoney(profitStats.maxProfit, 0) }}</text>
          </view>
          <view class="metric-item">
            <text class="metric-label">最大亏损</text>
            <text class="metric-value text-fall">{{ formatMoney(profitStats.maxLoss, 0) }}</text>
          </view>
          <view class="metric-item">
            <text class="metric-label">日均收益</text>
            <text class="metric-value" :class="profitStats.avgDailyReturn >= 0 ? 'text-rise' : 'text-fall'">
              {{ formatPercent(profitStats.avgDailyReturn / 100) }}
            </text>
          </view>
          <view class="metric-item">
            <text class="metric-label">波动率</text>
            <text class="metric-value">{{ profitStats.volatility.toFixed(2) }}%</text>
          </view>
        </view>

        <!-- 简单收益曲线（使用数据点列表代替图表） -->
        <view class="profit-list">
          <view class="profit-item header">
            <text class="date">日期</text>
            <text class="value">资产</text>
            <text class="profit">盈亏</text>
            <text class="rate">收益率</text>
          </view>
          <scroll-view class="profit-scroll" scroll-y>
            <view
              v-for="(point, index) in currentProfitData"
              :key="index"
              class="profit-item"
            >
              <text class="date">{{ formatDate(point.date, 'MM-DD') }}</text>
              <text class="value">{{ formatMoney(point.value, 0) }}</text>
              <text class="profit" :class="point.profit >= 0 ? 'text-rise' : 'text-fall'">
                {{ formatChange(point.profit) }}
              </text>
              <text class="rate" :class="point.profitRate >= 0 ? 'text-rise' : 'text-fall'">
                {{ formatPercent(point.profitRate / 100) }}
              </text>
            </view>
          </scroll-view>
        </view>
      </view>

      <!-- Tab 切换区域 -->
      <view class="section tabs-section">
        <view class="tabs-header">
          <view
            v-for="tab in tabs"
            :key="tab.value"
            class="tab-item"
            :class="{ active: currentTab === tab.value }"
            @click="switchTab(tab.value)"
          >
            <text class="tab-text">{{ tab.label }}</text>
            <text v-if="tab.count !== undefined" class="tab-count">({{ tab.count }})</text>
          </view>
        </view>

        <!-- 持仓列表 -->
        <view class="tab-content" v-if="currentTab === 'holdings'">
          <view class="holdings-list" v-if="holdings.length > 0">
            <view class="holding-item header">
              <text class="stock">股票</text>
              <text class="price">现价/成本</text>
              <text class="profit">盈亏</text>
            </view>
            <view
              v-for="holding in holdings"
              :key="holding.id"
              class="holding-item"
              @click="goToStockDetail(holding.stockCode)"
            >
              <view class="stock">
                <text class="stock-name">{{ holding.stockName }}</text>
                <text class="stock-code">{{ holding.stockCode }}</text>
                <text class="stock-quantity">{{ holding.quantity }}股</text>
              </view>
              <view class="price">
                <text class="current-price">{{ holding.currentPrice.toFixed(2) }}</text>
                <text class="avg-cost">成本 {{ holding.avgCost.toFixed(2) }}</text>
              </view>
              <view class="profit">
                <text class="profit-amount" :class="holding.profit >= 0 ? 'text-rise' : 'text-fall'">
                  {{ formatChange(holding.profit) }}
                </text>
                <text class="profit-rate" :class="holding.profitRate >= 0 ? 'text-rise' : 'text-fall'">
                  {{ formatPercent(holding.profitRate / 100) }}
                </text>
              </view>
            </view>
          </view>
          <view class="empty-state" v-else>
            <text class="empty-text">暂无持仓</text>
            <text class="empty-desc">该基金经理还没有购买任何股票</text>
          </view>
        </view>

        <!-- 交易记录 -->
        <view class="tab-content" v-if="currentTab === 'trades'">
          <view class="trades-list" v-if="trades.length > 0">
            <view
              v-for="trade in trades"
              :key="trade.id"
              class="trade-item"
            >
              <view class="trade-header">
                <view class="stock-info">
                  <text class="stock-name">{{ trade.stockName }}</text>
                  <text class="stock-code">{{ trade.stockCode }}</text>
                </view>
                <text class="trade-type" :class="trade.type">{{ trade.type === 'buy' ? '买入' : '卖出' }}</text>
              </view>
              <view class="trade-body">
                <view class="trade-info">
                  <text class="info-label">成交价格</text>
                  <text class="info-value">{{ trade.price.toFixed(2) }}</text>
                </view>
                <view class="trade-info">
                  <text class="info-label">成交数量</text>
                  <text class="info-value">{{ trade.quantity }}股</text>
                </view>
                <view class="trade-info">
                  <text class="info-label">成交金额</text>
                  <text class="info-value">{{ formatMoney(trade.amount, 0) }}</text>
                </view>
                <view class="trade-info">
                  <text class="info-label">手续费</text>
                  <text class="info-value">{{ formatMoney(trade.fee, 2) }}</text>
                </view>
              </view>
              <view class="trade-footer">
                <text class="trade-time">{{ formatDate(trade.createdAt, 'YYYY-MM-DD HH:mm') }}</text>
              </view>
            </view>
          </view>
          <view class="empty-state" v-else>
            <text class="empty-text">暂无交易记录</text>
            <text class="empty-desc">该基金经理还没有进行任何交易</text>
          </view>
        </view>

        <!-- 决策历史 -->
        <view class="tab-content" v-if="currentTab === 'decisions'">
          <view class="decisions-list" v-if="decisions.length > 0">
            <view
              v-for="decision in decisions"
              :key="decision.id"
              class="decision-item"
              :class="{ expanded: expandedDecision === decision.id }"
            >
              <view class="decision-header" @click="toggleDecision(decision.id)">
                <view class="decision-type" :class="decision.type">
                  {{ decision.type === 'buy' ? '买入' : decision.type === 'sell' ? '卖出' : '持有' }}
                </view>
                <view class="decision-stock">
                  <text class="stock-name">{{ decision.stockName }}</text>
                  <text class="stock-code">{{ decision.stockCode }}</text>
                </view>
                <view class="decision-confidence">
                  <text class="confidence-label">置信度</text>
                  <text class="confidence-value">{{ (decision.confidence * 100).toFixed(0) }}%</text>
                </view>
                <text class="expand-icon" :class="{ expanded: expandedDecision === decision.id }">▼</text>
              </view>
              <view class="decision-body" v-if="expandedDecision === decision.id">
                <view class="decision-detail">
                  <text class="detail-label">建议价格</text>
                  <text class="detail-value">{{ decision.price.toFixed(2) }}</text>
                </view>
                <view class="decision-detail">
                  <text class="detail-label">建议数量</text>
                  <text class="detail-value">{{ decision.quantity }}股</text>
                </view>
                <view class="decision-reason">
                  <text class="reason-label">决策理由</text>
                  <text class="reason-text">{{ decision.reason }}</text>
                </view>
                <view class="decision-result" v-if="decision.result">
                  <text class="result-status" :class="decision.result.status">
                    {{ decision.result.status === 'success' ? '执行成功' : decision.result.status === 'failed' ? '执行失败' : '待执行' }}
                  </text>
                  <text v-if="decision.result.profit !== undefined" class="result-profit" :class="decision.result.profit >= 0 ? 'text-rise' : 'text-fall'">
                    收益: {{ formatChange(decision.result.profit) }}
                  </text>
                </view>
              </view>
              <view class="decision-footer">
                <text class="decision-time">{{ formatRelativeTime(decision.createdAt) }}</text>
              </view>
            </view>
          </view>
          <view class="empty-state" v-else>
            <text class="empty-text">暂无决策记录</text>
            <text class="empty-desc">该基金经理还没有生成任何决策</text>
          </view>
        </view>
      </view>

      <!-- 底部操作栏 -->
      <view class="action-bar">
        <button class="action-btn secondary" @click="goBack">返回</button>
        <button class="action-btn primary" @click="triggerDecision" :disabled="account.todayDecisions >= account.maxDailyDecisions">
          立即决策
        </button>
      </view>
    </template>

    <!-- 错误状态 -->
    <view class="error-state" v-else>
      <text class="error-text">加载失败</text>
      <text class="error-desc">无法获取基金经理信息</text>
      <button class="retry-btn" @click="loadData">重试</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useTradingStore } from '@/stores/trading'
import { formatMoney, formatPercent, formatChange, formatDate, formatRelativeTime } from '@/utils/formatter'
import type { AIAccount, AIDecision } from '@/types/ai'
import type { Holding, Trade } from '@/types/trading'

// ============================================================================
// 类型定义
// ============================================================================

type TabType = 'holdings' | 'trades' | 'decisions'
type PeriodType = 'daily' | 'weekly' | 'monthly'

interface PeriodOption {
  label: string
  value: PeriodType
}

interface TabOption {
  label: string
  value: TabType
  count?: number
}

// ============================================================================
// 状态管理
// ============================================================================

const aiStore = useAIStore()
const tradingStore = useTradingStore()

// 页面状态
const loading = ref(false)
const accountId = ref('')
const currentTab = ref<TabType>('holdings')
const currentPeriod = ref<PeriodType>('daily')
const expandedDecision = ref<string | null>(null)

// 数据
const account = ref<AIAccount | null>(null)
const holdings = ref<Holding[]>([])
const trades = ref<Trade[]>([])
const decisions = ref<AIDecision[]>([])
const profitStats = ref<any>(null)

// ============================================================================
// 计算属性
// ============================================================================

const periods = computed<PeriodOption[]>(() => [
  { label: '日', value: 'daily' },
  { label: '周', value: 'weekly' },
  { label: '月', value: 'monthly' },
])

const tabs = computed<TabOption[]>(() => [
  { label: '持仓', value: 'holdings', count: holdings.value.length },
  { label: '交易', value: 'trades', count: trades.value.length },
  { label: '决策', value: 'decisions', count: decisions.value.length },
])

const currentProfitData = computed(() => {
  if (!profitStats.value) return []
  switch (currentPeriod.value) {
    case 'daily':
      return profitStats.value.dailyProfits || []
    case 'weekly':
      return profitStats.value.weeklyProfits || []
    case 'monthly':
      return profitStats.value.monthlyProfits || []
    default:
      return []
  }
})

// ============================================================================
// 方法
// ============================================================================

// 获取页面参数
const getPageParams = () => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  const query = currentPage.options || {}
  accountId.value = query.id || ''
}

// 加载数据
const loadData = async () => {
  if (!accountId.value) {
    uni.showToast({ title: '参数错误', icon: 'none' })
    return
  }

  loading.value = true
  uni.showLoading({ title: '加载中' })

  try {
    // 并行加载所有数据
    await Promise.all([
      loadAccountDetail(),
      loadHoldings(),
      loadTrades(),
      loadDecisions(),
      loadProfitStats(),
    ])
  } catch (error) {
    console.error('Load data error:', error)
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loading.value = false
    uni.hideLoading()
  }
}

// 加载账户详情
const loadAccountDetail = async () => {
  const result = await aiStore.fetchAccountDetail(accountId.value)
  if (result && aiStore.currentAccount) {
    account.value = aiStore.currentAccount
  }
}

// 加载持仓
const loadHoldings = async () => {
  // TODO: 等待 Backend API 支持按账户筛选持仓
  // 目前先加载所有持仓，然后按 accountId 过滤
  await tradingStore.fetchHoldings()
  holdings.value = tradingStore.holdings.filter(h => h.accountId === accountId.value)
}

// 加载交易记录
const loadTrades = async () => {
  await tradingStore.fetchTrades({ accountId: accountId.value, page: 1, pageSize: 50 })
  trades.value = tradingStore.trades
}

// 加载决策历史
const loadDecisions = async () => {
  await aiStore.fetchDecisions(accountId.value)
  decisions.value = aiStore.decisions
}

// 加载收益统计
const loadProfitStats = async () => {
  await tradingStore.fetchProfitStats()
  profitStats.value = tradingStore.profitStats
}

// 切换 Tab
const switchTab = (tab: TabType) => {
  currentTab.value = tab
}

// 切换周期
const switchPeriod = (period: PeriodType) => {
  currentPeriod.value = period
}

// 展开/收起决策详情
const toggleDecision = (id: string) => {
  expandedDecision.value = expandedDecision.value === id ? null : id
}

// 触发决策
const triggerDecision = async () => {
  if (!account.value) return

  if (account.value.todayDecisions >= account.value.maxDailyDecisions) {
    uni.showToast({ title: '今日决策次数已用完', icon: 'none' })
    return
  }

  uni.showLoading({ title: '生成决策中' })
  const result = await aiStore.triggerDecision(accountId.value)
  uni.hideLoading()

  if (result) {
    // 刷新决策列表
    await loadDecisions()
    // 刷新账户详情（更新今日决策次数）
    await loadAccountDetail()
  }
}

// 返回上一页
const goBack = () => {
  uni.navigateBack()
}

// 跳转到股票详情
const goToStockDetail = (stockCode: string) => {
  uni.navigateTo({
    url: `/pages/market/stock-detail?code=${stockCode}`,
  })
}

// ============================================================================
// 辅助函数
// ============================================================================

const getUniversity = (provider: string): string => {
  const map: Record<string, string> = {
    deepseek: 'DeepSeek',
    glm: '智谱AI',
    claude: 'Anthropic',
    openai: 'OpenAI',
    qwen: '阿里通义',
  }
  return map[provider] || provider
}

const getRiskLabel = (level: string): string => {
  const map: Record<string, string> = {
    conservative: '保守',
    moderate: '稳健',
    aggressive: '激进',
  }
  return map[level] || level
}

const getStatusLabel = (status: string): string => {
  const map: Record<string, string> = {
    active: '运行中',
    inactive: '已暂停',
    deciding: '决策中',
    error: '异常',
  }
  return map[status] || status
}

// ============================================================================
// 生命周期
// ============================================================================

onMounted(() => {
  getPageParams()
  loadData()
})

// 监听账户ID变化（用于刷新）
watch(() => accountId.value, () => {
  if (accountId.value) {
    loadData()
  }
})
</script>

<style scoped lang="scss">
// ============================================================================
// 变量定义
// ============================================================================

$primary-color: #1890FF;
$rise-color: #FF4D4F;
$fall-color: #52C41A;
$text-primary: #262626;
$text-secondary: #595959;
$text-tertiary: #8C8C8C;
$bg-color: #F5F5F5;
$card-bg: #FFFFFF;
$border-color: #F0F0F0;

// ============================================================================
// 页面布局
// ============================================================================

.detail-page {
  min-height: 100vh;
  background: $bg-color;
  padding-bottom: 120rpx;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}

.loading-text {
  font-size: 28rpx;
  color: $text-tertiary;
}

// ============================================================================
// 账户卡片
// ============================================================================

.account-card {
  background: $card-bg;
  margin: 20rpx;
  border-radius: 16rpx;
  padding: 30rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24rpx;
    padding-bottom: 24rpx;
    border-bottom: 1rpx solid $border-color;

    .account-info {
      flex: 1;

      .account-name {
        font-size: 36rpx;
        font-weight: 600;
        color: $text-primary;
        margin-bottom: 12rpx;
      }

      .account-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 12rpx;

        .tag {
          font-size: 22rpx;
          padding: 4rpx 12rpx;
          border-radius: 4rpx;

          &.school {
            background: #E6F7FF;
            color: $primary-color;
          }

          &.risk {
            &.conservative {
              background: #F6FFED;
              color: $fall-color;
            }

            &.moderate {
              background: #FFF7E6;
              color: #FA8C16;
            }

            &.aggressive {
              background: #FFF1F0;
              color: $rise-color;
            }
          }

          &.status {
            &.active {
              background: #F6FFED;
              color: $fall-color;
            }

            &.inactive {
              background: #F5F5F5;
              color: $text-tertiary;
            }

            &.deciding {
              background: #E6F7FF;
              color: $primary-color;
            }

            &.error {
              background: #FFF1F0;
              color: $rise-color;
            }
          }
        }
      }
    }

    .account-profit {
      text-align: right;

      .profit-rate {
        font-size: 48rpx;
        font-weight: 700;
        display: block;
      }

      .profit-label {
        font-size: 24rpx;
        color: $text-tertiary;
        margin-top: 8rpx;
      }
    }
  }

  .card-stats {
    display: flex;
    justify-content: space-between;

    .stat-item {
      text-align: center;
      flex: 1;

      .stat-value {
        font-size: 32rpx;
        font-weight: 600;
        color: $text-primary;
        display: block;
      }

      .stat-label {
        font-size: 24rpx;
        color: $text-tertiary;
        margin-top: 8rpx;
        display: block;
      }
    }
  }
}

// ============================================================================
// 收益区域
// ============================================================================

.section {
  background: $card-bg;
  margin: 20rpx;
  border-radius: 16rpx;
  padding: 30rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;

  .section-title {
    font-size: 32rpx;
    font-weight: 600;
    color: $text-primary;
  }

  .period-tabs {
    display: flex;
    background: $bg-color;
    border-radius: 8rpx;
    padding: 4rpx;

    .period-tab {
      font-size: 24rpx;
      padding: 8rpx 20rpx;
      color: $text-secondary;
      border-radius: 6rpx;
      transition: all 0.3s;

      &.active {
        background: $card-bg;
        color: $primary-color;
        box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.06);
      }
    }
  }
}

.profit-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16rpx;
  margin-bottom: 24rpx;
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid $border-color;

  .metric-item {
    text-align: center;

    .metric-label {
      font-size: 22rpx;
      color: $text-tertiary;
      display: block;
      margin-bottom: 8rpx;
    }

    .metric-value {
      font-size: 26rpx;
      font-weight: 500;
    }
  }
}

.profit-list {
  .profit-scroll {
    max-height: 400rpx;
  }

  .profit-item {
    display: flex;
    justify-content: space-between;
    padding: 16rpx 0;
    border-bottom: 1rpx solid $border-color;

    &:last-child {
      border-bottom: none;
    }

    &.header {
      padding: 12rpx 0;
      border-bottom: 2rpx solid $border-color;

      text {
        font-weight: 500;
        color: $text-secondary;
        font-size: 24rpx;
      }
    }

    text {
      font-size: 26rpx;
      color: $text-primary;
      flex: 1;
      text-align: center;

      &.date {
        text-align: left;
      }
    }
  }
}

// ============================================================================
// Tab 区域
// ============================================================================

.tabs-section {
  padding: 0;
  overflow: hidden;
}

.tabs-header {
  display: flex;
  border-bottom: 1rpx solid $border-color;

  .tab-item {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 24rpx 0;
    position: relative;
    cursor: pointer;

    &.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 20%;
      right: 20%;
      height: 4rpx;
      background: $primary-color;
      border-radius: 2rpx;
    }

    .tab-text {
      font-size: 28rpx;
      color: $text-secondary;

      .active & {
        color: $primary-color;
        font-weight: 500;
      }
    }

    .tab-count {
      font-size: 24rpx;
      color: $text-tertiary;
      margin-left: 8rpx;

      .active & {
        color: $primary-color;
      }
    }
  }
}

.tab-content {
  padding: 20rpx;
}

// ============================================================================
// 持仓列表
// ============================================================================

.holdings-list {
  .holding-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24rpx 0;
    border-bottom: 1rpx solid $border-color;

    &:last-child {
      border-bottom: none;
    }

    &.header {
      padding: 16rpx 0;

      text {
        font-size: 24rpx;
        color: $text-secondary;
        font-weight: 500;
      }
    }

    .stock {
      flex: 1;

      .stock-name {
        font-size: 30rpx;
        color: $text-primary;
        font-weight: 500;
        display: block;
      }

      .stock-code {
        font-size: 22rpx;
        color: $text-tertiary;
        margin-top: 4rpx;
        display: block;
      }

      .stock-quantity {
        font-size: 22rpx;
        color: $text-secondary;
        margin-top: 4rpx;
        display: block;
      }
    }

    .price {
      flex: 1;
      text-align: center;

      .current-price {
        font-size: 30rpx;
        color: $text-primary;
        display: block;
      }

      .avg-cost {
        font-size: 22rpx;
        color: $text-tertiary;
        margin-top: 4rpx;
        display: block;
      }
    }

    .profit {
      flex: 1;
      text-align: right;

      .profit-amount {
        font-size: 28rpx;
        font-weight: 500;
        display: block;
      }

      .profit-rate {
        font-size: 24rpx;
        margin-top: 4rpx;
        display: block;
      }
    }
  }
}

// ============================================================================
// 交易记录
// ============================================================================

.trades-list {
  .trade-item {
    padding: 24rpx 0;
    border-bottom: 1rpx solid $border-color;

    &:last-child {
      border-bottom: none;
    }

    .trade-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16rpx;

      .stock-info {
        .stock-name {
          font-size: 30rpx;
          color: $text-primary;
          font-weight: 500;
          margin-right: 12rpx;
        }

        .stock-code {
          font-size: 24rpx;
          color: $text-tertiary;
        }
      }

      .trade-type {
        font-size: 24rpx;
        padding: 4rpx 16rpx;
        border-radius: 4rpx;

        &.buy {
          background: #FFF1F0;
          color: $rise-color;
        }

        &.sell {
          background: #F6FFED;
          color: $fall-color;
        }
      }
    }

    .trade-body {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16rpx;
      margin-bottom: 16rpx;

      .trade-info {
        .info-label {
          font-size: 22rpx;
          color: $text-tertiary;
          display: block;
          margin-bottom: 4rpx;
        }

        .info-value {
          font-size: 26rpx;
          color: $text-primary;
          font-weight: 500;
        }
      }
    }

    .trade-footer {
      .trade-time {
        font-size: 22rpx;
        color: $text-tertiary;
      }
    }
  }
}

// ============================================================================
// 决策历史
// ============================================================================

.decisions-list {
  .decision-item {
    padding: 24rpx 0;
    border-bottom: 1rpx solid $border-color;

    &:last-child {
      border-bottom: none;
    }

    &.expanded {
      background: #FAFAFA;
      margin: 0 -20rpx;
      padding: 24rpx 20rpx;
    }

    .decision-header {
      display: flex;
      align-items: center;
      gap: 16rpx;

      .decision-type {
        font-size: 22rpx;
        padding: 4rpx 12rpx;
        border-radius: 4rpx;
        font-weight: 500;

        &.buy {
          background: #FFF1F0;
          color: $rise-color;
        }

        &.sell {
          background: #F6FFED;
          color: $fall-color;
        }

        &.hold {
          background: #F5F5F5;
          color: $text-tertiary;
        }
      }

      .decision-stock {
        flex: 1;

        .stock-name {
          font-size: 28rpx;
          color: $text-primary;
          font-weight: 500;
          margin-right: 8rpx;
        }

        .stock-code {
          font-size: 22rpx;
          color: $text-tertiary;
        }
      }

      .decision-confidence {
        text-align: center;

        .confidence-label {
          font-size: 20rpx;
          color: $text-tertiary;
          display: block;
        }

        .confidence-value {
          font-size: 24rpx;
          color: $primary-color;
          font-weight: 500;
        }
      }

      .expand-icon {
        font-size: 24rpx;
        color: $text-tertiary;
        transition: transform 0.3s;

        &.expanded {
          transform: rotate(180deg);
        }
      }
    }

    .decision-body {
      margin-top: 20rpx;
      padding-top: 20rpx;
      border-top: 1rpx solid $border-color;

      .decision-detail {
        display: flex;
        justify-content: space-between;
        margin-bottom: 12rpx;

        .detail-label {
          font-size: 24rpx;
          color: $text-secondary;
        }

        .detail-value {
          font-size: 24rpx;
          color: $text-primary;
          font-weight: 500;
        }
      }

      .decision-reason {
        margin: 16rpx 0;
        padding: 16rpx;
        background: $card-bg;
        border-radius: 8rpx;

        .reason-label {
          font-size: 22rpx;
          color: $text-tertiary;
          display: block;
          margin-bottom: 8rpx;
        }

        .reason-text {
          font-size: 26rpx;
          color: $text-primary;
          line-height: 1.6;
        }
      }

      .decision-result {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 16rpx;
        padding-top: 16rpx;
        border-top: 1rpx dashed $border-color;

        .result-status {
          font-size: 24rpx;
          padding: 4rpx 12rpx;
          border-radius: 4rpx;

          &.success {
            background: #F6FFED;
            color: $fall-color;
          }

          &.failed {
            background: #FFF1F0;
            color: $rise-color;
          }

          &.pending {
            background: #FFF7E6;
            color: #FA8C16;
          }
        }

        .result-profit {
          font-size: 26rpx;
          font-weight: 500;
        }
      }
    }

    .decision-footer {
      margin-top: 12rpx;

      .decision-time {
        font-size: 22rpx;
        color: $text-tertiary;
      }
    }
  }
}

// ============================================================================
// 底部操作栏
// ============================================================================

.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 20rpx;
  padding: 20rpx 30rpx calc(20rpx + env(safe-area-inset-bottom));
  background: $card-bg;
  border-top: 1rpx solid $border-color;
  z-index: 100;

  .action-btn {
    flex: 1;
    height: 88rpx;
    line-height: 88rpx;
    text-align: center;
    border-radius: 12rpx;
    font-size: 30rpx;
    font-weight: 500;
    border: none;

    &.secondary {
      background: $bg-color;
      color: $text-secondary;
    }

    &.primary {
      background: $primary-color;
      color: #FFFFFF;

      &:disabled {
        background: #BFBFBF;
        color: #FFFFFF;
      }
    }
  }
}

// ============================================================================
// 空状态
// ============================================================================

.empty-state {
  text-align: center;
  padding: 60rpx 40rpx;

  .empty-text {
    font-size: 30rpx;
    color: $text-secondary;
    display: block;
    margin-bottom: 12rpx;
  }

  .empty-desc {
    font-size: 24rpx;
    color: $text-tertiary;
  }
}

// ============================================================================
// 错误状态
// ============================================================================

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;

  .error-text {
    font-size: 36rpx;
    color: $text-primary;
    margin-bottom: 12rpx;
  }

  .error-desc {
    font-size: 26rpx;
    color: $text-secondary;
    margin-bottom: 40rpx;
  }

  .retry-btn {
    width: 240rpx;
    height: 80rpx;
    line-height: 80rpx;
    background: $primary-color;
    color: #FFFFFF;
    border-radius: 12rpx;
    font-size: 28rpx;
  }
}

// ============================================================================
// 工具类
// ============================================================================

.text-rise {
  color: $rise-color !important;
}

.text-fall {
  color: $fall-color !important;
}
</style>