<template>
  <view class="trader-detail-page">
    <view class="page-bg"></view>
    
    <view class="detail-container">
      <view class="trader-header">
        <view class="header-bg"></view>
        <view class="back-btn" @click="goBack">
          <text class="back-icon">←</text>
        </view>
        <view class="trader-profile">
          <view class="trader-avatar-large">
            <text class="avatar-emoji">{{ traderEmoji }}</text>
            <view class="avatar-glow"></view>
          </view>
          <view class="trader-info">
            <text class="trader-name">{{ traderName }}</text>
            <text class="trader-title">{{ traderTitle }}</text>
            <view class="trader-tags">
              <view class="tag" :class="riskLevelClass">
                <text class="tag-icon">{{ riskLevelIcon }}</text>
                <text class="tag-text">{{ riskLevelText }}</text>
              </view>
              <view class="tag" :class="statusClass">
                <text class="tag-icon">{{ statusIcon }}</text>
                <text class="tag-text">{{ statusText }}</text>
              </view>
            </view>
          </view>
        </view>
        <view class="trader-stats">
          <view class="stat-card profit">
            <text class="stat-label">总收益</text>
            <text class="stat-value" :class="totalProfit >= 0 ? 'text-rise' : 'text-fall'">
              {{ formatChange(totalProfit) }}
            </text>
            <text class="stat-rate" :class="profitRate >= 0 ? 'text-rise' : 'text-fall'">
              {{ formatPercent(profitRate) }}
            </text>
          </view>
          <view class="stat-card balance">
            <text class="stat-label">当前元宝</text>
            <text class="stat-value">{{ formatMoney(currentBalance) }}</text>
            <text class="stat-rate">管理中</text>
          </view>
          <view class="stat-card decisions">
            <text class="stat-label">今日决策</text>
            <text class="stat-value">{{ todayDecisions }}/{{ maxDailyDecisions }}</text>
            <text class="stat-rate">{{ decisionProgress }}%</text>
          </view>
        </view>
      </view>

      <view class="content-sections">
        <view class="section-tabs">
          <view
            class="tab-item"
            v-for="tab in tabs"
            :key="tab.value"
            :class="{ active: currentTab === tab.value }"
            @click="switchTab(tab.value)"
          >
            <text class="tab-icon">{{ tab.icon }}</text>
            <text class="tab-label">{{ tab.label }}</text>
          </view>
        </view>

        <view class="tab-content">
          <view class="skills-section" v-if="currentTab === 'skills'">
            <view class="skills-header">
              <text class="section-title">🎯 技能树</text>
              <view class="skill-points">
                <text class="points-label">可用技能点</text>
                <text class="points-value">{{ availableSkillPoints }}</text>
              </view>
            </view>

            <view class="skills-tree">
              <view
                class="skill-category"
                v-for="category in skillCategories"
                :key="category.id"
              >
                <view class="category-header">
                  <text class="category-icon">{{ category.icon }}</text>
                  <text class="category-name">{{ category.name }}</text>
                  <text class="category-level">Lv.{{ category.level }}</text>
                </view>
                <view class="skills-grid">
                  <view
                    class="skill-card"
                    v-for="skill in category.skills"
                    :key="skill.id"
                    :class="{ 
                      'unlocked': skill.unlocked,
                      'locked': !skill.unlocked,
                      'maxed': skill.level >= skill.maxLevel
                    }"
                    @click="upgradeSkill(skill)"
                  >
                    <view class="skill-icon">
                      <text class="icon-emoji">{{ skill.icon }}</text>
                      <view class="lock-overlay" v-if="!skill.unlocked">
                        <text class="lock-icon">🔒</text>
                      </view>
                    </view>
                    <text class="skill-name">{{ skill.name }}</text>
                    <view class="skill-level">
                      <text class="level-text">Lv.{{ skill.level }}/{{ skill.maxLevel }}</text>
                      <view class="level-bar">
                        <view 
                          class="level-fill" 
                          :style="{ width: (skill.level / skill.maxLevel * 100) + '%' }"
                        ></view>
                      </view>
                    </view>
                    <view class="skill-effect" v-if="skill.unlocked">
                      <text class="effect-label">{{ skill.effectLabel }}</text>
                      <text class="effect-value">{{ skill.effectValue }}</text>
                    </view>
                    <view class="skill-cost" v-if="skill.unlocked && skill.level < skill.maxLevel">
                      <text class="cost-label">升级消耗</text>
                      <text class="cost-value">{{ skill.upgradeCost }}点</text>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>

          <view class="achievements-section" v-if="currentTab === 'achievements'">
            <view class="achievements-header">
              <text class="section-title">🏆 成就系统</text>
              <view class="achievement-stats">
                <text class="stats-label">已解锁</text>
                <text class="stats-value">{{ unlockedAchievements }}/{{ totalAchievements }}</text>
              </view>
            </view>

            <view class="achievements-list">
              <view
                class="achievement-item"
                v-for="achievement in achievements"
                :key="achievement.id"
                :class="{ 'unlocked': achievement.unlocked }"
              >
                <view class="achievement-icon">
                  <text class="icon-emoji">{{ achievement.icon }}</text>
                  <view class="glow-effect" v-if="achievement.unlocked"></view>
                  <view class="lock-overlay" v-if="!achievement.unlocked">
                    <text class="lock-icon">🔒</text>
                  </view>
                </view>
                <view class="achievement-info">
                  <text class="achievement-name">{{ achievement.name }}</text>
                  <text class="achievement-desc">{{ achievement.description }}</text>
                  <view class="achievement-progress" v-if="!achievement.unlocked">
                    <view class="progress-bar">
                      <view 
                        class="progress-fill" 
                        :style="{ width: achievement.progress + '%' }"
                      ></view>
                    </view>
                    <text class="progress-text">{{ achievement.progress }}%</text>
                  </view>
                  <view class="achievement-rewards" v-if="achievement.unlocked">
                    <view class="reward-item">
                      <text class="reward-icon">⭐</text>
                      <text class="reward-value">{{ achievement.expReward }}经验</text>
                    </view>
                    <view class="reward-item" v-if="achievement.skillPointReward > 0">
                      <text class="reward-icon">🎯</text>
                      <text class="reward-value">{{ achievement.skillPointReward }}技能点</text>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>

          <view class="performance-section" v-if="currentTab === 'performance'">
            <view class="performance-header">
              <text class="section-title">📊 业绩表现</text>
            </view>

            <view class="performance-metrics">
              <view class="metric-card">
                <text class="metric-label">总收益率</text>
                <text class="metric-value" :class="profitRate >= 0 ? 'text-rise' : 'text-fall'">
                  {{ formatPercent(profitRate) }}
                </text>
                <text class="metric-desc">自创建以来</text>
              </view>
              <view class="metric-card">
                <text class="metric-label">最大回撤</text>
                <text class="metric-value text-fall">{{ formatPercent(maxDrawdown) }}</text>
                <text class="metric-desc">历史最大亏损</text>
              </view>
              <view class="metric-card">
                <text class="metric-label">夏普比率</text>
                <text class="metric-value">{{ sharpeRatio.toFixed(2) }}</text>
                <text class="metric-desc">风险调整收益</text>
              </view>
              <view class="metric-card">
                <text class="metric-label">胜率</text>
                <text class="metric-value">{{ winRate.toFixed(1) }}%</text>
                <text class="metric-desc">盈利交易占比</text>
              </view>
            </view>

            <view class="performance-chart">
              <view class="chart-header">
                <text class="chart-title">收益曲线</text>
                <view class="chart-periods">
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
              <view class="chart-content">
                <view class="chart-bars">
                  <view
                    class="chart-bar"
                    v-for="(point, index) in chartData"
                    :key="index"
                    :class="{ 'positive': point.profit >= 0, 'negative': point.profit < 0 }"
                  >
                    <view 
                      class="bar-fill"
                      :style="{ 
                        height: Math.abs(point.profitRate * 200) + 'rpx',
                        bottom: point.profitRate >= 0 ? '50%' : '50%'
                      }"
                    ></view>
                    <text class="bar-label">{{ formatDate(point.date, 'MM-DD') }}</text>
                  </view>
                </view>
              </view>
            </view>
          </view>

          <view class="holdings-section" v-if="currentTab === 'holdings'">
            <view class="holdings-header">
              <text class="section-title">💼 当前持仓</text>
              <text class="holdings-count">{{ holdings.length }}只股票</text>
            </view>

            <view class="holdings-list" v-if="holdings.length > 0">
              <view
                class="holding-card"
                v-for="holding in holdings"
                :key="holding.id"
              >
                <view class="holding-info">
                  <text class="stock-name">{{ holding.stockName }}</text>
                  <text class="stock-code">{{ holding.stockCode }}</text>
                  <text class="stock-quantity">{{ holding.quantity }}股</text>
                </view>
                <view class="holding-price">
                  <text class="current-price">{{ holding.currentPrice.toFixed(2) }}</text>
                  <text class="avg-cost">成本 {{ holding.avgCost.toFixed(2) }}</text>
                </view>
                <view class="holding-profit">
                  <text class="profit-amount" :class="holding.profit >= 0 ? 'text-rise' : 'text-fall'">
                    {{ formatChange(holding.profit) }}
                  </text>
                  <text class="profit-rate" :class="holding.profitRate >= 0 ? 'text-rise' : 'text-fall'">
                    {{ formatPercent(holding.profitRate) }}
                  </text>
                </view>
              </view>
            </view>
            <view class="empty-holdings" v-else>
              <text class="empty-emoji">📊</text>
              <text class="empty-text">暂无持仓</text>
              <text class="empty-desc">交易员正在寻找投资机会</text>
            </view>
          </view>
        </view>
      </view>

      <view class="action-bar">
        <button class="action-btn secondary" @click="goBack">返回</button>
        <button 
          class="action-btn primary" 
          @click="triggerDecision"
          :disabled="todayDecisions >= maxDailyDecisions"
        >
          <text class="btn-icon">⚡</text>
          <text class="btn-text">立即决策</text>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useTradingStore } from '@/stores/trading'
import { formatMoney, formatPercent, formatChange, formatDate } from '@/utils/formatter'

const aiStore = useAIStore()
const tradingStore = useTradingStore()

const accountId = ref('')
const currentTab = ref('skills')
const currentPeriod = ref('daily')

const traderEmoji = ref('🤖')
const traderName = ref('智能交易员')
const traderTitle = ref('Lv.5 资深分析师')
const totalProfit = ref(12580.50)
const profitRate = ref(0.1258)
const currentBalance = ref(112580.50)
const todayDecisions = ref(3)
const maxDailyDecisions = ref(5)
const riskLevel = ref('moderate')
const status = ref('active')

const availableSkillPoints = ref(8)
const maxDrawdown = ref(-0.08)
const sharpeRatio = ref(1.85)
const winRate = ref(68.5)

const tabs = [
  { value: 'skills', label: '技能', icon: '🎯' },
  { value: 'achievements', label: '成就', icon: '🏆' },
  { value: 'performance', label: '业绩', icon: '📊' },
  { value: 'holdings', label: '持仓', icon: '💼' },
]

const periods = [
  { value: 'daily', label: '日' },
  { value: 'weekly', label: '周' },
  { value: 'monthly', label: '月' },
]

const skillCategories = ref([
  {
    id: 'analysis',
    name: '分析能力',
    icon: '🔍',
    level: 3,
    skills: [
      {
        id: 'market-trend',
        name: '市场趋势',
        icon: '📈',
        level: 3,
        maxLevel: 5,
        unlocked: true,
        upgradeCost: 2,
        effectLabel: '趋势判断',
        effectValue: '+15%',
      },
      {
        id: 'fundamental',
        name: '基本面',
        icon: '📊',
        level: 2,
        maxLevel: 5,
        unlocked: true,
        upgradeCost: 2,
        effectLabel: '分析准确',
        effectValue: '+10%',
      },
      {
        id: 'technical',
        name: '技术面',
        icon: '📉',
        level: 4,
        maxLevel: 5,
        unlocked: true,
        upgradeCost: 3,
        effectLabel: '信号识别',
        effectValue: '+20%',
      },
    ],
  },
  {
    id: 'risk',
    name: '风险控制',
    icon: '🛡️',
    level: 2,
    skills: [
      {
        id: 'position-size',
        name: '仓位管理',
        icon: '⚖️',
        level: 2,
        maxLevel: 5,
        unlocked: true,
        upgradeCost: 2,
        effectLabel: '风险降低',
        effectValue: '-12%',
      },
      {
        id: 'stop-loss',
        name: '止损策略',
        icon: '🚫',
        level: 1,
        maxLevel: 5,
        unlocked: true,
        upgradeCost: 1,
        effectLabel: '止损效率',
        effectValue: '+8%',
      },
      {
        id: 'diversification',
        name: '分散投资',
        icon: '🌐',
        level: 0,
        maxLevel: 5,
        unlocked: false,
        upgradeCost: 3,
        effectLabel: '分散度',
        effectValue: '解锁',
      },
    ],
  },
  {
    id: 'execution',
    name: '执行效率',
    icon: '⚡',
    level: 4,
    skills: [
      {
        id: 'timing',
        name: '时机把握',
        icon: '⏰',
        level: 4,
        maxLevel: 5,
        unlocked: true,
        upgradeCost: 2,
        effectLabel: '入场时机',
        effectValue: '+18%',
      },
      {
        id: 'speed',
        name: '反应速度',
        icon: '🚀',
        level: 3,
        maxLevel: 5,
        unlocked: true,
        upgradeCost: 2,
        effectLabel: '响应时间',
        effectValue: '-25%',
      },
      {
        id: 'adaptation',
        name: '市场适应',
        icon: '🔄',
        level: 2,
        maxLevel: 5,
        unlocked: true,
        upgradeCost: 2,
        effectLabel: '适应能力',
        effectValue: '+12%',
      },
    ],
  },
])

const achievements = ref([
  {
    id: 1,
    name: '初出茅庐',
    icon: '🌱',
    description: '创建第一个AI交易员',
    unlocked: true,
    progress: 100,
    expReward: 100,
    skillPointReward: 1,
  },
  {
    id: 2,
    name: '第一桶金',
    icon: '💰',
    description: '单笔交易盈利超过1000元宝',
    unlocked: true,
    progress: 100,
    expReward: 200,
    skillPointReward: 2,
  },
  {
    id: 3,
    name: '稳定盈利',
    icon: '📈',
    description: '连续7天实现正收益',
    unlocked: true,
    progress: 100,
    expReward: 300,
    skillPointReward: 3,
  },
  {
    id: 4,
    name: '交易达人',
    icon: '🎯',
    description: '累计完成100笔交易',
    unlocked: false,
    progress: 68,
    expReward: 500,
    skillPointReward: 5,
  },
  {
    id: 5,
    name: '风险控制大师',
    icon: '🛡️',
    description: '最大回撤控制在5%以内',
    unlocked: false,
    progress: 85,
    expReward: 400,
    skillPointReward: 4,
  },
  {
    id: 6,
    name: '投资大师',
    icon: '👑',
    description: '总收益率达到50%',
    unlocked: false,
    progress: 25,
    expReward: 1000,
    skillPointReward: 10,
  },
  {
    id: 7,
    name: '传奇人物',
    icon: '🏆',
    description: '在排行榜进入前10名',
    unlocked: false,
    progress: 0,
    expReward: 2000,
    skillPointReward: 20,
  },
])

const holdings = ref([
  {
    id: '1',
    stockName: '贵州茅台',
    stockCode: '600519',
    quantity: 100,
    currentPrice: 1850.00,
    avgCost: 1750.00,
    profit: 10000.00,
    profitRate: 0.0571,
  },
  {
    id: '2',
    stockName: '宁德时代',
    stockCode: '300750',
    quantity: 200,
    currentPrice: 180.50,
    avgCost: 185.00,
    profit: -900.00,
    profitRate: -0.0243,
  },
  {
    id: '3',
    stockName: '比亚迪',
    stockCode: '002594',
    quantity: 300,
    currentPrice: 260.00,
    avgCost: 240.00,
    profit: 6000.00,
    profitRate: 0.0833,
  },
])

const chartData = ref([
  { date: '2024-01-01', profit: 500, profitRate: 0.005 },
  { date: '2024-01-02', profit: 800, profitRate: 0.008 },
  { date: '2024-01-03', profit: -300, profitRate: -0.003 },
  { date: '2024-01-04', profit: 1200, profitRate: 0.012 },
  { date: '2024-01-05', profit: 600, profitRate: 0.006 },
  { date: '2024-01-06', profit: 1500, profitRate: 0.015 },
  { date: '2024-01-07', profit: -200, profitRate: -0.002 },
])

const decisionProgress = computed(() => {
  return Math.round((todayDecisions.value / maxDailyDecisions.value) * 100)
})

const riskLevelClass = computed(() => {
  const map: Record<string, string> = {
    conservative: 'conservative',
    moderate: 'moderate',
    aggressive: 'aggressive',
  }
  return map[riskLevel.value] || 'moderate'
})

const riskLevelIcon = computed(() => {
  const map: Record<string, string> = {
    conservative: '🛡️',
    moderate: '⚖️',
    aggressive: '🚀',
  }
  return map[riskLevel.value] || '⚖️'
})

const riskLevelText = computed(() => {
  const map: Record<string, string> = {
    conservative: '保守型',
    moderate: '稳健型',
    aggressive: '激进型',
  }
  return map[riskLevel.value] || '稳健型'
})

const statusClass = computed(() => {
  const map: Record<string, string> = {
    active: 'active',
    inactive: 'inactive',
    deciding: 'deciding',
  }
  return map[status.value] || 'inactive'
})

const statusIcon = computed(() => {
  const map: Record<string, string> = {
    active: '✅',
    inactive: '⏸️',
    deciding: '⚡',
  }
  return map[status.value] || '⏸️'
})

const statusText = computed(() => {
  const map: Record<string, string> = {
    active: '运行中',
    inactive: '已暂停',
    deciding: '决策中',
  }
  return map[status.value] || '已暂停'
})

const unlockedAchievements = computed(() => {
  return achievements.value.filter(a => a.unlocked).length
})

const totalAchievements = computed(() => {
  return achievements.value.length
})

function switchTab(tab: string) {
  currentTab.value = tab
}

function switchPeriod(period: string) {
  currentPeriod.value = period
}

function upgradeSkill(skill: any) {
  if (!skill.unlocked) {
    uni.showToast({ 
      title: '技能未解锁', 
      icon: 'none' 
    })
    return
  }

  if (skill.level >= skill.maxLevel) {
    uni.showToast({ 
      title: '技能已满级', 
      icon: 'none' 
    })
    return
  }

  if (availableSkillPoints.value < skill.upgradeCost) {
    uni.showToast({ 
      title: '技能点不足', 
      icon: 'none' 
    })
    return
  }

  skill.level++
  availableSkillPoints.value -= skill.upgradeCost
  
  uni.showToast({ 
    title: `${skill.name}升级成功！`, 
    icon: 'success' 
  })
}

function triggerDecision() {
  if (todayDecisions.value >= maxDailyDecisions.value) {
    uni.showToast({ 
      title: '今日决策次数已用完', 
      icon: 'none' 
    })
    return
  }

  uni.showLoading({ title: '生成决策中...' })
  
  setTimeout(() => {
    uni.hideLoading()
    todayDecisions.value++
    uni.showToast({ 
      title: '决策生成成功！', 
      icon: 'success' 
    })
  }, 1500)
}

function goBack() {
  uni.navigateBack()
}

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  const query = currentPage.options || {}
  accountId.value = query.id || ''
})
</script>

<style lang="scss" scoped>
.trader-detail-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  position: relative;
  overflow: hidden;

  .page-bg {
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
  }

  .detail-container {
    position: relative;
    z-index: 1;
    padding-bottom: 140rpx;
  }
}

.trader-header {
  position: relative;
  padding: 40rpx 32rpx;

  .header-bg {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
    border-radius: 0 0 40rpx 40rpx;
  }

  .back-btn {
    position: absolute;
    top: 40rpx;
    left: 32rpx;
    width: 64rpx;
    height: 64rpx;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 32rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;

    .back-icon {
      font-size: 32rpx;
      color: #ffffff;
    }
  }

  .trader-profile {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 80rpx;
    margin-bottom: 32rpx;

    .trader-avatar-large {
      position: relative;
      width: 160rpx;
      height: 160rpx;
      margin-bottom: 24rpx;

      .avatar-emoji {
        position: relative;
        z-index: 2;
        font-size: 96rpx;
        line-height: 160rpx;
        text-align: center;
      }

      .avatar-glow {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 200rpx;
        height: 200rpx;
        background: radial-gradient(circle, rgba(102, 126, 234, 0.4) 0%, transparent 70%);
        border-radius: 50%;
        animation: pulse 2s ease-in-out infinite;
      }
    }

    .trader-info {
      text-align: center;

      .trader-name {
        display: block;
        font-size: 40rpx;
        font-weight: bold;
        color: #ffffff;
        margin-bottom: 8rpx;
      }

      .trader-title {
        display: block;
        font-size: 26rpx;
        color: rgba(255, 255, 255, 0.7);
        margin-bottom: 16rpx;
      }

      .trader-tags {
        display: flex;
        gap: 12rpx;
        justify-content: center;

        .tag {
          display: flex;
          align-items: center;
          gap: 6rpx;
          padding: 6rpx 16rpx;
          border-radius: 20rpx;
          font-size: 22rpx;

          &.conservative {
            background: rgba(82, 196, 26, 0.2);
            color: #52c41a;
          }

          &.moderate {
            background: rgba(24, 144, 255, 0.2);
            color: #1890ff;
          }

          &.aggressive {
            background: rgba(255, 77, 79, 0.2);
            color: #ff4d4f;
          }

          &.active {
            background: rgba(82, 196, 26, 0.2);
            color: #52c41a;
          }

          &.inactive {
            background: rgba(140, 140, 140, 0.2);
            color: #8c8c8c;
          }

          &.deciding {
            background: rgba(250, 173, 20, 0.2);
            color: #faad14;
          }

          .tag-icon {
            font-size: 20rpx;
          }

          .tag-text {
            font-size: 22rpx;
          }
        }
      }
    }
  }

  .trader-stats {
    display: flex;
    gap: 16rpx;

    .stat-card {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20rpx);
      border-radius: 20rpx;
      padding: 24rpx 16rpx;
      text-align: center;
      border: 1rpx solid rgba(255, 255, 255, 0.1);

      &.profit {
        background: rgba(82, 196, 26, 0.1);
        border-color: rgba(82, 196, 26, 0.3);
      }

      &.balance {
        background: rgba(24, 144, 255, 0.1);
        border-color: rgba(24, 144, 255, 0.3);
      }

      &.decisions {
        background: rgba(250, 173, 20, 0.1);
        border-color: rgba(250, 173, 20, 0.3);
      }

      .stat-label {
        display: block;
        font-size: 22rpx;
        color: rgba(255, 255, 255, 0.6);
        margin-bottom: 8rpx;
      }

      .stat-value {
        display: block;
        font-size: 32rpx;
        font-weight: bold;
        color: #ffffff;
        margin-bottom: 4rpx;
      }

      .stat-rate {
        display: block;
        font-size: 20rpx;
        color: rgba(255, 255, 255, 0.5);
      }
    }
  }
}

.content-sections {
  padding: 0 24rpx;
}

.section-tabs {
  display: flex;
  gap: 12rpx;
  margin-bottom: 32rpx;
  padding: 8rpx;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20rpx);
  border-radius: 16rpx;

  .tab-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
    padding: 16rpx 8rpx;
    border-radius: 12rpx;
    transition: all 0.3s ease;

    &.active {
      background: rgba(102, 126, 234, 0.2);
    }

    .tab-icon {
      font-size: 32rpx;
    }

    .tab-label {
      font-size: 22rpx;
      color: rgba(255, 255, 255, 0.8);
    }
  }
}

.tab-content {
  .section-title {
    font-size: 32rpx;
    font-weight: 600;
    color: #ffffff;
    margin-bottom: 24rpx;
  }
}

.skills-section {
  .skills-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .skill-points {
      display: flex;
      align-items: center;
      gap: 8rpx;
      padding: 8rpx 16rpx;
      background: rgba(102, 126, 234, 0.2);
      border-radius: 20rpx;

      .points-label {
        font-size: 22rpx;
        color: rgba(255, 255, 255, 0.7);
      }

      .points-value {
        font-size: 28rpx;
        font-weight: bold;
        color: #667eea;
      }
    }
  }

  .skills-tree {
    .skill-category {
      margin-bottom: 32rpx;

      &:last-child {
        margin-bottom: 0;
      }

      .category-header {
        display: flex;
        align-items: center;
        gap: 12rpx;
        margin-bottom: 16rpx;
        padding: 16rpx 20rpx;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 16rpx;

        .category-icon {
          font-size: 32rpx;
        }

        .category-name {
          flex: 1;
          font-size: 28rpx;
          font-weight: 600;
          color: #ffffff;
        }

        .category-level {
          font-size: 24rpx;
          color: rgba(255, 255, 255, 0.6);
        }
      }

      .skills-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12rpx;

        .skill-card {
          position: relative;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20rpx);
          border-radius: 16rpx;
          padding: 20rpx 12rpx;
          text-align: center;
          border: 1rpx solid rgba(255, 255, 255, 0.1);
          transition: all 0.3s ease;

          &.unlocked {
            &:active {
              transform: scale(0.95);
            }
          }

          &.locked {
            opacity: 0.5;
          }

          &.maxed {
            border-color: rgba(250, 173, 20, 0.5);
            box-shadow: 0 0 20rpx rgba(250, 173, 20, 0.3);
          }

          .skill-icon {
            position: relative;
            width: 80rpx;
            height: 80rpx;
            margin: 0 auto 12rpx;

            .icon-emoji {
              font-size: 48rpx;
              line-height: 80rpx;
            }

            .lock-overlay {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(0, 0, 0, 0.4);
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;

              .lock-icon {
                font-size: 32rpx;
              }
            }
          }

          .skill-name {
            display: block;
            font-size: 22rpx;
            color: #ffffff;
            margin-bottom: 12rpx;
          }

          .skill-level {
            margin-bottom: 8rpx;

            .level-text {
              display: block;
              font-size: 20rpx;
              color: rgba(255, 255, 255, 0.6);
              margin-bottom: 4rpx;
            }

            .level-bar {
              height: 6rpx;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 3rpx;
              overflow: hidden;
              margin-bottom: 8rpx;

              .level-fill {
                height: 100%;
                background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                border-radius: 3rpx;
                transition: width 0.3s ease;
              }
            }
          }

          .skill-effect {
            margin-bottom: 8rpx;

            .effect-label {
              display: block;
              font-size: 18rpx;
              color: rgba(255, 255, 255, 0.5);
            }

            .effect-value {
              display: block;
              font-size: 20rpx;
              color: #52c41a;
              font-weight: 600;
            }
          }

          .skill-cost {
            .cost-label {
              display: block;
              font-size: 18rpx;
              color: rgba(255, 255, 255, 0.5);
            }

            .cost-value {
              display: block;
              font-size: 20rpx;
              color: #667eea;
              font-weight: 600;
            }
          }
        }
      }
    }
  }
}

.achievements-section {
  .achievements-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .achievement-stats {
      display: flex;
      align-items: center;
      gap: 8rpx;
      padding: 8rpx 16rpx;
      background: rgba(250, 173, 20, 0.2);
      border-radius: 20rpx;

      .stats-label {
        font-size: 22rpx;
        color: rgba(255, 255, 255, 0.7);
      }

      .stats-value {
        font-size: 28rpx;
        font-weight: bold;
        color: #faad14;
      }
    }
  }

  .achievements-list {
    display: flex;
    flex-direction: column;
    gap: 16rpx;

    .achievement-item {
      display: flex;
      gap: 16rpx;
      padding: 24rpx;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20rpx);
      border-radius: 20rpx;
      border: 1rpx solid rgba(255, 255, 255, 0.1);
      transition: all 0.3s ease;

      &.unlocked {
        background: rgba(102, 126, 234, 0.1);
        border-color: rgba(102, 126, 234, 0.3);
        box-shadow: 0 4rpx 16rpx rgba(102, 126, 234, 0.2);
      }

      .achievement-icon {
        position: relative;
        width: 96rpx;
        height: 96rpx;
        flex-shrink: 0;

        .icon-emoji {
          font-size: 64rpx;
          line-height: 96rpx;
          text-align: center;
        }

        .glow-effect {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 120rpx;
          height: 120rpx;
          background: radial-gradient(circle, rgba(250, 173, 20, 0.4) 0%, transparent 70%);
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }

        .lock-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;

          .lock-icon {
            font-size: 40rpx;
          }
        }
      }

      .achievement-info {
        flex: 1;

        .achievement-name {
          display: block;
          font-size: 28rpx;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 8rpx;
        }

        .achievement-desc {
          display: block;
          font-size: 24rpx;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 16rpx;
        }

        .achievement-progress {
          display: flex;
          align-items: center;
          gap: 12rpx;
          margin-bottom: 12rpx;

          .progress-bar {
            flex: 1;
            height: 8rpx;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4rpx;
            overflow: hidden;

            .progress-fill {
              height: 100%;
              background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
              border-radius: 4rpx;
              transition: width 0.5s ease;
            }
          }

          .progress-text {
            font-size: 22rpx;
            color: rgba(255, 255, 255, 0.6);
            min-width: 48rpx;
            text-align: right;
          }
        }

        .achievement-rewards {
          display: flex;
          gap: 16rpx;

          .reward-item {
            display: flex;
            align-items: center;
            gap: 6rpx;
            padding: 6rpx 12rpx;
            background: rgba(250, 173, 20, 0.1);
            border-radius: 12rpx;

            .reward-icon {
              font-size: 20rpx;
            }

            .reward-value {
              font-size: 20rpx;
              color: #faad14;
            }
          }
        }
      }
    }
  }
}

.performance-section {
  .performance-header {
    margin-bottom: 24rpx;
  }

  .performance-metrics {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16rpx;
    margin-bottom: 32rpx;

    .metric-card {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20rpx);
      border-radius: 20rpx;
      padding: 24rpx;
      text-align: center;
      border: 1rpx solid rgba(255, 255, 255, 0.1);

      .metric-label {
        display: block;
        font-size: 22rpx;
        color: rgba(255, 255, 255, 0.6);
        margin-bottom: 12rpx;
      }

      .metric-value {
        display: block;
        font-size: 36rpx;
        font-weight: bold;
        color: #ffffff;
        margin-bottom: 8rpx;
      }

      .metric-desc {
        display: block;
        font-size: 20rpx;
        color: rgba(255, 255, 255, 0.4);
      }
    }
  }

  .performance-chart {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20rpx);
    border-radius: 20rpx;
    padding: 24rpx;
    border: 1rpx solid rgba(255, 255, 255, 0.1);

    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24rpx;

      .chart-title {
        font-size: 28rpx;
        font-weight: 600;
        color: #ffffff;
      }

      .chart-periods {
        display: flex;
        gap: 8rpx;

        .period-tab {
          padding: 6rpx 16rpx;
          border-radius: 16rpx;
          font-size: 22rpx;
          color: rgba(255, 255, 255, 0.6);
          transition: all 0.3s ease;

          &.active {
            background: rgba(102, 126, 234, 0.2);
            color: #667eea;
          }
        }
      }

      .chart-content {
        .chart-bars {
          display: flex;
          gap: 12rpx;
          height: 300rpx;
          align-items: center;
          justify-content: space-between;

          .chart-bar {
            flex: 1;
            position: relative;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;

            .bar-fill {
              position: absolute;
              width: 40rpx;
              border-radius: 8rpx;
              transition: all 0.3s ease;

              &.positive {
                background: linear-gradient(180deg, #52c41a 0%, #73d13d 100%);
              }

              &.negative {
                background: linear-gradient(180deg, #ff4d4f 0%, #ff7875 100%);
              }
            }

            .bar-label {
              position: absolute;
              bottom: -32rpx;
              font-size: 18rpx;
              color: rgba(255, 255, 255, 0.5);
            }
          }
        }
      }
    }
  }
}

.holdings-section {
  .holdings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .holdings-count {
      font-size: 24rpx;
      color: rgba(255, 255, 255, 0.6);
    }
  }

  .holdings-list {
    display: flex;
    flex-direction: column;
    gap: 16rpx;

    .holding-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24rpx;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20rpx);
      border-radius: 20rpx;
      border: 1rpx solid rgba(255, 255, 255, 0.1);

      .holding-info {
        flex: 1;

        .stock-name {
          display: block;
          font-size: 28rpx;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 4rpx;
        }

        .stock-code {
          display: block;
          font-size: 22rpx;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 4rpx;
        }

        .stock-quantity {
          display: block;
          font-size: 20rpx;
          color: rgba(255, 255, 255, 0.4);
        }
      }

      .holding-price {
        text-align: center;

        .current-price {
          display: block;
          font-size: 28rpx;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 4rpx;
        }

        .avg-cost {
          display: block;
          font-size: 20rpx;
          color: rgba(255, 255, 255, 0.4);
        }
      }

      .holding-profit {
        text-align: right;

        .profit-amount {
          display: block;
          font-size: 28rpx;
          font-weight: 600;
          margin-bottom: 4rpx;
        }

        .profit-rate {
          display: block;
          font-size: 20rpx;
        }
      }
    }
  }

  .empty-holdings {
    text-align: center;
    padding: 80rpx 32rpx;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20rpx);
    border-radius: 20rpx;
    border: 1rpx dashed rgba(255, 255, 255, 0.2);

    .empty-emoji {
      display: block;
      font-size: 96rpx;
      margin-bottom: 24rpx;
      opacity: 0.5;
    }

    .empty-text {
      display: block;
      font-size: 28rpx;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 12rpx;
    }

    .empty-desc {
      display: block;
      font-size: 24rpx;
      color: rgba(255, 255, 255, 0.4);
    }
  }
}

.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 24rpx 32rpx;
  background: rgba(26, 26, 46, 0.95);
  backdrop-filter: blur(20rpx);
  border-top: 1rpx solid rgba(255, 255, 255, 0.1);
  display: flex;
  gap: 16rpx;

  .action-btn {
    flex: 1;
    padding: 24rpx;
    border-radius: 16rpx;
    font-size: 28rpx;
    font-weight: 600;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8rpx;

    &.secondary {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }

    &.primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      box-shadow: 0 8rpx 24rpx rgba(102, 126, 234, 0.3);

      &:disabled {
        opacity: 0.5;
        box-shadow: none;
      }
    }

    .btn-icon {
      font-size: 24rpx;
    }
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.5;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 0.8;
    transform: translate(-50%, -50%) scale(1.1);
  }
}

.text-rise { color: #ff4d4f; }
.text-fall { color: #52c41a; }
</style>
