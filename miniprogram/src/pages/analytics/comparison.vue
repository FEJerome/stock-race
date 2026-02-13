<template>
  <view class="manager-comparison-page">
    <!-- 经理选择区域 -->
    <view class="selection-section">
      <view class="section-header">
        <text class="section-title">选择对比经理</text>
        <text class="selection-hint">{{ selectedManagers.length }}/3</text>
      </view>
      <scroll-view class="manager-scroll" scroll-x>
        <view class="manager-list">
          <view
            class="manager-card"
            v-for="account in aiStore.accounts"
            :key="account.id"
            :class="{ selected: isSelected(account.id) }"
            @click="toggleSelection(account.id)"
          >
            <view class="manager-avatar">
              <text class="avatar-text">{{ account.name.charAt(0) }}</text>
              <view v-if="isSelected(account.id)" class="selected-badge">
                <text class="badge-text">{{ getSelectionOrder(account.id) }}</text>
              </view>
            </view>
            <text class="manager-name">{{ account.name }}</text>
            <text class="manager-school">{{ getUniversity(account.modelProvider) }}</text>
            <text
              class="manager-return"
              :class="account.profitRate >= 0 ? 'text-rise' : 'text-fall'"
            >
              {{ formatPercent(account.profitRate / 100) }}
            </text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 对比表格 -->
    <view class="comparison-table" v-if="selectedManagers.length > 0">
      <view class="table-header">
        <view class="header-cell metric">对比指标</view>
        <view
          class="header-cell manager"
          v-for="(id, index) in selectedManagers"
          :key="id"
        >
          <view class="manager-header">
            <text class="header-name">{{ getManagerById(id)?.name }}</text>
            <text class="header-index">{{ index + 1 }}</text>
          </view>
        </view>
        <!-- 填充空列 -->
        <view
          class="header-cell manager empty"
          v-for="n in (3 - selectedManagers.length)"
          :key="'empty-' + n"
        >
          <text class="empty-text">-</text>
        </view>
      </view>

      <view class="table-body">
        <!-- 收益率 -->
        <view class="table-row">
          <view class="row-cell metric">
            <text class="metric-name">累计收益率</text>
            <text class="metric-desc">总收益百分比</text>
          </view>
          <view
            class="row-cell value"
            v-for="id in selectedManagers"
            :key="id"
            :class="getProfitClass(getManagerById(id)?.profitRate)"
          >
            {{ formatPercent((getManagerById(id)?.profitRate || 0) / 100) }}
          </view>
          <view
            class="row-cell value empty"
            v-for="n in (3 - selectedManagers.length)"
            :key="'empty-profit-' + n"
          >
            -
          </view>
        </view>

        <!-- 胜率 -->
        <view class="table-row">
          <view class="row-cell metric">
            <text class="metric-name">胜率</text>
            <text class="metric-desc">盈利交易占比</text>
          </view>
          <view
            class="row-cell value"
            v-for="id in selectedManagers"
            :key="id"
          >
            {{ formatPercent(getWinRate(id) / 100) }}
          </view>
          <view
            class="row-cell value empty"
            v-for="n in (3 - selectedManagers.length)"
            :key="'empty-win-' + n"
          >
            -
          </view>
        </view>

        <!-- 风险等级 -->
        <view class="table-row">
          <view class="row-cell metric">
            <text class="metric-name">风险等级</text>
            <text class="metric-desc">投资策略风格</text>
          </view>
          <view
            class="row-cell value"
            v-for="id in selectedManagers"
            :key="id"
          >
            <text
              class="risk-tag"
              :class="getManagerById(id)?.riskLevel"
            >
              {{ getRiskLabel(getManagerById(id)?.riskLevel) }}
            </text>
          </view>
          <view
            class="row-cell value empty"
            v-for="n in (3 - selectedManagers.length)"
            :key="'empty-risk-' + n"
          >
            -
          </view>
        </view>

        <!-- 决策频率 -->
        <view class="table-row">
          <view class="row-cell metric">
            <text class="metric-name">决策频率</text>
            <text class="metric-desc">日均决策次数</text>
          </view>
          <view
            class="row-cell value"
            v-for="id in selectedManagers"
            :key="id"
          >
            {{ getDecisionFrequency(id) }}次/日
          </view>
          <view
            class="row-cell value empty"
            v-for="n in (3 - selectedManagers.length)"
            :key="'empty-freq-' + n"
          >
            -
          </view>
        </view>

        <!-- 管理资金 -->
        <view class="table-row">
          <view class="row-cell metric">
            <text class="metric-name">管理资金</text>
            <text class="metric-desc">当前资金规模</text>
          </view>
          <view
            class="row-cell value"
            v-for="id in selectedManagers"
            :key="id"
          >
            {{ formatMoney(getManagerById(id)?.currentBalance || 0) }}
          </view>
          <view
            class="row-cell value empty"
            v-for="n in (3 - selectedManagers.length)"
            :key="'empty-balance-' + n"
          >
            -
          </view>
        </view>

        <!-- 累计收益 -->
        <view class="table-row">
          <view class="row-cell metric">
            <text class="metric-name">累计收益</text>
            <text class="metric-desc">总盈亏金额</text>
          </view>
          <view
            class="row-cell value"
            v-for="id in selectedManagers"
            :key="id"
            :class="(getManagerById(id)?.totalProfit || 0) >= 0 ? 'text-rise' : 'text-fall'"
          >
            {{ formatChange(getManagerById(id)?.totalProfit || 0) }}
          </view>
          <view
            class="row-cell value empty"
            v-for="n in (3 - selectedManagers.length)"
            :key="'empty-total-' + n"
          >
            -
          </view>
        </view>

        <!-- 综合评分 -->
        <view class="table-row highlight">
          <view class="row-cell metric">
            <text class="metric-name">综合评分</text>
            <text class="metric-desc">综合表现评级</text>
          </view>
          <view
            class="row-cell value"
            v-for="id in selectedManagers"
            :key="id"
          >
            <view class="score-badge" :class="getScoreClass(getScore(id))">
              <text class="score-value">{{ getScore(id) }}</text>
            </view>
          </view>
          <view
            class="row-cell value empty"
            v-for="n in (3 - selectedManagers.length)"
            :key="'empty-score-' + n"
          >
            -
          </view>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view class="empty-selection" v-if="selectedManagers.length === 0 && !loading">
      <u-empty mode="list" text="请选择要对比的基金经理">
      </u-empty>
      <text class="empty-desc">点击上方卡片选择最多3位经理进行对比</text>
    </view>

    <!-- 底部提示 -->
    <view class="footer-tip" v-if="selectedManagers.length > 0">
      <text class="tip-icon">i</text>
      <text class="tip-text">对比数据仅供参考，投资有风险，决策需谨慎</text>
    </view>

    <!-- 加载状态 -->
    <view class="loading-state" v-if="loading">
      <u-loading-icon mode="circle" size="48"></u-loading-icon>
      <text class="loading-text">加载经理数据中...</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import { formatMoney, formatPercent, formatChange } from '@/utils/formatter'
import { MODEL_PROVIDERS, RISK_LEVELS } from '@/utils/constants'
import type { AIAccount } from '@/types/ai'

const aiStore = useAIStore()

// 状态
const loading = ref(false)
const selectedManagers = ref<string[]>([])

// 模拟胜率数据
const winRates = ref<Record<string, number>>({})
// 模拟决策频率数据
const decisionFreqs = ref<Record<string, number>>({})

// 获取经理
const getManagerById = (id: string): AIAccount | undefined => {
  return aiStore.accounts.find(a => a.id === id)
}

// 是否已选中
const isSelected = (id: string): boolean => {
  return selectedManagers.value.includes(id)
}

// 获取选中顺序
const getSelectionOrder = (id: string): number => {
  return selectedManagers.value.indexOf(id) + 1
}

// 切换选中状态
const toggleSelection = (id: string) => {
  const index = selectedManagers.value.indexOf(id)
  if (index > -1) {
    selectedManagers.value.splice(index, 1)
  } else if (selectedManagers.value.length < 3) {
    selectedManagers.value.push(id)
  } else {
    uni.showToast({
      title: '最多选择3位经理',
      icon: 'none'
    })
  }
}

// 获取大学名称
const getUniversity = (provider: string): string => {
  return MODEL_PROVIDERS.find(p => p.value === provider)?.university || provider
}

// 获取风险等级标签
const getRiskLabel = (risk: string | undefined): string => {
  if (!risk) return '-'
  return RISK_LEVELS.find(r => r.value === risk)?.label || risk
}

// 获取胜率
const getWinRate = (id: string): number => {
  return winRates.value[id] || 0
}

// 获取决策频率
const getDecisionFrequency = (id: string): number => {
  return decisionFreqs.value[id] || 0
}

// 获取收益样式
const getProfitClass = (rate: number | undefined): string => {
  if (rate === undefined) return ''
  return rate >= 0 ? 'text-rise' : 'text-fall'
}

// 计算综合评分
const getScore = (id: string): number => {
  const manager = getManagerById(id)
  if (!manager) return 0

  // 基于收益率、胜率、风险等级计算综合评分
  const profitScore = Math.min(Math.max((manager.profitRate + 20) * 2, 0), 40)
  const winRate = getWinRate(id)
  const winScore = winRate * 0.4
  const riskBonus = manager.riskLevel === 'conservative' ? 5 : manager.riskLevel === 'moderate' ? 10 : 15

  return Math.round(profitScore + winScore + riskBonus)
}

// 获取评分样式
const getScoreClass = (score: number): string => {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'average'
  return 'poor'
}

// 加载数据
async function loadData() {
  loading.value = true
  try {
    await aiStore.fetchAccounts()
    // 模拟加载胜率和决策频率数据
    aiStore.accounts.forEach(account => {
      winRates.value[account.id] = Math.random() * 30 + 50 // 50-80%
      decisionFreqs.value[account.id] = Math.random() * 5 + 1 // 1-6次/日
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style lang="scss" scoped>
.manager-comparison-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
}

// 选择区域
.selection-section {
  margin-bottom: 24rpx;

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16rpx;

    .section-title {
      font-size: 30rpx;
      font-weight: 600;
      color: #262626;
    }

    .selection-hint {
      font-size: 24rpx;
      color: #8c8c8c;
      padding: 4rpx 16rpx;
      background: #ffffff;
      border-radius: 20rpx;
    }
  }

  .manager-scroll {
    white-space: nowrap;
  }

  .manager-list {
    display: flex;
    gap: 16rpx;
    padding: 4rpx;
  }

  .manager-card {
    flex-shrink: 0;
    width: 200rpx;
    background: #ffffff;
    border-radius: 16rpx;
    padding: 24rpx;
    text-align: center;
    border: 2rpx solid transparent;
    transition: all 0.2s ease;

    &.selected {
      border-color: #1890ff;
      background: rgba(24, 144, 255, 0.05);
    }

    &:active {
      opacity: 0.8;
    }

    .manager-avatar {
      position: relative;
      width: 80rpx;
      height: 80rpx;
      background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
      border-radius: 40rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16rpx;

      .avatar-text {
        font-size: 36rpx;
        font-weight: 600;
        color: #ffffff;
      }

      .selected-badge {
        position: absolute;
        top: -4rpx;
        right: -4rpx;
        width: 32rpx;
        height: 32rpx;
        background: #1890ff;
        border-radius: 16rpx;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2rpx solid #ffffff;

        .badge-text {
          font-size: 20rpx;
          color: #ffffff;
          font-weight: 600;
        }
      }
    }

    .manager-name {
      display: block;
      font-size: 28rpx;
      font-weight: 500;
      color: #262626;
      margin-bottom: 4rpx;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .manager-school {
      display: block;
      font-size: 22rpx;
      color: #8c8c8c;
      margin-bottom: 8rpx;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .manager-return {
      display: block;
      font-size: 26rpx;
      font-weight: 600;
    }
  }
}

// 对比表格
.comparison-table {
  background: #ffffff;
  border-radius: 16rpx;
  overflow: hidden;
  margin-bottom: 24rpx;

  .table-header {
    display: flex;
    background: #f5f5f5;
    padding: 24rpx 0;

    .header-cell {
      flex: 1;
      text-align: center;
      padding: 0 16rpx;

      &.metric {
        flex: 0 0 200rpx;
        text-align: left;
        padding-left: 32rpx;
        font-size: 26rpx;
        font-weight: 600;
        color: #262626;
      }

      &.manager {
        .manager-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8rpx;

          .header-name {
            font-size: 26rpx;
            font-weight: 600;
            color: #262626;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
          }

          .header-index {
            width: 36rpx;
            height: 36rpx;
            line-height: 36rpx;
            background: #1890ff;
            color: #ffffff;
            border-radius: 18rpx;
            font-size: 22rpx;
            font-weight: 600;
          }
        }

        &.empty {
          .empty-text {
            font-size: 26rpx;
            color: #bfbfbf;
          }
        }
      }
    }
  }

  .table-body {
    .table-row {
      display: flex;
      padding: 24rpx 0;
      border-bottom: 1rpx solid #f5f5f5;

      &:last-child {
        border-bottom: none;
      }

      &.highlight {
        background: rgba(24, 144, 255, 0.05);
      }

      &:nth-child(even) {
        background: #fafafa;
      }

      .row-cell {
        flex: 1;
        text-align: center;
        padding: 0 16rpx;
        display: flex;
        align-items: center;
        justify-content: center;

        &.metric {
          flex: 0 0 200rpx;
          flex-direction: column;
          align-items: flex-start;
          padding-left: 32rpx;

          .metric-name {
            font-size: 28rpx;
            font-weight: 500;
            color: #262626;
            margin-bottom: 4rpx;
          }

          .metric-desc {
            font-size: 22rpx;
            color: #8c8c8c;
          }
        }

        &.value {
          font-size: 28rpx;
          color: #262626;
          font-weight: 500;

          .risk-tag {
            padding: 4rpx 16rpx;
            border-radius: 8rpx;
            font-size: 24rpx;

            &.conservative {
              background: rgba(82, 196, 26, 0.1);
              color: #52c41a;
            }

            &.moderate {
              background: rgba(250, 173, 20, 0.1);
              color: #faad14;
            }

            &.aggressive {
              background: rgba(255, 77, 79, 0.1);
              color: #ff4d4f;
            }
          }

          .score-badge {
            width: 64rpx;
            height: 64rpx;
            border-radius: 32rpx;
            display: flex;
            align-items: center;
            justify-content: center;

            &.excellent {
              background: rgba(82, 196, 26, 0.1);
              .score-value {
                color: #52c41a;
              }
            }

            &.good {
              background: rgba(24, 144, 255, 0.1);
              .score-value {
                color: #1890ff;
              }
            }

            &.average {
              background: rgba(250, 173, 20, 0.1);
              .score-value {
                color: #faad14;
              }
            }

            &.poor {
              background: rgba(255, 77, 79, 0.1);
              .score-value {
                color: #ff4d4f;
              }
            }

            .score-value {
              font-size: 28rpx;
              font-weight: 600;
            }
          }
        }

        &.empty {
          font-size: 28rpx;
          color: #bfbfbf;
        }
      }
    }
  }
}

// 空选择状态
.empty-selection {
  text-align: center;
  padding: 120rpx 48rpx;

  .empty-desc {
    display: block;
    margin-top: 24rpx;
    font-size: 26rpx;
    color: #8c8c8c;
  }
}

// 底部提示
.footer-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 24rpx;
  background: #fffbe6;
  border-radius: 12rpx;
  margin-top: 24rpx;

  .tip-icon {
    width: 28rpx;
    height: 28rpx;
    line-height: 28rpx;
    background: #faad14;
    color: #ffffff;
    border-radius: 14rpx;
    font-size: 20rpx;
    text-align: center;
    font-weight: 600;
  }

  .tip-text {
    font-size: 24rpx;
    color: #8c8c8c;
  }
}

// 加载状态
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 48rpx;

  .loading-text {
    margin-top: 24rpx;
    font-size: 28rpx;
    color: #8c8c8c;
  }
}

.text-rise { color: #ff4d4f; }
.text-fall { color: #52c41a; }
</style>
