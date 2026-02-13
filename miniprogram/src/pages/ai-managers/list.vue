<template>
  <view class="manager-list-page page-enter-fade">
    <!-- 头部统计 -->
    <view class="stats-card anim-slide-down">
      <view class="stats-item">
        <text class="stats-value">{{ aiStore.accounts.length }}</text>
        <text class="stats-label">基金经理</text>
      </view>
      <view class="stats-item">
        <text class="stats-value" :class="aiStore.totalProfit >= 0 ? 'text-rise' : 'text-fall'">
          {{ formatChange(aiStore.totalProfit) }}
        </text>
        <text class="stats-label">总收益</text>
      </view>
      <view class="stats-item">
        <text class="stats-value">{{ formatMoney(aiStore.totalBalance) }}</text>
        <text class="stats-label">管理资金</text>
      </view>
    </view>

    <!-- 骨架屏加载 -->
    <view v-if="aiStore.loading" class="skeleton-container">
      <Skeleton type="card" :rows="3" :active="true" />
      <Skeleton type="card" :rows="3" :active="true" />
    </view>

    <!-- 基金经理列表 -->
    <view class="manager-list" v-else>
      <view
        class="manager-card card-click-feedback"
        v-for="(account, index) in aiStore.accounts"
        :key="account.id"
        :class="getItemClass(index)"
        @click="goToDetail(account.id)"
      >
        <view class="card-header">
          <view class="manager-info">
            <text class="manager-name">{{ account.name }}</text>
            <view class="manager-tags">
              <text class="tag school">{{ getUniversity(account.modelProvider) }}</text>
              <text class="tag risk" :class="account.riskLevel">{{ getRiskLabel(account.riskLevel) }}</text>
              <text class="tag status" :class="account.status">{{ getStatusLabel(account.status) }}</text>
            </view>
          </view>
          <view class="manager-profit">
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
            <text class="label">初始资金</text>
            <text class="value">{{ formatMoney(account.initialBalance) }}</text>
          </view>
          <view class="info-row">
            <text class="label">当前资金</text>
            <text class="value">{{ formatMoney(account.currentBalance) }}</text>
          </view>
          <view class="info-row">
            <text class="label">今日决策</text>
            <text class="value">{{ account.todayDecisions }}/{{ account.maxDailyDecisions }}</text>
          </view>
        </view>

        <view class="card-footer">
          <button class="action-btn primary btn-click-feedback" @click.stop="triggerDecision(account.id)">
            立即决策
          </button>
          <button class="action-btn btn-click-feedback" @click.stop="goToDetail(account.id)">
            查看详情
          </button>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view class="empty-state" v-if="aiStore.accounts.length === 0 && !aiStore.loading">
      <image class="empty-icon" src="/static/empty.png" mode="aspectFit" />
      <text class="empty-text">暂无AI基金经理</text>
      <text class="empty-desc">聘任AI基金经理，开启智能投资之旅</text>
    </view>

    <!-- 添加按钮 -->
    <view class="fab-btn btn-click-feedback float-animation" @click="goToCreate">
      <text class="fab-icon">+</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import { formatMoney, formatPercent, formatChange } from '@/utils/formatter'
import { MODEL_PROVIDERS, RISK_LEVELS, AI_ACCOUNT_STATUS } from '@/utils/constants'
import Skeleton from '@/components/common/Skeleton.vue'
import { useListAnimation } from '@/mixins/animation'

const aiStore = useAIStore()
const { getItemClass } = useListAnimation()

function getUniversity(provider: string): string {
  return MODEL_PROVIDERS.find(p => p.value === provider)?.university || provider
}

function getRiskLabel(risk: string): string {
  return RISK_LEVELS.find(r => r.value === risk)?.label || risk
}

function getStatusLabel(status: string): string {
  return AI_ACCOUNT_STATUS[status as keyof typeof AI_ACCOUNT_STATUS]?.label || status
}

function goToDetail(id: string) {
  uni.navigateTo({ url: `/pages/ai-managers/detail?id=${id}` })
}

function goToCreate() {
  uni.navigateTo({ url: '/pages/ai-managers/create' })
}

async function triggerDecision(accountId: string) {
  const decision = await aiStore.triggerDecision(accountId)
  if (decision) {
    // 刷新账户数据
    aiStore.fetchAccounts(true)
  }
}

onMounted(() => {
  aiStore.fetchAccounts()
})
</script>

<style lang="scss" scoped>
.manager-list-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 120rpx;
}

.skeleton-container {
  padding: 24rpx;
}

.stats-card {
  display: flex;
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  padding: 40rpx 0;

  .stats-item {
    flex: 1;
    text-align: center;
    color: #ffffff;

    .stats-value {
      display: block;
      font-size: 40rpx;
      font-weight: bold;
      margin-bottom: 8rpx;
    }

    .stats-label {
      display: block;
      font-size: 24rpx;
      opacity: 0.9;
    }
  }
}

.manager-list {
  padding: 24rpx;
}

.manager-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24rpx;
    padding-bottom: 24rpx;
    border-bottom: 1rpx solid #f0f0f0;

    .manager-info {
      .manager-name {
        display: block;
        font-size: 32rpx;
        font-weight: 600;
        color: #262626;
        margin-bottom: 12rpx;
      }

      .manager-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 12rpx;

        .tag {
          padding: 4rpx 12rpx;
          border-radius: 8rpx;
          font-size: 22rpx;

          &.school {
            background: rgba(24, 144, 255, 0.1);
            color: #1890ff;
          }

          &.risk {
            background: rgba(250, 173, 20, 0.1);
            color: #faad14;

            &.conservative {
              background: rgba(82, 196, 26, 0.1);
              color: #52c41a;
            }

            &.aggressive {
              background: rgba(255, 77, 79, 0.1);
              color: #ff4d4f;
            }
          }

          &.status {
            &.active {
              background: rgba(82, 196, 26, 0.1);
              color: #52c41a;
            }

            &.inactive {
              background: rgba(140, 140, 140, 0.1);
              color: #8c8c8c;
            }

            &.deciding {
              background: rgba(24, 144, 255, 0.1);
              color: #1890ff;
            }
          }
        }
      }
    }

    .manager-profit {
      text-align: right;

      .profit-rate {
        display: block;
        font-size: 36rpx;
        font-weight: bold;
        margin-bottom: 4rpx;
      }

      .profit-amount {
        display: block;
        font-size: 26rpx;
      }
    }
  }

  .card-body {
    margin-bottom: 24rpx;

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12rpx 0;

      .label {
        font-size: 26rpx;
        color: #8c8c8c;
      }

      .value {
        font-size: 26rpx;
        color: #262626;
        font-weight: 500;
      }
    }
  }

  .card-footer {
    display: flex;
    gap: 16rpx;

    .action-btn {
      flex: 1;
      height: 72rpx;
      line-height: 72rpx;
      text-align: center;
      border-radius: 36rpx;
      font-size: 28rpx;
      background: #f5f5f5;
      color: #595959;
      border: none;

      &.primary {
        background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
        color: #ffffff;
      }
    }
  }
}

.empty-state {
  text-align: center;
  padding: 120rpx 48rpx;

  .empty-icon {
    width: 200rpx;
    height: 200rpx;
    margin-bottom: 32rpx;
  }

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

.fab-btn {
  position: fixed;
  right: 40rpx;
  bottom: 160rpx;
  width: 112rpx;
  height: 112rpx;
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  border-radius: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(24, 144, 255, 0.3);

  .fab-icon {
    font-size: 56rpx;
    color: #ffffff;
    font-weight: 300;
  }
}

.text-rise { color: #ff4d4f; }
.text-fall { color: #52c41a; }
</style>
