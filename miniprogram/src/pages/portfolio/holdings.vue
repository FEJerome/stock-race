<template>
  <view class="portfolio-fortress">
    <view class="fortress-bg"></view>
    
    <view class="fortress-container">
      <view class="fortress-header">
        <text class="fortress-title">💰 资产堡垒</text>
        <view class="level-badge">
          <text class="level-icon">⭐</text>
          <text class="level-text">Lv.{{ userLevel }}</text>
        </view>
      </view>

      <view class="asset-overview">
        <view class="main-asset">
          <text class="asset-label">总资产</text>
          <text class="asset-value">💰 {{ formatMoney(totalAssets) }} 元宝</text>
          <view class="asset-change" :class="totalChange >= 0 ? 'positive' : 'negative'">
            <text class="change-icon">{{ totalChange >= 0 ? '📈' : '📉' }}</text>
            <text class="change-text">{{ totalChange >= 0 ? '+' : '' }}{{ totalChange.toFixed(2) }} ({{ totalChangePercent >= 0 ? '+' : '' }}{{ totalChangePercent.toFixed(2) }}%)</text>
          </view>
        </view>
        <view class="asset-stats">
          <view class="stat-item">
            <text class="stat-icon">💰</text>
            <text class="stat-value">💰 {{ formatMoney(availableCash) }} 元宝</text>
            <text class="stat-label">可用元宝</text>
          </view>
          <view class="stat-item">
            <text class="stat-icon">📊</text>
            <text class="stat-value">{{ holdingCount }}</text>
            <text class="stat-label">持仓数量</text>
          </view>
          <view class="stat-item">
            <text class="stat-icon">🎯</text>
            <text class="stat-value">{{ winRate }}%</text>
            <text class="stat-label">胜率</text>
          </view>
        </view>
      </view>

      <view class="experience-bar">
        <view class="bar-label">
          <text class="label-text">经验值</text>
          <text class="label-value">{{ currentExp }}/{{ maxExp }}</text>
        </view>
        <view class="bar-track">
          <view class="bar-fill" :style="{ width: (currentExp / maxExp * 100) + '%' }"></view>
        </view>
        <text class="bar-hint">再获得 {{ maxExp - currentExp }} 经验升级</text>
      </view>

      <view class="holdings-section">
        <view class="section-header">
          <text class="section-title">持仓列表</text>
          <view class="sort-options">
            <text
              class="sort-option"
              :class="{ active: sortBy === 'value' }"
              @tap="changeSort('value')"
            >市值</text>
            <text
              class="sort-option"
              :class="{ active: sortBy === 'profit' }"
              @tap="changeSort('profit')"
            >盈亏</text>
          </view>
        </view>

        <scroll-view
          class="holdings-list"
          scroll-y
          :refresher-enabled="true"
          :refresher-triggered="isRefreshing"
          @refresherrefresh="onRefresh"
        >
          <view
            v-for="holding in holdingsList"
            :key="holding.code"
            class="holding-card"
            :class="{ 'profit': holding.profit >= 0, 'loss': holding.profit < 0 }"
            @tap="viewHoldingDetail(holding)"
          >
            <view class="card-header">
              <view class="stock-info">
                <text class="stock-name">{{ holding.name }}</text>
                <text class="stock-code">{{ holding.code }}</text>
              </view>
              <view class="profit-badge" :class="holding.profit >= 0 ? 'profit' : 'loss'">
                <text class="profit-icon">{{ holding.profit >= 0 ? '📈' : '📉' }}</text>
                <text class="profit-text">{{ holding.profit >= 0 ? '+' : '' }}{{ holding.profitPercent.toFixed(2) }}%</text>
              </view>
            </view>
            <view class="card-body">
              <view class="info-row">
                <text class="info-label">持仓数量</text>
                <text class="info-value">{{ holding.quantity }}股</text>
              </view>
              <view class="info-row">
                <text class="info-label">成本价</text>
                <text class="info-value">💰 {{ holding.costPrice.toFixed(2) }} 元宝</text>
              </view>
              <view class="info-row">
                <text class="info-label">现价</text>
                <text class="info-value" :class="holding.change >= 0 ? 'text-up' : 'text-down'">
                  💰 {{ holding.currentPrice.toFixed(2) }} 元宝
                </text>
              </view>
              <view class="info-row">
                <text class="info-label">市值</text>
                <text class="info-value">💰 {{ formatMoney(holding.marketValue) }}</text>
              </view>
            </view>
            <view class="card-footer">
              <view class="mini-chart">
                <view
                  v-for="(point, index) in holding.chart"
                  :key="index"
                  class="chart-point"
                  :class="{ 'up': point >= holding.costPrice, 'down': point < holding.costPrice }"
                  :style="{ height: getChartHeight(point, holding) + '%' }"
                ></view>
              </view>
              <view class="action-buttons">
                <view class="action-btn buy" @tap.stop="quickBuy(holding)">
                  <text class="btn-text">加仓</text>
                </view>
                <view class="action-btn sell" @tap.stop="quickSell(holding)">
                  <text class="btn-text">减仓</text>
                </view>
              </view>
            </view>
          </view>

          <view class="empty-state" v-if="holdingsList.length === 0">
            <text class="empty-emoji">📦</text>
            <text class="empty-text">暂无持仓</text>
            <text class="empty-hint">去市场挑选心仪的股票吧</text>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const isRefreshing = ref(false)
const sortBy = ref('value')
const userLevel = ref(25)
const currentExp = ref(3750)
const maxExp = ref(5000)
const totalAssets = ref(520000)
const totalChange = ref(45200)
const totalChangePercent = ref(9.52)
const availableCash = ref(125000)
const holdingCount = ref(6)
const winRate = ref(58)

const holdingsList = ref([
  {
    code: '600519',
    name: '贵州茅台',
    quantity: 100,
    costPrice: 1825.00,
    currentPrice: 1850.00,
    marketValue: 185000,
    profit: 2500,
    profitPercent: 1.37,
    change: 25.00,
    chart: [1820, 1825, 1828, 1835, 1840, 1845, 1850],
  },
  {
    code: '300750',
    name: '宁德时代',
    quantity: 500,
    costPrice: 175.00,
    currentPrice: 180.50,
    marketValue: 90250,
    profit: 2750,
    profitPercent: 3.14,
    change: 5.80,
    chart: [172, 174, 176, 178, 179, 180, 180.5],
  },
  {
    code: '002594',
    name: '比亚迪',
    quantity: 400,
    costPrice: 255.00,
    currentPrice: 260.00,
    marketValue: 104000,
    profit: 2000,
    profitPercent: 1.96,
    change: 8.50,
    chart: [252, 254, 256, 258, 259, 260, 260],
  },
  {
    code: '000858',
    name: '五粮液',
    quantity: 200,
    costPrice: 170.00,
    currentPrice: 168.50,
    marketValue: 33700,
    profit: -300,
    profitPercent: -0.88,
    change: -2.30,
    chart: [170, 169.5, 169, 168.5, 168, 168.5, 168.5],
  },
  {
    code: '601318',
    name: '中国平安',
    quantity: 1000,
    costPrice: 46.00,
    currentPrice: 45.20,
    marketValue: 45200,
    profit: -800,
    profitPercent: -1.74,
    change: -0.80,
    chart: [46, 45.8, 45.5, 45.3, 45.5, 45.2, 45.2],
  },
  {
    code: '600036',
    name: '招商银行',
    quantity: 500,
    costPrice: 32.00,
    currentPrice: 32.50,
    marketValue: 16250,
    profit: 250,
    profitPercent: 1.56,
    change: 0.45,
    chart: [32.1, 32.2, 32.3, 32.4, 32.4, 32.5, 32.5],
  },
])

function formatMoney(amount: number): string {
  if (amount >= 100000000) return (amount / 100000000).toFixed(2) + '亿'
  if (amount >= 10000) return (amount / 10000).toFixed(2) + '万'
  return amount.toFixed(2)
}

function getChartHeight(point: number, holding: any): number {
  const min = Math.min(...holding.chart)
  const max = Math.max(...holding.chart)
  const range = max - min || 1
  return ((point - min) / range) * 100
}

function changeSort(sort: string) {
  sortBy.value = sort
}

function onRefresh() {
  isRefreshing.value = true
  setTimeout(() => {
    isRefreshing.value = false
  }, 1000)
}

function viewHoldingDetail(holding: any) {
  uni.navigateTo({
    url: `/pages/market/stock-detail?code=${holding.code}`,
  })
}

function quickBuy(holding: any) {
  uni.navigateTo({
    url: `/pages/trade/buy?code=${holding.code}`,
  })
}

function quickSell(holding: any) {
  uni.navigateTo({
    url: `/pages/trade/sell?code=${holding.code}`,
  })
}

onMounted(() => {
  console.log('资产堡垒已加载')
})
</script>

<style lang="scss" scoped>
.portfolio-fortress {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  position: relative;
  overflow: hidden;

  .fortress-bg {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: 
      radial-gradient(circle at 30% 20%, rgba(255, 215, 0, 0.08) 0%, transparent 40%),
      radial-gradient(circle at 70% 80%, rgba(82, 196, 26, 0.05) 0%, transparent 40%);
    pointer-events: none;
    z-index: 0;
  }

  .fortress-container {
    position: relative;
    z-index: 1;
    padding: 24rpx;
  }
}

.fortress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32rpx;

  .fortress-title {
    font-size: 40rpx;
    font-weight: bold;
    color: #ffffff;
  }

  .level-badge {
    display: flex;
    align-items: center;
    gap: 8rpx;
    padding: 8rpx 20rpx;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 215, 0, 0.1) 100%);
    border-radius: 24rpx;
    border: 1rpx solid rgba(255, 215, 0, 0.4);

    .level-icon {
      font-size: 24rpx;
    }

    .level-text {
      font-size: 24rpx;
      font-weight: bold;
      color: #ffd700;
    }
  }
}

.asset-overview {
  margin-bottom: 24rpx;

  .main-asset {
    padding: 32rpx;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 215, 0, 0.05) 100%);
    backdrop-filter: blur(20rpx);
    border-radius: 24rpx;
    border: 1rpx solid rgba(255, 215, 0, 0.3);
    margin-bottom: 16rpx;
    text-align: center;

    .asset-label {
      display: block;
      font-size: 24rpx;
      color: rgba(255, 215, 0, 0.8);
      margin-bottom: 12rpx;
    }

    .asset-value {
      display: block;
      font-size: 56rpx;
      font-weight: bold;
      color: #ffd700;
      margin-bottom: 16rpx;
    }

    .asset-change {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8rpx;

      &.positive {
        color: #ff4d4f;
      }

      &.negative {
        color: #52c41a;
      }

      .change-icon {
        font-size: 24rpx;
      }

      .change-text {
        font-size: 24rpx;
        font-weight: 600;
      }
    }
  }

  .asset-stats {
    display: flex;
    gap: 12rpx;

    .stat-item {
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

      .stat-icon {
        font-size: 32rpx;
      }

      .stat-value {
        font-size: 28rpx;
        font-weight: bold;
        color: #ffffff;
      }

      .stat-label {
        font-size: 20rpx;
        color: rgba(255, 255, 255, 0.5);
      }
    }
  }
}

.experience-bar {
  margin-bottom: 32rpx;
  padding: 20rpx;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20rpx);
  border-radius: 16rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.1);

  .bar-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12rpx;

    .label-text {
      font-size: 24rpx;
      color: rgba(255, 255, 255, 0.8);
    }

    .label-value {
      font-size: 24rpx;
      font-weight: 600;
      color: #ffd700;
    }
  }

  .bar-track {
    height: 12rpx;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 6rpx;
    overflow: hidden;
    margin-bottom: 8rpx;

    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #ffd700 0%, #ffec8b 100%);
      border-radius: 6rpx;
      transition: width 0.3s ease;
    }
  }

  .bar-hint {
    display: block;
    font-size: 20rpx;
    color: rgba(255, 255, 255, 0.5);
    text-align: center;
  }
}

.holdings-section {
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20rpx;

    .section-title {
      font-size: 32rpx;
      font-weight: 600;
      color: #ffffff;
    }

    .sort-options {
      display: flex;
      gap: 12rpx;

      .sort-option {
        padding: 8rpx 16rpx;
        background: rgba(255, 255, 255, 0.05);
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
  }

  .holdings-list {
    height: calc(100vh - 700rpx);
  }
}

.holding-card {
  margin-bottom: 16rpx;
  padding: 24rpx;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20rpx);
  border-radius: 20rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;

  &.profit {
    border-color: rgba(255, 77, 79, 0.3);
  }

  &.loss {
    border-color: rgba(82, 196, 26, 0.3);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20rpx;

    .stock-info {
      .stock-name {
        display: block;
        font-size: 32rpx;
        font-weight: 600;
        color: #ffffff;
        margin-bottom: 4rpx;
      }

      .stock-code {
        display: block;
        font-size: 22rpx;
        color: rgba(255, 255, 255, 0.5);
      }
    }

    .profit-badge {
      display: flex;
      align-items: center;
      gap: 8rpx;
      padding: 8rpx 16rpx;
      border-radius: 16rpx;
      font-size: 22rpx;

      &.profit {
        background: rgba(255, 77, 79, 0.2);
        color: #ff4d4f;
      }

      &.loss {
        background: rgba(82, 196, 26, 0.2);
        color: #52c41a;
      }

      .profit-icon {
        font-size: 20rpx;
      }

      .profit-text {
        font-size: 22rpx;
        font-weight: 600;
      }
    }
  }

  .card-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16rpx;
    margin-bottom: 20rpx;
    padding: 16rpx 0;
    border-top: 1rpx solid rgba(255, 255, 255, 0.1);
    border-bottom: 1rpx solid rgba(255, 255, 255, 0.1);

    .info-row {
      .info-label {
        display: block;
        font-size: 20rpx;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 6rpx;
      }

      .info-value {
        display: block;
        font-size: 26rpx;
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

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .mini-chart {
      display: flex;
      gap: 6rpx;
      align-items: flex-end;
      height: 60rpx;
      flex: 1;

      .chart-point {
        flex: 1;
        min-width: 4rpx;
        border-radius: 2rpx;
        transition: all 0.3s ease;

        &.up {
          background: linear-gradient(180deg, #ff4d4f 0%, #ff7875 100%);
        }

        &.down {
          background: linear-gradient(180deg, #52c41a 0%, #73d13d 100%);
        }
      }
    }

    .action-buttons {
      display: flex;
      gap: 12rpx;

      .action-btn {
        padding: 12rpx 24rpx;
        border-radius: 16rpx;
        font-size: 22rpx;
        font-weight: 600;
        transition: all 0.3s ease;

        &.buy {
          background: rgba(255, 77, 79, 0.2);
          border: 1rpx solid rgba(255, 77, 79, 0.4);
          color: #ff4d4f;
        }

        &.sell {
          background: rgba(82, 196, 26, 0.2);
          border: 1rpx solid rgba(82, 196, 26, 0.4);
          color: #52c41a;
        }

        .btn-text {
          font-size: 22rpx;
        }
      }
    }
  }
}

.empty-state {
  text-align: center;
  padding: 120rpx 32rpx;

  .empty-emoji {
    display: block;
    font-size: 120rpx;
    margin-bottom: 24rpx;
    opacity: 0.5;
  }

  .empty-text {
    display: block;
    font-size: 28rpx;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 12rpx;
  }

  .empty-hint {
    display: block;
    font-size: 24rpx;
    color: rgba(255, 255, 255, 0.4);
  }
}
</style>
