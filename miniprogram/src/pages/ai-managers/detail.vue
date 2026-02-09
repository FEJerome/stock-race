<template>
  <view class="manager-detail-page">
    <!-- 加载状态 -->
    <view class="loading-state" v-if="loading">
      <u-loading-icon size="48" color="#1890ff" />
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 错误状态 -->
    <view class="error-state" v-else-if="error">
      <u-icon name="error-circle" size="64" color="#ff4d4f" />
      <text class="error-text">加载失败</text>
      <text class="error-desc">{{ error }}</text>
      <button class="retry-btn" @click="loadData">重新加载</button>
    </view>

    <!-- 内容区域 -->
    <template v-else-if="account">
      <!-- 头部信息 -->
      <view class="header-section">
        <view class="header-bg">
          <view class="manager-header">
            <view class="manager-avatar">
              <text class="avatar-text">{{ account.name.charAt(0) }}</text>
            </view>
            <view class="manager-title">
              <text class="manager-name">{{ account.name }}</text>
              <view class="manager-tags">
                <text class="tag school">{{ getUniversity(account.modelProvider) }}</text>
                <text class="tag risk" :class="account.riskLevel">{{ getRiskLabel(account.riskLevel) }}</text>
                <text class="tag status" :class="account.status">{{ getStatusLabel(account.status) }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 资金卡片 -->
      <view class="fund-card">
        <view class="fund-header">
          <text class="fund-title">资金状况</text>
          <text class="fund-subtitle">初始资金 {{ formatMoney(account.initialBalance) }}</text>
        </view>
        <view class="fund-body">
          <view class="fund-item">
            <text class="fund-label">当前资金</text>
            <text class="fund-value">{{ formatMoney(account.currentBalance) }}</text>
          </view>
          <view class="fund-item">
            <text class="fund-label">可用资金</text>
            <text class="fund-value">{{ formatMoney(account.currentBalance) }}</text>
          </view>
          <view class="fund-item">
            <text class="fund-label">总收益</text>
            <text class="fund-value" :class="account.totalProfit >= 0 ? 'text-rise' : 'text-fall'">
              {{ formatChange(account.totalProfit) }}
            </text>
          </view>
        </view>
      </view>

      <!-- 收益指标 -->
      <view class="metrics-card">
        <view class="metrics-header">
          <text class="metrics-title">收益表现</text>
        </view>
        <view class="metrics-grid">
          <view class="metric-item">
            <text class="metric-value" :class="account.profitRate >= 0 ? 'text-rise' : 'text-fall'">
              {{ formatPercent(account.profitRate / 100) }}
            </text>
            <text class="metric-label">收益率</text>
          </view>
          <view class="metric-item">
            <text class="metric-value">{{ formatPercent(performance?.winRate || 0, 0) }}</text>
            <text class="metric-label">胜率</text>
          </view>
          <view class="metric-item">
            <text class="metric-value">{{ performance?.sharpeRatio?.toFixed(2) || '0.00' }}</text>
            <text class="metric-label">夏普比率</text>
          </view>
          <view class="metric-item">
            <text class="metric-value">{{ performance?.tradeCount || 0 }}</text>
            <text class="metric-label">交易次数</text>
          </view>
        </view>
      </view>

      <!-- 决策记录 -->
      <view class="decisions-section">
        <view class="section-header">
          <text class="section-title">最近决策</text>
          <text class="section-more" @click="goToDecisions">查看全部</text>
        </view>

        <!-- 决策列表 -->
        <view class="decision-list" v-if="decisions.length > 0">
          <view
            class="decision-item"
            v-for="decision in decisions.slice(0, 5)"
            :key="decision.id"
            @click="goToDecisionDetail(decision.id)"
          >
            <view class="decision-icon" :class="decision.type">
              <u-icon :name="getDecisionIcon(decision.type)" size="28" color="#fff" />
            </view>
            <view class="decision-content">
              <view class="decision-header">
                <text class="stock-name">{{ decision.stockName }}</text>
                <text class="stock-code">({{ decision.stockCode }})</text>
                <text class="decision-type" :class="decision.type">{{ getDecisionLabel(decision.type) }}</text>
              </view>
              <view class="decision-info">
                <text class="info-item">价格: {{ formatMoney(decision.price) }}</text>
                <text class="info-item">数量: {{ decision.quantity }}</text>
                <text class="info-item">置信度: {{ formatPercent(decision.confidence / 100, 0) }}</text>
              </view>
              <view class="decision-reason" v-if="decision.reason">
                <text class="reason-text">{{ truncateText(decision.reason, 50) }}</text>
              </view>
              <view class="decision-footer">
                <text class="decision-time">{{ formatRelativeTime(decision.createdAt) }}</text>
                <text
                  class="decision-result"
                  :class="decision.result?.status"
                  v-if="decision.result"
                >
                  {{ getResultLabel(decision.result.status) }}
                </text>
              </view>
            </view>
          </view>
        </view>

        <!-- 空状态 -->
        <view class="empty-state" v-else>
          <u-icon name="file-text" size="64" color="#bfbfbf" />
          <text class="empty-text">暂无决策记录</text>
          <text class="empty-desc">该基金经理还没有生成任何决策</text>
        </view>
      </view>
    </template>

    <!-- 底部操作栏 -->
    <view class="action-bar" v-if="account">
      <button class="action-btn edit" @click="goToEdit">
        <u-icon name="edit-pen" size="32" />
        <text>编辑</text>
      </button>
      <button
        class="action-btn toggle"
        :class="account.status === 'active' ? 'warning' : 'success'"
        @click="toggleStatus"
      >
        <u-icon :name="account.status === 'active' ? 'pause' : 'play-right'" size="32" />
        <text>{{ account.status === 'active' ? '停用' : '启用' }}</text>
      </button>
      <button class="action-btn delete" @click="confirmDelete">
        <u-icon name="trash" size="32" />
        <text>删除</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import { formatMoney, formatPercent, formatChange, formatRelativeTime, truncateText } from '@/utils/formatter'
import { MODEL_PROVIDERS, RISK_LEVELS, AI_ACCOUNT_STATUS, DECISION_TYPES } from '@/utils/constants'
import type { AIAccount, AIDecision, ManagerPerformance } from '@/types/ai'

const aiStore = useAIStore()

// 页面状态
const loading = ref(false)
const error = ref('')
const accountId = ref('')
const account = ref<AIAccount | null>(null)
const decisions = ref<AIDecision[]>([])
const performance = ref<ManagerPerformance | null>(null)

// 获取页面参数
onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  const options = (currentPage as any).options || (currentPage as any).$route?.query || {}
  accountId.value = options.id || ''

  if (!accountId.value) {
    error.value = '缺少账户ID参数'
    return
  }

  loadData()
})

// 加载数据
async function loadData() {
  loading.value = true
  error.value = ''

  try {
    // 并行加载账户详情和决策列表
    const [accountSuccess, decisionsSuccess] = await Promise.all([
      aiStore.fetchAccountDetail(accountId.value),
      aiStore.fetchDecisions(accountId.value),
    ])

    if (!accountSuccess) {
      error.value = '获取账户详情失败'
      return
    }

    account.value = aiStore.currentAccount
    decisions.value = aiStore.decisions

    // 获取基金经理表现数据
    await loadPerformance()
  } catch (err: any) {
    error.value = err.message || '加载数据失败'
  } finally {
    loading.value = false
  }
}

// 加载表现数据
async function loadPerformance() {
  const success = await aiStore.fetchPerformances()
  if (success) {
    performance.value = aiStore.performances.find(p => p.accountId === accountId.value) || null
  }
}

// 获取院校名称
function getUniversity(provider: string): string {
  return MODEL_PROVIDERS.find(p => p.value === provider)?.university || provider
}

// 获取风险等级标签
function getRiskLabel(risk: string): string {
  return RISK_LEVELS.find(r => r.value === risk)?.label || risk
}

// 获取状态标签
function getStatusLabel(status: string): string {
  return AI_ACCOUNT_STATUS[status as keyof typeof AI_ACCOUNT_STATUS]?.label || status
}

// 获取决策类型图标
function getDecisionIcon(type: string): string {
  return DECISION_TYPES[type as keyof typeof DECISION_TYPES]?.icon || 'minus'
}

// 获取决策类型标签
function getDecisionLabel(type: string): string {
  return DECISION_TYPES[type as keyof typeof DECISION_TYPES]?.label || type
}

// 获取执行结果标签
function getResultLabel(status: string): string {
  const labels: Record<string, string> = {
    success: '成功',
    failed: '失败',
    pending: '待执行',
  }
  return labels[status] || status
}

// 跳转到编辑页面
function goToEdit() {
  uni.navigateTo({ url: `/pages/ai-managers/edit?id=${accountId.value}` })
}

// 切换启用/停用状态
async function toggleStatus() {
  if (!account.value) return

  const newStatus = account.value.status === 'active' ? 'inactive' : 'active'
  const actionText = newStatus === 'active' ? '启用' : '停用'

  uni.showModal({
    title: `确认${actionText}`,
    content: `确定要${actionText}该基金经理吗？`,
    success: async (res) => {
      if (res.confirm) {
        const success = await aiStore.updateAccount(accountId.value, { status: newStatus })
        if (success) {
          account.value!.status = newStatus
        }
      }
    },
  })
}

// 确认删除
function confirmDelete() {
  uni.showModal({
    title: '确认删除',
    content: '删除后该基金经理的所有数据将无法恢复，确定要删除吗？',
    confirmColor: '#ff4d4f',
    success: async (res) => {
      if (res.confirm) {
        const success = await aiStore.deleteAccount(accountId.value)
        if (success) {
          uni.navigateBack()
        }
      }
    },
  })
}

// 跳转到决策列表
function goToDecisions() {
  uni.navigateTo({ url: `/pages/decisions/list?accountId=${accountId.value}` })
}

// 跳转到决策详情
function goToDecisionDetail(decisionId: string) {
  uni.navigateTo({ url: `/pages/decisions/detail?id=${decisionId}` })
}
</script>

<style lang="scss" scoped>
.manager-detail-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 160rpx;
}

// 加载和错误状态
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 200rpx 48rpx;

  .loading-text,
  .error-text {
    margin-top: 24rpx;
    font-size: 28rpx;
    color: #595959;
  }

  .error-desc {
    margin-top: 12rpx;
    font-size: 26rpx;
    color: #8c8c8c;
    text-align: center;
  }

  .retry-btn {
    margin-top: 32rpx;
    padding: 16rpx 48rpx;
    background: #1890ff;
    color: #fff;
    border-radius: 32rpx;
    font-size: 28rpx;
    border: none;
  }
}

// 头部区域
.header-section {
  .header-bg {
    background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
    padding: 48rpx 32rpx 80rpx;
  }

  .manager-header {
    display: flex;
    align-items: center;

    .manager-avatar {
      width: 120rpx;
      height: 120rpx;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 60rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 24rpx;

      .avatar-text {
        font-size: 48rpx;
        font-weight: bold;
        color: #fff;
      }
    }

    .manager-title {
      flex: 1;

      .manager-name {
        display: block;
        font-size: 40rpx;
        font-weight: 600;
        color: #fff;
        margin-bottom: 16rpx;
      }

      .manager-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 12rpx;

        .tag {
          padding: 6rpx 16rpx;
          border-radius: 8rpx;
          font-size: 22rpx;
          background: rgba(255, 255, 255, 0.2);
          color: #fff;

          &.risk {
            &.conservative {
              background: rgba(82, 196, 26, 0.3);
            }

            &.aggressive {
              background: rgba(255, 77, 79, 0.3);
            }
          }

          &.status {
            &.active {
              background: rgba(82, 196, 26, 0.3);
            }

            &.inactive {
              background: rgba(140, 140, 140, 0.3);
            }

            &.deciding {
              background: rgba(250, 173, 20, 0.3);
            }

            &.error {
              background: rgba(255, 77, 79, 0.3);
            }
          }
        }
      }
    }
  }
}

// 资金卡片
.fund-card {
  margin: -40rpx 24rpx 24rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);

  .fund-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;
    padding-bottom: 24rpx;
    border-bottom: 1rpx solid #f0f0f0;

    .fund-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #262626;
    }

    .fund-subtitle {
      font-size: 24rpx;
      color: #8c8c8c;
    }
  }

  .fund-body {
    display: flex;
    justify-content: space-between;

    .fund-item {
      flex: 1;
      text-align: center;

      .fund-label {
        display: block;
        font-size: 24rpx;
        color: #8c8c8c;
        margin-bottom: 8rpx;
      }

      .fund-value {
        display: block;
        font-size: 32rpx;
        font-weight: 600;
        color: #262626;
      }
    }
  }
}

// 收益指标卡片
.metrics-card {
  margin: 0 24rpx 24rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);

  .metrics-header {
    margin-bottom: 24rpx;

    .metrics-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #262626;
    }
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16rpx;

    .metric-item {
      text-align: center;
      padding: 16rpx 0;

      .metric-value {
        display: block;
        font-size: 32rpx;
        font-weight: 600;
        color: #262626;
        margin-bottom: 8rpx;
      }

      .metric-label {
        display: block;
        font-size: 22rpx;
        color: #8c8c8c;
      }
    }
  }
}

// 决策记录区域
.decisions-section {
  margin: 0 24rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .section-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #262626;
    }

    .section-more {
      font-size: 26rpx;
      color: #1890ff;
    }
  }

  .decision-list {
    .decision-item {
      display: flex;
      padding: 24rpx 0;
      border-bottom: 1rpx solid #f0f0f0;

      &:last-child {
        border-bottom: none;
      }

      .decision-icon {
        width: 64rpx;
        height: 64rpx;
        border-radius: 32rpx;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 20rpx;
        flex-shrink: 0;

        &.buy {
          background: #ff4d4f;
        }

        &.sell {
          background: #52c41a;
        }

        &.hold {
          background: #8c8c8c;
        }
      }

      .decision-content {
        flex: 1;

        .decision-header {
          display: flex;
          align-items: center;
          margin-bottom: 8rpx;

          .stock-name {
            font-size: 30rpx;
            font-weight: 600;
            color: #262626;
            margin-right: 8rpx;
          }

          .stock-code {
            font-size: 24rpx;
            color: #8c8c8c;
            margin-right: 12rpx;
          }

          .decision-type {
            padding: 4rpx 12rpx;
            border-radius: 8rpx;
            font-size: 22rpx;

            &.buy {
              background: rgba(255, 77, 79, 0.1);
              color: #ff4d4f;
            }

            &.sell {
              background: rgba(82, 196, 26, 0.1);
              color: #52c41a;
            }

            &.hold {
              background: rgba(140, 140, 140, 0.1);
              color: #8c8c8c;
            }
          }
        }

        .decision-info {
          display: flex;
          gap: 16rpx;
          margin-bottom: 8rpx;

          .info-item {
            font-size: 24rpx;
            color: #595959;
          }
        }

        .decision-reason {
          margin-bottom: 8rpx;

          .reason-text {
            font-size: 24rpx;
            color: #8c8c8c;
            line-height: 1.5;
          }
        }

        .decision-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;

          .decision-time {
            font-size: 22rpx;
            color: #bfbfbf;
          }

          .decision-result {
            padding: 4rpx 12rpx;
            border-radius: 8rpx;
            font-size: 22rpx;

            &.success {
              background: rgba(82, 196, 26, 0.1);
              color: #52c41a;
            }

            &.failed {
              background: rgba(255, 77, 79, 0.1);
              color: #ff4d4f;
            }

            &.pending {
              background: rgba(24, 144, 255, 0.1);
              color: #1890ff;
            }
          }
        }
      }
    }
  }

  .empty-state {
    text-align: center;
    padding: 80rpx 48rpx;

    .empty-text {
      display: block;
      font-size: 28rpx;
      color: #595959;
      margin-top: 16rpx;
    }

    .empty-desc {
      display: block;
      font-size: 24rpx;
      color: #8c8c8c;
      margin-top: 8rpx;
    }
  }
}

// 底部操作栏
.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  padding: 24rpx 32rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
  display: flex;
  gap: 24rpx;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.06);

  .action-btn {
    flex: 1;
    height: 88rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8rpx;
    border-radius: 44rpx;
    font-size: 28rpx;
    border: none;
    background: #f5f5f5;
    color: #595959;

    &.edit {
      background: #1890ff;
      color: #fff;
    }

    &.toggle {
      &.warning {
        background: #faad14;
        color: #fff;
      }

      &.success {
        background: #52c41a;
        color: #fff;
      }
    }

    &.delete {
      background: #ff4d4f;
      color: #fff;
    }
  }
}

// 颜色类
.text-rise {
  color: #ff4d4f;
}

.text-fall {
  color: #52c41a;
}
</style>
